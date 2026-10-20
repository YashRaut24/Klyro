import { chromium } from 'playwright'
import assert from 'node:assert'

const runAiFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 9B DUAL-APPROACH FRONTEND AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  console.log('Test 1: Navigating to frontend...')
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  const historyList = page.locator('.history-list')
  await historyList.waitFor({ state: 'visible', timeout: 10000 })
  const historyItems = page.locator('.history-item')
  const count = await historyItems.count()
  assert(count > 0, 'History contains test items')

  console.log('Test 2: Expanding an item with findings & verifying AI section...')
  let errorItemIndex = -1
  for (let i = 0; i < count; i++) {
    const item = historyItems.nth(i)
    await item.locator('.expand-button').click()
    const evidencePanel = item.locator('.evidence-panel')
    await evidencePanel.waitFor({ state: 'visible', timeout: 5000 })
    const findingItems = evidencePanel.locator('.finding-item')
    if (await findingItems.count() > 0) {
      errorItemIndex = i
      break
    }
    await item.locator('.expand-button').click()
  }
  assert(errorItemIndex >= 0, 'Found history item with findings')

  const errorItem = historyItems.nth(errorItemIndex)
  const aiGroup = errorItem.locator('.ai-analysis-group')
  await aiGroup.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(await aiGroup.isVisible(), true, 'AI Analysis & Remediation group is visible')

  console.log('Test 3: Both dual-approach cards render correctly (Quick Fix & Structural Fix)...')
  let routeCalledCount = 0
  let routeResolver = null
  let routePromise = new Promise((resolve) => {
    routeResolver = resolve
  })

  await page.route('**/api/browser/runs/*/analyze', async (route) => {
    routeCalledCount++
    await routePromise
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        testRunId: 'mock-test-run-id',
        aiAnalysis: {
          status: 'analyzed',
          model: 'openai/gpt-oss-120b',
          explanation: 'Mocked root cause: TypeError accessing property of undefined.',
          remediations: [
            {
              summary: 'Legacy fallback summary',
              suggestion: 'Legacy fallback suggestion'
            }
          ],
          dualApproach: {
            quickFix: {
              title: 'Add optional chaining guard',
              explanation: 'Prevent the immediate unhandled TypeError by checking for null/undefined.',
              suggestedChange: 'const value = targetObject?.property ?? fallback;',
              tradeOffs: 'Immediate crash suppression but may mask missing data.'
            },
            structuralFix: {
              title: 'Enforce schema validation at boundaries',
              explanation: 'Validate incoming payload against strict schema before component rendering.',
              suggestedChange: 'zodSchema.parse(payload);',
              tradeOffs: 'Requires schema definition and error boundary handling.'
            }
          }
        }
      })
    })
  })

  const generateBtn = aiGroup.locator('.ai-action-button')
  const reanalyzeBtn = aiGroup.locator('.ai-regenerate-button')

  if (await generateBtn.isVisible()) {
    await generateBtn.click()
    assert.strictEqual(await generateBtn.isDisabled(), true, 'Button is disabled during request')

    const loadingSpinner = aiGroup.locator('.ai-loading')
    assert.strictEqual(await loadingSpinner.isVisible(), true, 'Loading state is visible')

    await generateBtn.click({ force: true }).catch(() => {})
    assert.strictEqual(routeCalledCount, 1, 'Only one network call was triggered (duplicate click prevented)')

    routeResolver()
    await page.waitForTimeout(500)
  } else if (await reanalyzeBtn.isVisible()) {
    await reanalyzeBtn.click()
    routeResolver()
    await page.waitForTimeout(500)
  }

  const aiCard = aiGroup.locator('.ai-analysis-card')
  await aiCard.waitFor({ state: 'visible', timeout: 5000 })

  const dualContainer = aiCard.locator('.dual-approach-container')
  await dualContainer.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(await dualContainer.isVisible(), true, 'Dual approach container rendered')

  const quickCard = dualContainer.locator('.quick-fix-card')
  assert.strictEqual(await quickCard.isVisible(), true, 'Quick Fix card rendered')
  const quickBadge = await quickCard.locator('.quick-fix-badge').textContent()
  assert.strictEqual(quickBadge.trim(), 'Quick Fix')
  const quickTitle = await quickCard.locator('.approach-title').textContent()
  assert(quickTitle.includes('optional chaining guard'), 'Quick fix title matches')
  const quickCode = await quickCard.locator('.approach-code-block code').textContent()
  assert(quickCode.includes('targetObject?.property'), 'Quick fix code matches')
  const quickTradeoffs = await quickCard.locator('.approach-field:has(.approach-label:has-text("Trade-offs")) .approach-text').textContent()
  assert(quickTradeoffs.includes('Immediate crash suppression'), 'Quick fix trade-offs match')

  const structCard = dualContainer.locator('.structural-fix-card')
  assert.strictEqual(await structCard.isVisible(), true, 'Structural Fix card rendered')
  const structBadge = await structCard.locator('.structural-fix-badge').textContent()
  assert.strictEqual(structBadge.trim(), 'Structural Fix')
  const structTitle = await structCard.locator('.approach-title').textContent()
  assert(structTitle.includes('Enforce schema validation'), 'Structural fix title matches')
  const structCode = await structCard.locator('.approach-code-block code').textContent()
  assert(structCode.includes('zodSchema.parse'), 'Structural fix code matches')
  const structTradeoffs = await structCard.locator('.approach-field:has(.approach-label:has-text("Trade-offs")) .approach-text').textContent()
  assert(structTradeoffs.includes('Requires schema definition'), 'Structural fix trade-offs match')

  const legacyList = aiCard.locator('.ai-remediations-box')
  assert.strictEqual(await legacyList.count(), 0, 'Legacy remediations list is not duplicated when dual approach is present')

  const disclaimer = await aiCard.locator('.ai-disclaimer').textContent()
  assert(disclaimer.includes('diagnostic recommendations'), 'Disclaimer rendered')
  console.log('Passed Test 3: Both dual-approach cards rendered with all fields without duplication.\n')

  console.log('Test 4: Missing or incomplete approach data handling...')
  await page.unroute('**/api/browser/runs/*/analyze')
  await page.route('**/api/browser/runs/*/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        testRunId: 'mock-incomplete-run',
        aiAnalysis: {
          status: 'analyzed',
          model: 'openai/gpt-oss-120b',
          explanation: 'Analysis with incomplete approach telemetry.',
          dualApproach: {
            quickFix: {
              title: 'Partial quick fix',
              explanation: 'Explanation available',
              suggestedChange: '',
              tradeOffs: 'Some trade-off'
            },
            structuralFix: null
          }
        }
      })
    })
  })

  const reanalyzeBtn2 = aiCard.locator('.ai-regenerate-button')
  await reanalyzeBtn2.click()
  await page.waitForTimeout(500)

  const partialQuickCard = aiCard.locator('.quick-fix-card')
  await partialQuickCard.waitFor({ state: 'visible', timeout: 5000 })
  const quickInsufficient = await partialQuickCard.locator('.approach-insufficient').textContent()
  assert(quickInsufficient.includes('Insufficient evidence'), 'Missing code change falls back to insufficient evidence text')

  const fallbackStructCard = aiCard.locator('.structural-fix-card')
  await fallbackStructCard.waitFor({ state: 'visible', timeout: 5000 })
  const structInsufficient = await fallbackStructCard.locator('.approach-insufficient').textContent()
  assert(structInsufficient.includes('Insufficient evidence'), 'Null structural fix falls back to insufficient evidence message')
  console.log('Passed Test 4: Missing or incomplete approach data handled gracefully.\n')

  console.log('Test 5: Older saved analysis with only legacy remediation fields...')
  await page.unroute('**/api/browser/runs/*/analyze')
  await page.route('**/api/browser/runs/*/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        testRunId: 'mock-legacy-run',
        aiAnalysis: {
          status: 'analyzed',
          model: 'openai/gpt-oss-120b',
          explanation: 'Legacy record without dual approach.',
          remediations: [
            {
              summary: 'Legacy action item 1',
              suggestion: 'Apply legacy patch.'
            }
          ]
        }
      })
    })
  })

  await reanalyzeBtn2.click()
  await page.waitForTimeout(500)

  const legacyBox = aiCard.locator('.ai-remediations-box')
  await legacyBox.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(await legacyBox.isVisible(), true, 'Legacy remediations list rendered for older records')
  const legacySummary = await legacyBox.locator('.remediation-summary').textContent()
  assert.strictEqual(legacySummary, 'Legacy action item 1')
  console.log('Passed Test 5: Older records with only legacy fields render correctly.\n')

  console.log('Test 6: API error and retry behavior...')
  await page.unroute('**/api/browser/runs/*/analyze')
  await page.route('**/api/browser/runs/*/analyze', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Groq API key is not configured or unavailable',
        code: 'MISSING_API_KEY'
      })
    })
  })

  await reanalyzeBtn2.click()
  const errorBanner = aiGroup.locator('.ai-error-banner')
  await errorBanner.waitFor({ state: 'visible', timeout: 5000 })
  const errorMsg = await errorBanner.locator('.ai-error-text').textContent()
  assert(errorMsg.includes('Groq API key is not configured'), 'Error message displayed clearly')

  const retryBtn = errorBanner.locator('.ai-retry-button')
  assert.strictEqual(await retryBtn.isVisible(), true, 'Retry button is visible')

  await page.unroute('**/api/browser/runs/*/analyze')
  await page.route('**/api/browser/runs/*/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        testRunId: 'mock-recovered-run',
        aiAnalysis: {
          status: 'analyzed',
          model: 'openai/gpt-oss-120b',
          explanation: 'Recovered successfully.',
          dualApproach: {
            quickFix: {
              title: 'Recovered quick fix',
              explanation: 'Immediate recovered fix',
              suggestedChange: 'recover();',
              tradeOffs: 'None'
            },
            structuralFix: {
              title: 'Recovered structural fix',
              explanation: 'Systemic recovered fix',
              suggestedChange: 'systemicRecover();',
              tradeOffs: 'None'
            }
          }
        }
      })
    })
  })

  await retryBtn.click()
  const recoveredContainer = aiGroup.locator('.dual-approach-container')
  await recoveredContainer.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(await recoveredContainer.isVisible(), true, 'Recovered dual approach container rendered after retry')
  console.log('Passed Test 6: API failure and retry flow verified.\n')

  console.log('Test 7: Clean run with no findings...')
  let cleanItem = null
  for (let i = 0; i < count; i++) {
    const item = historyItems.nth(i)
    const urlText = await item.locator('.history-url').textContent()
    if (urlText.includes('example.com')) {
      cleanItem = item
      break
    }
  }
  if (!cleanItem) {
    cleanItem = historyItems.last()
  }
  let cleanPanel = cleanItem.locator('.evidence-panel')
  if (!(await cleanPanel.isVisible())) {
    await cleanItem.locator('.expand-button').click()
    await cleanPanel.waitFor({ state: 'visible', timeout: 5000 })
  }

  const cleanFindings = cleanPanel.locator('.findings-group .evidence-empty')
  if (await cleanFindings.isVisible()) {
    const emptyText = await cleanFindings.textContent()
    assert(emptyText.includes('No failure findings detected'), 'Empty findings message verified')
    const cleanAiBtn = cleanPanel.locator('.ai-action-button')
    assert.strictEqual(await cleanAiBtn.isVisible(), false, 'Clean runs do not show Generate AI Analysis button')
    console.log('Passed Test 7: Clean run without findings verified.\n')
  }

  console.log('Test 8: Mobile responsive viewport (375px)...')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(300)

  const isHeaderVisible = await page.locator('.app-header').isVisible()
  assert(isHeaderVisible, 'Header visible on mobile')

  const cardWidth = await errorItem.evaluate((el) => el.clientWidth)
  assert(cardWidth > 200 && cardWidth <= 375, `Item width fits within mobile viewport (${cardWidth}px)`)

  const recoveredQuickCard = recoveredContainer.locator('.quick-fix-card')
  const quickWidth = await recoveredQuickCard.evaluate((el) => el.clientWidth)
  assert(quickWidth > 200 && quickWidth <= 350, `Quick fix card fits mobile width (${quickWidth}px)`)

  const recoveredStructCard = recoveredContainer.locator('.structural-fix-card')
  const structWidth = await recoveredStructCard.evaluate((el) => el.clientWidth)
  assert(structWidth > 200 && structWidth <= 350, `Structural fix card fits mobile width (${structWidth}px)`)
  console.log('Passed Test 8: Mobile responsive layout (375px) verified.\n')

  await browser.close()
  console.log('ALL KLYRO STEP 9B DUAL-APPROACH FRONTEND AUDIT TESTS PASSED!')
}

runAiFrontendAudit().catch((err) => {
  console.error('Frontend dual approach audit failed:', err)
  process.exit(1)
})
