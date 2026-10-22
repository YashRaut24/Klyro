import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'node:path'
import { runBrowser } from './browserRunner.js'
import { TestRun } from './models/TestRun.js'
import { analyzeFailures } from './failureAnalyzer.js'
import { analyzeWithGroq } from './aiProvider.js'
import { compareTestRuns } from './fixVerification.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'

const ensureFindings = (testRun) => {
  if (!testRun) return testRun
  const runObj = typeof testRun.toObject === 'function' ? testRun.toObject() : { ...testRun }
  if (Array.isArray(runObj.findings) && runObj.findings.length > 0) {
    return runObj
  }
  runObj.findings = analyzeFailures(runObj)
  return runObj
}

app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})

app.use('/screenshots', express.static(path.resolve('screenshots')))

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Klyro backend is running'
  })
})

app.post('/api/browser/run', async (req, res) => {
  const { url } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: 'A valid URL string is required'
    })
  }

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({
        error: 'Only HTTP and HTTPS URLs are supported'
      })
    }
  } catch {
    return res.status(400).json({
      error: 'Malformed URL provided'
    })
  }

  let result
  try {
    result = await runBrowser(url)
  } catch (error) {
    const message = error.message ? error.message.split('\n')[0] : 'Failed to navigate to website'
    return res.status(502).json({
      error: message
    })
  }

  try {
    const findings = analyzeFailures(result)
    const testRun = await TestRun.create({
      ...result,
      findings
    })
    return res.json(ensureFindings(testRun))
  } catch {
    return res.status(500).json({
      error: 'Failed to save test run'
    })
  }
})

app.get('/api/browser/runs', async (req, res) => {
  try {
    const runs = await TestRun.find().sort({ createdAt: -1 }).limit(50)
    return res.json(runs.map(ensureFindings))
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve test runs'
    })
  }
})

app.get('/api/browser/runs/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid test run ID'
    })
  }

  try {
    const testRun = await TestRun.findById(id)
    if (!testRun) {
      return res.status(404).json({
        error: 'Test run not found'
      })
    }
    return res.json(ensureFindings(testRun))
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve test run'
    })
  }
})

const handleAiAnalysis = async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid test run ID'
    })
  }

  try {
    const testRun = await TestRun.findById(id)
    if (!testRun) {
      return res.status(404).json({
        error: 'Test run not found'
      })
    }

    const runObj = ensureFindings(testRun)
    const aiAnalysis = await analyzeWithGroq(runObj)

    testRun.aiAnalysis = aiAnalysis
    await testRun.save()

    return res.json({
      testRunId: id,
      aiAnalysis
    })
  } catch (error) {
    if (error.code === 'MISSING_API_KEY') {
      return res.status(503).json({
        error: error.message,
        code: error.code
      })
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({
        error: error.message,
        code: error.code
      })
    }
    if (error.code === 'MALFORMED_RESPONSE') {
      return res.status(502).json({
        error: error.message,
        code: error.code
      })
    }
    return res.status(error.status || 500).json({
      error: error.message || 'Failed to complete AI analysis',
      code: error.code || 'AI_ANALYSIS_FAILED'
    })
  }
}

app.post('/api/browser/runs/:id/ai-analysis', handleAiAnalysis)
app.post('/api/browser/runs/:id/analyze', handleAiAnalysis)

const inFlightVerifications = new Set()

const handleVerifyRun = async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid test run ID'
    })
  }

  if (inFlightVerifications.has(id)) {
    return res.status(409).json({
      error: 'Verification is already in progress for this test run'
    })
  }

  inFlightVerifications.add(id)

  try {
    const baselineRun = await TestRun.findById(id)
    if (!baselineRun) {
      return res.status(404).json({
        error: 'Test run not found'
      })
    }

    const baselineObj = ensureFindings(baselineRun)

    let freshResult
    try {
      freshResult = await runBrowser(baselineRun.url)
    } catch (error) {
      const message = error.message ? error.message.split('\n')[0] : 'Failed to navigate to website'
      return res.status(502).json({
        error: message
      })
    }

    let freshTestRun
    try {
      const freshFindings = analyzeFailures(freshResult)
      freshTestRun = await TestRun.create({
        ...freshResult,
        findings: freshFindings,
        baselineRunId: id
      })
    } catch {
      return res.status(500).json({
        error: 'Failed to save verification test run'
      })
    }

    const comparison = compareTestRuns(baselineObj, freshTestRun)
    const verificationReport = {
      ...comparison,
      verifiedAt: new Date().toISOString()
    }

    try {
      baselineRun.verificationReport = verificationReport
      await baselineRun.save()
    } catch {
      return res.status(500).json({
        error: 'Failed to persist verification report'
      })
    }

    return res.json({
      baselineRunId: id,
      verificationRunId: freshTestRun._id.toString(),
      verificationReport,
      verification: verificationReport
    })
  } catch {
    return res.status(500).json({
      error: 'Failed to complete verification'
    })
  } finally {
    inFlightVerifications.delete(id)
  }
}

app.post('/api/browser/runs/:id/verify', handleVerifyRun)

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log(`Connected to MongoDB at ${MONGODB_URI}`)
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/server.js')) {
  startServer()
}

export { app, handleVerifyRun, inFlightVerifications, startServer }

