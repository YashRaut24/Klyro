import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'node:path'
import { runBrowser } from './browserRunner.js'
import { TestRun } from './models/TestRun.js'
import { ScheduledTest } from './models/ScheduledTest.js'
import { analyzeFailures } from './failureAnalyzer.js'
import { analyzeWithGroq } from './aiProvider.js'
import { compareTestRuns } from './fixVerification.js'
import {
  sendRegressionAlertWebhook,
  getRegressionWebhookStatus,
  getRegressionWebhookHistory,
  sendManualTestPing,
  recordDeliveryHistory
} from './regressionWebhook.js'
import {
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
  getScheduledJobs,
  getScheduledJob,
  normalizeUrl
} from './scheduledTestRunner.js'
import { handleServerError, securityHeaders } from './securityMiddleware.js'
import { createRateLimiter } from './rateLimiter.js'
import { validatePublicHttpUrl } from './ssrfProtection.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/klyro'
const apiRateLimiter = createRateLimiter({ limit: 100, windowMs: 15 * 60 * 1000 })
const resourceRateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 })
app.locals.runBrowser = runBrowser
app.locals.validateBrowserUrl = validatePublicHttpUrl

const ensureFindings = (testRun) => {
  if (!testRun) return testRun
  const runObj = typeof testRun.toObject === 'function' ? testRun.toObject() : { ...testRun }
  if (Array.isArray(runObj.findings) && runObj.findings.length > 0) {
    return runObj
  }
  runObj.findings = analyzeFailures(runObj)
  return runObj
}

app.use(securityHeaders)
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

app.use('/api', apiRateLimiter)

app.use('/screenshots', express.static(path.resolve('screenshots')))

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Klyro backend is running'
  })
})

app.post('/api/browser/run', resourceRateLimiter, async (req, res) => {
  const { url } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      error: 'A valid URL string is required'
    })
  }

  try {
    await app.locals.validateBrowserUrl(url)
  } catch {
    return res.status(400).json({
      error: 'URL destination is not allowed'
    })
  }

  let result
  try {
    result = await app.locals.runBrowser(url)
  } catch (error) {
    if (error.code === 'SSRF_BLOCKED') {
      return res.status(400).json({
        error: 'URL destination is not allowed'
      })
    }
    return res.status(502).json({
      error: 'Failed to navigate to website'
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
        error: 'AI analysis is unavailable',
        code: error.code
      })
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({
        error: 'AI provider rate limit reached',
        code: error.code
      })
    }
    if (error.code === 'MALFORMED_RESPONSE') {
      return res.status(502).json({
        error: 'AI provider returned an unusable response',
        code: error.code
      })
    }
    return res.status(500).json({
      error: 'Failed to complete AI analysis',
      code: 'AI_ANALYSIS_FAILED'
    })
  }
}

app.post('/api/browser/runs/:id/ai-analysis', resourceRateLimiter, handleAiAnalysis)
app.post('/api/browser/runs/:id/analyze', resourceRateLimiter, handleAiAnalysis)

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
      freshResult = await app.locals.runBrowser(baselineRun.url)
    } catch (error) {
      if (error.code === 'SSRF_BLOCKED') {
        return res.status(400).json({
          error: 'URL destination is not allowed'
        })
      }
      return res.status(502).json({
        error: 'Failed to navigate to website'
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

    try {
      await sendRegressionAlertWebhook({
        baselineRun,
        verificationRun: freshTestRun,
        verificationReport,
        url: baselineRun.url
      })
    } catch {
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

app.post('/api/browser/runs/:id/verify', resourceRateLimiter, handleVerifyRun)

app.get('/api/regression-alerts/status', (req, res) => {
  try {
    const statusData = getRegressionWebhookStatus()
    return res.json(statusData)
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve regression alert status'
    })
  }
})

let isManualTestInProgress = false

app.get('/api/regression-alerts/history', (req, res) => {
  try {
    let limit = 50
    if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50)
      }
    }
    const history = getRegressionWebhookHistory(limit)
    return res.json({
      history,
      total: history.length
    })
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve regression alert history'
    })
  }
})

app.post('/api/regression-alerts/test', async (req, res) => {
  if (isManualTestInProgress) {
    return res.status(409).json({
      error: 'A manual webhook test is already in progress',
      code: 'TEST_IN_PROGRESS'
    })
  }

  const configured = Boolean(
    process.env.REGRESSION_WEBHOOK_URL &&
    typeof process.env.REGRESSION_WEBHOOK_URL === 'string' &&
    process.env.REGRESSION_WEBHOOK_URL.trim().length > 0
  )

  if (!configured) {
    const outcome = {
      eventType: 'manual_test_ping',
      status: 'skipped',
      message: 'Webhook URL not configured',
      timestamp: new Date().toISOString()
    }
    recordDeliveryHistory(outcome)
    return res.status(400).json({
      success: false,
      delivered: false,
      status: 'skipped',
      error: 'Webhook URL not configured',
      message: 'Webhook URL not configured'
    })
  }

  isManualTestInProgress = true
  try {
    const result = await sendManualTestPing()
    if (result.delivered) {
      return res.json({
        success: true,
        delivered: true,
        status: result.status,
        httpStatus: result.httpStatus,
        message: result.message
      })
    } else {
      return res.status(502).json({
        success: false,
        delivered: false,
        status: result.status,
        httpStatus: result.httpStatus || null,
        error: result.message || 'Webhook test delivery failed',
        message: result.message || 'Webhook test delivery failed'
      })
    }
  } catch {
    return res.status(500).json({
      success: false,
      delivered: false,
      error: 'Failed to execute manual webhook test'
    })
  } finally {
    isManualTestInProgress = false
  }
})

const inFlightScheduleUpdates = new Set()

app.post('/api/schedules', async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      error: 'Invalid request body'
    })
  }

  const { url, intervalMinutes, enabled } = req.body

  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) {
    return res.status(400).json({
      error: 'Invalid URL: must be a valid HTTP or HTTPS URL'
    })
  }

  if (
    typeof intervalMinutes !== 'number' ||
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < 1
  ) {
    return res.status(400).json({
      error: 'Invalid interval: must be a positive number of at least 1 minute'
    })
  }

  try {
    const existing = await ScheduledTest.findOne({ url: normalizedUrl })
    if (existing) {
      return res.status(409).json({
        error: 'Schedule already exists for this URL',
        code: 'DUPLICATE_SCHEDULE'
      })
    }

    const isEnabled = enabled !== undefined ? Boolean(enabled) : true
    const schedule = new ScheduledTest({
      url: normalizedUrl,
      intervalMinutes,
      enabled: isEnabled
    })
    schedule.jobId = schedule._id.toString()
    await schedule.save()

    if (schedule.enabled) {
      try {
        registerSchedule({
          id: schedule._id.toString(),
          url: schedule.url,
          intervalMinutes: schedule.intervalMinutes,
          minIntervalMinutes: 1
        })
      } catch {
        await ScheduledTest.findByIdAndDelete(schedule._id)
        return res.status(500).json({
          error: 'Failed to register runtime schedule'
        })
      }
    }

    return res.status(201).json(schedule)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Schedule already exists for this URL',
        code: 'DUPLICATE_SCHEDULE'
      })
    }
    return res.status(500).json({
      error: 'Failed to create schedule'
    })
  }
})

app.get('/api/schedules', async (req, res) => {
  try {
    let limit = 50
    if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100)
      }
    }
    const schedules = await ScheduledTest.find().sort({ createdAt: -1 }).limit(limit)
    return res.json(schedules)
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve schedules'
    })
  }
})

app.get('/api/schedules/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid schedule ID'
    })
  }

  try {
    const schedule = await ScheduledTest.findById(id)
    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found'
      })
    }
    return res.json(schedule)
  } catch {
    return res.status(500).json({
      error: 'Failed to retrieve schedule'
    })
  }
})

app.patch('/api/schedules/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid schedule ID'
    })
  }

  if (inFlightScheduleUpdates.has(id)) {
    return res.status(409).json({
      error: 'Update already in progress for this schedule',
      code: 'UPDATE_IN_PROGRESS'
    })
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      error: 'Invalid request body'
    })
  }

  const allowedFields = ['url', 'intervalMinutes', 'enabled']
  const keys = Object.keys(req.body)
  if (keys.length === 0) {
    return res.status(400).json({
      error: 'No fields provided to update'
    })
  }

  for (const key of keys) {
    if (!allowedFields.includes(key)) {
      return res.status(400).json({
        error: `Unsupported field: ${key}`
      })
    }
  }

  let normalizedUrl = null
  if (req.body.url !== undefined) {
    normalizedUrl = normalizeUrl(req.body.url)
    if (!normalizedUrl) {
      return res.status(400).json({
        error: 'Invalid URL: must be a valid HTTP or HTTPS URL'
      })
    }
  }

  if (req.body.intervalMinutes !== undefined) {
    if (
      typeof req.body.intervalMinutes !== 'number' ||
      !Number.isFinite(req.body.intervalMinutes) ||
      req.body.intervalMinutes < 1
    ) {
      return res.status(400).json({
        error: 'Invalid interval: must be a positive number of at least 1 minute'
      })
    }
  }

  if (req.body.enabled !== undefined && typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({
      error: 'Invalid enabled value: must be a boolean'
    })
  }

  inFlightScheduleUpdates.add(id)

  try {
    const schedule = await ScheduledTest.findById(id)
    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found'
      })
    }

    if (normalizedUrl && normalizedUrl !== schedule.url) {
      const duplicate = await ScheduledTest.findOne({
        url: normalizedUrl,
        _id: { $ne: id }
      })
      if (duplicate) {
        return res.status(409).json({
          error: 'Schedule already exists for this URL',
          code: 'DUPLICATE_SCHEDULE'
        })
      }
    }

    const previousConfig = {
      url: schedule.url,
      intervalMinutes: schedule.intervalMinutes,
      enabled: schedule.enabled
    }

    if (normalizedUrl) {
      schedule.url = normalizedUrl
    }
    if (req.body.intervalMinutes !== undefined) {
      schedule.intervalMinutes = req.body.intervalMinutes
    }
    if (req.body.enabled !== undefined) {
      schedule.enabled = req.body.enabled
    }

    await schedule.save()

    unregisterSchedule(schedule._id.toString())
    unregisterSchedule(previousConfig.url)

    if (schedule.enabled) {
      try {
        registerSchedule({
          id: schedule._id.toString(),
          url: schedule.url,
          intervalMinutes: schedule.intervalMinutes,
          minIntervalMinutes: 1
        })
      } catch {
        schedule.url = previousConfig.url
        schedule.intervalMinutes = previousConfig.intervalMinutes
        schedule.enabled = previousConfig.enabled
        await schedule.save()
        if (previousConfig.enabled) {
          try {
            registerSchedule({
              id: schedule._id.toString(),
              url: previousConfig.url,
              intervalMinutes: previousConfig.intervalMinutes,
              minIntervalMinutes: 1
            })
          } catch {}
        }
        return res.status(500).json({
          error: 'Failed to update runtime schedule registration'
        })
      }
    }

    return res.json(schedule)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Schedule already exists for this URL',
        code: 'DUPLICATE_SCHEDULE'
      })
    }
    return res.status(500).json({
      error: 'Failed to update schedule'
    })
  } finally {
    inFlightScheduleUpdates.delete(id)
  }
})

app.delete('/api/schedules/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: 'Invalid schedule ID'
    })
  }

  try {
    const schedule = await ScheduledTest.findById(id)
    if (!schedule) {
      return res.status(404).json({
        error: 'Schedule not found'
      })
    }

    unregisterSchedule(schedule._id.toString())
    unregisterSchedule(schedule.url)

    await ScheduledTest.findByIdAndDelete(id)

    return res.json({
      message: 'Schedule deleted successfully',
      id: schedule._id.toString()
    })
  } catch {
    return res.status(500).json({
      error: 'Failed to delete schedule'
    })
  }
})

app.use(handleServerError)

const initializeScheduledTests = async () => {
  try {
    const enabledSchedules = await ScheduledTest.find({ enabled: true })
    let registeredCount = 0
    for (const schedule of enabledSchedules) {
      try {
        if (!getScheduledJob(schedule._id.toString()) && !getScheduledJob(schedule.url)) {
          registerSchedule({
            id: schedule._id.toString(),
            url: schedule.url,
            intervalMinutes: schedule.intervalMinutes,
            minIntervalMinutes: 1
          })
          registeredCount++
        }
      } catch (err) {
        console.error(`Failed to register schedule ${schedule._id}:`, err.message)
      }
    }
    return registeredCount
  } catch (err) {
    console.error('Failed to initialize scheduled tests:', err.message)
    return 0
  }
}

const shutdownServer = () => {
  stopAllSchedules()
}

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log(`Connected to MongoDB at ${MONGODB_URI}`)
    await initializeScheduledTests()
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
    process.on('SIGTERM', () => shutdownServer())
    process.on('SIGINT', () => shutdownServer())
    return server
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/server.js')) {
  startServer()
}

export {
  app,
  handleVerifyRun,
  inFlightVerifications,
  isManualTestInProgress,
  inFlightScheduleUpdates,
  startServer,
  shutdownServer,
  initializeScheduledTests,
  ScheduledTest,
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
  getScheduledJobs,
  getScheduledJob
}
