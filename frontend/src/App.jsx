import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [history, setHistory] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)

  const [expandedIds, setExpandedIds] = useState({})
  const [evidenceCache, setEvidenceCache] = useState({})
  const [evidenceLoading, setEvidenceLoading] = useState({})
  const [evidenceError, setEvidenceError] = useState({})
  const [imageErrors, setImageErrors] = useState({})
  const [aiLoading, setAiLoading] = useState({})
  const [aiError, setAiError] = useState({})

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

  useEffect(() => {
    fetchHistory()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (isLoading) {
      return
    }

    const trimmedUrl = url.trim()

    if (!trimmedUrl) {
      setError('Please enter a website URL.')
      setResult(null)
      return
    }

    try {
      const parsedUrl = new URL(trimmedUrl)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        setError('Only HTTP and HTTPS URLs are supported.')
        setResult(null)
        return
      }
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com).')
      setResult(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('http://localhost:5000/api/browser/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: trimmedUrl })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete test run.')
      }

      setResult(data)
      fetchHistory()
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleExpand = async (id) => {
    const isCurrentlyExpanded = !!expandedIds[id]

    setExpandedIds((prev) => ({
      ...prev,
      [id]: !isCurrentlyExpanded
    }))

    if (!isCurrentlyExpanded && !evidenceCache[id]) {
      setEvidenceLoading((prev) => ({ ...prev, [id]: true }))
      setEvidenceError((prev) => ({ ...prev, [id]: null }))

      try {
        const response = await fetch(`http://localhost:5000/api/browser/runs/${id}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to retrieve test run evidence.')
        }

        setEvidenceCache((prev) => ({ ...prev, [id]: data }))
      } catch (err) {
        setEvidenceError((prev) => ({ ...prev, [id]: err.message || 'Failed to load evidence.' }))
      } finally {
        setEvidenceLoading((prev) => ({ ...prev, [id]: false }))
      }
    }
  }

  const handleImageError = (id) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }))
  }

  const handleGenerateAiAnalysis = async (id) => {
    if (aiLoading[id]) {
      return
    }

    setAiLoading((prev) => ({ ...prev, [id]: true }))
    setAiError((prev) => ({ ...prev, [id]: null }))

    try {
      const response = await fetch(`http://localhost:5000/api/browser/runs/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate AI analysis.')
      }

      setEvidenceCache((prev) => {
        const current = prev[id] || {}
        return {
          ...prev,
          [id]: {
            ...current,
            aiAnalysis: data.aiAnalysis
          }
        }
      })
    } catch (err) {
      setAiError((prev) => ({ ...prev, [id]: err.message || 'An error occurred during AI analysis.' }))
    } finally {
      setAiLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const formatTimestamp = (dateString) => {
    if (!dateString) {
      return 'Unknown date'
    }
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-badge">Klyro Platform</div>
        <h1 className="app-title">Automated Browser Testing</h1>
        <p className="app-subtitle">
          Submit any website URL to run automated browser checks and inspect live page responses.
        </p>
      </header>

      <main className="app-main">
        <form className="run-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              className="url-input"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              aria-label="Website URL"
            />
            <button
              type="submit"
              className="submit-button"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? 'Running Test...' : 'Run Test'}
            </button>
          </div>
        </form>

        {isLoading && (
          <div className="status-card loading-card" role="status">
            <div className="spinner"></div>
            <div>
              <p className="status-title">Executing browser test...</p>
              <p className="status-detail">Launching Chromium and analyzing page response</p>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="status-card error-card" role="alert">
            <div className="error-header">
              <span className="status-badge error-badge">Error</span>
              <p className="error-message">{error}</p>
            </div>
          </div>
        )}

        {result && !isLoading && (
          <div className="result-card" role="region" aria-label="Test Run Result">
            <div className="result-header">
              <span className="status-badge success-badge">Test Completed</span>
              <p className="result-success-text">Browser test finished successfully.</p>
            </div>

            <div className="result-details">
              <div className="detail-row">
                <span className="detail-label">Tested URL</span>
                <span className="detail-value detail-url">{result.url}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Page Title</span>
                <span className="detail-value">{result.title || 'Untitled page'}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">HTTP Status</span>
                <span className="detail-value">
                  <span className={`status-pill ${result.status >= 200 && result.status < 400 ? 'status-ok' : 'status-warn'}`}>
                    {result.status ?? 'N/A'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        <section className="history-section" aria-label="Test Run History">
          <div className="history-header">
            <h2 className="history-title">Test Run History</h2>
            {!isHistoryLoading && !historyError && (
              <span className="history-count">
                {history.length} {history.length === 1 ? 'run' : 'runs'}
              </span>
            )}
          </div>

          {isHistoryLoading && (
            <div className="history-card history-loading" role="status">
              <div className="spinner"></div>
              <p className="status-title">Loading test history...</p>
            </div>
          )}

          {historyError && !isHistoryLoading && (
            <div className="history-card history-error" role="alert">
              <div className="error-header">
                <span className="status-badge error-badge">History Error</span>
                <p className="error-message">{historyError}</p>
              </div>
            </div>
          )}

          {!isHistoryLoading && !historyError && history.length === 0 && (
            <div className="history-card history-empty">
              <p className="empty-title">No test runs found</p>
              <p className="empty-subtitle">
                Enter a website URL above to start your first browser test run.
              </p>
            </div>
          )}

          {!isHistoryLoading && !historyError && history.length > 0 && (
            <div className="history-list">
              {history.map((run) => {
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
                    </div>

                    <div className="history-item-body">
                      <span className="history-page-title">{run.title || 'Untitled page'}</span>
                    </div>

                    <div className="history-item-footer">
                      <time className="history-timestamp" dateTime={run.createdAt}>
                        {formatTimestamp(run.createdAt)}
                      </time>
                      <button
                        type="button"
                        className="expand-button"
                        onClick={() => handleToggleExpand(run._id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}
                      </button>
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
      </main>
    </div>
  )
}

export default App
