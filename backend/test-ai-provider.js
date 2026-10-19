import { analyzeWithGroq } from './src/aiProvider.js'
import assert from 'node:assert'

console.log('--- Running AI Provider (Groq) Integration Tests ---')

const sampleFindings = [
  {
    type: 'PAGE_ERROR',
    severity: 'high',
    title: 'Uncaught TypeError',
    description: 'Cannot read properties of undefined',
    evidence: { name: 'TypeError', message: 'Cannot read properties of undefined' }
  }
]

console.log('Test 1: Valid structured output from mock Groq provider')
let clientCalls = 0
const validMockClient = {
  chat: {
    completions: {
      create: async (params) => {
        clientCalls++
        assert(params.model, 'Model specified in request')
        assert(params.messages?.length >= 2, 'System and user messages provided')
        assert.strictEqual(params.response_format?.type, 'json_object', 'JSON object mode enabled')
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  explanation: 'A JavaScript runtime TypeError occurred because an undefined object was accessed.',
                  remediations: [
                    {
                      summary: 'Add optional chaining',
                      suggestion: 'Use optional chaining (?.) or defensive null checks before property access.'
                    }
                  ]
                })
              }
            }
          ]
        }
      }
    }
  }
}

const validResult = await analyzeWithGroq(sampleFindings, {
  client: validMockClient,
  model: 'llama-3.3-70b-versatile'
})

assert.strictEqual(clientCalls, 1, 'Mock client was called once')
assert.strictEqual(validResult.status, 'analyzed')
assert.strictEqual(validResult.model, 'llama-3.3-70b-versatile')
assert(validResult.explanation.includes('TypeError'), 'Explanation preserves error context')
assert.strictEqual(validResult.remediations.length, 1)
assert.strictEqual(validResult.remediations[0].summary, 'Add optional chaining')
assert(validResult.remediations[0].suggestion.includes('optional chaining'))
assert.strictEqual(validResult.findingsCount, 1)
assert(validResult.analyzedAt, 'Timestamp recorded')
console.log('Passed Test 1: Valid structured JSON handled and mapped properly.\n')

console.log('Test 2: Malformed output handling')
const malformedJsonClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{ message: { content: 'not valid json at all' } }]
      })
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: malformedJsonClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'MALFORMED_RESPONSE')
    assert.strictEqual(err.status, 502)
    return true
  }
)

const missingExplanationClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{ message: { content: JSON.stringify({ remediations: [] }) } }]
      })
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: missingExplanationClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'MALFORMED_RESPONSE')
    return true
  }
)

const emptyContentClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{ message: { content: '' } }]
      })
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: emptyContentClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'MALFORMED_RESPONSE')
    return true
  }
)
console.log('Passed Test 2: Malformed responses caught with MALFORMED_RESPONSE code.\n')

console.log('Test 3: Missing configuration handling')
const originalKey = process.env.GROQ_API_KEY
delete process.env.GROQ_API_KEY
try {
  await assert.rejects(
    async () => {
      await analyzeWithGroq(sampleFindings, { apiKey: '' })
    },
    (err) => {
      assert.strictEqual(err.code, 'MISSING_API_KEY')
      assert.strictEqual(err.status, 503)
      return true
    }
  )
} finally {
  if (originalKey) {
    process.env.GROQ_API_KEY = originalKey
  }
}
console.log('Passed Test 3: Missing API key caught with 503 MISSING_API_KEY.\n')

console.log('Test 4: Provider errors handling')
const rateLimitClient = {
  chat: {
    completions: {
      create: async () => {
        const error = new Error('Rate limit exceeded')
        error.status = 429
        throw error
      }
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: rateLimitClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'RATE_LIMIT')
    assert.strictEqual(err.status, 429)
    return true
  }
)

const authErrorClient = {
  chat: {
    completions: {
      create: async () => {
        const error = new Error('Invalid API key')
        error.status = 401
        throw error
      }
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: authErrorClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'AUTH_ERROR')
    return true
  }
)

const generalErrorClient = {
  chat: {
    completions: {
      create: async () => {
        throw new Error('Connection timeout')
      }
    }
  }
}
await assert.rejects(
  async () => {
    await analyzeWithGroq(sampleFindings, { client: generalErrorClient })
  },
  (err) => {
    assert.strictEqual(err.code, 'PROVIDER_ERROR')
    assert.strictEqual(err.status, 502)
    return true
  }
)
console.log('Passed Test 4: Provider rate limits, auth errors, and failures mapped gracefully.\n')

console.log('Test 5: Empty findings handling')
let emptyClientCalled = false
const unusedClient = {
  chat: {
    completions: {
      create: async () => {
        emptyClientCalled = true
        return {}
      }
    }
  }
}

const emptyResult = await analyzeWithGroq([], { client: unusedClient })
assert.strictEqual(emptyClientCalled, false, 'Client should not be invoked for clean run with 0 findings')
assert.strictEqual(emptyResult.status, 'clean')
assert.strictEqual(emptyResult.remediations.length, 0)
assert(emptyResult.explanation.includes('No failure findings detected'))
console.log('Passed Test 5: Clean runs with empty findings return clean state without calling provider.\n')

console.log('ALL AI PROVIDER (GROQ) TESTS PASSED!')
