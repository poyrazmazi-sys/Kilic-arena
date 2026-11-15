import * as THREE from 'three';
// Minimal axis-aligned box physics: every collider in the level is a box, so this replaces a WASM engine.
interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; }
export class Phys {
  boxes: Box[] = [];
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) { this.boxes.push({ x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy, z0: cz - hz, z1: cz + hz }); }
  ray(o: THREE.Vector3, d: THREE.Vector3, max: number): { timeOfImpact: number } | null {
    let best = max, hit = false;
    for (const b of this.boxes) {
      let t0 = 0, t1 = best, ok = true;
      for (const [oo, dd, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]] as number[][]) {
        if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
        let a = (lo - oo) / dd, c = (hi - oo) / dd; if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) { best = t0; hit = true; }
    }
    return hit ? { timeOfImpact: best } : null;
  }
  private hits(p: THREE.Vector3, r: number, h: number): Box | null {
    for (const b of this.boxes) if (p.x + r > b.x0 && p.x - r < b.x1 && p.z + r > b.z0 && p.z - r < b.z1 && p.y + h > b.y0 && p.y < b.y1 - 1e-4) return b;
    return null;
  }
  /** Moves a standing box (feet at p). Returns whether it is on the ground. */
  move(p: THREE.Vector3, r: number, h: number, d: THREE.Vector3, wasGrounded: boolean): { grounded: boolean; ceiling: boolean } {
    let grounded = false, ceiling = false;
    for (const ax of ['x', 'z'] as const) {
      if (!d[ax]) continue; p[ax] += d[ax]; const b = this.hits(p, r, h); if (!b) continue;
      const up = b.y1 - p.y;
      if (wasGrounded && up > 0 && up <= 0.45) { const y = p.y; p.y = b.y1; if (!this.hits(p, r, h)) continue; p.y = y; }
      p[ax] -= d[ax];
    }
    p.y += d.y; let b = this.hits(p, r, h), guard = 0;
    while (b && guard++ < 4) { if (d.y <= 0) { p.y = b.y1; grounded = true; } else { p.y = b.y0 - h; ceiling = true; } b = this.hits(p, r, h); }
    return { grounded, ceiling };
  }
}
