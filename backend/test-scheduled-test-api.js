import assert from 'node:assert'
import mongoose from 'mongoose'
import {
  app,
  ScheduledTest,
  initializeScheduledTests,
  shutdownServer,
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
  getScheduledJobs,
  getScheduledJob
} from './src/server.js'

console.log('--- RUNNING SCHEDULED TEST MANAGEMENT API & PERSISTENCE TESTS ---')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'
await mongoose.connect(MONGODB_URI)

const server = app.listen(0)
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}`

const cleanTestRecords = async () => {
  stopAllSchedules()
  await ScheduledTest.deleteMany({ url: /test-scheduled-api\.example\.com/ })
  await mongoose.connection.collection('scheduledtests').deleteMany({ url: /test-scheduled-api\.example\.com/ })
}

try {
  await cleanTestRecords()

  console.log('Test 1: Valid schedule creation persists a record and registers a runtime job')
  const createRes1 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://test-scheduled-api.example.com/site1',
      intervalMinutes: 10
    })
  })
  assert.strictEqual(createRes1.status, 201)
  const created1 = await createRes1.json()
  assert(created1._id)
  assert.strictEqual(created1.url, 'https://test-scheduled-api.example.com/site1')
  assert.strictEqual(created1.intervalMinutes, 10)
  assert.strictEqual(created1.enabled, true)
  assert(created1.createdAt)
  assert(created1.updatedAt)

  const persisted1 = await ScheduledTest.findById(created1._id)
  assert(persisted1)
  assert.strictEqual(persisted1.url, 'https://test-scheduled-api.example.com/site1')
  assert.strictEqual(persisted1.intervalMinutes, 10)

  const runtimeJob1 = getScheduledJob(created1._id.toString())
  assert(runtimeJob1)
  assert.strictEqual(runtimeJob1.url, 'https://test-scheduled-api.example.com/site1')
  assert.strictEqual(runtimeJob1.intervalMinutes, 10)
  console.log('Passed Test 1: Valid schedule created, persisted, and registered in runtime.\n')

  console.log('Test 2: Invalid URL returns HTTP 400')
  const invalidUrlRes1 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'not-a-valid-url', intervalMinutes: 5 })
  })
  assert.strictEqual(invalidUrlRes1.status, 400)

  const invalidUrlRes2 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'ftp://test-scheduled-api.example.com', intervalMinutes: 5 })
  })
  assert.strictEqual(invalidUrlRes2.status, 400)

  const invalidUrlRes3 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '', intervalMinutes: 5 })
  })
  assert.strictEqual(invalidUrlRes3.status, 400)
  console.log('Passed Test 2: Invalid URLs rejected with HTTP 400.\n')

  console.log('Test 3: Invalid interval returns HTTP 400')
  const invalidIntervalRes1 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://test-scheduled-api.example.com/site-inv', intervalMinutes: 0 })
  })
  assert.strictEqual(invalidIntervalRes1.status, 400)

  const invalidIntervalRes2 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://test-scheduled-api.example.com/site-inv', intervalMinutes: -5 })
  })
  assert.strictEqual(invalidIntervalRes2.status, 400)

  const invalidIntervalRes3 = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://test-scheduled-api.example.com/site-inv', intervalMinutes: 'ten' })
  })
  assert.strictEqual(invalidIntervalRes3.status, 400)
  console.log('Passed Test 3: Invalid intervals rejected with HTTP 400.\n')

  console.log('Test 4: Missing or malformed request bodies are rejected safely')
  const emptyBodyRes = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  assert.strictEqual(emptyBodyRes.status, 400)

  const arrayBodyRes = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  assert.strictEqual(arrayBodyRes.status, 400)
  console.log('Passed Test 4: Missing and malformed request bodies rejected safely.\n')

  console.log('Test 5: Duplicate schedule creation is handled consistently')
  const dup1Res = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://test-scheduled-api.example.com/site-dup',
      intervalMinutes: 15
    })
  })
  assert.strictEqual(dup1Res.status, 201)

  const dup2Res = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://test-scheduled-api.example.com/site-dup',
      intervalMinutes: 20
    })
  })
  assert.strictEqual(dup2Res.status, 409)
  const dup2Data = await dup2Res.json()
  assert.strictEqual(dup2Data.code, 'DUPLICATE_SCHEDULE')
  console.log('Passed Test 5: Duplicate schedule creation rejected with HTTP 409.\n')

  console.log('Test 6: Schedule listing returns saved records in the expected order')
  const listRes = await fetch(`${baseUrl}/api/schedules`)
  assert.strictEqual(listRes.status, 200)
  const listData = await listRes.json()
  assert(Array.isArray(listData))
  assert(listData.length >= 2)
  const timeA = new Date(listData[0].createdAt).getTime()
  const timeB = new Date(listData[1].createdAt).getTime()
  assert(timeA >= timeB)
  console.log('Passed Test 6: Schedules listed in newest-first order.\n')

  console.log('Test 7: Schedule lookup succeeds for an existing ID')
  const getOneRes = await fetch(`${baseUrl}/api/schedules/${created1._id}`)
  assert.strictEqual(getOneRes.status, 200)
  const getOneData = await getOneRes.json()
  assert.strictEqual(getOneData._id, created1._id)
  assert.strictEqual(getOneData.url, 'https://test-scheduled-api.example.com/site1')
  console.log('Passed Test 7: Schedule lookup by ID succeeded.\n')

  console.log('Test 8: Malformed IDs return HTTP 400')
  const malformedIdRes = await fetch(`${baseUrl}/api/schedules/not-a-valid-mongo-id`)
  assert.strictEqual(malformedIdRes.status, 400)
  console.log('Passed Test 8: Malformed ID rejected with HTTP 400.\n')

  console.log('Test 9: Missing IDs return HTTP 404')
  const nonExistentId = new mongoose.Types.ObjectId().toString()
  const missingIdRes = await fetch(`${baseUrl}/api/schedules/${nonExistentId}`)
  assert.strictEqual(missingIdRes.status, 404)
  console.log('Passed Test 9: Missing ID returned HTTP 404.\n')

  console.log('Test 10: Updating URL and interval refreshes the runtime registration')
  const patchRes1 = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://test-scheduled-api.example.com/site1-updated',
      intervalMinutes: 25
    })
  })
  assert.strictEqual(patchRes1.status, 200)
  const patchData1 = await patchRes1.json()
  assert.strictEqual(patchData1.url, 'https://test-scheduled-api.example.com/site1-updated')
  assert.strictEqual(patchData1.intervalMinutes, 25)

  const updatedDoc1 = await ScheduledTest.findById(created1._id)
  assert.strictEqual(updatedDoc1.url, 'https://test-scheduled-api.example.com/site1-updated')
  assert.strictEqual(updatedDoc1.intervalMinutes, 25)

  assert.strictEqual(getScheduledJob('https://test-scheduled-api.example.com/site1'), null)
  const refreshedRuntimeJob = getScheduledJob(created1._id.toString())
  assert(refreshedRuntimeJob)
  assert.strictEqual(refreshedRuntimeJob.url, 'https://test-scheduled-api.example.com/site1-updated')
  assert.strictEqual(refreshedRuntimeJob.intervalMinutes, 25)
  console.log('Passed Test 10: Updating URL and interval refreshed database and runtime registration.\n')

  console.log('Test 11: Disabling a schedule retains the database record and unregisters the timer')
  const disableRes = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false })
  })
  assert.strictEqual(disableRes.status, 200)
  const disabledData = await disableRes.json()
  assert.strictEqual(disabledData.enabled, false)

  const disabledDoc = await ScheduledTest.findById(created1._id)
  assert(disabledDoc)
  assert.strictEqual(disabledDoc.enabled, false)

  const runtimeJobDisabled = getScheduledJob(created1._id.toString())
  assert.strictEqual(runtimeJobDisabled, null)
  console.log('Passed Test 11: Disabling schedule retained DB record and unregistered runtime timer.\n')

  console.log('Test 12: Re-enabling a schedule registers it again')
  const enableRes = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  })
  assert.strictEqual(enableRes.status, 200)
  const enabledData = await enableRes.json()
  assert.strictEqual(enabledData.enabled, true)

  const reEnabledJob = getScheduledJob(created1._id.toString())
  assert(reEnabledJob)
  assert.strictEqual(reEnabledJob.url, 'https://test-scheduled-api.example.com/site1-updated')
  assert.strictEqual(reEnabledJob.intervalMinutes, 25)
  console.log('Passed Test 12: Re-enabling schedule re-registered runtime timer.\n')

  console.log('Test 13: Invalid updates do not corrupt the existing schedule or runtime job')
  const badPatchRes1 = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMinutes: -1 })
  })
  assert.strictEqual(badPatchRes1.status, 400)

  const badPatchRes2 = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'invalid-url' })
  })
  assert.strictEqual(badPatchRes2.status, 400)

  const badPatchRes3 = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unsupportedField: 123 })
  })
  assert.strictEqual(badPatchRes3.status, 400)

  const preservedDoc = await ScheduledTest.findById(created1._id)
  assert.strictEqual(preservedDoc.url, 'https://test-scheduled-api.example.com/site1-updated')
  assert.strictEqual(preservedDoc.intervalMinutes, 25)
  assert.strictEqual(preservedDoc.enabled, true)

  const preservedJob = getScheduledJob(created1._id.toString())
  assert(preservedJob)
  assert.strictEqual(preservedJob.intervalMinutes, 25)
  console.log('Passed Test 13: Invalid update rejected and existing state remained uncorrupted.\n')

  console.log('Test 14: Deletion removes the database record and unregisters its job')
  const deleteRes = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'DELETE'
  })
  assert.strictEqual(deleteRes.status, 200)

  const deletedDoc = await ScheduledTest.findById(created1._id)
  assert.strictEqual(deletedDoc, null)

  const deletedJob = getScheduledJob(created1._id.toString())
  assert.strictEqual(deletedJob, null)

  const deleteMissingRes = await fetch(`${baseUrl}/api/schedules/${created1._id}`, {
    method: 'DELETE'
  })
  assert.strictEqual(deleteMissingRes.status, 404)
  console.log('Passed Test 14: Schedule deletion removed DB record and unregistered job.\n')

  console.log('Test 15: Failed registration does not leave an orphaned persisted record')
  registerSchedule({
    id: 'blocker-job-id',
    url: 'https://test-scheduled-api.example.com/blocked-url',
    intervalMinutes: 10
  })

  const orphanAttemptRes = await fetch(`${baseUrl}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://test-scheduled-api.example.com/blocked-url',
      intervalMinutes: 10
    })
  })
  assert(orphanAttemptRes.status === 409 || orphanAttemptRes.status === 500)

  const orphanedDoc = await ScheduledTest.findOne({ url: 'https://test-scheduled-api.example.com/blocked-url' })
  assert.strictEqual(orphanedDoc, null)
  unregisterSchedule('blocker-job-id')
  console.log('Passed Test 15: Failed registration rolled back persisted record.\n')

  console.log('Test 16: Startup restoration registers enabled schedules only')
  stopAllSchedules()
  const enabledSchedule = await ScheduledTest.create({
    url: 'https://test-scheduled-api.example.com/restore-enabled',
    intervalMinutes: 12,
    enabled: true
  })
  const disabledSchedule = await ScheduledTest.create({
    url: 'https://test-scheduled-api.example.com/restore-disabled',
    intervalMinutes: 12,
    enabled: false
  })

  const restoredCount = await initializeScheduledTests()
  assert(restoredCount >= 1)

  const restoredJob = getScheduledJob(enabledSchedule._id.toString())
  assert(restoredJob)
  assert.strictEqual(restoredJob.url, 'https://test-scheduled-api.example.com/restore-enabled')

  const skippedDisabledJob = getScheduledJob(disabledSchedule._id.toString())
  assert.strictEqual(skippedDisabledJob, null)
  console.log('Passed Test 16: Startup restoration registered enabled schedules only.\n')

  console.log('Test 17: Startup restoration handles one invalid schedule without preventing other valid schedules from loading')
  stopAllSchedules()
  await mongoose.connection.collection('scheduledtests').insertOne({
    url: 'https://test-scheduled-api.example.com/corrupt-schedule',
    intervalMinutes: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date()
  })
  const validSchedule = await ScheduledTest.create({
    url: 'https://test-scheduled-api.example.com/valid-alongside-corrupt',
    intervalMinutes: 14,
    enabled: true
  })

  await initializeScheduledTests()

  const validLoadedJob = getScheduledJob(validSchedule._id.toString())
  assert(validLoadedJob)
  assert.strictEqual(validLoadedJob.url, 'https://test-scheduled-api.example.com/valid-alongside-corrupt')
  console.log('Passed Test 17: Startup restoration resilient against invalid persisted entries.\n')

  console.log('Test 18: Shutdown clears timers without deleting persisted configurations')
  assert(getScheduledJobs().length > 0)
  shutdownServer()
  assert.strictEqual(getScheduledJobs().length, 0)

  const persistedCountAfterShutdown = await ScheduledTest.countDocuments({
    url: /test-scheduled-api\.example\.com/
  })
  assert(persistedCountAfterShutdown > 0)
  console.log('Passed Test 18: Shutdown stopped all timers without deleting MongoDB records.\n')

  console.log('Test 19: Concurrent requests do not create duplicate registrations')
  const [concurrentResA, concurrentResB] = await Promise.all([
    fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://test-scheduled-api.example.com/concurrent-site',
        intervalMinutes: 30
      })
    }),
    fetch(`${baseUrl}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://test-scheduled-api.example.com/concurrent-site',
        intervalMinutes: 30
      })
    })
  ])

  const statuses = [concurrentResA.status, concurrentResB.status]
  assert(statuses.includes(201))
  assert(statuses.includes(409))

  const concurrentDocs = await ScheduledTest.find({
    url: 'https://test-scheduled-api.example.com/concurrent-site'
  })
  assert.strictEqual(concurrentDocs.length, 1)
  console.log('Passed Test 19: Concurrent schedule requests handled safely without duplicates.\n')

  console.log('Test 20: Existing manual test execution and regression-alert behavior remain compatible')
  const healthRes = await fetch(`${baseUrl}/api/health`)
  assert.strictEqual(healthRes.status, 200)

  const statusRes = await fetch(`${baseUrl}/api/regression-alerts/status`)
  assert.strictEqual(statusRes.status, 200)

  const runsRes = await fetch(`${baseUrl}/api/browser/runs`)
  assert.strictEqual(runsRes.status, 200)
  const runsData = await runsRes.json()
  assert(Array.isArray(runsData))
  console.log('Passed Test 20: Existing health, regression alerts, and test runs endpoints fully compatible.\n')

  console.log('ALL SCHEDULED TEST API TESTS PASSED!')
} finally {
  await cleanTestRecords()
  server.close()
  await mongoose.disconnect()
}

process.exit(0)
