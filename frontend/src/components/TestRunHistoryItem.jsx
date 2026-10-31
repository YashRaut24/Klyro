import './TestRunHistoryItem.css'
import TestRunHistoryHeader from './TestRunHistoryHeader.jsx'
import TestRunHistoryBody from './TestRunHistoryBody.jsx'
import TestRunHistoryFooter from './TestRunHistoryFooter.jsx'
import TestRunHistoryEvidence from './TestRunHistoryEvidence.jsx'

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
      <TestRunHistoryHeader
        run={run}
        isSuccess={isSuccess}
        currentVerification={currentVerification}
        formatVerificationStatus={formatVerificationStatus}
      />

      <TestRunHistoryBody
        title={run.title || 'Untitled page'}
        isBaselineRun={isBaselineRun}
        isVerificationRun={isVerificationRun}
        relatedVerificationId={relatedVerificationId}
        relatedBaselineId={relatedBaselineId}
      />

      <TestRunHistoryFooter
        dateTime={run.createdAt}
        timestamp={formatTimestamp(run.createdAt)}
        runId={run._id}
        hasFindings={hasFindings}
        isVerifying={isVerifying}
        currentVerification={currentVerification}
        isExpanded={isExpanded}
        handleVerifyFix={handleVerifyFix}
        handleToggleExpand={handleToggleExpand}
      />

      {children && <TestRunHistoryEvidence>{children}</TestRunHistoryEvidence>}
    </article>
  )
}

export default TestRunHistoryItem
