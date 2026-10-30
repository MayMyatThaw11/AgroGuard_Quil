import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const FARM = process.env.FARM ?? 'AQ-MM-0101';
const GATE = process.env.GATE ?? 'task12';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);

async function wizard(p, name, kind, tag) {
  await p.locator('.aq-fm-pr-choices button', { hasText: kind }).click();
  await p.locator('.aq-fm-pr-field input').first().fill(name);
  await shot(p, join(GATE, `${tag}-step1-${W}`));
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('button:has-text("Use my location")').click();
  await ready(p, 'place saved', '.aq-fm-mk-flash');
  await shot(p, join(GATE, `${tag}-step2-${W}`));
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await p.locator('.aq-fm-pr-crops button', { hasText: 'Tomato' }).click();
  await p.locator('.aq-fm-pr-months button').nth(2).click();
  await p.locator('.aq-fm-pr-months.is-wide button').nth(1).click();
  await shot(p, join(GATE, `${tag}-step3-${W}`));
}

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 16 + Math.random() * 3, longitude: 95 + Math.random() * 2 });
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'farm detail', 'button:has-text("Sell this harvest")');
  await p.locator('button:has-text("Sell this harvest")').click();
  await ready(p, 'market panel', '[data-ui-panel="market"] .aq-fm-pr-chip');
  await p.waitForTimeout(1200);
  await shot(p, join(GATE, `gate-${W}`));
  if (await p.locator('.aq-fm-pr-switch').count()) await p.locator('.aq-fm-pr-switch').click();
  await p.locator('.aq-fm-pr-chip button:has-text("Set up my profile")').first().click();
  await ready(p, 'wizard', '.aq-fm-pr-choices');
  await wizard(p, 'Daw Hla family', 'My family', 'self');
  await p.locator('.aq-fm-pr > .aq-btn-primary').click();
  await ready(p, 'switch chip', '.aq-fm-pr-switch');
  await p.waitForTimeout(800);
  await shot(p, join(GATE, `selling-as-${W}`));
  await p.locator('.aq-fm-pr-switch').click();
  await p.locator('.aq-fm-pr-list button:has-text("Activity")').click();
  await ready(p, 'activity log', '.aq-fm-pr-log li');
  await shot(p, join(GATE, `activity-${W}`));
  await context.close();
});
