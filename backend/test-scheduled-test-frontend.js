import { chromium } from 'playwright'
import assert from 'node:assert'

const runScheduledTestFrontendAudit = async () => {
  console.log('--- STARTING KLYRO STEP 13C SCHEDULED TESTING FRONTEND AUDIT ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  let mockSchedules = [
    {
      _id: 'mock-sched-1',
      url: 'https://example.com/site-1',
      intervalMinutes: 15,
      enabled: true,
      createdAt: '2026-10-26T10:00:00.000Z'
    },
    {
      _id: 'mock-sched-2',
      url: 'https://example.com/site-2',
      intervalMinutes: 60,
      enabled: false,
      createdAt: '2026-10-26T09:00:00.000Z'
    }
  ]

  let postRequestBody = null
  let patchRequestBody = null
  let shouldFailSchedulesGet = false
  let shouldFailSchedulePatch = false
  let shouldFailScheduleDelete = false
  let delayPostResponse = false
  let resolvePostPromise = null

  let nextScheduleId = 100
  await page.route('**/api/schedules', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      if (shouldFailSchedulesGet) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error loading schedules' })
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSchedules)
      })
    } else if (method === 'POST') {
      postRequestBody = JSON.parse(route.request().postData() || '{}')
      if (delayPostResponse) {
        await new Promise((resolve) => {
          resolvePostPromise = resolve
        })
      }
      const newSchedule = {
        _id: `mock-sched-${nextScheduleId++}`,
        url: postRequestBody.url,
        intervalMinutes: postRequestBody.intervalMinutes,
        enabled: true,
        createdAt: new Date().toISOString()
      }
      mockSchedules.unshift(newSchedule)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newSchedule)
      })
    } else {
      await route.continue()
    }
  })

  await page.route('**/api/schedules/*', async (route) => {
    const method = route.request().method()
    const url = route.request().url()
    const id = url.split('/').pop()

    if (method === 'PATCH') {
      patchRequestBody = JSON.parse(route.request().postData() || '{}')
      if (shouldFailSchedulePatch) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated patch failure' })
        })
        return
      }
      const target = mockSchedules.find((s) => s._id === id)
      if (target) {
        if (patchRequestBody.enabled !== undefined) {
          target.enabled = patchRequestBody.enabled
        }
        if (patchRequestBody.url !== undefined) {
          target.url = patchRequestBody.url
        }
        if (patchRequestBody.intervalMinutes !== undefined) {
          target.intervalMinutes = patchRequestBody.intervalMinutes
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(target || { _id: id, ...patchRequestBody })
      })
    } else if (method === 'DELETE') {
      if (shouldFailScheduleDelete) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated delete error' })
        })
        return
      }
      mockSchedules = mockSchedules.filter((s) => s._id !== id)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Schedule deleted successfully', id })
      })
    } else {
      await route.continue()
    }
  })

  try {
    console.log('Test 1: Dashboard loads and displays existing schedules...')
    await page.goto('http://localhost:5173')
    await page.waitForSelector('.schedules-section')

    const sectionTitle = await page.locator('.schedules-title').textContent()
    assert.strictEqual(sectionTitle.trim(), 'Scheduled Testing')

    const scheduleItems = page.locator('.schedule-item')
    await page.waitForFunction(() => document.querySelectorAll('.schedule-item').length === 2)
    assert.strictEqual(await scheduleItems.count(), 2)

    const url1 = await page.locator('.schedule-item').nth(0).locator('.schedule-url').textContent()
    assert.strictEqual(url1.trim(), 'https://example.com/site-1')

    const interval1 = await page.locator('.schedule-item').nth(0).locator('.schedule-interval').textContent()
    assert.strictEqual(interval1.trim(), 'Every 15 minutes')

    const statusBadge1 = await page.locator('.schedule-item').nth(0).locator('.schedule-status-badge').textContent()
    assert.strictEqual(statusBadge1.trim(), 'Active')

    const toggleBtn1 = await page.locator('.schedule-item').nth(0).locator('.schedule-toggle-btn').textContent()
    assert.strictEqual(toggleBtn1.trim(), 'Disable')

    const url2 = await page.locator('.schedule-item').nth(1).locator('.schedule-url').textContent()
    assert.strictEqual(url2.trim(), 'https://example.com/site-2')

    const interval2 = await page.locator('.schedule-item').nth(1).locator('.schedule-interval').textContent()
    assert.strictEqual(interval2.trim(), 'Every 1 hour')

    const statusBadge2 = await page.locator('.schedule-item').nth(1).locator('.schedule-status-badge').textContent()
    assert.strictEqual(statusBadge2.trim(), 'Disabled')

    const toggleBtn2 = await page.locator('.schedule-item').nth(1).locator('.schedule-toggle-btn').textContent()
    assert.strictEqual(toggleBtn2.trim(), 'Enable')
    console.log('Passed Test 1: Dashboard loaded and rendered active and disabled schedules.\n')

    console.log('Test 2: Empty state displays when no schedules exist...')
    mockSchedules = []
    await page.locator('.schedules-refresh-btn').click()
    await page.waitForSelector('.schedules-empty')
    const emptyTitle = await page.locator('.schedules-empty .empty-title').textContent()
    assert.strictEqual(emptyTitle.trim(), 'No scheduled tests')
    console.log('Passed Test 2: Empty state rendered when no schedules present.\n')

    console.log('Test 3: Loading and API error states work...')
    shouldFailSchedulesGet = true
    await page.locator('.schedules-refresh-btn').click()
    await page.waitForSelector('.schedules-error')
    const errorText = await page.locator('.schedules-error .error-message').textContent()
    assert.strictEqual(errorText.trim(), 'Server error loading schedules')

    shouldFailSchedulesGet = false
    mockSchedules = [
      {
        _id: 'mock-sched-1',
        url: 'https://example.com/site-1',
        intervalMinutes: 15,
        enabled: true,
        createdAt: '2026-10-26T10:00:00.000Z'
      }
    ]
    await page.locator('.schedules-retry-btn').click()
    await page.waitForSelector('.schedule-item')
    assert.strictEqual(await page.locator('.schedule-item').count(), 1)
    console.log('Passed Test 3: API error state displayed and retry restored list.\n')

    console.log('Test 4: Invalid URLs are rejected...')
    await page.fill('#schedule-url-input', 'not-a-valid-url')
    await page.fill('#schedule-interval-input', '10')
    await page.click('.schedule-submit-btn')
    await page.waitForSelector('.schedule-form-error')
    let formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('valid HTTP or HTTPS URL'))

    await page.fill('#schedule-url-input', 'ftp://example.com')
    await page.click('.schedule-submit-btn')
    formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('HTTP and HTTPS'))

    await page.fill('#schedule-url-input', '')
    await page.click('.schedule-submit-btn')
    formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('URL is required'))
    console.log('Passed Test 4: Invalid and missing URLs rejected with descriptive validation.\n')

    console.log('Test 5: Invalid or missing intervals are rejected...')
    await page.fill('#schedule-url-input', 'https://example.com/valid-page')
    await page.fill('#schedule-interval-input', '0')
    await page.click('.schedule-submit-btn')
    await page.waitForSelector('.schedule-form-error')
    formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('at least 1 minute'))

    await page.fill('#schedule-interval-input', '-5')
    await page.click('.schedule-submit-btn')
    formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('at least 1 minute'))

    await page.fill('#schedule-interval-input', '')
    await page.click('.schedule-submit-btn')
    formError = await page.locator('.schedule-form-error').textContent()
    assert(formError.includes('at least 1 minute'))
    console.log('Passed Test 5: Invalid intervals rejected with descriptive validation.\n')

    console.log('Test 6: Valid schedule creation sends the correct request and refreshes the list...')
    postRequestBody = null
    await page.fill('#schedule-url-input', 'https://example.com/newly-created')
    await page.fill('#schedule-interval-input', '30')
    await page.click('.schedule-submit-btn')

    await page.waitForFunction(() => document.querySelectorAll('.schedule-item').length === 2)
    assert(postRequestBody)
    assert.strictEqual(postRequestBody.url, 'https://example.com/newly-created')
    assert.strictEqual(postRequestBody.intervalMinutes, 30)

    const inputUrlVal = await page.locator('#schedule-url-input').inputValue()
    const inputIntervalVal = await page.locator('#schedule-interval-input').inputValue()
    assert.strictEqual(inputUrlVal, '')
    assert.strictEqual(inputIntervalVal, '')

    const firstItemUrl = await page.locator('.schedule-item').nth(0).locator('.schedule-url').textContent()
    assert.strictEqual(firstItemUrl.trim(), 'https://example.com/newly-created')
    console.log('Passed Test 6: Valid schedule creation sent expected payload and refreshed list.\n')

    console.log('Test 7: Duplicate submissions are prevented...')
    delayPostResponse = true
    await page.fill('#schedule-url-input', 'https://example.com/delay-test')
    await page.fill('#schedule-interval-input', '10')
    const submitBtn = page.locator('.schedule-submit-btn')
    await submitBtn.click()

    await page.waitForFunction(() => document.querySelector('.schedule-submit-btn').hasAttribute('disabled'))
    const btnTextWhileSubmitting = await submitBtn.textContent()
    assert.strictEqual(btnTextWhileSubmitting.trim(), 'Creating...')

    delayPostResponse = false
    if (resolvePostPromise) {
      resolvePostPromise()
    }
    await page.waitForFunction(() => !document.querySelector('.schedule-submit-btn').hasAttribute('disabled'))
    console.log('Passed Test 7: Duplicate submissions prevented during pending creation.\n')

    console.log('Test 8: Enable and disable requests send the correct payload...')
    patchRequestBody = null
    const firstToggle = page.locator('.schedule-item').nth(0).locator('.schedule-toggle-btn')
    await firstToggle.click()

    await page.waitForFunction(() => document.querySelector('.schedule-item .schedule-status-badge').textContent.includes('Disabled'))
    assert(patchRequestBody)
    assert.strictEqual(patchRequestBody.enabled, false)

    patchRequestBody = null
    await firstToggle.click()
    await page.waitForFunction(() => document.querySelector('.schedule-item .schedule-status-badge').textContent.includes('Active'))
    assert(patchRequestBody)
    assert.strictEqual(patchRequestBody.enabled, true)
    console.log('Passed Test 8: Enable and disable toggles sent expected payloads and updated UI.\n')

    console.log('Test 9: Failed updates preserve the correct displayed state...')
    shouldFailSchedulePatch = true
    await firstToggle.click()
    await page.waitForSelector('.schedule-action-error')
    const actionErrorText = await page.locator('.schedule-action-error span').textContent()
    assert(actionErrorText.includes('Simulated patch failure'))

    const statusAfterFail = await page.locator('.schedule-item').nth(0).locator('.schedule-status-badge').textContent()
    assert.strictEqual(statusAfterFail.trim(), 'Active')

    shouldFailSchedulePatch = false
    await page.locator('.schedule-error-dismiss').click()
    assert.strictEqual(await page.locator('.schedule-action-error').count(), 0)
    console.log('Passed Test 9: Failed updates preserved state and rendered dismissable error.\n')

    console.log('Test 10: Delete confirmation and successful deletion work...')
    let dialogHandled = false
    page.once('dialog', async (dialog) => {
      assert(dialog.message().includes('delete'))
      dialogHandled = true
      await dialog.accept()
    })

    const countBeforeDelete = await page.locator('.schedule-item').count()
    await page.locator('.schedule-item').nth(0).locator('.schedule-delete-btn').click()
    await page.waitForFunction((prev) => document.querySelectorAll('.schedule-item').length === prev - 1, countBeforeDelete)
    assert.strictEqual(dialogHandled, true)
    await page.waitForFunction(() => !document.querySelector('.schedule-delete-btn[disabled]'))
    console.log('Passed Test 10: Schedule delete confirmed and item removed from UI.\n')

    console.log('Test 11: Failed deletion preserves the schedule and displays an error...')
    shouldFailScheduleDelete = true
    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })

    const countBeforeFailedDelete = await page.locator('.schedule-item').count()
    await page.locator('.schedule-item').nth(0).locator('.schedule-delete-btn').click()
    await page.waitForSelector('.schedule-action-error')
    const deleteErrorMsg = await page.locator('.schedule-action-error span').textContent()
    assert(deleteErrorMsg.includes('Simulated delete error'))

    await page.waitForFunction(() => !document.querySelector('.schedule-delete-btn[disabled]'))
    const countAfterFailedDelete = await page.locator('.schedule-item').count()
    assert.strictEqual(countAfterFailedDelete, countBeforeFailedDelete)
    shouldFailScheduleDelete = false
    console.log('Passed Test 11: Failed deletion preserved schedule and displayed error banner.\n')

    console.log('Test 12: Existing application features remain available...')
    assert(await page.locator('.run-form').isVisible())
    assert(await page.locator('.url-input').isVisible())
    assert(await page.locator('.alerts-status-section').isVisible())
    assert(await page.locator('.alerts-test-btn').isVisible())
    assert(await page.locator('.history-section').isVisible())
    assert(await page.locator('.history-filter-controls').isVisible())
    console.log('Passed Test 12: Core application features, alerts dashboard, and history remain intact.\n')

    console.log('Test 13: The dashboard has no horizontal overflow at 375px viewport width...')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(300)

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    assert.strictEqual(hasHorizontalOverflow, false)

    const schedulesSectionBox = await page.locator('.schedules-section').boundingBox()
    assert(schedulesSectionBox)
    assert(schedulesSectionBox.width <= 375)
    console.log('Passed Test 13: Zero horizontal overflow confirmed at 375px mobile viewport.\n')

    console.log('ALL KLYRO STEP 13C SCHEDULED TESTING FRONTEND AUDIT TESTS PASSED!')
  } finally {
    await browser.close()
  }
}

runScheduledTestFrontendAudit().catch((err) => {
  console.error('Test Suite Failed:', err)
  process.exit(1)
})
