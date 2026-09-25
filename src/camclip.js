// Caméra extérieure (véhicules, passager, poursuite de l'avion) : elle ne traverse plus les murs.
// On lance un segment de la cible vers la position voulue contre les colliders (boîtes des bâtiments, cercles),
// et la caméra se rapproche d'un coup devant l'obstacle, puis reprend sa distance en douceur une fois dégagée.
import * as THREE from 'three';

const PAD = 0.4, MIN = 1.2;
const _d = new THREE.Vector3();

// segment o + d·t (t ∈ [0,1]) contre une boîte alignée : t d'entrée, ou null (départ à l'intérieur = ignoré)
function segBox(o, d, x0, x1, y0, y1, z0, z1) {
  let t0 = 0, t1 = 1;
  const ax = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [p, v, lo, hi] of ax) {
    if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / v, b = (hi - p) / v;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0 > 1e-4 ? t0 : null;
}
// segment contre un cylindre vertical (cercle au sol, entre bas et haut)
function segCyl(o, d, cx, cz, r, y0, y1) {
  const fx = o.x - cx, fz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - r * r;
  if (c < 0) return null;   // la cible est dedans
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : null;
}

export const CamClipMixin = {
  // `key` : état de lissage propre à chaque caméra ; `tgt` : point regardé ; `pos` : position voulue (modifiée)
  camClip(key, tgt, pos, dt, { ignoreVeh = null, cols = null } = {}) {
    _d.subVectors(pos, tgt);
    const len = _d.length();
    if (len < MIN) return pos;
    const list = cols || this.colliders.concat(this.blockCols || [], this.vehicleCols || []);
    const lo = { x: Math.min(tgt.x, pos.x) - 1, z: Math.min(tgt.z, pos.z) - 1 }, hi = { x: Math.max(tgt.x, pos.x) + 1, z: Math.max(tgt.z, pos.z) + 1 };
    let tMin = 1;
    for (const c of list) {
      if (!c || c.disabled || c.tree || (ignoreVeh && c.veh === ignoreVeh)) continue;
      let t = null;
      if (c.type === 'circle') {
        if (c.r < 0.6) continue;   // poteaux, troncs fins : on ne saute pas pour si peu
        if (c.x + c.r < lo.x || c.x - c.r > hi.x || c.z + c.r < lo.z || c.z - c.r > hi.z) continue;
        const y0 = c.minY !== undefined ? c.minY + 1.7 : -50, y1 = c.top ?? (c.maxY !== undefined ? c.maxY + 0.3 : 50);
        t = segCyl(tgt, _d, c.x, c.z, c.r, y0, y1);
      } else if (c.minX !== undefined) {
        if (c.maxX < lo.x || c.minX > hi.x || c.maxZ < lo.z || c.minZ > hi.z) continue;
        const y0 = c.bottom ?? (c.minY !== undefined ? c.minY + 1.75 : -50), y1 = c.top ?? (c.maxY !== undefined ? c.maxY + 0.3 : 50);
        t = segBox(tgt, _d, c.minX, c.maxX, y0, y1, c.minZ, c.maxZ);
      }
      if (t !== null && t < tMin) tMin = t;
    }
    const want = Math.max(MIN, tMin * len - (tMin < 1 ? PAD : 0));
    this._camClip = this._camClip || {};
    let cur = this._camClip[key] ?? want;
    cur = want < cur ? want : cur + (want - cur) * Math.min(1, dt * 2.5);   // rentre d'un coup, ressort doucement
    this._camClip[key] = cur;
    if (cur < len - 1e-3) pos.copy(tgt).addScaledVector(_d, cur / len);
    return pos;
  },
};
