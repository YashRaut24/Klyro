import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'node:path'
import { runBrowser } from './browserRunner.js'
import { TestRun } from './models/TestRun.js'
import { analyzeFailures } from './failureAnalyzer.js'

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

startServer()
