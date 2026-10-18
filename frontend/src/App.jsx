import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
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
      </main>
    </div>
  )
}

export default App
