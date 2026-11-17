import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
await page.goto(`http://localhost:5174/?shot=1&${process.argv[2]}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
console.log(JSON.stringify(await page.evaluate((s) => window.__sim(s), Number(process.argv[3] ?? 30)), null, 0));
await browser.close();
