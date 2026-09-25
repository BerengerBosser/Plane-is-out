// Île 1 — « Plage du Crash » : relief, eau, végétation, bâtiments, lieux clés
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { fbm, rng, smoothstep, clamp } from './noise.js';

const R = CFG.island.radius;

// ── Relief ──────────────────────────────────────────────────
function baseHeight(x, z) {
  const d = Math.hypot(x, z);
  const coast = (fbm(x * 0.011 + 3.1, z * 0.011 + 7.7) - 0.5) * 55;
  const t = 1 - (d + coast) / R;
  if (t < 0) {
    // haut-fond praticable à pied près du rivage, puis le large
    const h = t > -0.06 ? t * 25 : -1.5 + (t + 0.06) * 90;
    return Math.max(-16, h);
  }
  const land = smoothstep(0.03, 0.2, t);
  const beach = Math.min(t / 0.07, 1) * 1.3;
  const inland = Math.max(0, t - 0.07);
  const hill = 27 * Math.exp(-((x - 10) ** 2 + (z + 75) ** 2) / (2 * 34 * 34)) * land;
  const cape = 8 * Math.exp(-((x + 118) ** 2 + (z + 32) ** 2) / (2 * 28 * 28)) * land;
  const detail = (fbm(x * 0.035, z * 0.035) - 0.5) * 5 * land;
  return beach + inland * 14 + hill + cape + detail;
}

const pads = []; // zones aplanies (bâtiments)
function addPad(x, z, r) {
  pads.push({ x, z, r, h: baseHeight(x, z) });
}

function heightAt1(x, z) {
  let h = baseHeight(x, z);
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.8) {
      const w = 1 - smoothstep(p.r, p.r * 1.8, d);
      h = h + (p.h - h) * w;
    }
  }
  return h;
}

// Île 2 (position variable) : branchée par island2.js
let island2 = null;
export function setIsland2(i) { island2 = i; }
export function getIsland2() { return island2; }

let island3 = null;
export function setIsland3(i) { island3 = i; }
let island4 = null;
export function setIsland4(i) { island4 = i; }
export function heightAt(x, z) {
  const h = heightAt1(x, z);
  if (island2) {
    const dx = x - island2.cx, dz = z - island2.cz;
    if (dx * dx + dz * dz < island2.R2) return Math.max(h, island2.height(dx, dz));
  }
  if (island3) {
    const dx = x - island3.cx, dz = z - island3.cz;
    if (dx * dx + dz * dz < island3.R2) return Math.max(h, island3.height(dx, dz));
  }
  if (island4) {
    const dx = x - island4.cx, dz = z - island4.cz;
    if (dx * dx + dz * dz < island4.R2) return Math.max(h, island4.height(dx, dz));
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 0.6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return { gx: dx / (2 * e), gz: dz / (2 * e), s: Math.hypot(dx, dz) / (2 * e) };
}

// Cherche, le long d'une direction, la distance où la profondeur atteint `target`
function findAlongRay(angle, target, fromR = 40, toR = 260) {
  const cx = Math.cos(angle), cz = Math.sin(angle);
  for (let r = fromR; r < toR; r += 0.25) {
    if (heightAt(cx * r, cz * r) <= target) return r;
  }
  return toR;
}

// Ramène un point sur la terre ferme si besoin
function ensureLand(x, z, minH = 0.6) {
  let px = x, pz = z;
  for (let i = 0; i < 300 && heightAt(px, pz) < minH; i++) {
    const d = Math.hypot(px, pz) || 1;
    px -= (px / d) * 0.5;
    pz -= (pz / d) * 0.5;
  }
  return { x: px, z: pz };
}

// ── Lieux clés (calculés une fois) ──────────────────────────
export const LAYOUT = {};

function computeLayout() {
  // Cabanon et phare : aplanis
  LAYOUT.cabane = { x: -38, z: -8 };
  addPad(LAYOUT.cabane.x, LAYOUT.cabane.z, 5.5);

  const capeAngle = Math.atan2(-32, -118);
  const capeR = findAlongRay(capeAngle, 0.8) - 12;
  LAYOUT.lighthouse = { x: Math.cos(capeAngle) * capeR, z: Math.sin(capeAngle) * capeR };
  addPad(LAYOUT.lighthouse.x, LAYOUT.lighthouse.z, 4);

  // Crash : plage sud, l'avion finit dans le haut-fond, nez vers le large (+z)
  const crashAngle = Math.PI / 2;
  const rWet = findAlongRay(crashAngle, -0.75);
  LAYOUT.crash = { x: 0, z: rWet };
  const rBeach = findAlongRay(crashAngle, 0.9, 40, rWet);
  LAYOUT.beach = { x: 0, z: rBeach - 4 };

  // Pièces perdues pendant la chute (le long de la trajectoire nord → sud)
  const p = (x, z) => ensureLand(x, z);
  LAYOUT.parts = {
    wingL: p(28, -122),
    engineR: p(14, -70),
    dashboard: { x: LAYOUT.cabane.x + 0.6, z: LAYOUT.cabane.z - 0.4 },
    prop: p(-22, 48),
    floats: p(14, 104),
    engineL: p(-12, rBeach - 12),
  };
  LAYOUT.diable = { x: 7, z: rBeach - 6 };
  LAYOUT.campfire = { x: -7, z: rBeach - 8 };
  LAYOUT.wrench = ensureLand(12, rBeach - 13);
  LAYOUT.lantern = { x: LAYOUT.cabane.x - 1.7, z: LAYOUT.cabane.z - 1.2 };
  // crabes : plages tout autour de l'île
  LAYOUT.crabs = [0.9, 1.35, 2.2, 2.9, 3.6, 4.4, 5.3, 5.9].map((a) => {
    const r = findAlongRay(a, 0.9) - 3;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
  // ponton : plage sud-est
  const da = 0.55, dr = findAlongRay(da, 0.2);
  LAYOUT.dock = { x: Math.cos(da) * dr, z: Math.sin(da) * dr, a: da };
  // sentier : plage → cabanon → phare, et embranchement vers la colline
  LAYOUT.path = [
    [LAYOUT.beach.x - 4, LAYOUT.beach.z - 6], [-10, 100], [-24, 60], [-30, 25], [LAYOUT.cabane.x + 1, LAYOUT.cabane.z + 5],
    [-70, -18], [-100, -28], [LAYOUT.lighthouse.x + 6, LAYOUT.lighthouse.z + 2],
  ];
  LAYOUT.path2 = [[-30, 25], [-5, -20], [8, -52]];
  // crique du Crabe-Roi (nord-ouest), ruines sur la colline, campement abandonné
  const ca = -2.25, cr = findAlongRay(ca, 0.9) - 10;
  LAYOUT.cove = { x: Math.cos(ca) * cr, z: Math.sin(ca) * cr, a: ca };
  LAYOUT.ruins = { x: -14, z: -62 };
  LAYOUT.camp = { x: 44, z: -30 };
  // Caisse Hélios : projetée dans le haut-fond, à portée du treuil
  const cz = findAlongRay(Math.PI / 2 + 0.12, -0.9);
  LAYOUT.crate = { x: Math.cos(Math.PI / 2 + 0.12) * cz, z: Math.sin(Math.PI / 2 + 0.12) * cz };
}
computeLayout();

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
export function pathDist(x, z) {
  let d = 1e9;
  for (const P of [LAYOUT.path, LAYOUT.path2]) {
    for (let i = 0; i < P.length - 1; i++) d = Math.min(d, segDist(x, z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]));
  }
  return d;
}

// ── Aides géométrie low poly ────────────────────────────────
function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function prep(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (g.attributes.normal) g.deleteAttribute('normal');
  colorize(g, hex);
  g.computeVertexNormals();
  return g;
}
export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// ── Construction de la scène de l'île ──────────────────────
export function buildIsland(scene) {
  const colliders = [];   // cercles et boîtes pour le joueur
  const out = { colliders };

  // Terrain
  const S = CFG.island.size, seg = CFG.island.segments;
  let tg = new THREE.PlaneGeometry(S, S, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  tg = tg.toNonIndexed();
  tg.deleteAttribute('uv');
  tg.computeVertexNormals();
  const tp = tg.attributes.position, tn = tg.attributes.normal;
  const cols = new Float32Array(tp.count * 3);
  const r = rng(7);
  const c = new THREE.Color();
  const SAND = new THREE.Color('#ead7a0'), WET = new THREE.Color('#c7ae78'), DEEP = new THREE.Color('#1f5d70');
  const GRASS1 = new THREE.Color('#86b36c'), GRASS2 = new THREE.Color('#6f9f5b');
  const ROCK = new THREE.Color('#8f948a'), HIGH = new THREE.Color('#a3b77f'), PATH = new THREE.Color('#b99b6b');
  for (let i = 0; i < tp.count; i += 3) {
    const h = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3;
    const cx = (tp.getX(i) + tp.getX(i + 1) + tp.getX(i + 2)) / 3;
    const cz = (tp.getZ(i) + tp.getZ(i + 1) + tp.getZ(i + 2)) / 3;
    const ny = tn.getY(i);
    if (h < -0.15) c.copy(WET).lerp(DEEP, smoothstep(-0.5, -14, h));
    else if (h < 1.6) c.copy(SAND);
    else if (ny < 0.8) c.copy(ROCK);
    else if (h > 22) c.copy(HIGH);
    else c.copy(GRASS1).lerp(GRASS2, fbm(cx * 0.05, cz * 0.05));
    if (h > 1.3 && pathDist(cx, cz) < 1.6 + fbm(cx * 0.3, cz * 0.3) * 0.8) c.copy(PATH);
    const j = 0.96 + r() * 0.08;
    c.multiplyScalar(j);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, flatMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  out.terrain = terrain;

  // Fond marin au large
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ color: '#1f5d70' }));
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -16.5;
  scene.add(deep);

  // Zones à garder dégagées (pas d'arbres)
  const clear = [
    [LAYOUT.cabane.x, LAYOUT.cabane.z, 9],
    [LAYOUT.lighthouse.x, LAYOUT.lighthouse.z, 8],
    [LAYOUT.campfire.x, LAYOUT.campfire.z, 10],
    [LAYOUT.crash.x, LAYOUT.crash.z, 16],
    ...Object.values(LAYOUT.parts).map((p) => [p.x, p.z, 7]),
    [LAYOUT.cove.x, LAYOUT.cove.z, 22],
    [LAYOUT.ruins.x, LAYOUT.ruins.z, 9],
    [LAYOUT.camp.x, LAYOUT.camp.z, 8],
    [LAYOUT.wrench.x, LAYOUT.wrench.z, 3],
    [LAYOUT.dock.x, LAYOUT.dock.z, 12],
  ];
  const isClear = (x, z) => clear.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > cr);
  out.isClear = isClear;

  // Arbres (instanciés)
  const pine = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 5).translate(0, 0.8, 0), '#7a5a3f'),
    prep(new THREE.ConeGeometry(1.35, 2.6, 6).translate(0, 2.5, 0), '#4f8a4f'),
    prep(new THREE.ConeGeometry(0.95, 2.1, 6).translate(0, 3.7, 0), '#5a9a57'),
  ]);
  const round = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.18, 0.26, 1.8, 5).translate(0, 0.9, 0), '#7f5d40'),
    prep(new THREE.IcosahedronGeometry(1.55, 0).translate(0, 2.9, 0), '#78a95c'),
  ]);
  const rockGeo = prep(new THREE.DodecahedronGeometry(1, 0), '#9a9d95');

  const trees = { pine: [], round: [] }, rocks = [];
  const tr = rng(42);
  for (let i = 0; i < 4000 && trees.pine.length + trees.round.length < 560; i++) {
    const x = (tr() - 0.5) * 2 * (R + 20), z = (tr() - 0.5) * 2 * (R + 20);
    const h = heightAt(x, z);
    if (h < 2.2 || h > 26) continue;
    if (slopeAt(x, z).s > 0.7 || !isClear(x, z) || pathDist(x, z) < 3) continue;
    // densité : forêt au centre-ouest, clairsemé ailleurs
    const dens = fbm(x * 0.02 + 11, z * 0.02 - 4);
    if (tr() > dens * 1.7 - 0.2) continue;
    const s = 1.5 + tr() * 1.3;
    (tr() < 0.68 ? trees.pine : trees.round).push({ x, y: h - 0.1, z, s, ry: tr() * 6.28 });
    colliders.push({ type: 'circle', x, z, r: 0.32 * s, top: h + 6.5 * s, tree: true });
  }
  for (let i = 0; i < 500 && rocks.length < 110; i++) {
    const x = (tr() - 0.5) * 2 * (R + 10), z = (tr() - 0.5) * 2 * (R + 10);
    const h = heightAt(x, z);
    if (h < 0.4 || !isClear(x, z)) continue;
    const s = 0.4 + tr() * 1.3;
    rocks.push({ x, y: h + s * 0.15, z, s, ry: tr() * 6.28 });
    if (s > 0.8) colliders.push({ type: 'circle', x, z, r: s * 0.85 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  const tint = new THREE.Color();
  function instanced(geo, list, squash = 1) {
    const im = new THREE.InstancedMesh(geo, flatMat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.ry);
      sc.set(t.s, t.s * squash, t.s);
      v.set(t.x, t.y, t.z);
      m4.compose(v, q, sc);
      im.setMatrixAt(i, m4);
      tint.setHSL(0, 0, 0.9 + ((i * 37) % 20) / 100);
      im.setColorAt(i, tint);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  instanced(pine, trees.pine);
  instanced(round, trees.round);
  instanced(rockGeo, rocks, 0.65);
  out.treeList = [...trees.pine, ...trees.round];

  // ── Cabanon du gardien (porte verrouillée, toit troué) ──
  const cab = new THREE.Group();
  const cb = LAYOUT.cabane, ch = heightAt(cb.x, cb.z);
  cab.position.set(cb.x, ch, cb.z);
  const W = 5.2, D = 4.2, H = 2.6, T = 0.2;
  const wood = '#b07b52', dark = '#6d4b37';
  const wall = (w, h, d, x, y, z, col = wood) => {
    const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
    m.position.set(x, y, z);
    cab.add(m);
    return m;
  };
  wall(W, H, T, 0, H / 2, -D / 2);
  wall(T, H, D, -W / 2, H / 2, 0);
  wall(T, H, D, W / 2, H / 2, 0);
  const side = (W - 1.3) / 2;
  wall(side, H, T, -W / 2 + side / 2, H / 2, D / 2);
  wall(side, H, T, W / 2 - side / 2, H / 2, D / 2);
  wall(1.3, H - 2.2, T, 0, 2.2 + (H - 2.2) / 2, D / 2);
  wall(W + 0.3, 0.12, D + 0.3, 0, 0.06, 0, '#8c6446'); // plancher
  // toit à deux pans, un pan troué
  // toit à deux pans (faîtage au centre, pans qui descendent vers l'avant et l'arrière)
  const roofL = wall(W + 0.6, 0.18, D / 2 + 0.7, 0, H + 0.55, -D / 4 - 0.15, dark);
  roofL.rotation.x = -0.42;
  const roofR1 = wall((W + 0.6) * 0.45, 0.18, D / 2 + 0.7, -(W + 0.6) * 0.275, H + 0.55, D / 4 + 0.15, dark);
  roofR1.rotation.x = 0.42;
  const roofR2 = wall((W + 0.6) * 0.25, 0.18, D / 2 + 0.7, (W + 0.6) * 0.375, H + 0.55, D / 4 + 0.15, dark);
  roofR2.rotation.x = 0.42;
  // pignons triangulaires (côtés gauche et droit)
  const tri = new THREE.Shape();
  tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, 1.05); tri.closePath();
  for (const sx of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    const m = new THREE.Mesh(prep(g, wood), flatMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(sx * W / 2 - T / 2, H, 0);
    cab.add(m);
  }
  // tas de bois et clôture
  for (let i = 0; i < 9; i++) {
    const lg = wall(0.22, 0.22, 1.4, 0, 0, 0, i % 2 ? '#8a5a3a' : '#9b6a45');
    lg.geometry = prep(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6).rotateX(Math.PI / 2), i % 2 ? '#8a5a3a' : '#9b6a45');
    lg.position.set(W / 2 + 0.6 + (i % 3) * 0.26, 0.13 + Math.floor(i / 3) * 0.22, -0.8);
  }
  for (let i = 0; i < 8; i++) {
    const post = wall(0.12, 1.0, 0.12, -W / 2 - 2 + i * 1.4, 0.5, D / 2 + 3.2, '#8c6446');
    post.rotation.z = (i % 3 - 1) * 0.05;
  }
  const rail = wall(9.8, 0.08, 0.06, -W / 2 - 2 + 4.9, 0.8, D / 2 + 3.2, '#8c6446');
  rail.rotation.z = 0.01;
  // planches arrachées au sol
  for (let i = 0; i < 3; i++) {
    const pl = wall(1.4, 0.08, 0.3, 1.2 + i * 0.4, 0.1, 1.0 - i * 0.5, dark);
    pl.rotation.y = i * 0.9;
  }
  // porte (pivote sur sa charnière)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.65, 0, D / 2);
  const door = new THREE.Mesh(prep(new THREE.BoxGeometry(1.3, 2.2, 0.1), '#7c5335'), flatMat);
  door.position.set(0.65, 1.1, 0);
  doorPivot.add(door);
  const lock = new THREE.Mesh(prep(new THREE.BoxGeometry(0.16, 0.22, 0.12), '#c9a64a'), flatMat);
  lock.position.set(1.1, 1.05, 0.09);
  doorPivot.add(lock);
  // mot punaisé sur la porte
  const note = new THREE.Mesh(prep(new THREE.BoxGeometry(0.34, 0.42, 0.02), '#f4ecd6'), flatMat);
  note.position.set(0.5, 1.5, 0.07);
  doorPivot.add(note);
  cab.add(doorPivot);
  cab.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(cab);
  out.cabin = { group: cab, doorPivot, lock, note, pos: new THREE.Vector3(cb.x, ch, cb.z + D / 2 + 0.2) };
  const bx = (x0, x1, z0, z1) => ({ type: 'box', minX: cb.x + x0, maxX: cb.x + x1, minZ: cb.z + z0, maxZ: cb.z + z1 });
  colliders.push(bx(-W / 2, W / 2, -D / 2 - T / 2, -D / 2 + T / 2));
  colliders.push(bx(-W / 2 - T / 2, -W / 2 + T / 2, -D / 2, D / 2));
  colliders.push(bx(W / 2 - T / 2, W / 2 + T / 2, -D / 2, D / 2));
  colliders.push(bx(-W / 2, -0.65, D / 2 - T / 2, D / 2 + T / 2));
  colliders.push(bx(0.65, W / 2, D / 2 - T / 2, D / 2 + T / 2));
  const doorCol = bx(-0.65, 0.65, D / 2 - T / 2, D / 2 + T / 2);
  colliders.push(doorCol);
  out.cabin.doorCollider = doorCol;

  // ── Phare en ruine (plaque avec l'année) ──
  const lh = LAYOUT.lighthouse, lhh = heightAt(lh.x, lh.z);
  const tower = new THREE.Group();
  tower.position.set(lh.x, lhh, lh.z);
  const tw = new THREE.Mesh(prep(new THREE.CylinderGeometry(1.9, 2.5, 11, 8).translate(0, 5.5, 0), '#efe9dc'), flatMat);
  tower.add(tw);
  const band = new THREE.Mesh(prep(new THREE.CylinderGeometry(2.08, 2.2, 1.4, 8).translate(0, 7.2, 0), '#c8553d'), flatMat);
  tower.add(band);
  const band2 = new THREE.Mesh(prep(new THREE.CylinderGeometry(2.3, 2.4, 1.2, 8).translate(0, 2.8, 0), '#c8553d'), flatMat);
  tower.add(band2);
  const top = new THREE.Mesh(prep(new THREE.CylinderGeometry(2.2, 2.0, 0.5, 8).translate(0, 11.2, 0), '#55504a'), flatMat);
  tower.add(top);
  // lanterne éteinte, vitres brisées
  const lamp = new THREE.Mesh(prep(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8, 1, true).translate(0, 12.2, 0), '#3b4a55'), flatMat);
  tower.add(lamp);
  // porte + plaque, orientée vers le centre de l'île
  const toCenter = Math.atan2(-lh.x, -lh.z);
  const face = new THREE.Group();
  face.rotation.y = toCenter;
  const tdoor = new THREE.Mesh(prep(new THREE.BoxGeometry(1.1, 2.0, 0.2), '#5b4636'), flatMat);
  tdoor.position.set(0, 1.0, 2.3);
  face.add(tdoor);
  const plaqueTex = textTexture(['PHARE DE LA POINTE', 'mis en service', 'en 1874'], '#2f3a40', '#e9dcb6', 256, 160);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshBasicMaterial({ map: plaqueTex }));
  plaque.position.set(0.95, 1.55, 2.37);
  plaque.rotation.y = 0.2;
  face.add(plaque);
  tower.add(face);
  tower.traverse((o) => { if (o.isMesh && o !== plaque) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(tower);
  colliders.push({ type: 'circle', x: lh.x, z: lh.z, r: 2.6 });
  const pw = new THREE.Vector3(0.95, 1.55, 2.37).applyAxisAngle(new THREE.Vector3(0, 1, 0), toCenter);
  out.plaquePos = new THREE.Vector3(lh.x + pw.x, lhh + 1.55, lh.z + pw.z);

  // ── Feu de débris près de l'épave (source de lumière de nuit) ──
  const cf = LAYOUT.campfire, cfh = heightAt(cf.x, cf.z);
  const fire = new THREE.Group();
  fire.position.set(cf.x, cfh, cf.z);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 5), '#5e4130'), flatMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 4;
    log.position.y = 0.12;
    fire.add(log);
  }
  for (let i = 0; i < 8; i++) {
    const st = new THREE.Mesh(prep(new THREE.DodecahedronGeometry(0.22, 0), '#7c7f78'), flatMat);
    const a = (i / 8) * Math.PI * 2;
    st.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85);
    fire.add(st);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 5), flameMat);
  flame.position.y = 0.6;
  fire.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.8, 5), new THREE.MeshBasicMaterial({ color: '#fff0a0' }));
  flame2.position.y = 0.55;
  fire.add(flame2);
  const fireLight = new THREE.PointLight('#ff9a40', 0, 22, 1.4);
  fireLight.position.y = 1.4;
  fire.add(fireLight);
  scene.add(fire);
  out.fire = { group: fire, flame, flame2, light: fireLight, pos: new THREE.Vector3(cf.x, cfh, cf.z) };

  // Débris décoratifs sur la plage
  const dr = rng(99);
  for (let i = 0; i < 9; i++) {
    const a = dr() * Math.PI * 2, d = 4 + dr() * 14;
    const x = LAYOUT.beach.x + Math.cos(a) * d, z = LAYOUT.beach.z + Math.sin(a) * d * 0.6;
    const h = heightAt(x, z);
    if (h < 0.1) continue;
    const m = new THREE.Mesh(prep(new THREE.BoxGeometry(0.4 + dr() * 0.9, 0.08, 0.3 + dr() * 0.6), dr() < 0.5 ? '#d9cfb8' : '#b04a38'), flatMat);
    m.position.set(x, h + 0.05, z);
    m.rotation.set(dr() * 0.3, dr() * 6, dr() * 0.3);
    scene.add(m);
  }

  return out;
}

// Texture de texte (plaques, panneaux) : la taille s'ajuste pour que chaque ligne tienne en largeur
export function textTexture(lines, bg, fg, w = 256, h = 128) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = Math.max(3, h / 40); g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    let size = (h / (lines.length + 0.6)) * (i === 0 ? 0.66 : 0.56);
    const font = (sz) => `bold ${Math.round(sz)}px "Bricolage Grotesque", "Trebuchet MS", Arial, sans-serif`;
    g.font = font(size);
    while (size > 6 && g.measureText(l).width > w * 0.86) { size *= 0.92; g.font = font(size); }
    g.fillText(l, w / 2, h * ((i + 0.8) / (lines.length + 0.6)));
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Panneau sur pied : planche épaisse, texte lisible des deux côtés, montants DERRIÈRE la planche
// (origine du groupe : au sol, au centre). opts : { bg, fg, w, h, cw, ch, y (hauteur du centre), posts }
export function signBoard(lines, opts) {
  const { bg = '#b98b5e', fg = '#2c2346', w = 1.4, h = 0.5, cw = 512, ch = 160, y = 1.6, posts = 2, wood = '#6f5038', back = true } = opts;
  const g = new THREE.Group();
  const tex = textTexture(lines, bg, fg, cw, ch);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const board = new THREE.Mesh(prep(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.07), wood), flatMat);
  board.position.y = y;
  g.add(board);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  front.position.set(0, y, 0.037);
  g.add(front);
  if (back) {
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    bk.position.set(0, y, -0.037);
    bk.rotation.y = Math.PI;
    g.add(bk);
  }
  const top = y - h / 2 + 0.05;
  const xs = posts === 1 ? [0] : [-(w / 2 - Math.min(0.25, w * 0.15)), w / 2 - Math.min(0.25, w * 0.15)];
  for (const x of xs) {
    const p = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.06, 0.075, top + 0.4, 6).translate(0, (top + 0.4) / 2 - 0.4, 0), wood), flatMat);
    p.position.set(x, 0, posts === 1 ? -0.1 : -0.09);
    g.add(p);
  }
  return g;
}

// Collisions automatiques : une boîte (AABB) par objet qui gêne le passage d'un personnage.
// On ignore le sol et les planchers (fins et larges), ce qui est au-dessus des têtes, les vitres,
// les grands volumes creux (hangars), et les objets marqués userData.noCollide ou dynamiques.
export function autoColliders(root, colliders, { skip = () => false, ground = heightAt } = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) {
      if (p.visible === false || p.userData.noCollide || p.userData.dynamic || skip(p)) return;
      if (p === root) break;
    }
    const m = o.material;
    if (!m || (m.transparent && m.opacity < 0.9) || m.depthWrite === false) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
    if (!Number.isFinite(w) || w > 40 || d > 40 || (w > 8 && d > 8)) return;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const gy = Math.max(ground(cx, cz), -1.3);
    if (box.max.y - gy < 0.35 || box.min.y - gy > 1.6) return;
    if (h < 0.3 && w > 0.3 && d > 0.3) return;           // plancher : on marche dessus
    colliders.push({ type: 'box', minX: box.min.x - 0.02, maxX: box.max.x + 0.02, minZ: box.min.z - 0.02, maxZ: box.max.z + 0.02, minY: box.min.y - 1.75, maxY: box.max.y - 0.3, top: box.max.y, bottom: box.min.y, auto: true });
    n++;
  });
  return n;
}

// fusionne les maillages statiques d'un groupe (même matériau) pour réduire les appels de dessin
export function mergeStatic(root, material, skip = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geos = [], remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.material !== material) return;
    for (let p = o; p && p !== root; p = p.parent) if (skip(p) || p.visible === false) return;
    const g = o.geometry.clone();
    if (!g.attributes.color || g.index) return;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    geos.push(g);
    remove.push(o);
  });
  if (geos.length < 2) return null;
  const merged = mergeGeometries(geos);
  if (!merged) return null;
  remove.forEach((o) => o.parent.remove(o));
  const m = new THREE.Mesh(merged, material);
  m.castShadow = m.receiveShadow = true;
  root.add(m);
  return m;
}

export { prep, colorize, clamp };
