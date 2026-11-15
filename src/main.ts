import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, GodRaysEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, HueSaturationEffect, BrightnessContrastEffect, KernelSize } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { LOOKS, loadSky } from './looks';
import { buildWorld } from './world';
import { Player } from './player';
import { Game } from './game';
import { initAudio, sfx } from './audio';
import { t as tr, lang, setLang } from './i18n';

const q = new URLSearchParams(location.search);
const shot = q.has('shot');
const mobile = /iPad|iPhone|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
const quality = Number(q.get('q') ?? (mobile ? 1 : 2)); // 0 low, 1 medium, 2 high, 3 ultra
const statusEl = document.getElementById('status')!, overlay = document.getElementById('overlay')!, hint = document.getElementById('hint')!, statsEl = document.getElementById('stats')!;

async function main() {
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, preserveDrawingBuffer: shot });
  renderer.setPixelRatio(Math.min(devicePixelRatio, [0.75, 1, 1.5, 2][quality]));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 4000);
  scene.fog = new THREE.FogExp2(0xd9a066, 0.004);

  const sun = new THREE.DirectionalLight(0xffb070, 5);
  const S = [1024, 2048, 4096, 4096][quality];
  sun.castShadow = true; sun.shadow.mapSize.set(S, S);
  const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfc8e8, 0x6a5038, 0.9); scene.add(hemi);
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(55, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(40), fog: false, transparent: true, depthWrite: false }));
  sunMesh.frustumCulled = false; scene.add(sunMesh);
  const sunDir = new THREE.Vector3(-1, 0.12, -0.3).normalize();

  statusEl.textContent = 'Building the walls...';
  const world = await buildWorld(scene, physics, renderer.capabilities.getMaxAnisotropy(), quality);
  const player = new Player(physics, camera, renderer.domElement, new THREE.Vector3(-5.5, 10.1, 0));
  world.onFire = () => { player.shake = Math.max(player.shake, 1); };
  const game = new Game(scene, camera, physics, player, world, renderer.domElement);
  const fire0 = world.fire.bind(world); world.fire = () => { fire0(); sfx.bombard(); };

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  if (quality >= 1) {
    const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    ao.configuration.aoRadius = 1.6; ao.configuration.distanceFalloff = 1.0; ao.configuration.intensity = 1.4; ao.configuration.halfRes = quality < 3; ao.configuration.color = new THREE.Color(0x1a0f08);
    ao.setQualityMode(quality >= 2 ? 'Medium' : 'Low');
    composer.addPass(ao);
  }
  const godrays = new GodRaysEffect(camera, sunMesh, { density: 0.96, decay: 0.93, weight: 0.16, exposure: 0.08, samples: quality >= 2 ? 60 : 30, clampMax: 1, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
  const bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 1.4, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.75 });
  const hue = new HueSaturationEffect({ saturation: 0 }), bc = new BrightnessContrastEffect({ contrast: 0 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  composer.addPass(new EffectPass(camera, godrays, bloom));
  composer.addPass(new EffectPass(camera, tone, hue, bc, new VignetteEffect({ darkness: 0.5, offset: 0.25 }), new SMAAEffect()));

  let lookIndex = -1;
  async function setLook(i: number) {
    const L = LOOKS[i]; lookIndex = i;
    const sky = await loadSky(L.sky);
    if (lookIndex !== i) return;
    const el = Math.max(sky.sunElevation, THREE.MathUtils.degToRad(L.minElevation));
    const az = Math.atan2(-0.3, -1); // where we want the sun: west, a little north
    sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const rot = Number(q.get('rot') ?? 1) * (sky.sunAzimuth - az);
    scene.background = sky.tex; scene.environment = sky.tex;
    scene.backgroundRotation.set(0, rot, 0); scene.environmentRotation.set(0, rot, 0);
    scene.environmentIntensity = L.envIntensity * 2.4; hemi.intensity = 1.1 * L.envIntensity; scene.backgroundIntensity = 0.55;
    sun.color.set(L.sunColor); sun.intensity = L.sunIntensity * 2.2;
    (scene.fog as THREE.FogExp2).color.copy(sky.horizon).lerp(new THREE.Color(L.fogTint), L.fogTintMix);
    (scene.fog as THREE.FogExp2).density = L.fogDensity;
    renderer.toneMappingExposure = L.exposure; tone.adaptive = false;
    (bc as any).brightness = (L.exposure - 1) * 0.5; bc.contrast = L.contrast; hue.saturation = L.saturation;
    bloom.intensity = L.bloom * 0.6;
    world.setLook(L.smoke, L.smokeColor, L.embers);
    hint.textContent = `${tr('look')} ${i + 1}: ${L.name}  (7 8 9)`; localStorage.setItem('j1453.look', String(i));
  }
  await setLook(Number(q.get('look') ?? Number(localStorage.getItem('j1453.look') ?? 0) + 1) - 1);

  addEventListener('keydown', (e) => {
    if (e.code === 'Digit7') setLook(0); if (e.code === 'Digit8') setLook(1); if (e.code === 'Digit9') setLook(2);
    if (e.code === 'KeyL') { setLang(lang === 'en' ? 'tr' : 'en'); texts(); }
  });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
  const el = (id: string) => document.getElementById(id)!;
  const comp = el('compass').firstElementChild as HTMLElement; const marks = lang === 'tr' ? ['K', 'D', 'G', 'B'] : ['N', 'E', 'S', 'W'];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) { const sp = document.createElement('span'); sp.style.left = `${r * 720 + i * 90}px`; sp.textContent = i % 2 ? '·' : marks[i / 2]; comp.appendChild(sp); }
  const diffBtns = [...el('diffs').children] as HTMLElement[];
  function texts() {
    el('intro').textContent = tr('intro2'); el('note').textContent = tr('note'); el('go').textContent = started ? tr('resume') : tr('start'); el('controls').textContent = tr('controls');
    diffBtns.forEach((b, i) => { b.textContent = tr(['easy', 'normal', 'hard'][i]); b.className = i === game.diff ? 'on' : ''; });
    statusEl.textContent = tr('intro1');
  }
  let started = false; texts(); el('menu').style.display = 'block';
  diffBtns.forEach((b, i) => b.addEventListener('click', (e) => { e.stopPropagation(); if (started) return; game.diff = i; localStorage.setItem('j1453.diff', String(i)); texts(); }));
  el('lang').addEventListener('click', (e) => { e.stopPropagation(); setLang(lang === 'en' ? 'tr' : 'en'); texts(); });
  const begin = () => { initAudio(); renderer.domElement.requestPointerLock(); if (!started) { started = true; game.start(); } overlay.style.display = 'none'; el('hud').style.opacity = '1'; };
  el('go').addEventListener('click', begin);
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && started && game.state !== 'won') { overlay.style.display = 'flex'; texts(); } });
  addEventListener('mousedown', () => { if (game.state === 'dead' && game.stateT > 1.2) game.revive(); });
  el('win').addEventListener('click', () => location.reload());
  let autoplay = false;

  if (shot) {
    overlay.style.display = 'none'; hint.style.display = 'none';
    const p = (q.get('pos') ?? '-5.5,10.1,0').split(',').map(Number);
    player.teleport(new THREE.Vector3(p[0], p[1], p[2]));
    if (q.has('fire')) { world.fire(); }
    if (q.has('play')) { started = true; autoplay = true; el('hud').style.opacity = '1'; game.start(); game.stateT = 8; if (q.has('wave')) game.wave = Number(q.get('wave')); }
    player.teleport(new THREE.Vector3(p[0], p[1], p[2])); player.yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 90)); player.pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? -3));
  }

  const clock = new THREE.Clock(); let t = 0, nextFire = 14, frames = 0, ft = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05); t += dt;
    const paused = started && !player.locked && !autoplay && game.state !== 'won';
    physics.timestep = dt; player.update(dt); physics.step();
    if (!paused) game.update(dt);
    if (!shot && t > nextFire) { world.fire(); nextFire = t + 40 + Math.random() * 25; }
    world.update(dt, t, camera);
    sunMesh.position.copy(camera.position).addScaledVector(sunDir, 3000);
    sun.target.position.copy(camera.position); sun.position.copy(camera.position).addScaledVector(sunDir, 300);
    composer.render(dt);
    frames++; ft += dt; if (ft > 0.5) { statsEl.textContent = `${Math.round(frames / ft)} fps`; frames = 0; ft = 0; (window as any).__ready = t > 1.5; }
    requestAnimationFrame(frame);
  }
  frame();
}
main().catch((e) => { statusEl.textContent = 'Error: ' + e.message; console.error(e); });
