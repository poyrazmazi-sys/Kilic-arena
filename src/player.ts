import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class Player {
  yaw = Math.PI / 2; pitch = -0.05;
  private keys = new Set<string>();
  private body: RAPIER.RigidBody; private col: RAPIER.Collider; private cc: RAPIER.KinematicCharacterController;
  private vy = 0; private grounded = false; private bob = 0;
  shake = 0;
  locked = false;

  constructor(private world: RAPIER.World, public camera: THREE.PerspectiveCamera, dom: HTMLElement, start: THREE.Vector3) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + 0.9, start.z));
    this.col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.35), this.body);
    this.cc = world.createCharacterController(0.02);
    this.cc.enableAutostep(0.4, 0.2, true); this.cc.enableSnapToGround(0.4); this.cc.setMaxSlopeClimbAngle(Math.PI / 3.5);
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
  }

  get position() { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y - 0.85, t.z); }
  teleport(p: THREE.Vector3) { this.body.setTranslation({ x: p.x, y: p.y + 0.9, z: p.z }, true); this.vy = 0; }

  update(dt: number) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? 6.2 : 3.6;
    const dir = new THREE.Vector3(s, 0, -f); if (dir.lengthSq() > 0) dir.normalize();
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
    if (this.grounded) { this.vy = -1; if (k.has('Space')) this.vy = 4.6; } else this.vy -= 13 * dt;
    this.cc.computeColliderMovement(this.col, { x: dir.x * speed * dt, y: this.vy * dt, z: dir.z * speed * dt });
    const m = this.cc.computedMovement(); this.grounded = this.cc.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    const moving = this.grounded && (m.x * m.x + m.z * m.z) > 1e-6;
    this.bob += moving ? dt * (sprint ? 11 : 7.5) : 0;
    const amp = moving ? (sprint ? 0.045 : 0.028) : 0;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    this.camera.position.set(t.x + m.x + (Math.random() - 0.5) * sh * 0.25, t.y + m.y + 0.8 + Math.sin(this.bob * 2) * amp + (Math.random() - 0.5) * sh * 0.25, t.z + m.z);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.03, this.yaw + Math.cos(this.bob) * amp * 0.12, (Math.random() - 0.5) * sh * 0.03, 'YXZ');
    if (t.y < -30) this.teleport(new THREE.Vector3(-5.5, 10.2, 0));
  }
}
