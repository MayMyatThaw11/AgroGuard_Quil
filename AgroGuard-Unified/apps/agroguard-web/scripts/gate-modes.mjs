import { join } from 'node:path';
import { openFarmMap, page, ready, run, shot, signIn } from './shots-lib.mjs';

const GATE = process.env.GATE ?? 'modes';
const MODES = (process.env.MODES ?? 'dev,farmer,buyer').split(',');
const SIZES = (process.env.SIZES ?? '1440x900,375x812').split(',').map((s) => s.split('x').map(Number));
const THEMES = (process.env.THEMES ?? 'light').split(',');
const LANGS = (process.env.LANGS ?? 'en').split(',');

await run(async (browser) => {
  for (const [width, height] of SIZES) {
    for (const theme of THEMES) {
      for (const lang of LANGS) {
        for (const mode of MODES) {
          const { context, page: p } = await page(browser, { width, height, theme, lang });
          await p.addInitScript((m) => {
            try {
              if (m === 'dev') sessionStorage.removeItem('aq-fm-view-as');
              else sessionStorage.setItem('aq-fm-view-as', m);
            } catch {}
          }, mode);
          await signIn(p);
          await openFarmMap(p);
          if (mode !== 'dev') await ready(p, `${mode} mode`, `[data-ui-mode="${mode}"], .aq-fm-viewas-banner`);
          await shot(p, join(GATE, `${mode}-${width}-${theme}-${lang}`));
          await context.close();
        }
      }
    }
  }
});
