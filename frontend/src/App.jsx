import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [history, setHistory] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)

  const [expandedIds, setExpandedIds] = useState({})
  const [evidenceCache, setEvidenceCache] = useState({})
  const [evidenceLoading, setEvidenceLoading] = useState({})
  const [evidenceError, setEvidenceError] = useState({})
  const [imageErrors, setImageErrors] = useState({})
  const [aiLoading, setAiLoading] = useState({})
  const [aiError, setAiError] = useState({})
  const [verificationLoading, setVerificationLoading] = useState({})
  const [verificationError, setVerificationError] = useState({})
  const [filter, setFilter] = useState('all')
  const [alertStatus, setAlertStatus] = useState(null)
  const [isAlertStatusLoading, setIsAlertStatusLoading] = useState(true)
  const [alertStatusError, setAlertStatusError] = useState(null)
  const [alertHistory, setAlertHistory] = useState([])
  const [isAlertHistoryLoading, setIsAlertHistoryLoading] = useState(true)
  const [alertHistoryError, setAlertHistoryError] = useState(null)
  const [isTestPingLoading, setIsTestPingLoading] = useState(false)
  const [testPingFeedback, setTestPingFeedback] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(true)
  const [schedulesError, setSchedulesError] = useState(null)
  const [scheduleFormUrl, setScheduleFormUrl] = useState('')
  const [scheduleFormInterval, setScheduleFormInterval] = useState('')
  const [scheduleFormError, setScheduleFormError] = useState(null)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [scheduleActionLoading, setScheduleActionLoading] = useState({})
  const [scheduleActionError, setScheduleActionError] = useState(null)

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

  const fetchHistory = async () => {
    setHistoryError(null)

    try {
      const response = await fetch('http://localhost:5000/api/browser/runs')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve test runs.')
      }

      setHistory(Array.isArray(data) ? data : [])
    } catch (err) {
      setHistoryError(err.message || 'Failed to load test history.')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const fetchSchedules = async () => {
    setIsSchedulesLoading(true)
    setSchedulesError(null)

    try {
      const response = await fetch('http://localhost:5000/api/schedules')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve schedules.')
      }

      setSchedules(Array.isArray(data) ? data : [])
    } catch (err) {
      setSchedulesError(err.message || 'Failed to load schedules.')
    } finally {
      setIsSchedulesLoading(false)
    }
  }

  const handleCreateSchedule = async (e) => {
    e.preventDefault()

    if (isCreatingSchedule) {
      return
    }

    const trimmedUrl = scheduleFormUrl.trim()
    if (!trimmedUrl) {
      setScheduleFormError('A target website URL is required.')
      return
    }

    try {
      const parsed = new URL(trimmedUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setScheduleFormError('Only HTTP and HTTPS URLs are supported.')
        return
      }
    } catch {
      setScheduleFormError('Please enter a valid HTTP or HTTPS URL.')
      return
    }

    const intervalNum = Number(scheduleFormInterval)
    if (!scheduleFormInterval || !Number.isFinite(intervalNum) || intervalNum < 1) {
      setScheduleFormError('Interval must be a positive number of at least 1 minute.')
      return
    }

    setIsCreatingSchedule(true)
    setScheduleFormError(null)

    try {
      const response = await fetch('http://localhost:5000/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: trimmedUrl,
          intervalMinutes: intervalNum
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create schedule.')
      }

      setScheduleFormUrl('')
      setScheduleFormInterval('')
      await fetchSchedules()
    } catch (err) {
      setScheduleFormError(err.message || 'Failed to create schedule.')
    } finally {
      setIsCreatingSchedule(false)
    }
  }

  const handleToggleSchedule = async (schedule) => {
    const scheduleId = schedule._id || schedule.id
    if (scheduleActionLoading[scheduleId]) {
      return
    }

    setScheduleActionLoading((prev) => ({ ...prev, [scheduleId]: 'updating' }))
    setScheduleActionError(null)
    const nextEnabled = !schedule.enabled

    try {
      const response = await fetch(`http://localhost:5000/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled: nextEnabled })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update schedule status.')
      }

      await fetchSchedules()
    } catch (err) {
      setScheduleActionError(err.message || 'Failed to update schedule.')
    } finally {
      setScheduleActionLoading((prev) => {
        const next = { ...prev }
        delete next[scheduleId]
        return next
      })
    }
  }

  const handleDeleteSchedule = async (schedule) => {
    const scheduleId = schedule._id || schedule.id
    if (scheduleActionLoading[scheduleId]) {
      return
    }

    const confirmed = window.confirm(`Are you sure you want to delete the schedule for ${schedule.url}?`)
    if (!confirmed) {
      return
    }

    setScheduleActionLoading((prev) => ({ ...prev, [scheduleId]: 'deleting' }))
    setScheduleActionError(null)

    try {
      const response = await fetch(`http://localhost:5000/api/schedules/${scheduleId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete schedule.')
      }

      await fetchSchedules()
    } catch (err) {
      setScheduleActionError(err.message || 'Failed to delete schedule.')
    } finally {
      setScheduleActionLoading((prev) => {
        const next = { ...prev }
        delete next[scheduleId]
        return next
      })
    }
  }

  const formatInterval = (minutes) => {
    if (!minutes && minutes !== 0) return 'N/A'
    if (minutes === 1) return 'Every 1 minute'
    if (minutes < 60) return `Every ${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    if (remaining === 0) {
      return hours === 1 ? 'Every 1 hour' : `Every ${hours} hours`
    }
    return `Every ${hours}h ${remaining}m`
  }

  useEffect(() => {
    fetchHistory()
    fetchAlertStatus()
    fetchAlertHistory()
    fetchSchedules()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (isLoading) {
      return
    }

    const trimmedUrl = url.trim()

    if (!trimmedUrl) {
      setError('Please enter a website URL.')
      setResult(null)
      return
    }

    try {
      const parsedUrl = new URL(trimmedUrl)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        setError('Only HTTP and HTTPS URLs are supported.')
        setResult(null)
        return
      }
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com).')
      setResult(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('http://localhost:5000/api/browser/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: trimmedUrl })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete test run.')
      }

      setResult(data)
      fetchHistory()
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleExpand = async (id) => {
    const isCurrentlyExpanded = !!expandedIds[id]

    setExpandedIds((prev) => ({
      ...prev,
      [id]: !isCurrentlyExpanded
    }))

    if (!isCurrentlyExpanded && !evidenceCache[id]) {
      setEvidenceLoading((prev) => ({ ...prev, [id]: true }))
      setEvidenceError((prev) => ({ ...prev, [id]: null }))

      try {
        const response = await fetch(`http://localhost:5000/api/browser/runs/${id}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to retrieve test run evidence.')
        }

        setEvidenceCache((prev) => ({ ...prev, [id]: data }))
      } catch (err) {
        setEvidenceError((prev) => ({ ...prev, [id]: err.message || 'Failed to load evidence.' }))
      } finally {
        setEvidenceLoading((prev) => ({ ...prev, [id]: false }))
      }
    }
  }

  const handleImageError = (id) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }))
  }

  const handleGenerateAiAnalysis = async (id) => {
    if (aiLoading[id]) {
      return
    }

    setAiLoading((prev) => ({ ...prev, [id]: true }))
    setAiError((prev) => ({ ...prev, [id]: null }))

    try {
      const response = await fetch(`http://localhost:5000/api/browser/runs/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate AI analysis.')
      }

      setEvidenceCache((prev) => {
        const current = prev[id] || {}
        return {
          ...prev,
          [id]: {
            ...current,
            aiAnalysis: data.aiAnalysis
          }
        }
      })
    } catch (err) {
      setAiError((prev) => ({ ...prev, [id]: err.message || 'An error occurred during AI analysis.' }))
    } finally {
      setAiLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const handleVerifyFix = async (id) => {
    if (verificationLoading[id]) {
      return
    }

    setExpandedIds((prev) => ({
      ...prev,
      [id]: true
    }))

    if (!evidenceCache[id]) {
      setEvidenceLoading((prev) => ({ ...prev, [id]: true }))
      fetch(`http://localhost:5000/api/browser/runs/${id}`)
        .then((res) => res.json())
        .then((evidenceData) => {
          setEvidenceCache((prev) => ({
            ...prev,
            [id]: {
              ...evidenceData,
              ...(prev[id] || {})
            }
          }))
        })
        .catch(() => {})
        .finally(() => {
          setEvidenceLoading((prev) => ({ ...prev, [id]: false }))
        })
    }

    setVerificationLoading((prev) => ({ ...prev, [id]: true }))
    setVerificationError((prev) => ({ ...prev, [id]: null }))

    try {
      const response = await fetch(`http://localhost:5000/api/browser/runs/${id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete fix verification.')
      }

      const report = data.verificationReport || data.verification

      setEvidenceCache((prev) => {
        const current = prev[id] || {}
        return {
          ...prev,
          [id]: {
            ...current,
            verificationReport: report
          }
        }
      })

      setHistory((prev) =>
        prev.map((item) => (item._id === id ? { ...item, verificationReport: report } : item))
      )

      fetchHistory()
    } catch (err) {
      setVerificationError((prev) => ({
        ...prev,
        [id]: err.message || 'An unexpected error occurred during verification.'
      }))
    } finally {
      setVerificationLoading((prev) => ({ ...prev, [id]: false }))
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

  const formatVerificationStatus = (status) => {
    switch (status) {
      case 'verified':
        return 'Verified'
      case 'partially_verified':
        return 'Partially Verified'
      case 'not_verified':
        return 'Not Verified'
      case 'no_baseline_findings':
        return 'No Baseline Findings'
      default:
        return status || 'Unknown'
    }
  }

  const formatFilterLabel = (filterKey) => {
    switch (filterKey) {
      case 'verified':
        return 'Verified'
      case 'partially_verified':
        return 'Partially verified'
      case 'not_verified':
        return 'Not verified'
      case 'new_findings':
        return 'Runs with new findings'
      default:
        return 'All runs'
    }
  }

  const filteredHistory = history.filter((run) => {
    if (filter === 'all') {
      return true
    }

    const report = evidenceCache[run._id]?.verificationReport || run.verificationReport
    if (!report) {
      return false
    }

    if (filter === 'verified') {
      return report.status === 'verified'
    }

    if (filter === 'partially_verified') {
      return report.status === 'partially_verified'
    }

    if (filter === 'not_verified') {
      return report.status === 'not_verified'
    }

    if (filter === 'new_findings') {
      const newCount = report.summary?.new ?? (Array.isArray(report.newFindings) ? report.newFindings.length : 0)
      return newCount > 0
    }

    return true
  })

  const formatTimestamp = (dateString) => {
    if (!dateString) {
      return 'Unknown date'
    }
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-badge">Klyro Platform</div>
        <h1 className="app-title">Automated Browser Testing</h1>
        <p className="app-subtitle">
          Submit any website URL to run automated browser checks and inspect live page responses.
        </p>
      </header>

      <main className="app-main">
        <form className="run-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              className="url-input"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              aria-label="Website URL"
            />
            <button
              type="submit"
              className="submit-button"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? 'Running Test...' : 'Run Test'}
            </button>
          </div>
        </form>

        {isLoading && (
          <div className="status-card loading-card" role="status">
            <div className="spinner"></div>
            <div>
              <p className="status-title">Executing browser test...</p>
              <p className="status-detail">Launching Chromium and analyzing page response</p>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="status-card error-card" role="alert">
            <div className="error-header">
              <span className="status-badge error-badge">Error</span>
              <p className="error-message">{error}</p>
            </div>
          </div>
        )}

        {result && !isLoading && (
          <div className="result-card" role="region" aria-label="Test Run Result">
            <div className="result-header">
              <span className="status-badge success-badge">Test Completed</span>
              <p className="result-success-text">Browser test finished successfully.</p>
            </div>

            <div className="result-details">
              <div className="detail-row">
                <span className="detail-label">Tested URL</span>
                <span className="detail-value detail-url">{result.url}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Page Title</span>
                <span className="detail-value">{result.title || 'Untitled page'}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">HTTP Status</span>
                <span className="detail-value">
                  <span className={`status-pill ${result.status >= 200 && result.status < 400 ? 'status-ok' : 'status-warn'}`}>
                    {result.status ?? 'N/A'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        <section className="alerts-status-section" aria-label="Regression Alerts Status">
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

        <section className="schedules-section" aria-label="Scheduled Testing">
          <div className="schedules-header">
            <div className="schedules-title-group">
              <h2 className="schedules-title">Scheduled Testing</h2>
              {!isSchedulesLoading && !schedulesError && (
                <span className="schedules-count">
                  {schedules.length} {schedules.length === 1 ? 'schedule' : 'schedules'}
                </span>
              )}
            </div>
            <button
              type="button"
              className="schedules-refresh-btn"
              onClick={fetchSchedules}
              disabled={isSchedulesLoading}
              aria-label="Refresh schedules list"
            >
              {isSchedulesLoading ? 'Loading...' : 'Refresh Schedules'}
            </button>
          </div>

          <form className="schedule-form" onSubmit={handleCreateSchedule} noValidate>
            <h3 className="schedule-form-title">Create Test Schedule</h3>
            <div className="schedule-form-inputs">
              <div className="schedule-input-wrapper">
                <label htmlFor="schedule-url-input" className="schedule-input-label">
                  Target Website URL
                </label>
                <input
                  id="schedule-url-input"
                  type="url"
                  className="schedule-input"
                  placeholder="https://example.com"
                  value={scheduleFormUrl}
                  onChange={(e) => {
                    setScheduleFormUrl(e.target.value)
                    if (scheduleFormError) setScheduleFormError(null)
                  }}
                  disabled={isCreatingSchedule}
                  required
                />
              </div>
              <div className="schedule-input-wrapper schedule-interval-wrapper">
                <label htmlFor="schedule-interval-input" className="schedule-input-label">
                  Interval (Minutes)
                </label>
                <input
                  id="schedule-interval-input"
                  type="number"
                  min="1"
                  step="1"
                  className="schedule-input"
                  placeholder="10"
                  value={scheduleFormInterval}
                  onChange={(e) => {
                    setScheduleFormInterval(e.target.value)
                    if (scheduleFormError) setScheduleFormError(null)
                  }}
                  disabled={isCreatingSchedule}
                  required
                />
              </div>
              <button
                type="submit"
                className="schedule-submit-btn"
                disabled={isCreatingSchedule}
              >
                {isCreatingSchedule ? 'Creating...' : 'Create Schedule'}
              </button>
            </div>
            {scheduleFormError && (
              <div className="schedule-form-error" role="alert">
                <span>{scheduleFormError}</span>
              </div>
            )}
          </form>

          {scheduleActionError && (
            <div className="schedule-action-error" role="alert">
              <span>{scheduleActionError}</span>
              <button
                type="button"
                className="schedule-error-dismiss"
                onClick={() => setScheduleActionError(null)}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {isSchedulesLoading && schedules.length === 0 && (
            <div className="schedules-card schedules-loading" role="status">
              <div className="spinner small-spinner"></div>
              <span>Loading schedules...</span>
            </div>
          )}

          {schedulesError && !isSchedulesLoading && (
            <div className="schedules-card schedules-error" role="alert">
              <span className="error-message">{schedulesError}</span>
              <button
                type="button"
                className="schedules-retry-btn"
                onClick={fetchSchedules}
              >
                Retry
              </button>
            </div>
          )}

          {!isSchedulesLoading && !schedulesError && schedules.length === 0 && (
            <div className="schedules-card schedules-empty">
              <p className="empty-title">No scheduled tests</p>
              <p className="empty-subtitle">
                Create a schedule above to automatically test your website at periodic intervals.
              </p>
            </div>
          )}

          {schedules.length > 0 && (
            <div className="schedules-list" role="list" aria-label="Saved schedules list">
              {schedules.map((schedule) => {
                const id = schedule._id || schedule.id
                const isUpdating = scheduleActionLoading[id] === 'updating'
                const isDeleting = scheduleActionLoading[id] === 'deleting'
                const isActionPending = isUpdating || isDeleting

                return (
                  <article key={id} className="schedule-item" role="listitem">
                    <div className="schedule-item-info">
                      <div className="schedule-url-row">
                        <span className="schedule-url" title={schedule.url}>
                          {schedule.url}
                        </span>
                        <span className={`status-badge schedule-status-badge ${schedule.enabled ? 'schedule-status-active' : 'schedule-status-disabled'}`}>
                          {schedule.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="schedule-meta-row">
                        <span className="schedule-interval">
                          {formatInterval(schedule.intervalMinutes)}
                        </span>
                        {schedule.createdAt && (
                          <span className="schedule-created-at">
                            Created {formatTimestamp(schedule.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        type="button"
                        className={`schedule-toggle-btn ${schedule.enabled ? 'schedule-toggle-disable' : 'schedule-toggle-enable'}`}
                        onClick={() => handleToggleSchedule(schedule)}
                        disabled={isActionPending}
                        aria-label={`${schedule.enabled ? 'Disable' : 'Enable'} schedule for ${schedule.url}`}
                      >
                        {isUpdating ? 'Updating...' : (schedule.enabled ? 'Disable' : 'Enable')}
                      </button>
                      <button
                        type="button"
                        className="schedule-delete-btn"
                        onClick={() => handleDeleteSchedule(schedule)}
                        disabled={isActionPending}
                        aria-label={`Delete schedule for ${schedule.url}`}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="history-section" aria-label="Test Run History">
          <div className="history-header">
            <h2 className="history-title">Test Run History</h2>
            {!isHistoryLoading && !historyError && (
              <span className="history-count">
                {filter === 'all'
                  ? `${history.length} ${history.length === 1 ? 'run' : 'runs'}`
                  : `${filteredHistory.length} of ${history.length} runs`}
              </span>
            )}
          </div>

          <div className="history-filter-controls">
            <div className="history-filter-bar" role="toolbar" aria-label="Filter test runs">
              <span className="filter-label">Filter:</span>
              <div className="filter-buttons">
                <button
                  type="button"
                  data-filter="all"
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All runs
                </button>
                <button
                  type="button"
                  data-filter="verified"
                  className={`filter-btn ${filter === 'verified' ? 'active' : ''}`}
                  onClick={() => setFilter('verified')}
                >
                  Verified
                </button>
                <button
                  type="button"
                  data-filter="partially_verified"
                  className={`filter-btn ${filter === 'partially_verified' ? 'active' : ''}`}
                  onClick={() => setFilter('partially_verified')}
                >
                  Partially verified
                </button>
                <button
                  type="button"
                  data-filter="not_verified"
                  className={`filter-btn ${filter === 'not_verified' ? 'active' : ''}`}
                  onClick={() => setFilter('not_verified')}
                >
                  Not verified
                </button>
                <button
                  type="button"
                  data-filter="new_findings"
                  className={`filter-btn ${filter === 'new_findings' ? 'active' : ''}`}
                  onClick={() => setFilter('new_findings')}
                >
                  Runs with new findings
                </button>
              </div>
            </div>
            <select
              className="history-filter-select"
              aria-label="Filter test runs select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All runs</option>
              <option value="verified">Verified</option>
              <option value="partially_verified">Partially verified</option>
              <option value="not_verified">Not verified</option>
              <option value="new_findings">Runs with new findings</option>
            </select>
          </div>

          {isHistoryLoading && (
            <div className="history-card history-loading" role="status">
              <div className="spinner"></div>
              <p className="status-title">Loading test history...</p>
            </div>
          )}

          {historyError && !isHistoryLoading && (
            <div className="history-card history-error" role="alert">
              <div className="error-header">
                <span className="status-badge error-badge">History Error</span>
                <p className="error-message">{historyError}</p>
              </div>
            </div>
          )}

          {!isHistoryLoading && !historyError && history.length === 0 && (
            <div className="history-card history-empty">
              <p className="empty-title">No test runs found</p>
              <p className="empty-subtitle">
                Enter a website URL above to start your first browser test run.
              </p>
            </div>
          )}

          {!isHistoryLoading && !historyError && history.length > 0 && filteredHistory.length === 0 && (
            <div className="history-card history-empty filter-empty">
              <p className="empty-title">No matching test runs</p>
              <p className="empty-subtitle">
                No test runs match the selected filter ({formatFilterLabel(filter)}).
              </p>
              <button
                type="button"
                className="filter-reset-button"
                onClick={() => setFilter('all')}
              >
                Show all runs
              </button>
            </div>
          )}

          {!isHistoryLoading && !historyError && filteredHistory.length > 0 && (
            <div className="history-list">
              {filteredHistory.map((run) => {
                const isSuccess = run.status >= 200 && run.status < 400
                const isExpanded = !!expandedIds[run._id]
                const evidence = evidenceCache[run._id]
                const isLoadingEvidence = !!evidenceLoading[run._id]
                const itemError = evidenceError[run._id]
                const isAiLoading = !!aiLoading[run._id]
                const currentAiError = aiError[run._id]
                const currentAiAnalysis = evidence?.aiAnalysis
                const dualApproach = currentAiAnalysis?.dualApproach || currentAiAnalysis?.approaches
                const hasDualApproach = !!(dualApproach && (dualApproach.quickFix || dualApproach.structuralFix))
                const isVerifying = !!verificationLoading[run._id]
                const currentVerificationError = verificationError[run._id]
                const currentVerification = evidence?.verificationReport || run.verificationReport
                const runFindings = (evidence && Array.isArray(evidence.findings)) ? evidence.findings : (Array.isArray(run.findings) ? run.findings : [])
                const hasFindings = runFindings.length > 0

                const isVerificationRun = Boolean(run.baselineRunId)
                const relatedBaselineId = run.baselineRunId
                  ? (typeof run.baselineRunId === 'object'
                      ? (run.baselineRunId._id || run.baselineRunId.toString())
                      : String(run.baselineRunId))
                  : null

                const linkedVerificationRun = history.find((r) => {
                  if (!r.baselineRunId) return false
                  const bId = typeof r.baselineRunId === 'object'
                    ? (r.baselineRunId._id || r.baselineRunId.toString())
                    : String(r.baselineRunId)
                  return bId === String(run._id)
                })
                const rawVerificationId = currentVerification?.verificationRunId || linkedVerificationRun?._id
                const relatedVerificationId = rawVerificationId
                  ? (typeof rawVerificationId === 'object'
                      ? (rawVerificationId._id || rawVerificationId.toString())
                      : String(rawVerificationId))
                  : null
                const isBaselineRun = !isVerificationRun && (Boolean(relatedVerificationId) || Boolean(currentVerification))

                return (
                  <article key={run._id} className="history-item">
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

                    {isExpanded && (
                      <div className="evidence-panel">
                        {isLoadingEvidence && (
                          <div className="evidence-loading" role="status">
                            <div className="spinner"></div>
                            <p className="status-title">Loading test evidence...</p>
                          </div>
                        )}

                        {itemError && !isLoadingEvidence && (
                          <div className="evidence-error" role="alert">
                            <span className="status-badge error-badge">Error</span>
                            <p className="error-message">{itemError}</p>
                          </div>
                        )}

                        {evidence && !isLoadingEvidence && !itemError && (
                          <div className="evidence-content">
                            <div className="evidence-group findings-group">
                              <h4 className="evidence-group-title">
                                Analysis Findings ({evidence.findings?.length || 0})
                              </h4>
                              {evidence.findings && evidence.findings.length > 0 ? (
                                <ul className="findings-list">
                                  {evidence.findings.map((finding, idx) => (
                                    <li key={idx} className={`finding-item severity-${finding.severity || 'low'}`}>
                                      <div className="finding-header">
                                        <span className={`finding-severity severity-${finding.severity || 'low'}`}>
                                          {finding.severity}
                                        </span>
                                        <span className="finding-type">{finding.type}</span>
                                        <span className="finding-title">{finding.title}</span>
                                      </div>
                                      <p className="finding-description">{finding.description}</p>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No failure findings detected.</p>
                              )}
                            </div>

                            {evidence.findings && evidence.findings.length > 0 && (
                              <div className="evidence-group ai-analysis-group">
                                <div className="ai-section-header">
                                  <div className="ai-title-wrapper">
                                    <span className="ai-badge">AI Assistant</span>
                                    <h4 className="evidence-group-title">AI Analysis & Remediation</h4>
                                  </div>
                                  {!currentAiAnalysis && (
                                    <button
                                      type="button"
                                      className="ai-action-button"
                                      onClick={() => handleGenerateAiAnalysis(run._id)}
                                      disabled={isAiLoading}
                                    >
                                      {isAiLoading ? 'Analyzing...' : 'Generate AI Analysis'}
                                    </button>
                                  )}
                                </div>

                                {isAiLoading && (
                                  <div className="ai-loading" role="status">
                                    <div className="spinner"></div>
                                    <div>
                                      <p className="status-title">Generating AI root cause analysis...</p>
                                      <p className="status-detail">Synthesizing findings and remediation suggestions with Groq</p>
                                    </div>
                                  </div>
                                )}

                                {currentAiError && !isAiLoading && (
                                  <div className="ai-error-banner" role="alert">
                                    <div className="ai-error-content">
                                      <span className="status-badge error-badge">AI Error</span>
                                      <p className="ai-error-text">{currentAiError}</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="ai-retry-button"
                                      onClick={() => handleGenerateAiAnalysis(run._id)}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {currentAiAnalysis && !isAiLoading && (
                                  <div className="ai-analysis-card">
                                    <div className="ai-card-header">
                                      <div className="ai-model-tag">
                                        Model: {currentAiAnalysis.model || 'Groq AI'}
                                      </div>
                                      <button
                                        type="button"
                                        className="ai-regenerate-button"
                                        onClick={() => handleGenerateAiAnalysis(run._id)}
                                        disabled={isAiLoading}
                                      >
                                        Re-analyze
                                      </button>
                                    </div>

                                    <div className="ai-explanation-box">
                                      <h5 className="ai-subtitle">Likely Root Cause</h5>
                                      <p className="ai-explanation-text">{currentAiAnalysis.explanation}</p>
                                    </div>

                                    {hasDualApproach ? (
                                      <div className="dual-approach-section">
                                        <h5 className="ai-subtitle">Remediation Approaches</h5>
                                        <div className="dual-approach-container">
                                          <div className="approach-card quick-fix-card">
                                            <div className="approach-header">
                                              <span className="approach-badge quick-fix-badge">Quick Fix</span>
                                              <h6 className="approach-title">{dualApproach.quickFix?.title || 'Immediate Containment'}</h6>
                                            </div>
                                            <div className="approach-body">
                                              <div className="approach-field">
                                                <span className="approach-label">Explanation</span>
                                                <p className="approach-text">
                                                  {dualApproach.quickFix?.explanation || 'Insufficient evidence to provide immediate fix explanation.'}
                                                </p>
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Suggested Change</span>
                                                {dualApproach.quickFix?.suggestedChange ? (
                                                  <pre className="approach-code-block"><code>{dualApproach.quickFix.suggestedChange}</code></pre>
                                                ) : (
                                                  <p className="approach-insufficient">Insufficient evidence to provide exact code changes without inspecting source files.</p>
                                                )}
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Trade-offs</span>
                                                <p className="approach-text">
                                                  {dualApproach.quickFix?.tradeOffs || dualApproach.quickFix?.tradeoffs || 'None specified.'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="approach-card structural-fix-card">
                                            <div className="approach-header">
                                              <span className="approach-badge structural-fix-badge">Structural Fix</span>
                                              <h6 className="approach-title">{dualApproach.structuralFix?.title || 'Architectural Improvement'}</h6>
                                            </div>
                                            <div className="approach-body">
                                              <div className="approach-field">
                                                <span className="approach-label">Explanation</span>
                                                <p className="approach-text">
                                                  {dualApproach.structuralFix?.explanation || 'Insufficient evidence to provide architectural fix explanation.'}
                                                </p>
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Suggested Change</span>
                                                {dualApproach.structuralFix?.suggestedChange ? (
                                                  <pre className="approach-code-block"><code>{dualApproach.structuralFix.suggestedChange}</code></pre>
                                                ) : (
                                                  <p className="approach-insufficient">Insufficient evidence to provide exact structural changes without inspecting repository architecture.</p>
                                                )}
                                              </div>
                                              <div className="approach-field">
                                                <span className="approach-label">Trade-offs</span>
                                                <p className="approach-text">
                                                  {dualApproach.structuralFix?.tradeOffs || dualApproach.structuralFix?.tradeoffs || 'None specified.'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      Array.isArray(currentAiAnalysis.remediations) && currentAiAnalysis.remediations.length > 0 && (
                                        <div className="ai-remediations-box">
                                          <h5 className="ai-subtitle">Remediation Suggestions</h5>
                                          <div className="ai-remediations-list">
                                            {currentAiAnalysis.remediations.map((rem, rIdx) => (
                                              <div key={rIdx} className="ai-remediation-item">
                                                <div className="remediation-index">{rIdx + 1}</div>
                                                <div className="remediation-body">
                                                  <strong className="remediation-summary">{rem.summary}</strong>
                                                  <p className="remediation-suggestion">{rem.suggestion}</p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    )}

                                    <div className="ai-disclaimer">
                                      AI suggestions are diagnostic recommendations and have not been automatically applied or verified.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {hasFindings && (
                              <div className="evidence-group verification-group">
                                <div className="verification-section-header">
                                  <div className="verification-title-wrapper">
                                    <span className="verification-badge">Fix Verification</span>
                                    <h4 className="evidence-group-title">Fix Verification & Comparison</h4>
                                  </div>
                                  <button
                                    type="button"
                                    className="verify-fix-button verify-action-button"
                                    onClick={() => handleVerifyFix(run._id)}
                                    disabled={isVerifying}
                                  >
                                    {isVerifying ? 'Verifying Fix...' : (currentVerification ? 'Re-verify Fix' : 'Verify Fix')}
                                  </button>
                                </div>

                                {isVerifying && (
                                  <div className="verification-loading" role="status">
                                    <div className="spinner"></div>
                                    <div>
                                      <p className="status-title">Verifying fix against live URL...</p>
                                      <p className="status-detail">Running fresh browser test and comparing findings with baseline</p>
                                    </div>
                                  </div>
                                )}

                                {currentVerificationError && !isVerifying && (
                                  <div className="verification-error-banner" role="alert">
                                    <div className="verification-error-content">
                                      <span className="status-badge error-badge">Verification Error</span>
                                      <p className="verification-error-text">{currentVerificationError}</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="verification-retry-button"
                                      onClick={() => handleVerifyFix(run._id)}
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}

                                {currentVerification && !isVerifying && (
                                  <div className="verification-card">
                                    <div className="verification-card-header">
                                      <div className="verification-status-wrapper">
                                        <span className="verification-status-label">Overall Status:</span>
                                        <span className={`status-badge verification-status-badge verification-status-${currentVerification.status}`}>
                                          {formatVerificationStatus(currentVerification.status)}
                                        </span>
                                      </div>
                                      {currentVerification.verifiedAt && (
                                        <time className="verification-timestamp" dateTime={currentVerification.verifiedAt}>
                                          Verified: {formatTimestamp(currentVerification.verifiedAt)}
                                        </time>
                                      )}
                                    </div>

                                    <div className="verification-stats-grid">
                                      <div className="stat-card stat-resolved">
                                        <span className="stat-number">{currentVerification.summary?.resolved ?? 0}</span>
                                        <span className="stat-label">Resolved Findings</span>
                                      </div>
                                      <div className="stat-card stat-persistent">
                                        <span className="stat-number">{currentVerification.summary?.persistent ?? 0}</span>
                                        <span className="stat-label">Persistent Findings</span>
                                      </div>
                                      <div className="stat-card stat-new">
                                        <span className="stat-number">{currentVerification.summary?.new ?? 0}</span>
                                        <span className="stat-label">New Findings</span>
                                      </div>
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title resolved-title">
                                        Resolved Findings ({currentVerification.resolvedFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.resolvedFindings) && currentVerification.resolvedFindings.length > 0 ? (
                                        <ul className="verification-findings-list resolved-list">
                                          {currentVerification.resolvedFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No resolved findings.</p>
                                      )}
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title persistent-title">
                                        Persistent Findings ({currentVerification.persistentFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.persistentFindings) && currentVerification.persistentFindings.length > 0 ? (
                                        <ul className="verification-findings-list persistent-list">
                                          {currentVerification.persistentFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No persistent findings.</p>
                                      )}
                                    </div>

                                    <div className="verification-category">
                                      <h5 className="verification-category-title new-title">
                                        New Findings or Regressions ({currentVerification.newFindings?.length ?? 0})
                                      </h5>
                                      {Array.isArray(currentVerification.newFindings) && currentVerification.newFindings.length > 0 ? (
                                        <ul className="verification-findings-list new-list">
                                          {currentVerification.newFindings.map((f, idx) => (
                                            <li key={idx} className={`finding-item severity-${f.severity || 'low'} verification-finding-item`}>
                                              <div className="finding-header">
                                                <span className={`finding-severity severity-${f.severity || 'low'}`}>{f.severity}</span>
                                                <span className="finding-type">{f.type}</span>
                                                <span className="finding-title">{f.title}</span>
                                              </div>
                                              <p className="finding-description">{f.description}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="evidence-empty verification-empty">No new findings or regressions detected.</p>
                                      )}
                                    </div>

                                    <div className="verification-disclaimer">
                                      Verification reflects observed differences between automated test runs and does not establish code causation.
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Page Errors ({evidence.pageErrors?.length || 0})
                              </h4>
                              {evidence.pageErrors && evidence.pageErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.pageErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <span className="evidence-badge error-badge">{err.name || 'Error'}</span>
                                      <span className="evidence-text">{err.message}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No page errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Console Errors ({evidence.consoleErrors?.length || 0})
                              </h4>
                              {evidence.consoleErrors && evidence.consoleErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.consoleErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <span className="evidence-text">{err.text}</span>
                                      {err.location && (err.location.url || err.location.lineNumber || err.location.line) && (
                                        <span className="evidence-location">
                                          {err.location.url || 'inline'}:{err.location.lineNumber ?? err.location.line ?? 0}:{err.location.columnNumber ?? err.location.column ?? 0}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No console errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                Failed Network Requests ({evidence.failedRequests?.length || 0})
                              </h4>
                              {evidence.failedRequests && evidence.failedRequests.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.failedRequests.map((req, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <div className="evidence-req-header">
                                        <span className="method-badge">{req.method || 'GET'}</span>
                                        <span className="evidence-url">{req.url}</span>
                                      </div>
                                      <span className="evidence-failure">{req.failure || 'Network request failed'}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No failed network requests detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">
                                HTTP Errors ({evidence.httpErrors?.length || 0})
                              </h4>
                              {evidence.httpErrors && evidence.httpErrors.length > 0 ? (
                                <ul className="evidence-list">
                                  {evidence.httpErrors.map((err, idx) => (
                                    <li key={idx} className="evidence-item">
                                      <div className="evidence-req-header">
                                        <span className="status-pill status-warn">HTTP {err.status}</span>
                                        <span className="evidence-url">{err.url}</span>
                                      </div>
                                      {err.statusText && <span className="evidence-failure">{err.statusText}</span>}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="evidence-empty">No HTTP errors detected.</p>
                              )}
                            </div>

                            <div className="evidence-group">
                              <h4 className="evidence-group-title">Screenshot Preview</h4>
                              {evidence.screenshot && !imageErrors[run._id] ? (
                                <div className="screenshot-wrapper">
                                  <img
                                    src={evidence.screenshot.startsWith('http') ? evidence.screenshot : `http://localhost:5000/${evidence.screenshot.replace(/^\/+/, '')}`}
                                    alt={`Screenshot of ${evidence.url}`}
                                    className="screenshot-preview"
                                    onError={() => handleImageError(run._id)}
                                  />
                                </div>
                              ) : (
                                <p className="evidence-empty">
                                  {evidence.screenshotError || (imageErrors[run._id] ? 'Unable to load screenshot preview.' : 'No screenshot available for this run.')}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
