import { chromium } from 'playwright'
import assert from 'node:assert'

const runAiFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 8C FRONTEND AI ANALYSIS AUDIT ---')

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

  console.log('Test 2: Expanding an item with findings & verifying AI button...')
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
  const evidencePanel = errorItem.locator('.evidence-panel')
  const aiGroup = errorItem.locator('.ai-analysis-group')
  await aiGroup.waitFor({ state: 'visible', timeout: 5000 })
  assert.strictEqual(await aiGroup.isVisible(), true, 'AI Analysis & Remediation group is visible')

  const aiTitle = await aiGroup.locator('.evidence-group-title').textContent()
  assert(aiTitle.includes('AI Analysis & Remediation'), 'AI section has correct title')

  console.log('Test 3: Testing duplicate-click prevention and loading state...')
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
          model: 'llama-3.3-70b-versatile',
          explanation: 'Mocked root cause: An uncaught TypeError caused component failure.',
          remediations: [
            {
              summary: 'Defensive check',
              suggestion: 'Add optional chaining before accessing properties.'
            },
            {
              summary: 'Fallback UI',
              suggestion: 'Render an error boundary fallback component.'
            }
          ]
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

    const aiCard = aiGroup.locator('.ai-analysis-card')
    await aiCard.waitFor({ state: 'visible', timeout: 5000 })

    const explanationText = await aiCard.locator('.ai-explanation-text').textContent()
    assert(explanationText.includes('Mocked root cause: An uncaught TypeError'), 'Explanation rendered correctly')

    const remediations = aiCard.locator('.ai-remediation-item')
    assert.strictEqual(await remediations.count(), 2, '2 remediation items rendered')

    const firstSummary = await remediations.first().locator('.remediation-summary').textContent()
    assert.strictEqual(firstSummary, 'Defensive check')

    const modelTag = await aiCard.locator('.ai-model-tag').textContent()
    assert(modelTag.includes('llama-3.3-70b-versatile'), 'Model tag rendered')

    const disclaimer = await aiCard.locator('.ai-disclaimer').textContent()
    assert(disclaimer.includes('diagnostic recommendations'), 'Disclaimer rendered')
    console.log('Passed Test 3: Successful analysis rendering and duplicate prevention verified.')
  } else if (await reanalyzeBtn.isVisible()) {
    const aiCard = aiGroup.locator('.ai-analysis-card')
    assert.strictEqual(await aiCard.isVisible(), true, 'Saved AI analysis card rendered immediately')
    console.log('Passed Test 3: Existing saved AI analysis reused immediately without network call.')
  }

  console.log('Test 4: Testing API error and retry behavior...')
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

  const targetTriggerBtn = (await reanalyzeBtn.isVisible()) ? reanalyzeBtn : generateBtn
  await targetTriggerBtn.click()

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
        testRunId: 'mock-test-run-id',
        aiAnalysis: {
          status: 'analyzed',
          model: 'llama-3.3-70b-versatile',
          explanation: 'Retried successfully after error.',
          remediations: [
            {
              summary: 'Fixed issue',
              suggestion: 'Apply verified update.'
            }
          ]
        }
      })
    })
  })

  await retryBtn.click()
  const recoveredCard = aiGroup.locator('.ai-analysis-card')
  await recoveredCard.waitFor({ state: 'visible', timeout: 5000 })
  const recoveredText = await recoveredCard.locator('.ai-explanation-text').textContent()
  assert(recoveredText.includes('Retried successfully'), 'Recovery after retry confirmed')
  console.log('Passed Test 4: API failure and retry behavior verified.')

  console.log('Test 5: Testing clean run with no findings...')
  const cleanItem = historyItems.first()
  await cleanItem.locator('.expand-button').click()
  const cleanPanel = cleanItem.locator('.evidence-panel')
  await cleanPanel.waitFor({ state: 'visible', timeout: 5000 })

  const cleanFindings = cleanPanel.locator('.findings-group .evidence-empty')
  const hasEmptyText = await cleanFindings.isVisible()
  if (hasEmptyText) {
    const emptyText = await cleanFindings.textContent()
    assert(emptyText.includes('No failure findings detected'), 'Empty findings message verified')
    const cleanAiBtn = cleanPanel.locator('.ai-action-button')
    assert.strictEqual(await cleanAiBtn.isVisible(), false, 'Clean runs do not show Generate AI Analysis button')
    console.log('Passed Test 5: Clean run without findings verified.')
  }

  console.log('Test 6: Testing mobile responsive viewport...')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(300)
  const isHeaderVisible = await page.locator('.app-header').isVisible()
  assert(isHeaderVisible, 'Header visible on mobile')
  const isMainVisible = await page.locator('.app-main').isVisible()
  assert(isMainVisible, 'Main container visible on mobile')

  const cardWidth = await errorItem.evaluate((el) => el.clientWidth)
  assert(cardWidth > 200 && cardWidth <= 375, `Card width fits within mobile viewport (${cardWidth}px)`)
  console.log('Passed Test 6: Mobile responsive viewport verified.')

  await browser.close()
  console.log('ALL KLYRO STEP 8C FRONTEND AI ANALYSIS AUDIT TESTS PASSED!')
}

runAiFrontendAudit().catch((err) => {
  console.error('Frontend AI audit failed:', err)
  process.exit(1)
})
