import { useState } from 'react'
import './DashboardPage.css'
import RegressionAlertsPanel from '../components/RegressionAlertsPanel.jsx'
import TestRunHistoryPanel from '../components/TestRunHistoryPanel.jsx'
import Sidebar from '../components/Sidebar.jsx'
import ScheduledTestingPanel from '../components/ScheduledTestingPanel.jsx'
import TestRunSubmissionPanel from '../components/TestRunSubmissionPanel.jsx'
import TopBar from '../components/TopBar.jsx'

function DashboardPage() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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
  const [alertRefreshToken, setAlertRefreshToken] = useState(0)
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0)

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
      setHistoryRefreshToken((current) => current + 1)
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

      setHistoryRefreshToken((current) => current + 1)
    } catch (err) {
      setVerificationError((prev) => ({
        ...prev,
        [id]: err.message || 'An unexpected error occurred during verification.'
      }))
    } finally {
      setVerificationLoading((prev) => ({ ...prev, [id]: false }))
      setAlertRefreshToken((current) => current + 1)
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
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">Skip to dashboard content</a>
      <Sidebar />
      <div className="dashboard-main">
        <TopBar />
        <div className="dashboard-stage" id="main-content">
          <div className="app-container">
      <header className="app-header">
        <div className="app-badge">Klyro Platform</div>
        <h1 className="app-title">Automated Browser Testing</h1>
        <p className="app-subtitle">
          Submit any website URL to run automated browser checks and inspect live page responses.
        </p>
      </header>

      <main className="app-main">
        <TestRunSubmissionPanel
          url={url}
          setUrl={setUrl}
          isLoading={isLoading}
          error={error}
          result={result}
          handleSubmit={handleSubmit}
        />

        <RegressionAlertsPanel
          formatTimestamp={formatTimestamp}
          refreshToken={alertRefreshToken}
        />

        <ScheduledTestingPanel formatTimestamp={formatTimestamp} />

        <TestRunHistoryPanel
          refreshToken={historyRefreshToken}
          filter={filter}
          setFilter={setFilter}
          formatFilterLabel={formatFilterLabel}
          expandedIds={expandedIds}
          evidenceCache={evidenceCache}
          evidenceLoading={evidenceLoading}
          evidenceError={evidenceError}
          aiLoading={aiLoading}
          aiError={aiError}
          verificationLoading={verificationLoading}
          verificationError={verificationError}
          imageErrors={imageErrors}
          formatTimestamp={formatTimestamp}
          formatVerificationStatus={formatVerificationStatus}
          handleVerifyFix={handleVerifyFix}
          handleToggleExpand={handleToggleExpand}
          handleGenerateAiAnalysis={handleGenerateAiAnalysis}
          handleImageError={handleImageError}
        />
      </main>
    </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
