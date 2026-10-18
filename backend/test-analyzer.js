import { analyzeFailures } from './src/failureAnalyzer.js'
import assert from 'node:assert'

console.log('--- Running Failure Analyzer Tests ---')

console.log('Test 1: Test run with all four evidence categories')
const fullRun = {
  url: 'https://example.com',
  pageErrors: [
    { name: 'TypeError', message: 'Cannot read properties of undefined (reading "map")' }
  ],
  httpErrors: [
    { url: 'https://example.com/api/data', status: 500, statusText: 'Internal Server Error' }
  ],
  failedRequests: [
    { url: 'https://example.com/analytics.js', method: 'GET', failure: 'net::ERR_CONNECTION_REFUSED' }
  ],
  consoleErrors: [
    { text: 'Uncaught in promise: failed to load user profile', location: { url: 'https://example.com/main.js', lineNumber: 42, columnNumber: 15 } }
  ]
}

const fullFindings = analyzeFailures(fullRun)
assert.strictEqual(fullFindings.length, 4, 'Should produce exactly 4 findings')

const pageFinding = fullFindings.find(f => f.type === 'PAGE_ERROR')
assert(pageFinding, 'Page error finding exists')
assert.strictEqual(pageFinding.severity, 'high')
assert(pageFinding.title.includes('TypeError'))
assert(pageFinding.description.includes('Cannot read properties of undefined'))
assert.strictEqual(pageFinding.evidence.name, 'TypeError')

const httpFinding = fullFindings.find(f => f.type === 'HTTP_ERROR')
assert(httpFinding, 'HTTP error finding exists')
assert.strictEqual(httpFinding.severity, 'high')
assert(httpFinding.title.includes('500'))
assert(httpFinding.description.includes('https://example.com/api/data'))
assert.strictEqual(httpFinding.evidence.status, 500)

const reqFinding = fullFindings.find(f => f.type === 'FAILED_REQUEST')
assert(reqFinding, 'Failed request finding exists')
assert.strictEqual(reqFinding.severity, 'high')
assert(reqFinding.title.includes('GET'))
assert(reqFinding.description.includes('net::ERR_CONNECTION_REFUSED'))
assert.strictEqual(reqFinding.evidence.failure, 'net::ERR_CONNECTION_REFUSED')

const consoleFinding = fullFindings.find(f => f.type === 'CONSOLE_ERROR')
assert(consoleFinding, 'Console error finding exists')
assert.strictEqual(consoleFinding.severity, 'medium')
assert(consoleFinding.description.includes('https://example.com/main.js:42:15'))
assert.strictEqual(consoleFinding.evidence.text, 'Uncaught in promise: failed to load user profile')

console.log('Passed Test 1: All 4 categories correctly analyzed with type, severity, title, description, and evidence.\n')

console.log('Test 2: Test run with empty evidence arrays')
const emptyRun = {
  url: 'https://example.com',
  pageErrors: [],
  httpErrors: [],
  failedRequests: [],
  consoleErrors: []
}
const emptyFindings = analyzeFailures(emptyRun)
assert.strictEqual(emptyFindings.length, 0, 'Should return an empty array for clean runs')
console.log('Passed Test 2: Clean runs return empty findings array.\n')

console.log('Test 3: Missing or optional evidence fields')
const missingFieldsRun = {
  url: 'https://example.com',
  pageErrors: [{ message: 'Generic error with missing name' }],
  httpErrors: [{ url: 'https://example.com/missing' }],
  failedRequests: [{ url: 'https://example.com/asset.png' }],
  consoleErrors: [{ text: 'Console error without location' }]
}
const missingFindings = analyzeFailures(missingFieldsRun)
assert.strictEqual(missingFindings.length, 4, 'Should handle missing optional fields safely')
assert.strictEqual(missingFindings[0].title, 'Uncaught Error')
assert.strictEqual(missingFindings[1].severity, 'medium')
assert(missingFindings[2].title.includes('GET'))
assert(!missingFindings[3].description.includes('undefined'))

assert.deepStrictEqual(analyzeFailures(null), [], 'Handles null')
assert.deepStrictEqual(analyzeFailures(undefined), [], 'Handles undefined')
assert.deepStrictEqual(analyzeFailures({}), [], 'Handles empty object')
console.log('Passed Test 3: Missing and optional fields handled safely without exceptions.\n')

console.log('Test 4: Multiple distinct errors per category')
const multipleRun = {
  pageErrors: [
    { name: 'ReferenceError', message: 'foo is not defined' },
    { name: 'SyntaxError', message: 'Unexpected token' }
  ],
  httpErrors: [
    { url: 'https://example.com/api/1', status: 404, statusText: 'Not Found' },
    { url: 'https://example.com/api/2', status: 503, statusText: 'Service Unavailable' }
  ]
}
const multipleFindings = analyzeFailures(multipleRun)
assert.strictEqual(multipleFindings.length, 4, 'Should produce 4 distinct findings for multiple distinct errors')
assert.strictEqual(multipleFindings.filter(f => f.type === 'PAGE_ERROR').length, 2)
assert.strictEqual(multipleFindings.filter(f => f.type === 'HTTP_ERROR').length, 2)
assert.strictEqual(multipleFindings.find(f => f.evidence.status === 404).severity, 'medium')
assert.strictEqual(multipleFindings.find(f => f.evidence.status === 503).severity, 'high')
console.log('Passed Test 4: Multiple distinct errors analyzed with category and severity logic.\n')

console.log('Test 5: Deduplication of identical evidence items')
const duplicateRun = {
  pageErrors: [
    { name: 'TypeError', message: 'Duplicate error' },
    { name: 'TypeError', message: 'Duplicate error' }
  ],
  httpErrors: [
    { url: 'https://example.com/api/dup', status: 404 },
    { url: 'https://example.com/api/dup', status: 404 }
  ],
  failedRequests: [
    { url: 'https://example.com/net', method: 'GET', failure: 'net::ERR_FAILED' },
    { url: 'https://example.com/net', method: 'GET', failure: 'net::ERR_FAILED' }
  ],
  consoleErrors: [
    { text: 'Same console message' },
    { text: 'Same console message' }
  ]
}
const dedupeFindings = analyzeFailures(duplicateRun)
assert.strictEqual(dedupeFindings.length, 4, 'Should deduplicate identical items into exactly 4 findings')
console.log('Passed Test 5: Identical evidence items successfully deduplicated.\n')

console.log('ALL FAILURE ANALYZER VERIFICATIONS PASSED!')
