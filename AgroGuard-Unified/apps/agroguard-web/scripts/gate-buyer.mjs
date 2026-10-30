import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task6';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);

await run(async (browser) => {
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
  await ready(p, 'buyer board', '[data-ui-panel="buyer"]');
  await p.waitForTimeout(1500);
  await shot(p, join(GATE, `board-${W}`));
  await p.locator('button:has-text("Post what I need")').click();
  await ready(p, 'order form', '.aq-fm-mk-form');
  await shot(p, join(GATE, `form-${W}`));
  await p.locator('.aq-fm-mk-order-head').first().click();
  await ready(p, 'candidates', '.aq-fm-mk-candidates, .aq-fm-mk-offer .aq-fm-mk-quiet');
  await p.waitForTimeout(800);
  await p.locator('.aq-fm-mk-order-head').first().scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `orders-${W}`));
  await context.close();
});
