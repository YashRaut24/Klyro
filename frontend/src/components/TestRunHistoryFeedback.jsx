import './TestRunHistoryFeedback.css'

function TestRunHistoryFeedback({ error }) {
  return (
    <div className="history-card history-error" role="alert">
      <div className="error-header">
        <span className="status-badge error-badge">History Error</span>
        <p className="error-message">{error}</p>
      </div>
    </div>
  )
}

export default TestRunHistoryFeedback
