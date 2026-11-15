import * as THREE from 'three';
import { Phys } from './phys';

export class Player {
  yaw = Math.PI / 2; pitch = -0.05; enabled = true; speedMul = 1; sens = 1;
  private keys = new Set<string>(); private feet = new THREE.Vector3();
  private vy = 0; private grounded = false; private bob = 0;
  shake = 0; locked = false; noLock = false;
  stick = new THREE.Vector2(); jumpQueued = false; // touch input

  constructor(private phys: Phys, public camera: THREE.PerspectiveCamera, private dom: HTMLElement, start: THREE.Vector3) {
    this.feet.copy(start);
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousemove', (e) => { if (this.locked) this.look(e.movementX, e.movementY); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener('pointerlockerror', () => { this.noLock = true; });
  }
  requestLock() { try { const p = (this.dom as any).requestPointerLock?.(); if (p?.catch) p.catch(() => { this.noLock = true; }); if (!(this.dom as any).requestPointerLock) this.noLock = true; } catch { this.noLock = true; } }
  look(dx: number, dy: number) { this.yaw -= dx * 0.0022 * this.sens; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022 * this.sens)); }
  get active() { return this.locked || this.noLock; }
  get position() { return this.feet.clone(); }
  teleport(p: THREE.Vector3) { this.feet.copy(p); this.vy = 0; }

  update(dt: number) {
    const k = this.keys;
    const lx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0), ly = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    if (lx || ly) this.look(lx * 900 * dt, ly * 600 * dt);
    let f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) - this.stick.y, s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.stick.x;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.length() > 0.92;
    const speed = (sprint ? 7.8 : 4.7) * this.speedMul * (this.enabled ? 1 : 0);
    const dir = new THREE.Vector3(s, 0, -f); if (dir.lengthSq() > 1) dir.normalize();
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    if (this.grounded) { this.vy = -2; if ((k.has('Space') || this.jumpQueued) && this.enabled) this.vy = 4.8; } else this.vy -= 13 * dt;
    this.jumpQueued = false;
    const res = this.phys.move(this.feet, 0.32, 1.75, new THREE.Vector3(dir.x * speed * dt, this.vy * dt, dir.z * speed * dt), this.grounded);
    this.grounded = res.grounded; if (res.ceiling) this.vy = 0;
    const moving = this.grounded && dir.lengthSq() > 0.01 && speed > 0;
    this.bob += moving ? dt * (sprint ? 11 : 7.5) : 0;
    const amp = moving ? (sprint ? 0.045 : 0.028) : 0;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake, t = this.feet;
    this.camera.position.set(t.x + (Math.random() - 0.5) * sh * 0.25, t.y + 1.65 + Math.sin(this.bob * 2) * amp + (Math.random() - 0.5) * sh * 0.25, t.z);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.03, this.yaw + Math.cos(this.bob) * amp * 0.12, (Math.random() - 0.5) * sh * 0.03, 'YXZ');
    if (t.y < 7.2) this.teleport(new THREE.Vector3(0.5, 8.15, THREE.MathUtils.clamp(t.z, -45, 45))); // fell off the wall: put back on the walkway
  }
}
