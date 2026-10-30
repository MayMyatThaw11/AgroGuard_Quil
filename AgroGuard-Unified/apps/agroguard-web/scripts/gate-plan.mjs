import { join } from 'node:path';
import { page, ready, run, shot } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task24';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const APP = process.env.APP_URL ?? 'http://localhost:5173/farm-simulation';

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H });
  await p.addInitScript(() => {
    try {
      localStorage.setItem('agroguard_token', 'demo-token');
      localStorage.setItem('agroguard_account', JSON.stringify({ account_type: 'buyer', buyer_kind: 'cooperative' }));
    } catch {}
  });
  await p.route('**/me/entitlements', (route) =>
    route.fulfill({ json: { plan: 'free', status: 'active', farms_used: 0, farms_limit: 3, farms_left: 3, current_period_end: null, ha_limit: null } }),
  );
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await ready(p, 'co-op plan button', 'button:has-text("Co-op plan")');
  await p.locator('button:has-text("Co-op plan")').click();
  await ready(p, 'plan card', 'text=$349 for a 6-month season');
  await shot(p, join(GATE, `plan-card-${W}`));
  await context.close();
});
