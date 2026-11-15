import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Phys } from './phys';
import { fetchBin } from './bin';

const TILE: Record<string, number> = { stone: 3.2, brick: 1.6, floor: 2.4, wood: 2.0, mud: 11 };
const TEX: Record<string, string> = { stone: 'large_sandstone_blocks', brick: 'medieval_red_brick', floor: 'cobblestone_large_01', wood: 'weathered_brown_planks', mud: 'brown_mud_02' };
const TINT: Record<string, number> = { stone: 0xd8d2c6, brick: 0xa89080, floor: 0xb0a898, wood: 0x9a8670, mud: 0x6a5a48 };

const tl = new THREE.TextureLoader();
function tiled(url: string, tile: number, srgb: boolean, aniso: number) {
  const t = tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(1 / tile); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function pbr(key: string, aniso: number, ao?: THREE.Texture) {
  const base = `${import.meta.env.BASE_URL}tex/${TEX[key]}`, tile = TILE[key];
  const arm = tiled(`${base}_arm.jpg`, tile, false, aniso);
  const m = new THREE.MeshStandardMaterial({
    map: tiled(`${base}_diff.jpg`, tile, true, aniso), normalMap: tiled(`${base}_nor.jpg`, tile, false, aniso),
    roughnessMap: arm, metalness: 0, color: TINT[key],
  });
  if (ao) { m.aoMap = ao; m.aoMapIntensity = 0.75; } else { m.aoMap = arm; }
  return m;
}

export interface World { bombard: THREE.Vector3; update(dt: number, t: number, cam: THREE.Camera): void; setLook(smoke: number, smokeColor: number, embers: number): void; fire(): void; puff(p: THREE.Vector3, size: number, life: number, alpha: number, vel: THREE.Vector3, color?: number): void; onFire?: () => void; }

function addBox(world: Phys, b: number[], ox: number, oz: number) {
  // b is Blender [x0,x1,y0,y1,z0,z1]; three: x=X, y=Z, z=-Y
  world.box(ox + (b[0] + b[1]) / 2, (b[4] + b[5]) / 2, oz - (b[2] + b[3]) / 2, (b[1] - b[0]) / 2, (b[5] - b[4]) / 2, (b[3] - b[2]) / 2);
}

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const r = rng(7);
  for (let i = 0; i < 60; i++) {
    const x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120, rad = 30 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.09)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const m = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  g.globalCompositeOperation = 'destination-in'; m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function buildWorld(scene: THREE.Scene, physics: Phys, aniso: number, quality: number): Promise<World> {
  const loader = new GLTFLoader();
  const aoTex = (n: string) => { const t = tl.load(`${import.meta.env.BASE_URL}models/${n}_ao.jpg`); t.flipY = false; t.channel = 1; return t; };
  const matsFor = (n: string) => { const ao = aoTex(n); return { stone: pbr('stone', aniso, ao), brick: pbr('brick', aniso, ao), floor: pbr('floor', aniso, ao), wood: pbr('wood', aniso, ao) } as Record<string, THREE.Material>; };

  const [hero, outer, inner] = await Promise.all(['outer_hero', 'outer', 'inner'].map((n) => fetchBin(`${import.meta.env.BASE_URL}models/${n}.json`).then((b) => loader.parseAsync(b, ''))));
  const N = quality > 1 ? 7 : 4; // modules each side

  const place = (gltf: { scene: THREE.Group }, name: string, x: number, zs: number[], collideWithin: number) => {
    const mats = matsFor(name);
    let colliders: number[][] = [];
    gltf.scene.traverse((o) => { if (o.userData.colliders) colliders = JSON.parse(o.userData.colliders); });
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      const im = new THREE.InstancedMesh(mesh.geometry, mats[(mesh.material as THREE.Material).name] ?? mats.stone, zs.length);
      zs.forEach((z, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z).multiply(mesh.matrixWorld)));
      im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
    });
    zs.forEach((z) => { if (Math.abs(z) <= collideWithin) colliders.forEach((b) => addBox(physics, b, x, z)); });
  };
  const outerZ: number[] = [], innerZ: number[] = [];
  for (let k = -N; k <= N; k++) { if (k !== 0) outerZ.push(k * 55); innerZ.push(k * 55 + 27.5); }
  place(hero, 'outer_hero', 0, [0], 999);
  place(outer, 'outer', 0, outerZ, 60);
  place(inner, 'inner', 24, innerZ, 90);
  // play area limits on the walkway
  [-52, 52].forEach((z) => physics.box(0, 10, z, 6, 4, 0.3));

  physics.box(2.35, 10.5, 0, 0.2, 2.5, 52); // invisible rail above the low city-side parapet
  // --- ground: camp plain, moat, terraces, city slope ---
  const mud = pbr('mud', aniso) as THREE.MeshStandardMaterial;
  const slab = (x0: number, x1: number, y: number, depth: number, collide = true, mat: THREE.Material = mud) => {
    const g = new THREE.BoxGeometry(x1 - x0, depth, 1000);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * 1000);
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, y - depth / 2, 0); m.receiveShadow = true; scene.add(m);
    if (collide) physics.box((x0 + x1) / 2, y - depth / 2, 0, (x1 - x0) / 2, depth / 2, 500);
  };
  slab(-900, -38, 0, 8, false);           // camp plain
  slab(-38, -20, -5, 3);                  // moat bed
  slab(-20, -2.4, 1.2, 9);                // terrace in front of the outer wall
  slab(2.4, 21.6, 2.6, 9);                // peribolos between the walls
  physics.box(-68, -0.5, 0, 30, 0.5, 500);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(18, 1000), new THREE.MeshStandardMaterial({ color: 0x1c2018, roughness: 0.08, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-29, -2.4, 0); scene.add(water);
  // city ground rising to the east
  const city = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1800), new THREE.MeshStandardMaterial({ color: 0x5a5340, roughness: 1 }));
  city.rotation.set(-Math.PI / 2, 0.03, 0, 'ZXY'); city.rotation.order = 'XYZ'; city.rotation.set(-Math.PI / 2, -0.03, 0);
  city.position.set(26 + 800, 3 + 24, 0); scene.add(city);
  const horn = new THREE.Mesh(new THREE.PlaneGeometry(2500, 900), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.15, metalness: 0.7 }));
  horn.rotation.x = -Math.PI / 2; horn.position.set(900, 2, -1350); scene.add(horn);

  // --- city: houses, roofs, domes (instanced) ---
  const r = rng(1453);
  const nb = quality > 1 ? 1400 : 700;
  const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), nb);
  const roofG = new THREE.ConeGeometry(0.72, 1, 4); roofG.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0x9a4a30, roughness: 0.9 }), nb);
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < nb; i++) {
    const x = 45 + Math.pow(r(), 0.7) * 900, z = (r() - 0.5) * 1500;
    const w = 6 + r() * 9, h = 4 + r() * 7, dp = 6 + r() * 9, y = 3 + (x - 26) * 0.03;
    d.position.set(x, y + h / 2 - 1, z); d.rotation.set(0, r() * 0.5, 0); d.scale.set(w, h + 2, dp); d.updateMatrix(); houses.setMatrixAt(i, d.matrix);
    col.setHSL(0.08 + r() * 0.04, 0.18 + r() * 0.15, 0.5 + r() * 0.2); houses.setColorAt(i, col);
    d.position.y = y + h + 1.2; d.scale.set(w * 1.05, 2.6, dp * 1.05); d.updateMatrix(); roofs.setMatrixAt(i, d.matrix);
  }
  scene.add(houses, roofs);
  const domeM = new THREE.MeshStandardMaterial({ color: 0x777a78, roughness: 0.5, metalness: 0.3 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xb09a80, roughness: 0.95 });
  const church = (x: number, z: number, s: number) => {
    const y = 3 + (x - 26) * 0.03;
    const base = new THREE.Mesh(new THREE.BoxGeometry(22 * s, 16 * s, 22 * s), plaster); base.position.set(x, y + 8 * s, z);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9 * s, 9 * s, 5 * s, 24), plaster); drum.position.set(x, y + 18 * s, z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9.5 * s, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM); dome.position.set(x, y + 20 * s, z);
    scene.add(base, drum, dome);
  };
  church(260, -120, 1); church(420, 210, 0.8); church(190, 330, 0.6); church(620, -380, 1.2); church(980, -260, 2.6);

  // --- Ottoman camp: tents, banners, earthworks, bombard ---
  const woodM0 = pbr('wood', aniso);
  const nt = quality > 1 ? 1500 : 700;
  const tentG = new THREE.LatheGeometry([new THREE.Vector2(0, 3.4), new THREE.Vector2(0.25, 3.2), new THREE.Vector2(2.4, 1.9), new THREE.Vector2(2.4, 0)], 14);
  const tents = new THREE.InstancedMesh(tentG, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), nt);
  for (let i = 0; i < nt; i++) {
    const x = -125 - Math.pow(r(), 1.5) * 600, z = (r() - 0.5) * 1100, s = 1.2 + r() * r() * 2.2;
    d.position.set(x, 0, z); d.rotation.set(0, r() * 6, 0); d.scale.setScalar(s); d.updateMatrix(); tents.setMatrixAt(i, d.matrix);
    const k = r(); col.set(k < 0.7 ? 0x8a8272 : k < 0.85 ? 0x70281c : k < 0.95 ? 0x34482f : 0x8a7438); tents.setColorAt(i, col);
  }
  tents.castShadow = true; scene.add(tents);
  // the Sultan's pavilion and campfires
  const pav = new THREE.Mesh(tentG, new THREE.MeshStandardMaterial({ color: 0x9a2a1c, roughness: 0.85, side: THREE.DoubleSide })); pav.position.set(-330, 0, 40); pav.scale.set(7, 5.5, 7); scene.add(pav);
  const pavTop = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8a840, roughness: 0.3, metalness: 1 })); pavTop.position.set(-330, 19.5, 40); scene.add(pavTop);
  const fc = document.createElement('canvas'); fc.width = fc.height = 64; const fg = fc.getContext('2d')!; const fgr = fg.createRadialGradient(32, 32, 0, 32, 32, 32);
  fgr.addColorStop(0, 'rgba(255,220,150,1)'); fgr.addColorStop(0.25, 'rgba(255,140,40,0.7)'); fgr.addColorStop(1, 'rgba(255,90,0,0)'); fg.fillStyle = fgr; fg.fillRect(0, 0, 64, 64);
  const fireM = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); fireM.color.multiplyScalar(2.5);
  const fires: THREE.Sprite[] = [];
  for (let i = 0; i < 90; i++) { const f = new THREE.Sprite(fireM); f.position.set(-120 - Math.pow(r(), 1.4) * 520, 1.2, (r() - 0.5) * 1000); f.scale.setScalar(3 + r() * 3); scene.add(f); fires.push(f); }
  // siege batteries: smaller guns behind wooden mantlets
  const mant = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 2.6, 4.2), woodM0, 40);
  for (let i = 0; i < 40; i++) { d.position.set(-96 - r() * 10, 1.3, -260 + i * 13 + r() * 4); d.rotation.set(0, (r() - 0.5) * 0.3, 0.18); d.scale.setScalar(1); d.updateMatrix(); mant.setMatrixAt(i, d.matrix); }
  mant.castShadow = true; scene.add(mant);
  const woodM = pbr('wood', aniso);
  // gabions / earthwork line in front of the guns
  const earth = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.0, 1.8, 10), mud, 160);
  for (let i = 0; i < 160; i++) { d.position.set(-108 + Math.sin(i * 0.37) * 3, 0.8, -220 + i * 2.75 + (i % 9 === 4 ? 1.2 : 0)); d.rotation.set(0, r() * 6, 0); d.scale.set(1, 0.9 + r() * 0.3, 1); d.updateMatrix(); earth.setMatrixAt(i, d.matrix); }
  earth.castShadow = true; scene.add(earth);
  // banners
  const flagM = new THREE.MeshStandardMaterial({ color: 0xa82a20, roughness: 0.8, side: THREE.DoubleSide });
  const flagG = new THREE.PlaneGeometry(3.2, 1.8, 12, 4); flagG.translate(1.6, 0, 0);
  const flags: THREE.Mesh[] = [];
  const banner = (x: number, y: number, z: number, h: number, color = 0xa82a20) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), woodM); pole.position.set(x, y + h / 2, z); pole.castShadow = true;
    const m = color === 0xa82a20 ? flagM : new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    const f = new THREE.Mesh(flagG.clone(), m); f.position.set(x, y + h - 1.0, z); f.rotation.y = -0.4; f.castShadow = true;
    scene.add(pole, f); flags.push(f);
  };
  banner(-9.0, 10, 4.0, 5.5); banner(-9.0, 10, -4.0, 5.5, 0x2a6a40);
  for (let i = 0; i < 40; i++) banner(-150 - r() * 400, 0, (r() - 0.5) * 900, 6 + r() * 3, r() < 0.7 ? 0xa82a20 : 0x2a6a40);

  // the great bombard
  const bombard = new THREE.Vector3(-112, 1.6, -38);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.45, metalness: 0.9 });
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 5.2, 24), bronze); barrel.rotation.z = Math.PI / 2; barrel.position.x = 1.2;
  const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.0, 20), bronze); breech.rotation.z = Math.PI / 2; breech.position.x = -2.9;
  gun.add(barrel, breech);
  for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72 - i * 0.02, 0.07, 8, 24), bronze); ring.rotation.y = Math.PI / 2; ring.position.x = -1.2 + i * 1.2; gun.add(ring); }
  const bed = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.8, 2.6), woodM); bed.position.set(-0.6, -1.0, 0); gun.add(bed);
  gun.position.copy(bombard); gun.rotation.z = 0.08; gun.rotation.y = 0.32; gun.traverse((o) => { o.castShadow = true; }); scene.add(gun);
  const flash = new THREE.PointLight(0xffa040, 0, 400, 1.5); flash.position.copy(bombard).add(new THREE.Vector3(6, 1, 2)); scene.add(flash);

  // --- smoke ---
  const smokeTex = smokeTexture();
  interface Puff { s: THREE.Sprite; life: number; max: number; v: THREE.Vector3; size: number; grow: number; alpha: number; src: number; }
  const puffs: Puff[] = [];
  const sources = [
    { p: new THREE.Vector3(-60, 1, 30), rate: 1.2, size: 9 }, { p: new THREE.Vector3(-140, 1, -90), rate: 1.0, size: 14 },
    { p: new THREE.Vector3(-230, 1, 140), rate: 0.8, size: 18 }, { p: new THREE.Vector3(60, 8, -60), rate: 0.8, size: 16 },
    { p: new THREE.Vector3(140, 12, 90), rate: 0.7, size: 22 }, { p: new THREE.Vector3(-14, 1.5, -22), rate: 1.2, size: 5 },
    { p: new THREE.Vector3(-320, 1, -260), rate: 0.6, size: 24 }, { p: new THREE.Vector3(300, 16, -200), rate: 0.5, size: 30 },
  ];
  const acc = sources.map(() => 0);
  let smokeAmt = 1; const smokeCol = new THREE.Color(0xcfa27a);
  const wind = new THREE.Vector3(1.6, 0, 0.9);
  const spawn = (p: THREE.Vector3, size: number, life: number, up: number, alpha: number, src: number, vel?: THREE.Vector3) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: smokeCol.clone().multiplyScalar(0.75 + Math.random() * 0.4), rotation: Math.random() * 6 }));
    s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * size * 0.4, 0, (Math.random() - 0.5) * size * 0.4));
    scene.add(s); puffs.push({ s, life: 0, max: life, v: vel ?? new THREE.Vector3(0, up, 0), size, grow: size * (src === -1 && size < 3 ? 0.9 : 0.22), alpha, src });
  };
  // pre-warm so columns exist on the first frame
  const step = (dt: number) => {
    sources.forEach((src, i) => { acc[i] += dt * src.rate * smokeAmt; while (acc[i] > 1) { acc[i]--; spawn(src.p, src.size, 26, 1.6 + Math.random(), 0.5, i); } });
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life += dt;
      if (p.life > p.max) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); continue; }
      const k = p.life / p.max;
      p.s.position.addScaledVector(p.v, dt).addScaledVector(wind, dt * Math.min(1, k * 3));
      p.v.multiplyScalar(1 - dt * 0.25);
      const sz = p.size + p.grow * p.life; p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.alpha * Math.min(1, k * 8) * (1 - k) ** 1.2;
    }
  };
  for (let i = 0; i < 260; i++) step(0.1);

  // --- embers and dust motes around the camera ---
  const NE = 160, epos = new Float32Array(NE * 3), eseed = new Float32Array(NE);
  for (let i = 0; i < NE; i++) { epos[i * 3] = (Math.random() - 0.5) * 40; epos[i * 3 + 1] = Math.random() * 14; epos[i * 3 + 2] = (Math.random() - 0.5) * 40; eseed[i] = Math.random() * 100; }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(epos, 3));
  const emat = new THREE.PointsMaterial({ color: 0xffb060, size: 0.035, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  emat.color.multiplyScalar(3);
  const embers = new THREE.Points(eg, emat); embers.frustumCulled = false; scene.add(embers);

  let flashT = 9;
  const api: World = {
    bombard,
    puff(p, size, life, alpha, vel, color) { spawn(p, size, life, 0, alpha, -1, vel); if (color !== undefined) puffs[puffs.length - 1].s.material.color.set(color); },
    setLook(smoke, color, emb) { smokeAmt = smoke; smokeCol.set(color); emat.opacity = Math.min(1, emb); embers.visible = emb > 0.05; },
    fire() {
      flashT = 0;
      const muzzle = bombard.clone().add(new THREE.Vector3(5, 0.8, 1.6));
      for (let i = 0; i < 26; i++) spawn(muzzle, 5 + Math.random() * 5, 16 + Math.random() * 8, 0, 0.8, -1, new THREE.Vector3(8 + Math.random() * 22, 1 + Math.random() * 5, 2 + (Math.random() - 0.5) * 9));
      // impact dust on the wall north of the player
      const hit = new THREE.Vector3(-4, 6, -58);
      setTimeout(() => { for (let i = 0; i < 18; i++) spawn(hit, 4 + Math.random() * 5, 12 + Math.random() * 6, 0, 0.75, -1, new THREE.Vector3(-4 + Math.random() * 3, 2 + Math.random() * 6, (Math.random() - 0.5) * 8)); api.onFire?.(); }, 450);
    },
    update(dt, t, cam) {
      step(dt);
      flashT += dt; flash.intensity = flashT < 0.25 ? 60000 * (1 - flashT / 0.25) : 0;
      const a = eg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < NE; i++) {
        let x = a.getX(i) + (1.2 + Math.sin(t + eseed[i]) * 0.6) * dt, y = a.getY(i) + (0.35 + Math.sin(t * 0.7 + eseed[i] * 3) * 0.3) * dt, z = a.getZ(i) + 0.7 * dt;
        if (x > 20) x -= 40; if (z > 20) z -= 40; if (y > 14) y = 0;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true; embers.position.set(cam.position.x, cam.position.y - 6, cam.position.z);
      fires.forEach((f, i) => { if ((i + Math.floor(t * 12)) % 3 === 0) f.material.rotation = Math.random() * 6; });
      flags.forEach((f, fi) => {
        const p = f.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 2.2 - t * 5 + fi) * 0.18 * (x / 3.2) + Math.sin(x * 5 - t * 8) * 0.04 * (x / 3.2)); }
        p.needsUpdate = true; f.geometry.computeVertexNormals();
      });
    },
  };
  return api;
}
