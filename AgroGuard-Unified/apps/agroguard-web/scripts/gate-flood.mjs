import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const FARMS = (process.env.FARMS ?? 'AQ-MM-0001,AQ-MM-0121').split(',');
const RISES = [1, 3];

await run(async (browser) => {
  for (const farm of FARMS) {
    const { context, page: p } = await page(browser, { width: 1440, height: 900 });
    await signIn(p);
    await openFarmMap(p);
    const search = p.locator('.aq-fm-search input');
    await search.click();
    await search.fill(farm);
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    await ready(p, 'farm detail', 'button:has-text("Open 3D view")');
    await p.getByRole('button', { name: /Open 3D view/ }).first().click();
    await ready(p, '3D field', '.aq-fm-replica[data-ready="true"]', 90000);
    await p.locator('.aq-fm-replica-flood > summary').click();
    const wheel = p.getByRole('spinbutton', { name: /water rises by/i });
    await ready(p, 'flood control', '.aq-fm-replica-flood[open]');
    let at = 0;
    for (const rise of RISES) {
      await wheel.focus();
      for (; at < rise * 4; at += 1) await p.keyboard.press('ArrowUp');
      await ready(p, 'flood result', '[data-flood]');
      await p.waitForTimeout(2500);
      const result = await p.locator('[data-flood]').getAttribute('data-flood');
      console.log(`${farm} rise ${rise} m -> ${result}`);
      await shot(p, join('task29', `${farm}-rise-${rise}m`));
    }
    await context.close();
  }
});
