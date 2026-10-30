import './TestRunHistoryPanel.css'
import { useEffect, useState } from 'react'
import TestRunHistoryFilters from './TestRunHistoryFilters.jsx'
import TestRunHistoryFeedback from './TestRunHistoryFeedback.jsx'
import TestRunHistoryItem from './TestRunHistoryItem.jsx'
import TestRunEvidence from './TestRunEvidence.jsx'

function TestRunHistoryPanel({ refreshToken, filter, setFilter, formatFilterLabel, expandedIds, evidenceCache, evidenceLoading, evidenceError, aiLoading, aiError, verificationLoading, verificationError, imageErrors, formatTimestamp, formatVerificationStatus, handleVerifyFix, handleToggleExpand, handleGenerateAiAnalysis, handleImageError }) {
  const [history, setHistory] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)

  useEffect(() => {
    const fetchHistory = async () => {
      setHistoryError(null)

      try {
        const response = await fetch('http://localhost:5000/api/browser/runs')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to retrieve test runs.')
        }

        setHistory(Array.isArray(data) ? data : [])
      } catch (err) {
        setHistoryError(err.message || 'Failed to load test history.')
      } finally {
        setIsHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [refreshToken])

  const filteredHistory = history.filter((run) => {
    if (filter === 'all') {
      return true
    }

    const report = evidenceCache[run._id]?.verificationReport || run.verificationReport
    if (!report) {
      return false
    }

    if (filter === 'verified') {
      return report.status === 'verified'
    }

    if (filter === 'partially_verified') {
      return report.status === 'partially_verified'
    }

    if (filter === 'not_verified') {
      return report.status === 'not_verified'
    }

    if (filter === 'new_findings') {
      const newCount = report.summary?.new ?? (Array.isArray(report.newFindings) ? report.newFindings.length : 0)
      return newCount > 0
    }

    return true
  })

  return (
        <section className="history-section" id="history" aria-label="Test Run History">
          <div className="history-header">
            <h2 className="history-title">Test Run History</h2>
            {!isHistoryLoading && !historyError && (
              <span className="history-count">
                {filter === 'all'
                  ? `${history.length} ${history.length === 1 ? 'run' : 'runs'}`
                  : `${filteredHistory.length} of ${history.length} runs`}
              </span>
            )}
          </div>
          <TestRunHistoryFilters filter={filter} setFilter={setFilter} />

          {isHistoryLoading && (
            <TestRunHistoryFeedback type="loading" />
          )}

          {historyError && !isHistoryLoading && (
            <TestRunHistoryFeedback type="error" error={historyError} />
          )}

          {!isHistoryLoading && !historyError && history.length === 0 && (
            <TestRunHistoryFeedback type="empty" />
          )}

          {!isHistoryLoading && !historyError && history.length > 0 && filteredHistory.length === 0 && (
            <div className="history-card history-empty filter-empty">
              <p className="empty-title">No matching test runs</p>
              <p className="empty-subtitle">
                No test runs match the selected filter ({formatFilterLabel(filter)}).
              </p>
              <button
                type="button"
                className="filter-reset-button"
                onClick={() => setFilter('all')}
              >
                Show all runs
              </button>
            </div>
          )}

          {!isHistoryLoading && !historyError && filteredHistory.length > 0 && (
            <div className="history-list">
              {filteredHistory.map((run) => {
                const isSuccess = run.status >= 200 && run.status < 400
                const isExpanded = !!expandedIds[run._id]
                const evidence = evidenceCache[run._id]
                const isLoadingEvidence = !!evidenceLoading[run._id]
                const itemError = evidenceError[run._id]
                const isAiLoading = !!aiLoading[run._id]
                const currentAiError = aiError[run._id]
                const currentAiAnalysis = evidence?.aiAnalysis
                const dualApproach = currentAiAnalysis?.dualApproach || currentAiAnalysis?.approaches
                const hasDualApproach = !!(dualApproach && (dualApproach.quickFix || dualApproach.structuralFix))
                const isVerifying = !!verificationLoading[run._id]
                const currentVerificationError = verificationError[run._id]
                const currentVerification = evidence?.verificationReport || run.verificationReport
                const runFindings = (evidence && Array.isArray(evidence.findings)) ? evidence.findings : (Array.isArray(run.findings) ? run.findings : [])
                const hasFindings = runFindings.length > 0

                const isVerificationRun = Boolean(run.baselineRunId)
                const relatedBaselineId = run.baselineRunId
                  ? (typeof run.baselineRunId === 'object'
                      ? (run.baselineRunId._id || run.baselineRunId.toString())
                      : String(run.baselineRunId))
                  : null

                const linkedVerificationRun = history.find((r) => {
                  if (!r.baselineRunId) return false
                  const bId = typeof r.baselineRunId === 'object'
                    ? (r.baselineRunId._id || r.baselineRunId.toString())
                    : String(r.baselineRunId)
                  return bId === String(run._id)
                })
                const rawVerificationId = currentVerification?.verificationRunId || linkedVerificationRun?._id
                const relatedVerificationId = rawVerificationId
                  ? (typeof rawVerificationId === 'object'
                      ? (rawVerificationId._id || rawVerificationId.toString())
                      : String(rawVerificationId))
                  : null
                const isBaselineRun = !isVerificationRun && (Boolean(relatedVerificationId) || Boolean(currentVerification))

                return (
                  <TestRunHistoryItem
                    key={run._id}
                    run={run}
                    isSuccess={isSuccess}
                    currentVerification={currentVerification}
                    isBaselineRun={isBaselineRun}
                    isVerificationRun={isVerificationRun}
                    relatedVerificationId={relatedVerificationId}
                    relatedBaselineId={relatedBaselineId}
                    hasFindings={hasFindings}
                    isVerifying={isVerifying}
                    isExpanded={isExpanded}
                    formatTimestamp={formatTimestamp}
                    formatVerificationStatus={formatVerificationStatus}
                    handleVerifyFix={handleVerifyFix}
                    handleToggleExpand={handleToggleExpand}
                  >
                    {isExpanded && (
                      <TestRunEvidence
                        run={run}
                        evidence={evidence}
                        isLoadingEvidence={isLoadingEvidence}
                        itemError={itemError}
                        imageErrors={imageErrors}
                        currentAiAnalysis={currentAiAnalysis}
                        dualApproach={dualApproach}
                        hasDualApproach={hasDualApproach}
                        isAiLoading={isAiLoading}
                        currentAiError={currentAiError}
                        handleGenerateAiAnalysis={handleGenerateAiAnalysis}
                        hasFindings={hasFindings}
                        isVerifying={isVerifying}
                        currentVerificationError={currentVerificationError}
                        currentVerification={currentVerification}
                        handleVerifyFix={handleVerifyFix}
                        formatVerificationStatus={formatVerificationStatus}
                        formatTimestamp={formatTimestamp}
                        handleImageError={handleImageError}
                      />
                    )}
                  </TestRunHistoryItem>
                )
              })}
            </div>
          )}
        </section>
  )
}

export default TestRunHistoryPanel
