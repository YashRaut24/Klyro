import { chromium } from 'playwright'
import assert from 'node:assert'

const runVerificationFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 11C FIX VERIFICATION FRONTEND AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  const mockRuns = [
    {
      _id: 'mock-baseline-1',
      url: 'https://example.com/baseline-errors',
      title: 'Baseline Errors Page',
      status: 500,
      createdAt: '2026-10-22T10:00:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Uncaught TypeError in Header',
          description: 'Cannot read properties of null',
          evidence: { name: 'TypeError', message: 'Cannot read properties of null' }
        }
      ],
      pageErrors: [
        { name: 'TypeError', message: 'Cannot read properties of null' }
      ],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null
    },
    {
      _id: 'mock-clean-run-2',
      url: 'https://example.com/clean',
      title: 'Clean Page',
      status: 200,
      createdAt: '2026-10-22T09:30:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null
    },
    {
      _id: 'mock-saved-report-3',
      url: 'https://example.com/saved-report',
      title: 'Pre-existing Report Page',
      status: 200,
      createdAt: '2026-10-22T09:00:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Saved Baseline Finding',
          description: 'Pre-existing finding',
          evidence: { name: 'Error', message: 'Pre-existing' }
        }
      ],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: {
        baselineRunId: 'mock-saved-report-3',
        verificationRunId: 'mock-prev-verification-id',
        status: 'verified',
        summary: {
          resolved: 1,
          persistent: 0,
          new: 0,
          totalBaseline: 1,
          totalVerification: 0
        },
        resolvedFindings: [
          {
            type: 'PAGE_ERROR',
            severity: 'high',
            title: 'Saved Baseline Finding',
            description: 'Pre-existing finding'
          }
        ],
        persistentFindings: [],
        newFindings: [],
        verifiedAt: '2026-10-22T09:05:00.000Z'
      }
    }
  ]

  await page.route('**/api/browser/runs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRuns)
      })
    } else {
      await route.continue()
    }
  })

  await page.route('**/api/browser/runs/*', async (route) => {
    const url = route.request().url()
    if (url.includes('/verify') || url.includes('/analyze')) {
      await route.continue()
      return
    }
    const id = url.split('/').pop()
    const matched = mockRuns.find((r) => r._id === id)
    if (matched) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(matched)
      })
    } else {
      await route.continue()
    }
  })

  console.log('Test 1: Navigating to frontend...')
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  const historyList = page.locator('.history-list')
  await historyList.waitFor({ state: 'visible', timeout: 10000 })
  const historyItems = page.locator('.history-item')
  assert.strictEqual(await historyItems.count(), 3, 'All 3 mock history items loaded')

  console.log('Test 1 & 2: Verify Fix action visibility on run with findings vs absence on clean run...')
  const baselineItem = page.locator('.history-item:has-text("Baseline Errors Page")')
  await baselineItem.waitFor({ state: 'visible' })
  const baselineVerifyBtn = baselineItem.locator('.verify-fix-button').first()
  assert.strictEqual(await baselineVerifyBtn.isVisible(), true, 'Verify Fix button is visible on run with findings')
  assert.strictEqual(await baselineVerifyBtn.textContent(), 'Verify Fix', 'Initial button label is Verify Fix')

  const cleanItem = page.locator('.history-item:has-text("Clean Page")')
  await cleanItem.waitFor({ state: 'visible' })
  const cleanVerifyBtn = cleanItem.locator('.verify-fix-button')
  assert.strictEqual(await cleanVerifyBtn.count(), 0, 'Verify Fix button is absent for clean run with 0 findings')

  await cleanItem.locator('.expand-button').click()
  const cleanEvidencePanel = cleanItem.locator('.evidence-panel')
  await cleanEvidencePanel.waitFor({ state: 'visible' })
  assert.strictEqual(await cleanEvidencePanel.locator('.verification-group').count(), 0, 'Verification group absent inside expanded clean run')
  await cleanItem.locator('.expand-button').click()

  console.log('Test 3 & 4: Clicking Verify Fix sends correct baseline ID, loading state, and prevents duplicate requests...')
  let verifyRequestUrl = null
  let verifyCalledCount = 0
  let verifyResolver = null
  const verifyPromise = new Promise((resolve) => {
    verifyResolver = resolve
  })

  await page.route('**/api/browser/runs/*/verify', async (route) => {
    verifyCalledCount++
    verifyRequestUrl = route.request().url()
    await verifyPromise
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        baselineRunId: 'mock-baseline-1',
        verificationRunId: 'mock-fresh-verification-run-id',
        verificationReport: {
          baselineRunId: 'mock-baseline-1',
          verificationRunId: 'mock-fresh-verification-run-id',
          status: 'verified',
          summary: {
            resolved: 1,
            persistent: 0,
            new: 0,
            totalBaseline: 1,
            totalVerification: 0
          },
          resolvedFindings: [
            {
              type: 'PAGE_ERROR',
              severity: 'high',
              title: 'Uncaught TypeError in Header',
              description: 'Cannot read properties of null'
            }
          ],
          persistentFindings: [],
          newFindings: [],
          verifiedAt: '2026-10-22T10:15:00.000Z'
        }
      })
    })
  })

  await baselineVerifyBtn.click()

  assert(verifyRequestUrl && verifyRequestUrl.includes('/api/browser/runs/mock-baseline-1/verify'), 'Correct baseline ID sent in verification endpoint URL')
  assert.strictEqual(await baselineVerifyBtn.isDisabled(), true, 'Verify button disabled during request')
  assert(await baselineVerifyBtn.textContent().then((t) => t.includes('Verifying Fix...')), 'Button indicates loading state')

  const baselineEvidencePanel = baselineItem.locator('.evidence-panel')
  await baselineEvidencePanel.waitFor({ state: 'visible' })
  const verificationLoading = baselineEvidencePanel.locator('.verification-loading')
  assert.strictEqual(await verificationLoading.isVisible(), true, 'Verification loading indicator visible in panel')

  await baselineVerifyBtn.click({ force: true }).catch(() => {})
  assert.strictEqual(verifyCalledCount, 1, 'Duplicate click blocked while verification is in-flight')

  verifyResolver()
  await page.waitForTimeout(500)

  console.log('Test 5: Successful report rendering for status verified...')
  const verificationCard = baselineEvidencePanel.locator('.verification-card')
  await verificationCard.waitFor({ state: 'visible', timeout: 5000 })

  const statusBadge = verificationCard.locator('.verification-status-badge')
  assert.strictEqual(await statusBadge.textContent(), 'Verified', 'Status badge text is Verified')
  assert(await statusBadge.getAttribute('class').then((c) => c.includes('verification-status-verified')), 'Status badge class includes verification-status-verified')

  const statResolved = await verificationCard.locator('.stat-resolved .stat-number').textContent()
  const statPersistent = await verificationCard.locator('.stat-persistent .stat-number').textContent()
  const statNew = await verificationCard.locator('.stat-new .stat-number').textContent()
  assert.strictEqual(statResolved.trim(), '1', 'Summary resolved count is 1')
  assert.strictEqual(statPersistent.trim(), '0', 'Summary persistent count is 0')
  assert.strictEqual(statNew.trim(), '0', 'Summary new count is 0')

  const resolvedList = verificationCard.locator('.resolved-list')
  assert.strictEqual(await resolvedList.isVisible(), true, 'Resolved findings list rendered')
  assert(await resolvedList.textContent().then((t) => t.includes('Uncaught TypeError in Header')), 'Resolved finding title rendered')

  const persistentEmpty = verificationCard.locator('.persistent-title + .verification-empty')
  assert.strictEqual(await persistentEmpty.textContent(), 'No persistent findings.', 'Empty state rendered for persistent findings')

  const newEmpty = verificationCard.locator('.new-title + .verification-empty')
  assert.strictEqual(await newEmpty.textContent(), 'No new findings or regressions detected.', 'Empty state rendered for new findings')

  const timestamp = await verificationCard.locator('.verification-timestamp').textContent()
  assert(timestamp.includes('Verified:'), 'Verification timestamp rendered')

  const disclaimer = await verificationCard.locator('.verification-disclaimer').textContent()
  assert(disclaimer.includes('does not establish code causation'), 'Non-causal verification disclaimer rendered')

  console.log('Test 6: Rendering persistent and new findings for non-verified result...')
  await page.unroute('**/api/browser/runs/*/verify')
  await page.route('**/api/browser/runs/*/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        baselineRunId: 'mock-baseline-1',
        verificationRunId: 'mock-regressed-verification-run-id',
        verificationReport: {
          baselineRunId: 'mock-baseline-1',
          verificationRunId: 'mock-regressed-verification-run-id',
          status: 'not_verified',
          summary: {
            resolved: 0,
            persistent: 1,
            new: 1,
            totalBaseline: 1,
            totalVerification: 2
          },
          resolvedFindings: [],
          persistentFindings: [
            {
              type: 'PAGE_ERROR',
              severity: 'high',
              title: 'Uncaught TypeError in Header',
              description: 'Cannot read properties of null'
            }
          ],
          newFindings: [
            {
              type: 'HTTP_ERROR',
              severity: 'medium',
              title: 'HTTP 404 on API Asset',
              description: 'Request to /missing.json failed with 404'
            }
          ],
          verifiedAt: '2026-10-22T10:20:00.000Z'
        }
      })
    })
  })

  const reverifyBtn = baselineEvidencePanel.locator('.verify-action-button')
  assert.strictEqual(await reverifyBtn.textContent(), 'Re-verify Fix', 'Button updated to Re-verify Fix after report exists')
  await reverifyBtn.click()
  await page.waitForTimeout(500)

  const nonVerifiedBadge = verificationCard.locator('.verification-status-badge')
  assert.strictEqual(await nonVerifiedBadge.textContent(), 'Not Verified', 'Status badge text is Not Verified')
  assert(await nonVerifiedBadge.getAttribute('class').then((c) => c.includes('verification-status-not_verified')), 'Status badge class includes verification-status-not_verified')

  const statPersistent2 = await verificationCard.locator('.stat-persistent .stat-number').textContent()
  const statNew2 = await verificationCard.locator('.stat-new .stat-number').textContent()
  assert.strictEqual(statPersistent2.trim(), '1', 'Summary persistent count is 1')
  assert.strictEqual(statNew2.trim(), '1', 'Summary new count is 1')

  const resolvedEmpty2 = verificationCard.locator('.resolved-title + .verification-empty')
  assert.strictEqual(await resolvedEmpty2.textContent(), 'No resolved findings.', 'Empty state rendered for resolved category')

  const persistentList = verificationCard.locator('.persistent-list')
  assert(await persistentList.textContent().then((t) => t.includes('Uncaught TypeError in Header')), 'Persistent finding rendered in persistent list')

  const newList = verificationCard.locator('.new-list')
  assert(await newList.textContent().then((t) => t.includes('HTTP 404 on API Asset')), 'New regression finding rendered in new list')

  console.log('Test 7: API error display and retry behavior without overwriting existing report...')
  await page.unroute('**/api/browser/runs/*/verify')
  await page.route('**/api/browser/runs/*/verify', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Failed to navigate to website: net::ERR_CONNECTION_REFUSED'
      })
    })
  })

  await reverifyBtn.click()
  await page.waitForTimeout(500)

  const errorBanner = baselineEvidencePanel.locator('.verification-error-banner')
  await errorBanner.waitFor({ state: 'visible' })
  const errorText = await errorBanner.locator('.verification-error-text').textContent()
  assert(errorText.includes('ERR_CONNECTION_REFUSED'), 'Error message displayed clearly in banner')

  assert.strictEqual(await verificationCard.isVisible(), true, 'Existing valid report remains visible and was not overwritten by failed request')

  const retryBtn = errorBanner.locator('.verification-retry-button')
  assert.strictEqual(await retryBtn.isVisible(), true, 'Retry button visible in error banner')

  await page.unroute('**/api/browser/runs/*/verify')
  await page.route('**/api/browser/runs/*/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        baselineRunId: 'mock-baseline-1',
        verificationRunId: 'mock-recovered-id',
        verificationReport: {
          baselineRunId: 'mock-baseline-1',
          verificationRunId: 'mock-recovered-id',
          status: 'verified',
          summary: { resolved: 1, persistent: 0, new: 0, totalBaseline: 1, totalVerification: 0 },
          resolvedFindings: [
            { type: 'PAGE_ERROR', severity: 'high', title: 'Uncaught TypeError in Header', description: 'Recovered' }
          ],
          persistentFindings: [],
          newFindings: [],
          verifiedAt: '2026-10-22T10:25:00.000Z'
        }
      })
    })
  })

  await retryBtn.click()
  await page.waitForTimeout(500)

  assert.strictEqual(await errorBanner.isVisible(), false, 'Error banner cleared after successful retry')
  assert.strictEqual(await verificationCard.locator('.verification-status-badge').textContent(), 'Verified', 'Report updated successfully after retry')

  console.log('Test 8: Pre-existing saved report renders without triggering another verification request...')
  let savedRunVerifyCount = 0
  await page.route('**/api/browser/runs/mock-saved-report-3/verify', async (route) => {
    savedRunVerifyCount++
    await route.continue()
  })

  const savedReportItem = page.locator('.history-item:has-text("Pre-existing Report Page")')
  await savedReportItem.locator('.expand-button').click()

  const savedPanel = savedReportItem.locator('.evidence-panel')
  await savedPanel.waitFor({ state: 'visible' })
  const savedCard = savedPanel.locator('.verification-card')
  await savedCard.waitFor({ state: 'visible' })

  assert.strictEqual(savedRunVerifyCount, 0, 'No verification request triggered when loading pre-existing saved report')
  assert.strictEqual(await savedCard.locator('.verification-status-badge').textContent(), 'Verified', 'Saved report displays correct verified badge')
  assert(await savedCard.textContent().then((t) => t.includes('Saved Baseline Finding')), 'Saved finding rendered in saved report')
  assert.strictEqual(await savedReportItem.locator('.verify-fix-button').first().textContent(), 'Re-verify Fix', 'Button is labeled Re-verify Fix')

  console.log('Test 9: Existing AI remediation and evidence features still work...')
  assert.strictEqual(await baselineEvidencePanel.locator('.findings-group').isVisible(), true, 'Findings group remains intact')
  assert.strictEqual(await baselineEvidencePanel.locator('.ai-analysis-group').isVisible(), true, 'AI analysis group remains intact')
  assert.strictEqual(await baselineEvidencePanel.locator('.screenshot-preview, .evidence-group:has-text("Screenshot Preview")').isVisible(), true, 'Screenshot preview section remains intact')

  console.log('Test 10: Mobile responsive viewport (375px)...')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(300)

  const cardWidth = await baselineItem.evaluate((el) => el.clientWidth)
  assert(cardWidth > 200 && cardWidth <= 375, `Baseline item width (${cardWidth}px) fits within 375px mobile viewport`)

  const vCardWidth = await verificationCard.evaluate((el) => el.clientWidth)
  assert(vCardWidth > 200 && vCardWidth <= 350, `Verification card width (${vCardWidth}px) fits mobile width`)

  const verifyBtnWidth = await baselineEvidencePanel.locator('.verify-action-button').evaluate((el) => el.clientWidth)
  assert(verifyBtnWidth > 150, 'Verify button sized responsively on mobile')

  await browser.close()
  console.log('ALL 10 KLYRO STEP 11C FIX VERIFICATION FRONTEND TESTS PASSED!')
}

runVerificationFrontendAudit().catch((err) => {
  console.error('Fix verification frontend audit failed:', err)
  process.exit(1)
})
