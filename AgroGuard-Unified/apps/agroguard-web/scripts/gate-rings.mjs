import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task8';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H });
  await signIn(p);
  await openFarmMap(p);
  const search = p.locator('.aq-fm-search input');
  await search.click();
  await search.fill('Nyaungshwe');
  await p.waitForTimeout(600);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(3500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(2500);
  await shot(p, join(GATE, `rings-${W}`));
  await p.mouse.click(745, 440);
  await p.waitForTimeout(2500);
  await shot(p, join(GATE, `ring-detail-${W}`));
  await context.close();
});
