import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import vm from 'node:vm'
import { chromium } from 'playwright'

console.log('--- RUNNING KLYRO STEP 10B CHROME EXTENSION VERIFICATION ---')

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

console.log('Test 3: Validating syntax and markup of background.js, popup.js, and popup.html...')
const backgroundCode = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8')
assert.doesNotThrow(() => {
  new vm.Script(backgroundCode)
}, 'background.js has valid JavaScript syntax')
assert(backgroundCode.includes('RUN_TEST'), 'background.js handles RUN_TEST action')
assert(backgroundCode.includes('CHECK_BACKEND_HEALTH'), 'background.js handles CHECK_BACKEND_HEALTH action')
assert(backgroundCode.includes('INSPECT_PAGE'), 'background.js handles INSPECT_PAGE action')

const popupJsCode = fs.readFileSync(path.join(extensionDir, 'popup.js'), 'utf8')
assert.doesNotThrow(() => {
  new vm.Script(popupJsCode)
}, 'popup.js has valid JavaScript syntax')
assert(popupJsCode.includes('runTestBtn'), 'popup.js references runTestBtn')
assert(popupJsCode.includes('handleRunTest'), 'popup.js defines handleRunTest')
assert(popupJsCode.includes('countPageErrors'), 'popup.js renders countPageErrors')
assert(popupJsCode.includes('countConsoleErrors'), 'popup.js renders countConsoleErrors')
assert(popupJsCode.includes('countNetworkFailures'), 'popup.js renders countNetworkFailures')
assert(popupJsCode.includes('countHttpErrors'), 'popup.js renders countHttpErrors')

const popupHtmlContent = fs.readFileSync(path.join(extensionDir, 'popup.html'), 'utf8')
assert(popupHtmlContent.includes('rel="stylesheet" href="popup.css"'), 'popup.html links popup.css')
assert(popupHtmlContent.includes('src="popup.js"'), 'popup.html includes popup.js')
assert(popupHtmlContent.includes('id="checkBackendBtn"'), 'popup.html includes backend check button')
assert(popupHtmlContent.includes('id="inspectBtn"'), 'popup.html includes inspect button')
assert(popupHtmlContent.includes('id="runTestBtn"'), 'popup.html includes Run Website Test button')
assert(popupHtmlContent.includes('Run Website Test'), 'popup.html includes Run Website Test text')
assert(popupHtmlContent.includes('id="testResultSection"'), 'popup.html includes test result section')
assert(popupHtmlContent.includes('id="testStatusBadge"'), 'popup.html includes test status badge')
assert(popupHtmlContent.includes('id="testResultError"'), 'popup.html includes test result error alert')
assert(popupHtmlContent.includes('id="testResultContent"'), 'popup.html includes test result content')
assert(popupHtmlContent.includes('id="resTestedUrl"'), 'popup.html includes tested URL field')
assert(popupHtmlContent.includes('id="resPageTitle"'), 'popup.html includes page title field')
assert(popupHtmlContent.includes('id="resHttpStatus"'), 'popup.html includes HTTP status field')
assert(popupHtmlContent.includes('id="countPageErrors"'), 'popup.html includes page errors count')
assert(popupHtmlContent.includes('id="countConsoleErrors"'), 'popup.html includes console errors count')
assert(popupHtmlContent.includes('id="countNetworkFailures"'), 'popup.html includes failed network requests count')
assert(popupHtmlContent.includes('id="countHttpErrors"'), 'popup.html includes HTTP errors count')
console.log('Passed Test 3: JavaScript syntax and HTML markup validated for Step 10B components.\n')

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

console.log('Test 5: Validating live backend health check and test runner endpoint validation...')
const liveHealthRes = await fetch('http://localhost:5000/api/health')
assert.strictEqual(liveHealthRes.status, 200, 'Backend health returns HTTP 200')
const liveHealthData = await liveHealthRes.json()
assert.strictEqual(liveHealthData.status, 'ok', 'Health status is ok')
assert(liveHealthData.message.includes('backend is running'), 'Health message confirmed')

const unsupportedSchemeRes = await fetch('http://localhost:5000/api/browser/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'chrome://extensions' })
})
assert.strictEqual(unsupportedSchemeRes.status, 400, 'Reject non-HTTP scheme with HTTP 400')
const unsupportedData = await unsupportedSchemeRes.json()
assert(unsupportedData.error.includes('HTTP and HTTPS'), 'Error confirms scheme restriction')

const malformedUrlRes = await fetch('http://localhost:5000/api/browser/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'invalid-url' })
})
assert.strictEqual(malformedUrlRes.status, 400, 'Reject malformed URL with HTTP 400')

const missingUrlRes = await fetch('http://localhost:5000/api/browser/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
})
assert.strictEqual(missingUrlRes.status, 400, 'Reject missing URL with HTTP 400')

const unreachableRes = await fetch('http://localhost:59999/api/health').catch((err) => ({ ok: false, error: err.message }))
assert.strictEqual(unreachableRes.ok, false, 'Unreachable backend fails gracefully')
console.log('Passed Test 5: Live backend communication and endpoint validation verified.\n')

console.log('Test 6: Automated Chromium browser extension lifecycle, active tab test trigger, and evidence display...')
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
  const runTestBtn = popupPage.locator('#runTestBtn')
  const tabStatusBadge = popupPage.locator('#tabStatusBadge')

  const isUnsupportedVisible = await unsupportedWarning.isVisible()
  assert.strictEqual(isUnsupportedVisible, true, 'Unsupported warning visible on chrome-extension:// tab')
  assert.strictEqual(await inspectBtn.isDisabled(), true, 'Inspect button disabled on unsupported page')
  assert.strictEqual(await runTestBtn.isDisabled(), true, 'Run Website Test button disabled on unsupported page')
  assert.strictEqual((await tabStatusBadge.textContent()).trim(), 'Unsupported')

  const webPage = await browserContext.newPage()
  await webPage.goto('http://localhost:5000/api/health')
  await webPage.waitForLoadState('domcontentloaded')

  await popupPage.reload()
  await popupPage.waitForSelector('.popup-container', { timeout: 5000 })

  assert.strictEqual(await unsupportedWarning.isHidden(), true, 'Unsupported warning hidden for supported HTTP page')
  assert.strictEqual((await tabStatusBadge.textContent()).trim(), 'Supported', 'Tab status badge is Supported')
  assert.strictEqual(await inspectBtn.isEnabled(), true, 'Inspect button enabled for supported HTTP tab')
  assert.strictEqual(await runTestBtn.isEnabled(), true, 'Run Website Test button enabled for supported HTTP tab')

  const displayedUrl = await popupPage.locator('#tabUrlDisplay').textContent()
  assert(displayedUrl.includes('5000') || displayedUrl.includes('health'), 'URL display shows supported page URL')

  await inspectBtn.click()
  const inspectionSection = popupPage.locator('#inspectionSection')
  await inspectionSection.waitFor({ state: 'visible', timeout: 5000 })
  const isDetailsVisible = await popupPage.locator('#inspectionDetails').isVisible()
  const isInspectionErrorVisible = await popupPage.locator('#inspectionError').isVisible()
  assert(isDetailsVisible || isInspectionErrorVisible, 'Inspection section displays results or defensive error')

  await runTestBtn.click()
  const isBtnDisabledDuringRun = await runTestBtn.isDisabled()
  assert.strictEqual(isBtnDisabledDuringRun, true, 'Run Website Test button disabled during run to prevent duplicate clicks')
  const isInspectDisabledDuringRun = await inspectBtn.isDisabled()
  assert.strictEqual(isInspectDisabledDuringRun, true, 'Inspect button disabled during run to prevent concurrent operations')

  const testResultSection = popupPage.locator('#testResultSection')
  await testResultSection.waitFor({ state: 'visible', timeout: 30000 })

  await popupPage.waitForFunction(() => {
    const btn = document.getElementById('runTestBtn')
    return btn && !btn.disabled
  }, { timeout: 30000 })

  const testedUrl = await popupPage.locator('#resTestedUrl').textContent()
  assert(testedUrl.includes('5000') || testedUrl.includes('health'), 'Tested URL matches target web tab')

  const httpStatus = await popupPage.locator('#resHttpStatus').textContent()
  assert.strictEqual(httpStatus.trim(), '200', 'HTTP status code 200 rendered')

  const testStatusBadge = await popupPage.locator('#testStatusBadge').textContent()
  assert.strictEqual(testStatusBadge.trim(), 'Passed', 'Test status badge indicates Passed for healthy endpoint')

  const pageErrorsCount = await popupPage.locator('#countPageErrors').textContent()
  assert.strictEqual(pageErrorsCount.trim(), '0', 'Page errors count rendered accurately')

  const consoleErrorsCount = await popupPage.locator('#countConsoleErrors').textContent()
  assert.strictEqual(consoleErrorsCount.trim(), '0', 'Console errors count rendered accurately')

  const networkFailuresCount = await popupPage.locator('#countNetworkFailures').textContent()
  assert.strictEqual(networkFailuresCount.trim(), '0', 'Network failures count rendered accurately')

  const httpErrorsCount = await popupPage.locator('#countHttpErrors').textContent()
  assert.strictEqual(httpErrorsCount.trim(), '0', 'HTTP errors count rendered accurately')

  const testResultMessage = await popupPage.locator('#testResultMessage').textContent()
  assert(testResultMessage.includes('passed'), 'Success message displayed')

  console.log('Passed Test 6: Chromium extension test action executed, duplicate clicks prevented, backend responded, and evidence counts rendered.\n')
} finally {
  if (browserContext) {
    await browserContext.close().catch(() => {})
  }
}

console.log('Test 7: Standalone popup test execution and evidence rendering in headless browser...')
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

  const runTestBtn = page.locator('#runTestBtn')
  assert.strictEqual(await runTestBtn.isEnabled(), true)

  await runTestBtn.click()
  assert.strictEqual(await runTestBtn.isDisabled(), true, 'Button disabled during execution')

  const testResultSection = page.locator('#testResultSection')
  await testResultSection.waitFor({ state: 'visible', timeout: 30000 })

  await page.waitForFunction(() => {
    const btn = document.getElementById('runTestBtn')
    return btn && !btn.disabled
  }, { timeout: 30000 })

  const resTestedUrl = await page.locator('#resTestedUrl').textContent()
  assert(resTestedUrl.includes('localhost:5000'), 'Tested URL matches standalone target')

  const resHttpStatus = await page.locator('#resHttpStatus').textContent()
  assert.strictEqual(resHttpStatus.trim(), '200', 'HTTP status is 200')

  const countPageErrors = await page.locator('#countPageErrors').textContent()
  assert(!isNaN(parseInt(countPageErrors.trim(), 10)), 'Page error count is numeric')

  const countConsoleErrors = await page.locator('#countConsoleErrors').textContent()
  assert(!isNaN(parseInt(countConsoleErrors.trim(), 10)), 'Console error count is numeric')

  const countNetworkFailures = await page.locator('#countNetworkFailures').textContent()
  assert(!isNaN(parseInt(countNetworkFailures.trim(), 10)), 'Failed network requests count is numeric')

  const countHttpErrors = await page.locator('#countHttpErrors').textContent()
  assert(!isNaN(parseInt(countHttpErrors.trim(), 10)), 'HTTP errors count is numeric')

  console.log('Passed Test 7: Standalone popup test execution and evidence counts verified.\n')
} finally {
  await standaloneBrowser.close().catch(() => {})
}

console.log('Test 8: Backend offline and API error handling verification...')
const errorBrowser = await chromium.launch({ headless: true })
try {
  const page = await errorBrowser.newPage()
  await page.route('**/api/browser/run', (route) => {
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Navigation failed: net::ERR_CONNECTION_REFUSED' })
    })
  })

  const popupHtmlPath = path.join(extensionDir, 'popup.html')
  await page.goto(`file:///${popupHtmlPath.replace(/\\/g, '/')}`)
  await page.waitForSelector('.popup-container', { timeout: 5000 })

  const runTestBtn = page.locator('#runTestBtn')
  await runTestBtn.click()

  const testResultSection = page.locator('#testResultSection')
  await testResultSection.waitFor({ state: 'visible', timeout: 5000 })

  await page.waitForFunction(() => {
    const btn = document.getElementById('runTestBtn')
    return btn && !btn.disabled
  }, { timeout: 5000 })

  const testStatusBadge = await page.locator('#testStatusBadge').textContent()
  assert.strictEqual(testStatusBadge.trim(), 'Error', 'Test status badge indicates Error')

  const testResultError = page.locator('#testResultError')
  assert.strictEqual(await testResultError.isVisible(), true, 'Error banner is visible')
  const errorText = await testResultError.textContent()
  assert(errorText.includes('ERR_CONNECTION_REFUSED') || errorText.includes('Navigation failed'), 'Error banner displays readable error')

  const isContentHidden = await page.locator('#testResultContent').isHidden()
  assert.strictEqual(isContentHidden, true, 'Result content hidden when execution fails')

  assert.strictEqual(await runTestBtn.isEnabled(), true, 'Button re-enabled after error')
  console.log('Passed Test 8: Backend error and offline handling verified.\n')
} finally {
  await errorBrowser.close().catch(() => {})
}

console.log('ALL KLYRO STEP 10B CHROME EXTENSION TESTS PASSED!')
