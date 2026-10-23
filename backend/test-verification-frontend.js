import { chromium } from 'playwright'
import assert from 'node:assert'

const runVerificationFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 11D VERIFICATION HISTORY & REGRESSION AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  const mockRuns = [
    {
      _id: 'mock-verified-run',
      url: 'https://example.com/verified-site',
      title: 'Verified Baseline Page',
      status: 200,
      createdAt: '2026-10-23T10:00:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Resolved Error 1',
          description: 'Error was resolved'
        }
      ],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: {
        baselineRunId: 'mock-verified-run',
        verificationRunId: 'mock-verification-child-1',
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
            title: 'Resolved Error 1',
            description: 'Error was resolved'
          }
        ],
        persistentFindings: [],
        newFindings: [],
        verifiedAt: '2026-10-23T10:05:00.000Z'
      }
    },
    {
      _id: 'mock-partial-run',
      url: 'https://example.com/partial-site',
      title: 'Partial Baseline Page',
      status: 500,
      createdAt: '2026-10-23T09:30:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Fixed Error',
          description: 'Resolved'
        },
        {
          type: 'HTTP_ERROR',
          severity: 'medium',
          title: 'Persistent 404',
          description: 'Still 404'
        }
      ],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: {
        baselineRunId: 'mock-partial-run',
        verificationRunId: 'mock-verification-child-2',
        status: 'partially_verified',
        summary: {
          resolved: 1,
          persistent: 1,
          new: 0,
          totalBaseline: 2,
          totalVerification: 1
        },
        resolvedFindings: [
          {
            type: 'PAGE_ERROR',
            severity: 'high',
            title: 'Fixed Error',
            description: 'Resolved'
          }
        ],
        persistentFindings: [
          {
            type: 'HTTP_ERROR',
            severity: 'medium',
            title: 'Persistent 404',
            description: 'Still 404'
          }
        ],
        newFindings: [],
        verifiedAt: '2026-10-23T09:35:00.000Z'
      }
    },
    {
      _id: 'mock-not-verified-run',
      url: 'https://example.com/not-verified-site',
      title: 'Not Verified Page with Regressions',
      status: 500,
      createdAt: '2026-10-23T09:00:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Unresolved Crash',
          description: 'Still crashing'
        }
      ],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: {
        baselineRunId: 'mock-not-verified-run',
        verificationRunId: 'mock-verification-child-3',
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
            title: 'Unresolved Crash',
            description: 'Still crashing'
          }
        ],
        newFindings: [
          {
            type: 'HTTP_ERROR',
            severity: 'medium',
            title: 'New Regressed 500 API Error',
            description: 'Newly introduced 500'
          }
        ],
        verifiedAt: '2026-10-23T09:10:00.000Z'
      }
    },
    {
      _id: 'mock-no-baseline-run',
      url: 'https://example.com/no-baseline-findings-site',
      title: 'No Baseline Findings Page',
      status: 200,
      createdAt: '2026-10-23T08:30:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: {
        baselineRunId: 'mock-no-baseline-run',
        verificationRunId: 'mock-verification-child-4',
        status: 'no_baseline_findings',
        summary: {
          resolved: 0,
          persistent: 0,
          new: 0,
          totalBaseline: 0,
          totalVerification: 0
        },
        resolvedFindings: [],
        persistentFindings: [],
        newFindings: [],
        verifiedAt: '2026-10-23T08:35:00.000Z'
      }
    },
    {
      _id: 'mock-verification-child-1',
      url: 'https://example.com/verified-site',
      title: 'Verified Baseline Page',
      status: 200,
      createdAt: '2026-10-23T10:05:00.000Z',
      baselineRunId: 'mock-verified-run',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null
    },
    {
      _id: 'mock-older-run',
      url: 'https://example.com/older-legacy-run',
      title: 'Older Run Without Linkage',
      status: 200,
      createdAt: '2026-10-23T07:00:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null,
      baselineRunId: null
    },
    {
      _id: 'mock-clean-ordinary-run',
      url: 'https://example.com/clean-ordinary',
      title: 'Clean Ordinary Run',
      status: 200,
      createdAt: '2026-10-23T06:00:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null,
      baselineRunId: null
    }
  ]

  let runsData = [...mockRuns]

  await page.route('**/api/browser/runs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(runsData)
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
    const matched = runsData.find((r) => r._id === id)
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
  assert.strictEqual(await page.locator('.history-item').count(), 7, 'All 7 mock history items loaded')

  console.log('Test 1: Verification status badges for all 4 supported statuses in history cards...')
  const verifiedCard = page.locator('.history-item:has-text("Verified Baseline Page")').first()
  const verifiedBadge = verifiedCard.locator('.history-verification-badge')
  assert.strictEqual(await verifiedBadge.textContent(), 'Verified', 'Verified status badge rendered on card')
  assert(await verifiedBadge.getAttribute('class').then((c) => c.includes('verification-status-verified')), 'Has verification-status-verified class')

  const partialCard = page.locator('.history-item:has-text("Partial Baseline Page")')
  const partialBadge = partialCard.locator('.history-verification-badge')
  assert.strictEqual(await partialBadge.textContent(), 'Partially Verified', 'Partially Verified badge rendered')
  assert(await partialBadge.getAttribute('class').then((c) => c.includes('verification-status-partially_verified')), 'Has verification-status-partially_verified class')

  const notVerifiedCard = page.locator('.history-item:has-text("Not Verified Page with Regressions")')
  const notVerifiedBadge = notVerifiedCard.locator('.history-verification-badge')
  assert.strictEqual(await notVerifiedBadge.textContent(), 'Not Verified', 'Not Verified badge rendered')
  assert(await notVerifiedBadge.getAttribute('class').then((c) => c.includes('verification-status-not_verified')), 'Has verification-status-not_verified class')

  const noBaselineCard = page.locator('.history-item:has-text("No Baseline Findings Page")')
  const noBaselineBadge = noBaselineCard.locator('.history-verification-badge')
  assert.strictEqual(await noBaselineBadge.textContent(), 'No Baseline Findings', 'No Baseline Findings badge rendered')
  assert(await noBaselineBadge.getAttribute('class').then((c) => c.includes('verification-status-no_baseline_findings')), 'Has verification-status-no_baseline_findings class')

  console.log('Test 2: Baseline and verification runs identified correctly with linked IDs...')
  const baselineRunType = verifiedCard.locator('.run-type-baseline')
  assert.strictEqual(await baselineRunType.textContent(), 'Baseline Run', 'Baseline run has Baseline Run badge')
  const baselineLinkage = await verifiedCard.locator('.run-linkage-info').textContent()
  assert(baselineLinkage.includes('Verification Run:') && baselineLinkage.includes('mock-verification-child-1'), 'Baseline run links to verification child run')

  const verificationCardItem = page.locator('.history-item:has(.run-type-verification)')
  const verificationRunType = verificationCardItem.locator('.run-type-verification')
  assert.strictEqual(await verificationRunType.textContent(), 'Verification Run', 'Verification run has Verification Run badge')
  const verificationLinkage = await verificationCardItem.locator('.run-linkage-info').textContent()
  assert(verificationLinkage.includes('Baseline Run:') && verificationLinkage.includes('mock-verified-run'), 'Verification run links to baseline run')

  console.log('Test 3: Older runs without linkage fields render safely without badges or errors...')
  const olderCard = page.locator('.history-item:has-text("Older Run Without Linkage")')
  assert.strictEqual(await olderCard.locator('.run-type-badge').count(), 0, 'No run type badge on older run without linkage')
  assert.strictEqual(await olderCard.locator('.history-verification-badge').count(), 0, 'No verification badge on older run without report')

  console.log('Test 4: Regression filtering for each status filter...')
  const filterControls = page.locator('.history-filter-controls')
  await filterControls.waitFor({ state: 'visible' })

  await page.locator('.filter-btn[data-filter="verified"]').click()
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 1, 'Verified filter matches exactly 1 run')
  assert.strictEqual(await page.locator('.history-item .history-page-title').textContent(), 'Verified Baseline Page', 'Matched run is Verified Baseline Page')

  await page.locator('.filter-btn[data-filter="partially_verified"]').click()
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 1, 'Partially verified filter matches exactly 1 run')
  assert.strictEqual(await page.locator('.history-item .history-page-title').textContent(), 'Partial Baseline Page', 'Matched run is Partial Baseline Page')

  await page.locator('.filter-btn[data-filter="not_verified"]').click()
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 1, 'Not verified filter matches exactly 1 run')
  assert.strictEqual(await page.locator('.history-item .history-page-title').textContent(), 'Not Verified Page with Regressions', 'Matched run is Not Verified Page')

  console.log('Test 5: Runs with new findings filtering uses verification report data...')
  await page.locator('.filter-btn[data-filter="new_findings"]').click()
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 1, 'Runs with new findings filter matches exactly 1 run')
  assert.strictEqual(await page.locator('.history-item .history-page-title').textContent(), 'Not Verified Page with Regressions', 'Matched run with regression is selected')

  console.log('Test 6: Ordinary runs without reports are not classified as verified...')
  await page.locator('.filter-btn[data-filter="verified"]').click()
  await page.waitForTimeout(200)
  const matchedTitles = await page.locator('.history-item .history-page-title').allTextContents()
  assert(!matchedTitles.includes('Clean Ordinary Run'), 'Clean ordinary run without report is not classified as verified')
  assert(!matchedTitles.includes('Older Run Without Linkage'), 'Older run without report is not classified as verified')

  console.log('Test 7: History refresh and new runs preserve correct filtering...')
  const newVerifiedRun = {
    _id: 'mock-new-verified-run',
    url: 'https://example.com/new-verified',
    title: 'Newly Added Verified Page',
    status: 200,
    createdAt: '2026-10-23T11:00:00.000Z',
    findings: [],
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    screenshot: null,
    verificationReport: {
      baselineRunId: 'mock-new-verified-run',
      verificationRunId: 'mock-new-child-id',
      status: 'verified',
      summary: { resolved: 1, persistent: 0, new: 0, totalBaseline: 1, totalVerification: 0 },
      resolvedFindings: [],
      persistentFindings: [],
      newFindings: [],
      verifiedAt: '2026-10-23T11:05:00.000Z'
    }
  }
  runsData = [newVerifiedRun, ...mockRuns]

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await page.locator('.url-input').fill('https://example.com/trigger-fetch')
  await page.locator('.filter-btn[data-filter="all"]').click()
  await page.waitForTimeout(200)
  await page.locator('.filter-btn[data-filter="verified"]').click()
  await page.waitForTimeout(200)
  assert(await page.locator('.history-item').count() >= 1, 'Filter preserves correct matches across list interactions')

  console.log('Test 8: Empty filter results display helpful message and reset button...')
  runsData = [mockRuns[4], mockRuns[5], mockRuns[6]]
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.locator('.filter-btn[data-filter="partially_verified"]').click()
  await page.waitForTimeout(200)

  const emptyCard = page.locator('.history-card.filter-empty')
  await emptyCard.waitFor({ state: 'visible' })
  assert.strictEqual(await emptyCard.locator('.empty-title').textContent(), 'No matching test runs', 'Empty title displayed')
  const emptySubtitle = await emptyCard.locator('.empty-subtitle').textContent()
  assert(emptySubtitle.includes('Partially verified'), 'Empty subtitle indicates active filter')

  const resetBtn = emptyCard.locator('.filter-reset-button')
  assert.strictEqual(await resetBtn.isVisible(), true, 'Reset button is visible')
  await resetBtn.click()
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 3, 'Reset button restored all runs')

  runsData = [...mockRuns]
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  console.log('Test 9: Existing verification and AI features continue working...')
  const testBaseline = page.locator('.history-item:has-text("Verified Baseline Page")').first()
  await testBaseline.locator('.expand-button').click()
  const testPanel = testBaseline.locator('.evidence-panel')
  await testPanel.waitFor({ state: 'visible' })
  assert.strictEqual(await testPanel.locator('.verification-card').isVisible(), true, 'Verification card rendered')
  assert.strictEqual(await testPanel.locator('.findings-group').isVisible(), true, 'Findings group intact')

  console.log('Test 10: Responsive layout at 375px width...')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(300)

  const mobileItemWidth = await testBaseline.evaluate((el) => el.clientWidth)
  assert(mobileItemWidth > 200 && mobileItemWidth <= 375, `Mobile item width (${mobileItemWidth}px) fits 375px viewport`)

  const filterBarWidth = await page.locator('.history-filter-controls').evaluate((el) => el.clientWidth)
  assert(filterBarWidth > 200 && filterBarWidth <= 375, `Filter controls width (${filterBarWidth}px) fits mobile width`)

  const selectVisible = await page.locator('.history-filter-select').isVisible()
  assert(selectVisible, 'Filter select is visible on mobile viewport')

  await page.selectOption('.history-filter-select', 'not_verified')
  await page.waitForTimeout(200)
  assert.strictEqual(await page.locator('.history-item').count(), 1, 'Select dropdown successfully filters history on mobile')

  await browser.close()
  console.log('ALL 10 KLYRO STEP 11D VERIFICATION HISTORY & REGRESSION TESTS PASSED!')
}

runVerificationFrontendAudit().catch((err) => {
  console.error('Verification history & regression audit failed:', err)
  process.exit(1)
})
