import { mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.AGRIQILL_URL ?? 'http://localhost:3000/';
const OUT = resolve(process.argv[2] ?? 'pitch-out');
const SIZE = { width: 1600, height: 900 };
const HOLD_OVERRIDE_MS = process.env.PITCH_HOLD_MS ? Number(process.env.PITCH_HOLD_MS) : null;
const HOLD_S = { open: 25, see: 15, check: 27, ai: 28, approve: 18, prove: 15, ask: 18 };
const ACCESS_CODE = process.env.AGRIQILL_ACCESS_CODE ?? '';
const REPORTER = process.env.AGRIQILL_REPORTER ?? 'Demo scout';
const DEMO_READINGS = [
  ['ws-01', { wind_ms: 6.4 }],
  ['PD-02-tube', { water_depth_cm: -17 }],
];

async function seedReadings() {
  const observed_at = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const headers = { 'content-type': 'application/json', ...(ACCESS_CODE ? { 'X-AgriQuill-Write-Token': ACCESS_CODE } : {}) };
  for (const [device_id, values] of DEMO_READINGS) {
    const res = await fetch(new URL('api/v1/agriquill/telemetry/readings', BASE), {
      method: 'POST',
      headers,
      body: JSON.stringify({ device_id, observed_at, values, reporter: REPORTER }),
    });
    if (!res.ok) throw new Error(`demo reading for ${device_id} was refused: ${res.status} ${await res.text()}`);
  }
}

await seedReadings();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
let page;
try {
  page = await context.newPage();
} catch (error) {
  if (!String(error).includes('ffmpeg')) throw error;
  console.log('No video: Playwright ffmpeg is missing (npx playwright install ffmpeg). Saving step screenshots only.');
  await context.close();
  context = await browser.newContext({ viewport: SIZE });
  page = await context.newPage();
}
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const mapReady = async () => {
  await page.waitForSelector('.aq-farmmap', { timeout: 60000 });
  await page.waitForSelector('.aq-fm-boot', { state: 'detached', timeout: 90000 });
};

async function step(number, id, act = async () => {}) {
  const name = `${number}-${id}`;
  console.log(`step ${name}`);
  const started = Date.now();
  await act();
  const left = (HOLD_OVERRIDE_MS ?? HOLD_S[id] * 1000) - (Date.now() - started);
  if (left > 0) await page.waitForTimeout(left);
  else console.log(`  ${name} ran ${Math.round(-left / 1000)} s over its hold`);
  await shot(name);
  if (id !== 'ask') await page.keyboard.press('PageDown');
}

try {
  if (ACCESS_CODE) {
    await page.addInitScript(
      ([code, reporter]) => {
        window.localStorage.setItem('agriquill.accessCode', code);
        window.localStorage.setItem('agriquill.reporter', reporter);
      },
      [ACCESS_CODE, REPORTER]
    );
  }
  await page.goto(`${BASE}?story`, { waitUntil: 'domcontentloaded' });

  await step('01', 'open', mapReady);

  await step('02', 'see', async () => {
    await page.locator('.aq-fm-search-box input').fill('AQ-MM-0001');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.aq-fm-right .aq-fm-head', { timeout: 20000 });
    await page.locator('.aq-site').first().waitFor({ timeout: 90000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector('.aq-site .aq-tw-spin'), null, { timeout: 90000 }).catch(() => undefined);
    await page.locator('.aq-site').first().scrollIntoViewIfNeeded().catch(() => undefined);
  });

  await step('03', 'check', async () => {
    await page.waitForSelector('.ops-topbar', { timeout: 30000 });
    await page.getByText(/^Drones (held|may fly) today/).waitFor({ timeout: 30000 }).catch(() => undefined);
  });

  await step('04', 'ai');

  await step('05', 'approve', async () => {
    const phone = page.frameLocator('.story-phone');
    await phone.getByLabel('Your name').fill(REPORTER, { timeout: 30000 });
    await phone.locator('button[aria-expanded]').filter({ hasText: 'PD-02' }).first().click({ timeout: 30000 }).catch(() => undefined);
    const depth = phone.getByLabel('Tube depth (cm)').first();
    if (await depth.count()) {
      await depth.fill('-18');
      await phone.getByRole('button', { name: /Log reading/ }).first().click();
    }
    await page.waitForTimeout(2500);
    await phone.getByRole('button', { name: 'Manager' }).click();
    await phone.getByRole('button', { name: 'Check now' }).click();
    const approve = phone.getByRole('button', { name: /Approve/ }).first();
    await approve.waitFor({ timeout: 20000 }).catch(() => undefined);
    if (await approve.count()) {
      await page.waitForTimeout(3000);
      await approve.click();
    }
  });

  await step('06', 'prove', async () => {
    await page.waitForFunction(() => !document.querySelector('.story-live')?.textContent?.startsWith('Reading'), null, { timeout: 20000 });
  });

  await step('07', 'ask', mapReady);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) renameSync(await video.path(), join(OUT, 'agriqill-pitch.webm'));
  console.log(`${video ? 'video and step screenshots' : 'step screenshots'} in ${OUT}`);
}

console.log(`page errors: ${errors.length ? errors.join(' | ').slice(0, 400) : 'none'}`);
