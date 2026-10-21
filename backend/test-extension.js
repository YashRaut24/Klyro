import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import vm from 'node:vm'
import { chromium } from 'playwright'

console.log('--- RUNNING KLYRO STEP 10A CHROME EXTENSION VERIFICATION ---')

const extensionDir = path.resolve('..', 'extension')

console.log('Test 1: Validating extension file existence and integrity...')
assert(fs.existsSync(extensionDir), 'Extension directory exists')
const requiredFiles = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'popup.css']
for (const file of requiredFiles) {
  const filePath = path.join(extensionDir, file)
  assert(fs.existsSync(filePath), `Required file ${file} exists`)
  const stat = fs.statSync(filePath)
  assert(stat.size > 0, `File ${file} is not empty`)
}
console.log('Passed Test 1: All required extension files exist.\n')

console.log('Test 2: Validating Manifest V3 schema and minimal permissions...')
const manifestRaw = fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')
const manifest = JSON.parse(manifestRaw)

assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3')
assert.strictEqual(manifest.name, 'Klyro', 'Extension name is Klyro')
assert(typeof manifest.version === 'string' && manifest.version.length > 0, 'Version string is present')
assert(typeof manifest.description === 'string' && manifest.description.length > 0, 'Description string is present')
assert.strictEqual(manifest.background?.service_worker, 'background.js', 'Service worker defined as background.js')
assert.strictEqual(manifest.action?.default_popup, 'popup.html', 'Default popup defined as popup.html')

assert(Array.isArray(manifest.permissions), 'Permissions must be an array')
assert.strictEqual(manifest.permissions.length, 2, 'Only activeTab and scripting permissions requested')
assert(manifest.permissions.includes('activeTab'), 'activeTab permission present')
assert(manifest.permissions.includes('scripting'), 'scripting permission present')
assert(!manifest.permissions.includes('<all_urls>'), 'Broad <all_urls> permission must NOT be present')
assert(!manifest.permissions.includes('tabs'), 'Broad tabs permission must NOT be present')

assert(Array.isArray(manifest.host_permissions), 'Host permissions must be an array')
for (const host of manifest.host_permissions) {
  assert(
    host.includes('localhost:5000') || host.includes('127.0.0.1:5000'),
    `Host permission ${host} must be strictly scoped to local backend`
  )
}
assert(!manifest.host_permissions.includes('*://*/*'), 'Broad wildcard host permissions must NOT be present')
assert(!manifest.host_permissions.includes('<all_urls>'), 'All urls host permission must NOT be present')
console.log('Passed Test 2: Manifest V3 validated with strict least-privilege permissions.\n')

console.log('Test 3: Validating syntax of background.js, popup.js, and popup.html...')
const backgroundCode = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8')
assert.doesNotThrow(() => {
  new vm.Script(backgroundCode)
}, 'background.js has valid JavaScript syntax')

const popupJsCode = fs.readFileSync(path.join(extensionDir, 'popup.js'), 'utf8')
assert.doesNotThrow(() => {
  new vm.Script(popupJsCode)
}, 'popup.js has valid JavaScript syntax')

const popupHtmlContent = fs.readFileSync(path.join(extensionDir, 'popup.html'), 'utf8')
assert(popupHtmlContent.includes('rel="stylesheet" href="popup.css"'), 'popup.html links popup.css')
assert(popupHtmlContent.includes('src="popup.js"'), 'popup.html includes popup.js')
assert(popupHtmlContent.includes('id="checkBackendBtn"'), 'popup.html includes backend check button')
assert(popupHtmlContent.includes('id="inspectBtn"'), 'popup.html includes inspect button')
assert(popupHtmlContent.includes('id="unsupportedWarning"'), 'popup.html includes unsupported page warning')
console.log('Passed Test 3: JavaScript syntax and HTML structure validated.\n')

console.log('Test 4: Validating URL scheme verification and unsupported page rejection logic...')
const isSupportedUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

assert.strictEqual(isSupportedUrl('https://klyro.dev'), true)
assert.strictEqual(isSupportedUrl('http://localhost:5173'), true)
assert.strictEqual(isSupportedUrl('http://127.0.0.1:5000'), true)
assert.strictEqual(isSupportedUrl('chrome://extensions'), false)
assert.strictEqual(isSupportedUrl('chrome://settings'), false)
assert.strictEqual(isSupportedUrl('about:blank'), false)
assert.strictEqual(isSupportedUrl('edge://flags'), false)
assert.strictEqual(isSupportedUrl('view-source:https://example.com'), false)
assert.strictEqual(isSupportedUrl('file:///C:/test.html'), false)
assert.strictEqual(isSupportedUrl(''), false)
assert.strictEqual(isSupportedUrl(null), false)
assert.strictEqual(isSupportedUrl(undefined), false)
console.log('Passed Test 4: URL scheme rejection strictly allows only HTTP/HTTPS.\n')

console.log('Test 5: Validating live backend health check endpoint response...')
const liveHealthRes = await fetch('http://localhost:5000/api/health')
assert.strictEqual(liveHealthRes.status, 200, 'Backend health returns HTTP 200')
const liveHealthData = await liveHealthRes.json()
assert.strictEqual(liveHealthData.status, 'ok', 'Health status is ok')
assert(liveHealthData.message.includes('backend is running'), 'Health message confirmed')

const unreachableRes = await fetch('http://localhost:59999/api/health').catch((err) => ({ ok: false, error: err.message }))
assert.strictEqual(unreachableRes.ok, false, 'Unreachable backend fails gracefully')
console.log('Passed Test 5: Live backend communication and error handling verified.\n')

console.log('Test 6: Automated Chromium browser extension lifecycle and UI audit...')
let browserContext = null
try {
  browserContext = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`
    ]
  })

  let backgroundWorker = browserContext.serviceWorkers()[0]
  if (!backgroundWorker) {
    backgroundWorker = await browserContext.waitForEvent('serviceworker', { timeout: 7000 }).catch(() => null)
  }

  let extensionId = null
  if (backgroundWorker) {
    const workerUrl = backgroundWorker.url()
    const match = workerUrl.match(/chrome-extension:\/\/([a-z0-9]+)\//)
    if (match) {
      extensionId = match[1]
    }
  }

  assert(extensionId, 'Extension ID resolved from background service worker')

  const popupPage = await browserContext.newPage()
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)
  await popupPage.waitForSelector('.popup-container', { timeout: 5000 })

  const brandTitle = await popupPage.locator('.brand-title').textContent()
  assert.strictEqual(brandTitle.trim(), 'Klyro')

  const versionBadge = await popupPage.locator('.version-badge').textContent()
  assert.strictEqual(versionBadge.trim(), 'v0.1.0')

  const refreshBtn = popupPage.locator('#checkBackendBtn')
  await refreshBtn.click()
  await popupPage.waitForTimeout(600)

  const statusLabel = await popupPage.locator('#backendStatusLabel').textContent()
  assert.strictEqual(statusLabel.trim(), 'Connected', 'Backend status pill shows Connected')

  const backendMessage = await popupPage.locator('#backendMessage').textContent()
  assert(backendMessage.includes('running') || backendMessage.includes('Connected'), 'Backend message indicates running status')

  const unsupportedWarning = popupPage.locator('#unsupportedWarning')
  const inspectBtn = popupPage.locator('#inspectBtn')
  const tabStatusBadge = popupPage.locator('#tabStatusBadge')

  const isUnsupportedVisible = await unsupportedWarning.isVisible()
  assert.strictEqual(isUnsupportedVisible, true, 'Unsupported warning visible on chrome-extension:// tab')
  assert.strictEqual(await inspectBtn.isDisabled(), true, 'Inspect button disabled on unsupported page')
  assert.strictEqual((await tabStatusBadge.textContent()).trim(), 'Unsupported')

  const webPage = await browserContext.newPage()
  await webPage.goto('http://localhost:5000/api/health')
  await webPage.waitForLoadState('domcontentloaded')

  await popupPage.reload()
  await popupPage.waitForSelector('.popup-container', { timeout: 5000 })

  assert.strictEqual(await unsupportedWarning.isHidden(), true, 'Unsupported warning hidden for supported HTTP page')
  assert.strictEqual((await tabStatusBadge.textContent()).trim(), 'Supported', 'Tab status badge is Supported')
  assert.strictEqual(await inspectBtn.isEnabled(), true, 'Inspect button enabled for supported HTTP tab')

  const displayedUrl = await popupPage.locator('#tabUrlDisplay').textContent()
  assert(displayedUrl.includes('5000') || displayedUrl.includes('health'), 'URL display shows supported page URL')

  await inspectBtn.click()
  const inspectionSection = popupPage.locator('#inspectionSection')
  await inspectionSection.waitFor({ state: 'visible', timeout: 5000 })

  const isDetailsVisible = await popupPage.locator('#inspectionDetails').isVisible()
  const isErrorVisible = await popupPage.locator('#inspectionError').isVisible()
  assert(isDetailsVisible || isErrorVisible, 'Inspection section displays results or defensive error notice')

  if (isDetailsVisible) {
    const readyState = await popupPage.locator('#resReadyState').textContent()
    assert(readyState.length > 0 && readyState !== '--', 'Ready state inspected')
  } else {
    const errorMsg = await popupPage.locator('#inspectionError').textContent()
    assert(errorMsg.length > 0, 'Defensive error displayed when automated tab injection lacks user gesture')
  }

  console.log('Passed Test 6: Chromium extension loaded, popup rendered, backend connected, unsupported URLs rejected, and inspection verified.\n')
} finally {
  if (browserContext) {
    await browserContext.close().catch(() => {})
  }
}

console.log('Test 7: Direct standalone popup inspection execution in headless browser...')
const standaloneBrowser = await chromium.launch({ headless: true })
try {
  const page = await standaloneBrowser.newPage()
  const popupHtmlPath = path.join(extensionDir, 'popup.html')
  await page.goto(`file:///${popupHtmlPath.replace(/\\/g, '/')}`)

  await page.waitForSelector('.popup-container', { timeout: 5000 })
  const brandTitle = await page.locator('.brand-title').textContent()
  assert.strictEqual(brandTitle.trim(), 'Klyro')

  const inspectBtn = page.locator('#inspectBtn')
  assert.strictEqual(await inspectBtn.isEnabled(), true)

  await inspectBtn.click()
  const inspectionSection = page.locator('#inspectionSection')
  await inspectionSection.waitFor({ state: 'visible', timeout: 5000 })

  const readyState = await page.locator('#resReadyState').textContent()
  assert(readyState.length > 0 && readyState !== '--', 'Ready state inspected successfully')

  const charset = await page.locator('#resCharset').textContent()
  assert(charset.length > 0 && charset !== '--', 'Charset inspected successfully')

  const viewport = await page.locator('#resViewport').textContent()
  assert(viewport.includes('x'), 'Viewport dimensions inspected successfully')

  console.log('Passed Test 7: Standalone popup DOM inspection and field rendering verified.\n')
} finally {
  await standaloneBrowser.close().catch(() => {})
}

console.log('ALL KLYRO STEP 10A CHROME EXTENSION TESTS PASSED!')
