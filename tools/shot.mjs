// Usage: node tools/shot.mjs name "look=1&pos=-5.5,10.1,0&yaw=90&pitch=-3" [more name query pairs]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? 'playwright');
const args = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
for (let i = 0; i < args.length; i += 2) {
  await page.goto(`http://localhost:5173/?shot=1&q=${process.env.Q ?? 2}&${args[i + 1]}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
  await page.screenshot({ timeout: 300000, path: `shots/${args[i]}.jpg`, quality: 88 });
  console.log('shot', args[i], await page.evaluate(() => document.getElementById('stats').textContent));
}
await browser.close();
