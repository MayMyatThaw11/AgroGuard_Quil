import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const GATE = process.env.GATE ?? 'task27';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const ready_on = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const api = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-AgriQuill-Write-Token': CODE }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

await run(async (browser) => {
  for (const [i, ask] of [1300, 1450, 1600, 1900, 2100, 2400, 1250].entries()) {
    await api('/listings', { produce: 'tomato', qty_kg: 400 + i * 150, ready_on, town: 'Nyaungshwe', lat: 20.664 + i * 0.002, lon: 96.94, ask_mmk_kg: ask, farmer_name: `Farm ${i + 1}` });
  }
  const { context, page: p } = await page(browser, { width: W, height: H });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('aq-fm-view-as', 'buyer');
    } catch {}
  });
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill('Nyaungshwe');
  await p.waitForTimeout(600);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  await p.keyboard.press('Escape');
  await ready(p, 'supply search', '[data-ui-panel="buyer-shell"] .aq-fm-mk-form');
  await shot(p, join(GATE, `find-${W}`));
  await p.locator('.aq-fm-mk-form button:has-text("Search")').click();
  await ready(p, 'results', '.aq-fm-supply-row');
  await p.locator('.aq-fm-supply-row').first().scrollIntoViewIfNeeded();
  await p.locator('.aq-fm-supply-row input').nth(0).check();
  await p.locator('.aq-fm-supply-row input').nth(1).check();
  await shot(p, join(GATE, `results-${W}`));
  await context.close();
});
