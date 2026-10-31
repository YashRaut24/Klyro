import './TestRunHistoryMetadata.css'

function TestRunHistoryMetadata({ variant, title, timestamp, dateTime }) {
  if (variant === 'title') {
    return <span className="history-page-title">{title}</span>
  }

  if (variant === 'timestamp') {
    return (
      <time className="history-timestamp" dateTime={dateTime}>
        {timestamp}
      </time>
    )
  }

  return null
}

export default TestRunHistoryMetadata
