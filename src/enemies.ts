import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fetchBin } from './bin';

export type Kind = 'spear' | 'crossbow' | 'sniper' | 'captain';
const M = (c: number, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const plate = M(0xa8acb0, 0.28, 1), wood = M(0x4a3420, 0.7);
const box = (w: number, h: number, d: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.castShadow = true; return b; };

let proto: THREE.Object3D, clips: Record<string, THREE.AnimationClip> = {}, baseScale = 1;
const tints = [0xffffff, 0xe0d0c4, 0xc8d0e0, 0xd8d8c0], tintMats = new Map<string, THREE.Material>();

/** Loads the Mixamo knight (mesh, skeleton and all animation clips). Call once before spawning enemies. */
export async function loadKnight() {
  const gltf = await new GLTFLoader().parseAsync(await fetchBin(`${import.meta.env.BASE_URL}models/knight.json`), '');
  proto = gltf.scene;
  proto.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; (m.material as THREE.MeshStandardMaterial).envMapIntensity = 1; } });
  proto.updateMatrixWorld(true); const wy = (n: string) => proto.getObjectByName(n)?.getWorldPosition(new THREE.Vector3()).y ?? 0;
  const h = wy('mixamorigHeadTop_End') - Math.min(wy('mixamorigLeftToeBase'), wy('mixamorigLeftFoot')); baseScale = h > 0.1 ? 1.8 / (h + 0.06) : 1; console.log('knight height', h.toFixed(2), 'scale', baseScale.toFixed(2));
  for (const c of gltf.animations) {
    if (!c.name.startsWith('dying')) for (const tr of c.tracks) if (/Hips\.position$/.test(tr.name)) { const v = tr.values; for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }
    clips[c.name] = c;
  }
}

export class Enemy {
  root = new THREE.Group(); body = new THREE.Group();
  private mixer: THREE.AnimationMixer; private actions: Record<string, THREE.AnimationAction> = {}; private cur = ''; private lastState = '';
  hp: number; maxHp: number; dead = false; deadT = 0; state: 'move' | 'windup' | 'recover' | 'aim' | 'stagger' = 'move'; stateT = 0;
  walk = 0; speed: number; reach = 2.5; cooldown = 0.5 + Math.random(); static = false; strafe = 1; fallDir = 1;

  constructor(public kind: Kind, pos: THREE.Vector3, diffHp: number) {
    const cap = kind === 'captain';
    const model = cloneSkinned(proto); model.rotation.y = Math.PI;
    const tint = cap ? 0xe8c070 : tints[Math.floor(Math.random() * tints.length)];
    model.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial, key = src.uuid + tint;
      if (!tintMats.has(key)) { const c = src.clone(); c.color.set(tint); tintMats.set(key, c); }
      m.material = tintMats.get(key)!;
    });
    const s = baseScale * (cap ? 1.16 : 0.97 + Math.random() * 0.08); this.body.scale.setScalar(s); this.body.add(model);
    this.root.add(this.body); this.root.position.copy(pos);
    // weapon in the right hand (bone space is in centimetres)
    const hand = model.getObjectByName('mixamorigRightHand');
    if (hand) {
      const w = new THREE.Group(); w.scale.setScalar(100 / baseScale * 1); w.position.set(0, 9, 3);
      if (kind === 'spear') { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.3, 6), wood); sh.rotation.x = Math.PI / 2; sh.position.z = 0.35; const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 6), plate); tip.rotation.x = Math.PI / 2; tip.position.z = 1.6; sh.castShadow = true; w.add(sh, tip); }
      else if (cap) { const bl = box(0.012, 0.05, 1.1, plate); bl.position.z = 0.62; const gd = box(0.03, 0.24, 0.03, plate); gd.position.z = 0.08; w.add(bl, gd); }
      else { const st = box(0.05, 0.05, 0.7, wood); st.position.z = 0.2; const bw = box(0.03, 0.7, 0.04, wood); bw.position.z = 0.5; w.add(st, bw); }
      hand.add(w);
    }
    this.mixer = new THREE.AnimationMixer(model);
    for (const n in clips) this.actions[n] = this.mixer.clipAction(clips[n]);
    this.maxHp = this.hp = cap ? 500 * diffHp : 100;
    this.speed = cap ? 2.8 : kind === 'spear' ? 3.5 + Math.random() * 0.6 : 2.6;
    this.static = kind === 'sniper';
    this.play('idle', 0); this.mixer.update(Math.random());
  }

  private play(name: string, fade = 0.18, once = false, timeScale = 1, restart = false) {
    const a = this.actions[name]; if (!a) return;
    a.timeScale = timeScale;
    if (this.cur === name && !restart) return;
    const prev = this.actions[this.cur];
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); a.play(); this.cur = name;
  }

  /** Ray hit test. Returns distance and whether it was a head shot. */
  hitTest(ray: THREE.Ray, maxDist: number): { d: number; head: boolean } | null {
    if (this.dead) return null;
    const s = this.body.scale.x / baseScale, p = this.root.position; let best: { d: number; head: boolean } | null = null;
    const c = new THREE.Vector3(), v = new THREE.Vector3(), crouch = this.cur === 'crouch_idle' ? 0.62 : 1;
    for (const [h, r, head] of [[0.35, 0.3, 0], [0.75, 0.32, 0], [1.2, 0.34, 0], [1.68, 0.2, 1]] as [number, number, number][]) {
      c.set(p.x, p.y + h * s * crouch, p.z); v.subVectors(c, ray.origin); const tca = v.dot(ray.direction); if (tca < 0 || tca > maxDist) continue;
      const d2 = v.lengthSq() - tca * tca; if (d2 > r * r * s * s) continue;
      if (!best || tca < best.d) best = { d: tca, head: !!head };
    }
    return best;
  }

  animate(dt: number, moving: boolean) {
    if (this.dead) {
      if (this.lastState !== 'dead') { this.lastState = 'dead'; this.play(Math.random() < 0.5 ? 'dying_1' : 'dying_2', 0.12, true, 1.5, true); }
      this.deadT += dt; if (this.deadT > 9) this.root.position.y -= dt * 0.25;
      this.mixer.update(dt); return;
    }
    const entered = this.state !== this.lastState; this.lastState = this.state;
    if (this.state === 'stagger') this.play('hit_reaction', 0.08, true, 2.6, entered);
    else if (this.state === 'windup') this.play('sword_slash', 0.12, true, (clips.sword_slash?.duration ?? 3.5) / (this.kind === 'captain' ? 1.9 : 1.6), entered);
    else if (this.state === 'recover') { /* slash keeps playing */ }
    else if (this.state === 'aim') this.play('rifle_aim_idle', 0.25);
    else if (moving) { if (this.speed > 3.2) this.play('running', 0.2, false, this.speed / 4.6); else this.play('walking', 0.2, false, this.speed / 1.7); }
    else this.play(this.static ? 'crouch_idle' : 'idle', 0.3);
    this.mixer.update(dt);
  }
}
