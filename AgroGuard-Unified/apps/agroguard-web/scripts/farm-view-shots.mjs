import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/farmsim/';
const USER = process.env.FARMSIM_USER;
const CODE = process.env.FARMSIM_CODE;
const OUT = process.env.SHOTS_DIR ?? join(tmpdir(), 'farm-view-shots');
const FARMS = (process.env.FARMS ?? 'AQ-PH-0921,AQ-ID-0641,AQ-VN-0301,AQ-ID-0621,AQ-TH-0241').split(',');
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
];
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));

if (!USER || !CODE) throw new Error('Set FARMSIM_USER and FARMSIM_CODE (the dev sign-in is in docs/FARM_MAP_HANDOFF.md).');
if (!CHROME) throw new Error('Set CHROME_PATH to a Chrome or Chromium executable.');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(page, farm) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('input.si-input').first().fill(USER);
  await page.locator('#si-code').fill(CODE);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('[aria-label="Farm map"]', { timeout: 60000 });
  await page.locator('[aria-label="Farm map"]').first().click();
  await page.waitForSelector('.aq-fm-map canvas', { timeout: 60000 });
  await page.waitForTimeout(4000);
  const search = page.locator('.aq-fm-search input');
  await search.click();
  await search.fill(farm);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: /Open 3D view/ }).first().click();
  await page.waitForSelector('.aq-fm-replica[data-ready="true"]', { timeout: 90000 }).catch(() => console.log(`${farm}: not ready in time`));
  await page.waitForTimeout(3500);
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    for (const farm of FARMS) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('theme', t);
          document.documentElement.dataset.theme = t;
        } catch {}
      }, theme);
      page.on('pageerror', (e) => console.log(`${farm} ${size.name} ${theme} pageerror:`, String(e).slice(0, 200)));
      await open(page, farm);
      const file = join(OUT, `${farm}-${size.name}-${theme}.png`);
      await page.screenshot({ path: file });
      const root = page.locator('.aq-fm-replica');
      console.log(file, 'terrain:', await root.getAttribute('data-terrain'), 'volcanic:', await root.getAttribute('data-volcanic'));
      await context.close();
    }
  }
}
await browser.close();
