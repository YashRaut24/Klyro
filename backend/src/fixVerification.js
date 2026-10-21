const getFindingKey = (finding) => {
  if (!finding || typeof finding !== 'object') {
    return 'INVALID:INVALID'
  }

  const type = typeof finding.type === 'string' ? finding.type.toUpperCase().trim() : 'UNKNOWN'
  const ev = (finding.evidence && typeof finding.evidence === 'object') ? finding.evidence : null

  if (ev) {
    if (type === 'PAGE_ERROR' && (ev.name || ev.message)) {
      const name = String(ev.name || 'Error').trim()
      const message = String(ev.message || '').trim()
      return `PAGE_ERROR:${name}:${message}`
    }

    if (type === 'HTTP_ERROR' && ev.url) {
      const url = String(ev.url).trim()
      const status = ev.status !== undefined && ev.status !== null ? String(ev.status).trim() : ''
      return `HTTP_ERROR:${url}:${status}`
    }

    if (type === 'FAILED_REQUEST' && ev.url) {
      const method = String(ev.method || 'GET').toUpperCase().trim()
      const url = String(ev.url).trim()
      const failure = String(ev.failure || '').trim()
      return `FAILED_REQUEST:${method}:${url}:${failure}`
    }

    if (type === 'CONSOLE_ERROR' && ev.text) {
      const text = String(ev.text).trim()
      const loc = (ev.location && typeof ev.location === 'object') ? ev.location : {}
      const locUrl = loc.url ? String(loc.url).trim() : ''
      const line = loc.lineNumber ?? loc.line ?? ''
      const col = loc.columnNumber ?? loc.column ?? ''
      const locStr = locUrl ? `${locUrl}:${line}:${col}` : ''
      return `CONSOLE_ERROR:${text}:${locStr}`
    }
  }

  const title = typeof finding.title === 'string' ? finding.title.toLowerCase().trim() : ''
  const description = typeof finding.description === 'string' ? finding.description.toLowerCase().trim() : ''
  return `FALLBACK:${type}:${title}:${description}`
}

const extractRunId = (run, fallbackKey) => {
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    return null
  }
  const id = run._id ?? run.id ?? (fallbackKey ? run[fallbackKey] : null)
  if (id === null || id === undefined) {
    return null
  }
  return typeof id.toString === 'function' ? id.toString() : String(id)
}

const extractFindings = (run) => {
  if (!run) {
    return []
  }
  if (Array.isArray(run)) {
    return run
  }
  if (typeof run === 'object' && Array.isArray(run.findings)) {
    return run.findings
  }
  return []
}

const cloneFinding = (finding) => {
  if (!finding || typeof finding !== 'object') {
    return finding
  }
  try {
    return structuredClone(finding)
  } catch {
    return JSON.parse(JSON.stringify(finding))
  }
}

const deduplicateFindings = (rawFindings) => {
  const map = new Map()
  for (const item of rawFindings) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const key = getFindingKey(item)
    if (!map.has(key)) {
      map.set(key, cloneFinding(item))
    }
  }
  return map
}

export const compareTestRuns = (baselineRun, verificationRun) => {
  const baselineRunId = extractRunId(baselineRun, 'baselineRunId')
  const verificationRunId = extractRunId(verificationRun, 'verificationRunId')

  const baselineFindings = extractFindings(baselineRun)
  const verificationFindings = extractFindings(verificationRun)

  const baselineMap = deduplicateFindings(baselineFindings)
  const verificationMap = deduplicateFindings(verificationFindings)

  const resolvedFindings = []
  const persistentFindings = []
  const newFindings = []

  for (const [key, finding] of baselineMap.entries()) {
    if (verificationMap.has(key)) {
      persistentFindings.push(cloneFinding(verificationMap.get(key)))
    } else {
      resolvedFindings.push(cloneFinding(finding))
    }
  }

  for (const [key, finding] of verificationMap.entries()) {
    if (!baselineMap.has(key)) {
      newFindings.push(cloneFinding(finding))
    }
  }

  const baselineTotal = baselineMap.size
  const verificationTotal = verificationMap.size
  const resolvedCount = resolvedFindings.length
  const persistentCount = persistentFindings.length
  const newCount = newFindings.length

  let status
  if (baselineTotal === 0) {
    status = 'no_baseline_findings'
  } else if (verificationTotal === 0) {
    status = 'verified'
  } else if (resolvedCount === 0) {
    status = 'not_verified'
  } else {
    status = 'partially_verified'
  }

  return {
    baselineRunId,
    verificationRunId,
    resolvedFindings,
    persistentFindings,
    newFindings,
    summary: {
      resolved: resolvedCount,
      persistent: persistentCount,
      new: newCount,
      totalBaseline: baselineTotal,
      totalVerification: verificationTotal
    },
    status
  }
}

export default compareTestRuns
