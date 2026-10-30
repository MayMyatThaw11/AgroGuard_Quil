import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task5';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const api = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'X-AgriQuill-Write-Token': CODE }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};
const needed = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

async function openMarket(p) {
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'farm detail', 'button:has-text("Sell this harvest")');
  await p.locator('button:has-text("Sell this harvest")').click();
  await ready(p, 'market panel', '[data-ui-panel="market"] .aq-fm-mk-verdict-text');
  await p.waitForTimeout(1500);
}

await run(async (browser) => {
  const order = await api('/preorders', { produce: 'tomato', qty_kg: 1200, needed_by: needed, town: 'Nyaungshwe', lat: 20.664, lon: 96.94, price_offer_mmk_kg: 1900 });
  const { context, page: p } = await page(browser, { width: W, height: H });
  await signIn(p);
  await openFarmMap(p);
  await openMarket(p);
  await shot(p, join(GATE, `outlook-${W}`));
  await p.locator('button:has-text("Save harvest")').click();
  await ready(p, 'saved', '.aq-fm-mk-flash');
  await p.locator('.aq-fm-mk-buyer button:has-text("Offer my harvest")').first().click();
  await ready(p, 'offer sent', '.aq-fm-mk-offer');
  await p.locator('.aq-fm-mk-offer').first().scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `buyers-and-offer-${W}`));
  const mine = await api('/offers/mine');
  const offer = mine.find((o) => o.preorder_id === order.id) ?? mine[0];
  await api(`/preorders/${offer.preorder_id}/offers/${offer.id}/select`, {});
  await p.locator('button[aria-label="Back to the farm"]').click();
  await p.locator('button:has-text("Sell this harvest")').click();
  await ready(p, 'selected offer', '.aq-fm-mk-offer.is-selected');
  await p.locator('.aq-fm-mk-offer.is-selected').first().scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `selected-${W}`));
  await p.locator('.aq-fm-mk-offer.is-selected button:has-text("Book a pickup")').first().click();
  await ready(p, 'pickup', '.aq-fm-mk-steps');
  await p.waitForTimeout(800);
  await shot(p, join(GATE, `pickup-${W}`));
  await p.locator('button:has-text("Back to your offers")').click();
  await p.locator('.aq-fm-mk-offer.is-selected button:has-text("Get directions")').first().click();
  await ready(p, 'directions', 'text=Directions', 60000);
  await p.waitForTimeout(2000);
  await shot(p, join(GATE, `directions-${W}`));
  await context.close();
});
