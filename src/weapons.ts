import * as THREE from 'three';

const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.42, metalness: 0.95 });
const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.22, metalness: 1 });
const brass = new THREE.MeshStandardMaterial({ color: 0x9a7030, roughness: 0.35, metalness: 1 });
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
  // side profile of the stock (z forward negative), extruded
  const sh = new THREE.Shape();
  sh.moveTo(0.42, -0.02); sh.lineTo(0.42, -0.14); sh.lineTo(0.30, -0.115); sh.lineTo(0.12, -0.065); sh.lineTo(0.0, -0.062);
  sh.lineTo(-0.55, -0.045); sh.lineTo(-0.55, -0.012); sh.lineTo(0.05, -0.005); sh.lineTo(0.16, 0.0); sh.lineTo(0.3, -0.012); sh.closePath();
  const stockG = new THREE.ExtrudeGeometry(sh, { depth: 0.044, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
  stockG.translate(0, 0, -0.022); stockG.rotateY(Math.PI / 2); // x-profile becomes z
  const stock = new THREE.Mesh(stockG, walnut); g.add(stock);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0165, 1.02, 8), iron); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, -0.36); g.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.035, 8), iron); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.012, -0.86); g.add(muzzle);
  [-0.05, -0.3, -0.52].forEach((z) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 12), brass); b.rotation.x = Math.PI / 2; b.scale.set(0.8, 1, 1.25); b.position.set(0, -0.012, z); g.add(b); });
  const pan = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.035), iron); pan.position.set(0.028, 0.012, 0.1); g.add(pan);
  const serp = new THREE.Group(); serp.position.set(0.03, -0.01, 0.17);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.075, 0.012), iron); lever.position.y = 0.035; lever.rotation.x = -0.5; serp.add(lever);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a10).multiplyScalar(3) })); ember.position.set(0, 0.07, -0.022); serp.add(ember);
  g.add(serp);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 6), walnut); rod.rotation.x = Math.PI / 2; rod.position.set(0, -0.04, -0.25); g.add(rod);
  const right = arm(); right.position.set(0.01, -0.07, 0.24); right.rotation.set(0.35, -0.25, 0); g.add(right);
  const left = arm(); left.position.set(-0.005, -0.065, -0.22); left.rotation.set(0.5, 0.75, 0.3); g.add(left);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = false; o.frustumCulled = false; });
  return { group: g, left, serp, muzzleLocal: new THREE.Vector3(0, 0.012, -0.9) };
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
