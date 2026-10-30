import './TestRunHistoryPanel.css'
import { useEffect, useState } from 'react'
import PerformanceMetricsPanel from './PerformanceMetricsPanel.jsx'
import TestRunHistoryFilters from './TestRunHistoryFilters.jsx'
import TestRunHistoryFeedback from './TestRunHistoryFeedback.jsx'

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
                  <article key={run._id} className="history-item">
                    <div className="history-item-header">
                      <span className={`status-indicator ${isSuccess ? 'indicator-ok' : 'indicator-error'}`}>
                        {isSuccess ? 'Success' : 'Error'}
                      </span>
                      <span className="history-url">{run.url}</span>
                      <span className={`status-pill ${isSuccess ? 'status-ok' : 'status-warn'}`}>
                        {run.status ? `HTTP ${run.status}` : 'No Status'}
                      </span>
                      {currentVerification && currentVerification.status && (
                        <span className={`status-badge history-verification-badge verification-status-badge verification-status-${currentVerification.status}`}>
                          {formatVerificationStatus(currentVerification.status)}
                        </span>
                      )}
                    </div>

                    <div className="history-item-body">
                      <span className="history-page-title">{run.title || 'Untitled page'}</span>
                      {(isBaselineRun || isVerificationRun) && (
                        <div className="history-item-meta">
                          {isBaselineRun && (
                            <div className="run-linkage-wrapper">
                              <span className="run-type-badge run-type-baseline">Baseline Run</span>
                              {relatedVerificationId && (
                                <span className="run-linkage-info">
                                  Verification Run: <span className="related-run-id">{relatedVerificationId}</span>
                                </span>
                              )}
                            </div>
                          )}
                          {isVerificationRun && (
                            <div className="run-linkage-wrapper">
                              <span className="run-type-badge run-type-verification">Verification Run</span>
                              {relatedBaselineId && (
                                <span className="run-linkage-info">
                                  Baseline Run: <span className="related-run-id">{relatedBaselineId}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="history-item-footer">
                      <time className="history-timestamp" dateTime={run.createdAt}>
                        {formatTimestamp(run.createdAt)}
                      </time>
                      <div className="history-actions">
                        {hasFindings && (
                          <button
                            type="button"
                            className="verify-fix-button"
                            onClick={() => handleVerifyFix(run._id)}
                            disabled={isVerifying}
                          >
                            {isVerifying ? 'Verifying Fix...' : (currentVerification ? 'Re-verify Fix' : 'Verify Fix')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="expand-button"
                          onClick={() => handleToggleExpand(run._id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="evidence-panel">
                        {isLoadingEvidence && (
                          <div className="evidence-loading" role="status">
                            <div className="spinner"></div>
                            <p className="status-title">Loading test evidence...</p>
                          </div>
                        )}

                        {itemError && !isLoadingEvidence && (
                          <div className="evidence-error" role="alert">
                            <span className="status-badge error-badge">Error</span>
                            <p className="error-message">{itemError}</p>
                          </div>
                        )}

                        {evidence && !isLoadingEvidence && !itemError && (
                          <div className="evidence-content">
                            <div className="evidence-group performance-metrics-group">
                              <h4 className="evidence-group-title">Performance Metrics</h4>
                              <PerformanceMetricsPanel metrics={evidence.performanceMetrics ?? run.performanceMetrics} />
                            </div>

                            <div className="evidence-group findings-group">
                              <h4 className="evidence-group-title">
                                Analysis Findings ({evidence.findings?.length || 0})
                              </h4>
                              {evidence.findings && evidence.findings.length > 0 ? (
                                <ul className="findings-list">
                                  {evidence.findings.map((finding, idx) => (
                                    <li key={idx} className={`finding-item severity-${finding.severity || 'low'}`}>
                                      <div className="finding-header">
                                        <span className={`finding-severity severity-${finding.severity || 'low'}`}>
                                          {finding.severity}
                                        </span>
                                        <span className="finding-type">{finding.type}</span>
                                        <span className="finding-title">{finding.title}</span>
                                      </div>
                                      <p className="finding-description">{finding.description}</p>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No failure findings detected.</p>
                              )}
                            </div>

                            {evidence.findings && evidence.findings.length > 0 && (
                              <div className="evidence-group ai-analysis-group">
                                <div className="ai-section-header">
                                  <div className="ai-title-wrapper">
                                    <span className="ai-badge">AI Assistant</span>
                                    <h4 className="evidence-group-title">AI Analysis & Remediation</h4>
                                  </div>
                                  {!currentAiAnalysis && (
                                    <button
                                      type="button"
                                      className="ai-action-button"
                                      onClick={() => handleGenerateAiAnalysis(run._id)}
                                      disabled={isAiLoading}
                                    >
                                      {isAiLoading ? 'Analyzing...' : 'Generate AI Analysis'}
                                    </button>
                                  )}
                                </div>

                                {isAiLoading && (
                                  <div className="ai-loading" role="status">
                                    <div className="spinner"></div>
                                    <div>
                                      <p className="status-title">Generating AI root cause analysis...</p>
                                      <p className="status-detail">Synthesizing findings and remediation suggestions with Groq</p>
                                    </div>
                                  </div>
                                )}

                                {currentAiError && !isAiLoading && (
                                  <div className="ai-error-banner" role="alert">
                                    <div className="ai-error-content">
                                      <span className="status-badge error-badge">AI Error</span>
                                      <p className="ai-error-text">{currentAiError}</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="ai-retry-button"
                                      onClick={() => handleGenerateAiAnalysis(run._id)}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {currentAiAnalysis && !isAiLoading && (
                                  <div className="ai-analysis-card">
                                    <div className="ai-card-header">
                                      <div className="ai-model-tag">
                                        Model: {currentAiAnalysis.model || 'Groq AI'}
                                      </div>
                                      <button
                                        type="button"
                                        className="ai-regenerate-button"
                                        onClick={() => handleGenerateAiAnalysis(run._id)}
                                        disabled={isAiLoading}
                                      >
                                        Re-analyze
                                      </button>
                                    </div>

                                    <div className="ai-explanation-box">
                                      <h5 className="ai-subtitle">Likely Root Cause</h5>
                                      <p className="ai-explanation-text">{currentAiAnalysis.explanation}</p>
                                    </div>

                                    {hasDualApproach ? (
                                      <div className="dual-approach-section">
                                        <h5 className="ai-subtitle">Remediation Approaches</h5>
                                        <div className="dual-approach-container">
                                          <div className="approach-card quick-fix-card">
                                            <div className="approach-header">
                                              <span className="approach-badge quick-fix-badge">Quick Fix</span>
                                              <h6 className="approach-title">{dualApproach.quickFix?.title || 'Immediate Containment'}</h6>
                                            </div>
                                            <div className="approach-body">
                                              <div className="approach-field">
                                                <span className="approach-label">Explanation</span>
                                                <p className="approach-text">
                                                  {dualApproach.quickFix?.explanation || 'Insufficient evidence to provide immediate fix explanation.'}
                                                </p>
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Suggested Change</span>
                                                {dualApproach.quickFix?.suggestedChange ? (
                                                  <pre className="approach-code-block"><code>{dualApproach.quickFix.suggestedChange}</code></pre>
                                                ) : (
                                                  <p className="approach-insufficient">Insufficient evidence to provide exact code changes without inspecting source files.</p>
                                                )}
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Trade-offs</span>
                                                <p className="approach-text">
                                                  {dualApproach.quickFix?.tradeOffs || dualApproach.quickFix?.tradeoffs || 'None specified.'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="approach-card structural-fix-card">
                                            <div className="approach-header">
                                              <span className="approach-badge structural-fix-badge">Structural Fix</span>
                                              <h6 className="approach-title">{dualApproach.structuralFix?.title || 'Architectural Improvement'}</h6>
                                            </div>
                                            <div className="approach-body">
                                              <div className="approach-field">
                                                <span className="approach-label">Explanation</span>
                                                <p className="approach-text">
                                                  {dualApproach.structuralFix?.explanation || 'Insufficient evidence to provide architectural fix explanation.'}
                                                </p>
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Suggested Change</span>
                                                {dualApproach.structuralFix?.suggestedChange ? (
                                                  <pre className="approach-code-block"><code>{dualApproach.structuralFix.suggestedChange}</code></pre>
                                                ) : (
                                                  <p className="approach-insufficient">Insufficient evidence to provide exact structural changes without inspecting repository architecture.</p>
                                                )}
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Trade-offs</span>
                                                <p className="approach-text">
                                                  {dualApproach.structuralFix?.tradeOffs || dualApproach.structuralFix?.tradeoffs || 'None specified.'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      Array.isArray(currentAiAnalysis.remediations) && currentAiAnalysis.remediations.length > 0 && (
                                        <div className="ai-remediations-box">
                                          <h5 className="ai-subtitle">Remediation Suggestions</h5>
                                          <div className="ai-remediations-list">
                                            {currentAiAnalysis.remediations.map((rem, rIdx) => (
                                              <div key={rIdx} className="ai-remediation-item">
                                                <div className="remediation-index">{rIdx + 1}</div>
                                                <div className="remediation-body">
                                                  <strong className="remediation-summary">{rem.summary}</strong>
                                                  <p className="remediation-suggestion">{rem.suggestion}</p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    )}

                                    <div className="ai-disclaimer">
                                      AI suggestions are diagnostic recommendations and have not been automatically applied or verified.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {hasFindings && (
                              <div className="evidence-group verification-group">
                                <div className="verification-section-header">
                                  <div className="verification-title-wrapper">
                                    <span className="verification-badge">Fix Verification</span>
                                    <h4 className="evidence-group-title">Fix Verification & Comparison</h4>
                                  </div>
                                  <button
                                    type="button"
                                    className="verify-fix-button verify-action-button"
                                    onClick={() => handleVerifyFix(run._id)}
                                    disabled={isVerifying}
                                  >
                                    {isVerifying ? 'Verifying Fix...' : (currentVerification ? 'Re-verify Fix' : 'Verify Fix')}
                                  </button>
                                </div>

                                {isVerifying && (
                                  <div className="verification-loading" role="status">
                                    <div className="spinner"></div>
                                    <div>
                                      <p className="status-title">Verifying fix against live URL...</p>
                                      <p className="status-detail">Running fresh browser test and comparing findings with baseline</p>
                                    </div>
                                  </div>
                                )}

                                {currentVerificationError && !isVerifying && (
                                  <div className="verification-error-banner" role="alert">
                                    <div className="verification-error-content">
                                      <span className="status-badge error-badge">Verification Error</span>
                                      <p className="verification-error-text">{currentVerificationError}</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="verification-retry-button"
                                      onClick={() => handleVerifyFix(run._id)}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {currentVerification && !isVerifying && (
                                  <div className="verification-card">
                                    <div className="verification-card-header">
                                      <div className="verification-status-wrapper">
                                        <span className="verification-status-label">Overall Status:</span>
                                        <span className={`status-badge verification-status-badge verification-status-${currentVerification.status}`}>
                                          {formatVerificationStatus(currentVerification.status)}
                                        </span>
                                      </div>
                                      {currentVerification.verifiedAt && (
                                        <time className="verification-timestamp" dateTime={currentVerification.verifiedAt}>
                                          Verified: {formatTimestamp(currentVerification.verifiedAt)}
                                        </time>
                                      )}
                                    </div>

                                    <div className="verification-stats-grid">
                                      <div className="stat-card stat-resolved">
                                        <span className="stat-number">{currentVerification.summary?.resolved ?? 0}</span>
                                        <span className="stat-label">Resolved Findings</span>
                                      </div>
                                      <div className="stat-card stat-persistent">
                                        <span className="stat-number">{currentVerification.summary?.persistent ?? 0}</span>
                                        <span className="stat-label">Persistent Findings</span>
                                      </div>
                                      <div className="stat-card stat-new">
                                        <span className="stat-number">{currentVerification.summary?.new ?? 0}</span>
                                        <span className="stat-label">New Findings</span>
                                      </div>
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title resolved-title">
                                        Resolved Findings ({currentVerification.resolvedFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.resolvedFindings) && currentVerification.resolvedFindings.length > 0 ? (
                                        <ul className="verification-findings-list resolved-list">
                                          {currentVerification.resolvedFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No resolved findings.</p>
                                      )}
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title persistent-title">
                                        Persistent Findings ({currentVerification.persistentFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.persistentFindings) && currentVerification.persistentFindings.length > 0 ? (
                                        <ul className="verification-findings-list persistent-list">
                                          {currentVerification.persistentFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No persistent findings.</p>
                                      )}
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title new-title">
                                        New Findings or Regressions ({currentVerification.newFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.newFindings) && currentVerification.newFindings.length > 0 ? (
                                        <ul className="verification-findings-list new-list">
                                          {currentVerification.newFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No new findings or regressions detected.</p>
                                      )}
                                    </div>

                                    <div className="verification-disclaimer">
                                      Verification reflects observed differences between automated test runs and does not establish code causation.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Page Errors ({evidence.pageErrors?.length || 0})
                              </h4>
                              {evidence.pageErrors && evidence.pageErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.pageErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <span className="evidence-badge error-badge">{err.name || 'Error'}</span>
                                      <span className="evidence-text">{err.message}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No page errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Console Errors ({evidence.consoleErrors?.length || 0})
                              </h4>
                              {evidence.consoleErrors && evidence.consoleErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.consoleErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <span className="evidence-text">{err.text}</span>
                                      {err.location && (err.location.url || err.location.lineNumber || err.location.line) && (
                                        <span className="evidence-location">
                                          {err.location.url || 'inline'}:{err.location.lineNumber ?? err.location.line ?? 0}:{err.location.columnNumber ?? err.location.column ?? 0}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No console errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Failed Network Requests ({evidence.failedRequests?.length || 0})
                              </h4>
                              {evidence.failedRequests && evidence.failedRequests.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.failedRequests.map((req, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <div className="evidence-req-header">
                                        <span className="method-badge">{req.method || 'GET'}</span>
                                        <span className="evidence-url">{req.url}</span>
                                      </div>
                                      <span className="evidence-failure">{req.failure || 'Network request failed'}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No failed network requests detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                HTTP Errors ({evidence.httpErrors?.length || 0})
                              </h4>
                              {evidence.httpErrors && evidence.httpErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.httpErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <div className="evidence-req-header">
                                        <span className="status-pill status-warn">HTTP {err.status}</span>
                                        <span className="evidence-url">{err.url}</span>
                                      </div>
                                      {err.statusText && <span className="evidence-failure">{err.statusText}</span>}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No HTTP errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">Screenshot Preview</h4>
                              {evidence.screenshot && !imageErrors[run._id] ? (
                                <div className="screenshot-wrapper">
                                  <img
                                    src={evidence.screenshot.startsWith('http') ? evidence.screenshot : `http://localhost:5000/${evidence.screenshot.replace(/^\/+/, '')}`}
                                    alt={`Screenshot of ${evidence.url}`}
                                    className="screenshot-preview"
                                    onError={() => handleImageError(run._id)}
                                  />
                                </div>
                              ) : (
                                <p className="evidence-empty">
                                  {evidence.screenshotError || (imageErrors[run._id] ? 'Unable to load screenshot preview.' : 'No screenshot available for this run.')}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
  )
}

export default TestRunHistoryPanel
