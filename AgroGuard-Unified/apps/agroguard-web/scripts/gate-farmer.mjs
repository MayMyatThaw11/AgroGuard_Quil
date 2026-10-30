import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task26';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const LANG = process.env.LANG_CODE ?? 'en';

await run(async (browser) => {
  const { context, page: p } = await page(browser, { width: W, height: H });
  await p.addInitScript((lang) => {
    try {
      sessionStorage.setItem('aq-fm-view-as', 'farmer');
      localStorage.setItem('agriquill.lang', lang);
    } catch {}
  }, LANG);
  await signIn(p);
  await openFarmMap(p);
  await ready(p, 'today card', '.aq-fm-today');
  await p.waitForTimeout(7000);
  await shot(p, join(GATE, `today-${LANG}-${W}`));
  await context.close();
});
