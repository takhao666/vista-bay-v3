// Vista Bay — deterministic RNG and small math helpers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// Circle (x,z,r) vs axis-aligned box {minX,maxX,minZ,maxZ}; returns push-out vector or null.
export function circleVsBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: -(pl + r), z: 0 };
  if (m === pr) return { x: pr + r, z: 0 };
  if (m === pt) return { x: 0, z: -(pt + r) };
  return { x: 0, z: pb + r };
}
