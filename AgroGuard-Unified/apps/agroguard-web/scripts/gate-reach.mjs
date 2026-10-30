import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task32';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const api = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'X-AgriQuill-Write-Token': CODE }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};
const ready_on = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

await run(async (browser) => {
  await api('/listings', { produce: 'potato', qty_kg: 6000, ready_on, town: 'Nyaungshwe', lat: 20.664, lon: 96.94 });
  await api('/season-orders', { produce: 'potato', total_kg: 6000, delivery_months: [new Date().getMonth() + 1], town: 'Mandalay', lat: 21.97, lon: 96.08, price: { kind: 'fixed', mmk_kg: 900 }, grade: 'any', offers: ['provides-pickup'], needs: [] });
  const { context, page: p } = await page(browser, { width: W, height: H });
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'farm detail', 'button:has-text("Sell this harvest")');
  await p.locator('button:has-text("Sell this harvest")').click();
  await ready(p, 'market panel', '[data-ui-panel="market"] .aq-fm-mk-verdict-text');
  await p.locator('.aq-fm-mk-form select').selectOption('potato');
  await ready(p, 'reach advice', '.aq-fm-mk-advice-row, .aq-fm-mk-advice');
  await p.waitForTimeout(1200);
  await shot(p, join(GATE, `outlook-${W}`));
  await context.close();
});
