import { useEffect, useState } from 'react'
import './RegressionAlertsPanel.css'

function RegressionAlertsPanel({ formatTimestamp, refreshToken }) {
  const [alertStatus, setAlertStatus] = useState(null)
  const [isAlertStatusLoading, setIsAlertStatusLoading] = useState(true)
  const [alertStatusError, setAlertStatusError] = useState(null)
  const [alertHistory, setAlertHistory] = useState([])
  const [isAlertHistoryLoading, setIsAlertHistoryLoading] = useState(true)
  const [alertHistoryError, setAlertHistoryError] = useState(null)
  const [isTestPingLoading, setIsTestPingLoading] = useState(false)
  const [testPingFeedback, setTestPingFeedback] = useState(null)

  const fetchAlertStatus = async () => {
    setIsAlertStatusLoading(true)
    setAlertStatusError(null)

    try {
      const response = await fetch('http://localhost:5000/api/regression-alerts/status')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve alert status.')
      }

      setAlertStatus(data)
    } catch (err) {
      setAlertStatusError(err.message || 'Failed to load alert status.')
    } finally {
      setIsAlertStatusLoading(false)
    }
  }

  const fetchAlertHistory = async () => {
    setIsAlertHistoryLoading(true)
    setAlertHistoryError(null)

    try {
      const response = await fetch('http://localhost:5000/api/regression-alerts/history')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve alert history.')
      }

      setAlertHistory(Array.isArray(data.history) ? data.history : [])
    } catch (err) {
      setAlertHistoryError(err.message || 'Failed to load delivery history.')
    } finally {
      setIsAlertHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchAlertStatus()
    fetchAlertHistory()
  }, [refreshToken])

  const handleTestWebhook = async () => {
    if (isTestPingLoading) {
      return
    }

    setIsTestPingLoading(true)
    setTestPingFeedback(null)

    try {
      const response = await fetch('http://localhost:5000/api/regression-alerts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        setTestPingFeedback({
          type: 'error',
          message: data.message || data.error || 'Manual test ping failed.'
        })
      } else {
        setTestPingFeedback({
          type: 'success',
          message: data.message || 'Manual test ping delivered successfully.'
        })
      }
    } catch (err) {
      setTestPingFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred while sending test ping.'
      })
    } finally {
      setIsTestPingLoading(false)
      fetchAlertStatus()
      fetchAlertHistory()
    }
  }

  const formatEventType = (eventType) => {
    switch (eventType) {
      case 'manual_test_ping':
        return 'Test Ping'
      case 'regression_alert':
        return 'Regression Alert'
      default:
        return eventType || 'Alert'
    }
  }

  const formatOutcomeStatus = (status) => {
    switch (status) {
      case 'delivered':
        return 'Delivered'
      case 'failed':
        return 'Failed'
      case 'timed_out':
        return 'Timed Out'
      case 'skipped':
        return 'Skipped'
      default:
        return 'No attempts yet'
    }
  }

  return (
    <section className="alerts-status-section" id="alerts" aria-label="Regression Alerts Status">
      <div className="alerts-status-header">
        <div className="alerts-status-title-group">
          <h2 className="alerts-status-title">Regression Alerts</h2>
          <span className={`config-badge ${alertStatus?.configured ? 'config-badge-on' : 'config-badge-off'}`}>
            {alertStatus?.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>
        <div className="alerts-header-actions">
          <button
            type="button"
            className="alerts-test-btn"
            onClick={handleTestWebhook}
            disabled={isTestPingLoading}
            aria-label="Test webhook endpoint"
          >
            {isTestPingLoading ? 'Sending Test...' : 'Test Webhook'}
          </button>
          <button
            type="button"
            className="alerts-refresh-btn"
            onClick={() => {
              fetchAlertStatus()
              fetchAlertHistory()
            }}
            disabled={isAlertStatusLoading || isAlertHistoryLoading}
            aria-label="Refresh alert status"
          >
            {isAlertStatusLoading || isAlertHistoryLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {testPingFeedback && (
        <div className={`alerts-feedback alerts-feedback-${testPingFeedback.type}`} role="status">
          <span className="alerts-feedback-text">{testPingFeedback.message}</span>
          <button
            type="button"
            className="alerts-feedback-close"
            onClick={() => setTestPingFeedback(null)}
            aria-label="Dismiss feedback"
          >
            ×
          </button>
        </div>
      )}

      {isAlertStatusLoading && !alertStatus && (
        <div className="alerts-status-body alerts-status-loading" role="status">
          <div className="spinner small-spinner"></div>
          <span>Checking alert status...</span>
        </div>
      )}

      {alertStatusError && !isAlertStatusLoading && (
        <div className="alerts-status-body alerts-status-error" role="alert">
          <span className="alerts-error-text">{alertStatusError}</span>
        </div>
      )}

      {!alertStatusError && alertStatus && (
        <div className="alerts-status-card">
          <div className="alerts-status-row">
            <span className="alerts-label">Latest Delivery Outcome:</span>
            <span className={`alerts-outcome-badge alerts-outcome-${alertStatus.status || 'unavailable'}`}>
              {formatOutcomeStatus(alertStatus.status)}
            </span>
          </div>
          {alertStatus.timestamp && (
            <div className="alerts-status-row">
              <span className="alerts-label">Attempted At:</span>
              <span className="alerts-timestamp">{formatTimestamp(alertStatus.timestamp)}</span>
            </div>
          )}
          <div className="alerts-status-row alerts-message-row">
            <span className="alerts-label">Details:</span>
            <span className="alerts-message">{alertStatus.message || 'No delivery details available'}</span>
          </div>
        </div>
      )}

      <div className="alerts-history-container">
        <div className="alerts-history-header">
          <div className="alerts-history-title-group">
            <h3 className="alerts-history-title">Recent Delivery History</h3>
            {!isAlertHistoryLoading && !alertHistoryError && (
              <span className="alerts-history-count">
                {alertHistory.length} {alertHistory.length === 1 ? 'attempt' : 'attempts'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="alerts-history-refresh-btn"
            onClick={fetchAlertHistory}
            disabled={isAlertHistoryLoading}
            aria-label="Refresh delivery history"
          >
            {isAlertHistoryLoading ? 'Loading...' : 'Refresh History'}
          </button>
        </div>

        {isAlertHistoryLoading && alertHistory.length === 0 && (
          <div className="alerts-history-loading" role="status">
            <div className="spinner small-spinner"></div>
            <span>Loading delivery history...</span>
          </div>
        )}

        {alertHistoryError && (
          <div className="alerts-history-error" role="alert">
            <span>{alertHistoryError}</span>
          </div>
        )}

        {!isAlertHistoryLoading && !alertHistoryError && alertHistory.length === 0 && (
          <div className="alerts-history-empty">
            <p>No webhook delivery attempts recorded yet.</p>
          </div>
        )}

        {alertHistory.length > 0 && (
          <div className="alerts-history-list" role="list" aria-label="Webhook delivery attempts">
            {alertHistory.map((item) => (
              <div key={item.id} className="alerts-history-item" role="listitem">
                <div className="alerts-history-item-top">
                  <div className="alerts-history-item-tags">
                    <span className={`alerts-event-tag alerts-event-${item.eventType}`}>
                      {formatEventType(item.eventType)}
                    </span>
                    <span className={`alerts-outcome-badge alerts-outcome-${item.status}`}>
                      {formatOutcomeStatus(item.status)}
                    </span>
                    {item.httpStatus && (
                      <span className="alerts-http-status">HTTP {item.httpStatus}</span>
                    )}
                  </div>
                  <span className="alerts-history-time">{formatTimestamp(item.timestamp)}</span>
                </div>
                <div className="alerts-history-item-body">
                  <p className="alerts-history-msg">{item.message}</p>
                  {(item.baselineRunId || item.verificationRunId) && (
                    <div className="alerts-history-runs">
                      {item.baselineRunId && (
                        <span className="alerts-run-tag">
                          Baseline: {item.baselineRunId.slice(0, 8)}...
                        </span>
                      )}
                      {item.verificationRunId && (
                        <span className="alerts-run-tag">
                          Verification: {item.verificationRunId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default RegressionAlertsPanel
