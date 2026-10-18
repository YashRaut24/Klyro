export const analyzeFailures = (testRun = {}) => {
  if (!testRun || typeof testRun !== 'object') {
    return []
  }

  const findings = []
  const seenKeys = new Set()

  const {
    pageErrors = [],
    httpErrors = [],
    failedRequests = [],
    consoleErrors = []
  } = testRun

  if (Array.isArray(pageErrors)) {
    for (const err of pageErrors) {
      if (!err || typeof err !== 'object') continue
      const name = err.name || 'Error'
      const message = err.message || 'Unknown runtime error'
      const dedupeKey = `PAGE_ERROR:${name}:${message}`

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey)
        findings.push({
          type: 'PAGE_ERROR',
          severity: 'high',
          title: `Uncaught ${name}`,
          description: `An uncaught ${name} occurred on the page: ${message}`,
          evidence: {
            name: err.name || 'Error',
            message
          }
        })
      }
    }
  }

  if (Array.isArray(httpErrors)) {
    for (const err of httpErrors) {
      if (!err || typeof err !== 'object' || !err.url) continue
      const status = typeof err.status === 'number' ? err.status : null
      const statusText = err.statusText || null
      const dedupeKey = `HTTP_ERROR:${err.url}:${status}`

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey)
        const severity = status && status >= 500 ? 'high' : 'medium'
        const title = status ? `HTTP ${status} Error Response` : 'HTTP Error Response'
        const description = status
          ? `Request to ${err.url} returned HTTP ${status}${statusText ? ` (${statusText})` : ''}.`
          : `Request to ${err.url} returned an HTTP error.`

        findings.push({
          type: 'HTTP_ERROR',
          severity,
          title,
          description,
          evidence: {
            url: err.url,
            status,
            statusText
          }
        })
      }
    }
  }

  if (Array.isArray(failedRequests)) {
    for (const req of failedRequests) {
      if (!req || typeof req !== 'object' || !req.url) continue
      const method = req.method || 'GET'
      const failure = req.failure || 'Network request failed'
      const dedupeKey = `FAILED_REQUEST:${method}:${req.url}:${failure}`

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey)
        findings.push({
          type: 'FAILED_REQUEST',
          severity: 'high',
          title: `Failed Network Request: ${method}`,
          description: `${method} request to ${req.url} failed: ${failure}.`,
          evidence: {
            url: req.url,
            method,
            failure
          }
        })
      }
    }
  }

  if (Array.isArray(consoleErrors)) {
    for (const err of consoleErrors) {
      if (!err || typeof err !== 'object' || !err.text) continue
      const text = err.text
      const loc = err.location || {}
      const locUrl = loc.url || null
      const line = loc.lineNumber ?? loc.line ?? null
      const col = loc.columnNumber ?? loc.column ?? null
      const locString = locUrl ? `${locUrl}${line !== null ? `:${line}` : ''}${col !== null ? `:${col}` : ''}` : null
      const dedupeKey = `CONSOLE_ERROR:${text}:${locString || ''}`

      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey)
        const description = locString
          ? `Console error logged at ${locString}: ${text}`
          : `Console error logged: ${text}`

        findings.push({
          type: 'CONSOLE_ERROR',
          severity: 'medium',
          title: 'Console Error',
          description,
          evidence: {
            text,
            location: err.location || null
          }
        })
      }
    }
  }

  return findings
}

export default analyzeFailures
