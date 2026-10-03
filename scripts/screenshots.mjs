// Tar skjermbilder av siden i tre størrelser (mobil, nettbrett, desktop) med Playwright.
// Kjør: npm run build && node scripts/screenshots.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
mkdirSync('screenshots', { recursive: true });

const sizes = { mobil: [390, 844], nettbrett: [820, 1180], desktop: [1440, 900] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const [navn, [w, h]] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'nb-NO' });
    const page = await ctx.newPage();
    const feil = [];
    page.on('console', (m) => { if (m.type() === 'error') feil.push(m.text()); });
    page.on('pageerror', (e) => feil.push(String(e)));
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `screenshots/${navn}-side.png`, fullPage: true });
    // Omvisning: hopp over, kjør scenario 2 ferdig
    await page.evaluate(() => window.scrollTo({ top: document.getElementById('sim-scenarioer').getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' }));
    await page.waitForTimeout(800);
    const hopp = page.locator('[data-hopp]');
    await hopp.waitFor({ timeout: 6000 }).catch(() => {});
    if (await hopp.count()) { await page.screenshot({ path: `screenshots/${navn}-omvisning.png` }); await hopp.click(); await page.waitForSelector('#tour', { state: 'hidden' }); }
    await page.locator('#scenario-knapper button').nth(1).click();
    await page.locator('#sim-transport [data-fart="3600"]').click({ force: true });
    await page.waitForSelector('#oppsummering:not([hidden])', { timeout: 120000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('sim-app').scrollIntoView());
    await page.screenshot({ path: `screenshots/${navn}-simulering.png`, fullPage: true });
    if (navn === 'mobil') {
      await page.locator('#fane-telefon').click();
      await page.evaluate(() => document.getElementById('panel-telefon').scrollIntoView());
      await page.screenshot({ path: `screenshots/${navn}-telefon.png` });
      await page.locator('#fane-innstillinger').click();
      await page.evaluate(() => document.getElementById('panel-innstillinger').scrollIntoView());
      await page.screenshot({ path: `screenshots/${navn}-innstillinger.png` });
    }
    console.log(navn, feil.length ? 'FEIL: ' + feil.join(' | ') : 'ingen konsollfeil');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
