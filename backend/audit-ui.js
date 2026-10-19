import { chromium } from 'playwright'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

const runAudit = async () => {
  console.log('--- STARTING COMPREHENSIVE KLYRO UI AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  console.log('Audit 1: Navigating to frontend application...')
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  assert.strictEqual(await page.title(), 'Klyro', 'Page title is Klyro')

  console.log('Audit 2: URL Input & Submission Validation...')
  const runBtn = page.locator('button.submit-button')
  const urlInput = page.locator('input.url-input')

  assert.strictEqual(await runBtn.isDisabled(), true, 'Run Test button is disabled when input is empty')
  await urlInput.fill('   ')
  assert.strictEqual(await runBtn.isDisabled(), true, 'Run Test button is disabled with only whitespace')

  await urlInput.fill('invalid-url-format')
  await runBtn.click()
  const errorCard = page.locator('.error-card')
  await errorCard.waitFor({ state: 'visible', timeout: 5000 })
  const invalidUrlError = await errorCard.locator('.error-message').textContent()
  assert(invalidUrlError.includes('Please enter a valid URL'), `Correct error for invalid URL: "${invalidUrlError}"`)
  console.log('  PASS: Invalid URL validation')

  await urlInput.fill('ftp://example.com')
  await runBtn.click()
  await errorCard.waitFor({ state: 'visible', timeout: 5000 })
  const protocolError = await errorCard.locator('.error-message').textContent()
  assert(protocolError.includes('Only HTTP and HTTPS URLs are supported'), `Correct error for unsupported protocol: "${protocolError}"`)
  console.log('  PASS: Protocol validation')

  console.log('Audit 3: Test History List Loading & Structure...')
  const historyList = page.locator('.history-list')
  await historyList.waitFor({ state: 'visible', timeout: 10000 })
  const historyItems = page.locator('.history-item')
  const historyCount = await historyItems.count()
  assert(historyCount > 0, `History contains items: ${historyCount}`)

  const firstItem = historyItems.first()
  const hasIndicator = await firstItem.locator('.status-indicator').isVisible()
  const hasUrl = await firstItem.locator('.history-url').isVisible()
  const hasStatusPill = await firstItem.locator('.history-item-header .status-pill').isVisible()
  const hasPageTitle = await firstItem.locator('.history-page-title').isVisible()
  const hasTimestamp = await firstItem.locator('.history-timestamp').isVisible()
  const hasExpandBtn = await firstItem.locator('.expand-button').isVisible()

  assert(hasIndicator, 'History entry has status indicator')
  assert(hasUrl, 'History entry has URL')
  assert(hasStatusPill, 'History entry has status pill')
  assert(hasPageTitle, 'History entry has page title')
  assert(hasTimestamp, 'History entry has timestamp')
  assert(hasExpandBtn, 'History entry has expand button')
  console.log(`  PASS: History entries rendered with all metadata (${historyCount} runs found)`)

  console.log('Audit 4: Evidence Expansion, Collapse & Request Caching...')
  let errorItemIndex = -1
  for (let i = 0; i < historyCount; i++) {
    const itemUrl = await historyItems.nth(i).locator('.history-url').textContent()
    if (itemUrl.includes('127.0.0.1:5055')) {
      errorItemIndex = i
      break
    }
  }
  assert(errorItemIndex >= 0, 'Found error test fixture (127.0.0.1:5055) in history')
  const errorItem = historyItems.nth(errorItemIndex)

  let apiRunDetailRequests = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/browser/runs/')) {
      apiRunDetailRequests++
    }
  })

  const expandBtn = errorItem.locator('.expand-button')
  assert.strictEqual(await expandBtn.textContent(), 'Inspect Evidence')

  await expandBtn.click()
  const evidencePanel = errorItem.locator('.evidence-panel')
  await evidencePanel.waitFor({ state: 'visible', timeout: 10000 })
  assert.strictEqual(await expandBtn.textContent(), 'Hide Evidence', 'Button toggles to Hide Evidence')
  assert.strictEqual(apiRunDetailRequests, 1, 'First expand made exactly 1 API request for evidence')

  await expandBtn.click()
  await evidencePanel.waitFor({ state: 'hidden', timeout: 5000 })
  assert.strictEqual(await expandBtn.textContent(), 'Inspect Evidence', 'Button toggles back to Inspect Evidence')

  await expandBtn.click()
  await evidencePanel.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(apiRunDetailRequests, 1, 'Re-expand used cached evidence, 0 extra API requests made')
  console.log('  PASS: Evidence expansion, collapse, and caching verified')

  console.log('Audit 5: Analysis Findings Rendering & Severities...')
  const findingsGroup = errorItem.locator('.findings-group')
  await findingsGroup.waitFor({ state: 'visible', timeout: 5000 })
  const findingsTitle = await findingsGroup.locator('.evidence-group-title').textContent()
  assert(findingsTitle.includes('Analysis Findings (7)'), `Correct findings header: "${findingsTitle}"`)

  const findingItems = findingsGroup.locator('.finding-item')
  const findingsItemCount = await findingItems.count()
  assert.strictEqual(findingsItemCount, 7, 'Exactly 7 finding cards rendered')

  let highCount = 0
  let mediumCount = 0

  for (let i = 0; i < findingsItemCount; i++) {
    const finding = findingItems.nth(i)
    const title = await finding.locator('.finding-title').textContent()
    const desc = await finding.locator('.finding-description').textContent()
    const type = await finding.locator('.finding-type').textContent()
    const severityBadge = finding.locator('.finding-severity')
    const severityText = await severityBadge.textContent()

    assert(title.trim().length > 0, `Finding ${i + 1} has readable title`)
    assert(desc.trim().length > 0, `Finding ${i + 1} has description`)
    assert(['PAGE_ERROR', 'HTTP_ERROR', 'FAILED_REQUEST', 'CONSOLE_ERROR'].includes(type.trim()), `Finding ${i + 1} has valid category: "${type}"`)
    assert(['high', 'medium', 'low'].includes(severityText.trim().toLowerCase()), `Finding ${i + 1} has valid severity: "${severityText}"`)

    if (severityText.trim().toLowerCase() === 'high') {
      highCount++
      const borderClass = await finding.getAttribute('class')
      assert(borderClass.includes('severity-high'), 'High finding has severity-high CSS class')
    } else if (severityText.trim().toLowerCase() === 'medium') {
      mediumCount++
      const borderClass = await finding.getAttribute('class')
      assert(borderClass.includes('severity-medium'), 'Medium finding has severity-medium CSS class')
    }
  }

  assert(highCount > 0, `Found ${highCount} HIGH severity findings`)
  assert(mediumCount > 0, `Found ${mediumCount} MEDIUM severity findings`)
  console.log(`  PASS: All 7 findings visibly rendered with title, description, category, and severity (HIGH: ${highCount}, MEDIUM: ${mediumCount})`)

  console.log('Audit 6: Raw Evidence Categories on Error Run...')
  const pageErrorsGroup = errorItem.locator('.evidence-group:has-text("Page Errors")')
  const pageErrorsCount = await pageErrorsGroup.locator('.evidence-item').count()
  assert.strictEqual(pageErrorsCount, 1, 'Page Errors contains 1 item')
  const pageErrText = await pageErrorsGroup.locator('.evidence-text').textContent()
  assert(pageErrText.includes('Deliberate page error for Step 6B'), 'Page error message is correct')

  const consoleErrorsGroup = errorItem.locator('.evidence-group:has-text("Console Errors")')
  const consoleErrorsCount = await consoleErrorsGroup.locator('.evidence-item').count()
  assert.strictEqual(consoleErrorsCount, 3, 'Console Errors contains 3 items')

  const failedReqGroup = errorItem.locator('.evidence-group:has-text("Failed Network Requests")')
  const failedReqCount = await failedReqGroup.locator('.evidence-item').count()
  assert.strictEqual(failedReqCount, 2, 'Failed Network Requests contains 2 items')

  const httpErrorsGroup = errorItem.locator('.evidence-group:has-text("HTTP Errors")')
  const httpErrorsCount = await httpErrorsGroup.locator('.evidence-item').count()
  assert.strictEqual(httpErrorsCount, 1, 'HTTP Errors contains 1 item')
  console.log('  PASS: All 4 raw evidence categories rendered with exact telemetry')

  console.log('Audit 7: Clean Run Findings & Empty State Handling...')
  let cleanItemIndex = -1
  for (let i = 0; i < historyCount; i++) {
    const itemUrl = await historyItems.nth(i).locator('.history-url').textContent()
    if (itemUrl === 'https://example.com' || itemUrl === 'https://example.com/') {
      cleanItemIndex = i
      break
    }
  }
  assert(cleanItemIndex >= 0, 'Found clean test run (https://example.com) in history')
  const cleanItem = historyItems.nth(cleanItemIndex)

  await cleanItem.locator('.expand-button').click()
  const cleanEvidencePanel = cleanItem.locator('.evidence-panel')
  await cleanEvidencePanel.waitFor({ state: 'visible', timeout: 10000 })

  const cleanFindingsGroup = cleanItem.locator('.findings-group')
  const cleanFindingsTitle = await cleanFindingsGroup.locator('.evidence-group-title').textContent()
  assert(cleanFindingsTitle.includes('Analysis Findings (0)'), `Clean run header: "${cleanFindingsTitle}"`)
  const cleanFindingsEmpty = await cleanFindingsGroup.locator('.evidence-empty').textContent()
  assert.strictEqual(cleanFindingsEmpty.trim(), 'No failure findings detected.', 'Empty findings message correct')

  const cleanPageErrors = await cleanItem.locator('.evidence-group:has-text("Page Errors") .evidence-empty').textContent()
  assert.strictEqual(cleanPageErrors.trim(), 'No page errors detected.')

  const cleanConsoleErrors = await cleanItem.locator('.evidence-group:has-text("Console Errors") .evidence-empty').textContent()
  assert.strictEqual(cleanConsoleErrors.trim(), 'No console errors detected.')

  const cleanFailedReq = await cleanItem.locator('.evidence-group:has-text("Failed Network Requests") .evidence-empty').textContent()
  assert.strictEqual(cleanFailedReq.trim(), 'No failed network requests detected.')

  const cleanHttpErrors = await cleanItem.locator('.evidence-group:has-text("HTTP Errors") .evidence-empty').textContent()
  assert.strictEqual(cleanHttpErrors.trim(), 'No HTTP errors detected.')
  console.log('  PASS: Clean run displays (0) findings and proper empty states across all categories')

  console.log('Audit 8: Screenshot Preview & Unavailable Image Fallback...')
  const cleanScreenshot = cleanItem.locator('.screenshot-preview')
  assert(await cleanScreenshot.isVisible(), 'Screenshot image is visible for example.com')
  const naturalWidth = await cleanScreenshot.evaluate((img) => img.naturalWidth)
  assert(naturalWidth > 0, `Screenshot image successfully loaded (naturalWidth: ${naturalWidth})`)

  await cleanScreenshot.evaluate((img) => {
    img.dispatchEvent(new Event('error'))
  })
  const fallbackText = await cleanItem.locator('.evidence-group:has-text("Screenshot Preview") .evidence-empty').textContent()
  assert(fallbackText.includes('Unable to load screenshot preview'), `Image error fallback triggered: "${fallbackText}"`)
  console.log('  PASS: Screenshot preview loads and image error fallback gracefully displays')

  console.log('Audit 9: Mobile & Responsive Layout Audit (375x667)...')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(500)

  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  assert.strictEqual(isOverflowing, false, 'No horizontal overflow at 375px mobile viewport')

  const inputGroupFlex = await page.locator('.input-group').evaluate((el) => {
    const style = window.getComputedStyle(el)
    return style.flexDirection
  })
  assert.strictEqual(inputGroupFlex, 'column', 'Input and submit button stack vertically on mobile')

  const mobileScreenshotPath = path.resolve('..', 'audit_mobile_viewport.png')
  await page.screenshot({ path: mobileScreenshotPath, fullPage: true })
  assert(fs.existsSync(mobileScreenshotPath), 'Mobile audit screenshot saved')
  console.log(`  PASS: Mobile viewport verified without horizontal overflow, screenshot saved to ${mobileScreenshotPath}`)

  await browser.close()
  console.log('--- ALL UI AUDIT CHECKS COMPLETED AND PASSED ---')
}

runAudit().catch((err) => {
  console.error('Audit failed with error:', err)
  process.exit(1)
})
