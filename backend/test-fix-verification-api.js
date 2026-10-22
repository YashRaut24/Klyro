import assert from 'node:assert'
import mongoose from 'mongoose'
import { TestRun } from './src/models/TestRun.js'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'

console.log('--- RUNNING FIX VERIFICATION API TESTS ---')

await mongoose.connect(MONGODB_URI)

console.log('Test 1: Invalid baseline ID returns HTTP 400')
const invalidIdRes = await fetch('http://localhost:5000/api/browser/runs/invalid-object-id/verify', {
  method: 'POST'
})
assert.strictEqual(invalidIdRes.status, 400)
const invalidIdData = await invalidIdRes.json()
assert.strictEqual(invalidIdData.error, 'Invalid test run ID')
console.log('Passed Test 1: Invalid baseline ID rejected with HTTP 400.\n')

console.log('Test 2: Missing baseline run returns HTTP 404')
const nonExistentId = new mongoose.Types.ObjectId().toString()
const missingRes = await fetch(`http://localhost:5000/api/browser/runs/${nonExistentId}/verify`, {
  method: 'POST'
})
assert.strictEqual(missingRes.status, 404)
const missingData = await missingRes.json()
assert.strictEqual(missingData.error, 'Test run not found')
console.log('Passed Test 2: Missing baseline run rejected with HTTP 404.\n')

console.log('Test 3: Browser runner navigation failure returns HTTP 502 and does not persist verification')
const unreachableBaseline = await TestRun.create({
  url: 'http://localhost:59999/unreachable-endpoint',
  title: 'Unreachable Baseline',
  status: null,
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Original Error',
      description: 'Original error',
      evidence: { name: 'Error', message: 'Original' }
    }
  ]
})

const failureRes = await fetch(`http://localhost:5000/api/browser/runs/${unreachableBaseline._id}/verify`, {
  method: 'POST'
})
assert.strictEqual(failureRes.status, 502)
const failureData = await failureRes.json()
assert(failureData.error && typeof failureData.error === 'string')

const refreshedUnreachable = await TestRun.findById(unreachableBaseline._id)
assert.strictEqual(refreshedUnreachable.verificationReport, null, 'Verification report must not be saved on failed run')
console.log('Passed Test 3: Browser runner failure handled with HTTP 502 without creating false verification report.\n')

console.log('Test 4: Successful verification creates and links new test run with resolved findings')
const healthBaseline = await TestRun.create({
  url: 'http://localhost:5000/api/health',
  title: 'Health Endpoint Baseline',
  status: 200,
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught TypeError in Header',
      description: 'Cannot read properties of null',
      evidence: { name: 'TypeError', message: 'Cannot read properties of null' }
    }
  ]
})

const verifyRes = await fetch(`http://localhost:5000/api/browser/runs/${healthBaseline._id}/verify`, {
  method: 'POST'
})
assert.strictEqual(verifyRes.status, 200)
const verifyData = await verifyRes.json()

assert.strictEqual(verifyData.baselineRunId, healthBaseline._id.toString())
assert(verifyData.verificationRunId && mongoose.isValidObjectId(verifyData.verificationRunId))
assert.strictEqual(verifyData.verificationReport.status, 'verified')
assert.strictEqual(verifyData.verificationReport.summary.resolved, 1)
assert.strictEqual(verifyData.verificationReport.summary.persistent, 0)
assert.strictEqual(verifyData.verificationReport.summary.new, 0)
assert.strictEqual(verifyData.verificationReport.resolvedFindings.length, 1)
assert.strictEqual(verifyData.verificationReport.resolvedFindings[0].title, 'Uncaught TypeError in Header')
assert(verifyData.verificationReport.verifiedAt)

const linkedFreshRun = await TestRun.findById(verifyData.verificationRunId)
assert(linkedFreshRun)
assert.strictEqual(linkedFreshRun.baselineRunId.toString(), healthBaseline._id.toString())
assert.strictEqual(linkedFreshRun.url, 'http://localhost:5000/api/health')

const updatedBaseline = await TestRun.findById(healthBaseline._id)
assert(updatedBaseline.verificationReport)
assert.strictEqual(updatedBaseline.verificationReport.status, 'verified')
assert.strictEqual(updatedBaseline.verificationReport.verificationRunId, verifyData.verificationRunId)
assert.strictEqual(updatedBaseline.findings.length, 1)
console.log('Passed Test 4: Successful verification creates fresh run and updates baseline verification report.\n')

console.log('Test 5: Persistent findings correctly identified across runs')
const notFoundUrl = 'http://localhost:5000/api/nonexistent-for-verification-test'
const baselineWith404 = await TestRun.create({
  url: notFoundUrl,
  title: '404 Baseline',
  status: 404,
  httpErrors: [
    { url: notFoundUrl, status: 404, statusText: 'Not Found' }
  ],
  findings: [
    {
      type: 'HTTP_ERROR',
      severity: 'medium',
      title: 'HTTP 404 Error Response',
      description: `Request to ${notFoundUrl} returned HTTP 404.`,
      evidence: { url: notFoundUrl, status: 404 }
    }
  ]
})

const persistentRes = await fetch(`http://localhost:5000/api/browser/runs/${baselineWith404._id}/verify`, {
  method: 'POST'
})
assert.strictEqual(persistentRes.status, 200)
const persistentData = await persistentRes.json()

assert.strictEqual(persistentData.verificationReport.status, 'not_verified')
assert.strictEqual(persistentData.verificationReport.summary.persistent, 1)
assert.strictEqual(persistentData.verificationReport.summary.resolved, 0)
assert.strictEqual(persistentData.verificationReport.persistentFindings.length, 1)
assert.strictEqual(persistentData.verificationReport.persistentFindings[0].type, 'HTTP_ERROR')
console.log('Passed Test 5: Persistent 404 finding correctly detected and classified as not_verified.\n')

console.log('Test 6: Target URL is strictly locked to baseline URL and ignores request body URL')
const lockedBaseline = await TestRun.create({
  url: 'http://localhost:5000/api/health',
  title: 'Locked URL Test',
  status: 200,
  findings: []
})

const overrideAttemptRes = await fetch(`http://localhost:5000/api/browser/runs/${lockedBaseline._id}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'http://localhost:59999/malicious-target' })
})
assert.strictEqual(overrideAttemptRes.status, 200)
const overrideAttemptData = await overrideAttemptRes.json()

const freshRunDoc = await TestRun.findById(overrideAttemptData.verificationRunId)
assert.strictEqual(freshRunDoc.url, 'http://localhost:5000/api/health')
console.log('Passed Test 6: Verification strictly tested baseline URL and ignored body URL override.\n')

console.log('Test 7: Concurrency protection blocks overlapping verification on same baseline')
const concurrencyBaseline = await TestRun.create({
  url: 'http://localhost:5000/api/health',
  title: 'Concurrency Baseline',
  status: 200,
  findings: []
})

const [concurrentResA, concurrentResB] = await Promise.all([
  fetch(`http://localhost:5000/api/browser/runs/${concurrencyBaseline._id}/verify`, { method: 'POST' }),
  fetch(`http://localhost:5000/api/browser/runs/${concurrencyBaseline._id}/verify`, { method: 'POST' })
])

const concurrentStatuses = [concurrentResA.status, concurrentResB.status]
assert(concurrentStatuses.includes(409), 'One concurrent verification request must receive HTTP 409 Conflict')
assert(concurrentStatuses.includes(200), 'The accepted verification request must receive HTTP 200')
console.log('Passed Test 7: Duplicate verification attempts blocked with HTTP 409.\n')

console.log('Test 8: History and run retrieval endpoints return verification metadata and stay compatible')
const getRunRes = await fetch(`http://localhost:5000/api/browser/runs/${healthBaseline._id}`)
assert.strictEqual(getRunRes.status, 200)
const retrievedRun = await getRunRes.json()
assert(retrievedRun.verificationReport)
assert.strictEqual(retrievedRun.verificationReport.status, 'verified')
assert(Array.isArray(retrievedRun.findings))

const allRunsRes = await fetch('http://localhost:5000/api/browser/runs')
assert.strictEqual(allRunsRes.status, 200)
const allRuns = await allRunsRes.json()
assert(Array.isArray(allRuns))
assert(allRuns.length > 0)
const foundBaselineInHistory = allRuns.find(r => r._id === healthBaseline._id.toString())
assert(foundBaselineInHistory)
assert(foundBaselineInHistory.verificationReport)
console.log('Passed Test 8: Verification metadata seamlessly included in existing retrieval endpoints.\n')

await mongoose.disconnect()

console.log('ALL FIX VERIFICATION API TESTS PASSED!')
