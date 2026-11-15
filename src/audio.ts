// All sound is synthesised with Web Audio (placeholder until recorded audio is sourced).
let ctx: AudioContext | null = null, master: GainNode, echo: DelayNode, musicGain: GainNode, noiseBuf: AudioBuffer;
let intensity = 0, musicOn = false, nextBeat = 0, beat = 0;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  echo = ctx.createDelay(1); echo.delayTime.value = 0.31;
  const fb = ctx.createGain(); fb.gain.value = 0.32; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.6 + last * 6; }
  // wind bed
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 320; wf.Q.value = 0.4;
  const wg = ctx.createGain(); wg.gain.value = 0.07; wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
  musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
  setInterval(tick, 60);
}
export function setVolume(v: number) { if (ctx) master.gain.value = v; }

function noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', sweepTo?: number, dest?: AudioNode, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(dest ?? master); if (!dest) g.connect(echo);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function thump(f0: number, f1: number, dur: number, gain: number, dest?: AudioNode, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest ?? master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  shot() { noise(0.09, 6000, 0.5, 1.4, 'highpass'); noise(0.9, 2600, 0.7, 1.1, 'lowpass', 180); thump(140, 38, 0.5, 1.2); },
  ak() { noise(0.05, 5000, 0.5, 0.9, 'highpass'); noise(0.22, 2200, 0.8, 0.8, 'lowpass', 300); thump(150, 50, 0.12, 0.7); },
  pickup() { thump(520, 1040, 0.18, 0.25); thump(780, 1560, 0.25, 0.18, undefined, 0.08); },
  capture() { [392, 523, 659, 784].forEach((f, i) => thump(f, f, 0.5, 0.22, undefined, i * 0.12)); },
  enemyShot(dist: number) { const g = Math.max(0.08, 1 - dist / 70); noise(0.6, 1800, 0.7, 0.7 * g, 'lowpass', 160); thump(110, 40, 0.35, 0.6 * g); },
  bombard() { noise(2.6, 900, 0.6, 1.2, 'lowpass', 60); thump(70, 22, 2.2, 1.5); noise(1.8, 400, 0.5, 0.7, 'lowpass', 50, undefined, 0.5); },
  click() { noise(0.04, 3500, 3, 0.25, 'bandpass'); },
  ram() { noise(0.12, 900, 2, 0.22, 'bandpass', 300); },
  swing() { noise(0.28, 500, 1.5, 0.35, 'bandpass', 2600); },
  clang() { if (!ctx) return; [1900, 2870, 4100].forEach((f) => thump(f, f * 0.98, 0.35, 0.12)); noise(0.05, 5000, 1, 0.3, 'highpass'); },
  hit() { noise(0.12, 500, 1, 0.5, 'lowpass', 120); thump(160, 60, 0.12, 0.4); },
  hurt() { thump(220, 70, 0.25, 0.5); noise(0.15, 700, 1, 0.3, 'lowpass'); },
  twang() { thump(520, 180, 0.12, 0.2); },
  whiz() { noise(0.18, 3000, 6, 0.2, 'bandpass', 900); },
  step() { noise(0.07, 260, 1, 0.1, 'lowpass'); },
};
export function setMusic(on: boolean, level: number) { musicOn = on; intensity = level; if (ctx) musicGain.gain.setTargetAtTime(on ? 0.5 + level * 0.12 : 0, ctx.currentTime, 1.5); }

// Davul (bass drum) pattern in the manner of a mehter march, faster and denser with each wave.
const PATTERN = [1, 0, 0, 2, 1, 0, 2, 0, 1, 0, 2, 2, 1, 0, 2, 0];
function tick() {
  if (!ctx || !musicOn) return;
  const step = 60 / (86 + intensity * 12) / 2;
  while (nextBeat < ctx.currentTime + 0.2) {
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    const w = nextBeat - ctx.currentTime, p = PATTERN[beat % 16];
    if (p === 1) { thump(95, 42, 0.5, 0.9, musicGain, w); noise(0.1, 300, 1, 0.3, 'lowpass', undefined, musicGain, w); }
    if (p === 2 && (intensity >= 1 || beat % 4 === 3)) noise(0.06, 2400, 4, 0.22, 'bandpass', undefined, musicGain, w);
    if (intensity >= 2 && beat % 16 === 0) { thump(55, 30, 1.4, 0.7, musicGain, w); }
    if (beat % 32 === 0 && ctx) { // low drone
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = intensity >= 3 ? 73.4 : 65.4; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      const g = ctx.createGain(); const t = nextBeat; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 2); g.gain.linearRampToValueAtTime(0, t + step * 32);
      o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + step * 32 + 0.1);
    }
    nextBeat += step; beat++;
  }
}
