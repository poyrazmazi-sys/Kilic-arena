import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5174/?shot=1&start=bot&lv=0&cam=4.5,1.8,0.2,0,1.6,0.2');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
await page.evaluate(() => { window.__sim(2.2); window.__place(2.2, -1.9); window.__sim(0.1); window.__press('leap'); });
for (const [t, name] of [[0.28, 'leap_a'], [0.34, 'leap_b'], [0.22, 'leap_c'], [0.3, 'leap_d']]) {
  console.log(name, JSON.stringify(await page.evaluate((s) => { const r = window.__sim(s); return { hp: r.hp, act: r.act }; }, t)));
  await page.screenshot({ path: `shots/${name}.jpg`, quality: 85, timeout: 300000 });
}
console.log('after', JSON.stringify(await page.evaluate(() => window.__sim(1.5))));
await browser.close();
