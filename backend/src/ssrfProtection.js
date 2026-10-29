import dns from 'node:dns/promises'
import http from 'node:http'
import net from 'node:net'

const blockedIpv4Ranges = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

const ipv4ToNumber = (address) => address.split('.').reduce((value, part) => (value * 256) + Number(part), 0)

const isInIpv4Range = (address, range, prefix) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(range) & mask)
}

const parseIpv6 = (address) => {
  const normalized = address.toLowerCase()
  if ((normalized.match(/::/g) || []).length > 1) return null

  let value = normalized
  const ipv4Tail = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (ipv4Tail) {
    const ipv4 = ipv4Tail[1].split('.').map(Number)
    if (ipv4.some((part) => part > 255)) return null
    const suffix = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
    value = value.slice(0, -ipv4Tail[1].length) + suffix
  }

  const halves = value.split('::')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null

  const words = [...left, ...Array(missing).fill('0'), ...right]
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null
  return words.map((word) => Number.parseInt(word, 16))
}

const isInIpv6Range = (words, rangeWords, prefix) => {
  const fullWords = Math.floor(prefix / 16)
  const remainingBits = prefix % 16
  for (let index = 0; index < fullWords; index++) {
    if (words[index] !== rangeWords[index]) return false
  }
  if (remainingBits === 0) return true
  const mask = (0xffff << (16 - remainingBits)) & 0xffff
  return (words[fullWords] & mask) === (rangeWords[fullWords] & mask)
}

const parseRangeWords = (address) => parseIpv6(address)

const isPublicIpv4 = (address) => {
  if (net.isIP(address) !== 4) return false
  return !blockedIpv4Ranges.some(([range, prefix]) => isInIpv4Range(address, range, prefix))
}

export const isPublicIpAddress = (address) => {
  const family = net.isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family !== 6) return false

  const words = parseIpv6(address)
  if (!words) return false

  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mappedIpv4 = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff
    ].join('.')
    return isPublicIpv4(mappedIpv4)
  }

  const globalUnicast = isInIpv6Range(words, parseRangeWords('2000::'), 3)
  const blockedRanges = [
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20]
  ]
  return globalUnicast && !blockedRanges.some(([range, prefix]) =>
    isInIpv6Range(words, parseRangeWords(range), prefix)
  )
}

const invalidDestination = () => {
  const error = new Error('URL destination is not allowed')
  error.code = 'SSRF_BLOCKED'
  error.status = 400
  return error
}

export const isAllowedBrowserRequestUrl = (value) => {
  try {
    return ['http:', 'https:', 'ws:', 'wss:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const hasUrlCredentials = (value) => {
  const authority = String(value).match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1]
  return authority?.includes('@') || false
}

const parseHttpUrl = (value) => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw invalidDestination()
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    hasUrlCredentials(value) ||
    !url.hostname
  ) {
    throw invalidDestination()
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (net.isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw invalidDestination()
    return { url, hostname, addresses: [{ address: hostname, family: net.isIP(hostname) }] }
  }

  const normalizedHostname = hostname.replace(/\.$/, '')
  if (
    normalizedHostname.length > 253 ||
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname.endsWith('.local') ||
    normalizedHostname.endsWith('.internal') ||
    normalizedHostname.endsWith('.home.arpa')
  ) {
    throw invalidDestination()
  }

  const labels = normalizedHostname.split('.')
  if (labels.some((label) =>
    label.length < 1 ||
    label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  )) {
    throw invalidDestination()
  }

  return { url, hostname: normalizedHostname, addresses: null }
}

const resolvePublicHost = async (hostname, lookup) => {
  if (net.isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw invalidDestination()
    return [{ address: hostname, family: net.isIP(hostname) }]
  }

  let addresses
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw invalidDestination()
  }

  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some((entry) =>
      !entry ||
      typeof entry.address !== 'string' ||
      ![4, 6].includes(entry.family) ||
      net.isIP(entry.address) !== entry.family ||
      !isPublicIpAddress(entry.address)
    )
  ) {
    throw invalidDestination()
  }

  return addresses
}

export const validatePublicHttpUrl = async (value, { lookup = dns.lookup } = {}) => {
  const parsed = parseHttpUrl(value)
  const addresses = parsed.addresses || await resolvePublicHost(parsed.hostname, lookup)
  return { url: parsed.url, hostname: parsed.hostname, addresses }
}

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

const getForwardHeaders = (headers, host, { websocket = false } = {}) => {
  const connectionHeaders = String(headers.connection || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  const excluded = new Set([...hopByHopHeaders, ...connectionHeaders, 'host'])
  if (websocket) {
    excluded.delete('upgrade')
    excluded.delete('sec-websocket-key')
    excluded.delete('sec-websocket-version')
    excluded.delete('sec-websocket-protocol')
    excluded.delete('sec-websocket-extensions')
  }
  const forwarded = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!excluded.has(name.toLowerCase())) forwarded[name] = value
  }
  forwarded.host = host
  return forwarded
}

const rejectProxyRequest = (response, blocked) => {
  blocked()
  response.writeHead(403, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: 'URL destination is not allowed' }))
}

const createProxyUrl = (requestUrl) => {
  try {
    const url = new URL(requestUrl.replace(/^ws:\/\//i, 'http://'))
    if (url.protocol !== 'http:') {
      return null
    }
    return url
  } catch {
    return null
  }
}

export const createSsrfProxyServer = ({ lookup = dns.lookup, connect = net.connect } = {}) => {
  let blockedRequestSeen = false
  const server = http.createServer(async (request, response) => {
    const target = createProxyUrl(request.url)
    if (!target || target.username || target.password || hasUrlCredentials(request.url)) {
      return rejectProxyRequest(response, () => { blockedRequestSeen = true })
    }

    let resolved
    try {
      resolved = await validatePublicHttpUrl(target.href, { lookup })
    } catch {
      return rejectProxyRequest(response, () => { blockedRequestSeen = true })
    }

    const destination = resolved.addresses[0]
    const port = Number(target.port || 80)
    const agent = new http.Agent({ keepAlive: false })
    agent.createConnection = (options, callback) => connect({
      host: destination.address,
      family: destination.family,
      port
    }, callback)
    const upstream = http.request({
      hostname: destination.address,
      family: destination.family,
      port,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers: getForwardHeaders(request.headers, target.host),
      agent
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })

    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' })
      }
      response.end(JSON.stringify({ error: 'Unable to reach destination' }))
    })
    request.pipe(upstream)
  })

  server.on('connect', async (request, clientSocket, head) => {
    let target
    try {
      target = new URL(`https://${request.url}`)
      if (
        target.username ||
        target.password ||
        hasUrlCredentials(`https://${request.url}`) ||
        target.pathname !== '/' ||
        target.search ||
        target.hash
      ) {
        throw invalidDestination()
      }
    } catch {
      blockedRequestSeen = true
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    let resolved
    try {
      resolved = await validatePublicHttpUrl(target.href, { lookup })
    } catch {
      blockedRequestSeen = true
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    const destination = resolved.addresses[0]
    const upstreamSocket = connect({
      host: destination.address,
      family: destination.family,
      port: Number(target.port || 443)
    })

    upstreamSocket.once('connect', () => {
      if (clientSocket.destroyed) {
        upstreamSocket.destroy()
        return
      }
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstreamSocket.write(head)
      clientSocket.pipe(upstreamSocket)
      upstreamSocket.pipe(clientSocket)
    })

    const failTunnel = () => {
      if (!clientSocket.destroyed) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
      }
      upstreamSocket.destroy()
    }
    upstreamSocket.once('error', failTunnel)
    clientSocket.once('error', () => upstreamSocket.destroy())
    clientSocket.once('close', () => upstreamSocket.destroy())
  })

  server.on('upgrade', (request, clientSocket, head) => {
    const target = createProxyUrl(request.url)
    if (!target || target.username || target.password) {
      blockedRequestSeen = true
      clientSocket.destroy()
      return
    }

    validatePublicHttpUrl(target.href, { lookup }).then((resolved) => {
      const destination = resolved.addresses[0]
      const upstreamSocket = connect({
        host: destination.address,
        family: destination.family,
        port: Number(target.port || 80)
      })
      upstreamSocket.once('connect', () => {
        const headers = getForwardHeaders(request.headers, target.host, { websocket: true })
        headers.connection = 'Upgrade'
        headers.upgrade = 'websocket'
        const headerLines = Object.entries(headers)
          .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('\r\n')
        upstreamSocket.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\n${headerLines}\r\n\r\n`)
        if (head.length > 0) upstreamSocket.write(head)
        clientSocket.pipe(upstreamSocket)
        upstreamSocket.pipe(clientSocket)
      })
      upstreamSocket.once('error', () => clientSocket.destroy())
      clientSocket.once('error', () => upstreamSocket.destroy())
      clientSocket.once('close', () => upstreamSocket.destroy())
    }).catch(() => {
      blockedRequestSeen = true
      clientSocket.destroy()
    })
  })

  return {
    server,
    get blockedRequestSeen() {
      return blockedRequestSeen
    },
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(server.address().port)
      })
    }),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}
