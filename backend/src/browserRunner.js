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

    await page.addInitScript(() => {
      window.__klyro_lcp = null
      try {
        const po = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries()
          if (entries.length > 0) {
            window.__klyro_lcp = entries[entries.length - 1]
          }
        })
        po.observe({ type: 'largest-contentful-paint', buffered: true })
      } catch {}
    })

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForLoadState('load', { timeout: 3000 })
    } catch {}

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

    let performanceMetrics = null
    try {
      performanceMetrics = await page.evaluate(() => {
        let nav = null
        try {
          const navEntries = performance.getEntriesByType('navigation')
          if (Array.isArray(navEntries) && navEntries.length > 0) {
            nav = navEntries[0]
          }
        } catch {}

        let navDuration = null
        let dclDuration = null

        if (nav) {
          if (typeof nav.loadEventEnd === 'number' && nav.loadEventEnd > 0) {
            const start = typeof nav.startTime === 'number' ? nav.startTime : 0
            const diff = nav.loadEventEnd - start
            if (Number.isFinite(diff) && diff >= 0) {
              navDuration = Math.round(diff * 100) / 100
            }
          }
          if (typeof nav.domContentLoadedEventEnd === 'number' && nav.domContentLoadedEventEnd > 0) {
            const start = typeof nav.startTime === 'number' ? nav.startTime : 0
            const diff = nav.domContentLoadedEventEnd - start
            if (Number.isFinite(diff) && diff >= 0) {
              dclDuration = Math.round(diff * 100) / 100
            }
          }
        } else if (typeof performance !== 'undefined' && performance.timing) {
          const t = performance.timing
          if (typeof t.loadEventEnd === 'number' && t.loadEventEnd > 0 && typeof t.navigationStart === 'number' && t.navigationStart > 0 && t.loadEventEnd >= t.navigationStart) {
            navDuration = t.loadEventEnd - t.navigationStart
          }
          if (typeof t.domContentLoadedEventEnd === 'number' && t.domContentLoadedEventEnd > 0 && typeof t.navigationStart === 'number' && t.navigationStart > 0 && t.domContentLoadedEventEnd >= t.navigationStart) {
            dclDuration = t.domContentLoadedEventEnd - t.navigationStart
          }
        }

        let fcp = null
        try {
          const paintEntries = performance.getEntriesByType('paint')
          if (Array.isArray(paintEntries)) {
            const fcpEntry = paintEntries.find((p) => p.name === 'first-contentful-paint')
            if (fcpEntry && typeof fcpEntry.startTime === 'number' && Number.isFinite(fcpEntry.startTime) && fcpEntry.startTime >= 0) {
              fcp = Math.round(fcpEntry.startTime * 100) / 100
            }
          }
        } catch {}

        let lcp = null
        try {
          let lcpEntry = window.__klyro_lcp || null
          if (!lcpEntry) {
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
            if (Array.isArray(lcpEntries) && lcpEntries.length > 0) {
              lcpEntry = lcpEntries[lcpEntries.length - 1]
            }
          }
          if (lcpEntry) {
            const lcpTime = typeof lcpEntry.renderTime === 'number' && lcpEntry.renderTime > 0
              ? lcpEntry.renderTime
              : (typeof lcpEntry.loadTime === 'number' && lcpEntry.loadTime > 0
                ? lcpEntry.loadTime
                : lcpEntry.startTime)
            if (typeof lcpTime === 'number' && Number.isFinite(lcpTime) && lcpTime >= 0) {
              lcp = Math.round(lcpTime * 100) / 100
            }
          }
        } catch {}

        let totalTransferredBytes = null
        try {
          let sum = 0
          let observed = false
          if (nav && typeof nav.transferSize === 'number' && Number.isFinite(nav.transferSize) && nav.transferSize >= 0) {
            sum += nav.transferSize
            observed = true
          }
          const resources = performance.getEntriesByType('resource')
          if (Array.isArray(resources)) {
            for (const r of resources) {
              if (typeof r.transferSize === 'number' && Number.isFinite(r.transferSize) && r.transferSize >= 0) {
                sum += r.transferSize
                observed = true
              }
            }
          }
          if (observed) {
            totalTransferredBytes = Math.round(sum)
          }
        } catch {}

        return {
          navigationDurationMs: navDuration,
          domContentLoadedDurationMs: dclDuration,
          firstContentfulPaintMs: fcp,
          largestContentfulPaintMs: lcp,
          totalTransferredBytes,
          transferredBytesDescription: 'Browser-observed estimate of transferred resource bytes via Resource Timing API'
        }
      })
    } catch {
      performanceMetrics = null
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
      screenshotError,
      performanceMetrics
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
