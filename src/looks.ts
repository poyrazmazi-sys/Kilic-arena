import * as THREE from 'three';
import { fetchBin } from './bin';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export interface Look {
  name: string; sky: string;
  sunColor: number; sunIntensity: number; envIntensity: number;
  fogTint: number; fogTintMix: number; fogDensity: number;
  exposure: number; saturation: number; contrast: number;
  smoke: number; smokeColor: number; embers: number; bloom: number; minElevation: number;
}

export const LOOKS: Look[] = [
  { name: 'Golden haze', sky: 'belfast_sunset_puresky', sunColor: 0xffa860, sunIntensity: 6, envIntensity: 0.9,
    fogTint: 0xe8a860, fogTintMix: 0.7, fogDensity: 0.0042, exposure: 1.0, saturation: 0.08, contrast: 0.06,
    smoke: 1, smokeColor: 0xcfa27a, embers: 0.3, bloom: 0.9, minElevation: 7 },
  { name: 'Fire and teal', sky: 'industrial_sunset_puresky', sunColor: 0xff8a45, sunIntensity: 7, envIntensity: 0.7,
    fogTint: 0x9a5030, fogTintMix: 0.7, fogDensity: 0.006, exposure: 0.92, saturation: 0.15, contrast: 0.2,
    smoke: 1.8, smokeColor: 0x6a5048, embers: 1, bloom: 1.2, minElevation: 6 },
  { name: 'Calm before battle', sky: 'evening_road_01_puresky', sunColor: 0xffc9a0, sunIntensity: 4.5, envIntensity: 1.0,
    fogTint: 0xe0c0a8, fogTintMix: 0.5, fogDensity: 0.003, exposure: 1.05, saturation: -0.12, contrast: 0.0,
    smoke: 0.5, smokeColor: 0xc8b8a8, embers: 0.1, bloom: 0.6, minElevation: 9 },
];

export interface SkyData { tex: THREE.DataTexture; sunAzimuth: number; sunElevation: number; horizon: THREE.Color; }
const cache = new Map<string, Promise<SkyData>>();

/** Loads an HDRI and finds its sun direction and horizon colour so lights and fog match the sky. */
export function loadSky(name: string): Promise<SkyData> {
  if (!cache.has(name)) cache.set(name, fetchBin(`${import.meta.env.BASE_URL}sky/${name}_2k.json`).then((buf) => {
    const hl = new HDRLoader().setDataType(THREE.FloatType) as any; const tex = new THREE.DataTexture(); hl._applyTexData(tex, hl.parse(buf));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const { data, width: w, height: h } = tex.image as { data: Float32Array; width: number; height: number };
    const st = data.length / (w * h);
    let best = -1, bu = 0, bv = 0;
    for (let y = 0; y < h * 0.6; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * st, l = data[i] + data[i + 1] + data[i + 2];
      if (l > best) { best = l; bu = x / w; bv = y / h; }
    }
    // data rows may be stored top-first or bottom-first; the sun is in the upper half either way
    const flipY = tex.flipY;
    const vTop = flipY ? bv : bv;
    const elevation = (0.5 - vTop) * Math.PI;
    const horizon = new THREE.Color();
    const row = Math.floor(h * 0.47); let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < w; x += 4) { const i = (row * w + x) * st; r += Math.min(data[i], 4); g += Math.min(data[i + 1], 4); b += Math.min(data[i + 2], 4); n++; }
    horizon.setRGB(r / n, g / n, b / n);
    const m = Math.max(horizon.r, horizon.g, horizon.b); if (m > 0.55) horizon.multiplyScalar(0.55 / m);
    return { tex, sunAzimuth: (bu - 0.5) * Math.PI * 2, sunElevation: Math.abs(elevation), horizon };
  }));
  return cache.get(name)!;
}
