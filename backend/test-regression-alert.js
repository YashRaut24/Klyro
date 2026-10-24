import assert from 'node:assert'
import { evaluateRegressionAlert, checkRegressionAlert } from './src/regressionAlert.js'
import { compareTestRuns } from './src/fixVerification.js'

console.log('--- Running Automated Regression Alert Foundation Tests ---')

console.log('Test 1: A saved report with new findings triggers an alert')
const reportWithNewFindings = {
  status: 'not_verified',
  summary: {
    resolved: 1,
    persistent: 0,
    new: 2,
    totalBaseline: 1,
    totalVerification: 2
  },
  newFindings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught TypeError in modal',
      description: 'Cannot read property show of undefined'
    },
    {
      type: 'HTTP_ERROR',
      severity: 'high',
      title: 'HTTP 500 on /api/auth',
      description: 'Server error during auth check'
    }
  ]
}

const res1 = evaluateRegressionAlert(reportWithNewFindings)
assert.strictEqual(res1.alertRequired, true)
assert.strictEqual(res1.hasRegression, true)
assert.strictEqual(res1.status, 'not_verified')
assert.strictEqual(res1.newFindingsCount, 2)
assert.strictEqual(res1.newCount, 2)
assert.strictEqual(res1.newFindings.length, 2)
assert(res1.reason.includes('Regression detected'))
assert(res1.reason.includes('2 new findings'))
console.log('Passed Test 1: Saved report with new findings triggers an alert.\n')

console.log('Test 2: A saved report with zero new findings does not trigger an alert')
const reportWithZeroNewFindings = {
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

const res2 = evaluateRegressionAlert(reportWithZeroNewFindings)
assert.strictEqual(res2.alertRequired, false)
assert.strictEqual(res2.hasRegression, false)
assert.strictEqual(res2.status, 'verified')
assert.strictEqual(res2.newFindingsCount, 0)
assert.strictEqual(res2.newCount, 0)
assert.strictEqual(res2.newFindings.length, 0)
assert.strictEqual(res2.reason, 'No regression detected: 0 new findings')
console.log('Passed Test 2: Saved report with zero new findings does not trigger alert.\n')

console.log('Test 3: A partially verified report with new findings is handled correctly')
const partialReportWithNew = {
  status: 'partially_verified',
  summary: {
    resolved: 1,
    persistent: 1,
    new: 1,
    totalBaseline: 2,
    totalVerification: 2
  },
  newFindings: [
    {
      type: 'CONSOLE_ERROR',
      severity: 'medium',
      title: 'Failed to load script resource',
      description: 'Script fetch error'
    }
  ]
}

const res3 = checkRegressionAlert(partialReportWithNew)
assert.strictEqual(res3.alertRequired, true)
assert.strictEqual(res3.hasRegression, true)
assert.strictEqual(res3.status, 'partially_verified')
assert.strictEqual(res3.newFindingsCount, 1)
assert.strictEqual(res3.newCount, 1)
assert.strictEqual(res3.newFindings.length, 1)
assert(res3.reason.includes('Regression detected'))
assert(res3.reason.includes('1 new finding'))
console.log('Passed Test 3: Partially verified report with new findings handled correctly.\n')

console.log('Test 4: A report with no new-finding data is handled safely')
const reportNoNewData = {
  status: 'no_baseline_findings'
}

const res4 = evaluateRegressionAlert(reportNoNewData)
assert.strictEqual(res4.alertRequired, false)
assert.strictEqual(res4.hasRegression, false)
assert.strictEqual(res4.status, 'no_baseline_findings')
assert.strictEqual(res4.newFindingsCount, 0)
assert.strictEqual(res4.newFindings.length, 0)
assert.strictEqual(res4.reason, 'No regression detected: 0 new findings')
console.log('Passed Test 4: Report with no new-finding data handled safely without throwing.\n')

console.log('Test 5: A missing report does not trigger an alert')
const missingInputs = [
  null,
  undefined,
  { verificationReport: null },
  { verificationReport: undefined }
]

for (const input of missingInputs) {
  const res5 = evaluateRegressionAlert(input)
  assert.strictEqual(res5.alertRequired, false)
  assert.strictEqual(res5.hasRegression, false)
  assert.strictEqual(res5.status, null)
  assert.strictEqual(res5.newFindingsCount, 0)
  assert.strictEqual(res5.newFindings.length, 0)
  assert.strictEqual(res5.reason, 'Verification report is missing')
}
console.log('Passed Test 5: Missing reports safely produce no alert and clean state.\n')

console.log('Test 6: A malformed report does not crash the utility')
const malformedInputs = [
  'not-an-object',
  12345,
  true,
  [],
  {},
  { foo: 'bar' },
  { status: 999, newFindings: 'not-array', summary: 'invalid' },
  { verificationReport: 'corrupt-string' }
]

for (const input of malformedInputs) {
  assert.doesNotThrow(() => {
    const res6 = evaluateRegressionAlert(input)
    assert.strictEqual(typeof res6, 'object')
    assert.strictEqual(typeof res6.alertRequired, 'boolean')
    assert.strictEqual(typeof res6.reason, 'string')
    assert.strictEqual(res6.alertRequired, false)
    assert.strictEqual(res6.newFindingsCount, 0)
  })
}
console.log('Passed Test 6: Malformed reports do not crash the utility.\n')

console.log('Test 7: The result contains accurate status, reason, and count information across formats')
const testRunWrapper = {
  _id: 'test-run-101',
  url: 'https://example.com',
  verificationReport: {
    status: 'not_verified',
    summary: {
      resolved: 0,
      persistent: 1,
      new: 3,
      totalBaseline: 1,
      totalVerification: 4
    },
    newFindings: [
      { title: 'New finding 1' },
      { title: 'New finding 2' },
      { title: 'New finding 3' }
    ]
  }
}

const res7 = evaluateRegressionAlert(testRunWrapper)
assert.strictEqual(res7.alertRequired, true)
assert.strictEqual(res7.status, 'not_verified')
assert.strictEqual(res7.newFindingsCount, 3)
assert.strictEqual(res7.newCount, 3)
assert.strictEqual(res7.newFindings.length, 3)
assert.strictEqual(res7.reason, 'Regression detected: 3 new findings introduced')

const legacySummaryOnly = {
  status: 'not_verified',
  summary: {
    new: 1
  }
}
const res7b = evaluateRegressionAlert(legacySummaryOnly)
assert.strictEqual(res7b.alertRequired, true)
assert.strictEqual(res7b.status, 'not_verified')
assert.strictEqual(res7b.newFindingsCount, 1)
assert.strictEqual(res7b.reason, 'Regression detected: 1 new finding introduced')
console.log('Passed Test 7: Accurate status, reason, and count information verified across formats.\n')

console.log('Test 8: End-to-end integration with compareTestRuns utility')
const baseline = {
  _id: 'b-1',
  findings: [
    {
      type: 'PAGE_ERROR',
      title: 'Original Error',
      description: 'Original description',
      evidence: { name: 'Error', message: 'Original' }
    }
  ]
}

const freshWithRegression = {
  _id: 'v-1',
  findings: [
    {
      type: 'HTTP_ERROR',
      title: 'Regression 404',
      description: 'New 404 error on /assets/app.js',
      evidence: { url: 'https://example.com/assets/app.js', status: 404 }
    }
  ]
}

const comparison = compareTestRuns(baseline, freshWithRegression)
const alertResult = evaluateRegressionAlert(comparison)
assert.strictEqual(alertResult.alertRequired, true)
assert.strictEqual(alertResult.status, 'partially_verified')
assert.strictEqual(alertResult.newFindingsCount, 1)
assert.strictEqual(alertResult.newFindings[0].title, 'Regression 404')

const freshClean = {
  _id: 'v-2',
  findings: []
}
const cleanComparison = compareTestRuns(baseline, freshClean)
const cleanAlertResult = evaluateRegressionAlert(cleanComparison)
assert.strictEqual(cleanAlertResult.alertRequired, false)
assert.strictEqual(cleanAlertResult.status, 'verified')
assert.strictEqual(cleanAlertResult.newFindingsCount, 0)
console.log('Passed Test 8: End-to-end integration with compareTestRuns verified.\n')

console.log('ALL AUTOMATED REGRESSION ALERT FOUNDATION TESTS PASSED!')
