import { prepareAiAnalysisInput } from './src/aiFailureAnalyzer.js'
import assert from 'node:assert'

console.log('--- Running AI Failure Analyzer Input Foundation Tests ---')

console.log('Test 1: Normal input with findings and context')
const sampleFindings = [
  {
    type: 'PAGE_ERROR',
    severity: 'high',
    title: 'Uncaught TypeError',
    description: 'Cannot read properties of undefined',
    evidence: { name: 'TypeError', message: 'Cannot read properties of undefined' }
  },
  {
    type: 'HTTP_ERROR',
    severity: 'medium',
    title: 'HTTP 404 Error Response',
    description: 'Request returned 404',
    evidence: { url: 'https://example.com/api', status: 404, statusText: 'Not Found' }
  },
  {
    type: 'FAILED_REQUEST',
    severity: 'high',
    title: 'Failed Network Request: GET',
    description: 'GET request failed',
    evidence: { url: 'https://example.com/asset.js', method: 'GET', failure: 'net::ERR_FAILED' }
  },
  {
    type: 'CONSOLE_ERROR',
    severity: 'medium',
    title: 'Console Error',
    description: 'Console error logged',
    evidence: { text: 'Some console error', location: { url: 'main.js', line: 10 } }
  }
]

const sampleContext = {
  url: 'https://example.com',
  finalUrl: 'https://example.com/home',
  title: 'Example Page',
  status: 200,
  screenshot: 'screenshots/shot-123.png',
  _id: '6ad4f6533332272f26ca7e9a',
  __v: 0
}

const result1 = prepareAiAnalysisInput(sampleFindings, sampleContext)

assert.strictEqual(result1.target.url, 'https://example.com')
assert.strictEqual(result1.target.finalUrl, 'https://example.com/home')
assert.strictEqual(result1.target.title, 'Example Page')
assert.strictEqual(result1.target.status, 200)

assert.strictEqual(result1.screenshot, undefined)
assert.strictEqual(result1._id, undefined)
assert.strictEqual(result1.__v, undefined)

assert.strictEqual(result1.summary.totalFindings, 4)
assert.strictEqual(result1.summary.bySeverity.high, 2)
assert.strictEqual(result1.summary.bySeverity.medium, 2)
assert.strictEqual(result1.summary.bySeverity.low, 0)

assert.strictEqual(result1.findings.length, 4)
assert.strictEqual(result1.findings[0].type, 'PAGE_ERROR')
assert.strictEqual(result1.findings[0].severity, 'high')
assert.strictEqual(result1.findings[0].title, 'Uncaught TypeError')
assert.strictEqual(result1.findings[0].description, 'Cannot read properties of undefined')
assert.deepStrictEqual(result1.findings[0].evidence, { name: 'TypeError', message: 'Cannot read properties of undefined' })

console.log('Passed Test 1: Normal input correctly transformed with preserved evidence and compact structure.\n')

console.log('Test 2: Empty findings')
const result2 = prepareAiAnalysisInput([], { url: 'https://example.com', status: 200 })
assert.strictEqual(result2.findings.length, 0)
assert.strictEqual(result2.summary.totalFindings, 0)
assert.strictEqual(result2.summary.bySeverity.high, 0)
assert.strictEqual(result2.summary.bySeverity.medium, 0)
assert.strictEqual(result2.summary.bySeverity.low, 0)
assert.strictEqual(result2.target.url, 'https://example.com')
console.log('Passed Test 2: Empty findings produce clean empty-state payload.\n')

console.log('Test 3: Null, undefined, and empty object inputs')
const nullResult = prepareAiAnalysisInput(null)
assert.strictEqual(nullResult.findings.length, 0)
assert.strictEqual(nullResult.summary.totalFindings, 0)
assert.strictEqual(nullResult.target.url, null)

const undefResult = prepareAiAnalysisInput(undefined)
assert.strictEqual(undefResult.findings.length, 0)
assert.strictEqual(undefResult.summary.totalFindings, 0)

const emptyObjResult = prepareAiAnalysisInput({})
assert.strictEqual(emptyObjResult.findings.length, 0)
assert.strictEqual(emptyObjResult.summary.totalFindings, 0)
console.log('Passed Test 3: Null, undefined, and empty objects handled safely without throwing.\n')

console.log('Test 4: Missing optional fields in findings')
const incompleteFindings = [
  { type: 'PAGE_ERROR' },
  { severity: 'high', title: 'Only Title' },
  { description: 'Only Description' },
  null,
  undefined
]
const result4 = prepareAiAnalysisInput(incompleteFindings)
assert.strictEqual(result4.findings.length, 3)
assert.strictEqual(result4.findings[0].severity, 'low')
assert.strictEqual(result4.findings[0].title, 'Untitled Finding')
assert.strictEqual(result4.findings[0].evidence, null)
assert.strictEqual(result4.findings[1].type, 'UNKNOWN')
assert.strictEqual(result4.findings[1].severity, 'high')
assert.strictEqual(result4.findings[2].type, 'UNKNOWN')
console.log('Passed Test 4: Missing optional fields safely defaulted.\n')

console.log('Test 5: Immutability (does not mutate arguments)')
const inputFindings = [
  {
    type: 'PAGE_ERROR',
    severity: 'high',
    title: 'Original Title',
    description: 'Original Desc',
    evidence: { error: 'Original Error' }
  }
]
const inputContext = {
  url: 'https://original.com',
  status: 200
}

const beforeFindingsJson = JSON.stringify(inputFindings)
const beforeContextJson = JSON.stringify(inputContext)

const result5 = prepareAiAnalysisInput(inputFindings, inputContext)

result5.target.url = 'https://mutated.com'
result5.findings[0].title = 'Mutated Title'
result5.findings[0].evidence.error = 'Mutated Error'
result5.findings.push({ type: 'EXTRA' })

assert.strictEqual(JSON.stringify(inputFindings), beforeFindingsJson, 'Original input findings must remain unchanged')
assert.strictEqual(JSON.stringify(inputContext), beforeContextJson, 'Original input context must remain unchanged')
console.log('Passed Test 5: Input transformation guarantees immutability.\n')

console.log('Test 6: Unified testRun object signature')
const testRunObject = {
  url: 'https://example.com',
  finalUrl: 'https://example.com/dest',
  title: 'Test Run Page',
  status: 500,
  findings: [
    {
      type: 'HTTP_ERROR',
      severity: 'high',
      title: 'HTTP 500 Error Response',
      description: 'Server returned 500',
      evidence: { status: 500 }
    }
  ],
  screenshot: 'screenshots/shot.png'
}

const result6 = prepareAiAnalysisInput(testRunObject)
assert.strictEqual(result6.target.url, 'https://example.com')
assert.strictEqual(result6.target.status, 500)
assert.strictEqual(result6.summary.totalFindings, 1)
assert.strictEqual(result6.summary.bySeverity.high, 1)
assert.strictEqual(result6.findings[0].type, 'HTTP_ERROR')
assert.strictEqual(result6.screenshot, undefined)
console.log('Passed Test 6: Unified testRun object signature works seamlessly.\n')

console.log('ALL AI FAILURE ANALYZER INPUT FOUNDATION TESTS PASSED!')
