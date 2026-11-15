import * as THREE from 'three';
import { Phys } from './phys';

export class Player {
  yaw = Math.PI / 2; pitch = -0.05; enabled = true; speedMul = 1; sens = 1;
  private keys = new Set<string>(); private feet = new THREE.Vector3();
  private jumpHeld = false; private airJumps = 1;
  private vy = 0; private grounded = false; private bob = 0;
  shake = 0; locked = false; noLock = false;
  stick = new THREE.Vector2(); jumpQueued = false; // touch input
  third = true; moveSpeed = 0; eye = new THREE.Vector3();

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
    const speed = (sprint ? 11 : 7) * this.speedMul * (this.enabled ? 1 : 0);
    const dir = new THREE.Vector3(s, 0, -f); if (dir.lengthSq() > 1) dir.normalize();
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    const jump = (k.has('Space') || this.jumpQueued) && this.enabled, pressed = jump && !this.jumpHeld; this.jumpHeld = jump;
    if (this.grounded) { this.vy = -2; this.airJumps = 1; if (pressed) this.vy = 6.2; } else { this.vy -= 15 * dt; if (pressed && this.airJumps > 0) { this.airJumps--; this.vy = 6.2; } }
    this.jumpQueued = false;
    const res = this.phys.move(this.feet, 0.32, 1.75, new THREE.Vector3(dir.x * speed * dt, this.vy * dt, dir.z * speed * dt), this.grounded);
    this.grounded = res.grounded; if (res.ceiling) this.vy = 0;
    const moving = this.grounded && dir.lengthSq() > 0.01 && speed > 0; this.moveSpeed = dir.lengthSq() > 0.01 ? speed : 0;
    this.bob += moving ? dt * (sprint ? 11 : 7.5) : 0;
    const amp = moving ? (sprint ? 0.045 : 0.028) : 0;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake, t = this.feet;
    this.eye.set(t.x, t.y + 1.65, t.z);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.03, this.yaw + (this.third ? 0 : Math.cos(this.bob) * amp * 0.12), (Math.random() - 0.5) * sh * 0.03, 'YXZ');
    if (this.third) {
      const back = new THREE.Vector3(0.55, 0.25, 3.4).applyEuler(this.camera.rotation); const len = back.length(); back.normalize();
      const hit = this.phys.ray(this.eye, back, len + 0.3); const d = hit ? Math.max(0.4, hit.timeOfImpact - 0.3) : len;
      this.camera.position.copy(this.eye).addScaledVector(back, d);
    } else this.camera.position.set(t.x + (Math.random() - 0.5) * sh * 0.25, t.y + 1.65 + Math.sin(this.bob * 2) * amp + (Math.random() - 0.5) * sh * 0.25, t.z);
    if (t.y < -3.6) this.teleport(new THREE.Vector3(-12, 1.4, t.z)); // climbed out of the moat
  }
}
