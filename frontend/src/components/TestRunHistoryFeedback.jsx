import './TestRunHistoryFeedback.css'

function TestRunHistoryFeedback({ type, error }) {
  if (type === 'loading') {
    return (
      <div className="history-card history-loading" role="status">
        <div className="spinner"></div>
        <p className="status-title">Loading test history...</p>
      </div>
    )
  }

  if (type === 'error') {
    return (
      <div className="history-card history-error" role="alert">
        <div className="error-header">
          <span className="status-badge error-badge">History Error</span>
          <p className="error-message">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="history-card history-empty">
      <p className="empty-title">No test runs found</p>
      <p className="empty-subtitle">
        Enter a website URL above to start your first browser test run.
      </p>
    </div>
  )
}

export default TestRunHistoryFeedback
