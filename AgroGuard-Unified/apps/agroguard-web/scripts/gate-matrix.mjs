import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'task9';
const ROLES = (process.env.ROLES ?? 'farmer,buyer,dev').split(',');
const SIZES = (process.env.SIZES ?? '375x760,1440x900').split(',').map((s) => s.split('x').map(Number));
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');
const LANGS = (process.env.LANGS ?? 'en,my').split(',');

async function capture(browser, role, [W, H], theme, lang) {
  const { context, page: p } = await page(browser, { width: W, height: H, theme, lang });
  await p.addInitScript((r) => {
    try {
      if (r !== 'dev') sessionStorage.setItem('aq-fm-view-as', r);
    } catch {}
  }, role);
  await signIn(p);
  await openFarmMap(p);
  if (role === 'farmer') {
    await ready(p, 'today', '.aq-fm-today');
    await p.waitForTimeout(3500);
  } else if (role === 'buyer') {
    const search = p.locator('.aq-fm-search input');
    if (await search.isVisible().catch(() => false)) {
      await search.click();
      await search.fill('Nyaungshwe');
      await p.waitForTimeout(500);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2500);
      await p.keyboard.press('Escape');
    }
    await ready(p, 'buyer shell', '[data-ui-panel="buyer-shell"] .aq-fm-mk-form');
    await p.waitForTimeout(1500);
  } else {
    const search = p.locator('.aq-fm-search input');
    await search.click();
    await search.fill('AQ-MM-0101');
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    await ready(p, 'selection bar', '.aq-fm-selbar button:has-text("Sell this harvest"), .aq-fm-selbar button');
    await p.locator('.aq-fm-selbar button').first().click().catch(() => undefined);
    await p.waitForTimeout(3500);
  }
  await shot(p, join(GATE, `${role}-${W}-${theme}-${lang}`));
  await context.close();
}

await run(async (browser) => {
  for (const role of ROLES) for (const size of SIZES) for (const theme of THEMES) for (const lang of LANGS) {
    try {
      await capture(browser, role, size, theme, lang);
    } catch (e) {
      console.log(`SKIP ${role} ${size.join('x')} ${theme} ${lang}: ${String(e.message ?? e).slice(0, 120)}`);
    }
  }
});
