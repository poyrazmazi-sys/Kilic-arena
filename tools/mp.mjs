// Three tabs in one browser talk through the mock room: host, challenger, spectator.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 240, height: 140 } });
const open = async (n) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(n, 'PAGEERR', e.message.slice(0, 300))); await p.goto('http://localhost:5174/?mock=1'); await p.waitForFunction(() => window.__ready === true, null, { timeout: 240000 }); return p; };
const [A, Bp, C] = [await open('A'), await open('B'), await open('C')];
const st = async (p) => p.evaluate(() => window.__state());
await A.evaluate(() => window.__online('abcd', 'f')); await new Promise((r) => setTimeout(r, 1500));
await Bp.evaluate(() => window.__online('abcd', 'f')); await C.evaluate(() => window.__online('abcd', 's'));
await new Promise((r) => setTimeout(r, 6000));
console.log('A', JSON.stringify(await st(A))); console.log('B', JSON.stringify(await st(Bp))); console.log('C', JSON.stringify(await st(C)));
// put them face to face, then B attacks
await A.evaluate(() => window.__me(0, 0.75)); await Bp.evaluate(() => window.__me(0, -0.75));
await new Promise((r) => setTimeout(r, 2500));
for (let i = 0; i < 6; i++) { await Bp.keyboard.press('KeyJ'); await new Promise((r) => setTimeout(r, 1300)); }
await new Promise((r) => setTimeout(r, 3000));
console.log('after B attacks');
console.log('A', JSON.stringify(await st(A))); console.log('B', JSON.stringify(await st(Bp))); console.log('C', JSON.stringify(await st(C)));
// A blocks while B attacks
await A.keyboard.down('KeyL');
for (let i = 0; i < 3; i++) { await Bp.keyboard.press('KeyJ'); await new Promise((r) => setTimeout(r, 1300)); }
await A.keyboard.up('KeyL'); await new Promise((r) => setTimeout(r, 2000));
console.log('after A blocks');
console.log('A', JSON.stringify(await st(A))); console.log('C', JSON.stringify(await st(C)));
await browser.close();
