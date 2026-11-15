import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 400)));
const run = async (label, query, steps) => {
  await page.goto(`http://localhost:5173/?shot=1&q=0&play=1&${query}`);
  await page.waitForFunction(() => typeof window.__sim === 'function' && window.__ready === true, null, { timeout: 240000 });
  for (const [secs, fire] of steps) console.log(label, secs, JSON.stringify(await page.evaluate(([s, f]) => window.__sim(s, f), [secs, fire])));
};
await run('idle-tower', 'pos=-5.5,10.1,0&yaw=90', [[20, 0]]);
await run('ground', 'pos=-12,1.3,-30&yaw=0&pitch=0', [[14, 0.3], [20, 0.3]]);
await run('camp', 'pos=-80,0.1,-30&yaw=0&pitch=0', [[14, 0.3]]);
await browser.close();
