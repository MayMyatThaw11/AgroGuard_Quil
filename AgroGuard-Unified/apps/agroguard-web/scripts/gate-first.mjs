import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const API = process.env.MARKET_API ?? 'http://127.0.0.1:8010/api/v1/agriquill/market';
const CODE = process.env.FARMSIM_CODE;
const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task14';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);

await run(async (browser) => {
  const res = await fetch(`${API}/producers/mine`, { headers: { 'X-AgriQuill-Write-Token': CODE } });
  const producer = (await res.json())[0];
  const { context, page: p } = await page(browser, { width: W, height: H });
  await p.addInitScript((id) => {
    try {
      localStorage.setItem('agriquill.farmMap.producer', id);
    } catch {}
  }, producer.id);
  await signIn(p);
  await openFarmMap(p);
  await ready(p, 'market strip', '.aq-fm-mk-subhead');
  await p.waitForTimeout(1500);
  await shot(p, join(GATE, `overview-strip-${W}`));
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'selection bar', '.aq-fm-selbar button:has-text("Sell this harvest")');
  await p.waitForTimeout(800);
  await shot(p, join(GATE, `selection-bar-${W}`));
  await p.locator('.aq-fm-selbar button:has-text("Sell this harvest")').click();
  await ready(p, 'cue', '.aq-fm-mk-cue');
  await shot(p, join(GATE, `cue-${W}`));
  await context.close();
});
