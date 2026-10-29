import assert from 'node:assert'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import { runBrowser } from './src/browserRunner.js'
import { app } from './src/server.js'
import { validatePublicHttpUrl } from './src/ssrfProtection.js'
import { TestRun } from './src/models/TestRun.js'

console.log('--- STARTING CRITICAL USER JOURNEY END-TO-END AUDIT ---')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'

try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
} catch (err) {
  console.error('Prerequisite unmet: Unable to connect to MongoDB at ' + MONGODB_URI + ':', err.message)
  process.exit(1)
}

let fixtureServer
let apiServer
let fixtureBaseUrl
let apiBaseUrl
const createdRunIds = []
const createdScreenshotPaths = []
let privateFixtureRequestCount = 0

const startServers = async () => {
  fixtureServer = http.createServer((req, res) => {
    if (req.url === '/private-resource') {
      privateFixtureRequestCount++
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('A private-network request bypassed the SSRF proxy')
    } else if (req.url === '/redirect-to-private') {
      res.writeHead(302, { Location: `http://127.0.0.1:${fixtureServer.address().port}/private-resource` })
      res.end()
    } else if (req.url === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' })
      res.end('body { font-family: sans-serif; background: #fff; color: #000; }')
    } else if (req.url === '/api/error-endpoint') {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Deliberate 500 error from fixture' }))
    } else if (req.url === '/failing') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Failing Test Page</title>
</head>
<body>
  <h1>Failing Test Page</h1>
  <img src="http://127.0.0.1:${fixtureServer.address().port}/private-resource">
  <img src="http://klyro.test:${fixtureServer.address().port}/redirect-to-private">
  <script>
    console.error('Deliberate console error in test fixture');
    fetch('/api/error-endpoint').catch(() => {});
    window.addEventListener('load', () => {
      setTimeout(() => {
        throw new Error('Deliberate unhandled exception');
      }, 50);
    });
  </script>
</body>
</html>`)
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Healthy Test Page</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Healthy Test Page</h1>
  <p>Clean automated browser test execution.</p>
</body>
</html>`)
    }
  })

  await new Promise((resolve) => {
    fixtureServer.listen(0, '127.0.0.1', () => {
      const port = fixtureServer.address().port
      fixtureBaseUrl = `http://klyro.test:${port}`
      resolve()
    })
  })

  const testNetworkOptions = {
    lookup: async (hostname) => {
      assert.strictEqual(hostname, 'klyro.test')
      return [{ address: '93.184.216.34', family: 4 }]
    },
    connect: (options, callback) => net.connect({
      host: '127.0.0.1',
      port: options.port
    }, callback)
  }
  app.locals.validateBrowserUrl = (url) => validatePublicHttpUrl(url, testNetworkOptions)
  app.locals.runBrowser = (url) => runBrowser(url, testNetworkOptions)

  apiServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => {
    apiServer.on('listening', () => {
      const port = apiServer.address().port
      apiBaseUrl = `http://127.0.0.1:${port}`
      resolve()
    })
  })
}

try {
  console.log('Scenario 1: Starting local test fixture and isolated API server...')
  await startServers()
  assert(fixtureBaseUrl, 'Fixture server base URL initialized')
  assert(apiBaseUrl, 'API server base URL initialized')
  console.log('Passed Scenario 1: Isolated fixture server and API test server running.\n')

  console.log('Scenario 2: Submitting healthy page URL through browser test API...')
  const healthyPostRes = await fetch(`${apiBaseUrl}/api/browser/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${fixtureBaseUrl}/healthy` })
  })
  assert.strictEqual(healthyPostRes.status, 200, 'POST /api/browser/run returns HTTP 200 for healthy page')
  const healthyData = await healthyPostRes.json()
  assert(healthyData._id, 'Response contains persisted test-run ID')
  createdRunIds.push(healthyData._id)
  if (healthyData.screenshot) {
    createdScreenshotPaths.push(healthyData.screenshot)
  }
  console.log('Passed Scenario 2: Healthy page test executed and persisted.\n')

  console.log('Scenario 3: Verifying metadata, performance metrics, clean evidence, and findings...')
  assert.strictEqual(healthyData.url, `${fixtureBaseUrl}/healthy`)
  assert.strictEqual(healthyData.title, 'Healthy Test Page')
  assert.strictEqual(healthyData.status, 200)
  assert.strictEqual(Array.isArray(healthyData.pageErrors), true)
  assert.strictEqual(healthyData.pageErrors.length, 0)
  assert.strictEqual(Array.isArray(healthyData.consoleErrors), true)
  assert.strictEqual(healthyData.consoleErrors.length, 0)
  assert.strictEqual(Array.isArray(healthyData.failedRequests), true)
  assert.strictEqual(healthyData.failedRequests.length, 0)
  assert.strictEqual(Array.isArray(healthyData.httpErrors), true)
  assert.strictEqual(healthyData.httpErrors.length, 0)
  assert.strictEqual(Array.isArray(healthyData.findings), true)
  assert.strictEqual(healthyData.findings.length, 0)
  assert.strictEqual(typeof healthyData.screenshot, 'string')
  assert(healthyData.screenshot.length > 0)
  assert(healthyData.performanceMetrics, 'Performance metrics object is present')
  assert(
    healthyData.performanceMetrics.navigationDurationMs === null ||
    (typeof healthyData.performanceMetrics.navigationDurationMs === 'number' && Number.isFinite(healthyData.performanceMetrics.navigationDurationMs) && healthyData.performanceMetrics.navigationDurationMs >= 0)
  )
  assert(
    healthyData.performanceMetrics.domContentLoadedDurationMs === null ||
    (typeof healthyData.performanceMetrics.domContentLoadedDurationMs === 'number' && Number.isFinite(healthyData.performanceMetrics.domContentLoadedDurationMs) && healthyData.performanceMetrics.domContentLoadedDurationMs >= 0)
  )
  assert(
    healthyData.performanceMetrics.totalTransferredBytes === null ||
    (typeof healthyData.performanceMetrics.totalTransferredBytes === 'number' && Number.isFinite(healthyData.performanceMetrics.totalTransferredBytes) && healthyData.performanceMetrics.totalTransferredBytes >= 0)
  )
  console.log('Passed Scenario 3: Healthy page returned valid metadata, performance telemetry, screenshot, and 0 findings.\n')

  console.log('Scenario 4: Retrieving saved run through history and detail endpoints...')
  const historyRes = await fetch(`${apiBaseUrl}/api/browser/runs`)
  assert.strictEqual(historyRes.status, 200, 'GET /api/browser/runs returns HTTP 200')
  const historyData = await historyRes.json()
  assert.strictEqual(Array.isArray(historyData), true, 'History returns an array')
  const foundRun = historyData.find((r) => String(r._id) === String(healthyData._id))
  assert(foundRun, 'Saved run is present in history listing')
  assert.strictEqual(foundRun.url, `${fixtureBaseUrl}/healthy`)
  assert.strictEqual(foundRun.status, 200)

  const detailRes = await fetch(`${apiBaseUrl}/api/browser/runs/${healthyData._id}`)
  assert.strictEqual(detailRes.status, 200, 'GET /api/browser/runs/:id returns HTTP 200')
  const detailData = await detailRes.json()
  assert.strictEqual(String(detailData._id), String(healthyData._id))
  assert.strictEqual(detailData.url, healthyData.url)
  assert.strictEqual(detailData.title, healthyData.title)
  assert.strictEqual(detailData.status, healthyData.status)
  assert.strictEqual(detailData.screenshot, healthyData.screenshot)
  assert(detailData.performanceMetrics)
  assert.strictEqual(detailData.performanceMetrics.navigationDurationMs, healthyData.performanceMetrics.navigationDurationMs)
  assert.strictEqual(detailData.performanceMetrics.domContentLoadedDurationMs, healthyData.performanceMetrics.domContentLoadedDurationMs)
  assert.strictEqual(detailData.performanceMetrics.totalTransferredBytes, healthyData.performanceMetrics.totalTransferredBytes)
  console.log('Passed Scenario 4: History list and detail endpoint verified with matching persisted data.\n')

  console.log('Scenario 5: Submitting deliberately failing page and asserting evidence and findings...')
  const failingPostRes = await fetch(`${apiBaseUrl}/api/browser/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${fixtureBaseUrl}/failing` })
  })
  assert.strictEqual(failingPostRes.status, 200, 'POST /api/browser/run returns HTTP 200 for failing page')
  const failingData = await failingPostRes.json()
  assert(failingData._id, 'Failing run was persisted with an ID')
  createdRunIds.push(failingData._id)
  if (failingData.screenshot) {
    createdScreenshotPaths.push(failingData.screenshot)
  }

  assert.strictEqual(failingData.url, `${fixtureBaseUrl}/failing`)
  assert.strictEqual(failingData.title, 'Failing Test Page')
  assert.strictEqual(failingData.status, 200)
  assert(Array.isArray(failingData.pageErrors))
  assert(failingData.pageErrors.length > 0, 'Page errors captured')
  assert(failingData.pageErrors.some((e) => e.message.includes('Deliberate unhandled exception')))
  assert(Array.isArray(failingData.consoleErrors))
  assert(failingData.consoleErrors.length > 0, 'Console errors captured')
  assert(failingData.consoleErrors.some((c) => c.text.includes('Deliberate console error in test fixture')))
  assert(Array.isArray(failingData.httpErrors))
  assert(failingData.httpErrors.length > 0, 'HTTP errors captured')
  assert(failingData.httpErrors.some((h) => h.status === 500 && h.url.includes('/api/error-endpoint')))
  assert(failingData.failedRequests.some((request) => request.url.includes('/private-resource')))
  assert.strictEqual(privateFixtureRequestCount, 0, 'Direct and redirected private subresources never reach the fixture server')

  assert(Array.isArray(failingData.findings))
  assert(failingData.findings.length >= 3, 'Findings generated from all failure categories')
  const pageFinding = failingData.findings.find((f) => f.type === 'PAGE_ERROR')
  assert(pageFinding, 'PAGE_ERROR finding generated')
  assert.strictEqual(pageFinding.severity, 'high')

  const consoleFinding = failingData.findings.find((f) => f.type === 'CONSOLE_ERROR')
  assert(consoleFinding, 'CONSOLE_ERROR finding generated')
  assert.strictEqual(consoleFinding.severity, 'medium')

  const httpFinding = failingData.findings.find((f) => f.type === 'HTTP_ERROR')
  assert(httpFinding, 'HTTP_ERROR finding generated')
  assert.strictEqual(httpFinding.severity, 'high')
  console.log('Passed Scenario 5: Failing page produced structured evidence and categorized findings.\n')

  console.log('Scenario 6: Verifying legacy-compatible fields and schema invariants across runs...')
  const runsToCheck = [healthyData, failingData]
  const requiredFields = [
    'url',
    'finalUrl',
    'title',
    'status',
    'pageErrors',
    'consoleErrors',
    'failedRequests',
    'httpErrors',
    'findings',
    'screenshot',
    'screenshotError',
    'performanceMetrics',
    'createdAt',
    'updatedAt'
  ]
  for (const run of runsToCheck) {
    for (const field of requiredFields) {
      assert(field in run, `Required legacy-compatible field "${field}" must exist on test run`)
    }
  }
  console.log('Passed Scenario 6: All legacy-compatible fields and schema invariants verified.\n')

  console.log('Scenario 7: Verifying cleanup of temporary resources...')
  for (const sPath of createdScreenshotPaths) {
    try {
      await fs.unlink(path.resolve(sPath))
    } catch {}
  }
  await TestRun.deleteMany({ _id: { $in: createdRunIds } })
  for (const id of createdRunIds) {
    const checkDeleted = await TestRun.findById(id)
    assert.strictEqual(checkDeleted, null, `Test run ${id} successfully cleaned up from database`)
  }
  createdRunIds.length = 0
  console.log('Passed Scenario 7: Temporary screenshots and database records cleaned up cleanly.\n')

  console.log('ALL CRITICAL USER JOURNEY END-TO-END AUDIT SCENARIOS PASSED!')
} finally {
  if (createdRunIds.length > 0) {
    try {
      await TestRun.deleteMany({ _id: { $in: createdRunIds } })
    } catch {}
  }
  for (const sPath of createdScreenshotPaths) {
    try {
      await fs.unlink(path.resolve(sPath))
    } catch {}
  }
  if (apiServer) {
    await new Promise((resolve) => apiServer.close(resolve))
  }
  if (fixtureServer) {
    await new Promise((resolve) => fixtureServer.close(resolve))
  }
  await mongoose.disconnect()
}
