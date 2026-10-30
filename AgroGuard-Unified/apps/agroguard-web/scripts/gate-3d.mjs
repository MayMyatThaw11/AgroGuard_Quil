import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const FARM = process.env.FARM ?? 'AQ-ID-0641';
const GATE = process.env.GATE ?? 'task33';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const THEME = process.env.THEME ?? 'light';

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H, theme: THEME });
  await context.clock.setFixedTime(new Date(process.env.AT ?? '2026-10-30T04:00:00Z'));
  await p.addInitScript(() => {
    try {
      localStorage.setItem('aq-farmview-guide-seen', '1');
    } catch {}
  });
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill(FARM);
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await ready(p, 'farm detail', 'button:has-text("Open 3D view")');
  await p.locator('button:has-text("Open 3D view")').first().click();
  await ready(p, '3d view', '.aq-fm-replica[data-ready="true"]', 120000);
  await p.waitForTimeout(3000);
  if (process.env.WX !== 'now') {
    await p.locator('summary:has-text("Weather")').click();
    await p.locator('.aq-fm-replica [role="radiogroup"] [role="radio"]').nth(1).click();
    await p.locator('summary:has-text("Weather")').click();
    await p.waitForTimeout(2500);
  }
  await shot(p, join(GATE, `${FARM}-${THEME}-${W}`));
  await p.locator('.aq-fm-replica-tools button:has-text("Look from the field")').click();
  await p.waitForTimeout(2500);
  await shot(p, join(GATE, `${FARM}-eye-${THEME}-${W}`));
  await context.close();
});
