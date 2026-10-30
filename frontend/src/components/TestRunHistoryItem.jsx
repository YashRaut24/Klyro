import './TestRunHistoryItem.css'

function TestRunHistoryItem({
  run,
  isSuccess,
  currentVerification,
  isBaselineRun,
  isVerificationRun,
  relatedVerificationId,
  relatedBaselineId,
  hasFindings,
  isVerifying,
  isExpanded,
  formatTimestamp,
  formatVerificationStatus,
  handleVerifyFix,
  handleToggleExpand,
  children
}) {
  return (
    <article className="history-item">
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

      {children}
    </article>
  )
}

export default TestRunHistoryItem
