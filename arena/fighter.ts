import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fetchBin } from '../src/bin';

const B = import.meta.env.BASE_URL;
let proto: THREE.Object3D, sword: THREE.Object3D, baseScale = 1, swordLen = 0.9;
const clips: Record<string, THREE.AnimationClip> = {};

// Timings (seconds). Active windows are when the blade can connect.
export const T = {
  light: 0.56, lightWin: [0.2, 0.44] as const, heavy: 1.0, heavyWin: [0.42, 0.84] as const,
  dodge: 0.42, iframes: 0.3, parry: 0.22, hitLight: 0.42, hitHeavy: 0.75, stun: 1.05, recoil: 0.38, guardBreak: 0.85,
};
export const COST = { light: 9, heavy: 22, dodge: 18, blockHit: 14 };
export const DMG = { light: 13, heavy: 30 };
export const ZONE = { head: 1.7, torso: 1, arm: 0.65, leg: 0.75 } as const;
export type Zone = keyof typeof ZONE;
export type Act = 'idle' | 'light' | 'heavy' | 'block' | 'dodge' | 'hit' | 'stun' | 'recoil' | 'dead';
export const ACTS: Act[] = ['idle', 'light', 'heavy', 'block', 'dodge', 'hit', 'stun', 'recoil', 'dead'];

/** Hitboxes: bone, child bone (capsule end), radius, zone. */
const HB: [string, string, number, Zone][] = [
  ['Head', 'HeadTop_End', 0.115, 'head'],
  ['Spine2', 'Neck', 0.17, 'torso'], ['Spine', 'Spine2', 0.17, 'torso'], ['Hips', 'Spine', 0.16, 'torso'],
  ['LeftArm', 'LeftForeArm', 0.065, 'arm'], ['LeftForeArm', 'LeftHand', 0.055, 'arm'],
  ['RightArm', 'RightForeArm', 0.065, 'arm'], ['RightForeArm', 'RightHand', 0.055, 'arm'],
  ['LeftUpLeg', 'LeftLeg', 0.085, 'leg'], ['LeftLeg', 'LeftFoot', 0.065, 'leg'],
  ['RightUpLeg', 'RightLeg', 0.085, 'leg'], ['RightLeg', 'RightFoot', 0.065, 'leg'],
];

export async function loadFighterAssets() {
  const loader = new GLTFLoader();
  const [kg, sg] = await Promise.all([
    fetchBin(`${B}models/knight.json`).then((b) => loader.parseAsync(b, '')),
    fetchBin(`${B}models/kilij.json`).then((b) => loader.parseAsync(b, '')),
  ]);
  proto = kg.scene;
  proto.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  proto.updateMatrixWorld(true);
  const wy = (n: string) => proto.getObjectByName('mixamorig' + n)?.getWorldPosition(new THREE.Vector3()).y ?? 0;
  const h = wy('HeadTop_End') - Math.min(wy('LeftToeBase'), wy('LeftFoot'));
  baseScale = h > 0.1 ? 1.78 / (h + 0.06) : 1;
  for (const c of kg.animations) {
    // keep animations in place: hold the two horizontal hip components at their first value
    if (!c.name.startsWith('dying')) for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) {
      const v = tr.values, n = v.length / 3, mean = [0, 0, 0];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k] += Math.abs(v[i * 3 + k]) / n;
      const up = mean.indexOf(Math.max(...mean));
      for (let i = 1; i < n; i++) for (let k = 0; k < 3; k++) if (k !== up) v[i * 3 + k] = v[k];
    }
    clips[c.name] = c;
  }
  const s0 = clips.sword_slash;
  const sub = (n: string, a: number, b: number) => { clips[n] = THREE.AnimationUtils.subclip(s0, n, a, b, 30); };
  sub('light0', 10, 34); sub('light1', 40, 61); sub('light2', 67, 88); sub('heavy', 82, 106); sub('guard', 68, 70);
  // sword: put the grip at the origin, blade along +Y
  sword = sg.scene;
  sword.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; (m.material as THREE.MeshStandardMaterial).envMapIntensity = 1.3; } });
  const bb = new THREE.Box3().setFromObject(sword);
  swordLen = bb.max.y - bb.min.y;
  // the handle is at the top of the model: turn it over so the blade runs along +Y from the grip
  const grip = bb.max.y - swordLen * 0.1;
  sword.position.y -= grip; sword.position.x -= (bb.min.x + bb.max.x) / 2; sword.position.z -= (bb.min.z + bb.max.z) / 2;
  const flip = new THREE.Group(); flip.rotation.z = Math.PI; flip.add(sword);
  const wrap = new THREE.Group(); wrap.add(flip); sword = wrap;
}

export interface Claim { s: number; k: 'l' | 'h'; z: Zone; b: number; p: [number, number, number]; a: number }
export interface Wound { b: number; p: [number, number, number]; a: number; s: number }

const tl = new THREE.TextureLoader();
let woundTex: THREE.Texture | null = null;
function woundTexture() {
  if (woundTex) return woundTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!;
  // a slash: dark core, wet red edges, a few drips
  const grd = g.createLinearGradient(0, 40, 0, 88);
  grd.addColorStop(0, 'rgba(120,10,8,0)'); grd.addColorStop(0.35, 'rgba(140,12,10,0.9)'); grd.addColorStop(0.5, 'rgba(40,0,0,1)'); grd.addColorStop(0.65, 'rgba(140,12,10,0.9)'); grd.addColorStop(1, 'rgba(120,10,8,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(10, 64); g.quadraticCurveTo(128, 34, 246, 64); g.quadraticCurveTo(128, 94, 10, 64); g.fill();
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},5,5,${0.5 + Math.random() * 0.4})`; g.beginPath(); g.ellipse(30 + Math.random() * 196, 64 + (Math.random() - 0.3) * 50, 2 + Math.random() * 5, 2 + Math.random() * 9, 0, 0, 7); g.fill(); }
  woundTex = new THREE.CanvasTexture(c); woundTex.colorSpace = THREE.SRGBColorSpace; return woundTex;
}
const woundMat = () => new THREE.MeshStandardMaterial({ map: woundTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.25, metalness: 0 });
void tl;

function segSeg(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r); let s = 0, t = 0;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

export class Fighter {
  root = new THREE.Group(); model: THREE.Object3D; mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {}; private cur = ''; private bones: THREE.Object3D[][] = [];
  private blade = new THREE.Group(); private woundMeshes: THREE.Mesh[] = [];
  hp = 100; st = 100; act: Act = 'idle'; actT = 0; actSeq = 0; combo = 0; queued = false; swingHit = false; actDur = 0;
  wounds: Wound[] = []; move = new THREE.Vector2(); speed = 0; dodgeDir = new THREE.Vector2(); name = ''; wins = 0;
  /** remote fighters are driven by network state, not by step() */
  remote = false; target = new THREE.Vector3(); targetYaw = 0; animYaw = 0;
  readonly hiltW = new THREE.Vector3(); readonly tipW = new THREE.Vector3();

  constructor(public side: 0 | 1) {
    this.model = cloneSkinned(proto);
    const tint = side === 0 ? 0xffd2c8 : 0xb8d8c8;
    this.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const c = (m.material as THREE.MeshStandardMaterial).clone(); c.color.set(tint); c.envMapIntensity = 1.1; m.material = c; } });
    this.model.scale.setScalar(baseScale); this.model.rotation.y = Math.PI;
    this.root.add(this.model);
    const get = (n: string) => this.model.getObjectByName('mixamorig' + n)!;
    this.bones = HB.map(([a, b]) => [get(a), get(b)]);
    // sword in the right hand
    const hand = get('RightHand'); this.model.updateMatrixWorld(true);
    const ws = hand.getWorldScale(new THREE.Vector3()).x;
    const grip = new THREE.Group(); grip.scale.setScalar(1 / (ws * baseScale) * baseScale); grip.position.set(0, 8.5, 2.2);
    const q = new URLSearchParams(location.search).get('gr')?.split(',').map(Number) ?? [-Math.PI / 2, 0, 0];
    grip.rotation.set(q[0], q[1], q[2]);
    grip.add(sword.clone(true)); grip.add(this.blade); hand.add(grip);
    this.blade.position.set(0, 0, 0);
    // headwear: a janissary bork for side 0, a turban for side 1
    const head = get('Head'), hs = 1 / head.getWorldScale(new THREE.Vector3()).x * baseScale;
    const hat = new THREE.Group(); hat.scale.setScalar(hs / baseScale); hat.position.set(0, 11.5, -0.5);
    const felt = new THREE.MeshStandardMaterial({ color: side === 0 ? 0xeee8dc : 0xf2efe6, roughness: 0.95 });
    if (side === 0) {
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.112, 0.26, 16), felt); b1.position.y = 0.1;
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.025), felt); flap.position.set(0, 0.0, -0.11); flap.rotation.x = -0.25;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.8 })); band.position.y = -0.0;
      hat.add(b1, flap, band);
    } else {
      const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), felt); t1.scale.set(1, 0.7, 1); t1.position.y = 0.04;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.8 })); cap.position.y = 0.12;
      hat.add(t1, cap);
    }
    hat.traverse((o) => { (o as THREE.Mesh).castShadow = true; }); head.add(hat);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const n in clips) this.actions[n] = this.mixer.clipAction(clips[n]);
    this.play('idle', 0);
  }

  get forward() { const y = this.root.rotation.y; return new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)); }
  get alive() { return this.act !== 'dead'; }

  private play(name: string, fade = 0.15, once = false, ts = 1, restart = false, at = 0) {
    const a = this.actions[name]; if (!a) return;
    a.timeScale = ts;
    if (this.cur === name && !restart) return;
    const prev = this.actions[this.cur];
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1); a.time = at;
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); a.play(); this.cur = name;
  }

  start(act: Act, dur = 0, combo = 0) {
    this.act = act; this.actT = 0; this.actSeq++; this.swingHit = false; this.queued = false; this.combo = combo; this.actDur = dur;
    this.animStart(0);
  }

  /** Picks the animation for the current action. `at` lets remote copies join mid-action. */
  animStart(at: number) {
    const a = this.act;
    if (a === 'light') { const c = clips['light' + this.combo]; this.play('light' + this.combo, 0.08, true, c.duration / T.light, true, at * c.duration / T.light); }
    else if (a === 'heavy') { const c = clips.heavy; this.play('heavy', 0.12, true, c.duration / T.heavy, true, at * c.duration / T.heavy); }
    else if (a === 'block') this.play('guard', 0.1, false, 0.05);
    else if (a === 'dodge') this.play('crouch_idle', 0.08, false, 1.2);
    else if (a === 'hit' || a === 'recoil') this.play('hit_reaction', 0.06, true, 2.4, true, 0.15);
    else if (a === 'stun') this.play('hit_reaction', 0.08, true, 1.1, true, 0.1);
    else if (a === 'dead') this.play(Math.random() < 0.5 ? 'dying_1' : 'dying_2', 0.1, true, 1.25, true);
  }

  reset(x: number, z: number, yaw: number) {
    this.hp = 100; this.st = 100; this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.target.set(x, 0, z); this.targetYaw = yaw;
    this.clearWounds(); this.act = 'idle'; this.actT = 0; this.actSeq++; this.cur = ''; this.play('idle', 0); this.model.rotation.z = 0; this.model.position.y = 0;
  }

  /** Local simulation for the player's own fighter or a bot. Returns nothing; hits are found after animation. */
  step(dt: number, cmd: { mx: number; my: number; light: boolean; heavy: boolean; block: boolean; dodge: boolean }, opp: Fighter | null) {
    this.actT += dt; const a = this.act;
    const busy = a === 'light' || a === 'heavy' || a === 'dodge';
    if (!busy && a !== 'block' && a !== 'dead') this.st = Math.min(100, this.st + 24 * dt);
    if (a === 'block') this.st = Math.min(100, this.st + 6 * dt);
    let sp = 0; this.move.set(cmd.mx, cmd.my); if (this.move.lengthSq() > 1) this.move.normalize();
    const free = a === 'idle' || a === 'block';
    const canDodge = free || (a === 'light' && this.actT > T.lightWin[1]) || a === 'recoil';
    if (a === 'dead') { this.move.set(0, 0); }
    else if (cmd.dodge && canDodge && this.st >= COST.dodge) {
      this.st -= COST.dodge; this.dodgeDir.copy(this.move.lengthSq() > 0.04 ? this.move.clone().normalize() : new THREE.Vector2(0, -1)); this.start('dodge', T.dodge);
    } else if (free && cmd.light && this.st >= COST.light) { this.st -= COST.light; this.start('light', T.light, 0); }
    else if (free && cmd.heavy && this.st >= COST.heavy) { this.st -= COST.heavy; this.start('heavy', T.heavy); }
    else if (a === 'idle' && cmd.block) { this.start('block'); }
    else if (a === 'block' && !cmd.block) { this.act = 'idle'; this.actSeq++; }
    else if (a === 'light') {
      if (cmd.light && this.actT > 0.18) this.queued = true;
      if (this.actT >= T.light) {
        if (this.queued && this.combo < 2 && this.st >= COST.light) { this.st -= COST.light; this.start('light', T.light, this.combo + 1); }
        else { this.act = 'idle'; this.actSeq++; }
      }
    } else if ((a === 'heavy' && this.actT >= T.heavy) || ((a === 'hit' || a === 'stun' || a === 'recoil') && this.actT >= this.actDur) || (a === 'dodge' && this.actT >= T.dodge)) { this.act = 'idle'; this.actSeq++; }

    // movement in fighter space (x right, y forward)
    const now = this.act; let lx = 0, ly = 0;
    if (now === 'idle') { sp = 2.5; lx = this.move.x; ly = this.move.y; }
    else if (now === 'block') { sp = 1.3; lx = this.move.x; ly = this.move.y; }
    else if (now === 'light' && this.actT > 0.06 && this.actT < 0.3) { sp = 1.7; ly = 1; }
    else if (now === 'heavy' && this.actT > 0.28 && this.actT < 0.6) { sp = 2.2; ly = 1; }
    else if (now === 'dodge') { sp = 8.5 * Math.max(0, 1 - this.actT / T.dodge); lx = this.dodgeDir.x; ly = this.dodgeDir.y; }
    else if (now === 'recoil' || now === 'stun' || now === 'hit') { sp = 1.2 * Math.max(0, 1 - this.actT / 0.3); ly = -1; }
    this.speed = sp * Math.hypot(lx, ly);
    // facing: lock on to the opponent
    if (opp) {
      const d = opp.root.position.clone().sub(this.root.position); const want = Math.atan2(-d.x, -d.z);
      const rate = now === 'idle' || now === 'block' ? 12 : now === 'light' ? 5 : now === 'heavy' ? (this.actT < 0.4 ? 4 : 1) : 0;
      let dy = want - this.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.root.rotation.y += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
    }
    const y = this.root.rotation.y, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    this.root.position.x += (fx * ly + rx * lx) * sp * dt; this.root.position.z += (fz * ly + rz * lx) * sp * dt;
    if (now === 'idle' || now === 'block') this.move.set(lx, ly); else this.move.set(0, 0);
  }

  /** Remote fighters ease toward the last network state. */
  follow(dt: number) {
    const k = 1 - Math.exp(-14 * dt);
    const before = this.root.position.clone();
    this.root.position.lerp(this.target, k);
    let dy = this.targetYaw - this.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.root.rotation.y += dy * k;
    this.actT += dt;
    const v = this.root.position.clone().sub(before).divideScalar(Math.max(dt, 1e-4));
    const y = this.root.rotation.y; const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    if (this.act === 'idle' || this.act === 'block') { this.move.set((v.x * rx + v.z * rz) / 2.5, (v.x * fx + v.z * fz) / 2.5); if (this.move.lengthSq() < 0.02) this.move.set(0, 0); if (this.move.lengthSq() > 1) this.move.normalize(); }
    else this.move.set(0, 0);
  }

  animate(dt: number) {
    const a = this.act;
    if (a === 'idle' || a === 'block') {
      const m = this.move, mag = m.length();
      if (a === 'block') { this.play('guard', 0.12, false, 0.05); }
      else if (mag > 0.15) { const back = m.y < -0.2; this.play('walking', 0.2, false, (back ? -1 : 1) * Math.max(0.7, mag * 1.35)); }
      else this.play('idle', 0.25);
      // face the walk direction a little when stepping sideways
      const want = mag > 0.15 ? THREE.MathUtils.clamp(Math.atan2(-m.x, Math.abs(m.y) + 0.001) * (m.y < -0.2 ? -1 : 1), -0.9, 0.9) : 0;
      this.animYaw += (want - this.animYaw) * Math.min(1, dt * 10);
    } else this.animYaw += (0 - this.animYaw) * Math.min(1, dt * 12);
    this.model.rotation.y = Math.PI + this.animYaw;
    // dodge: low, leaning into the direction of travel
    const dodging = a === 'dodge' ? Math.sin(Math.min(1, this.actT / T.dodge) * Math.PI) : 0;
    this.model.rotation.z = -this.dodgeDir.x * dodging * 0.45; this.model.rotation.x = -this.dodgeDir.y * dodging * 0.25;
    this.model.position.y = -dodging * 0.12;
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.blade.updateMatrixWorld(true);
    this.hiltW.set(0, 0.12, 0); this.blade.localToWorld(this.hiltW);
    this.tipW.set(0, swordLen * 0.92, 0); this.blade.localToWorld(this.tipW);
  }

  /** Active part of an attack? */
  get striking() {
    if (this.act === 'light') return this.actT >= T.lightWin[0] && this.actT <= T.lightWin[1];
    if (this.act === 'heavy') return this.actT >= T.heavyWin[0] && this.actT <= T.heavyWin[1];
    return false;
  }

  /** Blade segment against this fighter's body. */
  hitTest(a: THREE.Vector3, b: THREE.Vector3): { zone: Zone; bi: number; point: THREE.Vector3 } | null {
    if (!this.alive) return null;
    let best: { zone: Zone; bi: number; point: THREE.Vector3 } | null = null, bestD = 1e9;
    const p = new THREE.Vector3(), q = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
    HB.forEach(([, , r, zone], i) => {
      const [b0, b1] = this.bones[i]; b0.getWorldPosition(p); b1.getWorldPosition(q);
      const d = segSeg(a, b, p, q, c1, c2), m = d - r - 0.025;
      if (m < 0 && m < bestD) { bestD = m; const n = c1.clone().sub(c2); if (n.lengthSq() < 1e-6) n.copy(this.forward); n.normalize(); best = { zone, bi: i, point: c2.clone().addScaledVector(n, r * 0.9) }; }
    });
    return best;
  }

  /** A wound stays on the body part it was dealt to. */
  addWound(w: Wound) {
    this.wounds.push(w);
    const bone = this.bones[w.b][0]; const geo = new THREE.PlaneGeometry(1, 0.5);
    const m = new THREE.Mesh(geo, woundMat());
    const p = new THREE.Vector3(...w.p); bone.localToWorld(p);
    const axis = new THREE.Vector3(), q = new THREE.Vector3(); bone.getWorldPosition(axis); this.bones[w.b][1].getWorldPosition(q);
    const along = q.clone().sub(axis).normalize(); const t = THREE.MathUtils.clamp(p.clone().sub(axis).dot(along), 0, axis.distanceTo(q));
    const n = p.clone().sub(axis.clone().addScaledVector(along, t)).normalize();
    m.position.copy(p).addScaledVector(n, 0.012); m.lookAt(p.clone().add(n)); m.rotateZ(w.a);
    m.scale.set(w.s, w.s, w.s); this.root.parent?.add(m); bone.attach(m); this.woundMeshes.push(m);
  }
  clearWounds() { this.woundMeshes.forEach((m) => { m.parent?.remove(m); (m.material as THREE.Material).dispose(); }); this.woundMeshes = []; this.wounds = []; }
  woundWorld(w: Wound) { const p = new THREE.Vector3(...w.p); return this.bones[w.b][0].localToWorld(p); }
  boneLocal(bi: number, world: THREE.Vector3): [number, number, number] { const p = this.bones[bi][0].worldToLocal(world.clone()); return [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]; }
  chest() { return this.root.position.clone().setY(1.3); }
}
