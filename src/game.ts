import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import { World } from './world';
import { Enemy, Kind } from './enemies';
import { makeArquebus, makeKilic } from './weapons';
import { sfx, setMusic } from './audio';
import { t } from './i18n';

const $ = (id: string) => document.getElementById(id)!;
const DIFF = [{ count: 0.75, dmg: 0.55, hp: 0.8, aim: 1.5 }, { count: 1, dmg: 1, hp: 1, aim: 1 }, { count: 1.3, dmg: 1.4, hp: 1.35, aim: 0.75 }];
type Spawn = [Kind, 'N' | 'S' | 'W'];
const WAVES: Spawn[][] = [
  [['spear', 'S'], ['spear', 'N'], ['spear', 'S'], ['spear', 'N']],
  [['spear', 'N'], ['sniper', 'W'], ['spear', 'S'], ['crossbow', 'S'], ['spear', 'N'], ['spear', 'S'], ['crossbow', 'N'], ['spear', 'N']],
  [['spear', 'S'], ['spear', 'N'], ['sniper', 'W'], ['crossbow', 'N'], ['spear', 'S'], ['spear', 'N'], ['sniper', 'W'], ['crossbow', 'S'], ['spear', 'S'], ['spear', 'N'], ['crossbow', 'N'], ['spear', 'S']],
  [['captain', 'S'], ['spear', 'S'], ['spear', 'N'], ['sniper', 'W'], ['spear', 'N'], ['crossbow', 'S']],
];
const SNIPER_Z = [-13, 11, -3, 19];
const lerp = THREE.MathUtils.lerp, damp = (a: number, b: number, l: number, dt: number) => lerp(a, b, 1 - Math.exp(-l * dt));

interface Bolt { m: THREE.Mesh; v: THREE.Vector3; life: number; }

export class Game {
  state: 'menu' | 'intro' | 'fight' | 'between' | 'dead' | 'won' = 'menu';
  diff = Number(localStorage.getItem('j1453.diff') ?? 1);
  hp = 100; ammo = 24; loaded = true; reloading = false; reloadT = 0; weapon: 0 | 1 = 0; switchT = 1; pending: 0 | 1 = 0;
  wave = 0; stateT = 0; lastHurt = 0; time = 0;
  private enemies: Enemy[] = []; private queue: Spawn[] = []; private spawnT = 0; private sniperI = 0;
  private bolts: Bolt[] = [];
  private arq = makeArquebus(); private kil = makeKilic(); private vm = new THREE.Group();
  private recoil = 0; private aim = 0; private slashT = -1; private slashHit = false; private blocking = false; private fireHeld = false; private aimHeld = false;
  private flash = new THREE.PointLight(0xffb060, 0, 30, 2); private flashSprite: THREE.Sprite;
  private ray = new THREE.Raycaster(); private subT = 0; private bannerT = 0; private ramI = 0; private stepT = 0;
  private boltG = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5); private boltM = new THREE.MeshStandardMaterial({ color: 0x3a2a1c });

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private physics: RAPIER.World, private player: Player, private world: World, dom: HTMLElement) {
    this.boltG.rotateX(Math.PI / 2);
    this.vm.add(this.arq.group, this.kil.group); const fill = new THREE.PointLight(0xffd0a0, 0.5, 2.2, 1.5); fill.position.set(-0.3, 0.3, 0.2); this.vm.add(fill); camera.add(this.vm); scene.add(camera); scene.add(this.flash);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,170,60,0.8)'); gr.addColorStop(1, 'rgba(255,100,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const fm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }); fm.color.multiplyScalar(4);
    this.flashSprite = new THREE.Sprite(fm); this.flashSprite.visible = false; scene.add(this.flashSprite);
    dom.addEventListener('mousedown', (e) => { if (!player.locked) return; if (e.button === 0) { this.fireHeld = true; this.primary(); } if (e.button === 2) this.aimHeld = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.aimHeld = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this.startReload(); if (e.code === 'Digit1') this.switchTo(0); if (e.code === 'Digit2' || e.code === 'KeyQ') this.switchTo(this.weapon === 1 && e.code === 'KeyQ' ? 0 : 1);
    });
    addEventListener('wheel', () => { if (player.locked) this.switchTo(this.weapon ? 0 : 1); });
    this.kil.group.visible = false; this.hud();
  }

  // ---------- flow ----------
  start() { this.wave = 0; this.resetWave(); this.state = 'intro'; this.stateT = 0; this.banner(t('intro1'), t('hold'), 6); setMusic(true, 0); this.player.teleport(new THREE.Vector3(-5.5, 10.1, 0)); this.player.yaw = Math.PI / 2; }
  private resetWave() {
    this.enemies.forEach((e) => this.scene.remove(e.root)); this.enemies = []; this.bolts.forEach((b) => this.scene.remove(b.m)); this.bolts = [];
    this.hp = 100; this.ammo = Math.max(this.ammo, 16); this.loaded = true; this.reloading = false; this.queue = []; this.player.enabled = true;
  }
  private beginWave() {
    const d = DIFF[this.diff], src = WAVES[this.wave]; const n = Math.max(2, Math.round(src.length * d.count));
    this.queue = Array.from({ length: n }, (_, i) => src[i % src.length]); this.spawnT = 1; this.state = 'fight'; this.stateT = 0;
    const boss = this.wave === 3; this.banner(boss ? t('boss') : `${t('wave')} ${this.wave + 1}`, '', 4); setMusic(true, this.wave + 1);
    this.say(boss ? 's_capt' : this.wave === 1 ? 's_cross' : this.wave === 2 ? 's_allah' : 's_come');
  }
  revive() { if (this.state !== 'dead') return; this.resetWave(); $('death').style.opacity = '0'; this.state = 'between'; this.stateT = 3; }
  private banner(a: string, b: string, dur: number) { $('banner').innerHTML = `<div class="b1">${a}</div><div class="rule"></div><div class="b2">${b}</div>`; $('banner').style.opacity = '1'; this.bannerT = dur; }
  private say(k: string) { $('sub').textContent = t(k); $('sub').style.opacity = '1'; this.subT = 4.5; }

  // ---------- weapons ----------
  private switchTo(w: 0 | 1) { if (w === this.weapon && this.switchT >= 1) return; this.pending = w; if (this.switchT >= 1) this.switchT = 0; this.reloading = false; this.slashT = -1; }
  private startReload() { if (this.weapon !== 0 || this.loaded || this.reloading || this.ammo <= 0 || this.switchT < 1 || !this.player.enabled) return; this.reloading = true; this.reloadT = 0; this.ramI = 0; sfx.click(); }
  private primary() {
    if (this.state === 'menu' || this.state === 'won' || !this.player.enabled || this.switchT < 1) return;
    if (this.weapon === 1) { if (this.slashT < 0 && !this.blocking) { this.slashT = 0; this.slashHit = false; sfx.swing(); } return; }
    if (this.reloading) return;
    if (!this.loaded) { sfx.click(); this.startReload(); return; }
    this.loaded = false; this.recoil = 1; this.player.pitch += 0.045; this.player.shake = Math.max(this.player.shake, 0.55); sfx.shot();
    const cam = this.camera, spread = lerp(0.022, 0.004, this.aim);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.normalize();
    const origin = cam.position.clone(); const muzzle = this.arq.group.localToWorld(this.arq.muzzleLocal.clone());
    const hit = this.physics.castRay(new RAPIER.Ray(origin, dir), 400, true, undefined, undefined, undefined, this.player.body);
    let maxD = hit ? hit.timeOfImpact : 400; let target: Enemy | null = null, head = false; const r = new THREE.Ray(origin, dir);
    for (const e of this.enemies) { const h = e.hitTest(r, maxD); if (h) { maxD = h.d; target = e; head = h.head; } }
    const p = origin.clone().addScaledVector(dir, maxD);
    if (target) this.damageEnemy(target, target.kind === 'captain' ? (head ? 260 : 150) : 200, p, dir);
    else if (hit) for (let i = 0; i < 4; i++) this.world.puff(p, 0.4 + Math.random() * 0.4, 2 + Math.random() * 2, 0.6, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5), 0xb8a890);
    for (let i = 0; i < 14; i++) { const k = Math.random(); this.world.puff(muzzle.clone().addScaledVector(dir, k * 1.6), 0.5 + Math.random() * 0.7, 5 + Math.random() * 5, 0.75, dir.clone().multiplyScalar(1 + k * 5).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8)), 0xd8d0c4); }
    this.flash.position.copy(muzzle).addScaledVector(dir, 0.3); this.flash.intensity = 900; this.flashSprite.position.copy(muzzle).addScaledVector(dir, 0.25); this.flashSprite.scale.setScalar(1.1); this.flashSprite.visible = true;
  }
  private damageEnemy(e: Enemy, dmg: number, at: THREE.Vector3, dir: THREE.Vector3) {
    e.hp -= dmg; sfx.hit(); $('hitmark').style.opacity = '1';
    for (let i = 0; i < 3; i++) this.world.puff(at, 0.18 + Math.random() * 0.15, 0.45 + Math.random() * 0.3, 0.7, new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2).addScaledVector(dir, 0.8), 0x6a0c0c);
    if (e.hp <= 0) { e.dead = true; e.deadT = 0; const f = new THREE.Vector3(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, e.root.rotation.y); e.fallDir = f.dot(dir) > 0 ? -1 : 1; }
    else { e.state = 'stagger'; e.stateT = 0; }
  }
  private hurt(d: number, from: THREE.Vector3, melee: boolean) {
    if (this.state !== 'fight' && this.state !== 'between') return;
    if (melee && this.blocking) { const f = new THREE.Vector3(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.player.yaw); const to = from.clone().sub(this.camera.position).setY(0).normalize(); if (f.dot(to) > 0.3) { sfx.clang(); this.player.shake = 0.3; this.recoil = 0.5; return; } }
    this.hp -= d * DIFF[this.diff].dmg; this.lastHurt = this.time; sfx.hurt(); this.player.shake = Math.max(this.player.shake, 0.7); $('hurt').style.opacity = '0.9';
    if (this.hp <= 0) { this.hp = 0; this.state = 'dead'; this.player.enabled = false; $('death').style.opacity = '1'; $('deathText').textContent = t('dead'); setMusic(true, 0); }
  }

  // ---------- enemies ----------
  private spawn([kind, side]: Spawn) {
    let pos: THREE.Vector3;
    if (kind === 'sniper') pos = new THREE.Vector3(22.6, 13, SNIPER_Z[this.sniperI++ % 4]);
    else pos = new THREE.Vector3(0.2 + Math.random() * 1.2, 8, side === 'N' ? -49 : 49);
    const e = new Enemy(kind, pos, DIFF[this.diff].hp); (e as any).nav = 0; this.enemies.push(e); this.scene.add(e.root);
  }
  private stairY(z: number) { return 8 + THREE.MathUtils.clamp((9.3 - z) / 4.6, 0, 1) * 2; }
  private navTarget(e: Enemy, p: THREE.Vector3): THREE.Vector3 {
    const eUp = e.root.position.y > 9.6, pUp = p.y > 9.2, pos = e.root.position; const any = e as any;
    const A = new THREE.Vector3(0.6, 8, 10.3), B = new THREE.Vector3(-1.55, 8, 9.6), C = new THREE.Vector3(-1.55, 10, 4.3), D = new THREE.Vector3(-3.2, 10, 3.0);
    const near = (v: THREE.Vector3, r = 0.5) => Math.hypot(pos.x - v.x, pos.z - v.z) < r;
    if (eUp === pUp && any.nav !== 2 && any.nav !== 12) { any.nav = 0; const tg = p.clone(); if (!eUp) { tg.y = 8; if (pos.z < 10.5 && pos.z > -5.5) tg.x = Math.max(tg.x, 0.2); } return tg; }
    if (!eUp || any.nav === 2) { // climbing to the tower
      if (pUp || any.nav === 2) {
        if (any.nav === 0) { if (near(A, 0.8)) any.nav = 1; return A; }
        if (any.nav === 1) { if (near(B)) any.nav = 2; return B; }
        if (any.nav === 2) { if (near(C)) { any.nav = 3; } return C; }
        if (near(D, 0.8)) any.nav = 0; return D;
      }
    }
    // descending
    if (any.nav < 10) any.nav = 10;
    if (any.nav === 10) { if (near(D, 0.8)) any.nav = 11; return D; }
    if (any.nav === 11) { if (near(C)) any.nav = 12; return C; }
    if (any.nav === 12) { if (near(B)) any.nav = 13; return B; }
    if (near(A, 0.8)) any.nav = 0; return A;
  }
  private los(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from), len = d.length(); d.normalize();
    const h = this.physics.castRay(new RAPIER.Ray(from, d), len, true, undefined, undefined, undefined, this.player.body); return !h || h.timeOfImpact > len - 0.4;
  }
  private updateEnemies(dt: number) {
    const p = this.player.position, eye = this.camera.position, d = DIFF[this.diff];
    let alive = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { e.animate(dt, false); if (e.deadT > 13) { this.scene.remove(e.root); this.enemies.splice(i, 1); } continue; }
      alive++; e.stateT += dt; e.cooldown -= dt; const pos = e.root.position; let moving = false;
      const dx = p.x - pos.x, dz = p.z - pos.z, dist = Math.hypot(dx, dz), sameLevel = Math.abs(p.y - pos.y) < 1.2;
      const ranged = e.kind === 'crossbow' || e.kind === 'sniper'; const chest = pos.clone().setY(pos.y + 1.35);
      let face = Math.atan2(-dx, -dz);
      if (e.state === 'stagger') { if (e.stateT > 0.45) { e.state = 'move'; e.stateT = 0; } }
      else if (e.state === 'windup') { if (e.stateT > (e.kind === 'captain' ? 0.75 : 0.55)) { if (dist < e.reach + 0.5 && sameLevel) this.hurt(e.kind === 'captain' ? 34 : 19, pos, true); sfx.swing(); e.state = 'recover'; e.stateT = 0; } }
      else if (e.state === 'recover') { if (e.stateT > 0.7) { e.state = 'move'; e.stateT = 0; e.cooldown = 0.5 + Math.random() * 0.6; } }
      else if (e.state === 'aim') {
        if (e.stateT > (e.kind === 'sniper' ? 1.9 : 1.5) * d.aim) {
          const lead = eye.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.6 - 0.15, (Math.random() - 0.5)).multiplyScalar(0.02 * chest.distanceTo(eye) * d.aim));
          const v = lead.sub(chest).normalize(); const m = new THREE.Mesh(this.boltG, this.boltM); m.position.copy(chest); m.lookAt(chest.clone().add(v)); this.scene.add(m);
          this.bolts.push({ m, v: v.multiplyScalar(46), life: 3 }); sfx.twang(); e.state = 'move'; e.stateT = 0; e.cooldown = (e.kind === 'sniper' ? 4.5 : 3.6) + Math.random() * 1.5;
        }
      } else { // move
        if (ranged) {
          const see = this.los(chest, eye);
          if (see && e.cooldown <= 0 && (e.static || dist < 26)) { e.state = 'aim'; e.stateT = 0; }
          else if (!e.static && (!see || dist > 20)) moving = true;
        } else if (dist < e.reach && sameLevel) { if (e.cooldown <= 0) { e.state = 'windup'; e.stateT = 0; } }
        else moving = true;
        if (moving) {
          const tg = this.navTarget(e, p); const mx = tg.x - pos.x, mz = tg.z - pos.z, ml = Math.hypot(mx, mz) || 1; const sp = e.speed * dt;
          pos.x += (mx / ml) * sp; pos.z += (mz / ml) * sp; face = Math.atan2(-mx, -mz);
          const nav = (e as any).nav; pos.y = (nav === 2 || nav === 12) ? this.stairY(pos.z) : nav === 3 || nav === 10 || nav === 11 ? 10 : (nav === 0 ? (pos.y > 9.6 ? 10 : 8) : 8);
        }
      }
      for (const o of this.enemies) if (o !== e && !o.dead) { const ox = pos.x - o.root.position.x, oz = pos.z - o.root.position.z, od = Math.hypot(ox, oz); if (od < 0.85 && od > 0.001) { pos.x += (ox / od) * (0.85 - od) * 0.5; pos.z += (oz / od) * (0.85 - od) * 0.5; } }
      let dy = face - e.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.root.rotation.y += dy * Math.min(1, dt * 8);
      e.animate(dt, moving);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.life -= dt; const step = b.v.clone().multiplyScalar(dt), len = step.length();
      const h = this.physics.castRay(new RAPIER.Ray(b.m.position, step.clone().normalize()), len, true, undefined, undefined, undefined, this.player.body);
      const toEye = eye.clone().sub(b.m.position); const along = THREE.MathUtils.clamp(toEye.dot(step) / (len * len), 0, 1);
      const closest = b.m.position.clone().addScaledVector(step, along); const body = closest.clone(); body.y = THREE.MathUtils.clamp(body.y, p.y + 0.2, eye.y + 0.1);
      const hitP = Math.hypot(closest.x - eye.x, closest.z - eye.z) < 0.4 && closest.y > p.y && closest.y < eye.y + 0.25;
      if (hitP) { this.hurt(24, b.m.position, false); this.scene.remove(b.m); this.bolts.splice(i, 1); continue; }
      if (closest.distanceTo(eye) < 1.6 && along > 0 && along < 1) sfx.whiz();
      if (h || b.life < 0) { this.scene.remove(b.m); this.bolts.splice(i, 1); continue; }
      b.m.position.add(step); b.v.y -= 4 * dt;
    }
    // spawning
    if (this.state === 'fight') {
      this.spawnT -= dt;
      if (this.queue.length && alive < 6 && this.spawnT <= 0) { this.spawn(this.queue.shift()!); this.spawnT = 1.8 + Math.random() * 1.5; }
      if (!this.queue.length && alive === 0) {
        this.wave++; this.state = this.wave >= WAVES.length ? 'won' : 'between'; this.stateT = 0; setMusic(true, 0); localStorage.setItem('j1453.wave', String(this.wave));
        if (this.state === 'won') { this.player.enabled = false; $('win').style.opacity = '1'; $('win').style.pointerEvents = 'auto'; $('winText').innerHTML = `<h1>${t('win1')}</h1><div class="rule"></div><p>${t('win2')}</p><p class="small">${t('again')}</p>`; document.exitPointerLock(); }
        else { this.ammo = Math.min(30, this.ammo + 10); if (this.wave === 2) setTimeout(() => { this.say('s_gun'); this.banner(t('bombard'), '', 4); setTimeout(() => this.world.fire(), 1500); }, 1500); }
      }
    }
  }

  // ---------- per frame ----------
  update(dt: number) {
    this.time += dt; this.stateT += dt;
    if (this.state === 'intro' && this.stateT > 9) { this.beginWave(); }
    if (this.state === 'between' && this.stateT > (this.wave === 2 ? 9 : 6)) this.beginWave();
    if (this.state !== 'menu') this.updateEnemies(dt);
    if (this.hp > 0 && this.hp < 100 && this.time - this.lastHurt > 6) this.hp = Math.min(this.diff === 2 ? 60 : 100, this.hp + 9 * dt);

    // weapon logic
    if (this.switchT < 1) { const before = this.switchT; this.switchT = Math.min(1, this.switchT + dt / 0.4); if (before < 0.5 && this.switchT >= 0.5) { this.weapon = this.pending; this.arq.group.visible = this.weapon === 0; this.kil.group.visible = this.weapon === 1; } }
    this.blocking = this.weapon === 1 && this.aimHeld && this.slashT < 0 && this.switchT >= 1;
    const wantAim = this.weapon === 0 && this.aimHeld && !this.reloading; this.aim = damp(this.aim, wantAim ? 1 : 0, 12, dt);
    this.player.speedMul = this.reloading ? 0.55 : this.aim > 0.5 || this.blocking ? 0.6 : 1; this.player.sens = lerp(1, 0.6, this.aim);
    const fov = lerp(72, 50, this.aim); if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (this.reloading) {
      this.reloadT += dt; const k = this.reloadT / 6.5;
      const ramStage = Math.floor((k - 0.3) / 0.1); if (k > 0.3 && k < 0.7 && ramStage > this.ramI) { this.ramI = ramStage; sfx.ram(); }
      if (k >= 1) { this.reloading = false; this.loaded = true; this.ammo--; sfx.click(); }
    }
    if (this.slashT >= 0) {
      this.slashT += dt;
      if (!this.slashHit && this.slashT > 0.16) { this.slashHit = true; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        for (const e of this.enemies) { if (e.dead) continue; const to = e.root.position.clone().setY(e.root.position.y + 1.2).sub(this.camera.position); const dd = to.length(); if (dd < 2.7 && to.normalize().dot(f) > 0.45) this.damageEnemy(e, e.kind === 'captain' ? 55 : 70, e.root.position.clone().setY(e.root.position.y + 1.3), f); } }
      if (this.slashT > 0.5) { this.slashT = -1; if (this.fireHeld) this.primary(); }
    }
    this.recoil = damp(this.recoil, 0, 7, dt);
    this.flash.intensity = damp(this.flash.intensity, 0, 30, dt); if (this.flash.intensity < 20) this.flashSprite.visible = false;

    // view model pose
    const sw = Math.sin(this.switchT * Math.PI), tt = this.time; const a = this.arq.group, s = this.kil.group;
    const bobX = Math.sin(tt * 1.3) * 0.004, bobY = Math.sin(tt * 1.9) * 0.004 - sw * 0.35;
    if (this.weapon === 0) {
      const rk = this.reloading ? Math.min(1, this.reloadT / 0.6) * Math.min(1, (6.5 - this.reloadT) / 0.6) : 0, e = rk * rk * (3 - 2 * rk);
      a.position.set(lerp(lerp(0.17, 0, this.aim), 0.06, e) + bobX, lerp(lerp(-0.15, -0.062, this.aim), -0.3, e) + bobY, lerp(-0.52, -0.42, this.aim) + this.recoil * 0.13 - e * 0.05);
      a.rotation.set(this.recoil * 0.22 + e * 1.05, lerp(0.05, 0, this.aim) + e * 0.45, -e * 0.35);
      const k = this.reloadT / 6.5; let lz = -0.22, ly = -0.065;
      if (this.reloading && k > 0.12 && k < 0.88) { lz = k < 0.3 ? -0.8 : k < 0.7 ? -0.62 - Math.abs(Math.sin((k - 0.3) / 0.1 * Math.PI)) * 0.28 : lerp(-0.6, 0.12, (k - 0.7) / 0.18); ly = 0.03; }
      this.arq.left.position.z = damp(this.arq.left.position.z, lz, 14, dt); this.arq.left.position.y = damp(this.arq.left.position.y, ly, 14, dt);
      this.arq.serp.rotation.x = this.loaded ? 0 : 0.9;
    } else {
      let px = 0.3, py = -0.3, pz = -0.5, rx = -0.5, ry = 0.2, rz = -0.35;
      if (this.blocking) { px = 0.12; py = -0.2; pz = -0.42; rx = -0.1; ry = 0.1; rz = 1.15; }
      if (this.slashT >= 0) { const k = Math.min(1, this.slashT / 0.32), e = Math.sin(k * Math.PI * 0.5); px = lerp(0.42, -0.25, e); py = lerp(-0.05, -0.32, e); pz = -0.5 - Math.sin(k * Math.PI) * 0.15; rx = lerp(0.3, -1.5, e); ry = lerp(-0.4, 0.9, e); rz = lerp(-1.0, 0.9, e); }
      const l = this.slashT >= 0 ? 40 : 14;
      s.position.set(damp(s.position.x, px + bobX, l, dt), damp(s.position.y, py + bobY - this.recoil * 0.05, l, dt), damp(s.position.z, pz, l, dt));
      s.rotation.set(damp(s.rotation.x, rx, l, dt), damp(s.rotation.y, ry, l, dt), damp(s.rotation.z, rz, l, dt));
    }
    this.hud(dt);
  }

  private hud(dt = 0) {
    ($('hp').firstElementChild as HTMLElement).style.width = `${this.hp}%`;
    $('ammo').innerHTML = this.weapon === 0 ? `<b>${this.loaded ? 1 : 0}</b><span> / ${this.ammo}</span>` : '<b>Kılıç</b>';
    const rl = $('reload'); rl.style.opacity = this.reloading ? '1' : '0'; if (this.reloading) { (rl.firstElementChild as HTMLElement).style.width = `${(this.reloadT / 6.5) * 100}%`; rl.dataset.label = t('loading'); }
    const deg = ((-THREE.MathUtils.radToDeg(this.player.yaw)) % 360 + 360) % 360; ($('compass').firstElementChild as HTMLElement).style.transform = `translateX(${-deg * 2 - 720 + 90}px)`;
    $('cross').style.opacity = this.weapon === 0 && this.aim < 0.5 && !this.reloading ? '0.7' : this.weapon === 1 ? '0.35' : '0';
    for (const id of ['hurt', 'hitmark']) { const el = $(id); const o = Number(el.style.opacity || 0); if (o > 0) el.style.opacity = String(Math.max(0, o - dt * (id === 'hurt' ? 1.2 : 5))); }
    if (this.hp < 35 && this.hp > 0) $('hurt').style.opacity = String(Math.max(Number($('hurt').style.opacity), 0.35 + Math.sin(this.time * 5) * 0.1));
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').style.opacity = '0'; }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('sub').style.opacity = '0'; }
    if (!this.loaded && !this.reloading && this.weapon === 0 && this.state === 'fight' && this.subT <= 0 && this.ammo > 0 && Math.random() < dt * 0.15) this.say('s_reload');
  }
}
