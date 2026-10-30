import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task16';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'X-AgriQuill-Write-Token': CODE }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};
const month = ((new Date().getMonth() + 3) % 12) + 1;

await run(async (browser) => {
  const lat = 20.66 + Math.random() * 0.01;
  const mine = await api('/producers/mine');
  const producer = mine[0] ?? (await api('/producers', { kind: 'household', name: 'Daw Hla family', lat, lon: 96.93, township: 'Nyaungshwe', crops: [{ produce: 'tomato', area_ha: 0.6, harvest_month: month }], wants: ['cash-at-harvest', 'pickup-needed'], can_offer: ['weekly-delivery'] }));
  await api('/season-orders', { produce: 'tomato', total_kg: 8000, delivery_months: [month], town: 'Taunggyi', lat: 20.78, lon: 97.03, price: { kind: 'fixed', mmk_kg: 1900 }, grade: 'any', offers: ['pays-within-3d', 'provides-pickup'], needs: ['weekly-supply'] });

  const { context, page: p } = await page(browser, { width: W, height: H });
  await p.addInitScript((id) => {
    try {
      localStorage.setItem('agriquill.farmMap.producer', id);
    } catch {}
  }, producer.id);
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'farm detail', 'button:has-text("Sell this harvest")');
  await p.locator('button:has-text("Sell this harvest")').click();
  await ready(p, 'season section', '.aq-fm-ss-card');
  await p.locator('.aq-fm-ss-card').first().scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `farmer-${W}`));
  await p.locator('.aq-fm-ss-reserve button').first().click();
  await ready(p, 'reserved', '.aq-fm-mk-flash');
  await shot(p, join(GATE, `farmer-reserved-${W}`));
  await context.close();

  const buyer = await page(browser, { width: W, height: H });
  await buyer.page.addInitScript(() => {
    try {
      sessionStorage.setItem('aq-fm-view-as', 'buyer');
    } catch {}
  });
  await signIn(buyer.page);
  await openFarmMap(buyer.page);
  const field = buyer.page.locator('.aq-fm-search input');
  await field.click();
  await field.fill('Nyaungshwe');
  await buyer.page.waitForTimeout(600);
  await buyer.page.keyboard.press('Enter');
  await buyer.page.waitForTimeout(3000);
  await buyer.page.keyboard.press('Escape');
  await ready(buyer.page, 'buyer season orders', '.aq-fm-ss-progress');
  await buyer.page.locator('.aq-fm-ss-progress').first().scrollIntoViewIfNeeded();
  await shot(buyer.page, join(GATE, `buyer-${W}`));
  await buyer.context.close();
  console.log(producer.id);
});
