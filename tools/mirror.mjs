import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 160, height: 90 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5174/?shot=1');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate(() => window.__mirrorFight(40))));
await browser.close();
