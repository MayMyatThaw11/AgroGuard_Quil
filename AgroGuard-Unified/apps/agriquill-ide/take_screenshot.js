import { chromium } from 'playwright-core';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage({
    viewport: { width: 1560, height: 960 }
  });

  console.log('Navigating to http://127.0.0.1:3123/ ...');
  await page.goto('http://127.0.0.1:3123/', { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForTimeout(4000);

  const outputPath = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\fddcbecc-da2b-4c30-84a2-79a035b02c43\\agriqill_3d_screenshot.png';
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log('Screenshot saved successfully to:', outputPath);

  await browser.close();
}

main().catch(err => {
  console.error('Error taking screenshot:', err);
  process.exit(1);
});

