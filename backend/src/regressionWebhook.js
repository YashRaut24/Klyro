import { evaluateRegressionAlert } from './regressionAlert.js'

export const dispatchedWebhookEvents = new Set()
export const MAX_HISTORY_ENTRIES = 50
export const webhookDeliveryHistory = []
let latestDeliveryStatus = null

export const clearDispatchedWebhookEvents = () => {
  dispatchedWebhookEvents.clear()
}

export const clearRegressionWebhookHistory = () => {
  webhookDeliveryHistory.length = 0
}

export const clearRegressionWebhookStatus = () => {
  latestDeliveryStatus = null
  clearRegressionWebhookHistory()
}

export const recordDeliveryHistory = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null
  }
  const historyItem = {
    id: entry.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    eventType: entry.eventType || 'regression_alert',
    status: entry.status || 'unavailable',
    timestamp: entry.timestamp || new Date().toISOString(),
    message: entry.message || '',
    baselineRunId: entry.baselineRunId || null,
    verificationRunId: entry.verificationRunId || null,
    httpStatus: typeof entry.httpStatus === 'number' ? entry.httpStatus : null
  }
  webhookDeliveryHistory.unshift(historyItem)
  if (webhookDeliveryHistory.length > MAX_HISTORY_ENTRIES) {
    webhookDeliveryHistory.length = MAX_HISTORY_ENTRIES
  }
  latestDeliveryStatus = {
    status: historyItem.status,
    message: historyItem.message,
    timestamp: historyItem.timestamp
  }
  return historyItem
}

export const recordDeliveryStatus = (outcome) => {
  if (!outcome || typeof outcome !== 'object') {
    return null
  }
  return recordDeliveryHistory(outcome)
}

export const getRegressionWebhookHistory = (limit = 50) => {
  let safeLimit = 50
  if (limit !== undefined && limit !== null) {
    const parsed = parseInt(limit, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      safeLimit = Math.min(parsed, MAX_HISTORY_ENTRIES)
    }
  }
  return webhookDeliveryHistory.slice(0, safeLimit)
}

export const getRegressionWebhookStatus = () => {
  const configured = Boolean(
    process.env.REGRESSION_WEBHOOK_URL &&
    typeof process.env.REGRESSION_WEBHOOK_URL === 'string' &&
    process.env.REGRESSION_WEBHOOK_URL.trim().length > 0
  )

  const latest = latestDeliveryStatus ? { ...latestDeliveryStatus } : null

  return {
    configured,
    status: latest ? latest.status : 'unavailable',
    timestamp: latest ? latest.timestamp : null,
    message: latest ? latest.message : 'No webhook deliveries attempted yet',
    latestDelivery: latest
  }
}

export const buildRegressionWebhookPayload = ({
  report,
  alertResult,
  baselineRunId,
  verificationRunId,
  url
}) => {
  return {
    event: 'regression_alert',
    status: report?.status || alertResult?.status || null,
    baselineRunId: baselineRunId || null,
    verificationRunId: verificationRunId || null,
    url: url || null,
    newFindingsCount: alertResult?.newFindingsCount || 0,
    newFindings: alertResult?.newFindings || []
  }
}

export const sendManualTestPing = async ({ webhookUrl, fetchFn = globalThis.fetch, timeoutMs = 5000 } = {}) => {
  const effectiveUrl = webhookUrl !== undefined ? webhookUrl : (process.env.REGRESSION_WEBHOOK_URL || null)

  if (!effectiveUrl || typeof effectiveUrl !== 'string' || !effectiveUrl.trim()) {
    const outcome = {
      eventType: 'manual_test_ping',
      status: 'skipped',
      message: 'Webhook URL not configured',
      httpStatus: null
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: false,
      skipped: true,
      status: 'skipped',
      message: outcome.message,
      httpStatus: null
    }
  }

  const payload = {
    event: 'regression_webhook_test',
    timestamp: new Date().toISOString(),
    diagnostic: true,
    source: 'klyro_manual_test'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(effectiveUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    if (!response.ok) {
      const outcome = {
        eventType: 'manual_test_ping',
        status: 'failed',
        message: `Manual test ping failed with HTTP ${response.status}`,
        httpStatus: response.status
      }
      recordDeliveryHistory(outcome)
      return {
        delivered: false,
        status: 'failed',
        httpStatus: response.status,
        message: outcome.message
      }
    }

    const outcome = {
      eventType: 'manual_test_ping',
      status: 'delivered',
      message: `Manual test ping delivered successfully (HTTP ${response.status})`,
      httpStatus: response.status
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: true,
      status: 'delivered',
      httpStatus: response.status,
      message: outcome.message
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR'
    const outcome = {
      eventType: 'manual_test_ping',
      status: isTimeout ? 'timed_out' : 'failed',
      message: isTimeout ? 'Manual test ping timed out' : 'Manual test ping network request failed',
      httpStatus: null
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: false,
      status: outcome.status,
      httpStatus: null,
      message: outcome.message
    }
  } finally {
    clearTimeout(timer)
  }
}

export const sendRegressionAlertWebhook = async (reportOrOptions = {}, maybeContext = {}, maybeOptions = {}) => {
  let report
  let baselineRunId = null
  let verificationRunId = null
  let url = null
  let webhookUrl = process.env.REGRESSION_WEBHOOK_URL || null
  let fetchFn = globalThis.fetch
  let timeoutMs = 5000

  if (
    reportOrOptions &&
    typeof reportOrOptions === 'object' &&
    ('verificationReport' in reportOrOptions || 'baselineRun' in reportOrOptions || 'fetchFn' in reportOrOptions || 'webhookUrl' in reportOrOptions)
  ) {
    const opts = reportOrOptions
    report = opts.verificationReport || opts.report || (opts.baselineRun && opts.baselineRun.verificationReport) || null
    baselineRunId = opts.baselineRunId || (opts.baselineRun ? (opts.baselineRun._id?.toString() || opts.baselineRun.id) : null)
    verificationRunId = opts.verificationRunId || (opts.verificationRun ? (opts.verificationRun._id?.toString() || opts.verificationRun.id) : null)
    url = opts.url || (opts.baselineRun && opts.baselineRun.url) || (opts.verificationRun && opts.verificationRun.url) || null
    if (opts.webhookUrl !== undefined) {
      webhookUrl = opts.webhookUrl
    }
    if (opts.fetchFn) {
      fetchFn = opts.fetchFn
    }
    if (opts.timeoutMs) {
      timeoutMs = opts.timeoutMs
    }
  } else {
    report = reportOrOptions
    baselineRunId =
      maybeContext.baselineRunId ||
      (maybeContext.baselineRun ? (maybeContext.baselineRun._id?.toString() || maybeContext.baselineRun.id) : null) ||
      report?.baselineRunId ||
      null
    verificationRunId =
      maybeContext.verificationRunId ||
      (maybeContext.verificationRun ? (maybeContext.verificationRun._id?.toString() || maybeContext.verificationRun.id) : null) ||
      report?.verificationRunId ||
      null
    url = maybeContext.url || (maybeContext.baselineRun && maybeContext.baselineRun.url) || null
    const opts = maybeOptions || {}
    if (opts.webhookUrl !== undefined) {
      webhookUrl = opts.webhookUrl
    }
    if (opts.fetchFn) {
      fetchFn = opts.fetchFn
    }
    if (opts.timeoutMs) {
      timeoutMs = opts.timeoutMs
    }
  }

  const effectiveBaselineId = baselineRunId || report?.baselineRunId || null
  const effectiveVerificationId = verificationRunId || report?.verificationRunId || null
  const effectiveUrl = url || report?.url || null

  const alertResult = evaluateRegressionAlert(report)
  if (!alertResult.alertRequired || alertResult.newFindingsCount <= 0) {
    const outcome = {
      eventType: 'regression_alert',
      status: 'skipped',
      message: alertResult.reason || 'No regression alert required',
      baselineRunId: effectiveBaselineId,
      verificationRunId: effectiveVerificationId,
      httpStatus: null
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: false,
      skipped: true,
      reason: outcome.message
    }
  }

  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.trim()) {
    const outcome = {
      eventType: 'regression_alert',
      status: 'skipped',
      message: 'Webhook URL not configured',
      baselineRunId: effectiveBaselineId,
      verificationRunId: effectiveVerificationId,
      httpStatus: null
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: false,
      skipped: true,
      reason: outcome.message
    }
  }

  const dispatchKey = effectiveBaselineId && effectiveVerificationId
    ? `${effectiveBaselineId}:${effectiveVerificationId}`
    : (effectiveBaselineId && report?.verifiedAt ? `${effectiveBaselineId}:${report.verifiedAt}` : null)

  if (dispatchKey && dispatchedWebhookEvents.has(dispatchKey)) {
    return {
      delivered: false,
      skipped: true,
      duplicate: true,
      reason: 'Duplicate dispatch prevented for this verification event'
    }
  }

  if (dispatchKey) {
    dispatchedWebhookEvents.add(dispatchKey)
    if (dispatchedWebhookEvents.size > 1000) {
      const oldestKey = dispatchedWebhookEvents.values().next().value
      dispatchedWebhookEvents.delete(oldestKey)
    }
  }

  const payload = buildRegressionWebhookPayload({
    report,
    alertResult,
    baselineRunId: effectiveBaselineId,
    verificationRunId: effectiveVerificationId,
    url: effectiveUrl
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(webhookUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    if (!response.ok) {
      const outcome = {
        eventType: 'regression_alert',
        status: 'failed',
        message: `Webhook delivery failed with HTTP ${response.status}`,
        baselineRunId: effectiveBaselineId,
        verificationRunId: effectiveVerificationId,
        httpStatus: response.status
      }
      recordDeliveryHistory(outcome)
      return {
        delivered: false,
        status: response.status,
        reason: outcome.message
      }
    }

    const outcome = {
      eventType: 'regression_alert',
      status: 'delivered',
      message: `Webhook delivered successfully (HTTP ${response.status})`,
      baselineRunId: effectiveBaselineId,
      verificationRunId: effectiveVerificationId,
      httpStatus: response.status
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: true,
      status: response.status,
      payload
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR'
    const outcome = {
      eventType: 'regression_alert',
      status: isTimeout ? 'timed_out' : 'failed',
      message: isTimeout ? 'Webhook request timed out' : 'Webhook network request failed',
      baselineRunId: effectiveBaselineId,
      verificationRunId: effectiveVerificationId,
      httpStatus: null
    }
    recordDeliveryHistory(outcome)
    return {
      delivered: false,
      reason: outcome.message
    }
  } finally {
    clearTimeout(timer)
  }
}

export default sendRegressionAlertWebhook
