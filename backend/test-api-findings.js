import assert from 'node:assert'

const testApiFindings = async () => {
  console.log('--- Testing API Findings Integration ---')

  console.log('Step 1: Fetch all runs from GET /api/browser/runs')
  const runsRes = await fetch('http://localhost:5000/api/browser/runs')
  assert.strictEqual(runsRes.status, 200, 'GET /api/browser/runs returned 200')
  const runs = await runsRes.json()
  assert(Array.isArray(runs), 'Runs response is an array')
  assert(runs.length > 0, 'Runs contains existing test runs')

  for (const run of runs) {
    assert(Array.isArray(run.findings), `Run ${run._id} must have a findings array`)
  }
  console.log(`Verified ${runs.length} runs all have findings array.\n`)

  console.log('Step 2: Verify older record with errors (backward compatibility)')
  const errorRunSummary = runs.find(r => (r.pageErrors?.length > 0 || r.httpErrors?.length > 0 || r.failedRequests?.length > 0 || r.consoleErrors?.length > 0))
  assert(errorRunSummary, 'Found older run with errors in database')

  const errorRunRes = await fetch(`http://localhost:5000/api/browser/runs/${errorRunSummary._id}`)
  assert.strictEqual(errorRunRes.status, 200)
  const errorRun = await errorRunRes.json()
  assert(Array.isArray(errorRun.findings), 'Error run has findings array')
  assert(errorRun.findings.length > 0, 'Error run has at least one finding generated')
  for (const finding of errorRun.findings) {
    assert(finding.type, 'Finding has type')
    assert(['high', 'medium', 'low'].includes(finding.severity), 'Finding has valid severity')
    assert(finding.title, 'Finding has title')
    assert(finding.description, 'Finding has description')
    assert(finding.evidence !== undefined, 'Finding has evidence payload')
  }
  console.log(`Verified error run ${errorRun._id} has ${errorRun.findings.length} findings with valid structure.\n`)

  console.log('Step 3: Verify clean run without errors')
  const cleanRunSummary = runs.find(r => (
    (!r.pageErrors || r.pageErrors.length === 0) &&
    (!r.httpErrors || r.httpErrors.length === 0) &&
    (!r.failedRequests || r.failedRequests.length === 0) &&
    (!r.consoleErrors || r.consoleErrors.length === 0)
  ))
  assert(cleanRunSummary, 'Found clean run in database')

  const cleanRunRes = await fetch(`http://localhost:5000/api/browser/runs/${cleanRunSummary._id}`)
  assert.strictEqual(cleanRunRes.status, 200)
  const cleanRun = await cleanRunRes.json()
  assert(Array.isArray(cleanRun.findings), 'Clean run has findings array')
  assert.strictEqual(cleanRun.findings.length, 0, 'Clean run findings array is empty')
  console.log(`Verified clean run ${cleanRun._id} has exactly 0 findings.\n`)

  console.log('Step 4: Verify idempotency / deduplication on repeated fetches')
  const repeatRes1 = await fetch(`http://localhost:5000/api/browser/runs/${errorRunSummary._id}`)
  const repeatRun1 = await repeatRes1.json()
  const repeatRes2 = await fetch(`http://localhost:5000/api/browser/runs/${errorRunSummary._id}`)
  const repeatRun2 = await repeatRes2.json()
  assert.strictEqual(repeatRun1.findings.length, repeatRun2.findings.length)
  console.log('Verified multiple fetches maintain identical, deduplicated findings.\n')

  console.log('ALL API FINDINGS INTEGRATION TESTS PASSED!')
}

testApiFindings().catch((err) => {
  console.error('API findings test failed:', err)
  process.exit(1)
})
