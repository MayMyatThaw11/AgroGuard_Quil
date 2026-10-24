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
const GUIDE_KEY = 'aq-farmview-guide-seen';
const DRAW_CALL_LIMIT = 120;
const TRIANGLE_LIMIT = { 1440: 1_500_000, 375: 600_000 };
const PREVIEWS = ['Rain', 'Thunderstorm', 'Fog', 'Night'];
const EXTRAS = (process.env.EXTRAS ?? FARMS[0]).split(',');
let failed = false;
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));

if (!USER || !CODE) throw new Error('Set FARMSIM_USER and FARMSIM_CODE (the dev sign-in is in docs/FARM_MAP_HANDOFF.md).');
if (!CHROME) throw new Error('Set CHROME_PATH to a Chrome or Chromium executable.');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(page, farm, keepGuide = false) {
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
  await page.waitForTimeout(keepGuide ? 1500 : 3500);
}

async function newPage(size, theme, guide) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme });
  const page = await context.newPage();
  await page.addInitScript(([t, key, skip]) => {
    try {
      if (skip) localStorage.setItem(key, '1');
      localStorage.setItem('agriquill.theme', t);
    } catch {}
  }, [theme, GUIDE_KEY, !guide]);
  page.on('pageerror', (e) => console.log(`${size.name} ${theme} pageerror:`, String(e).slice(0, 200)));
  return { context, page };
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

async function budget(page, size, farm) {
  const root = page.locator('.aq-fm-replica');
  const calls = Number(await root.getAttribute('data-draw-calls'));
  const tris = Number(await root.getAttribute('data-triangles'));
  const bad = !(calls > 0) || calls > DRAW_CALL_LIMIT || tris > TRIANGLE_LIMIT[size.name];
  if (bad) failed = true;
  console.log(`${farm} ${size.name}: ${calls} draw calls (limit ${DRAW_CALL_LIMIT}), ${tris} triangles (limit ${TRIANGLE_LIMIT[size.name]}) ${bad ? 'OVER BUDGET' : 'ok'}`);
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    for (const farm of FARMS) {
      const { context, page } = await newPage(size, theme, false);
      await open(page, farm);
      await shot(page, `${farm}-${size.name}-${theme}`);
      const root = page.locator('.aq-fm-replica');
      console.log(farm, 'terrain:', await root.getAttribute('data-terrain'), 'volcanic:', await root.getAttribute('data-volcanic'));
      await budget(page, size, farm);
      if (EXTRAS.includes(farm)) {
        await page.locator('.aq-fm-replica-weather > summary').click();
        for (const name of PREVIEWS) {
          await page.getByRole('radio', { name, exact: true }).click();
          await page.waitForTimeout(3500);
          await shot(page, `${farm}-${size.name}-${theme}-weather-${name.toLowerCase()}`);
        }
        await page.getByRole('radio', { name: 'Now', exact: true }).click();
        await page.locator('.aq-fm-replica-weather > summary').click();
        await page.locator('.aq-fm-replica-flood > summary').click();
        const wheel = page.getByRole('spinbutton', { name: /water stood/i });
        await wheel.focus();
        for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(2500);
        await shot(page, `${farm}-${size.name}-${theme}-flood`);
      }
      await context.close();
    }
  }
}

for (const size of SIZES) {
  const { context, page } = await newPage(size, 'light', true);
  await open(page, FARMS[0], true);
  await shot(page, `${FARMS[0]}-${size.name}-guide`);
  await context.close();
}
await browser.close();
if (failed) process.exitCode = 1;
