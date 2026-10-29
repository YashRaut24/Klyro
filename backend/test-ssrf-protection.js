import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import net from 'node:net'
import {
  createSsrfProxyServer,
  isAllowedBrowserRequestUrl,
  isPublicIpAddress,
  validatePublicHttpUrl
} from './src/ssrfProtection.js'
import { handleServerError, securityHeaders } from './src/securityMiddleware.js'
import { app as backendApp } from './src/server.js'

const publicAddress = { address: '93.184.216.34', family: 4 }
const privateAddress = { address: '10.20.30.40', family: 4 }
let rebindingLookupCount = 0
const resolver = async (hostname) => {
  if (hostname === 'public.example') return [publicAddress]
  if (hostname === 'private.example') return [privateAddress]
  if (hostname === 'mixed.example') return [publicAddress, privateAddress]
  if (hostname === 'invalid-result.example') return [{ address: 'not-an-ip', family: 4 }]
  if (hostname === 'empty-result.example') return []
  if (hostname === 'broken.example') throw new Error('private resolver detail')
  throw new Error('Unexpected mocked DNS request')
}
const rebindingResolver = async (hostname, options) => {
  if (hostname === 'rebinding.example') {
    rebindingLookupCount++
    return rebindingLookupCount === 1 ? [publicAddress] : [privateAddress]
  }
  return resolver(hostname, options)
}

const assertRejectedUrl = async (url, options) => {
  await assert.rejects(validatePublicHttpUrl(url, options), (error) => {
    assert.strictEqual(error.code, 'SSRF_BLOCKED')
    assert.strictEqual(error.status, 400)
    assert.strictEqual(error.message, 'URL destination is not allowed')
    return true
  })
}

const requestThroughProxy = (port, target) => new Promise((resolve, reject) => {
  const request = http.request({
    host: '127.0.0.1',
    port,
    method: 'GET',
    path: target,
    headers: { Host: new URL(target).host }
  }, (response) => {
    const chunks = []
    response.on('data', (chunk) => chunks.push(chunk))
    response.on('end', () => resolve({
      status: response.statusCode,
      headers: response.headers,
      body: Buffer.concat(chunks).toString()
    }))
  })
  request.on('error', reject)
  request.end()
})

const getJson = (port, route, target) => fetch(
  `http://127.0.0.1:${port}${route}?url=${encodeURIComponent(target)}`
)

let fixtureServer
let tunnelServer
let apiServer
let backendServer
let originalValidator
let proxy

try {
  console.log('Test 1: Valid public HTTP and HTTPS URLs')
  for (const url of ['http://public.example/path', 'https://public.example/path']) {
    const result = await validatePublicHttpUrl(url, { lookup: resolver })
    assert.strictEqual(result.hostname, 'public.example')
    assert.deepStrictEqual(result.addresses, [publicAddress])
  }
  assert(isPublicIpAddress('8.8.8.8'))
  assert(isPublicIpAddress('2606:4700:4700::1111'))
  assert(isPublicIpAddress('::ffff:5db8:d822'))
  console.log('Passed: public HTTP/HTTPS hosts and public IPv4/IPv6 addresses validate.\n')

  console.log('Test 2: Malformed URLs, unsupported protocols, credentials, and malformed hosts')
  for (const url of [
    'not a URL',
    'ftp://public.example/file',
    'file:///etc/passwd',
    'http://user:password@public.example/',
    'http://@public.example/',
    'http://%',
    'http://bad_host.example/'
  ]) {
    await assertRejectedUrl(url, { lookup: resolver })
  }
  for (const url of ['file:///etc/passwd', 'ftp://public.example/file', 'javascript:alert(1)', 'not a URL']) {
    assert.strictEqual(isAllowedBrowserRequestUrl(url), false)
  }
  assert.strictEqual(isAllowedBrowserRequestUrl('https://public.example/image.png'), true)
  assert.strictEqual(isAllowedBrowserRequestUrl('ws://public.example/socket'), true)
  assert.strictEqual(isAllowedBrowserRequestUrl('wss://public.example/socket'), true)
  console.log('Passed: malformed URLs, non-HTTP schemes, credentials, and malformed hosts are rejected.\n')

  console.log('Test 3: Prohibited IPv4 and IPv6 destinations')
  const prohibitedAddresses = [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '2002:7f00:1::1',
    '2001:db8::1',
    '3fff::1'
  ]
  for (const address of prohibitedAddresses) {
    assert.strictEqual(isPublicIpAddress(address), false, `${address} is prohibited`)
    await assertRejectedUrl(`http://${address.includes(':') ? `[${address}]` : address}/`, { lookup: resolver })
  }
  for (const alternateIp of ['2130706433', '0177.0.0.1', '0x7f000001', '127.1']) {
    await assertRejectedUrl(`http://${alternateIp}/`, { lookup: resolver })
  }
  console.log('Passed: reserved, private, local, mapped, and alternate-form IPs are rejected.\n')

  console.log('Test 4: Hostname resolution, mixed answers, and resolver failures')
  assert.deepStrictEqual(
    (await validatePublicHttpUrl('https://public.example', { lookup: resolver })).addresses,
    [publicAddress]
  )
  for (const hostname of ['private.example', 'mixed.example', 'broken.example', 'invalid-result.example', 'empty-result.example']) {
    await assertRejectedUrl(`https://${hostname}/`, { lookup: resolver })
  }
  const firstRebindingCheck = await validatePublicHttpUrl('http://rebinding.example/', {
    lookup: rebindingResolver
  })
  assert.deepStrictEqual(firstRebindingCheck.addresses, [publicAddress])
  console.log('Passed: private/mixed DNS, resolver failures, and malformed answers fail closed.\n')

  console.log('Test 5: Every redirected and subresource request is independently checked')
  fixtureServer = http.createServer((request, response) => {
    response.writeHead(302, { Location: `http://private.example:${fixtureServer.address().port}/redirected` })
    response.end()
  })
  fixtureServer.on('upgrade', (request, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    socket.destroy()
  })
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject)
    fixtureServer.listen(0, '127.0.0.1', resolve)
  })
  tunnelServer = net.createServer((socket) => socket.on('error', () => {}))
  await new Promise((resolve, reject) => {
    tunnelServer.once('error', reject)
    tunnelServer.listen(0, '127.0.0.1', resolve)
  })

  const connectedDestinations = []
  proxy = createSsrfProxyServer({
    lookup: rebindingResolver,
    connect: (options, callback) => {
      connectedDestinations.push({ host: options.host, port: options.port })
      assert.strictEqual(options.host, publicAddress.address, 'Only the DNS-validated address is dialed')
      return net.connect({
        host: '127.0.0.1',
        port: options.port === 443 ? tunnelServer.address().port : options.port
      }, callback)
    }
  })
  const proxyPort = await proxy.listen()
  const fixturePort = fixtureServer.address().port
  const blockedRebinding = await requestThroughProxy(proxyPort, `http://rebinding.example:${fixturePort}/rebinding`)
  assert.strictEqual(blockedRebinding.status, 403, 'Rebound private DNS answer is blocked on the connection check')
  assert.strictEqual(rebindingLookupCount, 2)
  assert.strictEqual(connectedDestinations.length, 0)
  const redirectResponse = await requestThroughProxy(proxyPort, `http://public.example:${fixturePort}/start`)
  assert.strictEqual(redirectResponse.status, 302)
  const blockedRedirect = await requestThroughProxy(proxyPort, redirectResponse.headers.location)
  assert.strictEqual(blockedRedirect.status, 403)
  assert.deepStrictEqual(JSON.parse(blockedRedirect.body), { error: 'URL destination is not allowed' })
  const blockedSubresource = await requestThroughProxy(proxyPort, 'http://169.254.169.254/latest/meta-data/')
  assert.strictEqual(blockedSubresource.status, 403)
  await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      path: 'ws://private.example/socket',
      headers: {
        Host: 'private.example',
        Connection: 'Upgrade',
        Upgrade: 'websocket'
      }
    })
    request.on('upgrade', () => reject(new Error('Prohibited WebSocket destination was upgraded')))
    request.on('error', resolve)
    request.end()
  })
  const websocketStatus = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      path: `ws://public.example:${fixturePort}/socket`,
      headers: {
        Host: 'forged.internal',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13'
      }
    })
    request.on('upgrade', (response, socket) => {
      socket.destroy()
      resolve(response.statusCode)
    })
    request.on('error', reject)
    request.end()
  })
  assert.strictEqual(websocketStatus, 101)
  assert.strictEqual(connectedDestinations.length, 2, 'Blocked rebind, redirect, and subresource never open upstream connections')
  assert.strictEqual(proxy.blockedRequestSeen, true)
  console.log('Passed: redirect, HTTP subresource, and WebSocket destinations are revalidated before connection.\n')

  console.log('Test 6: HTTPS CONNECT destinations are checked before opening tunnels')
  const connectResult = await new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1')
    let response = ''
    socket.once('connect', () => socket.write('CONNECT private.example:443 HTTP/1.1\r\nHost: private.example:443\r\n\r\n'))
    socket.on('data', (chunk) => {
      response += chunk.toString()
      if (response.includes('\r\n\r\n')) {
        socket.destroy()
        resolve(response)
      }
    })
    socket.once('error', reject)
  })
  assert.match(connectResult, /^HTTP\/1\.1 403 Forbidden/)
  assert.strictEqual(connectedDestinations.length, 2)

  const allowedTunnelResponse = await new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1')
    let response = ''
    socket.once('connect', () => socket.write('CONNECT public.example:443 HTTP/1.1\r\nHost: forged.internal\r\n\r\n'))
    socket.on('data', (chunk) => {
      response += chunk.toString()
      if (response.includes('\r\n\r\n')) {
        socket.destroy()
        resolve(response)
      }
    })
    socket.once('error', reject)
  })
  assert.match(allowedTunnelResponse, /^HTTP\/1\.1 200 Connection Established/)
  assert.strictEqual(connectedDestinations.length, 3)
  assert.strictEqual(connectedDestinations[2].host, publicAddress.address)
  console.log('Passed: prohibited HTTPS tunnel destinations are rejected before dialing.\n')

  console.log('Test 7: Safe API errors retain Step 15B.1 security headers')
  const app = express()
  app.use(securityHeaders)
  app.get('/validate', async (request, response, next) => {
    try {
      const result = await validatePublicHttpUrl(request.query.url, { lookup: resolver })
      response.json({ hostname: result.hostname })
    } catch (error) {
      next(error)
    }
  })
  app.use(handleServerError)
  apiServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    apiServer.once('listening', resolve)
    apiServer.once('error', reject)
  })
  const apiPort = apiServer.address().port
  const safeErrorResponse = await getJson(apiPort, '/validate', 'https://mixed.example/')
  assert.strictEqual(safeErrorResponse.status, 400)
  const safeErrorBody = await safeErrorResponse.text()
  assert.deepStrictEqual(JSON.parse(safeErrorBody), { error: 'Request could not be processed' })
  assert(!safeErrorBody.includes('private resolver detail'))
  assert.strictEqual(safeErrorResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.strictEqual(safeErrorResponse.headers.get('x-frame-options'), 'DENY')
  const validPublicResponse = await getJson(apiPort, '/validate', 'https://public.example/')
  assert.strictEqual(validPublicResponse.status, 200)
  originalValidator = backendApp.locals.validateBrowserUrl
  backendApp.locals.validateBrowserUrl = (url) => validatePublicHttpUrl(url, { lookup: resolver })
  backendServer = backendApp.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    backendServer.once('listening', resolve)
    backendServer.once('error', reject)
  })
  const rejectedApiResponse = await fetch(`http://127.0.0.1:${backendServer.address().port}/api/browser/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://mixed.example/' })
  })
  assert.strictEqual(rejectedApiResponse.status, 400)
  assert.deepStrictEqual(await rejectedApiResponse.json(), { error: 'URL destination is not allowed' })
  assert.strictEqual(rejectedApiResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.strictEqual(rejectedApiResponse.headers.get('x-frame-options'), 'DENY')
  backendApp.locals.validateBrowserUrl = originalValidator
  originalValidator = null
  console.log('Passed: safe API error JSON and security headers are preserved; public URL validation remains compatible.\n')

  console.log('ALL SSRF PROTECTION TESTS PASSED!')
} finally {
  if (apiServer) {
    await new Promise((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()))
  }
  if (backendServer) {
    await new Promise((resolve, reject) => backendServer.close((error) => error ? reject(error) : resolve()))
  }
  if (originalValidator) {
    backendApp.locals.validateBrowserUrl = originalValidator
  }
  if (proxy) {
    await proxy.close()
  }
  if (fixtureServer) {
    await new Promise((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()))
  }
  if (tunnelServer) {
    await new Promise((resolve, reject) => tunnelServer.close((error) => error ? reject(error) : resolve()))
  }
}
