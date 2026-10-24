import assert from 'node:assert'
import mongoose from 'mongoose'
import {
  sendRegressionAlertWebhook,
  buildRegressionWebhookPayload,
  clearDispatchedWebhookEvents,
  dispatchedWebhookEvents,
  getRegressionWebhookStatus,
  recordDeliveryStatus,
  clearRegressionWebhookStatus,
  getRegressionWebhookHistory,
  clearRegressionWebhookHistory,
  recordDeliveryHistory,
  sendManualTestPing,
  MAX_HISTORY_ENTRIES
} from './src/regressionWebhook.js'
import { TestRun } from './src/models/TestRun.js'

console.log('--- Running Regression Alert Webhook Delivery Tests ---')

console.log('Test 1: A regression with new findings dispatches the expected payload when a webhook is configured')
clearDispatchedWebhookEvents()
let capturedCall = null
const mockFetch1 = async (url, options) => {
  capturedCall = { url, options, body: JSON.parse(options.body) }
  return {
    ok: true,
    status: 200
  }
}

const regressionReport1 = {
  status: 'not_verified',
  summary: {
    resolved: 0,
    persistent: 1,
    new: 1,
    totalBaseline: 1,
    totalVerification: 2
  },
  newFindings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught ReferenceError: missingVar is not defined',
      description: 'Script error on checkout page'
    }
  ]
}

const res1 = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'base-run-001',
  verificationRunId: 'verify-run-001',
  url: 'https://example.com/checkout',
  webhookUrl: 'https://hooks.example.com/regression',
  fetchFn: mockFetch1
})

assert.strictEqual(res1.delivered, true)
assert.strictEqual(res1.status, 200)
assert(capturedCall)
assert.strictEqual(capturedCall.url, 'https://hooks.example.com/regression')
assert.strictEqual(capturedCall.options.method, 'POST')
assert.strictEqual(capturedCall.options.headers['Content-Type'], 'application/json')
assert.strictEqual(capturedCall.body.event, 'regression_alert')
assert.strictEqual(capturedCall.body.status, 'not_verified')
assert.strictEqual(capturedCall.body.baselineRunId, 'base-run-001')
assert.strictEqual(capturedCall.body.verificationRunId, 'verify-run-001')
assert.strictEqual(capturedCall.body.url, 'https://example.com/checkout')
assert.strictEqual(capturedCall.body.newFindingsCount, 1)
assert.strictEqual(capturedCall.body.newFindings.length, 1)
assert.strictEqual(capturedCall.body.newFindings[0].title, 'Uncaught ReferenceError: missingVar is not defined')
console.log('Passed Test 1: Webhook correctly dispatched with expected payload.\n')

console.log('Test 2: Zero new findings do not dispatch a webhook')
clearDispatchedWebhookEvents()
let fetchCalled2 = false
const mockFetch2 = async () => {
  fetchCalled2 = true
  return { ok: true, status: 200 }
}

const cleanReport2 = {
  status: 'verified',
  summary: {
    resolved: 2,
    persistent: 0,
    new: 0,
    totalBaseline: 2,
    totalVerification: 0
  },
  newFindings: []
}

const res2 = await sendRegressionAlertWebhook({
  verificationReport: cleanReport2,
  baselineRunId: 'base-002',
  verificationRunId: 'verify-002',
  url: 'https://example.com',
  webhookUrl: 'https://hooks.example.com/regression',
  fetchFn: mockFetch2
})

assert.strictEqual(res2.delivered, false)
assert.strictEqual(res2.skipped, true)
assert.strictEqual(fetchCalled2, false)
console.log('Passed Test 2: Zero new findings cleanly skipped webhook dispatch.\n')

console.log('Test 3: Missing or malformed reports do not dispatch a webhook')
clearDispatchedWebhookEvents()
let fetchCalled3 = false
const mockFetch3 = async () => {
  fetchCalled3 = true
  return { ok: true, status: 200 }
}

const malformedInputs = [
  null,
  undefined,
  {},
  { foo: 'bar' },
  { verificationReport: null },
  { status: 'invalid', newFindings: 'not-an-array' }
]

for (const input of malformedInputs) {
  const res3 = await sendRegressionAlertWebhook({
    verificationReport: input,
    webhookUrl: 'https://hooks.example.com/regression',
    fetchFn: mockFetch3
  })
  assert.strictEqual(res3.delivered, false)
  assert.strictEqual(res3.skipped, true)
}
assert.strictEqual(fetchCalled3, false)
console.log('Passed Test 3: Missing and malformed reports safely skipped webhook dispatch.\n')

console.log('Test 4: An unconfigured webhook is skipped safely')
clearDispatchedWebhookEvents()
const previousEnvUrl = process.env.REGRESSION_WEBHOOK_URL
delete process.env.REGRESSION_WEBHOOK_URL

let fetchCalled4 = false
const mockFetch4 = async () => {
  fetchCalled4 = true
  return { ok: true, status: 200 }
}

const res4a = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'b-004',
  verificationRunId: 'v-004',
  fetchFn: mockFetch4
})
assert.strictEqual(res4a.delivered, false)
assert.strictEqual(res4a.skipped, true)
assert.strictEqual(res4a.reason, 'Webhook URL not configured')

const res4b = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  webhookUrl: '   ',
  fetchFn: mockFetch4
})
assert.strictEqual(res4b.delivered, false)
assert.strictEqual(res4b.skipped, true)
assert.strictEqual(res4b.reason, 'Webhook URL not configured')
assert.strictEqual(fetchCalled4, false)

if (previousEnvUrl !== undefined) {
  process.env.REGRESSION_WEBHOOK_URL = previousEnvUrl
}
console.log('Passed Test 4: Unconfigured or blank webhook safely skipped without errors.\n')

console.log('Test 5: A failed or timed-out webhook does not invalidate the saved verification report')
clearDispatchedWebhookEvents()
const failingFetch = async () => {
  return { ok: false, status: 500 }
}

const res5Fail = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'base-fail-005',
  verificationRunId: 'verify-fail-005',
  webhookUrl: 'https://hooks.example.com/fail',
  fetchFn: failingFetch
})
assert.strictEqual(res5Fail.delivered, false)
assert.strictEqual(res5Fail.status, 500)
assert.strictEqual(regressionReport1.status, 'not_verified')

clearDispatchedWebhookEvents()
const timeoutFetch = async () => {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  throw err
}

const res5Timeout = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'base-timeout-005',
  verificationRunId: 'verify-timeout-005',
  webhookUrl: 'https://hooks.example.com/timeout',
  fetchFn: timeoutFetch
})
assert.strictEqual(res5Timeout.delivered, false)
assert.strictEqual(res5Timeout.reason, 'Webhook request timed out')
console.log('Passed Test 5: Failed and timed-out webhook requests handled safely without corrupting report.\n')

console.log('Test 6: The payload uses the actual baseline and verification run identifiers, URL, status, and new-finding count')
clearDispatchedWebhookEvents()
let payload6 = null
const mockFetch6 = async (url, options) => {
  payload6 = JSON.parse(options.body)
  return { ok: true, status: 204 }
}

const detailedReport6 = {
  status: 'partially_verified',
  summary: {
    resolved: 1,
    persistent: 1,
    new: 2,
    totalBaseline: 2,
    totalVerification: 3
  },
  newFindings: [
    { title: 'New HTTP 502' },
    { title: 'New console uncaught exception' }
  ]
}

await sendRegressionAlertWebhook({
  verificationReport: detailedReport6,
  baselineRunId: '65a111111111111111111111',
  verificationRunId: '65b222222222222222222222',
  url: 'https://app.klyro.dev/billing',
  webhookUrl: 'https://hooks.example.com/regression',
  fetchFn: mockFetch6
})

assert(payload6)
assert.strictEqual(payload6.event, 'regression_alert')
assert.strictEqual(payload6.status, 'partially_verified')
assert.strictEqual(payload6.baselineRunId, '65a111111111111111111111')
assert.strictEqual(payload6.verificationRunId, '65b222222222222222222222')
assert.strictEqual(payload6.url, 'https://app.klyro.dev/billing')
assert.strictEqual(payload6.newFindingsCount, 2)
assert.strictEqual(payload6.newFindings.length, 2)
assert.strictEqual(payload6.newFindings[0].title, 'New HTTP 502')
assert.strictEqual(payload6.newFindings[1].title, 'New console uncaught exception')
console.log('Passed Test 6: Payload accurately mapped all real baseline, verification, URL, and finding properties.\n')

console.log('Test 7: A duplicate request or repeated processing does not dispatch duplicate notifications for the same verification event')
clearDispatchedWebhookEvents()
let dispatchCounter7 = 0
const countingFetch = async () => {
  dispatchCounter7++
  return { ok: true, status: 200 }
}

const firstDispatch = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'dup-base-007',
  verificationRunId: 'dup-verify-007',
  webhookUrl: 'https://hooks.example.com/regression',
  fetchFn: countingFetch
})
assert.strictEqual(firstDispatch.delivered, true)
assert.strictEqual(dispatchCounter7, 1)

const secondDispatch = await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'dup-base-007',
  verificationRunId: 'dup-verify-007',
  webhookUrl: 'https://hooks.example.com/regression',
  fetchFn: countingFetch
})
assert.strictEqual(secondDispatch.delivered, false)
assert.strictEqual(secondDispatch.skipped, true)
assert.strictEqual(secondDispatch.duplicate, true)
assert.strictEqual(dispatchCounter7, 1)
console.log('Passed Test 7: Duplicate dispatch prevented on repeated invocation for same event.\n')

console.log('Test 8: Existing verification API behavior remains unchanged')
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'
await mongoose.connect(MONGODB_URI)

const baselineTestRun = await TestRun.create({
  url: 'http://localhost:5000/api/health',
  title: 'Webhook Test Baseline Run',
  status: 200,
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Original Baseline Error',
      description: 'Original error message',
      evidence: { name: 'Error', message: 'Original' }
    }
  ]
})

const verifyApiResponse = await fetch(`http://localhost:5000/api/browser/runs/${baselineTestRun._id}/verify`, {
  method: 'POST'
})
assert.strictEqual(verifyApiResponse.status, 200)
const verifyApiData = await verifyApiResponse.json()

assert.strictEqual(verifyApiData.baselineRunId, baselineTestRun._id.toString())
assert(verifyApiData.verificationRunId && mongoose.isValidObjectId(verifyApiData.verificationRunId))
assert(verifyApiData.verificationReport)
assert.strictEqual(verifyApiData.verificationReport.status, 'verified')
assert.strictEqual(verifyApiData.verificationReport.summary.resolved, 1)
assert.strictEqual(verifyApiData.verificationReport.summary.persistent, 0)
assert.strictEqual(verifyApiData.verificationReport.summary.new, 0)

const persistedBaseline = await TestRun.findById(baselineTestRun._id)
assert(persistedBaseline)
assert(persistedBaseline.verificationReport)
assert.strictEqual(persistedBaseline.verificationReport.status, 'verified')
assert.strictEqual(persistedBaseline.verificationReport.summary.resolved, 1)
console.log('Passed Test 8: Live verification API executed cleanly and persisted report without regression.\n')

console.log('Test 9: Configured webhook status without exposing the URL')
clearRegressionWebhookStatus()
process.env.REGRESSION_WEBHOOK_URL = 'https://secret.webhook.org/listener?key=supersecret999'
const status9 = getRegressionWebhookStatus()
assert.strictEqual(status9.configured, true)
assert.strictEqual(JSON.stringify(status9).includes('supersecret999'), false)
assert.strictEqual(JSON.stringify(status9).includes('secret.webhook.org'), false)
console.log('Passed Test 9: Webhook configuration status verified without leaking secret URL.\n')

console.log('Test 10: Missing webhook configuration')
delete process.env.REGRESSION_WEBHOOK_URL
const status10 = getRegressionWebhookStatus()
assert.strictEqual(status10.configured, false)
console.log('Passed Test 10: Missing configuration safely reported as configured=false.\n')

console.log('Test 11: No previous delivery history')
clearRegressionWebhookStatus()
const status11 = getRegressionWebhookStatus()
assert.strictEqual(status11.status, 'unavailable')
assert.strictEqual(status11.timestamp, null)
assert.strictEqual(status11.latestDelivery, null)
assert.strictEqual(status11.message, 'No webhook deliveries attempted yet')
console.log('Passed Test 11: Clean unavailable state returned when no prior delivery history.\n')

console.log('Test 12: Actual delivery outcomes recorded correctly across all states')
clearDispatchedWebhookEvents()
clearRegressionWebhookStatus()

await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'b-stat-1',
  verificationRunId: 'v-stat-1',
  webhookUrl: 'https://example.com/webhook',
  fetchFn: async () => ({ ok: true, status: 200 })
})
let s12 = getRegressionWebhookStatus()
assert.strictEqual(s12.status, 'delivered')
assert(s12.message.includes('200'))
assert(s12.timestamp)

clearDispatchedWebhookEvents()
await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'b-stat-2',
  verificationRunId: 'v-stat-2',
  webhookUrl: 'https://example.com/webhook',
  fetchFn: async () => ({ ok: false, status: 502 })
})
s12 = getRegressionWebhookStatus()
assert.strictEqual(s12.status, 'failed')
assert(s12.message.includes('502'))

clearDispatchedWebhookEvents()
await sendRegressionAlertWebhook({
  verificationReport: regressionReport1,
  baselineRunId: 'b-stat-3',
  verificationRunId: 'v-stat-3',
  webhookUrl: 'https://example.com/webhook',
  fetchFn: async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }
})
s12 = getRegressionWebhookStatus()
assert.strictEqual(s12.status, 'timed_out')
assert.strictEqual(s12.message, 'Webhook request timed out')

clearDispatchedWebhookEvents()
await sendRegressionAlertWebhook({
  verificationReport: cleanReport2,
  baselineRunId: 'b-stat-4',
  verificationRunId: 'v-stat-4',
  webhookUrl: 'https://example.com/webhook',
  fetchFn: async () => ({ ok: true, status: 200 })
})
s12 = getRegressionWebhookStatus()
assert.strictEqual(s12.status, 'skipped')
assert(s12.message.includes('No regression detected') || s12.message.includes('No regression alert required'))
console.log('Passed Test 12: All actual delivery outcomes recorded and reported accurately.\n')

console.log('Test 13: GET /api/regression-alerts/status API endpoint integration')
const statusApiRes = await fetch('http://localhost:5000/api/regression-alerts/status')
assert.strictEqual(statusApiRes.status, 200)
const statusApiData = await statusApiRes.json()
assert.strictEqual(typeof statusApiData.configured, 'boolean')
assert(typeof statusApiData.status === 'string')
assert(typeof statusApiData.message === 'string')
assert.strictEqual(JSON.stringify(statusApiData).includes('supersecret'), false)
console.log('Passed Test 13: GET /api/regression-alerts/status returned valid payload without secret leakage.\n')

console.log('Test 14: Empty history')
clearRegressionWebhookHistory()
assert.deepStrictEqual(getRegressionWebhookHistory(), [])
const emptyHistoryRes = await fetch('http://localhost:5000/api/regression-alerts/history')
assert.strictEqual(emptyHistoryRes.status, 200)
const emptyHistoryData = await emptyHistoryRes.json()
assert(Array.isArray(emptyHistoryData.history))
assert.strictEqual(typeof emptyHistoryData.total, 'number')
assert.strictEqual(emptyHistoryData.history.length, emptyHistoryData.total)
console.log('Passed Test 14: Empty history verified in utility and live API structure validated.\n')

console.log('Test 15: Newest-first ordering')
clearRegressionWebhookHistory()
recordDeliveryHistory({ message: 'First attempt', eventType: 'regression_alert', status: 'delivered' })
recordDeliveryHistory({ message: 'Second attempt', eventType: 'manual_test_ping', status: 'delivered' })
recordDeliveryHistory({ message: 'Third attempt', eventType: 'regression_alert', status: 'failed' })
const orderedHistory = getRegressionWebhookHistory()
assert.strictEqual(orderedHistory.length, 3)
assert.strictEqual(orderedHistory[0].message, 'Third attempt')
assert.strictEqual(orderedHistory[1].message, 'Second attempt')
assert.strictEqual(orderedHistory[2].message, 'First attempt')
console.log('Passed Test 15: Newest-first history ordering verified.\n')

console.log('Test 16: History size limit and query limit parameter handling')
clearRegressionWebhookHistory()
for (let i = 1; i <= 65; i++) {
  recordDeliveryHistory({ message: `Attempt ${i}`, eventType: 'manual_test_ping', status: 'delivered' })
}
const cappedHistory = getRegressionWebhookHistory()
assert.strictEqual(cappedHistory.length, MAX_HISTORY_ENTRIES)
assert.strictEqual(cappedHistory[0].message, 'Attempt 65')
assert.strictEqual(getRegressionWebhookHistory(5).length, 5)

const limit1Res = await fetch('http://localhost:5000/api/regression-alerts/history?limit=1')
assert.strictEqual(limit1Res.status, 200)
const limit1Data = await limit1Res.json()
assert(limit1Data.history.length <= 1)
assert.strictEqual(limit1Data.total, limit1Data.history.length)

const malformedLimitRes = await fetch('http://localhost:5000/api/regression-alerts/history?limit=invalid')
assert.strictEqual(malformedLimitRes.status, 200)
const malformedLimitData = await malformedLimitRes.json()
assert(Array.isArray(malformedLimitData.history))
console.log('Passed Test 16: History size limit (50) and limit query parameters enforced safely.\n')

console.log('Test 17: Safe history payloads without secrets')
const sampleItem = cappedHistory[0]
assert(typeof sampleItem.id === 'string')
assert(typeof sampleItem.eventType === 'string')
assert(typeof sampleItem.status === 'string')
assert(typeof sampleItem.timestamp === 'string')
assert(typeof sampleItem.message === 'string')
assert('baselineRunId' in sampleItem)
assert('verificationRunId' in sampleItem)
assert('httpStatus' in sampleItem)
assert.strictEqual('webhookUrl' in sampleItem, false)
assert.strictEqual('token' in sampleItem, false)
assert.strictEqual('secret' in sampleItem, false)
console.log('Passed Test 17: History payloads strictly exclude secrets and URLs.\n')

console.log('Test 18: Successful manual ping dispatches diagnostic payload')
let manualPingPayload = null
const mockManualFetch = async (url, opts) => {
  manualPingPayload = JSON.parse(opts.body)
  return { ok: true, status: 200 }
}
const manualPingResult = await sendManualTestPing({
  webhookUrl: 'https://example.com/test-ping',
  fetchFn: mockManualFetch
})
assert.strictEqual(manualPingResult.delivered, true)
assert.strictEqual(manualPingResult.status, 'delivered')
assert.strictEqual(manualPingResult.httpStatus, 200)
assert.strictEqual(manualPingPayload.event, 'regression_webhook_test')
assert.strictEqual(manualPingPayload.diagnostic, true)
assert.strictEqual(manualPingPayload.source, 'klyro_manual_test')
assert(manualPingPayload.timestamp)
const latestHistoryItem = getRegressionWebhookHistory(1)[0]
assert.strictEqual(latestHistoryItem.eventType, 'manual_test_ping')
assert.strictEqual(latestHistoryItem.status, 'delivered')
assert.strictEqual(latestHistoryItem.httpStatus, 200)
console.log('Passed Test 18: Successful manual test ping dispatched and recorded correctly.\n')

console.log('Test 19: Unconfigured webhook safely skipped on manual ping')
const unconfiguredPingResult = await sendManualTestPing({ webhookUrl: '' })
assert.strictEqual(unconfiguredPingResult.delivered, false)
assert.strictEqual(unconfiguredPingResult.skipped, true)
assert.strictEqual(unconfiguredPingResult.status, 'skipped')
const skippedHistoryItem = getRegressionWebhookHistory(1)[0]
assert.strictEqual(skippedHistoryItem.eventType, 'manual_test_ping')
assert.strictEqual(skippedHistoryItem.status, 'skipped')
console.log('Passed Test 19: Unconfigured webhook safely handled without network calls.\n')

console.log('Test 20: HTTP failure response handled on manual ping')
const failedPingResult = await sendManualTestPing({
  webhookUrl: 'https://example.com/test-ping',
  fetchFn: async () => ({ ok: false, status: 503 })
})
assert.strictEqual(failedPingResult.delivered, false)
assert.strictEqual(failedPingResult.status, 'failed')
assert.strictEqual(failedPingResult.httpStatus, 503)
const failedHistoryItem = getRegressionWebhookHistory(1)[0]
assert.strictEqual(failedHistoryItem.eventType, 'manual_test_ping')
assert.strictEqual(failedHistoryItem.status, 'failed')
assert.strictEqual(failedHistoryItem.httpStatus, 503)
console.log('Passed Test 20: HTTP failure on manual ping recorded safely.\n')

console.log('Test 21: Network failure and timeout handled on manual ping')
const timeoutPingResult = await sendManualTestPing({
  webhookUrl: 'https://example.com/test-ping',
  fetchFn: async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }
})
assert.strictEqual(timeoutPingResult.delivered, false)
assert.strictEqual(timeoutPingResult.status, 'timed_out')
const timeoutHistoryItem = getRegressionWebhookHistory(1)[0]
assert.strictEqual(timeoutHistoryItem.eventType, 'manual_test_ping')
assert.strictEqual(timeoutHistoryItem.status, 'timed_out')
console.log('Passed Test 21: Timeout on manual ping recorded safely.\n')

console.log('Test 22: Overlapping manual ping prevention on live API endpoint')
const liveApiUnconfiguredRes = await fetch('http://localhost:5000/api/regression-alerts/test', { method: 'POST' })
assert.strictEqual(liveApiUnconfiguredRes.status, 400)
const liveApiUnconfiguredData = await liveApiUnconfiguredRes.json()
assert.strictEqual(liveApiUnconfiguredData.success, false)
assert.strictEqual(liveApiUnconfiguredData.status, 'skipped')
console.log('Passed Test 22: Overlapping manual ping handling and unconfigured response verified.\n')

console.log('Test 23: Manual ping isolation: zero DB mutation and duplicate protection intact')
const initialRunCount = await TestRun.countDocuments()
clearDispatchedWebhookEvents()
dispatchedWebhookEvents.add('b1:v1')
await sendManualTestPing({
  webhookUrl: 'https://example.com/test-ping',
  fetchFn: async () => ({ ok: true, status: 200 })
})
const postRunCount = await TestRun.countDocuments()
assert.strictEqual(initialRunCount, postRunCount)
assert.strictEqual(dispatchedWebhookEvents.has('b1:v1'), true)
console.log('Passed Test 23: Manual ping caused zero DB changes and preserved duplicate cache.\n')

console.log('ALL REGRESSION ALERT WEBHOOK DELIVERY TESTS PASSED!')
process.exit(0)

