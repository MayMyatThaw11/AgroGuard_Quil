import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task13';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const api = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'X-AgriQuill-Write-Token': CODE }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};
const day = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
const place = { town: 'Nyaungshwe', lat: 20.664, lon: 96.94 };

async function seed() {
  const order = await api('/preorders', { produce: 'tomato', qty_kg: 1200, needed_by: day, price_offer_mmk_kg: 1900, ...place });
  const base = { lat: 20.4 + Math.random() * 0.4, lon: 96.7 + Math.random() * 0.4 };
  for (const [kg, step] of [[300, 0], [600, 0.005]]) {
    const listing = await api('/listings', { produce: 'tomato', qty_kg: kg, ready_on: day, town: 'Nyaungshwe', lat: base.lat + step, lon: base.lon });
    const offer = await api(`/preorders/${order.id}/offers`, { listing_id: listing.id, qty_kg: kg });
    await api(`/preorders/${order.id}/offers/${offer.id}/select`, {});
  }
}

async function enter(p, viewAs) {
  if (viewAs) await p.addInitScript((v) => { try { sessionStorage.setItem('aq-fm-view-as', v); } catch {} }, viewAs);
  await signIn(p);
  await openFarmMap(p);
}

await run(async (browser) => {
  await seed();
  const farmer = await page(browser, { width: W, height: H });
  await enter(farmer.page);
  const f = farmer.page;
  const search = f.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await f.waitForTimeout(500);
  await f.keyboard.press('Enter');
  await ready(f, 'farm detail', 'button:has-text("Sell this harvest")');
  await f.locator('button:has-text("Sell this harvest")').click();
  await ready(f, 'selected offer', '.aq-fm-mk-offer.is-selected');
  await f.locator('.aq-fm-mk-offer.is-selected button:has-text("Book a pickup")').first().click();
  await ready(f, 'trip plan', '.aq-fm-mk-trip');
  await f.locator('.aq-fm-mk-trip').scrollIntoViewIfNeeded();
  await f.waitForTimeout(600);
  await shot(f, join(GATE, `trip-plan-${W}`));
  await farmer.context.close();

  const buyer = await page(browser, { width: W, height: H });
  await enter(buyer.page, 'buyer');
  const b = buyer.page;
  const find = b.locator('.aq-fm-search input');
  await find.click();
  await find.fill('Nyaungshwe');
  await b.waitForTimeout(600);
  await b.keyboard.press('Enter');
  await b.waitForTimeout(3000);
  await b.keyboard.press('Escape');
  await ready(b, 'buyer board', '[data-ui-panel="buyer"]');
  await b.locator('.aq-fm-mk-order-head', { hasText: 'Tomato' }).first().click();
  await ready(b, 'candidates', '.aq-fm-mk-transport');
  await b.locator('.aq-fm-mk-link').first().click();
  await b.locator('.aq-fm-mk-candidates').first().scrollIntoViewIfNeeded();
  await b.waitForTimeout(500);
  await shot(b, join(GATE, `buyer-transport-${W}`));
  await b.locator('.aq-fm-mk-transport button:has-text("Confirm delivery")').first().click();
  await ready(b, 'delivery form', '.aq-fm-mk-delivery');
  await b.locator('.aq-fm-mk-delivery label').nth(1).locator('input').fill('20');
  await b.locator('.aq-fm-mk-delivery label').nth(2).locator('input').fill('bruised');
  await shot(b, join(GATE, `buyer-delivery-${W}`));
  await b.locator('.aq-fm-mk-delivery button:has-text("Save delivery")').click();
  await ready(b, 'delivered', 'text=Delivered:');
  await shot(b, join(GATE, `buyer-delivered-${W}`));
  await buyer.context.close();
});
