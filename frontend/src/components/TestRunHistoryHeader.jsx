import './TestRunHistoryHeader.css'
import TestRunStatusBadges from './TestRunStatusBadges.jsx'
import TestRunHistoryUrl from './TestRunHistoryUrl.jsx'

function TestRunHistoryHeader({ run, isSuccess, currentVerification, formatVerificationStatus }) {
  return (
    <div className="history-item-header">
      <TestRunStatusBadges variant="run-status" isSuccess={isSuccess} />
      <TestRunHistoryUrl url={run.url} />
      <TestRunStatusBadges
        variant="http-verification"
        run={run}
        isSuccess={isSuccess}
        currentVerification={currentVerification}
        formatVerificationStatus={formatVerificationStatus}
      />
    </div>
  )
}

export default TestRunHistoryHeader
