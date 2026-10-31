import './TestRunHistoryActions.css'

function TestRunHistoryActions({
  runId,
  hasFindings,
  isVerifying,
  currentVerification,
  isExpanded,
  handleVerifyFix,
  handleToggleExpand
}) {
  return (
    <div className="history-actions">
      {hasFindings && (
        <button
          type="button"
          className="verify-fix-button"
          onClick={() => handleVerifyFix(runId)}
          disabled={isVerifying}
        >
          {isVerifying ? 'Verifying Fix...' : (currentVerification ? 'Re-verify Fix' : 'Verify Fix')}
        </button>
      )}
      <button
        type="button"
        className="expand-button"
        onClick={() => handleToggleExpand(runId)}
        aria-expanded={isExpanded}
      >
        {isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}
      </button>
    </div>
  )
}

export default TestRunHistoryActions
