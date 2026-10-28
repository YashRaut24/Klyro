import { chromium } from 'playwright'
import assert from 'node:assert'

const runPerformanceFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 14B PERFORMANCE FRONTEND AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  const mockRuns = [
    {
      _id: 'mock-full-perf-run',
      url: 'https://example.com/fast-app',
      title: 'Fast Modern App',
      status: 200,
      createdAt: '2026-10-28T10:00:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null,
      performanceMetrics: {
        navigationDurationMs: 420.5,
        domContentLoadedDurationMs: 215.1,
        firstContentfulPaintMs: 250.8,
        largestContentfulPaintMs: 512.4,
        totalTransferredBytes: 48920,
        transferredBytesDescription: 'Browser-observed estimate of transferred resource bytes via Resource Timing API'
      }
    },
    {
      _id: 'mock-partial-perf-run',
      url: 'https://example.com/partial-timing',
      title: 'Partial Timing App',
      status: 200,
      createdAt: '2026-10-28T09:00:00.000Z',
      findings: [],
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null,
      performanceMetrics: {
        navigationDurationMs: 650,
        domContentLoadedDurationMs: 310,
        firstContentfulPaintMs: null,
        largestContentfulPaintMs: null,
        totalTransferredBytes: null,
        transferredBytesDescription: 'Browser-observed estimate of transferred resource bytes via Resource Timing API'
      }
    },
    {
      _id: 'mock-legacy-perf-run',
      url: 'https://example.com/legacy-no-metrics',
      title: 'Legacy Page Without Metrics',
      status: 200,
      createdAt: '2026-10-28T08:00:00.000Z',
      findings: [
        {
          type: 'PAGE_ERROR',
          severity: 'high',
          title: 'Legacy Uncaught Exception',
          description: 'ReferenceError in bundle'
        }
      ],
      pageErrors: [
        { name: 'ReferenceError', message: 'Legacy script error' }
      ],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      screenshot: null,
      verificationReport: null,
      performanceMetrics: null
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
    const id = url.split('/').pop()
    const target = runsData.find((r) => r._id === id)
    if (target) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(target)
      })
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Run not found' })
      })
    }
  })

  let postRunResponse = {
    _id: 'mock-new-result-run',
    url: 'https://example.com/submitted-test',
    title: 'Submitted Test Result Page',
    status: 200,
    findings: [],
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    screenshot: null,
    performanceMetrics: {
      navigationDurationMs: 310.25,
      domContentLoadedDurationMs: 145.5,
      firstContentfulPaintMs: 190.1,
      largestContentfulPaintMs: 380.75,
      totalTransferredBytes: 24500,
      transferredBytesDescription: 'Browser-observed estimate of transferred resource bytes via Resource Timing API'
    }
  }

  let shouldFailPostRun = false

  await page.route('**/api/browser/run', async (route) => {
    if (shouldFailPostRun) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to navigate to website' })
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(postRunResponse)
    })
  })

  await page.route('**/api/regression-alerts/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: false, status: null, timestamp: null, message: null })
    })
  })

  await page.route('**/api/regression-alerts/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ history: [], total: 0 })
    })
  })

  await page.route('**/api/schedules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    })
  })

  try {
    console.log('Test 1: Navigating to frontend application...')
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

    const historyList = page.locator('.history-list')
    await historyList.waitFor({ state: 'visible', timeout: 10000 })
    const itemsCount = await page.locator('.history-item').count()
    assert.strictEqual(itemsCount, 3, 'All 3 mock history items loaded successfully')
    console.log('Passed Test 1: Frontend loaded with history items.\n')

    console.log('Test 2: Metrics render in latest test result with correct values and units...')
    await page.locator('.url-input').fill('https://example.com/submitted-test')
    await page.locator('.submit-button').click()

    const resultCard = page.locator('.result-card')
    await resultCard.waitFor({ state: 'visible', timeout: 5000 })

    const resultPerfSection = resultCard.locator('.result-performance-section')
    await resultPerfSection.waitFor({ state: 'visible', timeout: 5000 })

    const navCard = resultPerfSection.locator('[data-metric="navigation-duration"]')
    const dclCard = resultPerfSection.locator('[data-metric="dom-content-loaded"]')
    const fcpCard = resultPerfSection.locator('[data-metric="first-contentful-paint"]')
    const lcpCard = resultPerfSection.locator('[data-metric="largest-contentful-paint"]')
    const bytesCard = resultPerfSection.locator('[data-metric="total-transferred-bytes"]')

    assert.strictEqual(await navCard.locator('.perf-metric-value').textContent(), '310.25 ms')
    assert.strictEqual(await dclCard.locator('.perf-metric-value').textContent(), '145.5 ms')
    assert.strictEqual(await fcpCard.locator('.perf-metric-value').textContent(), '190.1 ms')
    assert.strictEqual(await lcpCard.locator('.perf-metric-value').textContent(), '380.75 ms')
    assert.strictEqual(await bytesCard.locator('.perf-metric-value').textContent(), '24500 B')

    const descText = await resultPerfSection.locator('.perf-metrics-description').textContent()
    assert(descText.includes('Browser-observed estimate of transferred resource bytes'))
    console.log('Passed Test 2: All 5 metrics, correct units (ms, B), and description render in latest result.\n')

    console.log('Test 3: Metrics render in expandable history details...')
    const fullPerfItem = page.locator('.history-item:has-text("Fast Modern App")')
    await fullPerfItem.locator('.expand-button').click()

    const evidencePanel = fullPerfItem.locator('.evidence-panel')
    await evidencePanel.waitFor({ state: 'visible', timeout: 5000 })

    const histPerfSection = evidencePanel.locator('.performance-metrics-group')
    await histPerfSection.waitFor({ state: 'visible', timeout: 5000 })

    assert.strictEqual(await histPerfSection.locator('[data-metric="navigation-duration"] .perf-metric-value').textContent(), '420.5 ms')
    assert.strictEqual(await histPerfSection.locator('[data-metric="dom-content-loaded"] .perf-metric-value').textContent(), '215.1 ms')
    assert.strictEqual(await histPerfSection.locator('[data-metric="first-contentful-paint"] .perf-metric-value').textContent(), '250.8 ms')
    assert.strictEqual(await histPerfSection.locator('[data-metric="largest-contentful-paint"] .perf-metric-value').textContent(), '512.4 ms')
    assert.strictEqual(await histPerfSection.locator('[data-metric="total-transferred-bytes"] .perf-metric-value').textContent(), '48920 B')
    console.log('Passed Test 3: Metrics render accurately inside expandable history details.\n')

    console.log('Test 4: Null and missing metric values display as "Not available"...')
    const partialItem = page.locator('.history-item:has-text("Partial Timing App")')
    await partialItem.locator('.expand-button').click()

    const partialEvidence = partialItem.locator('.evidence-panel')
    await partialEvidence.waitFor({ state: 'visible', timeout: 5000 })

    const partialPerf = partialEvidence.locator('.performance-metrics-group')
    assert.strictEqual(await partialPerf.locator('[data-metric="navigation-duration"] .perf-metric-value').textContent(), '650 ms')
    assert.strictEqual(await partialPerf.locator('[data-metric="dom-content-loaded"] .perf-metric-value').textContent(), '310 ms')
    assert.strictEqual(await partialPerf.locator('[data-metric="first-contentful-paint"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await partialPerf.locator('[data-metric="largest-contentful-paint"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await partialPerf.locator('[data-metric="total-transferred-bytes"] .perf-metric-value').textContent(), 'Not available')

    const unavailClasses = await partialPerf.locator('[data-metric="first-contentful-paint"] .perf-metric-value').getAttribute('class')
    assert(unavailClasses.includes('value-unavailable'))
    console.log('Passed Test 4: Null and missing metrics display as "Not available" without reporting zero.\n')

    console.log('Test 5: Older test runs without performance metrics remain functional...')
    const legacyItem = page.locator('.history-item:has-text("Legacy Page Without Metrics")')
    await legacyItem.locator('.expand-button').click()

    const legacyEvidence = legacyItem.locator('.evidence-panel')
    await legacyEvidence.waitFor({ state: 'visible', timeout: 5000 })

    const legacyPerf = legacyEvidence.locator('.performance-metrics-group')
    assert.strictEqual(await legacyPerf.locator('[data-metric="navigation-duration"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await legacyPerf.locator('[data-metric="dom-content-loaded"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await legacyPerf.locator('[data-metric="first-contentful-paint"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await legacyPerf.locator('[data-metric="largest-contentful-paint"] .perf-metric-value').textContent(), 'Not available')
    assert.strictEqual(await legacyPerf.locator('[data-metric="total-transferred-bytes"] .perf-metric-value').textContent(), 'Not available')

    const findingText = await legacyEvidence.locator('.finding-title').textContent()
    assert.strictEqual(findingText.trim(), 'Legacy Uncaught Exception')
    console.log('Passed Test 5: Older test runs render "Not available" metrics while preserving findings and evidence.\n')

    console.log('Test 6: Existing evidence inspection and collapse actions still work...')
    await legacyItem.locator('.expand-button').click()
    assert.strictEqual(await legacyItem.locator('.evidence-panel').count(), 0)
    console.log('Passed Test 6: Evidence toggle expand/collapse functions normally.\n')

    console.log('Test 7: API errors do not crash the frontend...')
    shouldFailPostRun = true
    await page.locator('.url-input').fill('https://example.com/error-test')
    await page.locator('.submit-button').click()

    const errorCard = page.locator('.error-card')
    await errorCard.waitFor({ state: 'visible', timeout: 5000 })
    const errorText = await errorCard.locator('.error-message').textContent()
    assert.strictEqual(errorText.trim(), 'Failed to navigate to website')
    console.log('Passed Test 7: API failures handled gracefully without frontend crash.\n')

    console.log('Test 8: Responsive layout at 375px mobile viewport has 0 horizontal overflow...')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(300)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    assert(scrollWidth <= clientWidth, `Page scrollWidth (${scrollWidth}px) exceeds clientWidth (${clientWidth}px) at 375px`)

    const cardsInGrid = await page.locator('.perf-metric-card').count()
    assert(cardsInGrid >= 5, 'Metric cards present in mobile viewport')
    console.log('Passed Test 8: Mobile viewport at 375px width verified with 0 horizontal overflow.\n')

    console.log('ALL PERFORMANCE FRONTEND AUDIT TESTS PASSED!')
  } finally {
    await browser.close()
  }
}

runPerformanceFrontendAudit().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
