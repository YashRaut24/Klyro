import './TestRunEvidence.css'
import PerformanceMetricsPanel from './PerformanceMetricsPanel.jsx'

function TestRunEvidence({
  run,
  evidence,
  isLoadingEvidence,
  itemError,
  imageErrors,
  currentAiAnalysis,
  dualApproach,
  hasDualApproach,
  isAiLoading,
  currentAiError,
  handleGenerateAiAnalysis,
  hasFindings,
  isVerifying,
  currentVerificationError,
  currentVerification,
  handleVerifyFix,
  formatVerificationStatus,
  formatTimestamp,
  handleImageError
}) {
  return (
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
  )
}

export default TestRunEvidence
