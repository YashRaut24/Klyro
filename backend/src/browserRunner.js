import { chromium } from 'playwright'

export const runBrowser = async (url) => {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    const finalUrl = page.url()
    const status = response ? response.status() : null

    return {
      url,
      finalUrl,
      title,
      status
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
