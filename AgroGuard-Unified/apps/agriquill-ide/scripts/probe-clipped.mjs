import { chromium } from 'playwright-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173/';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
for (const vp of [{ w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1280, h: 720 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const clipped = await page.evaluate(() => {
    const de = document.documentElement;
    return Array.from(document.querySelectorAll('button'))
      .map(b => ({ text: (b.textContent || '').trim().slice(0, 40), cls: String(b.className).slice(0, 50), r: b.getBoundingClientRect() }))
      .filter(b => b.r.width > 60 && b.r.height > 20 && b.r.top >= 0 && b.r.left >= 0)
      .filter(b => b.r.right > de.clientWidth || b.r.bottom > de.clientHeight)
      .map(b => ({ text: b.text, cls: b.cls, right: Math.round(b.r.right), bottom: Math.round(b.r.bottom), vw: de.clientWidth, vh: de.clientHeight }));
  });
  console.log(vp.w + 'x' + vp.h, JSON.stringify(clipped, null, 1));
  await page.close();
}
await browser.close();
