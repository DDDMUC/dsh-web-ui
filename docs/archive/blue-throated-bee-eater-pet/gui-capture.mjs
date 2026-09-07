import { chromium } from 'playwright'

const base = 'http://127.0.0.1:3092'
const out = 'docs/archive/blue-throated-bee-eater-pet'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + '/', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(5000)
// docked pet, two frames 600ms apart (animation proof)
await page.screenshot({ path: out + '/gui-pet-dock-a.png' })
await page.waitForTimeout(600)
await page.screenshot({ path: out + '/gui-pet-dock-b.png' })
await page.waitForTimeout(600)
await page.screenshot({ path: out + '/gui-pet-dock-c.png' })
// pet settings section view
await page.getByText('Settings', { exact: true }).first().click()
await page.waitForTimeout(2000)
await page.getByText('Pet', { exact: true }).first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: out + '/gui-pet-settings.png' })
await browser.close()
console.log('DONE')
