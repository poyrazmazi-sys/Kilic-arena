import * as THREE from 'three';

const B = import.meta.env.BASE_URL;
const tl = new THREE.TextureLoader();
export const RING = 12.6; // fighters stay inside this radius

function tex(name: string, rx: number, ry: number, aniso: number) {
  const mk = (s: string, srgb: boolean) => { const t = tl.load(`${B}tex/${name}_${s}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const arm = mk('arm', false);
  return new THREE.MeshStandardMaterial({ map: mk('diff', true), normalMap: mk('nor', false), roughnessMap: arm, aoMap: arm, metalness: 0 });
}
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

export interface Arena { update(dt: number, t: number, excite: number): void; groundY(x: number, z: number): number; seat(i: number): { pos: THREE.Vector3; look: THREE.Vector3 } }

export function buildArena(scene: THREE.Scene, aniso: number, mobile: boolean): Arena {
  const r = rng(1453);
  // --- sand floor
  const sand = tex('coast_sand_01', 9, 9, aniso); sand.color.set(0xe8d4b0);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(15.2, 80), sand); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const rake = new THREE.Mesh(new THREE.RingGeometry(RING + 0.25, RING + 0.4, 96), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1, transparent: true, opacity: 0.5 }));
  rake.rotation.x = -Math.PI / 2; rake.position.y = 0.005; scene.add(rake);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: 1 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);

  // --- arena wall
  const stone = tex('large_sandstone_blocks', 26, 1, aniso); stone.color.set(0xf0e4d0);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 15.2, 3.4, 96, 1, true), stone); wall.material.side = THREE.BackSide; wall.position.y = 1.7; wall.receiveShadow = true; wall.castShadow = true; scene.add(wall);
  const brick = tex('medieval_red_brick', 60, 0.5, aniso);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(15.17, 15.17, 0.4, 96, 1, true), brick); band.material.side = THREE.BackSide; band.position.y = 2.5; scene.add(band);
  const capStone = tex('large_sandstone_blocks', 30, 1, aniso);
  const cap = new THREE.Mesh(new THREE.RingGeometry(15.2, 16.2, 96), capStone); cap.rotation.x = -Math.PI / 2; cap.position.y = 3.4; scene.add(cap);
  // two gates with pointed arches
  const wood = tex('weathered_brown_planks', 2, 2, aniso); wood.color.set(0x8a6040);
  const arch = new THREE.Shape(); arch.moveTo(-1.3, 0); arch.lineTo(-1.3, 2.0); arch.quadraticCurveTo(-1.2, 2.9, 0, 3.15); arch.quadraticCurveTo(1.2, 2.9, 1.3, 2.0); arch.lineTo(1.3, 0); arch.closePath();
  const frame = new THREE.Shape(); frame.moveTo(-1.6, 0); frame.lineTo(-1.6, 2.1); frame.quadraticCurveTo(-1.45, 3.15, 0, 3.4); frame.quadraticCurveTo(1.45, 3.15, 1.6, 2.1); frame.lineTo(1.6, 0); frame.closePath(); frame.holes.push(arch);
  for (const ang of [0, Math.PI]) {
    const g = new THREE.Group(); g.position.set(Math.sin(ang) * 15.05, 0, Math.cos(ang) * 15.05); g.rotation.y = ang + Math.PI;
    const door = new THREE.Mesh(new THREE.ShapeGeometry(arch), wood); door.position.z = 0.02;
    const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.25, bevelEnabled: false }), tex('medieval_red_brick', 1, 1, aniso)); fr.position.z = -0.1;
    const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshStandardMaterial({ color: 0x302820, metalness: 1, roughness: 0.4 }), 40);
    const d = new THREE.Object3D(); for (let i = 0; i < 40; i++) { d.position.set(-1.1 + (i % 8) * 0.31, 0.3 + Math.floor(i / 8) * 0.5, 0.05); d.updateMatrix(); studs.setMatrixAt(i, d.matrix); }
    g.add(door, fr, studs); scene.add(g);
  }

  // --- tiered stands
  const tiers = mobile ? 7 : 9, pts: THREE.Vector2[] = [new THREE.Vector2(16.2, 0), new THREE.Vector2(16.2, 3.4)];
  const tierTop: number[] = [], tierR: number[] = [];
  for (let i = 0; i < tiers; i++) { const r0 = 16.2 + i * 1.45, h = 3.4 + (i + 1) * 0.95; pts.push(new THREE.Vector2(r0, h), new THREE.Vector2(r0 + 1.45, h)); tierTop.push(h); tierR.push(r0 + 0.75); }
  const rTop = 16.2 + tiers * 1.45; pts.push(new THREE.Vector2(rTop, tierTop[tiers - 1] + 1.6), new THREE.Vector2(rTop + 0.6, tierTop[tiers - 1] + 1.6), new THREE.Vector2(rTop + 0.6, 0));
  const standMat = tex('large_sandstone_blocks', 40, 4, aniso); standMat.color.set(0xd8c8b0);
  const stands = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), standMat); stands.receiveShadow = true; scene.add(stands);
  // arcade along the top: pointed arches between columns
  const colG = new THREE.CylinderGeometry(0.18, 0.2, 3.6, 10), cols = new THREE.InstancedMesh(colG, standMat, 48), d = new THREE.Object3D();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; d.position.set(Math.sin(a) * (rTop + 0.3), tierTop[tiers - 1] + 3.4, Math.cos(a) * (rTop + 0.3)); d.rotation.set(0, 0, 0); d.updateMatrix(); cols.setMatrixAt(i, d.matrix); }
  scene.add(cols);
  const roofRing = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.9, rTop + 0.9, 0.8, 96, 1, true), standMat); roofRing.material.side = THREE.DoubleSide; roofRing.position.y = tierTop[tiers - 1] + 5.6; scene.add(roofRing);
  const roofBand = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.92, rTop + 0.92, 0.25, 96, 1, true), brick); roofBand.material.side = THREE.DoubleSide; roofBand.position.y = tierTop[tiers - 1] + 5.3; scene.add(roofBand);

  // --- crowd
  const SULTAN = -Math.PI / 2, gap = (a: number) => [0, Math.PI, SULTAN].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < (g === SULTAN ? 0.32 : 0.16));
  const seats: { x: number; y: number; z: number; a: number; ph: number; rate: number }[] = [];
  for (let t = 0; t < tiers; t++) {
    const rr = tierR[t] - 0.2, n = Math.floor((Math.PI * 2 * rr) / 0.62);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (t % 2) * 0.02; if (gap(a) || r() < 0.12) continue; seats.push({ x: Math.sin(a) * rr, y: tierTop[t], z: Math.cos(a) * rr, a, ph: r() * 6, rate: 5 + r() * 4 }); }
  }
  const N = seats.length;
  const bodyG = new THREE.CylinderGeometry(0.17, 0.24, 0.85, 7); bodyG.translate(0, 0.42, 0);
  const headG = new THREE.SphereGeometry(0.12, 8, 6); headG.translate(0, 0.98, 0);
  const hatG = new THREE.SphereGeometry(0.16, 8, 6); hatG.scale(1, 0.75, 1); hatG.translate(0, 1.07, 0);
  const armG = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 5); armG.translate(0, 0.27, 0);
  const mk = (g: THREE.BufferGeometry, rough: number) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: rough }), N); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const bodies = mk(bodyG, 0.9), heads = mk(headG, 0.7), hats = mk(hatG, 0.9), armsL = mk(armG, 0.9), armsR = mk(armG, 0.9);
  const robe = [0xb02a20, 0x1f5a3a, 0xe8e0d0, 0x2a3a6a, 0x8a6a30, 0x6a1a28, 0xd8c8a0, 0x3a3a3a], skin = [0xc89a78, 0xa87858, 0xe0b898, 0x8a5a3a], hat = [0xf0ece0, 0xf0ece0, 0xb02a20, 0x1f5a3a, 0xe8d8b0];
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    const rc = robe[Math.floor(r() * robe.length)]; c.set(rc).multiplyScalar(0.8 + r() * 0.3); bodies.setColorAt(i, c); armsL.setColorAt(i, c); armsR.setColorAt(i, c);
    heads.setColorAt(i, c.set(skin[Math.floor(r() * skin.length)])); hats.setColorAt(i, c.set(hat[Math.floor(r() * hat.length)]));
  });
  const place = (i: number, jump: number, wave: number) => {
    const s = seats[i]; d.position.set(s.x, s.y + jump, s.z); d.rotation.set(0, s.a + Math.PI, 0); d.scale.setScalar(1); d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix); heads.setMatrixAt(i, d.matrix); hats.setMatrixAt(i, d.matrix);
    const up = Math.min(1, wave);
    for (const [m, side] of [[armsL, -1], [armsR, 1]] as [THREE.InstancedMesh, number][]) {
      d.position.set(s.x + Math.cos(s.a) * 0.22 * side, s.y + jump + 0.72, s.z - Math.sin(s.a) * 0.22 * side);
      d.rotation.set(0, s.a + Math.PI, 0); d.rotateX(Math.PI * (0.92 - up * 0.92 * (0.6 + 0.4 * Math.sin(s.ph + side)))); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    }
  };
  for (let i = 0; i < N; i++) place(i, 0, 0);

  // --- the Sultan's box
  const box = new THREE.Group(); const br = 16.6, bh = tierTop[2]; box.position.set(Math.sin(SULTAN) * (br + 3), 0, Math.cos(SULTAN) * (br + 3)); box.rotation.y = SULTAN;
  const marble = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.6 }), gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.8, side: THREE.DoubleSide });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(7, bh, 5), marble); plat.position.set(0, bh / 2, 0); box.add(plat);
  for (const [x, z] of [[-3.2, -2.2], [3.2, -2.2], [-3.2, 2.2], [3.2, 2.2]]) { const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 4, 12), marble); cl.position.set(x, bh + 2, z); box.add(cl); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 5.4), marble); roof.position.set(0, bh + 4.2, 0); box.add(roof);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a6a70, roughness: 0.4, metalness: 0.6 })); dome.position.set(0, bh + 4.45, 0); box.add(dome);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 8), gold); fin.position.set(0, bh + 7, 0); box.add(fin);
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2, 14, 2), red); canopy.position.set(0, bh + 3.5, -2.75); box.add(canopy);
  const sultan = new THREE.Group(); sultan.position.set(0, bh, 0.3);
  const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x8a1a3a, roughness: 0.6 })); sb.position.y = 0.55;
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc89a78 })); sh.position.y = 1.25;
  const st = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.9 })); st.scale.set(1, 1.15, 1); st.position.y = 1.5;
  const throne = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.4), gold); throne.position.set(0, 0.8, 0.55);
  sultan.add(sb, sh, st, throne); box.add(sultan); scene.add(box);

  // --- banners on the roof ring
  const flags: THREE.Mesh[] = [], flagG = new THREE.PlaneGeometry(1.6, 3.2, 6, 10); flagG.translate(0, -1.6, 0);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.065; const f = new THREE.Mesh(flagG.clone(), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x1f5a3a : 0xa01c16, roughness: 0.8, side: THREE.DoubleSide }));
    f.position.set(Math.sin(a) * (rTop + 0.95), tierTop[tiers - 1] + 5.2, Math.cos(a) * (rTop + 0.95)); f.rotation.y = a; scene.add(f); flags.push(f);
  }

  // --- braziers on the arena wall
  const fc = document.createElement('canvas'); fc.width = fc.height = 64; const fg = fc.getContext('2d')!; const grd = fg.createRadialGradient(32, 40, 2, 32, 36, 30);
  grd.addColorStop(0, 'rgba(255,240,190,1)'); grd.addColorStop(0.3, 'rgba(255,150,40,0.85)'); grd.addColorStop(1, 'rgba(255,80,0,0)'); fg.fillStyle = grd; fg.fillRect(0, 0, 64, 64);
  const fireM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); fireM.color.multiplyScalar(3);
  const fires: THREE.Sprite[] = [], bowl = new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.9, roughness: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const x = Math.sin(a) * 15.7, z = Math.cos(a) * 15.7;
    const bw = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.15, 0.4, 12), bowl); bw.position.set(x, 3.6, z); scene.add(bw);
    const f = new THREE.Sprite(fireM); f.position.set(x, 4.25, z); f.scale.set(1.1, 1.5, 1); scene.add(f); fires.push(f);
  }
  const fl = [new THREE.PointLight(0xff9a40, 30, 16, 1.6), new THREE.PointLight(0xff9a40, 30, 16, 1.6)];
  fl[0].position.set(Math.sin(Math.PI / 8) * 15, 4.4, Math.cos(Math.PI / 8) * 15); fl[1].position.set(-Math.sin(Math.PI / 8) * 15, 4.4, -Math.cos(Math.PI / 8) * 15); scene.add(...fl);

  // --- skyline: domes and minarets beyond the stands
  const lead = new THREE.MeshStandardMaterial({ color: 0x6a7478, roughness: 0.5, metalness: 0.4 }), plaster = new THREE.MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.9 });
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, dist = 70 + r() * 140, x = Math.sin(a) * dist, z = Math.cos(a) * dist, s = 0.7 + r() * 1.8;
    if (r() < 0.55) { const drum = new THREE.Mesh(new THREE.CylinderGeometry(6 * s, 6 * s, 8 * s, 20), plaster); drum.position.set(x, 4 * s, z); const dm = new THREE.Mesh(new THREE.SphereGeometry(6.4 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lead); dm.position.set(x, 8 * s, z); scene.add(drum, dm); }
    else { const h = 30 * s; const sh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.1 * s, h, 12), plaster); sh2.position.set(x, h / 2, z); const cn = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 5 * s, 12), lead); cn.position.set(x, h + 2.5 * s, z); scene.add(sh2, cn); }
  }

  let chunk = 0;
  return {
    groundY: () => 0,
    seat(i) {
      const s = seats[Math.abs(i) % N]; const pos = new THREE.Vector3(s.x, s.y + 1.15, s.z);
      return { pos, look: new THREE.Vector3(0, 1.2, 0) };
    },
    update(dt, t, excite) {
      // crowd: refresh a quarter of the people each frame
      const per = Math.ceil(N / 4), lo = chunk * per, hi = Math.min(N, lo + per); chunk = (chunk + 1) % 4;
      for (let i = lo; i < hi; i++) { const s = seats[i]; const j = Math.max(0, Math.sin(t * s.rate + s.ph)) * (0.03 + excite * 0.22); place(i, j, excite * (0.4 + 0.6 * Math.max(0, Math.sin(t * 2 + s.ph)))); }
      for (const m of [bodies, heads, hats, armsL, armsR]) m.instanceMatrix.needsUpdate = true;
      flags.forEach((f, fi) => { const p = f.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = -p.getY(i); p.setZ(i, Math.sin(y * 1.8 - t * 3 + fi) * 0.12 * y); } p.needsUpdate = true; });
      fires.forEach((f, i) => { const k = 0.85 + Math.sin(t * 13 + i * 2.1) * 0.08 + Math.random() * 0.08; f.scale.set(1.1 * k, 1.5 * k, 1); });
      fl.forEach((l, i) => { l.intensity = 26 + Math.sin(t * 11 + i) * 4 + Math.random() * 4; });
      void dt;
    },
  };
}
