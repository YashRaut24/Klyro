import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

export const runBrowser = async (url) => {
  let browser
  const pageErrors = []
  const consoleErrors = []
  const failedRequests = []
  const httpErrors = []

  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    page.on('pageerror', (exception) => {
      pageErrors.push({
        message: exception.message ? exception.message.slice(0, 1000) : String(exception),
        name: exception.name || 'Error'
      })
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text().slice(0, 1000),
          location: msg.location()
        })
      }
    })

    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText || 'Network request failed'
      })
    })

    page.on('response', (response) => {
      if (response.status() >= 400) {
        httpErrors.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        })
      }
    })

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    const finalUrl = page.url()
    const status = response ? response.status() : null

    let screenshot = null
    let screenshotError = null

    try {
      const screenshotsDir = path.resolve('screenshots')
      await fs.mkdir(screenshotsDir, { recursive: true })
      const filename = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const filePath = path.join(screenshotsDir, filename)
      await page.screenshot({ path: filePath, fullPage: true })
      screenshot = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
    } catch (err) {
      screenshot = null
      screenshotError = err.message ? err.message.split('\n')[0] : 'Screenshot capture failed'
    }

    return {
      url,
      finalUrl,
      title,
      status,
      pageErrors,
      consoleErrors,
      failedRequests,
      httpErrors,
      screenshot,
      screenshotError
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
