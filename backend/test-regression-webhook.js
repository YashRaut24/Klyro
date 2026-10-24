import assert from 'node:assert'
import mongoose from 'mongoose'
import {
  sendRegressionAlertWebhook,
  buildRegressionWebhookPayload,
  clearDispatchedWebhookEvents,
  dispatchedWebhookEvents
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

console.log('ALL REGRESSION ALERT WEBHOOK DELIVERY TESTS PASSED!')
process.exit(0)
