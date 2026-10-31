import './TestRunHistoryBody.css'
import TestRunHistoryMetadata from './TestRunHistoryMetadata.jsx'
import TestRunStatusBadges from './TestRunStatusBadges.jsx'

function TestRunHistoryBody({
  title,
  isBaselineRun,
  isVerificationRun,
  relatedVerificationId,
  relatedBaselineId
}) {
  return (
    <div className="history-item-body">
      <TestRunHistoryMetadata variant="title" title={title} />
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
  )
}

export default TestRunHistoryBody
