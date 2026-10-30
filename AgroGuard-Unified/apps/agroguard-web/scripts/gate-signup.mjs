import { join } from 'node:path';
import { page, ready, run, shot } from './shots-lib.mjs';

const ROOT = (process.env.BASE_URL ?? 'http://localhost:5173/farmsim/').replace(/farmsim\/?$/, '');

await run(async (browser) => {
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    const { context, page: p } = await page(browser, { width, height });
    await p.goto(ROOT, { waitUntil: 'domcontentloaded' });
    const opener = '#open-agroguard';
    await ready(p, 'landing', opener);
    await p.locator(opener).first().click();
    await ready(p, 'auth dialog', '[role="dialog"]');
    await p.locator('[role="dialog"] button:has-text("Sign up")').first().click();
    await ready(p, 'sign-up choice', '[role="radiogroup"]');
    await shot(p, join('task4', `signup-farmer-${width}`));
    await p.locator('[role="radio"]:has-text("Buy from farms")').click();
    await ready(p, 'buyer kind', 'select');
    await shot(p, join('task4', `signup-buyer-${width}`));
    await context.close();
  }
});
