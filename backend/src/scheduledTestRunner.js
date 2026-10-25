import { runBrowser } from './browserRunner.js'
import { analyzeFailures } from './failureAnalyzer.js'
import { TestRun } from './models/TestRun.js'

const scheduledJobs = new Map()
const DEFAULT_MAX_CONCURRENCY = 2
let maxConcurrency = DEFAULT_MAX_CONCURRENCY
let activeConcurrentExecutions = 0
const MIN_INTERVAL_MINUTES = 1

export const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return null
  }
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.href
  } catch {
    return null
  }
}

export const validateScheduleParams = ({ url, intervalMinutes, minInterval = MIN_INTERVAL_MINUTES }) => {
  const normalized = normalizeUrl(url)
  if (!normalized) {
    return {
      valid: false,
      error: 'Invalid URL: must be a valid HTTP or HTTPS URL'
    }
  }

  if (
    typeof intervalMinutes !== 'number' ||
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < minInterval
  ) {
    return {
      valid: false,
      error: `Invalid interval: must be a positive number of at least ${minInterval} minute(s)`
    }
  }

  return {
    valid: true,
    normalizedUrl: normalized
  }
}

export const defaultScheduledExecutor = async (url) => {
  const result = await runBrowser(url)
  const findings = analyzeFailures(result)
  const testRun = await TestRun.create({
    ...result,
    findings
  })
  return testRun
}

export const getMaxConcurrency = () => maxConcurrency

export const setMaxConcurrency = (limit) => {
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    maxConcurrency = Math.floor(limit)
  }
  return maxConcurrency
}

export const getActiveConcurrentExecutions = () => activeConcurrentExecutions

export const getScheduledJobs = () => {
  return Array.from(scheduledJobs.values()).map((job) => ({
    id: job.id,
    url: job.url,
    intervalMinutes: job.intervalMinutes,
    intervalMs: job.intervalMs,
    isRunning: job.isRunning,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
    runCount: job.runCount,
    lastError: job.lastError
  }))
}

export const getScheduledJob = (idOrUrl) => {
  if (!idOrUrl) return null
  const direct = scheduledJobs.get(idOrUrl)
  if (direct) return direct
  const normalized = normalizeUrl(idOrUrl)
  for (const job of scheduledJobs.values()) {
    if (job.url === idOrUrl || (normalized && job.url === normalized)) {
      return job
    }
  }
  return null
}

export const executeJob = async (job) => {
  if (!job || job.isRunning) {
    return {
      executed: false,
      skipped: true,
      reason: 'JOB_ALREADY_RUNNING'
    }
  }

  if (activeConcurrentExecutions >= maxConcurrency) {
    return {
      executed: false,
      skipped: true,
      reason: 'CONCURRENCY_LIMIT_REACHED'
    }
  }

  job.isRunning = true
  activeConcurrentExecutions++
  job.lastRunAt = new Date().toISOString()

  try {
    const executor = job.executor || defaultScheduledExecutor
    const result = await executor(job.url, job)
    job.runCount++
    job.lastResult = result
    job.lastError = null
    job.nextRunAt = new Date(Date.now() + job.intervalMs).toISOString()
    return {
      executed: true,
      result
    }
  } catch (err) {
    job.lastError = err?.message || String(err)
    job.nextRunAt = new Date(Date.now() + job.intervalMs).toISOString()
    return {
      executed: false,
      error: job.lastError
    }
  } finally {
    job.isRunning = false
    activeConcurrentExecutions--
  }
}

export const runScheduledJob = async (idOrUrl) => {
  const job = getScheduledJob(idOrUrl)
  if (!job) {
    return {
      executed: false,
      error: 'Job not found'
    }
  }
  return executeJob(job)
}

export const registerSchedule = (paramsOrUrl, maybeInterval, maybeOptions = {}) => {
  let url
  let intervalMinutes
  let options = {}

  if (typeof paramsOrUrl === 'object' && paramsOrUrl !== null) {
    url = paramsOrUrl.url
    intervalMinutes = paramsOrUrl.intervalMinutes
    options = paramsOrUrl
  } else {
    url = paramsOrUrl
    intervalMinutes = maybeInterval
    options = maybeOptions
  }

  const minInterval = options.minIntervalMinutes !== undefined
    ? options.minIntervalMinutes
    : (options.allowShortInterval ? 0.0001 : MIN_INTERVAL_MINUTES)

  const validation = validateScheduleParams({ url, intervalMinutes, minInterval })
  if (!validation.valid) {
    const error = new Error(validation.error)
    error.code = 'INVALID_SCHEDULE_PARAMS'
    throw error
  }

  const normalizedUrl = validation.normalizedUrl
  const id = options.id || `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  if (scheduledJobs.has(id)) {
    const error = new Error(`Schedule already registered with ID: ${id}`)
    error.code = 'DUPLICATE_SCHEDULE'
    throw error
  }

  for (const existing of scheduledJobs.values()) {
    if (existing.url === normalizedUrl) {
      const error = new Error(`Schedule already registered for URL: ${normalizedUrl}`)
      error.code = 'DUPLICATE_SCHEDULE'
      throw error
    }
  }

  const intervalMs = options.intervalMs || Math.round(intervalMinutes * 60 * 1000)
  const timerFn = options.timerFn || setInterval

  const job = {
    id,
    url: normalizedUrl,
    intervalMinutes,
    intervalMs,
    executor: options.executor || null,
    isRunning: false,
    lastRunAt: null,
    nextRunAt: new Date(Date.now() + intervalMs).toISOString(),
    runCount: 0,
    lastResult: null,
    lastError: null,
    timer: null
  }

  if (!options.autoStartDisabled) {
    job.timer = timerFn(() => {
      executeJob(job)
    }, intervalMs)
  }

  scheduledJobs.set(id, job)

  return {
    id: job.id,
    url: job.url,
    intervalMinutes: job.intervalMinutes,
    intervalMs: job.intervalMs,
    nextRunAt: job.nextRunAt
  }
}

export const unregisterSchedule = (idOrUrl) => {
  const job = getScheduledJob(idOrUrl)
  if (!job) {
    return false
  }
  if (job.timer) {
    clearInterval(job.timer)
    clearTimeout(job.timer)
    job.timer = null
  }
  scheduledJobs.delete(job.id)
  return true
}

export const stopAllSchedules = () => {
  for (const job of scheduledJobs.values()) {
    if (job.timer) {
      clearInterval(job.timer)
      clearTimeout(job.timer)
      job.timer = null
    }
  }
  scheduledJobs.clear()
  activeConcurrentExecutions = 0
  maxConcurrency = DEFAULT_MAX_CONCURRENCY
}
