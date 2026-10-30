import './TestRunSubmissionPanel.css'
import PerformanceMetricsPanel from './PerformanceMetricsPanel.jsx'

function TestRunSubmissionPanel({ url, setUrl, isLoading, error, result, handleSubmit }) {
  return (
    <>
      <form className="run-form" id="run-test" onSubmit={handleSubmit}>
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

          <div className="result-performance-section" aria-label="Performance Metrics">
            <h3 className="result-performance-title">Performance Metrics</h3>
            <PerformanceMetricsPanel metrics={result.performanceMetrics} />
          </div>
        </div>
      )}
    </>
  )
}

export default TestRunSubmissionPanel
