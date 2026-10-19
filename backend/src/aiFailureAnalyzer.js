export const prepareAiAnalysisInput = (findingsOrRun = [], evidenceOrMetadata = {}) => {
  let rawFindings = []
  let context = {}

  if (Array.isArray(findingsOrRun)) {
    rawFindings = findingsOrRun
    context = (evidenceOrMetadata && typeof evidenceOrMetadata === 'object') ? evidenceOrMetadata : {}
  } else if (findingsOrRun && typeof findingsOrRun === 'object') {
    rawFindings = Array.isArray(findingsOrRun.findings) ? findingsOrRun.findings : []
    context = findingsOrRun
  }

  const counts = {
    high: 0,
    medium: 0,
    low: 0
  }

  const formattedFindings = []

  for (const finding of rawFindings) {
    if (!finding || typeof finding !== 'object') {
      continue
    }

    const type = typeof finding.type === 'string' ? finding.type : 'UNKNOWN'
    const severityRaw = typeof finding.severity === 'string' ? finding.severity.toLowerCase() : 'low'
    const severity = ['high', 'medium', 'low'].includes(severityRaw) ? severityRaw : 'low'
    const title = typeof finding.title === 'string' ? finding.title : 'Untitled Finding'
    const description = typeof finding.description === 'string' ? finding.description : ''

    let evidence = null
    if (finding.evidence !== undefined && finding.evidence !== null) {
      try {
        evidence = structuredClone(finding.evidence)
      } catch {
        evidence = typeof finding.evidence === 'object' ? { ...finding.evidence } : finding.evidence
      }
    }

    counts[severity] = (counts[severity] || 0) + 1

    formattedFindings.push({
      type,
      severity,
      title,
      description,
      evidence
    })
  }

  const target = {
    url: typeof context.url === 'string' ? context.url : null,
    finalUrl: typeof context.finalUrl === 'string' ? context.finalUrl : null,
    title: typeof context.title === 'string' ? context.title : null,
    status: typeof context.status === 'number' ? context.status : null
  }

  const summary = {
    totalFindings: formattedFindings.length,
    bySeverity: {
      high: counts.high,
      medium: counts.medium,
      low: counts.low
    }
  }

  return {
    target,
    summary,
    findings: formattedFindings
  }
}

export default prepareAiAnalysisInput
