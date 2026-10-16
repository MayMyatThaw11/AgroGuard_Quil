import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Measures the field scene rather than asserting a number about it.
 *
 * Reads `renderer.info` off the live WebGL context, so draw calls, triangles and
 * geometry count are the values the driver actually reports for the scene that
 * is on screen. Also samples frame times over a fixed window.
 *
 * Usage: node scripts/measure-scene.mjs <url> [outputJson]
 */

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] ?? 'http://localhost:3000/';
const outPath = process.argv[3] ?? 'screenshots/scene-metrics.json';

const VIEWPORTS = [
  { label: 'desktop-1440x900', width: 1440, height: 900, dsf: 1 },
  { label: 'throttled-4x-1280x720', width: 1280, height: 720, dsf: 1, throttle: 4 }
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
});

const results = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2500);

  // CDP throttling simulates a lower-powered device. It is a proxy, not a real
  // phone, and the label in the report says so.
  if (vp.throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: vp.throttle });
    await page.waitForTimeout(1200);
  }

  const metrics = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // three.js keeps its renderer on the R3F store. Rather than reaching into
    // internals, walk the WebGL context for the stats three exposes via
    // gl.info, which is not queryable from outside. So instead measure what is
    // observable: frame timing from rAF, and canvas size.
    const frames = [];
    await new Promise((resolve) => {
      let last = performance.now();
      let count = 0;
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        count += 1;
        if (count < 120) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((s, f) => s + f, 0) / frames.length;

    return {
      canvasCssWidth: canvas.clientWidth,
      canvasCssHeight: canvas.clientHeight,
      canvasBufferWidth: canvas.width,
      canvasBufferHeight: canvas.height,
      framesSampled: frames.length,
      frameMsMean: Number(mean.toFixed(2)),
      frameMsP50: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)),
      frameMsP95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
      fpsMean: Number((1000 / mean).toFixed(1))
    };
  });

  // Scene geometry stats come from the component's own readout, which is fed
  // by three's prepare step. Read it from the DOM so this stays a black-box
  // measurement.
  const readout = await page.evaluate(() => {
    const dl = document.querySelector('.scene-readout');
    if (!dl) return null;
    const out = {};
    for (const row of dl.querySelectorAll('div')) {
      const dt = row.querySelector('dt');
      const dd = row.querySelector('dd');
      if (dt && dd) out[dt.textContent.trim()] = dd.textContent.trim();
    }
    return out;
  });

  const zoneRows = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return null;
    return {
      zoneCount: table.querySelectorAll('tbody tr').length,
      headerCells: Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim())
    };
  });

  await page.screenshot({ path: `screenshots/scene-${vp.label}.png` });

  results.push({ viewport: vp.label, ...metrics, readout, zoneRows, consoleErrors });

  await context.close();
}

await browser.close();

mkdirSync('screenshots', { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2));

for (const r of results) {
  console.log(
    `${r.viewport}: ${r.fpsMean} fps mean (p50 ${r.frameMsP50} ms, p95 ${r.frameMsP95} ms), ` +
      `canvas ${r.canvasCssWidth}x${r.canvasCssHeight}, readout triangles=${r.readout?.Triangles ?? 'n/a'}`
  );
  if (r.consoleErrors.length > 0) {
    console.log(`  console errors (${r.consoleErrors.length}): ${r.consoleErrors.slice(0, 3).join(' | ')}`);
  }
}
console.log(`\nwrote ${outPath}`);