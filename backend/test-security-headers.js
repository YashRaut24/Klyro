import assert from 'node:assert/strict'
import express from 'express'
import { handleServerError, securityHeaders } from './src/securityMiddleware.js'

const app = express()
app.use(securityHeaders)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})
app.get('/internal-error', (req, res, next) => {
  const error = new Error('SECRET_MARKER C:\\private\\database\\connection stack details')
  next(error)
})
app.use(handleServerError)

let server

try {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const ordinaryResponse = await fetch(`${baseUrl}/api/health`)
  assert.strictEqual(ordinaryResponse.status, 200)
  assert.deepStrictEqual(await ordinaryResponse.json(), { status: 'ok' })

  const expectedHeaders = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-permitted-cross-domain-policies': 'none',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  }

  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert.strictEqual(ordinaryResponse.headers.get(name), value, `${name} header is set`)
  }
  assert.strictEqual(ordinaryResponse.headers.get('x-powered-by'), null)

  const errorResponse = await fetch(`${baseUrl}/internal-error`)
  assert.strictEqual(errorResponse.status, 500)
  assert.match(errorResponse.headers.get('content-type'), /^application\/json/)
  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert.strictEqual(errorResponse.headers.get(name), value, `${name} header is set on errors`)
  }
  const errorBody = await errorResponse.text()
  assert.deepStrictEqual(JSON.parse(errorBody), { error: 'Internal server error' })
  assert(!errorBody.includes('SECRET_MARKER'))
  assert(!errorBody.includes('C:\\private\\database\\connection'))
  assert(!/\bat\s+\S+/.test(errorBody))

  console.log('Passed: ordinary API response includes all required security headers.')
  console.log('Passed: unexpected error returns generic JSON without internal details.')
  console.log('ALL SECURITY HEADER AND ERROR RESPONSE TESTS PASSED!')
} finally {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}
