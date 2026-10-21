const BACKEND_HEALTH_URL = 'http://localhost:5000/api/health'

const checkBackendHealth = async () => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(BACKEND_HEALTH_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      return { ok: false, error: `Backend responded with HTTP ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    clearTimeout(timeoutId)
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network request failed')
    }
  }
}

const inspectPageDom = () => {
  return {
    title: document.title || 'Untitled',
    url: window.location.href,
    readyState: document.readyState,
    characterSet: document.characterSet || 'UTF-8',
    viewport: `${window.innerWidth} x ${window.innerHeight}`,
    doctype: document.doctype ? (document.doctype.name || 'html') : 'none',
    language: document.documentElement.lang || 'unspecified',
    inspectedAt: new Date().toISOString()
  }
}

const inspectTab = async (tabId, url) => {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'No URL provided' }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Unsupported URL scheme. Only HTTP and HTTPS pages can be inspected.' }
    }
  } catch {
    return { ok: false, error: 'Invalid URL format' }
  }

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: inspectPageDom
    })
    if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
      return { ok: false, error: 'No inspection result returned from page' }
    }
    return { ok: true, data: injectionResults[0].result }
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to inspect page DOM' }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'CHECK_BACKEND_HEALTH') {
    checkBackendHealth().then(sendResponse)
    return true
  }

  if (message?.action === 'INSPECT_PAGE') {
    inspectTab(message.tabId, message.url).then(sendResponse)
    return true
  }

  return false
})
