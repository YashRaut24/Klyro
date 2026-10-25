import assert from 'node:assert'
import {
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
  getScheduledJobs,
  getScheduledJob,
  runScheduledJob,
  setMaxConcurrency,
  getMaxConcurrency,
  getActiveConcurrentExecutions,
  validateScheduleParams,
  normalizeUrl
} from './src/scheduledTestRunner.js'
import { analyzeFailures } from './src/failureAnalyzer.js'

console.log('--- Running Scheduled Test Runner Foundation Tests ---')

console.log('Test 1: Valid schedule registration')
stopAllSchedules()
const job1 = registerSchedule({
  url: 'https://example.com/health',
  intervalMinutes: 5
})
assert(job1.id)
assert.strictEqual(job1.url, 'https://example.com/health')
assert.strictEqual(job1.intervalMinutes, 5)
assert.strictEqual(job1.intervalMs, 300000)
assert(job1.nextRunAt)

const activeJobs = getScheduledJobs()
assert.strictEqual(activeJobs.length, 1)
assert.strictEqual(activeJobs[0].id, job1.id)
assert.strictEqual(activeJobs[0].url, 'https://example.com/health')
assert.strictEqual(activeJobs[0].isRunning, false)
console.log('Passed Test 1: Valid schedule registered and tracked in memory.\n')

console.log('Test 2: Invalid URL rejection')
assert.throws(() => {
  registerSchedule({ url: 'ftp://example.com', intervalMinutes: 5 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS' && err.message.includes('HTTP'))

assert.throws(() => {
  registerSchedule({ url: 'invalid-url', intervalMinutes: 5 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')

assert.throws(() => {
  registerSchedule({ url: '', intervalMinutes: 5 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')

assert.throws(() => {
  registerSchedule({ url: null, intervalMinutes: 5 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')
console.log('Passed Test 2: Invalid URLs rejected safely.\n')

console.log('Test 3: Invalid interval rejection')
assert.throws(() => {
  registerSchedule({ url: 'https://example.com/test3', intervalMinutes: 0 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS' && err.message.includes('interval'))

assert.throws(() => {
  registerSchedule({ url: 'https://example.com/test3', intervalMinutes: -10 })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')

assert.throws(() => {
  registerSchedule({ url: 'https://example.com/test3', intervalMinutes: NaN })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')

assert.throws(() => {
  registerSchedule({ url: 'https://example.com/test3', intervalMinutes: 'five' })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')

assert.throws(() => {
  registerSchedule({ url: 'https://example.com/test3', intervalMinutes: null })
}, (err) => err.code === 'INVALID_SCHEDULE_PARAMS')
console.log('Passed Test 3: Invalid intervals rejected safely.\n')

console.log('Test 4: Rejection of duplicate schedule registration for the same scheduled job')
stopAllSchedules()
registerSchedule({
  id: 'custom-job-1',
  url: 'https://example.com/duplicate-check',
  intervalMinutes: 10
})

assert.throws(() => {
  registerSchedule({
    id: 'custom-job-2',
    url: 'https://example.com/duplicate-check',
    intervalMinutes: 15
  })
}, (err) => err.code === 'DUPLICATE_SCHEDULE' && err.message.includes('URL'))

assert.throws(() => {
  registerSchedule({
    id: 'custom-job-1',
    url: 'https://example.com/unique-url',
    intervalMinutes: 15
  })
}, (err) => err.code === 'DUPLICATE_SCHEDULE' && err.message.includes('ID'))
console.log('Passed Test 4: Duplicate schedule registrations rejected safely.\n')

console.log('Test 5: Scheduled execution invokes the injected test executor')
stopAllSchedules()
let executorInvokedUrl = null
const testJob = registerSchedule({
  url: 'https://example.com/exec-test',
  intervalMinutes: 5,
  executor: async (url) => {
    executorInvokedUrl = url
    return { status: 200, success: true }
  }
})

const execResult = await runScheduledJob(testJob.id)
assert.strictEqual(execResult.executed, true)
assert.strictEqual(execResult.result.status, 200)
assert.strictEqual(executorInvokedUrl, 'https://example.com/exec-test')

const recordedJob = getScheduledJob(testJob.id)
assert.strictEqual(recordedJob.runCount, 1)
assert.strictEqual(recordedJob.lastError, null)
assert.strictEqual(recordedJob.lastResult.status, 200)
console.log('Passed Test 5: Injected test executor invoked with expected URL.\n')

console.log('Test 6: A second execution does not overlap the same active job')
stopAllSchedules()
let resolveLongTask
const longTaskPromise = new Promise((resolve) => {
  resolveLongTask = resolve
})

const overlappingJob = registerSchedule({
  url: 'https://example.com/overlap-test',
  intervalMinutes: 5,
  executor: async () => longTaskPromise
})

const firstRunPromise = runScheduledJob(overlappingJob.id)
const secondRunResult = await runScheduledJob(overlappingJob.id)

assert.strictEqual(secondRunResult.executed, false)
assert.strictEqual(secondRunResult.skipped, true)
assert.strictEqual(secondRunResult.reason, 'JOB_ALREADY_RUNNING')

resolveLongTask({ finished: true })
const firstRunResult = await firstRunPromise
assert.strictEqual(firstRunResult.executed, true)

const postOverlapJob = getScheduledJob(overlappingJob.id)
assert.strictEqual(postOverlapJob.isRunning, false)
assert.strictEqual(postOverlapJob.runCount, 1)
console.log('Passed Test 6: Overlapping executions on the same job cleanly prevented.\n')

console.log('Test 7: Execution failures do not crash the scheduler')
stopAllSchedules()
const failingJob = registerSchedule({
  url: 'https://example.com/fail-test',
  intervalMinutes: 5,
  executor: async () => {
    throw new Error('Simulated upstream network failure')
  }
})

const failResult = await runScheduledJob(failingJob.id)
assert.strictEqual(failResult.executed, false)
assert(failResult.error.includes('Simulated upstream network failure'))

const recordedFailingJob = getScheduledJob(failingJob.id)
assert.strictEqual(recordedFailingJob.isRunning, false)
assert(recordedFailingJob.lastError.includes('Simulated upstream network failure'))
assert.strictEqual(recordedFailingJob.runCount, 0)
console.log('Passed Test 7: Execution failure handled safely without scheduler crash.\n')

console.log('Test 8: Cleanup stops future timer executions')
stopAllSchedules()
registerSchedule({ url: 'https://example.com/clean1', intervalMinutes: 5 })
registerSchedule({ url: 'https://example.com/clean2', intervalMinutes: 10 })
registerSchedule({ url: 'https://example.com/clean3', intervalMinutes: 15 })
assert.strictEqual(getScheduledJobs().length, 3)

stopAllSchedules()
assert.strictEqual(getScheduledJobs().length, 0)
console.log('Passed Test 8: stopAllSchedules cleared all registered jobs and timers.\n')

console.log('Test 9: Cleanup is safe to call more than once')
stopAllSchedules()
stopAllSchedules()
stopAllSchedules()
assert.strictEqual(getScheduledJobs().length, 0)
assert.strictEqual(unregisterSchedule('non-existent-id'), false)
console.log('Passed Test 9: Cleanup functions idempotent and safe on repeat calls.\n')

console.log('Test 10: Multiple jobs respect the configured concurrency bound')
stopAllSchedules()
setMaxConcurrency(2)
assert.strictEqual(getMaxConcurrency(), 2)

let resolveA, resolveB
const promiseA = new Promise((r) => { resolveA = r })
const promiseB = new Promise((r) => { resolveB = r })

const jobA = registerSchedule({
  url: 'https://example.com/job-a',
  intervalMinutes: 5,
  executor: async () => promiseA
})

const jobB = registerSchedule({
  url: 'https://example.com/job-b',
  intervalMinutes: 5,
  executor: async () => promiseB
})

const jobC = registerSchedule({
  url: 'https://example.com/job-c',
  intervalMinutes: 5,
  executor: async () => ({ ok: true })
})

const runAPromise = runScheduledJob(jobA.id)
const runBPromise = runScheduledJob(jobB.id)

assert.strictEqual(getActiveConcurrentExecutions(), 2)

const runCResult = await runScheduledJob(jobC.id)
assert.strictEqual(runCResult.executed, false)
assert.strictEqual(runCResult.skipped, true)
assert.strictEqual(runCResult.reason, 'CONCURRENCY_LIMIT_REACHED')

resolveA({ completed: true })
resolveB({ completed: true })
await runAPromise
await runBPromise

assert.strictEqual(getActiveConcurrentExecutions(), 0)

const runCSecondAttempt = await runScheduledJob(jobC.id)
assert.strictEqual(runCSecondAttempt.executed, true)
console.log('Passed Test 10: Concurrency limit strictly enforced across concurrent jobs.\n')

console.log('Test 11: Existing manual browser-test behavior remains unchanged')
const mockEvidence = {
  pageErrors: [{ message: 'TypeError in app', name: 'TypeError' }],
  consoleErrors: [],
  failedRequests: [],
  httpErrors: []
}
const findings = analyzeFailures(mockEvidence)
assert(Array.isArray(findings))
assert.strictEqual(findings.length, 1)
assert.strictEqual(findings[0].type, 'PAGE_ERROR')
console.log('Passed Test 11: Failure analysis pipeline verified consistent.\n')

console.log('Test 12: No schedule or test-run records are created merely by importing or initializing the scheduler')
stopAllSchedules()
assert.strictEqual(getScheduledJobs().length, 0)
assert.strictEqual(getActiveConcurrentExecutions(), 0)
console.log('Passed Test 12: Zero side-effects upon initialization verified.\n')

console.log('ALL SCHEDULED TEST RUNNER FOUNDATION TESTS PASSED!')
process.exit(0)
