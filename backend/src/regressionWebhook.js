import { evaluateRegressionAlert } from './regressionAlert.js'

export const dispatchedWebhookEvents = new Set()
let latestDeliveryStatus = null

export const clearDispatchedWebhookEvents = () => {
  dispatchedWebhookEvents.clear()
}

export const clearRegressionWebhookStatus = () => {
  latestDeliveryStatus = null
}

export const recordDeliveryStatus = (outcome) => {
  if (!outcome || typeof outcome !== 'object') {
    return null
  }
  latestDeliveryStatus = {
    status: outcome.status || 'unavailable',
    message: outcome.message || '',
    timestamp: outcome.timestamp || new Date().toISOString()
  }
  return latestDeliveryStatus
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

  const alertResult = evaluateRegressionAlert(report)
  if (!alertResult.alertRequired || alertResult.newFindingsCount <= 0) {
    const outcome = {
      status: 'skipped',
      message: alertResult.reason || 'No regression alert required'
    }
    recordDeliveryStatus(outcome)
    return {
      delivered: false,
      skipped: true,
      reason: outcome.message
    }
  }

  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.trim()) {
    const outcome = {
      status: 'skipped',
      message: 'Webhook URL not configured'
    }
    recordDeliveryStatus(outcome)
    return {
      delivered: false,
      skipped: true,
      reason: outcome.message
    }
  }

  const effectiveBaselineId = baselineRunId || report?.baselineRunId || null
  const effectiveVerificationId = verificationRunId || report?.verificationRunId || null
  const effectiveUrl = url || report?.url || null

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
        status: 'failed',
        message: `Webhook delivery failed with HTTP ${response.status}`
      }
      recordDeliveryStatus(outcome)
      return {
        delivered: false,
        status: response.status,
        reason: outcome.message
      }
    }

    const outcome = {
      status: 'delivered',
      message: `Webhook delivered successfully (HTTP ${response.status})`
    }
    recordDeliveryStatus(outcome)
    return {
      delivered: true,
      status: response.status,
      payload
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ABORT_ERR'
    const outcome = {
      status: isTimeout ? 'timed_out' : 'failed',
      message: isTimeout ? 'Webhook request timed out' : 'Webhook network request failed'
    }
    recordDeliveryStatus(outcome)
    return {
      delivered: false,
      reason: outcome.message
    }
  } finally {
    clearTimeout(timer)
  }
}

export default sendRegressionAlertWebhook
