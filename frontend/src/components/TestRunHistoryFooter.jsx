import './TestRunHistoryFooter.css'
import TestRunHistoryMetadata from './TestRunHistoryMetadata.jsx'
import TestRunHistoryActions from './TestRunHistoryActions.jsx'

function TestRunHistoryFooter({
  dateTime,
  timestamp,
  runId,
  hasFindings,
  isVerifying,
  currentVerification,
  isExpanded,
  handleVerifyFix,
  handleToggleExpand
}) {
  return (
    <div className="history-item-footer">
      <TestRunHistoryMetadata variant="timestamp" dateTime={dateTime} timestamp={timestamp} />
      <TestRunHistoryActions
        runId={runId}
        hasFindings={hasFindings}
        isVerifying={isVerifying}
        currentVerification={currentVerification}
        isExpanded={isExpanded}
        handleVerifyFix={handleVerifyFix}
        handleToggleExpand={handleToggleExpand}
      />
    </div>
  )
}

export default TestRunHistoryFooter
