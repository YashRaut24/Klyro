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
const runTestBtn = document.getElementById('runTestBtn')

const testResultSection = document.getElementById('testResultSection')
const testStatusBadge = document.getElementById('testStatusBadge')
const testResultError = document.getElementById('testResultError')
const testResultContent = document.getElementById('testResultContent')
const testResultMessage = document.getElementById('testResultMessage')
const resTestedUrl = document.getElementById('resTestedUrl')
const resPageTitle = document.getElementById('resPageTitle')
const resHttpStatus = document.getElementById('resHttpStatus')
const countPageErrors = document.getElementById('countPageErrors')
const countConsoleErrors = document.getElementById('countConsoleErrors')
const countNetworkFailures = document.getElementById('countNetworkFailures')
const countHttpErrors = document.getElementById('countHttpErrors')

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
let isTesting = false

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

const fallbackRunTest = async (url) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch('http://localhost:5000/api/browser/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ url }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Backend responded with HTTP ${res.status}`
      }
    }
    return { ok: true, data }
  } catch (err) {
    clearTimeout(timeoutId)
    return {
      ok: false,
      error: err.name === 'AbortError'
        ? 'Test execution timed out after 60 seconds'
        : 'Cannot reach backend at http://localhost:5000. Verify server is running.'
    }
  }
}

const loadActiveTab = async () => {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    const isSupported = isSupportedUrl(window.location.href)
    const effectiveUrl = isSupported ? window.location.href : 'http://localhost:5000/api/health'
    tabTitleDisplay.textContent = 'Running outside Chrome extension environment'
    tabUrlDisplay.textContent = effectiveUrl
    tabStatusBadge.textContent = isSupported ? 'Supported' : 'Standalone'
    tabStatusBadge.className = 'badge badge-neutral'
    inspectBtn.disabled = false
    runTestBtn.disabled = false
    activeTabInfo = {
      id: 0,
      title: document.title || 'Standalone Web Page',
      url: effectiveUrl
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
      runTestBtn.disabled = true
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
      runTestBtn.disabled = false
    } else {
      tabStatusBadge.textContent = 'Unsupported'
      tabStatusBadge.className = 'badge badge-danger'
      unsupportedWarning.hidden = false
      inspectBtn.disabled = true
      runTestBtn.disabled = true
    }
  } catch (err) {
    tabTitleDisplay.textContent = 'Error querying tab'
    tabUrlDisplay.textContent = err.message
    tabStatusBadge.textContent = 'Error'
    tabStatusBadge.className = 'badge badge-danger'
    inspectBtn.disabled = true
    runTestBtn.disabled = true
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

const handleRunTest = async () => {
  if (isTesting || !activeTabInfo || !isSupportedUrl(activeTabInfo.url)) {
    return
  }

  isTesting = true
  runTestBtn.disabled = true
  inspectBtn.disabled = true
  runTestBtn.textContent = 'Running Test...'
  runTestBtn.classList.add('btn-loading')

  testResultSection.hidden = false
  testResultError.hidden = true
  testResultContent.hidden = false
  testStatusBadge.textContent = 'Running...'
  testStatusBadge.className = 'badge badge-info'
  testResultMessage.textContent = 'Executing browser test on backend runner...'
  testResultMessage.className = 'result-message message-pending'

  resTestedUrl.textContent = activeTabInfo.url
  resPageTitle.textContent = '--'
  resHttpStatus.textContent = '--'
  countPageErrors.textContent = '0'
  countConsoleErrors.textContent = '0'
  countNetworkFailures.textContent = '0'
  countHttpErrors.textContent = '0'

  const onTestComplete = (response) => {
    isTesting = false
    const stillSupported = activeTabInfo && isSupportedUrl(activeTabInfo.url)
    runTestBtn.disabled = !stillSupported
    inspectBtn.disabled = !stillSupported
    runTestBtn.textContent = 'Run Website Test'
    runTestBtn.classList.remove('btn-loading')

    testResultSection.hidden = false

    if (!response || !response.ok) {
      testStatusBadge.textContent = 'Error'
      testStatusBadge.className = 'badge badge-danger'
      testResultError.hidden = false
      testResultError.textContent = response?.error || 'Test execution failed'
      testResultContent.hidden = true
      return
    }

    const data = response.data
    testResultError.hidden = true
    testResultContent.hidden = false

    resTestedUrl.textContent = data.url || activeTabInfo.url
    resPageTitle.textContent = data.title || '(No title captured)'
    resHttpStatus.textContent = data.status ? `${data.status}` : 'N/A'

    const pageErrorsCount = Array.isArray(data.pageErrors) ? data.pageErrors.length : 0
    const consoleErrorsCount = Array.isArray(data.consoleErrors) ? data.consoleErrors.length : 0
    const networkFailuresCount = Array.isArray(data.failedRequests) ? data.failedRequests.length : 0
    const httpErrorsCount = Array.isArray(data.httpErrors) ? data.httpErrors.length : 0

    countPageErrors.textContent = String(pageErrorsCount)
    countConsoleErrors.textContent = String(consoleErrorsCount)
    countNetworkFailures.textContent = String(networkFailuresCount)
    countHttpErrors.textContent = String(httpErrorsCount)

    const totalIssues = pageErrorsCount + consoleErrorsCount + networkFailuresCount + httpErrorsCount
    if (totalIssues === 0) {
      testStatusBadge.textContent = 'Passed'
      testStatusBadge.className = 'badge badge-success'
      testResultMessage.textContent = 'Website test passed with no detected errors.'
      testResultMessage.className = 'result-message message-success'
    } else {
      testStatusBadge.textContent = 'Issues Found'
      testStatusBadge.className = 'badge badge-danger'
      testResultMessage.textContent = `Website test completed with ${totalIssues} detected issue${totalIssues === 1 ? '' : 's'}.`
      testResultMessage.className = 'result-message message-danger'
    }
  }

  const targetUrl = activeTabInfo.url

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(
      {
        action: 'RUN_TEST',
        url: targetUrl
      },
      (response) => {
        if (chrome.runtime.lastError) {
          fallbackRunTest(targetUrl).then(onTestComplete)
        } else {
          onTestComplete(response)
        }
      }
    )
  } else {
    const fallbackResult = await fallbackRunTest(targetUrl)
    onTestComplete(fallbackResult)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadActiveTab()
  checkBackendHealth()
  checkBackendBtn.addEventListener('click', checkBackendHealth)
  inspectBtn.addEventListener('click', handleInspect)
  runTestBtn.addEventListener('click', handleRunTest)
})
