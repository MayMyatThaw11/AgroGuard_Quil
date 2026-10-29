import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173/farmsim/';
export const OUT = process.env.SHOTS_DIR ?? join(tmpdir(), 'farm-map-shots');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));

export class MissingView extends Error {}

export async function launch() {
  if (!CHROME) throw new Error('Set CHROME_PATH to a Chrome or Chromium executable.');
  mkdirSync(OUT, { recursive: true });
  return chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

export async function page(browser, { width = 1440, height = 900, theme = 'light', lang = 'en' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const p = await context.newPage();
  await p.addInitScript(([t, l]) => {
    try {
      localStorage.setItem('agriquill.theme', t);
      localStorage.setItem('aq-farmview-guide-seen', '1');
      if (l) localStorage.setItem('agriquill.lang', l);
    } catch {}
  }, [theme, lang]);
  p.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)));
  return { context, page: p };
}

export async function ready(p, view, selector, timeout = 60000) {
  try {
    await p.waitForSelector(selector, { state: 'visible', timeout });
  } catch {
    throw new MissingView(`${view}: "${selector}" did not appear within ${timeout / 1000}s`);
  }
}

export async function signIn(p, user = process.env.FARMSIM_USER, code = process.env.FARMSIM_CODE) {
  if (!user || !code) throw new Error('Set FARMSIM_USER and FARMSIM_CODE (the dev sign-in is in docs/FARM_MAP_HANDOFF.md).');
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await ready(p, 'sign-in', 'input.si-input');
  await p.locator('input.si-input').first().fill(user);
  await p.locator('#si-code').fill(code);
  await p.locator('button[type="submit"]').click();
}

export async function openFarmMap(p) {
  await ready(p, 'app shell', '[aria-label="Farm map"]');
  await p.locator('[aria-label="Farm map"]').first().click();
  await ready(p, 'farm map', '.aq-fm-map canvas', 90000);
  await p.waitForFunction(() => !document.querySelector('.aq-fm-boot:not(.is-leaving)'), null, { timeout: 90000 }).catch(() => {
    throw new MissingView('farm map: boot screen still showing after 90s');
  });
  await p.waitForTimeout(2500);
}

export async function shot(p, name) {
  const file = join(OUT, `${name}.png`);
  await p.screenshot({ path: file });
  console.log(file);
  return file;
}

export async function run(main) {
  const browser = await launch();
  try {
    await main(browser);
  } catch (error) {
    console.error(error instanceof MissingView ? `MISSING VIEW: ${error.message}` : error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
