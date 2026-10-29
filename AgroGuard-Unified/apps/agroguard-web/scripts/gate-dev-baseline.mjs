import { join } from 'node:path';
import { OUT, openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const FARM = process.env.FARM ?? 'AQ-PH-0921';
const dir = (name) => join(process.env.GATE ?? 'baseline', name);

await run(async (browser) => {
  for (const theme of ['light', 'dark']) {
    const { context, page: p } = await page(browser, { theme });
    await signIn(p);
    await ready(p, 'fleet monitor', '[aria-label="Farm map"]');
    await shot(p, dir(`fleet-1440-${theme}`));
    await openFarmMap(p);
    await shot(p, dir(`map-1440-${theme}`));
    const search = p.locator('.aq-fm-search input');
    await search.click();
    await search.fill(FARM);
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    await ready(p, 'farm detail', 'button:has-text("Open 3D view")');
    await p.waitForTimeout(2500);
    await shot(p, dir(`farm-detail-1440-${theme}`));
    await p.getByRole('button', { name: /Open 3D view/ }).first().click();
    await ready(p, '3D field', '.aq-fm-replica[data-ready="true"]', 90000);
    await p.waitForTimeout(2500);
    await shot(p, dir(`field-3d-1440-${theme}`));
    await context.close();
  }
  console.log(`saved under ${OUT}`);
});
