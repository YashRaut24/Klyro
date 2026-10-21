const backendStatusPill = document.getElementById('backendStatusPill')
const backendStatusDot = document.getElementById('backendStatusDot')
const backendStatusLabel = document.getElementById('backendStatusLabel')
const backendMessage = document.getElementById('backendMessage')
const checkBackendBtn = document.getElementById('checkBackendBtn')

const tabStatusBadge = document.getElementById('tabStatusBadge')
const tabTitleDisplay = document.getElementById('tabTitleDisplay')
const tabUrlDisplay = document.getElementById('tabUrlDisplay')
const unsupportedWarning = document.getElementById('unsupportedWarning')
const inspectBtn = document.getElementById('inspectBtn')

const inspectionSection = document.getElementById('inspectionSection')
const inspectionError = document.getElementById('inspectionError')
const inspectionDetails = document.getElementById('inspectionDetails')
const inspectedAtBadge = document.getElementById('inspectedAtBadge')

const resReadyState = document.getElementById('resReadyState')
const resCharset = document.getElementById('resCharset')
const resViewport = document.getElementById('resViewport')
const resDoctype = document.getElementById('resDoctype')
const resLanguage = document.getElementById('resLanguage')

let activeTabInfo = null

const isSupportedUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const formatTimestamp = (isoString) => {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString()
  } catch {
    return isoString
  }
}

const checkBackendHealth = async () => {
  backendStatusLabel.textContent = 'Checking...'
  backendStatusDot.className = 'status-dot dot-pending'
  backendStatusPill.className = 'backend-status-pill status-pill-pending'
  backendMessage.textContent = 'Checking connection to http://localhost:5000...'
  checkBackendBtn.disabled = true

  const handleResult = (result) => {
    checkBackendBtn.disabled = false
    if (result && result.ok) {
      backendStatusLabel.textContent = 'Connected'
      backendStatusDot.className = 'status-dot dot-success'
      backendStatusPill.className = 'backend-status-pill status-pill-success'
      backendMessage.textContent = result.data?.message || 'Klyro backend is running and reachable.'
    } else {
      backendStatusLabel.textContent = 'Disconnected'
      backendStatusDot.className = 'status-dot dot-error'
      backendStatusPill.className = 'backend-status-pill status-pill-error'
      backendMessage.textContent = result?.error || 'Cannot reach backend at http://localhost:5000. Verify server is running.'
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ action: 'CHECK_BACKEND_HEALTH' }, (response) => {
      if (chrome.runtime.lastError) {
        fallbackFetch().then(handleResult)
      } else {
        handleResult(response)
      }
    })
  } else {
    const fallbackResult = await fallbackFetch()
    handleResult(fallbackResult)
  }
}

const fallbackFetch = async () => {
  try {
    const res = await fetch('http://localhost:5000/api/health', {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) {
      return { ok: false, error: `Backend responded with HTTP ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: 'Cannot connect to http://localhost:5000. Ensure backend server is started.' }
  }
}

const loadActiveTab = async () => {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    const isSupported = isSupportedUrl(window.location.href)
    tabTitleDisplay.textContent = 'Running outside Chrome extension environment'
    tabUrlDisplay.textContent = window.location.href
    tabStatusBadge.textContent = isSupported ? 'Supported' : 'Standalone'
    tabStatusBadge.className = isSupported ? 'badge badge-neutral' : 'badge badge-neutral'
    inspectBtn.disabled = false
    activeTabInfo = {
      id: 0,
      title: document.title,
      url: isSupported ? window.location.href : 'http://localhost:5000'
    }
    return
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    let tab = tabs && tabs[0]
    if (tab && tab.url && tab.url.startsWith('chrome-extension://')) {
      const allTabs = await chrome.tabs.query({ currentWindow: true })
      const webTab = allTabs.find((t) => t.id !== tab.id && isSupportedUrl(t.url))
      if (webTab) {
        tab = webTab
      }
    }

    if (!tab) {
      tabTitleDisplay.textContent = 'No active tab detected'
      tabUrlDisplay.textContent = '--'
      tabStatusBadge.textContent = 'None'
      tabStatusBadge.className = 'badge badge-neutral'
      inspectBtn.disabled = true
      return
    }

    activeTabInfo = tab
    tabTitleDisplay.textContent = tab.title || 'Untitled Page'
    tabUrlDisplay.textContent = tab.url || 'No URL available'

    if (isSupportedUrl(tab.url)) {
      tabStatusBadge.textContent = 'Supported'
      tabStatusBadge.className = 'badge badge-success'
      unsupportedWarning.hidden = true
      inspectBtn.disabled = false
    } else {
      tabStatusBadge.textContent = 'Unsupported'
      tabStatusBadge.className = 'badge badge-danger'
      unsupportedWarning.hidden = false
      inspectBtn.disabled = true
    }
  } catch (err) {
    tabTitleDisplay.textContent = 'Error querying tab'
    tabUrlDisplay.textContent = err.message
    tabStatusBadge.textContent = 'Error'
    tabStatusBadge.className = 'badge badge-danger'
    inspectBtn.disabled = true
  }
}

const handleInspect = async () => {
  if (!activeTabInfo || !isSupportedUrl(activeTabInfo.url)) {
    return
  }

  inspectBtn.disabled = true
  inspectBtn.textContent = 'Inspecting...'

  const onInspectionComplete = (response) => {
    inspectBtn.disabled = false
    inspectBtn.textContent = 'Inspect Active Page'

    if (!response || !response.ok) {
      inspectionSection.hidden = false
      inspectionError.hidden = false
      inspectionError.textContent = response?.error || 'Inspection failed'
      inspectionDetails.hidden = true
      return
    }

    const data = response.data
    inspectionSection.hidden = false
    inspectionError.hidden = true
    inspectionDetails.hidden = false

    inspectedAtBadge.textContent = formatTimestamp(data.inspectedAt)
    resReadyState.textContent = data.readyState || 'unknown'
    resCharset.textContent = data.characterSet || 'unknown'
    resViewport.textContent = data.viewport || 'unknown'
    resDoctype.textContent = data.doctype || 'none'
    resLanguage.textContent = data.language || 'unspecified'
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(
      {
        action: 'INSPECT_PAGE',
        tabId: activeTabInfo.id,
        url: activeTabInfo.url
      },
      (response) => {
        if (chrome.runtime.lastError) {
          onInspectionComplete({ ok: false, error: chrome.runtime.lastError.message })
        } else {
          onInspectionComplete(response)
        }
      }
    )
  } else {
    onInspectionComplete({
      ok: true,
      data: {
        readyState: document.readyState,
        characterSet: document.characterSet || 'UTF-8',
        viewport: `${window.innerWidth} x ${window.innerHeight}`,
        doctype: document.doctype ? (document.doctype.name || 'html') : 'html',
        language: document.documentElement.lang || 'en',
        inspectedAt: new Date().toISOString()
      }
    })
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadActiveTab()
  checkBackendHealth()
  checkBackendBtn.addEventListener('click', checkBackendHealth)
  inspectBtn.addEventListener('click', handleInspect)
})
