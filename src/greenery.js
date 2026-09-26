// Végétation et petites maisons des îles 2 à 4 : arbres selon le climat, buissons, herbes et fleurs au vent,
// rochers, haies d'arbres en bordure des aéroports, hameaux de maisons basses.
// Tout est placé en coordonnées locales de l'île (groupe centré en cx, cz), à l'écart des zones de jeu
// (pistes et couloirs d'approche, rampes, quais, bâtiments existants) décrites par `avoid`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep, flatMat } from './terrain.js';
import { rng, fbm } from './noise.js';
import { makeColGrid } from './colgrid.js';
import { swayMaterial, WIND } from './decor.js';

const PI = Math.PI;
const P = (geo, col) => prep(geo, col);
const merge = (list) => mergeGeometries(list);

// ── essences (hauteur approximative pour les collisions de l'avion) ──
function blade(h, col, a) { return P(new THREE.ConeGeometry(0.06, h, 3).translate(0, h / 2, 0).rotateZ(a), col); }
const tuftOf = (c1, c2, c3, k = 1) => merge([blade(0.55 * k, c1, 0.2), blade(0.45 * k, c2, -0.25).rotateY(1.2), blade(0.5 * k, c3, 0.1).rotateY(2.3)]);
const bushOf = (a, b, c) => merge([
  P(new THREE.IcosahedronGeometry(0.8, 0).translate(0, 0.5, 0), a),
  P(new THREE.IcosahedronGeometry(0.6, 0).translate(0.55, 0.4, 0.2), b),
  P(new THREE.IcosahedronGeometry(0.55, 0).translate(-0.5, 0.35, -0.15), c),
]);
const flowerOf = (stem) => merge([
  P(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 3).translate(0, 0.17, 0), stem),
  P(new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.38, 0), '#ffffff'),
]);
const TREES = {
  palm: () => {
    const g = [];
    let x = 0, y = 0;
    for (let k = 0; k < 4; k++) { g.push(P(new THREE.CylinderGeometry(0.17 - k * 0.015, 0.22 - k * 0.015, 1.45, 6).translate(x, y + 0.72, 0).rotateZ(-0.05 * k), k % 2 ? '#9a7a55' : '#8a6a48')); x += 0.14 * k; y += 1.4; }
    for (let k = 0; k < 7; k++) g.push(P(new THREE.BoxGeometry(2.8, 0.06, 0.55).translate(1.35, 0, 0).rotateZ(-0.35 - (k % 2) * 0.15).rotateY((k / 7) * PI * 2).translate(x, y, 0), k % 2 ? '#4f9a57' : '#62b061'));
    for (let k = 0; k < 3; k++) g.push(P(new THREE.IcosahedronGeometry(0.16, 0).translate(x + Math.cos(k * 2.1) * 0.25, y - 0.2, Math.sin(k * 2.1) * 0.25), '#6d4b2a'));
    return { geo: merge(g), h: 6.2 };
  },
  acacia: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 5).translate(0, 1.3, 0), '#7a5e44'),
    P(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 4).rotateZ(0.7).translate(0.55, 2.8, 0), '#7a5e44'),
    P(new THREE.CylinderGeometry(0.08, 0.12, 1.5, 4).rotateZ(-0.7).translate(-0.5, 2.7, 0.1), '#7a5e44'),
    P(new THREE.IcosahedronGeometry(2.3, 1).scale(1, 0.28, 1).translate(0, 3.6, 0), '#7d9a4a'),
    P(new THREE.IcosahedronGeometry(1.5, 0).scale(1, 0.3, 1).translate(0.9, 3.9, 0.4), '#8aa855'),
  ]), h: 4.2 }),
  pine: (dark) => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 5).translate(0, 0.8, 0), '#6a4a34'),
    P(new THREE.ConeGeometry(1.35, 2.6, 6).translate(0, 2.5, 0), dark ? '#2f5a3a' : '#4f8a4f'),
    P(new THREE.ConeGeometry(0.95, 2.1, 6).translate(0, 3.7, 0), dark ? '#3a6a44' : '#5a9a57'),
    P(new THREE.ConeGeometry(0.55, 1.4, 6).translate(0, 4.7, 0), dark ? '#447a4c' : '#66a862'),
  ]), h: 5.4 }),
  burnt: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.14, 0.24, 4.6, 5).translate(0, 2.3, 0), '#2a2624'),
    P(new THREE.ConeGeometry(0.9, 1.6, 5).translate(0, 3.9, 0), '#3f4a30'),
    P(new THREE.ConeGeometry(0.6, 1.2, 5).translate(0, 4.8, 0), '#4a5636'),
  ]), h: 5.4 }),
  umbrella: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.18, 0.3, 4.6, 6).rotateZ(0.08).translate(-0.15, 2.3, 0), '#8a6a4f'),
    P(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 4).rotateZ(0.8).translate(0.5, 4.4, 0), '#8a6a4f'),
    P(new THREE.IcosahedronGeometry(2.6, 1).scale(1, 0.34, 1).translate(0.1, 5.1, 0), '#4f7a3f'),
    P(new THREE.IcosahedronGeometry(1.7, 0).scale(1, 0.4, 1).translate(1.0, 5.5, 0.6), '#5d8a4a'),
  ]), h: 5.9 }),
  cypress: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 5).translate(0, 0.4, 0), '#6a4a34'),
    P(new THREE.CylinderGeometry(0.25, 0.75, 5.8, 7).translate(0, 3.5, 0), '#3a5f36'),
    P(new THREE.ConeGeometry(0.25, 0.8, 7).translate(0, 6.8, 0), '#3a5f36'),
  ]), h: 7 }),
  olive: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.2, 0.34, 1.6, 5).rotateZ(0.15).translate(0, 0.8, 0), '#6d5a48'),
    P(new THREE.IcosahedronGeometry(1.5, 0).scale(1.1, 0.75, 1.1).translate(0.15, 2.3, 0), '#8aa06a'),
    P(new THREE.IcosahedronGeometry(1.0, 0).translate(-0.7, 2.1, 0.5), '#9aae7a'),
  ]), h: 3.2 }),
  round: () => ({ geo: merge([
    P(new THREE.CylinderGeometry(0.18, 0.26, 1.8, 5).translate(0, 0.9, 0), '#7f5d40'),
    P(new THREE.IcosahedronGeometry(1.55, 0).translate(0, 2.9, 0), '#78a95c'),
  ]), h: 4.4 }),
};
const agave = () => merge(Array.from({ length: 9 }, (_, k) => P(new THREE.ConeGeometry(0.12, 1.2, 3).translate(0, 0.6, 0).rotateZ(0.55 + (k % 3) * 0.15).rotateY((k / 9) * PI * 2), k % 2 ? '#6f9a7a' : '#7fae88')));
const fern = () => merge(Array.from({ length: 6 }, (_, k) => P(new THREE.BoxGeometry(0.9, 0.03, 0.22).translate(0.45, 0, 0).rotateZ(0.5).rotateY((k / 6) * PI * 2), k % 2 ? '#4f7a3a' : '#5d8a44')));

// ── climats ──
const BIOMES = {
  arid: {
    trees: [['palm', 0.55], ['acacia', 0.45]], shore: 'palm',
    bushes: bushOf('#8a9a5a', '#9aa866', '#7a8a4c'), bloom: bushOf('#c8508a', '#d86a9a', '#5f8a4a'),
    small: agave, tuft: tuftOf('#b8b06a', '#c8c07a', '#a8a05a'), petals: ['#f5d04b', '#f08a5d', '#f4f0e6'], stem: '#7a8a4c',
    rock: '#c9a47a', walls: ['#f4efe4', '#f7f2e8', '#efe6d2', '#e9dcc0'], roofs: ['#2f6a9a', '#1f8a8a', '#f4efe4'], flat: true, doors: ['#2f6a9a', '#1f8a8a', '#c8553d'],
  },
  volcanic: {
    trees: [['pine', 0.6, true], ['burnt', 0.4]], shore: 'pine',
    bushes: bushOf('#4c5a36', '#56663e', '#43502f'), bloom: bushOf('#7a5a8a', '#8a6a9a', '#4c5a36'),
    small: fern, tuft: tuftOf('#7a8a4a', '#8a9656', '#6a7a40'), petals: ['#b69ae6', '#9a6aa8', '#e88fb0'], stem: '#4c5a36',
    rock: '#3a3230', walls: ['#4a4648', '#5a5456', '#6a625e'], roofs: ['#c8553d', '#1f8a8a', '#8a3a2a'], doors: ['#6d4b37', '#3a2a1e'],
  },
  med: {
    trees: [['umbrella', 0.35], ['cypress', 0.25], ['olive', 0.25], ['round', 0.15]], shore: 'umbrella',
    bushes: bushOf('#5d8f4c', '#6a9c56', '#557f45'), bloom: bushOf('#9a7ad8', '#b69ae6', '#5d8f4c'),
    small: fern, tuft: tuftOf('#6fa257', '#7db462', '#679a50'), petals: ['#b69ae6', '#f5d04b', '#f4f0e6', '#e88fb0'], stem: '#5f8f47',
    rock: '#b5a58c', walls: ['#f0e2c8', '#e8c9a8', '#f2d1c4', '#cddbc4', '#f3efe6'], roofs: ['#c8553d', '#b8472f', '#d8744a'], doors: ['#2f6a9a', '#6d4b37', '#1f8a8a'],
  },
};

// ── maison basse (géométries fusionnées, repère local de la maison) ──
function houseGeos(r, B) {
  const w = 5 + r() * 2.5, d = 4.5 + r() * 2, h = 2.8 + r() * 0.6;
  const wall = B.walls[Math.floor(r() * B.walls.length)], roof = B.roofs[Math.floor(r() * B.roofs.length)], door = B.doors[Math.floor(r() * B.doors.length)];
  const g = [];
  const box = (bw, bh, bd, col, x, y, z) => g.push(P(new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z), col));
  box(w, h, d, wall, 0, h / 2, 0);
  let top = h;
  if (B.flat) {
    // toit terrasse à acrotère, escalier extérieur
    box(w + 0.2, 0.3, d + 0.2, wall, 0, h + 0.15, 0);
    for (const [bw, bd, x, z] of [[w + 0.2, 0.2, 0, d / 2], [w + 0.2, 0.2, 0, -d / 2], [0.2, d + 0.2, w / 2, 0], [0.2, d + 0.2, -w / 2, 0]]) box(bw, 0.5, bd, wall, x, h + 0.55, z);
    if (r() < 0.6) { box(1.6, 1.2, 1.6, wall, w / 4, h + 0.9, -d / 4); g.push(P(new THREE.SphereGeometry(0.8, 8, 4, 0, PI * 2, 0, PI / 2).translate(w / 4, h + 1.5, -d / 4), roof)); }
    top = h + 1.2;
  } else {
    const rh = 1.4 + r() * 0.6;
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.35, 0), new THREE.Vector2(w / 2 + 0.35, 0), new THREE.Vector2(0, rh)]);
    g.push(P(new THREE.ExtrudeGeometry(sh, { depth: d + 0.5, bevelEnabled: false }).translate(0, h, -(d + 0.5) / 2), roof));
    box(0.5, 1.2, 0.5, '#8a8078', w * 0.25, h + rh * 0.6, d * 0.15);   // cheminée
    top = h + rh;
  }
  // porte, fenêtres (façade avant côté +z), volets
  box(0.95, 1.9, 0.08, door, -w * 0.18, 0.95, d / 2 + 0.03);
  box(1.3, 0.1, 0.5, '#8a8078', -w * 0.18, 0.05, d / 2 + 0.3);
  const win = (x, y, z, rot) => {
    const gw = P(new THREE.BoxGeometry(0.85, 0.85, 0.08).translate(0, 0, 0), '#2a3a55'); const fr = P(new THREE.BoxGeometry(1.0, 0.1, 0.12).translate(0, -0.48, 0), '#e9e4d8');
    const sl = P(new THREE.BoxGeometry(0.28, 0.85, 0.06).translate(-0.58, 0, 0), door), sr = P(new THREE.BoxGeometry(0.28, 0.85, 0.06).translate(0.58, 0, 0), door);
    for (const q of [gw, fr, sl, sr]) { q.rotateY(rot); q.translate(x, y, z); g.push(q); }
  };
  win(w * 0.22, 1.7, d / 2 + 0.04, 0);
  win(-w * 0.2, 1.7, -d / 2 - 0.04, PI);
  win(w * 0.2, 1.7, -d / 2 - 0.04, PI);
  win(w / 2 + 0.04, 1.7, 0, PI / 2);
  win(-w / 2 - 0.04, 1.7, 0, -PI / 2);
  return { geos: g, w, d, top };
}

// ── pose d'une liste en instances ──
function instances(group, geo, mat, list, shadow = true) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((o, i) => {
    q.setFromAxisAngle(up, o.ry); s.set(o.s, o.s * (o.sy || 1), o.s); p.set(o.x, o.y, o.z);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    c.setScalar(o.tint ?? 1); if (o.col) c.set(o.col);
    im.setColorAt(i, c);
  });
  im.castShadow = shadow; im.receiveShadow = true; im.userData.dynamic = true;
  group.add(im);
  return im;
}

/**
 * o : { group, cx, cz, height(x, z) local, colliders (monde), seed, biome, box: [x0, x1, z0, z1],
 *       avoid(x, z) → true si interdit, rows: [[xa, za, xb, zb, pas]] haies d'arbres (bordures d'aéroport),
 *       trees, bushes, grass, flowers, rocks, houses (nombres visés) }
 */
export function addGreenery(o) {
  const { group, cx, cz, height, colliders } = o;
  const B = BIOMES[o.biome];
  const r = rng(o.seed);
  const [X0, X1, Z0, Z1] = o.box;
  const grid = makeColGrid(colliders.slice());   // obstacles existants (bâtiments, mobilier, arbres d'origine)
  const blocked = (x, z, m) => grid.query(cx + x, cz + z, m + 0.5, []).some((c) => !c.disabled && (c.type === 'circle'
    ? Math.hypot(cx + x - c.x, cz + z - c.z) < c.r + m
    : cx + x > c.minX - m && cx + x < c.maxX + m && cz + z > c.minZ - m && cz + z < c.maxZ + m));
  const slope = (x, z) => Math.hypot(height(x + 0.8, z) - height(x - 0.8, z), height(x, z + 0.8) - height(x, z - 0.8)) / 1.6;
  // grille grossière des objets déjà posés (espacement minimal entre arbres et maisons)
  const taken = new Map();
  const tkey = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  const near = (x, z, d) => {
    const i0 = Math.floor((x - d) / 6), i1 = Math.floor((x + d) / 6), j0 = Math.floor((z - d) / 6), j1 = Math.floor((z + d) / 6);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const q of taken.get(`${i},${j}`) || []) if (Math.hypot(q[0] - x, q[1] - z) < d + q[2]) return true;
    return false;
  };
  const take = (x, z, rr) => { const k = tkey(x, z); if (!taken.has(k)) taken.set(k, []); taken.get(k).push([x, z, rr]); };
  const pick = () => [X0 + r() * (X1 - X0), Z0 + r() * (Z1 - Z0)];
  const ok = (x, z, h, minH, maxH, maxS) => h > minH && h < maxH && !o.avoid(x, z) && slope(x, z) < maxS;

  // ── maisons (d'abord : elles réservent leur jardin) ──
  const houseGeoList = [], houses = [];
  for (let i = 0; i < 4000 && houses.length < (o.houses || 0); i++) {
    const [x, z] = pick();
    const h = height(x, z);
    if (!ok(x, z, h, 1.6, 22, 0.35) || near(x, z, 16) || blocked(x, z, 7)) continue;
    const H = houseGeos(r, B);
    const rot = Math.floor(r() * 4) * PI / 2, sw = rot % PI ? H.d : H.w, sd = rot % PI ? H.w : H.d;
    // terrain assez plat sous l'emprise ?
    const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => height(x + a * sw / 2, z + b * sd / 2));
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 1.3 || lo < 1.0 || hs.some((q, k) => o.avoid(x + [-1, 1, -1, 1][k] * sw / 2, z + [-1, -1, 1, 1][k] * sd / 2))) continue;
    const base = hi + 0.05;
    const m4 = new THREE.Matrix4().makeRotationY(rot).setPosition(x, base, z);
    for (const g of H.geos) houseGeoList.push(g.applyMatrix4(m4));
    houseGeoList.push(P(new THREE.BoxGeometry(sw + 0.4, base - lo + 0.6, sd + 0.4).translate(x, (base + lo - 0.6) / 2, z), '#8a8078'));   // soubassement
    colliders.push({ type: 'box', minX: cx + x - sw / 2, maxX: cx + x + sw / 2, minZ: cz + z - sd / 2, maxZ: cz + z + sd / 2, top: base + H.top });
    take(x, z, Math.max(sw, sd) / 2 + 3);
    houses.push({ x, z, base, sw, sd, rot });
  }
  if (houseGeoList.length) { const hm = new THREE.Mesh(merge(houseGeoList), flatMat); hm.castShadow = hm.receiveShadow = true; hm.userData.dynamic = true; group.add(hm); }

  // ── arbres : bosquets (bruit), bord de mer, haies des aéroports ──
  const kinds = {};
  const tree = (kind, x, z, s, extra = 0) => {
    const h = height(x, z);
    (kinds[kind] = kinds[kind] || []).push({ x, y: h - 0.15, z, s, ry: r() * PI * 2, tint: 0.88 + r() * 0.22 });
    const T = kinds[kind].def || (kinds[kind].def = TREES[kind](kind === 'pine' && o.biome === 'volcanic'));
    colliders.push({ type: 'circle', x: cx + x, z: cz + z, r: 0.3 * s, top: h + T.h * s, tree: true });
    take(x, z, 1.4 * s + extra);
  };
  const choose = () => { let q = r(), acc = 0; for (const [k, p] of B.trees) { acc += p; if (q < acc) return k; } return B.trees[0][0]; };
  let nt = 0;
  for (let i = 0; i < 20000 && nt < (o.trees || 0); i++) {
    const [x, z] = pick();
    const h = height(x, z);
    const shore = h > 0.6 && h < 2.2;
    if (!ok(x, z, h, 0.6, 40, 0.75)) continue;
    const dens = fbm(x * 0.018 + o.seed % 97, z * 0.018 - 7);
    if (!shore && r() > dens * 1.8 - 0.25) continue;
    if (shore && r() > 0.35) continue;
    if (near(x, z, 2.2) || blocked(x, z, 2.5)) continue;
    tree(shore ? B.shore : choose(), x, z, 0.85 + r() * 0.6);
    nt++;
  }
  // haies d'arbres alignés (bords de piste, clôtures d'aéroport) : un arbre tous les `pas` mètres
  for (const [xa, za, xb, zb, step] of o.rows || []) {
    const L = Math.hypot(xb - xa, zb - za), n = Math.floor(L / step);
    const kind = B.trees[0][0];
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n), x = xa + (xb - xa) * t + (r() - 0.5) * 1.2, z = za + (zb - za) * t + (r() - 0.5) * 1.2;
      const h = height(x, z);
      if (h < 0.6 || near(x, z, 2) || blocked(x, z, 3)) continue;
      if (k % 3 === 1) { (kinds._rowBush = kinds._rowBush || []).push({ x, y: h - 0.1, z, s: 1.1 + r() * 0.5, sy: 0.8, ry: r() * 6.3, tint: 0.9 + r() * 0.2 }); take(x, z, 1); continue; }
      tree(k % 3 === 2 && B.trees[1] ? B.trees[1][0] : kind, x, z, 0.95 + r() * 0.35);
    }
  }
  for (const [kind, list] of Object.entries(kinds)) if (kind[0] !== '_') instances(group, list.def.geo, flatMat, list);

  // ── buissons, fleurs en massif, petites plantes (sans collision) ──
  const bushes = kinds._rowBush || [], blooms = [], smalls = [];
  for (let i = 0; i < 16000 && bushes.length < (o.bushes || 0); i++) {
    const [x, z] = pick(); const h = height(x, z);
    if (!ok(x, z, h, 0.9, 32, 0.7) || near(x, z, 0.8) || blocked(x, z, 1.2)) continue;
    const item = { x, y: h - 0.1, z, s: 0.6 + r() * 0.8, sy: 0.8, ry: r() * 6.3, tint: 0.85 + r() * 0.3 };
    if (r() < 0.22) blooms.push(item); else if (r() < 0.35) smalls.push({ ...item, s: 0.8 + r() * 0.6, sy: 1 }); else bushes.push(item);
    // un buisson attire ses voisins : petits massifs
    if (r() < 0.4) for (let k = 0; k < 2; k++) { const ax = x + (r() - 0.5) * 3, az = z + (r() - 0.5) * 3, ah = height(ax, az); if (ah > 0.9 && !o.avoid(ax, az) && !blocked(ax, az, 1)) bushes.push({ x: ax, y: ah - 0.1, z: az, s: 0.5 + r() * 0.6, sy: 0.8, ry: r() * 6.3, tint: 0.85 + r() * 0.3 }); }
  }
  instances(group, B.bushes, flatMat, bushes);
  instances(group, B.bloom, flatMat, blooms);
  instances(group, B.small(), swayMaterial(WIND, 0.1), smalls, false);

  // ── herbes et fleurs au vent (par plaques) ──
  const grass = [], flowers = [];
  for (let i = 0; i < 60000 && grass.length < (o.grass || 0); i++) {
    const [x, z] = pick(); const h = height(x, z);
    if (!ok(x, z, h, 1.2, 36, 0.8)) continue;
    if (fbm(x * 0.045 + 3, z * 0.045 - 11) < 0.42) continue;
    grass.push({ x, y: h - 0.05, z, s: 0.7 + r() * 0.8, ry: r() * 6.3, tint: 0.85 + r() * 0.3 });
  }
  for (let i = 0; i < 40000 && flowers.length < (o.flowers || 0); i++) {
    const [x, z] = pick(); const h = height(x, z);
    if (!ok(x, z, h, 1.4, 30, 0.6)) continue;
    if (fbm(x * 0.06 - 3, z * 0.06 + 8) < 0.55) continue;
    flowers.push({ x, y: h - 0.05, z, s: 0.8 + r() * 0.6, ry: r() * 6.3, col: B.petals[flowers.length % B.petals.length] });
  }
  instances(group, B.tuft, swayMaterial(WIND, 0.14), grass, false);
  instances(group, flowerOf(B.stem), swayMaterial(WIND, 0.2), flowers, false);

  // ── rochers ──
  const rocks = [];
  for (let i = 0; i < 6000 && rocks.length < (o.rocks || 0); i++) {
    const [x, z] = pick(); const h = height(x, z);
    if (!ok(x, z, h, -0.4, 60, 1.2) || near(x, z, 1.5) || blocked(x, z, 1.5)) continue;
    const s = 0.4 + r() * 1.4;
    rocks.push({ x, y: h + s * 0.1, z, s, sy: 0.65, ry: r() * 6.3, tint: 0.8 + r() * 0.3 });
    if (s > 0.9) colliders.push({ type: 'circle', x: cx + x, z: cz + z, r: s * 0.85 });
  }
  instances(group, P(new THREE.DodecahedronGeometry(1, 0), B.rock), flatMat, rocks);
  return { houses };
}
