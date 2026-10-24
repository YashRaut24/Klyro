const extractReport = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }
  if ('verificationReport' in input) {
    const nested = input.verificationReport
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      return null
    }
    return nested
  }
  return input
}

export const evaluateRegressionAlert = (reportOrRun) => {
  const report = extractReport(reportOrRun)

  if (!report) {
    return {
      alertRequired: false,
      hasRegression: false,
      reason: 'Verification report is missing',
      status: null,
      newFindingsCount: 0,
      newCount: 0,
      newFindings: []
    }
  }

  let status = null
  if (typeof report.status === 'string' && report.status.trim().length > 0) {
    status = report.status.trim()
  }

  let newFindings = []
  let newFindingsCount = 0

  if (Array.isArray(report.newFindings)) {
    newFindings = report.newFindings
    newFindingsCount = report.newFindings.length
  } else if (
    report.summary &&
    typeof report.summary === 'object' &&
    typeof report.summary.new === 'number' &&
    Number.isFinite(report.summary.new) &&
    report.summary.new > 0
  ) {
    newFindingsCount = Math.floor(report.summary.new)
  }

  const alertRequired = newFindingsCount > 0

  let reason
  if (alertRequired) {
    reason = `Regression detected: ${newFindingsCount} new finding${newFindingsCount === 1 ? '' : 's'} introduced`
  } else if (!status && !report.summary && !('newFindings' in report)) {
    reason = 'Verification report is invalid or malformed'
  } else {
    reason = 'No regression detected: 0 new findings'
  }

  return {
    alertRequired,
    hasRegression: alertRequired,
    reason,
    status,
    newFindingsCount,
    newCount: newFindingsCount,
    newFindings: Array.isArray(newFindings) ? [...newFindings] : []
  }
}

export const checkRegressionAlert = evaluateRegressionAlert
export default evaluateRegressionAlert
