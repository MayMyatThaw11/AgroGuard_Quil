import { openFarmMap, page, ready, run, signIn } from './shots-lib.mjs';

const ROLES = (process.env.ROLES ?? 'farmer,buyer,dev').split(',');
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');

const measure = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const background = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    return stack.reverse().reduce((under, c) => over(c, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const bad = [];
  let checked = 0;
  const root = document.querySelector('.aq-fm-right') ?? document.body;
  root.querySelectorAll('*').forEach((el) => {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = background(el);
    const text = over(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const r = ratio(text, bg);
    checked += 1;
    if (r < need) bad.push({ text: own.slice(0, 40), ratio: Math.round(r * 100) / 100, need, size });
  });
  return { checked, bad };
};

await run(async (browser) => {
  for (const role of ROLES) for (const theme of THEMES) {
    const { context, page: p } = await page(browser, { width: 1440, height: 900, theme });
    await p.addInitScript((r) => {
      try {
        if (r !== 'dev') sessionStorage.setItem('aq-fm-view-as', r);
      } catch {}
    }, role);
    await signIn(p);
    await openFarmMap(p);
    if (role === 'buyer') {
      await ready(p, 'buyer', '[data-ui-panel="buyer-shell"] .aq-fm-mk-form').catch(() => undefined);
    } else if (role === 'farmer') {
      await ready(p, 'today', '.aq-fm-today').catch(() => undefined);
    } else {
      const search = p.locator('.aq-fm-search input');
      await search.click();
      await search.fill('AQ-MM-0101');
      await p.waitForTimeout(500);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      await p.locator('.aq-fm-selbar button').first().click().catch(() => undefined);
    }
    await p.waitForTimeout(3500);
    const result = await p.evaluate(measure);
    console.log(`${role} ${theme}: checked ${result.checked}, failing ${result.bad.length}`);
    result.bad.slice(0, 12).forEach((b) => console.log(`   ${b.ratio} < ${b.need} (${b.size}px) "${b.text}"`));
    await context.close();
  }
});
