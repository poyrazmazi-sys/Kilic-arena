// Runs the arena fight simulator: node tools/simulate.mjs ROUNDS LEVEL_A LEVEL_B
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? 'playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 160, height: 90 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5174}/?shot=1` + (process.env.SWAPLOOKS ? '&swaplooks=1' : '') + (process.env.SAMELOOKS ? '&samelooks=1' : ''));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
if (process.env.REV) await page.evaluate(() => { window.__rev = true; });
if (process.env.SWAPBOTS) await page.evaluate(() => { window.__swapBots = true; });
const [r, a, b, sw] = process.argv.slice(2).map(Number);
const res = await page.evaluate(([r, a, b, sw]) => window.__simulate(r, a, b, !!sw), [r || 20, a ?? 1, b ?? 1, sw]);
const pct = (x, y) => (y ? Math.round((100 * (x ?? 0)) / y) + '%' : '-');
for (const k of ['light', 'heavy', 'leap']) {
  const thrown = res[`${k}_thrown`] ?? 0;
  if (thrown) console.log(`${k.padEnd(5)} thrown ${String(thrown).padStart(4)} | hit ${pct(res[k + '_h'], thrown)} blocked ${pct(res[k + '_b'], thrown)} parried ${pct(res[k + '_p'], thrown)} guard-broken ${pct(res[k + '_g'], thrown)} dodged ${pct(res[k + '_e'], thrown)} missed ${pct(res[k + '_miss'], thrown)}`);
}
for (const k of [0, 1]) console.log(`side ${k}: during its swings the blade is on average ${(res['reach' + k + '_sum'] / res['reach' + k + '_n']).toFixed(2)} m from the opponent's chest, standing ${(res['range' + k + '_sum'] / res['reach' + k + '_n']).toFixed(2)} m apart, body facing off by ${(res['face' + k + '_sum'] / res['reach' + k + '_n']).toFixed(0)} deg, hips off by ${(res['hipface' + k + '_sum'] / res['reach' + k + '_n']).toFixed(0)} deg`);
console.log('by attacker side', JSON.stringify(Object.fromEntries(Object.entries(res).filter(([k]) => k.startsWith('side')))));
console.log(`rounds ${res.rounds}, average ${res.avgRoundSec}s, wins A/B ${res.winsA ?? 0}/${res.winsB ?? 0}, both fell together ${res.draws ?? 0}, dodges ${res.dodges ?? 0}, body overlap in ${res.overlapFramesPct}% of frames`);
await browser.close();
