// Salle du laser (poste de sécurité de Saint-Escale) : géométrie 2D pure, sans Three.js.
// Repère de la salle : u de 0 à W (ouest → est), v de 0 à D (sud → nord). La porte est au nord (u 5 → 7).
// Les miroirs s'orientent librement (angle continu) : le faisceau suit la vraie loi de la réflexion.
import { rng } from './noise.js';

export const LROOM = { w: 12, d: 10, doorU0: 5, doorU1: 7 };
export const MIRROR_HALF = 0.42;    // demi-largeur de la face réfléchissante (le miroir fait 85 cm)
export const SENSOR_HALF = 0.2;     // demi-largeur de la cellule du capteur
const EPS = 1e-6;

// intersection rayon (p, d) / segment [a, b] : distance le long du rayon, ou Infinity
function raySeg(pu, pv, du, dv, au, av, bu, bv) {
  const eu = bu - au, ev = bv - av;
  const den = du * ev - dv * eu;
  if (Math.abs(den) < EPS) return Infinity;
  const wu = au - pu, wv = av - pv;
  const t = (wu * ev - wv * eu) / den;
  const s = (wu * dv - wv * du) / den;
  return t > 1e-4 && s >= 0 && s <= 1 ? t : Infinity;
}
// intersection rayon / boîte alignée (pilier) vue de l'extérieur
function rayBox(pu, pv, du, dv, cu, cv, h) {
  let t0 = -Infinity, t1 = Infinity;
  for (const [p, d, lo, hi] of [[pu, du, cu - h, cu + h], [pv, dv, cv - h, cv + h]]) {
    if (Math.abs(d) < EPS) { if (p < lo || p > hi) return Infinity; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  return t0 <= t1 && t0 > 1e-4 ? t0 : Infinity;
}
function rayCircle(pu, pv, du, dv, cu, cv, r) {
  const wu = pu - cu, wv = pv - cv;
  const b = wu * du + wv * dv, c = wu * wu + wv * wv - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 1e-4 ? t : Infinity;
}
// rayon depuis l'intérieur de la salle jusqu'au mur
function rayWalls(pu, pv, du, dv) {
  let t = Infinity;
  if (du > EPS) t = Math.min(t, (LROOM.w - pu) / du); else if (du < -EPS) t = Math.min(t, -pu / du);
  if (dv > EPS) t = Math.min(t, (LROOM.d - pv) / dv); else if (dv < -EPS) t = Math.min(t, -pv / dv);
  return t;
}
export function sensorEnds(s) {
  const tu = -s.nv, tv = s.nu;   // tangente au mur
  return [s.u - tu * SENSOR_HALF, s.v - tv * SENSOR_HALF, s.u + tu * SENSOR_HALF, s.v + tv * SENSOR_HALF];
}

// tracé du faisceau : mirrors = [{ u, v, a }] (a = angle du miroir, comme rotation.y), blockers = [{ u, v, r }] (joueurs, caisses…)
export function traceBeam(L, mirrors, blockers = [], maxBounce = 10) {
  let pu = L.emitter.u + 0.3, pv = L.emitter.v, du = 1, dv = 0, last = null;
  const segs = [];
  let lit = false, end = 'wall';
  const se = sensorEnds(L.sensor);
  for (let n = 0; n <= maxBounce; n++) {
    let best = rayWalls(pu, pv, du, dv), hit = null;
    end = 'wall';
    for (const [cu, cv, h] of L.pillars) { const t = rayBox(pu, pv, du, dv, cu, cv, h); if (t < best) { best = t; hit = null; end = 'pillar'; } }
    for (const b of blockers) { const t = rayCircle(pu, pv, du, dv, b.u, b.v, b.r); if (t < best) { best = t; hit = null; end = 'body'; } }
    for (const m of mirrors) {
      if (m === last) continue;
      const mu = Math.cos(m.a), mv = -Math.sin(m.a);
      const t = raySeg(pu, pv, du, dv, m.u - mu * MIRROR_HALF, m.v - mv * MIRROR_HALF, m.u + mu * MIRROR_HALF, m.v + mv * MIRROR_HALF);
      if (t < best) { best = t; hit = m; end = 'mirror'; }
    }
    { const t = raySeg(pu, pv, du, dv, se[0], se[1], se[2], se[3]); if (t <= best + 1e-3) { best = t; hit = 'sensor'; end = 'sensor'; } }
    const qu = pu + du * best, qv = pv + dv * best;
    segs.push([pu, pv, qu, qv]);
    if (hit === 'sensor') { lit = true; break; }
    if (!hit) break;
    // réflexion : d' = 2 (d·m) m − d, m = direction du plan du miroir
    const mu = Math.cos(hit.a), mv = -Math.sin(hit.a), dot = du * mu + dv * mv;
    const nu = 2 * dot * mu - du, nv = 2 * dot * mv - dv, len = Math.hypot(nu, nv) || 1;
    du = nu / len; dv = nv / len; pu = qu; pv = qv; last = hit;
  }
  return { segs, lit, end };
}

// ligne de vue dégagée entre deux points (piliers seulement, avec une petite marge)
function clear(L, au, av, bu, bv, margin = 0.08) {
  const du = bu - au, dv = bv - av, len = Math.hypot(du, dv);
  if (len < 0.01) return false;
  for (const [cu, cv, h] of L.pillars) if (rayBox(au, av, du / len, dv / len, cu, cv, h + margin) < len) return false;
  return true;
}
// angle du miroir qui renvoie un faisceau de direction (du, dv) vers (tu, tv) : la bissectrice
export function mirrorAngleFor(du, dv, tu, tv) {
  const l = Math.hypot(tu, tv); tu /= l; tv /= l;
  const mu = du + tu, mv = dv + tv;           // la direction du miroir est la bissectrice de -d… et de t
  return Math.atan2(-mv, mu);
}

// salle tirée au sort pour la partie : toujours soluble avec deux miroirs, jamais avec un seul
export function makeLaserRoom(seed) {
  const r = rng((seed ^ 0x1a5e7) >>> 0);
  const R = (a, b) => a + r() * (b - a);
  for (let tries = 0; tries < 400; tries++) {
    const ev = [1.8, 2.2, 5.0, 5.6][Math.floor(r() * 4)];
    const emitter = { u: 0.35, v: ev };
    // capteur : mur est (hors du coffre, v 2,4 → 4), mur sud, ou mur nord (hors de la porte)
    const side = Math.floor(r() * 3);
    let sensor;
    if (side === 0) { const v = r() < 0.7 ? R(5.4, 8.8) : R(0.8, 1.6); sensor = { u: LROOM.w - 0.35, v, nu: -1, nv: 0 }; }
    else if (side === 1) sensor = { u: R(3.2, 10.8), v: 0.35, nu: 0, nv: 1 };
    else sensor = { u: R(8.3, 11), v: LROOM.d - 0.35, nu: 0, nv: -1 };
    if (Math.abs(sensor.v - ev) < 0.8) continue;
    // socles : un sur la ligne de l'émetteur, les autres répartis
    const sockets = [[+R(2.6, 8.5).toFixed(2), ev]];
    let guard = 0;
    while (sockets.length < 6 && guard++ < 200) {
      const u = +R(1.6, 10.4).toFixed(2), v = +R(1.3, 8.7).toFixed(2);
      if (Math.abs(v - ev) < 0.7) continue;
      if (u > 4.3 && u < 7.7 && v > 7.6) continue;                  // passage de la porte
      if (sockets.some(([a, b]) => Math.hypot(a - u, b - v) < 1.8)) continue;
      sockets.push([u, v]);
    }
    if (sockets.length < 5) continue;
    const pillars = [];
    guard = 0;
    while (pillars.length < 3 && guard++ < 200) {
      const h = +R(0.45, 0.65).toFixed(2), u = +R(2, 10.2).toFixed(2), v = +R(1.4, 8.6).toFixed(2);
      if (u > 4 && u < 8 && v > 7.2) continue;
      if (u - h < 1.1 && Math.abs(v - ev) < h + 0.4) continue;         // devant l'émetteur
      if (sockets.some(([a, b]) => Math.hypot(a - u, b - v) < h + 1.0)) continue;
      if (pillars.some(([a, b, hh]) => Math.hypot(a - u, b - v) < h + hh + 1.2)) continue;
      if (Math.hypot(sensor.u - u, sensor.v - v) < 2) continue;
      pillars.push([u, v, h]);
    }
    if (pillars.length < 3) continue;
    const L = { emitter, sensor, sockets, pillars };
    const [s0u, s0v] = sockets[0];
    if (!clear(L, emitter.u + 0.3, ev, s0u, s0v)) continue;
    // un seul miroir ne doit pas suffire
    if (clear(L, s0u, s0v, sensor.u, sensor.v, 0.02)) continue;
    // au moins une solution à deux miroirs (sans repasser en ligne droite)
    const sols = [];
    for (let j = 1; j < sockets.length; j++) {
      const [bu, bv] = sockets[j];
      if (!clear(L, s0u, s0v, bu, bv) || !clear(L, bu, bv, sensor.u, sensor.v)) continue;
      if (bu <= s0u + 0.3 && Math.abs(bv - s0v) < 0.3) continue;
      // incidence pas trop rasante sur le capteur
      const cu = sensor.u - bu, cv = sensor.v - bv, cl = Math.hypot(cu, cv);
      if (-(cu * sensor.nu + cv * sensor.nv) / cl < 0.25) continue;
      sols.push(j);
    }
    if (!sols.length || sols.length > 3) continue;
    // vérification par le tracé réel (angles exacts)
    const j = sols[0], [bu, bv] = sockets[j];
    const a0 = mirrorAngleFor(1, 0, bu - s0u, bv - s0v);
    const l1 = Math.hypot(bu - s0u, bv - s0v);
    const a1 = mirrorAngleFor((bu - s0u) / l1, (bv - s0v) / l1, sensor.u - bu, sensor.v - bv);
    const tr = traceBeam(L, [{ u: s0u, v: s0v, a: a0 }, { u: bu, v: bv, a: a1 }]);
    if (!tr.lit) continue;
    L.solution = [0, j];
    return L;
  }
  // repli : l'ancienne salle, soluble à coup sûr
  return {
    emitter: { u: 0.35, v: 2 }, sensor: { u: 11.65, v: 7, nu: -1, nv: 0 },
    sockets: [[3, 2], [6, 2], [3, 7], [6, 7], [9, 4.6]], pillars: [[9, 2, 0.6], [3, 5, 0.6], [8.5, 8.6, 0.5]], solution: [1, 4],
  };
}
