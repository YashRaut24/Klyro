import './TestRunHistoryStates.css'

function TestRunHistoryStates({ type }) {
  if (type === 'loading') {
    return (
      <div className="history-card history-loading" role="status">
        <div className="spinner"></div>
        <p className="status-title">Loading test history...</p>
      </div>
    )
  }

  if (type === 'empty') {
    return (
      <div className="history-card history-empty">
        <p className="empty-title">No test runs found</p>
        <p className="empty-subtitle">
          Enter a website URL above to start your first browser test run.
        </p>
      </div>
    )
  }

  return null
}

export default TestRunHistoryStates
