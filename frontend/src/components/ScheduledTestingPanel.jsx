import { useEffect, useState } from 'react'
import './ScheduledTestingPanel.css'

function ScheduledTestingPanel({ formatTimestamp }) {
  const [schedules, setSchedules] = useState([])
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(true)
  const [schedulesError, setSchedulesError] = useState(null)
  const [scheduleFormUrl, setScheduleFormUrl] = useState('')
  const [scheduleFormInterval, setScheduleFormInterval] = useState('')
  const [scheduleFormError, setScheduleFormError] = useState(null)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [scheduleActionLoading, setScheduleActionLoading] = useState({})
  const [scheduleActionError, setScheduleActionError] = useState(null)

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

  useEffect(() => {
    fetchSchedules()
  }, [])

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

  return (
    <section className="schedules-section" id="schedules" aria-label="Scheduled Testing">
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
  )
}

export default ScheduledTestingPanel
