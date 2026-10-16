/**
 * Screenshot harness. Drives the locally installed Chrome over the DevTools
 * Protocol using playwright-core, so no browser download is required.
 *
 * Usage: node scripts/shoot.mjs [outDir]
 */

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.AGRIQUILL_URL ?? 'http://localhost:5173/';
const outDir = process.argv[2] ?? 'screenshots';

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 }
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const themeArg = process.env.AGRIQUILL_THEME ?? 'dark';
  const suffix = themeArg === 'light' ? '-light' : '';

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      // Both themes are captured. The app persists its choice in localStorage,
      // so each run must seed it explicitly rather than inheriting the media
      // query, otherwise a light-theme capture can silently masquerade as dark.
      colorScheme: 'dark',
      storageState: undefined
    });
    await context.addInitScript(theme => {
      try {
        window.localStorage.setItem('agriquill.theme', theme);
      } catch {
        /* storage unavailable; the inline bootstrap will fall back */
      }
    }, themeArg);
    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`[${vp.name}] ${msg.text()}`);
    });
    page.on('pageerror', err => pageErrors.push(`[${vp.name}] ${err.message}`));

    page.on('response', res => {
      if (res.status() >= 500) failedRequests.push(`[${vp.name}] ${res.status()} ${res.url()}`);
    });
    page.on('requestfailed', req => {
      const text = req.failure()?.errorText ?? '';
      if (!text.includes('ERR_ABORTED')) failedRequests.push(`[${vp.name}] FAILED ${req.url()} (${text})`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(700);

    // 1. Default workspace
    await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-01-default.png`) });

    // 2. Editor with the prohibited token
    const editorTab = page.getByRole('button', { name: /Parcels & Explorer/i }).first();
    if (await editorTab.count()) {
      await editorTab.click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-02-editor.png`) });
    }

    // 3. Command palette
    await page.keyboard.press('Control+KeyK');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-03-palette.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // 4. Map / canvas
    const mapTab = page.getByRole('button', { name: /Spatial Scene/i }).first();
    if (await mapTab.count()) {
      await mapTab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-04-map.png`) });
    }

    // 5. Workflow
    const flowTab = page.getByRole('button', { name: /Workflow DAG/i }).first();
    if (await flowTab.count()) {
      await flowTab.click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-05-workflow.png`) });
    }

    // 6. Ledger
    const ledgerTab = page.getByRole('button', { name: /Decision Ledger/i }).first();
    if (await ledgerTab.count()) {
      await ledgerTab.click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-06-ledger.png`) });
    }

    // 7. Equipment / actuation panel
    const mcpTab = page.getByRole('button', { name: /Edge Actuators/i }).first();
    if (await mcpTab.count()) {
      await mcpTab.click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-07-actuation.png`) });
    }

    // 8. Presets
    const presetsTab = page.getByRole('button', { name: /ASEAN Presets/i }).first();
    if (await presetsTab.count()) {
      await presetsTab.click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-08-presets.png`) });
    }

    // 9. Split view
    const splitBtn = page.getByRole('button', { name: /Split-Screen Layout/i }).first();
    if (await splitBtn.count()) {
      await splitBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `${vp.name}${suffix}-09-split.png`) });
      await splitBtn.click();
      await page.waitForTimeout(250);
    }

    // Layout diagnostics: horizontal overflow and clipped controls
    const layout = await page.evaluate(() => {
      const de = document.documentElement;
      const overflowX = de.scrollWidth - de.clientWidth;
      const offenders = [];
      if (overflowX > 0) {
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 1 && r.width > 40) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className).slice(0, 70),
              right: Math.round(r.right)
            });
          }
        }
      }
      const primary = Array.from(document.querySelectorAll('button')).filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 60 && r.height > 20 && r.top >= 0 && r.left >= 0;
      });
      const clippedList = primary.filter(b => {
        const r = b.getBoundingClientRect();
        return r.right > de.clientWidth || r.bottom > de.clientHeight;
      }).map(b => (b.textContent || '').trim().slice(0, 30));
      return {
        overflowX,
        offenders: offenders.slice(0, 8),
        clippedPrimaryControls: clippedList.length,
        clippedIds: clippedList,
        totalButtons: primary.length
      };
    });

    console.log(`\n=== ${vp.name} ===`);
    console.log(JSON.stringify(layout, null, 2));

    await context.close();
  }

  await browser.close();

  console.log('\n=== console errors ===');
  console.log(consoleErrors.length === 0 ? 'none' : consoleErrors.join('\n'));
  console.log('\n=== page errors ===');
  console.log(pageErrors.length === 0 ? 'none' : pageErrors.join('\n'));
  console.log('\n=== failed requests ===');
  console.log(failedRequests.length === 0 ? 'none' : failedRequests.join('\n'));

  // Network-health assertion: a UI that looks right while the backend is down
  // must fail the harness, not silently pass.
  const backendFailures = failedRequests.filter(f => f.includes('/api/') || f.includes('/api/v1'));
  if (backendFailures.length > 0) {
    console.error(`\nNETWORK HEALTH FAIL: ${backendFailures.length} API request(s) failed`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('screenshot harness failed:', err);
  process.exit(1);
});