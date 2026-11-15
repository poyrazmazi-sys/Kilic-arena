import * as THREE from 'three';

export type Kind = 'spear' | 'crossbow' | 'sniper' | 'captain';
const M = (c: number, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const mail = M(0x6a6c70, 0.45, 0.9), plate = M(0xa8acb0, 0.28, 1), skin = M(0xb08868, 0.7), wood = M(0x4a3420, 0.7), leather = M(0x3a2a1c, 0.8);
const tunics = [M(0x7a2a24), M(0x2a3a6a), M(0x6a5a30), M(0xc8c0b0)];
const red = M(0xa01c18);
const box = (w: number, h: number, d: number, m: THREE.Material, y = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y; b.castShadow = true; return b; };

export class Enemy {
  root = new THREE.Group(); body = new THREE.Group();
  private legL: THREE.Group; private legR: THREE.Group; private armL: THREE.Group; private armR: THREE.Group; private torso: THREE.Group;
  hp: number; maxHp: number; dead = false; deadT = 0; state: 'move' | 'windup' | 'recover' | 'aim' | 'stagger' = 'move'; stateT = 0;
  walk = Math.random() * 6; speed: number; reach: number; cooldown = 0.5 + Math.random(); static = false; strafe = Math.random() < 0.5 ? -1 : 1;
  fallDir = 1;

  constructor(public kind: Kind, pos: THREE.Vector3, diffHp: number) {
    const cap = kind === 'captain';
    const armor = cap ? plate : mail, tunic = cap ? plate : tunics[Math.floor(Math.random() * tunics.length)];
    this.torso = new THREE.Group(); this.torso.position.y = 0.95;
    this.torso.add(box(0.44, 0.58, 0.25, tunic, 0.3));
    if (!cap && tunic === tunics[3]) { const c1 = box(0.08, 0.5, 0.26, red, 0.3), c2 = box(0.45, 0.08, 0.26, red, 0.36); this.torso.add(c1, c2); } // Genoese cross of St George
    this.torso.add(box(0.46, 0.2, 0.27, armor, 0.52), box(0.46, 0.06, 0.27, leather, 0.02));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), skin); head.position.y = 0.74; head.castShadow = true;
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cap ? plate : mail); helm.position.y = 0.76; helm.castShadow = true;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.02, 14), cap ? plate : mail); brim.position.y = 0.775;
    this.torso.add(head, helm); if (kind !== 'captain' && Math.random() < 0.6) this.torso.add(brim);
    if (cap) { const visor = box(0.2, 0.12, 0.12, plate, 0.72); visor.position.z = -0.07; const plume = box(0.04, 0.22, 0.16, red, 0.98); this.torso.add(visor, plume); }
    const limb = (w: number, h: number, m: THREE.Material, x: number, y: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); g.add(box(w, h, w, m, -h / 2)); return g; };
    this.armL = limb(0.11, 0.6, armor, -0.28, 0.56); this.armR = limb(0.11, 0.6, armor, 0.28, 0.56);
    this.torso.add(this.armL, this.armR);
    this.legL = limb(0.14, 0.92, cap ? plate : leather, -0.11, 0.95); this.legR = limb(0.14, 0.92, cap ? plate : leather, 0.11, 0.95);
    this.body.add(this.torso, this.legL, this.legR);
    if (kind === 'spear') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.3, 6), wood); s.rotation.x = Math.PI / 2; s.position.set(0, -0.55, -0.6); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), plate); tip.rotation.x = -Math.PI / 2; tip.position.set(0, -0.55, -1.85); this.armR.add(s, tip);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), tunics[Math.floor(Math.random() * 3)]); sh.rotation.x = Math.PI / 2; sh.position.set(-0.02, -0.4, -0.12); this.armL.add(sh); }
    if (kind === 'captain') { const s = box(0.05, 1.15, 0.012, plate, -1.1); const gd = box(0.26, 0.03, 0.03, plate, -0.52); const grp = new THREE.Group(); grp.add(s, gd); grp.rotation.x = Math.PI / 2; grp.position.set(0, -0.55, 0.0); this.armR.add(grp); }
    if (kind === 'crossbow' || kind === 'sniper') { const st = box(0.05, 0.05, 0.7, wood); st.position.set(0, -0.5, -0.3); const bw = box(0.7, 0.03, 0.04, wood); bw.position.set(0, -0.5, -0.62); this.armR.add(st, bw); }
    this.root.add(this.body); this.root.position.copy(pos);
    const s = cap ? 1.18 : 0.96 + Math.random() * 0.1; this.body.scale.setScalar(s);
    this.maxHp = this.hp = (cap ? 700 : 100) * (cap ? diffHp : 1);
    this.speed = cap ? 2.3 : kind === 'spear' ? 2.9 + Math.random() * 0.5 : 2.2;
    this.reach = cap ? 2.5 : 2.5;
    this.static = kind === 'sniper';
  }

  /** Ray hit test. Returns distance and whether it was a head shot. */
  hitTest(ray: THREE.Ray, maxDist: number): { d: number; head: boolean } | null {
    if (this.dead) return null;
    const s = this.body.scale.x, p = this.root.position; let best: { d: number; head: boolean } | null = null;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (const [h, r, head] of [[0.35, 0.3, 0], [0.75, 0.32, 0], [1.2, 0.34, 0], [1.72, 0.19, 1]] as [number, number, number][]) {
      c.set(p.x, p.y + h * s, p.z); v.subVectors(c, ray.origin); const tca = v.dot(ray.direction); if (tca < 0 || tca > maxDist) continue;
      const d2 = v.lengthSq() - tca * tca; if (d2 > r * r * s * s) continue;
      if (!best || tca < best.d) best = { d: tca, head: !!head };
    }
    return best;
  }

  animate(dt: number, moving: boolean) {
    if (this.dead) {
      this.deadT += dt; const k = Math.min(1, this.deadT / 0.7), e = k * k;
      this.body.rotation.x = this.fallDir * e * (Math.PI / 2 - 0.08); this.body.position.y = e * 0.14;
      this.armL.rotation.x = -e * 1.2; this.armR.rotation.x = -e * 0.6; this.legL.rotation.x = e * 0.3;
      if (this.deadT > 9) this.root.position.y -= dt * 0.25;
      return;
    }
    if (moving) this.walk += dt * this.speed * 2.6;
    const sw = moving ? Math.sin(this.walk) * 0.6 : 0;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw; this.armL.rotation.x = -sw * 0.5 - 0.35;
    this.body.position.y = moving ? Math.abs(Math.cos(this.walk)) * 0.04 : 0;
    let armR = 0.25 + sw * 0.2, lean = moving ? 0.08 : 0;
    if (this.state === 'windup') { const k = this.stateT; armR = this.kind === 'captain' ? -2.2 * Math.min(1, k * 2.2) : 0.5 + k * 0.5; lean = -0.12; }
    if (this.state === 'recover') { const k = Math.min(1, this.stateT * 5); armR = this.kind === 'captain' ? -2.2 + k * 3.0 : 0.9 - k * 1.0; lean = 0.3 * (1 - this.stateT); this.body.position.z = this.kind === 'captain' ? 0 : -Math.sin(k * Math.PI) * 0.0; }
    if (this.state === 'aim') { armR = -1.45; this.armL.rotation.x = -1.3; lean = 0; }
    if (this.state === 'stagger') { lean = -0.35 * (1 - this.stateT / 0.45); }
    this.armR.rotation.x = armR; this.torso.rotation.x = lean;
  }
}
