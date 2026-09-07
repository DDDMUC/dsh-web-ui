import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', m => { if (m.type() === 'error') logs.push('ERR ' + m.text().slice(0, 160)) })
page.on('requestfailed', r => logs.push('REQFAIL ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')))
await page.goto('http://127.0.0.1:3092/', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(6000)
const info = await page.evaluate(() => {
  const pet = document.querySelector('[data-dsh-plugin="pet"]')
  let html = ''
  if (pet) html = pet.outerHTML.slice(0, 700)
  return { html }
})
console.log(JSON.stringify(info, null, 1))
console.log('ERRLOGS', JSON.stringify(logs.slice(0, 10)))
await browser.close()
