import * as THREE from 'three';

/** Blood droplets that fall and leave stains on the sand, plus sparks for blocked blows. */
export class Fx {
  private drops: { v: THREE.Vector3; p: THREE.Vector3; life: number }[] = []; private dropMesh: THREE.InstancedMesh;
  private stains: THREE.Mesh[] = []; private stainTex: THREE.Texture; private sp: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private sparkPts: THREE.Points; private sparkPos = new Float32Array(240 * 3); private d = new THREE.Object3D(); private mist: THREE.Sprite[] = []; private mistMat: THREE.SpriteMaterial;

  constructor(private scene: THREE.Scene) {
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 5, 4), new THREE.MeshStandardMaterial({ color: 0x3a0303, roughness: 0.25 }), 400);
    this.dropMesh.count = 0; this.dropMesh.frustumCulled = false; scene.add(this.dropMesh);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    for (let i = 0; i < 26; i++) { const r = i === 0 ? 26 : 3 + Math.random() * 9, a = Math.random() * 7, dist = i === 0 ? 0 : 18 + Math.random() * 40; g.fillStyle = `rgba(${70 + Math.random() * 40},4,4,${0.7 + Math.random() * 0.3})`; g.beginPath(); g.ellipse(64 + Math.cos(a) * dist, 64 + Math.sin(a) * dist, r, r * (0.6 + Math.random() * 0.5), a, 0, 7); g.fill(); }
    this.stainTex = new THREE.CanvasTexture(c); this.stainTex.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3)); sg.setDrawRange(0, 0);
    const sm = new THREE.PointsMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(4), size: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.sparkPts = new THREE.Points(sg, sm); this.sparkPts.frustumCulled = false; scene.add(this.sparkPts);
    const mc = document.createElement('canvas'); mc.width = mc.height = 64; const mg = mc.getContext('2d')!; const gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(150,10,10,0.8)'); gr.addColorStop(1, 'rgba(120,0,0,0)'); mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64);
    this.mistMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false });
  }

  blood(p: THREE.Vector3, dir: THREE.Vector3, amount: number) {
    for (let i = 0; i < amount; i++) {
      const v = dir.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 2.2, (Math.random() - 0.5) * 2.2));
      if (this.drops.length < 400) this.drops.push({ p: p.clone(), v, life: 2 });
    }
    const s = new THREE.Sprite(this.mistMat.clone()); s.position.copy(p); s.scale.setScalar(0.25); (s as any).life = 0; this.scene.add(s); this.mist.push(s);
  }
  sparks(p: THREE.Vector3, n = 26) { for (let i = 0; i < n; i++) if (this.sp.length < 240) this.sp.push({ p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7), life: 0.25 + Math.random() * 0.3 }); }
  private stain(x: number, z: number, s: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshStandardMaterial({ map: this.stainTex, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); m.position.set(x, 0.006, z); this.scene.add(m); this.stains.push(m);
    if (this.stains.length > 70) { const o = this.stains.shift()!; this.scene.remove(o); (o.material as THREE.Material).dispose(); }
  }
  clearStains() { this.stains.forEach((o) => { this.scene.remove(o); (o.material as THREE.Material).dispose(); }); this.stains = []; }

  update(dt: number) {
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); d.life -= dt;
      if (d.p.y <= 0.01 || d.life <= 0) { if (d.p.y <= 0.02 && Math.random() < 0.35) this.stain(d.p.x, d.p.z, 0.08 + Math.random() * 0.22); this.drops.splice(i, 1); continue; }
    }
    for (const d of this.drops) { this.d.position.copy(d.p); this.d.scale.set(1, 1 + d.v.length() * 0.25, 1); this.d.lookAt(d.p.clone().add(d.v)); this.d.updateMatrix(); this.dropMesh.setMatrixAt(n++, this.d.matrix); }
    this.dropMesh.count = n; this.dropMesh.instanceMatrix.needsUpdate = true;
    let k = 0;
    for (let i = this.sp.length - 1; i >= 0; i--) { const s = this.sp[i]; s.life -= dt; if (s.life <= 0) { this.sp.splice(i, 1); continue; } s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt); }
    for (const s of this.sp) { this.sparkPos.set([s.p.x, s.p.y, s.p.z], k * 3); k++; }
    (this.sparkPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.sparkPts.geometry.setDrawRange(0, k);
    for (let i = this.mist.length - 1; i >= 0; i--) { const m = this.mist[i] as THREE.Sprite & { life: number }; m.life += dt; m.scale.setScalar(0.25 + m.life * 1.2); m.material.opacity = Math.max(0, 0.8 - m.life * 1.6); if (m.life > 0.5) { this.scene.remove(m); m.material.dispose(); this.mist.splice(i, 1); } }
  }
}
