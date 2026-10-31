import './TestRunHistoryItem.css'
import TestRunStatusBadges from './TestRunStatusBadges.jsx'

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
        <TestRunStatusBadges variant="run-status" isSuccess={isSuccess} />
        <span className="history-url">{run.url}</span>
        <TestRunStatusBadges
          variant="http-verification"
          run={run}
          isSuccess={isSuccess}
          currentVerification={currentVerification}
          formatVerificationStatus={formatVerificationStatus}
        />
      </div>

      <div className="history-item-body">
        <span className="history-page-title">{run.title || 'Untitled page'}</span>
        {(isBaselineRun || isVerificationRun) && (
          <div className="history-item-meta">
            <TestRunStatusBadges
              variant="run-linkage"
              isBaselineRun={isBaselineRun}
              isVerificationRun={isVerificationRun}
              relatedVerificationId={relatedVerificationId}
              relatedBaselineId={relatedBaselineId}
            />
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
