import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, VignetteEffect, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { loadSky } from '../src/looks';
import { initAudio, crowd, sfx2, setVolume } from '../src/audio';
import { buildArena, RING } from './arena';
import { Fighter, loadFighterAssets, T, COST, DMG, ZONE, ACTS, Zone, FIGHTERS, CAST } from './fighter';
import { Input } from './input';
import { Bot } from './bot';
import { Fx } from './fx';
import { connectRoom, Room, NamedRoom, Peer } from './net';

const q = new URLSearchParams(location.search);
const shot = q.has('shot');
const mobile = /iPad|iPhone|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
const $ = (id: string) => document.getElementById(id)!;
const store = { get: (k: string) => { try { return localStorage.getItem('kilic.' + k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem('kilic.' + k, v); } catch { /* storage blocked */ } } };
const lerp = THREE.MathUtils.lerp;

type Mode = 'menu' | 'bot' | 'duel' | 'watch';
type Code = 'e' | 'p' | 'b' | 'g' | 'h';

async function main() {
  // ---------- renderer, scene, light
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, preserveDrawingBuffer: shot });
  const basePR = mobile ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(basePR); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.NoToneMapping;
  $('view').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xd8a878, 0.0045);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 1500);
  const sky = await loadSky('belfast_sunset_puresky');
  scene.background = sky.tex; scene.environment = sky.tex; scene.backgroundIntensity = 0.6; scene.environmentIntensity = 1.25;
  const az = 0.6, el = THREE.MathUtils.degToRad(17), sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  scene.backgroundRotation.set(0, sky.sunAzimuth - Math.atan2(sunDir.z, sunDir.x), 0); scene.environmentRotation.copy(scene.backgroundRotation);
  const sun = new THREE.DirectionalLight(0xffc088, 4.2); sun.position.copy(sunDir).multiplyScalar(60); sun.castShadow = true;
  const S = mobile ? 2048 : 4096; sun.shadow.mapSize.set(S, S); Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; scene.add(sun, new THREE.HemisphereLight(0xc8d0e8, 0x8a6a48, 0.5));
  (scene.fog as THREE.FogExp2).color.copy(sky.horizon).lerp(new THREE.Color(0xe0a870), 0.6);

  const arena = buildArena(scene, renderer.capabilities.getMaxAnisotropy(), mobile);
  $('status').textContent = 'Preparing the fighters...';
  await loadFighterAssets();
  const fx = new Fx(scene);
  const fighters: [Fighter, Fighter] = q.has('samelooks') ? (() => { const a = new Fighter(0), b = new Fighter(0); b.side = 1; return [a, b] as [Fighter, Fighter]; })() : q.has('swaplooks') ? (() => { const a = new Fighter(1), b = new Fighter(0); a.side = 0; b.side = 1; return [a, b] as [Fighter, Fighter]; })() : [new Fighter(0), new Fighter(1)];
  fighters.forEach((f) => scene.add(f.root));
  const spawn = (f: Fighter) => f.reset(0, 0, f.side === 0 ? 3.4 : -3.4) as unknown as void;
  fighters.forEach((f) => { f.reset(0, f.side === 0 ? 3.4 : -3.4, f.side === 0 ? 0 : Math.PI); });

  // ---------- post-processing
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  if (!mobile) { const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight); ao.configuration.aoRadius = 1.2; ao.configuration.intensity = 1.6; ao.configuration.halfRes = true; ao.setQualityMode('Medium'); composer.addPass(ao); }
  const bloom = new BloomEffect({ intensity: 0.7, luminanceThreshold: 1.1, mipmapBlur: true, radius: 0.7 });
  composer.addPass(new EffectPass(camera, bloom));
  composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }), new HueSaturationEffect({ saturation: 0.08 }), new BrightnessContrastEffect({ contrast: 0.08 }), new VignetteEffect({ darkness: 0.45, offset: 0.3 }), new SMAAEffect()));

  // ---------- input and touch controls
  const input = new Input(renderer.domElement);
  if (mobile) { $('touch').style.display = 'block'; input.bindTouch($('stick'), $('knob'), { light: $('bLight'), heavy: $('bHeavy'), block: $('bBlock'), dodge: $('bDodge'), cam: $('bCam'), view: $('bView'), leap: $('bLeap') }); }

  // ---------- game state
  let mode: Mode = 'menu', me: Fighter | null = null, opp: Fighter | null = null, bot: Bot | null = null, bot2: Bot | null = null;
  let round = 1, overT = -1, matchOver = false, excite = 0.15, bannerT = 0, popT = 0, time = 0;
  let room: Room | null = null, duel: NamedRoom | null = null, code = '', role: 'f' | 's' = 'f', joinT = 0;
  let claimSeq = 0; const claims: unknown[][] = [], results: [number, Code][] = [];
  const seen = new Map<string, { claim: number; res: number; synced: boolean }>();
  let mySide: 0 | 1 = 0, oppPeer = '', watchers = 0, watchPair: [Peer | null, Peer | null] = [null, null];

  const banner = (a: string, b = '', dur = 2.2) => { $('bannerA').textContent = a; $('bannerB').textContent = b; $('banner').style.opacity = '1'; bannerT = dur; };
  const pop = (s: string) => { $('pop').textContent = s; $('pop').style.opacity = '1'; $('pop').style.transform = 'translate(-50%,0) scale(1.08)'; popT = 0.9; };

  // ---------- combat resolution: the defender decides what happened to them
  function resolve(def: Fighter, att: Fighter, k: 'l' | 'h' | 'x', zone: Zone, bi: number, p: [number, number, number], ang: number): Code {
    if (!def.alive) return 'e';
    if (def.act === 'dodge' && def.actT < T.iframes) return 'e';
    const away = def.root.position.clone().sub(att.root.position);
    const toAtt = att.root.position.clone().sub(def.root.position).setY(0).normalize();
    const facing = def.forward.dot(toAtt) > -0.05;
    if (def.act === 'block' && facing && k !== 'x') {
      if (def.actT < T.parry) { def.shove(away, 0.6); return 'p'; }
      if (k === 'h') { def.start('hit', T.guardBreak); def.shove(away, 3.6); return 'g'; }
      def.st -= COST.blockHit; if (def.st <= 0) { def.st = 0; def.start('hit', T.guardBreak); def.shove(away, 3); return 'g'; }
      def.shove(away, 1.4); return 'b';
    }
    const dmg = k === 'x' ? (zone === 'torso' || zone === 'head' ? 999 : 45) : Math.round((k === 'h' ? DMG.heavy : DMG.light) * ZONE[zone] * (def.act === 'stun' ? 1.25 : 1));
    def.hp = Math.max(0, def.hp - dmg);
    def.addWound({ b: bi, p, a: ang, s: (k === 'x' ? 0.34 : k === 'h' ? 0.26 : 0.15) * (zone === 'head' ? 0.7 : 1) });
    const airborne = def.act === 'leap' && def.actT > T.leapAir[0] && def.actT < T.leapAir[1];
    if (def.hp <= 0) { def.start('dead'); def.shove(away, k === 'x' ? 6 : k === 'h' ? 4.5 : 3); } else if (!airborne) { def.start('hit', k === 'h' ? T.hitHeavy : T.hitLight); def.shove(away, k === 'h' ? 3.8 : 1.9); }
    return 'h';
  }
  /** Effects and the attacker's reaction, shown the same way on every screen. */
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => { stats[k] = (stats[k] ?? 0) + n; };
  function outcome(def: Fighter, att: Fighter, code: Code, heavy: boolean, attackerIsLocal: boolean, kind?: 'l' | 'h' | 'x') {
    const finisher = kind ? kind === 'x' : att.act === 'leap';
    bump(`${finisher ? 'leap' : heavy ? 'heavy' : 'light'}_${code}`); bump(`side${att.side}_${code}`);
    if (finisher && code === 'h') { pop('Finisher!'); excite = 1; sfx2.cheer(); sfx2.gong(); shake = 1; }
    hitStop = finisher && code === 'h' ? 0.35 : code === 'h' ? (heavy ? 0.11 : 0.06) : code === 'p' ? 0.12 : code === 'b' || code === 'g' ? 0.05 : 0;
    const back = att.root.position.clone().sub(def.root.position);
    if (attackerIsLocal) { if (code === 'p') att.shove(back, 3.2); else if (code === 'b') att.shove(back, 1.6); else if (code === 'h') att.vel.multiplyScalar(0.2); }
    const mid = def.chest().lerp(att.chest(), 0.4);
    if (code === 'h') {
      const w = def.wounds[def.wounds.length - 1]; const p = w ? def.woundWorld(w) : def.chest();
      fx.blood(p, def.root.position.clone().sub(att.root.position).setY(0.3).normalize(), finisher ? 140 : heavy ? 70 : 34); sfx2.flesh(heavy);
      excite = Math.min(1, excite + (heavy ? 0.6 : 0.35)); if (heavy) sfx2.cheer();
      if (!def.alive) { excite = 1; sfx2.cheer(); sfx2.gong(); }
      if (def === me) shake = heavy ? 0.6 : 0.3;
    } else if (code === 'b') { fx.sparks(att.tipW.clone().lerp(mid, 0.5), 18); sfx2.clang(false); if (attackerIsLocal) att.start('recoil', T.recoil); pop(def === me ? 'Blocked' : att === me ? 'Blocked' : ''); }
    else if (code === 'p') { fx.sparks(att.tipW.clone().lerp(mid, 0.5), 50); sfx2.clang(true); excite = Math.min(1, excite + 0.5); if (attackerIsLocal) att.start('stun', T.stun); pop('Parried!'); sfx2.cheer(); }
    else if (code === 'g') { fx.sparks(mid, 30); sfx2.clang(true); pop('Guard broken'); excite = Math.min(1, excite + 0.3); }
    else if (code === 'e') { pop(def === me ? 'Evaded' : 'Dodged'); }
  }

  // ---------- networking: each fighter publishes its own state; the defender is the authority on its own body
  function myState() {
    const f = me!;
    return {
      ch: myChar, r: role, t: joinT, nm: ($('name') as HTMLInputElement).value.slice(0, 16) || 'Janissary', sd: mySide,
      x: +f.root.position.x.toFixed(2), z: +f.root.position.z.toFixed(2), y: +f.root.rotation.y.toFixed(2),
      a: ACTS.indexOf(f.act), s: f.actSeq, at: +f.actT.toFixed(2), c: f.combo, dd: [+f.dodgeDir.x.toFixed(2), +f.dodgeDir.y.toFixed(2)],
      hp: f.hp, st: Math.round(f.st), wn: f.wins, rd: round,
      w: f.wounds.map((w) => [w.b, ...w.p, +w.a.toFixed(2), +w.s.toFixed(2)]), h: claims.slice(-4), rs: results.slice(-6),
    };
  }
  function applyRemote(f: Fighter, p: Record<string, any>, key: string, other: Fighter | null, otherIsMe: boolean) {
    if (typeof p.x !== 'number') return;
    if (typeof p.ch === 'string' && CAST[p.ch] && f.character !== p.ch) f.build(p.ch);
    f.remote = true; f.target.set(p.x, 0, p.z); f.targetYaw = p.y; f.hp = p.hp; f.st = p.st; f.wins = p.wn ?? 0; f.name = String(p.nm ?? '').slice(0, 16);
    const sn = seen.get(key) ?? { claim: 0, res: 0, synced: false };
    if (!sn.synced) { f.root.position.copy(f.target); f.root.rotation.y = p.y; }
    if (p.s !== f.actSeq) { f.act = ACTS[p.a] ?? 'idle'; f.actSeq = p.s; f.combo = p.c ?? 0; f.actT = p.at ?? 0; if (Array.isArray(p.dd)) f.dodgeDir.set(p.dd[0], p.dd[1]); f.animStart(f.actT); if (f.act === 'light' || f.act === 'heavy' || f.act === 'leap') sfx2.whoosh(f.act !== 'light'); }
    const w = Array.isArray(p.w) ? p.w : [];
    if (w.length < f.wounds.length) f.clearWounds();
    for (let i = f.wounds.length; i < w.length; i++) { const v = w[i]; if (Array.isArray(v) && v.length === 6) f.addWound({ b: v[0] | 0, p: [v[1], v[2], v[3]], a: v[4], s: Math.min(0.4, v[5]) }); }
    // results this fighter published about blows it received
    const rs: [number, Code][] = Array.isArray(p.rs) ? p.rs : [];
    for (const [s, c] of rs) if (s > sn.res) { sn.res = s; if (sn.synced && other) outcome(f, other, c, (other.act === 'heavy'), otherIsMe); }
    // blows this fighter claims to have landed on me: I decide what happened
    const hs: any[] = Array.isArray(p.h) ? p.h : [];
    for (const h of hs) if (Array.isArray(h) && h[0] > sn.claim) {
      sn.claim = h[0];
      if (sn.synced && otherIsMe && other && h[3] >= 0 && h[3] < 12) { const c = resolve(other, f, h[1] === 'x' ? 'x' : h[1] === 'h' ? 'h' : 'l', (h[2] in ZONE ? h[2] : 'torso') as Zone, h[3] | 0, [h[4], h[5], h[6]], h[7]); results.push([h[0], c]); outcome(other, f, c, h[1] !== 'l', false); }
    }
    sn.synced = true; seen.set(key, sn);
  }

  async function goOnline(c: string, wantRole: 'f' | 's') {
    if (!room) return;
    leaveOnline();
    code = c; role = wantRole; joinT = Date.now(); seen.clear(); claims.length = 0; results.length = 0; claimSeq = 0; round = 1; overT = -1; matchOver = false;
    hideMenu(); banner('Connecting...', '', 15);
    try { duel = await room.join('duel-' + c); } catch (e) { console.warn(e); showMenu(); banner('Could not connect', 'Check the code and try again', 4); return; }
    mode = role === 'f' ? 'duel' : 'watch'; mySide = 0; me = role === 'f' ? fighters[0] : null; opp = null; if (me && me.character !== myChar) me.build(myChar);
    fighters.forEach((f) => { f.reset(0, f.side === 0 ? 3.4 : -3.4, f.side === 0 ? 0 : Math.PI); f.wins = 0; f.remote = false; f.root.visible = role === 'f' ? f.side === 0 : false; });
    hideMenu(); $('code').textContent = c.toUpperCase();
    if (role === 'f') { room.presence({ open: c, nm: ($('name') as HTMLInputElement).value.slice(0, 16) }); banner('Waiting for an opponent', `Share the code ${c.toUpperCase()}`, 4); }
  }
  function leaveOnline() { duel?.leave(); duel = null; room?.presence({ open: null }); oppPeer = ''; }

  // ---------- menu
  ($('name') as HTMLInputElement).value = store.get('name') ?? '';
  $('name').addEventListener('change', () => store.set('name', ($('name') as HTMLInputElement).value));
  let myChar = store.get('char') ?? 'davud'; if (!CAST[myChar]) myChar = 'davud';
  const charBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-ch]'));
  const showChar = () => { charBtns.forEach((b) => b.classList.toggle('on', b.dataset.ch === myChar)); const f = FIGHTERS.find((x) => x.id === myChar); $('charTitle').textContent = f ? f.title : ''; };
  charBtns.forEach((b) => b.addEventListener('click', () => { myChar = b.dataset.ch!; store.set('char', myChar); showChar(); if (mode === 'menu') { fighters[0].build(myChar); fighters[0].reset(0, 3.4, 0); } })); showChar();
  const otherChar = (c: string) => { const o = FIGHTERS.filter((f) => f.id !== c); return o[Math.floor(Math.random() * o.length)].id; };
  let botLevel = Number(store.get('bot') ?? 1);
  const lvBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-lv]'));
  const showLv = () => lvBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.lv) === botLevel)); showLv();
  lvBtns.forEach((b) => b.addEventListener('click', () => { botLevel = Number(b.dataset.lv); store.set('bot', String(botLevel)); showLv(); }));
  function hideMenu() { $('menu').style.display = 'none'; $('hud').style.opacity = '1'; }
  function showMenu() { $('menu').style.display = 'flex'; $('hud').style.opacity = '0'; }
  function startBot() {
    leaveOnline(); initAudio(); mode = 'bot'; mySide = 0; me = fighters[0]; opp = fighters[1]; bot = new Bot(botLevel);
    if (me.character !== myChar) me.build(myChar); opp.build(otherChar(myChar));
    fighters.forEach((f) => { f.remote = false; f.wins = 0; f.leapUsed = false; f.root.visible = true; }); opp.name = `${FIGHTERS.find((f) => f.id === opp!.character)?.name ?? 'Champion'} (${['recruit', 'champion', 'master'][botLevel]})`;
    round = 1; newRound(); hideMenu();
  }
  function newRound() {
    overT = -1; fx.clearStains();
    fighters.forEach((f) => f.reset(0, f.side === 0 ? 3.4 : -3.4, f.side === 0 ? 0 : Math.PI));
    banner(`Round ${round}`, 'Salute, then fight', 2.2); sfx2.gong(); excite = 0.5;
    fighters.forEach((f) => { f.saluteT = 1.5; });
  }
  $('bBot').addEventListener('click', startBot);
  $('bHost').addEventListener('click', () => { initAudio(); goOnline(Math.random().toString(36).slice(2, 6), 'f'); });
  $('bJoin').addEventListener('click', () => { const c = ($('codeIn') as HTMLInputElement).value.trim().toLowerCase(); if (/^[a-z0-9]{4}$/.test(c)) { initAudio(); goOnline(c, 'f'); } });
  $('bWatch').addEventListener('click', () => { const c = ($('codeIn') as HTMLInputElement).value.trim().toLowerCase(); if (/^[a-z0-9]{4}$/.test(c)) { initAudio(); goOnline(c, 's'); } });
  $('bResume').addEventListener('click', () => { if (mode !== 'menu') hideMenu(); });
  $('bLeave').addEventListener('click', () => { leaveOnline(); mode = 'menu'; me = opp = null; fighters.forEach((f) => { f.root.visible = true; f.reset(0, f.side === 0 ? 3.4 : -3.4, f.side === 0 ? 0 : Math.PI); }); $('bResume').style.display = 'none'; });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && mode !== 'menu') { showMenu(); $('bResume').style.display = ''; } });
  $('bMenu').addEventListener('click', () => { showMenu(); $('bResume').style.display = ''; });
  $('vol').addEventListener('input', () => setVolume(Number(($('vol') as HTMLInputElement).value)));

  // live room for online duels and spectators
  $('status').textContent = 'Connecting...';
  connectRoom().then((r) => {
    room = r;
    if (!r) { $('online').classList.add('off'); $('onlineNote').textContent = 'Online duels work when this page is opened on claude.ai by someone it is shared with. You can still fight the bot.'; return; }
    const p2p = !!(r as any).p2p;
    $('onlineNote').textContent = p2p ? 'Host a duel and send your friend the code. They open this same link, type the code and press Fight.' : 'Host a duel and share the code, or pick an open duel below.';
    if (p2p) { $('openList').style.display = 'none'; return; }
    (r as any).onPeers?.((ch: { peers: readonly Peer[] }) => {
      const list = $('openList'); list.textContent = '';
      for (const p of ch.peers) {
        const o = p.presence?.open; if (p.sameTab || typeof o !== 'string' || !/^[a-z0-9]{4}$/.test(o)) continue;
        const row = document.createElement('div'); row.className = 'row';
        const lbl = document.createElement('span'); lbl.textContent = `${String(p.presence.nm ?? 'Someone').slice(0, 16) || 'Someone'} · ${o.toUpperCase()}`;
        const j = document.createElement('button'); j.textContent = 'Fight'; j.onclick = () => { initAudio(); goOnline(o, 'f'); };
        const w = document.createElement('button'); w.textContent = 'Watch'; w.onclick = () => { initAudio(); goOnline(o, 's'); };
        row.append(lbl, j, w); list.append(row);
      }
      if (!list.childElementCount) list.textContent = 'No open duels right now.';
    });
  });
  $('status').textContent = '';

  // ---------- cameras
  let firstPerson = store.get('fp') !== '0'; const eye = new THREE.Vector3(), fpLook = new THREE.Vector3();
  let hitStop = 0, shake = 0, camMode: 'drone' | 'stands' | 'orbit' = 'drone', shotI = 0, shotT = 0, seatI = 37, lookYaw = 0, lookPitch = -0.1, orbitYaw = 0.6, orbitDist = 10;
  const camPos = new THREE.Vector3(0, 6, 14), camLook = new THREE.Vector3(0, 1, 0);
  const SHOTS = ['Wide', 'Side', 'Over the shoulder', 'Over the shoulder', 'From above', 'Low angle'];
  function droneShot(i: number, a: Fighter, b: Fighter, t: number): [THREE.Vector3, THREE.Vector3] {
    const mid = a.root.position.clone().lerp(b.root.position, 0.5); const line = b.root.position.clone().sub(a.root.position).setY(0); const len = Math.max(1, line.length()); line.normalize();
    const perp = new THREE.Vector3(-line.z, 0, line.x);
    switch (i) {
      case 0: return [new THREE.Vector3(Math.sin(t * 0.15) * 12, 6.5, Math.cos(t * 0.15) * 12), mid.clone().setY(1)];
      case 1: return [mid.clone().addScaledVector(perp, 2.2 + len * 0.5).setY(1.55), mid.clone().setY(1.2)];
      case 2: return [a.root.position.clone().addScaledVector(line, -2.6).addScaledVector(perp, 0.8).setY(2.0), b.root.position.clone().setY(1.3)];
      case 3: return [b.root.position.clone().addScaledVector(line, 2.6).addScaledVector(perp, -0.8).setY(2.0), a.root.position.clone().setY(1.3)];
      case 4: return [mid.clone().add(new THREE.Vector3(0.01, 12, 0.5)), mid.clone()];
      default: return [mid.clone().addScaledVector(perp, -2.6).setY(0.45), mid.clone().setY(1.55)];
    }
  }
  function cut(i?: number) { shotI = i ?? (shotI + 1 + Math.floor(Math.random() * 4)) % SHOTS.length; shotT = 0; }

  // ---------- main loop
  const clock = new THREE.Clock(); let fpsT = 0, frames = 0, scale = 1, slow = 0;
  (window as any).__sim = (secs: number) => { const log: string[] = []; for (let i = 0; i < secs * 30; i++) { const h = fighters.map((f) => f.hp + f.act); frame(1 / 30, true); fighters.forEach((f, k) => { if (f.hp + f.act !== h[k]) log.push(`${(i / 30).toFixed(1)} F${k} ${f.act} hp${f.hp}`); }); } return { log: log.slice(-30), mode, hp: [fighters[0].hp, fighters[1].hp], act: fighters.map((f) => f.act), wins: fighters.map((f) => f.wins), round, wounds: fighters.map((f) => f.wounds.length) }; };
  (window as any).__start = (m: string, lv = 1) => { if (m === 'bot') { botLevel = lv; startBot(); } };
  const pressQ = new Set<string>();
  (window as any).__press = (k: string) => pressQ.add(k);
  (window as any).__place = (z0: number, z1: number) => { fighters[0].root.position.set(0, 0, z0); fighters[1].root.position.set(0, 0, z1); fighters.forEach((f) => { f.vel.set(0, 0, 0); f.knock.set(0, 0, 0); }); };
  (window as any).__hip = () => fighters[0].model.getObjectByName('mixamorigHips')!.getWorldPosition(new THREE.Vector3()).y;
  (window as any).__actT = () => fighters[0].actT;
  (window as any).__blade = () => { const f = fighters[0], o = fighters[1]; const c = o.chest(); const tip = f.tipW, hilt = f.hiltW; return `tip(${tip.x.toFixed(2)},${tip.y.toFixed(2)},${tip.z.toFixed(2)}) hilt(${hilt.y.toFixed(2)},${hilt.z.toFixed(2)}) oppZ=${o.root.position.z.toFixed(2)} oppAct=${o.act} striking=${f.striking} swingHit=${f.swingHit}`; };
  (window as any).__mirror = () => {
    mode = 'watch'; bot = null; bot2 = null; duel = null; fighters.forEach((f) => { f.root.visible = true; });
    fighters[0].reset(0, 0.6, 0); fighters[1].reset(0, -0.6, Math.PI);
    for (let i = 0; i < 10; i++) frame(1 / 30, true);
    const rows: string[] = []; const press = { mx: 0, my: 0, light: true, heavy: false, block: false, dodge: false }, none = { ...press, light: false };
    for (let i = 0; i < 16; i++) {
      for (const f of fighters) f.seen.copy(f.root.position);
      const [x, y] = fighters; x.step(1 / 30, i === 0 ? press : none, y); y.step(1 / 30, i === 0 ? press : none, x);
      frame(1 / 30, true);
      rows.push(fighters.map((f, k) => { const o = fighters[1 - k]; const loc = f.root.worldToLocal(f.tipW.clone()); const h = o.hitTest(f.hiltW, f.tipW); const head = new THREE.Vector3(); (o as any).bones[0][0].getWorldPosition(head); const lt = f.root.worldToLocal(f.tipW.clone()); return `F${k} ${f.act} t${f.actT.toFixed(2)} tipLocal(${lt.x.toFixed(2)},${lt.y.toFixed(2)},${lt.z.toFixed(2)}) pos(${f.root.position.x.toFixed(3)},${f.root.position.z.toFixed(3)}) yaw ${f.root.rotation.y.toFixed(3)} hits ${h ? h.zone : '-'} oppHead(${head.x.toFixed(2)},${head.y.toFixed(2)},${head.z.toFixed(2)}) oppRoot(${o.root.position.x.toFixed(2)},${o.root.position.z.toFixed(2)})`; }).join(' | '));
    }
    return rows;
  };
  (window as any).__mirrorFight = (secs: number) => {
    mode = 'watch'; duel = null; bot = new Bot(1); bot2 = new Bot(1); bot.setSeed(12345); bot2.setSeed(12345);
    fighters.forEach((f) => { f.root.visible = true; f.leapUsed = false; if (f.character !== 'davud') f.build('davud'); }); fighters[0].reset(0, 3.4, 0); fighters[1].reset(0, -3.4, Math.PI); // same fighter on both sides
    for (let i = 0; i < secs * 30; i++) {
      frame(1 / 30, true);
      const [a, b] = fighters, pa = a.root.position, pb = b.root.position;
      const dPos = Math.hypot(pa.x + pb.x, pa.z + pb.z), dAct = a.act !== b.act || Math.abs(a.actT - b.actT) > 1e-6, dHp = a.hp !== b.hp;
      if (dPos > 1e-4 || dAct || dHp) return { divergedAtFrame: i, a: [a.act, +a.actT.toFixed(3), a.hp, +pa.x.toFixed(4), +pa.z.toFixed(4)], b: [b.act, +b.actT.toFixed(3), b.hp, +pb.x.toFixed(4), +pb.z.toFixed(4)] };
    }
    return { mirroredFor: secs, hp: fighters.map((f) => f.hp) };
  };
  (window as any).__ready = false;
  /** Fight simulator: plays bot-against-bot rounds at full speed and counts what happened to every swing. */
  (window as any).__simulate = (rounds: number, lvA = 1, lvB = 1, swap = false) => {
    const sz = (f: Fighter) => ((f.side === 0) !== swap ? 3.4 : -3.4), syaw = (f: Fighter) => ((f.side === 0) !== swap ? 0 : Math.PI);
    for (const k in stats) delete stats[k];
    mode = 'watch'; me = null; bot = new Bot(lvA); bot2 = new Bot(lvB); duel = null; fighters.forEach((f) => { f.root.visible = true; f.leapUsed = false; });
    let done = 0, t = 0, roundT = 0, overlapFrames = 0, frames = 0; const lens: number[] = []; const seq = fighters.map((f) => f.actSeq), acts = fighters.map((f) => f.act), hitAtStart = fighters.map(() => false);
    fighters.forEach((f) => f.reset(0, sz(f), syaw(f)));
    while (done < rounds && t < rounds * 240) {
      frame(1 / 30, true); t += 1 / 30; roundT += 1 / 30; frames++;
      fighters.forEach((f, k) => {
        if (f.actSeq !== seq[k]) { // an action ended or changed: count swings that never connected
          if ((acts[k] === 'light' || acts[k] === 'heavy' || acts[k] === 'leap') && !hitAtStart[k]) bump(`${acts[k]}_miss`);
          if (f.act === 'light' || f.act === 'heavy' || f.act === 'leap') bump(`${f.act}_thrown`); if (f.act === 'dodge') bump('dodges'); if (f.act === 'block') bump('blocks_raised');
          seq[k] = f.actSeq; acts[k] = f.act; hitAtStart[k] = false;
        }
        if (f.swingHit) hitAtStart[k] = true;
      });
      fighters.forEach((f, k) => { if (f.striking) { const o = fighters[1 - k]; const c = o.chest(); const d = Math.min(f.tipW.distanceTo(c), f.tipW.clone().lerp(f.hiltW, 0.5).distanceTo(c)); bump(`reach${k}_n`); bump(`reach${k}_sum`, d); bump(`range${k}_sum`, f.root.position.distanceTo(o.root.position)); const to = o.root.position.clone().sub(f.root.position).setY(0).normalize(); bump(`face${k}_sum`, THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(f.forward.dot(to), -1, 1)))); const hips = f.model.getObjectByName('mixamorigHips')!; const hf = new THREE.Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize(); bump(`hipface${k}_sum`, THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(hf.dot(to), -1, 1)))); } });
      let pen = 0; for (const [pa, ra] of fighters[0].body()) for (const [pb, rb] of fighters[1].body()) pen = Math.max(pen, ra + rb - pa.distanceTo(pb)); if (pen > 0.01) overlapFrames++;
      if (fighters.some((f) => !f.alive) && roundT > 0.5) { lens.push(roundT); bump(fighters[0].alive && !fighters[1].alive ? 'winsA' : fighters[1].alive && !fighters[0].alive ? 'winsB' : 'draws'); done++; roundT = 0; fighters.forEach((f) => { f.reset(0, sz(f), syaw(f)); f.leapUsed = false; }); }
    }
    const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
    return { rounds: lens.length, avgRoundSec: +avg.toFixed(1), overlapFramesPct: +((overlapFrames / frames) * 100).toFixed(2), ...stats };
  };
  (window as any).__jumps = (secs: number) => {
    const hip = (f: Fighter) => f.model.getObjectByName('mixamorigHips')!.getWorldPosition(new THREE.Vector3());
    let prev = fighters.map(hip), worst = 0, at = ''; const big: string[] = [];
    for (let i = 0; i < secs * 30; i++) {
      const acts = fighters.map((f) => f.act); frame(1 / 30, true); const now = fighters.map(hip);
      now.forEach((p, k) => { const d = p.clone().setY(0).distanceTo(prev[k].clone().setY(0)); if (d > worst) { worst = d; at = `${acts[k]}->${fighters[k].act}`; } if (d > 0.12) big.push(`${(i / 30).toFixed(1)}s F${k} ${(d * 100).toFixed(0)}cm ${acts[k]}->${fighters[k].act}`); });
      prev = now;
    }
    return { worstStepCm: +(worst * 100).toFixed(1), during: at, over12cm: big.slice(0, 12), count: big.length };
  };
  (window as any).__overlap = (secs: number, stack = false) => {
    if (stack) { fighters[0].root.position.set(0, 0, 0); fighters[1].root.position.set(0.05, 0, 0); }
    let worst = 0, sum = 0, n = 0, minRoot = 99;
    for (let i = 0; i < secs * 30; i++) {
      frame(1 / 30, true);
      let pen = 0; for (const [pa, ra] of fighters[0].body()) for (const [pb, rb] of fighters[1].body()) pen = Math.max(pen, ra + rb - pa.distanceTo(pb));
      worst = Math.max(worst, pen); sum += pen; n++; minRoot = Math.min(minRoot, fighters[0].root.position.distanceTo(fighters[1].root.position));
    }
    return { worstOverlapCm: +(worst * 100).toFixed(1), avgOverlapCm: +((sum / n) * 100).toFixed(2), minFeetApartM: +minRoot.toFixed(2), hp: fighters.map((f) => f.hp), act: fighters.map((f) => f.act) };
  };
  (window as any).__online = (c: string, r: 'f' | 's') => goOnline(c, r);
  (window as any).__me = (x: number, z: number) => { if (me) { me.root.position.set(x, 0, z); } };
  (window as any).__state = () => ({ mode, role, oppPeer: !!oppPeer, watchers, hp: fighters.map((f) => f.hp), vis: fighters.map((f) => f.root.visible), wounds: fighters.map((f) => f.wounds.length), act: fighters.map((f) => f.act), pos: fighters.map((f) => [+f.root.position.x.toFixed(1), +f.root.position.z.toFixed(1)]) });

  function frame(dt: number, sim = false) {
    time += dt;
    for (const f of fighters) f.seen.copy(f.root.position);
    const cmd = input.read(); for (const k of pressQ) (cmd as any)[k] = true; pressQ.clear();
    // --- local fighter and bot
    if ((mode === 'bot' || mode === 'duel') && me) {
      const c = $('menu').style.display === 'none' ? cmd : { ...cmd, mx: 0, my: 0, light: false, heavy: false, block: false, dodge: false };
      const before = me.actSeq; me.step(dt, c, opp && opp.root.visible ? opp : null);
      if (me.actSeq !== before && (me.act === 'light' || me.act === 'heavy' || me.act === 'leap')) { sfx2.whoosh(me.act !== 'light'); if (me.act === 'leap') excite = Math.min(1, excite + 0.4); }
    }
    if (mode === 'bot' && opp && me && bot) { const before = opp.actSeq; opp.step(dt, bot.cmd(opp, me, dt), me); if (opp.actSeq !== before && (opp.act === 'light' || opp.act === 'heavy')) sfx2.whoosh(opp.act === 'heavy'); }
    if (mode === 'watch' && !duel && bot && bot2) { const [x, y] = fighters; const sw = (window as any).__swapBots; const cx = (sw ? bot2 : bot).cmd(x, y, dt), cy = (sw ? bot : bot2).cmd(y, x, dt); if ((window as any).__rev) { y.step(dt, cy, x); x.step(dt, cx, y); } else { x.step(dt, cx, y); y.step(dt, cy, x); } } // both decide from the same moment // demo for testing cameras
    // --- network
    if (duel) {
      const peers = duel.peers();
      const fs = peers.filter((p) => p.presence?.r === 'f').sort((a, b) => (Number(a.presence.t) - Number(b.presence.t)) || (a.peer < b.peer ? -1 : 1));
      watchers = peers.filter((p) => p.presence?.r === 's').length;
      if (mode === 'duel') {
        const mineIdx = fs.findIndex((p) => p.sameTab);
        if (mineIdx >= 2) { role = 's'; mode = 'watch'; me = null; banner('This duel is full', 'You are watching'); }
        else {
          const o = fs.find((p) => !p.sameTab) ?? null;
          if (o && o.peer !== oppPeer) { // a new opponent arrived
            oppPeer = o.peer; mySide = mineIdx === 0 ? 0 : 1; me = fighters[mySide]; opp = fighters[1 - mySide as 0 | 1]; if (me.character !== myChar) me.build(myChar);
            fighters.forEach((f) => { f.root.visible = true; f.wins = 0; f.leapUsed = false; }); me.remote = false; seen.delete(oppPeer); round = 1; newRound();
            room?.presence({ open: null });
          }
          if (!o && oppPeer) { oppPeer = ''; opp = null; fighters[1 - mySide].root.visible = false; banner('Your opponent left', `Code ${code.toUpperCase()}`, 3); room?.presence({ open: code }); }
          if (o && opp && me) applyRemote(opp, o.presence as Record<string, any>, o.peer, me, true);
          if (me) duel.presence(myState());
        }
      }
      if (mode === 'watch') {
        duel.presence({ r: 's', t: joinT });
        watchPair = [fs[0] ?? null, fs[1] ?? null];
        watchPair.forEach((p, i) => { const f = fighters[i]; f.root.visible = !!p; if (p) applyRemote(f, p.presence as Record<string, any>, p.peer, fighters[1 - i], false); });
        if (fs[0] && typeof fs[0].presence.rd === 'number') round = fs[0].presence.rd as number;
      }
    }
    for (const f of fighters) if (f.remote) f.follow(dt);
    // --- the wall stops you
    for (const f of fighters) { const p = f.root.position; const l = Math.hypot(p.x, p.z); if (l > RING) { p.x *= RING / l; p.z *= RING / l; const n = new THREE.Vector3(p.x, 0, p.z).normalize(); const vn = f.vel.dot(n); if (vn > 0) f.vel.addScaledVector(n, -vn); const kn = f.knock.dot(n); if (kn > 0) f.knock.addScaledVector(n, -kn * 1.4); } }
    for (const f of fighters) { const o = fighters[1 - f.side]; f.lookAt = o.root.visible ? o.eyes(f.lookAt ?? new THREE.Vector3()) : null; }
    for (const f of fighters) if (f.root.visible) f.animate(dt);
    // --- solid bodies: torso, hips, head and legs of one person never pass through the other's
    { const [a, b] = fighters;
      if (a.root.visible && b.root.visible) {
        for (let it = 0; it < 2; it++) {
          let worst = 0; const push = new THREE.Vector3();
          for (const [pa, ra] of a.body()) for (const [pb, rb] of b.body()) {
            const d = pa.clone().sub(pb); const l = d.length(), pen = ra + rb - l;
            if (pen > worst) { worst = pen; push.copy(l > 1e-4 ? d.divideScalar(l) : a.root.position.clone().sub(b.root.position).setY(0).normalize()); }
          }
          if (worst <= 0) break;
          const sa = a.remote ? 0 : b.remote ? 1 : 0.5, sb = 1 - sa;
          a.root.position.addScaledVector(push, worst * sa); b.root.position.addScaledVector(push, -worst * sb);
          // bodies that meet stop moving into each other
          for (const [f, sgn] of [[a, 1], [b, -1]] as [Fighter, number][]) { if (f.remote) continue; const vn = f.vel.dot(push) * sgn; if (vn < 0) f.vel.addScaledVector(push, -vn * sgn); const kn = f.knock.dot(push) * sgn; if (kn < 0) f.knock.addScaledVector(push, -kn * sgn); }
          a.root.updateMatrixWorld(true); b.root.updateMatrixWorld(true);
        }
      }
    }
    // --- blade contact, found by whoever controls the attacker. Both blades are checked before either
    // blow is applied, so two fighters who strike at the same moment both land (a double hit).
    const landed: [Fighter, Fighter, { zone: Zone; bi: number; point: THREE.Vector3 }, 'l' | 'h' | 'x', number][] = [];
    for (const att of fighters) {
      const def = att === fighters[0] ? fighters[1] : fighters[0];
      if (att.remote || !att.root.visible || !def.root.visible || !att.striking || att.swingHit) continue;
      if ((mode === 'duel' && att !== me) || (mode === 'watch' && duel) || mode === 'menu') continue;
      const hit = def.hitTest(att.hiltW, att.tipW); if (hit) landed.push([att, def, hit, att.act === 'leap' ? 'x' : att.act === 'heavy' ? 'h' : 'l', att.combo]); // what kind of blow it was, before anything is applied
    }
    for (const [att, def, hit, k, combo] of landed) {
      att.swingHit = true; const bl = def.boneLocal(hit.bi, hit.point), ang = (Math.random() - 0.5) * 1.2 + (combo % 2 ? 0.5 : -0.5);
      if (mode === 'bot' || (mode === 'watch' && !duel)) outcome(def, att, resolve(def, att, k, hit.zone, hit.bi, bl, ang), k !== 'l', true, k);
      else claims.push([++claimSeq, k, hit.zone, hit.bi, ...bl, +ang.toFixed(2)]);
    }
    // --- rounds (each fighter's client keeps its own score in step with what it sees)
    if ((mode === 'bot' || mode === 'duel') && me && opp && opp.root.visible) {
      if (overT < 0 && (!me.alive || !opp.alive)) {
        overT = 0; if (!opp.alive && me.alive) me.wins++; if (mode === 'bot' && !me.alive && opp.alive) opp.wins++;
        const won = me.alive, mWins = me.wins, oWins = mode === 'bot' ? opp.wins : (opp.wins + (won ? 0 : 0));
        matchOver = mWins >= 2 || oWins >= 2 || (!won && opp.wins + 1 >= 2 && mode === 'duel');
        banner(won ? (matchOver ? 'Victory' : 'Round won') : (matchOver ? 'Defeat' : 'Round lost'), won ? 'The crowd roars' : 'Rise again', 3.2);
      }
      if (overT >= 0) { overT += dt; if (overT > (matchOver ? 6 : 3.6)) { if (matchOver) { me.wins = 0; me.leapUsed = false; opp.leapUsed = false; if (mode === 'bot') opp.wins = 0; round = 1; matchOver = false; } else round++; newRound(); } }
    }
    // --- camera
    const cam = camera;
    if (cmd.view && (mode === 'bot' || mode === 'duel')) { firstPerson = !firstPerson; store.set('fp', firstPerson ? '1' : '0'); }
    for (const f of fighters) if (f.hat) f.hat.visible = !(firstPerson && f === me && (mode === 'bot' || mode === 'duel'));
    if ((mode === 'bot' || mode === 'duel') && me && firstPerson) {
      // through your own eyes: the head carries the camera, the gaze stays on the opponent
      const o = opp && opp.root.visible ? opp : null; me.eyes(eye);
      const target = o ? (o.alive ? o.eyes(new THREE.Vector3()).setY(o.eyes(new THREE.Vector3()).y - 0.25) : o.chest().setY(0.4)) : eye.clone().addScaledVector(me.forward, 3);
      camPos.lerp(eye, 1 - Math.exp(-30 * dt)); fpLook.lerp(target, 1 - Math.exp(-12 * dt)); camLook.copy(fpLook);
      cam.near = 0.06; cam.fov = lerp(cam.fov, 75, dt * 4);
    } else if ((mode === 'bot' || mode === 'duel') && me) {
      cam.near = 0.05;
      const o = opp && opp.root.visible ? opp : null;
      const dir = o ? o.root.position.clone().sub(me.root.position).setY(0).normalize() : me.forward;
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const dist = o ? THREE.MathUtils.clamp(me.root.position.distanceTo(o.root.position), 1, 6) : 2;
      const wantPos = me.root.position.clone().addScaledVector(dir, -3.1 - dist * 0.12).addScaledVector(right, 0.85).setY(1.95);
      const wantLook = me.root.position.clone().addScaledVector(dir, 1.4 + dist * 0.3).setY(1.2);
      camPos.lerp(wantPos, 1 - Math.exp(-7 * dt)); camLook.lerp(wantLook, 1 - Math.exp(-9 * dt)); cam.fov = lerp(cam.fov, 55, dt * 3);
    } else {
      if (cmd.cam) { camMode = camMode === 'drone' ? 'stands' : camMode === 'stands' ? 'orbit' : 'drone'; }
      const [fa, fb] = fighters, live = fa.root.visible && fb.root.visible;
      if (camMode === 'drone' && live) {
        shotT += dt; if (q.has('shotI')) shotI = Number(q.get('shotI')); else if (shotT > 5.5) cut();
        const [p, l] = droneShot(shotI, fa, fb, time); camPos.lerp(p, 1 - Math.exp(-2.2 * dt)); camLook.lerp(l, 1 - Math.exp(-4 * dt));
      } else if (camMode === 'stands') {
        lookYaw -= cmd.lookX * 0.004; lookPitch = THREE.MathUtils.clamp(lookPitch - cmd.lookY * 0.004, -0.9, 0.5);
        const s = arena.seat(seatI); camPos.copy(s.pos); const base = Math.atan2(-s.pos.x, -s.pos.z) + lookYaw;
        camLook.copy(s.pos).add(new THREE.Vector3(Math.sin(base) * Math.cos(lookPitch), Math.sin(lookPitch), Math.cos(base) * Math.cos(lookPitch)));
      } else {
        orbitYaw -= cmd.lookX * 0.006; orbitDist = THREE.MathUtils.clamp(orbitDist + cmd.lookY * 0.02, 4, 26);
        const mid = live ? fa.root.position.clone().lerp(fb.root.position, 0.5) : new THREE.Vector3();
        camPos.lerp(mid.clone().add(new THREE.Vector3(Math.sin(orbitYaw) * orbitDist, 2 + orbitDist * 0.3, Math.cos(orbitYaw) * orbitDist)), 1 - Math.exp(-6 * dt)); camLook.lerp(mid.setY(1.1), 1 - Math.exp(-6 * dt));
      }
    }
    { const l = Math.hypot(camPos.x, camPos.z); if ((mode === 'bot' || mode === 'duel') && l > 14.7) { camPos.x *= 14.7 / l; camPos.z *= 14.7 / l; } if (camPos.y < 0.3) camPos.y = 0.3; }
    if (q.has('cam')) { const v = q.get('cam')!.split(',').map(Number); camPos.set(v[0], v[1], v[2]); camLook.set(v[3], v[4], v[5]); }
    shake = Math.max(0, shake - dt * 2.2);
    cam.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.12, (Math.random() - 0.5) * shake * 0.12, 0)); cam.lookAt(camLook); cam.updateProjectionMatrix();
    // --- world
    excite = Math.max(0.12, excite - dt * 0.12); arena.update(dt, time, excite); crowd(excite); fx.update(dt);
    if (sim) return;
    hud(dt);
    composer.render(dt);
  }

  const bars = { aHp: $('aHp'), bHp: $('bHp'), aSt: $('aSt'), bSt: $('bSt') };
  function hud(dt: number) {
    const [L, R] = me ? [me, opp] : [fighters[0], fighters[1]];
    (bars.aHp.firstElementChild as HTMLElement).style.width = `${L.hp}%`; (bars.aSt.firstElementChild as HTMLElement).style.width = `${L.st}%`;
    const nm = (f: Fighter) => FIGHTERS.find((x) => x.id === f.character)?.name ?? '';
    $('aName').textContent = me ? (($('name') as HTMLInputElement).value || nm(L) || 'You') : (L.name || nm(L) || 'Fighter 1');
    const rv = !!R && R.root.visible; $('right').style.visibility = rv ? 'visible' : 'hidden';
    if (R && rv) { (bars.bHp.firstElementChild as HTMLElement).style.width = `${R.hp}%`; (bars.bSt.firstElementChild as HTMLElement).style.width = `${R.st}%`; $('bName').textContent = R.name || 'Opponent'; }
    $('aWins').textContent = '◆'.repeat(L.wins) + '◇'.repeat(Math.max(0, 2 - L.wins)); $('bWins').textContent = R ? '◆'.repeat(R.wins) + '◇'.repeat(Math.max(0, 2 - R.wins)) : '';
    $('round').textContent = `Round ${round}`;
    $('watch').textContent = mode === 'watch' ? `Watching · ${camMode === 'drone' ? 'Drone, ' + SHOTS[shotI].toLowerCase() : camMode === 'stands' ? 'Seat in the stands' : 'Free camera'} · ${mobile ? 'CAM' : 'C or the controller View button'} to switch` : (duel ? `Code ${code.toUpperCase()} · ${watchers} watching` : '');
    const dev = mode === 'watch' ? '' : input.device === 'pad' ? 'Stick move · X light · Y heavy · LB or LT block · A dodge · RB leap (once) · Click a stick to change view' : input.device === 'touch' ? '' : 'WASD move · Click light · E heavy · Hold right-click block · Space dodge · F leap (once) · V view · Esc';
    $('hint').textContent = dev;
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = '0'; }
    if (popT > 0) { popT -= dt; $('pop').style.transform = 'translate(-50%,0) scale(1)'; if (popT <= 0) $('pop').style.opacity = '0'; }
    $('bLeap').style.display = mode !== 'watch' && me && !me.leapUsed ? 'flex' : 'none'; $('leapReady').textContent = me && mode !== 'watch' ? (me.leapUsed ? '' : `Leaping strike ready · ${input.device === 'pad' ? 'RB' : input.device === 'touch' ? 'LEAP' : 'F'}`) : ''; $('bCam').style.display = mode === 'watch' ? 'flex' : 'none'; $('bView').style.display = mode === 'watch' ? 'none' : 'flex'; for (const id of ['bLight', 'bHeavy', 'bBlock', 'bDodge']) $(id).style.display = mode === 'watch' ? 'none' : 'flex';
  }

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
  $('loading').style.display = 'none'; showMenu(); $('bResume').style.display = 'none';
  if (shot && q.has('nomenu')) hideMenu();
  if (shot && q.get('start') === 'bot') { if (q.has('lv')) botLevel = Number(q.get('lv')); startBot(); }
  if (shot && q.has('watchdemo')) { startBot(); me = null; mode = 'watch'; bot = new Bot(2); bot2 = new Bot(1); hideMenu(); }
  function loop() {
    const raw = Math.min(clock.getDelta(), 0.05); const dt = hitStop > 0 ? raw * 0.06 : raw; hitStop = Math.max(0, hitStop - raw);
    frame(dt);
    frames++; fpsT += dt;
    if (fpsT > 0.5) { const fps = frames / fpsT; frames = 0; fpsT = 0; (window as any).__ready = true; if (!shot && time > 4) { slow = fps < 50 ? slow + 1 : 0; if (slow >= 3 && scale > 0.6) { scale *= 0.85; slow = 0; renderer.setPixelRatio(basePR * scale); composer.setSize(innerWidth, innerHeight); } } }
    requestAnimationFrame(loop);
  }
  void spawn;
  loop();
}
main().catch((e) => { document.getElementById('status')!.textContent = 'Error: ' + e.message; console.error(e); });
