import assert from 'node:assert/strict'
import express from 'express'
import { createRateLimiter } from './src/rateLimiter.js'
import { securityHeaders } from './src/securityMiddleware.js'

const app = express()
const generalLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 })
const resourceLimiter = createRateLimiter({ limit: 2, windowMs: 60_000 })

app.use(securityHeaders)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})
app.use('/api', generalLimiter)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})
app.post('/api/browser/run', resourceLimiter, (req, res) => {
  res.json({ status: 'accepted' })
})
app.post('/api/ai-analysis', resourceLimiter, (req, res) => {
  res.json({ status: 'accepted' })
})

let server

try {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const firstResourceResponse = await fetch(`${baseUrl}/api/browser/run`, { method: 'POST' })
  const secondResourceResponse = await fetch(`${baseUrl}/api/ai-analysis`, { method: 'POST' })
  assert.strictEqual(firstResourceResponse.status, 200, 'First resource request succeeds')
  assert.strictEqual(secondResourceResponse.status, 200, 'Second resource request succeeds')

  const limitedResourceResponse = await fetch(`${baseUrl}/api/browser/run`, { method: 'POST' })
  assert.strictEqual(limitedResourceResponse.status, 429, 'Resource limit is enforced')
  assert.deepStrictEqual(await limitedResourceResponse.json(), {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED'
  })
  assert.match(limitedResourceResponse.headers.get('retry-after'), /^\d+$/)
  assert(Number(limitedResourceResponse.headers.get('retry-after')) > 0)
  assert(Number(limitedResourceResponse.headers.get('retry-after')) <= 60)
  assert.strictEqual(limitedResourceResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.strictEqual(limitedResourceResponse.headers.get('x-frame-options'), 'DENY')
  assert.strictEqual(limitedResourceResponse.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.strictEqual(limitedResourceResponse.headers.get('x-permitted-cross-domain-policies'), 'none')
  assert.strictEqual(limitedResourceResponse.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  console.log('Passed: resource requests below the shared resource limit succeed.')
  console.log('Passed: excess resource request returns 429 JSON, Retry-After, and security headers.')

  const firstHealthResponse = await fetch(`${baseUrl}/api/health`)
  const secondHealthResponse = await fetch(`${baseUrl}/api/health`)
  const thirdHealthResponse = await fetch(`${baseUrl}/api/health`)
  assert.strictEqual(firstHealthResponse.status, 200)
  assert.strictEqual(secondHealthResponse.status, 200)
  assert.strictEqual(thirdHealthResponse.status, 429, 'General API limit is enforced independently')
  assert.deepStrictEqual(await thirdHealthResponse.json(), {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED'
  })
  assert.match(thirdHealthResponse.headers.get('retry-after'), /^\d+$/)
  assert(Number(thirdHealthResponse.headers.get('retry-after')) > 0)
  assert(Number(thirdHealthResponse.headers.get('retry-after')) <= 60)
  console.log('Passed: general API limit is enforced independently from resource limit.')

  const preflightResponse = await fetch(`${baseUrl}/api/browser/run`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  })
  assert.strictEqual(preflightResponse.status, 204, 'CORS preflight is not rate-limited')
  assert.strictEqual(preflightResponse.headers.get('access-control-allow-origin'), '*')
  assert.strictEqual(preflightResponse.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
  assert.strictEqual(preflightResponse.headers.get('x-content-type-options'), 'nosniff')
  console.log('Passed: CORS preflight remains intact and retains security headers.')

  console.log('ALL RATE LIMITING TESTS PASSED!')
} finally {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}
