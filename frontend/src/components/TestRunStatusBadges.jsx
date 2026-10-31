import './TestRunStatusBadges.css'

function TestRunStatusBadges({
  variant,
  run,
  isSuccess,
  currentVerification,
  formatVerificationStatus,
  isBaselineRun,
  isVerificationRun,
  relatedVerificationId,
  relatedBaselineId
}) {
  if (variant === 'run-status') {
    return (
      <span className={`status-indicator ${isSuccess ? 'indicator-ok' : 'indicator-error'}`}>
        {isSuccess ? 'Success' : 'Error'}
      </span>
    )
  }

  if (variant === 'http-verification') {
    return (
      <>
        <span className={`status-pill ${isSuccess ? 'status-ok' : 'status-warn'}`}>
          {run.status ? `HTTP ${run.status}` : 'No Status'}
        </span>
        {currentVerification?.status && (
          <span className={`status-badge history-verification-badge verification-status-badge verification-status-${currentVerification.status}`}>
            {formatVerificationStatus(currentVerification.status)}
          </span>
        )}
      </>
    )
  }

  if (variant === 'run-linkage') {
    return (
      <>
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
      </>
    )
  }

  return null
}

export default TestRunStatusBadges
