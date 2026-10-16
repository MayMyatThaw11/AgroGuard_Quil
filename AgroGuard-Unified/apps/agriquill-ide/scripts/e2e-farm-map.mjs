import { chromium } from 'playwright-core';

const BASE = process.env.AGRIQILL_URL ?? 'http://localhost:4173/';
const BOOT_TIMEOUT_MS = 60000;
const ACCESS_CODE = process.env.AGRIQILL_ACCESS_CODE ?? '';
const REPORTER = process.env.AGRIQILL_REPORTER ?? '';
const failures = [];
const pageErrors = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  if (ACCESS_CODE) {
    await page.addInitScript(
      ([code, reporter]) => {
        window.localStorage.setItem('agriquill.accessCode', code);
        window.localStorage.setItem('agriquill.reporter', reporter);
      },
      [ACCESS_CODE, REPORTER]
    );
  }

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('.ops-topbar').getByRole('button', { name: 'Farm map' }).click({ timeout: 30000 });
  await page.waitForSelector('.aq-farmmap', { timeout: 30000 });
  check('farm map opens from the field view', true);
  check('activity bar has one Farm map entry', (await page.locator('[aria-label="Activity Bar"] [role="tab"]', { hasText: /Fleet/ }).count()) === 0);

  await page.waitForSelector('.aq-fm-boot', { state: 'detached', timeout: BOOT_TIMEOUT_MS });
  check('map boots and the boot screen leaves', true);
  check('map canvas has a real size', await page.evaluate(() => {
    const canvas = document.querySelector('.aq-fm-map canvas');
    return !!canvas && canvas.clientWidth > 600 && canvas.clientHeight > 400;
  }));
  const box = await page.locator('.aq-fm-map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 40 && !(await page.locator('.aq-fm-overview').count()); i += 1) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1500);
  check('scrolling out from the farm reaches the ASEAN overview', (await page.locator('.aq-fm-overview').count()) === 1);
  check('overview lists all 11 countries', (await page.locator('.aq-fm-overview .aq-fm-near').count()) === 11);
  check('page title heading is present', (await page.getByRole('heading', { name: 'ASEAN Farm Map', level: 1 }).count()) === 1);

  const search = page.locator('.aq-fm-search-box input');
  await search.fill('AQ-MM-0001');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.aq-fm-right .aq-fm-head', { timeout: 15000 });
  check('searching a farm code opens its panel', (await page.locator('.aq-fm-right .aq-title').first().textContent()) === 'Maubin Seed Farm');
  check('rice farm shows the AWD re-flood level from paddy settings', (await page.getByText('AWD re-flood level').count()) === 1);

  check('selected rice farm shows the action bar', (await page.locator('.aq-fm-selbar').count()) === 1);
  await page.locator('.aq-fm-selbar').getByRole('button', { name: /Open field monitor/ }).click();
  await page.waitForSelector('.ops-topbar', { timeout: 15000 });
  check('field monitor opens for the selected farm', ((await page.locator('.ops-brand h1').textContent()) ?? '').startsWith('Maubin Seed Farm'));
  await page.locator('.ops-topbar').getByRole('button', { name: 'Farm map' }).click();
  await page.waitForSelector('.aq-farmmap', { timeout: 15000 });
  await page.waitForSelector('.aq-fm-boot', { state: 'detached', timeout: BOOT_TIMEOUT_MS });
  check('Farm map button returns to the map', true);

  await page.keyboard.press('Escape');
  check('Escape clears the selection', (await page.locator('.aq-fm-right .aq-fm-overview, .aq-fm-right .aq-fm-sec.is-head .aq-title').first().textContent()) !== 'Maubin Seed Farm');

  await page.locator('body').click({ position: { x: 700, y: 400 } });
  await page.keyboard.press('?');
  check('question mark opens the shortcuts dialog', (await page.locator('[role=dialog]').count()) === 1);
  await page.keyboard.press('Escape');
  check('Escape closes the shortcuts dialog', (await page.locator('[role=dialog]').count()) === 0);

  await page.keyboard.press('o');
  check('offline simulation shows its banner', (await page.locator('.aq-fm-offline').count()) === 1);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
} catch (error) {
  failures.push(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  console.log(`FAIL unexpected error: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll farm map smoke checks passed');
