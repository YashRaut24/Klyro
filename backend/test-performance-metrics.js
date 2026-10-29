import assert from 'node:assert'
import http from 'node:http'
import net from 'node:net'
import mongoose from 'mongoose'
import { runBrowser } from './src/browserRunner.js'
import { TestRun } from './src/models/TestRun.js'
import { analyzeFailures } from './src/failureAnalyzer.js'

console.log('--- RUNNING BROWSER PERFORMANCE METRICS TESTS ---')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'
await mongoose.connect(MONGODB_URI)

let testServer
let baseUrl

const startServer = () => {
  return new Promise((resolve) => {
    testServer = http.createServer((req, res) => {
      if (req.url === '/style.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' })
        res.end('body { background: #121212; color: #fff; } h1 { font-size: 24px; }')
      } else if (req.url === '/no-paint') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!DOCTYPE html><html><head><title>Empty</title></head><body></body></html>')
      } else if (req.url === '/no-timing') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!DOCTYPE html><html><head><script>Object.defineProperty(performance, "getEntriesByType", { value: () => [] }); Object.defineProperty(performance, "timing", { value: { loadEventEnd: 0, domContentLoadedEventEnd: 0, navigationStart: 0 } });</script></head><body><h1>No timing page</h1></body></html>')
      } else if (req.url === '/throw-metrics') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!DOCTYPE html><html><head><title>Throwing page</title><script>Object.defineProperty(performance, "getEntriesByType", { get: () => { throw new Error("Performance API corrupted"); } });</script></head><body><h1>Throwing page</h1></body></html>')
      } else if (req.url === '/with-errors') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!DOCTYPE html><html><head><title>Error page</title><script>console.error("Test console error"); window.addEventListener("load", () => { setTimeout(() => { throw new Error("Uncaught test error"); }, 10); });</script></head><body><h1>Error page</h1></body></html>')
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!DOCTYPE html><html><head><link rel="stylesheet" href="/style.css"></head><body><h1>Klyro Performance Test Page</h1><p>Measuring performance metrics reliably.</p></body></html>')
      }
    })

    testServer.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port
      baseUrl = `http://klyro.test:${port}`
      resolve()
    })
  })
}

const runFixtureBrowser = (url) => runBrowser(url, {
  lookup: async (hostname) => {
    assert.strictEqual(hostname, 'klyro.test')
    return [{ address: '93.184.216.34', family: 4 }]
  },
  connect: (options, callback) => net.connect({
    host: '127.0.0.1',
    port: options.port
  }, callback)
})

try {
  await startServer()

  console.log('Test 1: Successful collection of available navigation metrics')
  const result1 = await runFixtureBrowser(`${baseUrl}/`)
  assert(result1)
  assert(result1.performanceMetrics)
  assert.strictEqual(typeof result1.performanceMetrics.navigationDurationMs, 'number')
  assert(Number.isFinite(result1.performanceMetrics.navigationDurationMs))
  assert(result1.performanceMetrics.navigationDurationMs >= 0)
  assert.strictEqual(typeof result1.performanceMetrics.domContentLoadedDurationMs, 'number')
  assert(Number.isFinite(result1.performanceMetrics.domContentLoadedDurationMs))
  assert(result1.performanceMetrics.domContentLoadedDurationMs >= 0)
  console.log('Passed Test 1: Navigation and DOM content loaded durations collected successfully.\n')

  console.log('Test 2: Missing or unsupported paint metrics produce null')
  const result2 = await runFixtureBrowser(`${baseUrl}/no-paint`)
  assert(result2)
  assert(result2.performanceMetrics)
  assert.strictEqual(result2.performanceMetrics.firstContentfulPaintMs, null)
  assert.strictEqual(result2.performanceMetrics.largestContentfulPaintMs, null)
  console.log('Passed Test 2: Missing paint metrics produce null instead of zero.\n')

  console.log('Test 3: Missing navigation timing values are handled safely')
  const result3 = await runFixtureBrowser(`${baseUrl}/no-timing`)
  assert(result3)
  assert(result3.performanceMetrics)
  assert.strictEqual(result3.performanceMetrics.navigationDurationMs, null)
  assert.strictEqual(result3.performanceMetrics.domContentLoadedDurationMs, null)
  console.log('Passed Test 3: Missing navigation timing values produce null safely.\n')

  console.log('Test 4: Metrics contain finite, non-negative numbers or null')
  const checkMetricsValidity = (metrics) => {
    assert(metrics)
    const numericKeys = [
      'navigationDurationMs',
      'domContentLoadedDurationMs',
      'firstContentfulPaintMs',
      'largestContentfulPaintMs',
      'totalTransferredBytes'
    ]
    for (const key of numericKeys) {
      const val = metrics[key]
      const isValid = val === null || (typeof val === 'number' && Number.isFinite(val) && val >= 0)
      assert(isValid, `Metric ${key} must be a finite non-negative number or null, received: ${val}`)
    }
  }
  checkMetricsValidity(result1.performanceMetrics)
  checkMetricsValidity(result2.performanceMetrics)
  checkMetricsValidity(result3.performanceMetrics)
  console.log('Passed Test 4: All metric fields confirmed to be finite non-negative numbers or null.\n')

  console.log('Test 5: Resource transfer size is reported with its correct unit and description')
  assert(result1.performanceMetrics)
  assert.strictEqual(typeof result1.performanceMetrics.totalTransferredBytes, 'number')
  assert(Number.isFinite(result1.performanceMetrics.totalTransferredBytes))
  assert(result1.performanceMetrics.totalTransferredBytes > 0)
  assert.strictEqual(
    result1.performanceMetrics.transferredBytesDescription,
    'Browser-observed estimate of transferred resource bytes via Resource Timing API'
  )
  console.log('Passed Test 5: Resource transfer size reported accurately with unit and description.\n')

  console.log('Test 6: Browser navigation still returns the existing metadata and evidence fields')
  const result6 = await runFixtureBrowser(`${baseUrl}/with-errors`)
  assert.strictEqual(result6.url, `${baseUrl}/with-errors`)
  assert.strictEqual(result6.finalUrl, `${baseUrl}/with-errors`)
  assert.strictEqual(result6.title, 'Error page')
  assert.strictEqual(result6.status, 200)
  assert(Array.isArray(result6.pageErrors))
  assert(Array.isArray(result6.consoleErrors))
  assert(result6.consoleErrors.some((c) => c.text.includes('Test console error')))
  assert(Array.isArray(result6.failedRequests))
  assert(Array.isArray(result6.httpErrors))
  assert(result6.screenshot !== undefined)
  assert(result6.performanceMetrics)
  console.log('Passed Test 6: Existing metadata, evidence, and screenshot fields preserved cleanly.\n')

  console.log('Test 7: Performance metrics are included in the saved test-run document')
  const findings = analyzeFailures(result1)
  const savedDoc = await TestRun.create({
    ...result1,
    findings
  })
  assert(savedDoc._id)
  const fetchedDoc = await TestRun.findById(savedDoc._id)
  assert(fetchedDoc)
  assert(fetchedDoc.performanceMetrics)
  assert.strictEqual(
    fetchedDoc.performanceMetrics.navigationDurationMs,
    result1.performanceMetrics.navigationDurationMs
  )
  assert.strictEqual(
    fetchedDoc.performanceMetrics.domContentLoadedDurationMs,
    result1.performanceMetrics.domContentLoadedDurationMs
  )
  assert.strictEqual(
    fetchedDoc.performanceMetrics.totalTransferredBytes,
    result1.performanceMetrics.totalTransferredBytes
  )
  assert.strictEqual(
    fetchedDoc.performanceMetrics.transferredBytesDescription,
    'Browser-observed estimate of transferred resource bytes via Resource Timing API'
  )
  await TestRun.deleteOne({ _id: savedDoc._id })
  console.log('Passed Test 7: Performance metrics persisted and retrieved from database accurately.\n')

  console.log('Test 8: Older test runs without metrics remain readable')
  const legacyDoc = await TestRun.create({
    url: 'https://legacy-test.example.com',
    finalUrl: 'https://legacy-test.example.com',
    title: 'Legacy Page',
    status: 200,
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    findings: [],
    performanceMetrics: null
  })
  const readLegacyDoc = await TestRun.findById(legacyDoc._id)
  assert(readLegacyDoc)
  assert.strictEqual(readLegacyDoc.performanceMetrics, null)
  const legacyObj = readLegacyDoc.toObject()
  assert.strictEqual(legacyObj.performanceMetrics, null)
  await TestRun.deleteOne({ _id: legacyDoc._id })
  console.log('Passed Test 8: Older runs without performance metrics remain readable and null.\n')

  console.log('Test 9: Metric collection failure does not fail an otherwise successful browser run')
  const result9 = await runFixtureBrowser(`${baseUrl}/throw-metrics`)
  assert(result9)
  assert.strictEqual(result9.status, 200)
  assert.strictEqual(result9.title, 'Throwing page')
  assert(result9.screenshot !== null || result9.screenshotError !== null)
  assert(result9.performanceMetrics !== undefined)
  console.log('Passed Test 9: Broken performance APIs handled gracefully without failing test run.\n')

  console.log('Test 10: Browser cleanup still occurs after navigation or metric-collection errors')
  let navigationErrorThrown = false
  try {
    await runFixtureBrowser('http://klyro.test:1')
  } catch (err) {
    navigationErrorThrown = true
    assert(err.message)
  }
  assert.strictEqual(navigationErrorThrown, true)

  const postCleanupRun = await runFixtureBrowser(`${baseUrl}/`)
  assert.strictEqual(postCleanupRun.status, 200)
  console.log('Passed Test 10: Browser resources cleaned up properly after navigation errors.\n')

  console.log('ALL BROWSER PERFORMANCE METRICS TESTS PASSED!')
} finally {
  if (testServer) {
    testServer.close()
  }
  await mongoose.disconnect()
}
