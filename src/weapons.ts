import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchBin } from './bin';

const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.42, metalness: 0.95 });
const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.22, metalness: 1 });
const brass = new THREE.MeshStandardMaterial({ color: 0x80602c, roughness: 0.5, metalness: 0.9 });
const walnut = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.75 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x6a1814, roughness: 0.95 });
const skin = new THREE.MeshStandardMaterial({ color: 0xb88860, roughness: 0.7 });
const leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });

function arm(len = 0.42) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.06, len, 12), sleeve); s.rotation.x = Math.PI / 2; s.position.z = len / 2 + 0.07;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10), brass); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.075;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); hand.scale.set(0.9, 0.62, 1.2); hand.position.z = 0.02;
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 3, 6), skin); thumb.rotation.x = Math.PI / 2; thumb.position.set(0.04, 0.012, -0.01);
  g.add(s, cuff, hand, thumb); return g;
}

export function makeArquebus() {
  const g = new THREE.Group();
  const right = arm(); right.position.set(0.012, -0.075, 0.25); right.rotation.set(0.35, -0.25, 0); g.add(right);
  const left = arm(); left.position.set(-0.005, -0.07, -0.22); left.rotation.set(0.5, 0.75, 0.3); g.add(left);
  const out = { group: g, left, serp: new THREE.Object3D() as THREE.Object3D, muzzleLocal: new THREE.Vector3(0, 0.014, -0.88) };
  const tl = new THREE.TextureLoader(); const base = `${import.meta.env.BASE_URL}tex/weathered_brown_planks`;
  const tx = (n: string, srgb: boolean) => { const t = tl.load(`${base}_${n}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 9); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const mats: Record<string, THREE.Material> = {
    wood: new THREE.MeshStandardMaterial({ map: tx('diff', true), normalMap: tx('nor', false), roughnessMap: tx('arm', false), color: 0xc08a5c, roughness: 0.85 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.38, metalness: 1 }), brass,
    cord: new THREE.MeshStandardMaterial({ color: 0x8a7858, roughness: 1 }),
  };
  fetchBin(`${import.meta.env.BASE_URL}models/arquebus.json`).then((buf) => new GLTFLoader().parseAsync(buf, '')).then((gltf) => {
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = mats[(m.material as THREE.Material).name] ?? mats.iron; m.frustumCulled = false; } });
    const serp = gltf.scene.getObjectByName('serp'); if (serp) { out.serp = serp;
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a10).multiplyScalar(4) })); ember.position.set(0, 0.046, -0.084); serp.add(ember); }
    g.add(gltf.scene);
  });
  g.traverse((o) => { o.frustumCulled = false; });
  return out;
}

export function makeKilic() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  // gently curved single-edged blade, widening toward the tip (yalman)
  const pts: [number, number][] = [];
  for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push([k * 0.78, 0.16 * k * k]); }
  sh.moveTo(0, -0.016);
  pts.forEach(([x, y], i) => sh.lineTo(x, y - 0.016 - (i > 9 ? (i - 9) * 0.002 : 0)));
  sh.lineTo(0.8, 0.185);
  for (let i = 14; i >= 0; i--) { const [x, y] = pts[i]; sh.lineTo(x, y + 0.016); }
  sh.closePath();
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 1 });
  bg.translate(0.06, 0, -0.002); bg.rotateZ(Math.PI / 2);
  const blade = new THREE.Mesh(bg, steel); g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.022), brass); guard.position.y = 0.05; g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), leather); grip.position.y = -0.01; g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), brass); pommel.position.set(-0.012, -0.07, 0); g.add(pommel);
  const a = arm(); a.position.set(0, -0.01, 0.0); a.rotation.set(0.9, 0, 0); g.add(a);
  g.traverse((o) => { o.frustumCulled = false; });
  return { group: g };
}
