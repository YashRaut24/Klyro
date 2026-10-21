import assert from 'node:assert'
import { compareTestRuns } from './src/fixVerification.js'

console.log('--- Running Test Run Comparison Foundation Tests ---')

console.log('Test 1: All original findings resolved')
const baseline1 = {
  _id: 'baseline-run-1',
  url: 'https://example.com',
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught TypeError',
      description: 'Cannot read properties of undefined',
      evidence: { name: 'TypeError', message: 'Cannot read properties of undefined' }
    },
    {
      type: 'HTTP_ERROR',
      severity: 'high',
      title: 'HTTP 500 Error Response',
      description: 'Server error on /api/items',
      evidence: { url: 'https://example.com/api/items', status: 500 }
    }
  ]
}
const verification1 = {
  _id: 'verification-run-1',
  url: 'https://example.com',
  findings: []
}

const result1 = compareTestRuns(baseline1, verification1)
assert.strictEqual(result1.baselineRunId, 'baseline-run-1')
assert.strictEqual(result1.verificationRunId, 'verification-run-1')
assert.strictEqual(result1.status, 'verified')
assert.strictEqual(result1.summary.resolved, 2)
assert.strictEqual(result1.summary.persistent, 0)
assert.strictEqual(result1.summary.new, 0)
assert.strictEqual(result1.resolvedFindings.length, 2)
assert.strictEqual(result1.persistentFindings.length, 0)
assert.strictEqual(result1.newFindings.length, 0)
console.log('Passed Test 1: All original findings resolved yields verified status.\n')

console.log('Test 2: A finding persists')
const baseline2 = {
  _id: 'run-b2',
  findings: [
    {
      type: 'FAILED_REQUEST',
      severity: 'high',
      title: 'Failed Network Request: GET',
      description: 'GET request to https://example.com/api/user failed',
      evidence: { url: 'https://example.com/api/user', method: 'GET', failure: 'net::ERR_CONNECTION_REFUSED' }
    }
  ]
}
const verification2 = {
  _id: 'run-v2',
  findings: [
    {
      type: 'FAILED_REQUEST',
      severity: 'high',
      title: 'Failed Network Request: GET',
      description: 'GET request to https://example.com/api/user failed',
      evidence: { url: 'https://example.com/api/user', method: 'GET', failure: 'net::ERR_CONNECTION_REFUSED' }
    }
  ]
}

const result2 = compareTestRuns(baseline2, verification2)
assert.strictEqual(result2.status, 'not_verified')
assert.strictEqual(result2.summary.resolved, 0)
assert.strictEqual(result2.summary.persistent, 1)
assert.strictEqual(result2.summary.new, 0)
assert.strictEqual(result2.persistentFindings.length, 1)
assert.strictEqual(result2.persistentFindings[0].evidence.url, 'https://example.com/api/user')
console.log('Passed Test 2: Persistent finding yields not_verified status.\n')

console.log('Test 3: A new finding appears')
const baseline3 = {
  _id: 'run-b3',
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught ReferenceError',
      description: 'foo is not defined',
      evidence: { name: 'ReferenceError', message: 'foo is not defined' }
    }
  ]
}
const verification3 = {
  _id: 'run-v3',
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Uncaught ReferenceError',
      description: 'foo is not defined',
      evidence: { name: 'ReferenceError', message: 'foo is not defined' }
    },
    {
      type: 'HTTP_ERROR',
      severity: 'medium',
      title: 'HTTP 404 Error Response',
      description: 'Request to /missing returned 404',
      evidence: { url: 'https://example.com/missing', status: 404 }
    }
  ]
}

const result3 = compareTestRuns(baseline3, verification3)
assert.strictEqual(result3.status, 'not_verified')
assert.strictEqual(result3.summary.resolved, 0)
assert.strictEqual(result3.summary.persistent, 1)
assert.strictEqual(result3.summary.new, 1)
assert.strictEqual(result3.newFindings.length, 1)
assert.strictEqual(result3.newFindings[0].type, 'HTTP_ERROR')
console.log('Passed Test 3: New finding without resolution yields not_verified status.\n')

console.log('Test 4: A mix of resolved, persistent, and new findings')
const baseline4 = {
  _id: 'run-b4',
  findings: [
    {
      type: 'PAGE_ERROR',
      severity: 'high',
      title: 'Error A',
      description: 'Original bug A',
      evidence: { name: 'TypeError', message: 'x is null' }
    },
    {
      type: 'CONSOLE_ERROR',
      severity: 'medium',
      title: 'Console Warning',
      description: 'Deprecated API called',
      evidence: { text: 'Deprecated API', location: { url: 'https://example.com/app.js', lineNumber: 10 } }
    }
  ]
}
const verification4 = {
  _id: 'run-v4',
  findings: [
    {
      type: 'CONSOLE_ERROR',
      severity: 'medium',
      title: 'Console Warning',
      description: 'Deprecated API called',
      evidence: { text: 'Deprecated API', location: { url: 'https://example.com/app.js', lineNumber: 10 } }
    },
    {
      type: 'HTTP_ERROR',
      severity: 'high',
      title: 'HTTP 502 Bad Gateway',
      description: 'Gateway failure',
      evidence: { url: 'https://example.com/gateway', status: 502 }
    }
  ]
}

const result4 = compareTestRuns(baseline4, verification4)
assert.strictEqual(result4.status, 'partially_verified')
assert.strictEqual(result4.summary.resolved, 1)
assert.strictEqual(result4.summary.persistent, 1)
assert.strictEqual(result4.summary.new, 1)
assert.strictEqual(result4.resolvedFindings[0].evidence.message, 'x is null')
assert.strictEqual(result4.persistentFindings[0].evidence.text, 'Deprecated API')
assert.strictEqual(result4.newFindings[0].evidence.status, 502)
console.log('Passed Test 4: Mixed resolution and persistence yields partially_verified status.\n')

console.log('Test 5: An original run with no findings')
const cleanBaseline = { _id: 'clean-b', findings: [] }
const cleanVerification = { _id: 'clean-v', findings: [] }
const resultClean = compareTestRuns(cleanBaseline, cleanVerification)
assert.strictEqual(resultClean.status, 'no_baseline_findings')
assert.strictEqual(resultClean.summary.resolved, 0)
assert.strictEqual(resultClean.summary.persistent, 0)
assert.strictEqual(resultClean.summary.new, 0)

const regressionVerification = {
  _id: 'reg-v',
  findings: [{ type: 'PAGE_ERROR', title: 'New Error', description: 'desc', evidence: { name: 'Error', message: 'boom' } }]
}
const resultCleanWithNew = compareTestRuns(cleanBaseline, regressionVerification)
assert.strictEqual(resultCleanWithNew.status, 'no_baseline_findings')
assert.strictEqual(resultCleanWithNew.summary.new, 1)
console.log('Passed Test 5: Clean baseline correctly classified as no_baseline_findings.\n')

console.log('Test 6: Missing, null, or empty findings')
assert.strictEqual(compareTestRuns(null, null).status, 'no_baseline_findings')
assert.strictEqual(compareTestRuns(undefined, undefined).status, 'no_baseline_findings')
assert.strictEqual(compareTestRuns({}, {}).status, 'no_baseline_findings')
assert.strictEqual(compareTestRuns({ findings: null }, { findings: undefined }).status, 'no_baseline_findings')
assert.strictEqual(compareTestRuns({ findings: 'invalid' }, { findings: 42 }).status, 'no_baseline_findings')

const rawArrayCompare = compareTestRuns(
  [{ type: 'PAGE_ERROR', title: 'Raw array test', description: 'testing raw array', evidence: { name: 'E', message: 'm' } }],
  []
)
assert.strictEqual(rawArrayCompare.status, 'verified')
assert.strictEqual(rawArrayCompare.summary.resolved, 1)
console.log('Passed Test 6: Missing, null, empty, and raw array inputs handled safely.\n')

console.log('Test 7: Duplicate findings and deterministic matching')
const duplicateBaseline = {
  findings: [
    { type: 'HTTP_ERROR', title: 'HTTP 404', description: '404', evidence: { url: 'https://example.com/img.png', status: 404 } },
    { type: 'HTTP_ERROR', title: 'HTTP 404', description: '404', evidence: { url: 'https://example.com/img.png', status: 404 } },
    { type: 'CUSTOM_TYPE', title: 'Missing Label', description: 'Form input missing aria label' }
  ]
}
const singleVerification = {
  findings: [
    { type: 'HTTP_ERROR', title: 'HTTP 404', description: '404', evidence: { url: 'https://example.com/img.png', status: 404 } },
    { type: 'CUSTOM_TYPE', title: 'missing label', description: 'form input missing aria label' }
  ]
}

const result7 = compareTestRuns(duplicateBaseline, singleVerification)
assert.strictEqual(result7.summary.totalBaseline, 2)
assert.strictEqual(result7.summary.persistent, 2)
assert.strictEqual(result7.summary.resolved, 0)
assert.strictEqual(result7.status, 'not_verified')

const fallbackBaseline = {
  findings: [{ type: 'RULE_BREACH', title: 'Low Contrast', description: 'Button text has insufficient contrast ratio' }]
}
const fallbackVerification = { findings: [] }
const fallbackResult = compareTestRuns(fallbackBaseline, fallbackVerification)
assert.strictEqual(fallbackResult.status, 'verified')
assert.strictEqual(fallbackResult.resolvedFindings.length, 1)
console.log('Passed Test 7: Duplicate findings deduplicated and fallback matching functions deterministically.\n')

console.log('Test 8: Input objects are not mutated')
const immutableBaseline = {
  _id: 'imm-b',
  findings: [
    {
      type: 'PAGE_ERROR',
      title: 'Immutable Test',
      description: 'Original text',
      evidence: { name: 'Error', message: 'test' }
    }
  ]
}
const immutableVerification = {
  _id: 'imm-v',
  findings: [
    {
      type: 'PAGE_ERROR',
      title: 'Immutable Test',
      description: 'Original text',
      evidence: { name: 'Error', message: 'test' }
    }
  ]
}

const baselineJsonBefore = JSON.stringify(immutableBaseline)
const verificationJsonBefore = JSON.stringify(immutableVerification)

const comparisonResult = compareTestRuns(immutableBaseline, immutableVerification)
comparisonResult.persistentFindings[0].title = 'MUTATED TITLE'
comparisonResult.persistentFindings[0].evidence.message = 'MUTATED EVIDENCE'
comparisonResult.summary.persistent = 999
comparisonResult.status = 'MUTATED'

assert.strictEqual(JSON.stringify(immutableBaseline), baselineJsonBefore, 'Baseline run must not be mutated')
assert.strictEqual(JSON.stringify(immutableVerification), verificationJsonBefore, 'Verification run must not be mutated')
console.log('Passed Test 8: Input objects remain strictly immutable.\n')

console.log('ALL FIX VERIFICATION COMPARISON TESTS PASSED!')
