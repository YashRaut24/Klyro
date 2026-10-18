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
                    </div>
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
