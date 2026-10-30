import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task12';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 16 + Math.random() * 3, longitude: 95 + Math.random() * 2 });
  await p.addInitScript(() => {
    try {
      sessionStorage.setItem('aq-fm-view-as', 'buyer');
    } catch {}
  });
  await p.route('**/market/producers/plan', (route) => route.fulfill({ json: { ha_used: 62, ha_limit: 100 } }));
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill('Nyaungshwe');
  await p.waitForTimeout(600);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  await p.keyboard.press('Escape');
  await ready(p, 'my farmers', '.aq-fm-pr-coop');
  await p.locator('.aq-fm-pr-coop').scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `coop-list-${W}`));
  await p.locator('.aq-fm-pr-coop button:has-text("Register a farmer")').click();
  await ready(p, 'wizard', '.aq-fm-pr-choices');
  await p.locator('.aq-fm-pr-choices button', { hasText: 'Our group' }).click();
  await p.locator('.aq-fm-pr-field input').first().fill(`Hlaing group ${Date.now() % 10000}`);
  await p.locator('input[aria-label="Member name"]').fill('Ma Hla');
  await p.locator('.aq-fm-pr-inline .aq-btn').click();
  await shot(p, join(GATE, `coop-step1-${W}`));
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('button:has-text("Use my location")').click();
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('.aq-fm-pr-crops button', { hasText: 'onions' }).click();
  await p.locator('.aq-fm-pr-months button').nth(3).click();
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await ready(p, 'consent', '.aq-fm-pr-consent');
  await p.locator('.aq-fm-pr-check input').check();
  await shot(p, join(GATE, `coop-consent-${W}`));
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await ready(p, 'claim card', '.aq-fm-pr-card-code');
  await p.locator('.aq-fm-pr-card').scrollIntoViewIfNeeded();
  await shot(p, join(GATE, `coop-card-${W}`));
  await p.locator('.aq-fm-pr-card button:has-text("Register the next farmer")').click();
  await p.locator('.aq-fm-pr-choices button', { hasText: 'My family' }).click();
  await p.locator('.aq-fm-pr-field input').first().fill('Daw Mya family');
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('button:has-text("Use my location")').click();
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('.aq-fm-pr-crops button', { hasText: 'onions' }).click();
  await p.locator('.aq-fm-pr-months button').nth(3).click();
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('.aq-fm-pr-check input').check();
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await ready(p, 'nearby profile', '.aq-fm-pr-nearby');
  await shot(p, join(GATE, `coop-nearby-${W}`));
  await context.close();
});
