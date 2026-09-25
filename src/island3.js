// Île 3 — Port-Cendre : île volcanique au sable noir, aéroport international abandonné pendant l'évacuation,
// port industriel, caserne de pompiers, dépôt de kérosène, tour de contrôle à l'escalier effondré,
// et le vol HX-404, un long-courrier resté à sa porte d'embarquement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, rng, smoothstep } from './noise.js';
import { prep, flatMat, textTexture, mergeStatic, signBoard, autoColliders, heightAt } from './terrain.js';
import { texBox } from './textures.js';

export const FLAT3 = 3.0;
export const I3 = {
  runway: { x0: -215, x1: 215, z: 10, w: 34 },
  taxi: { z: 52, x0: -180, x1: 180, w: 18 },
  apron: { x0: -100, x1: 125, z0: 61, z1: 134 },
  terminal: { x: 5, z: 152, w: 92, d: 20, h: 11 },
  boeing: { x: 22, z: 124, yaw: Math.PI },
  fire: { x: -128, z: 96, w: 30, d: 16 },
  fuel: { x: 170, z: 112 }, gantry: { x: 146, z: 94 },
  tower: { x: -72, z: 152, h: 16 },
  depot: { x: -58, z: 102, w: 28, d: 18 },
  ramp: { x0: 214, x1: 305, z: 10, w: 22 },
  quay: { x0: -300, x1: -268, z0: 20, z1: 150, top: 1.4 },
  volcano: { x: 105, z: -175, h: 96, r: 150 },
  vehicles: {
    fire: { x: -120, z: 98, yaw: 0 },
    stairs: { x: 72, z: 128, yaw: Math.PI / 2 },
    fuel: { x: 146, z: 78, yaw: 0 },
    fork: { x: -48, z: 90, yaw: 0 },
    tug: { x: 52, z: 132, yaw: Math.PI / 2 },
  },
  items: {
    extinguisher: { x: -140, z: 86 },
    cargoBox3: { x: -50, z: 104 },
    battery: { tower: true },
  },
};

function rawT(x, z) {
  const ex = x / 330, ez = (z - 30) / 255;
  const d = Math.sqrt(ex * ex + ez * ez);
  let t = 1 - d + (fbm(x * 0.01 + 71, z * 0.01 - 33) - 0.5) * 0.24;
  // garder la mer au bout de la rampe et le long du quai
  if (x > 290) t = Math.min(t, (300 - x) * 0.01);
  if (x < -262 && z > 10 && z < 160) t = Math.min(t, 0.03);
  return t;
}

export function height3(x, z) {
  const t = rawT(x, z);
  let h;
  if (t < 0) h = Math.max(-18, t > -0.05 ? t * 30 : -1.5 + (t + 0.05) * 130);
  else {
    const land = smoothstep(0.02, 0.14, t);
    h = Math.min(t / 0.06, 1) * 1.2 + Math.max(0, t - 0.06) * 7;
    h += (fbm(x * 0.028, z * 0.028 + 5) - 0.5) * 4 * land;
    // volcan et son cratère
    const V = I3.volcano, vr = Math.hypot(x - V.x, z - V.z);
    if (vr < V.r) { const k = 1 - vr / V.r; h += V.h * Math.pow(k, 1.35) * land; if (vr < 22) h -= (22 - vr) * 0.9; }
    h += 16 * Math.exp(-((x + 190) ** 2 + (z + 120) ** 2) / (2 * 40 * 40)) * land;
    // plateforme aéroportuaire
    const fx = 1 - smoothstep(236, 262, Math.abs(x));
    const fz = 1 - smoothstep(0, 24, Math.max(z - 178, -16 - z, 0));
    h += (FLAT3 - h) * fx * fz;
  }
  // quai du port (béton)
  const Q = I3.quay;
  if (x > Q.x0 - 2 && x < Q.x1 + 30 && z > Q.z0 && z < Q.z1) {
    const k = smoothstep(Q.x1 + 30, Q.x1, x);
    h += (Math.max(h, Q.top) - h) * (x < Q.x1 ? 1 : k);
    if (x < Q.x1) h = Q.top;
  }
  // rampe de mise à l'eau à l'est de la piste
  const Rm = I3.ramp;
  if (x > Rm.x0 - 4 && x < Rm.x1 && Math.abs(z - Rm.z) < Rm.w / 2 + 6) {
    const k = Math.min(1, Math.max(0, (x - (Rm.x0 + 8)) / (Rm.x1 - Rm.x0 - 16)));
    const rh = FLAT3 + (-2.4 - FLAT3) * k;
    const edge = 1 - smoothstep(Rm.w / 2, Rm.w / 2 + 6, Math.abs(z - Rm.z));
    h += (rh - h) * edge;
  }
  return h;
}

function m(geo, col, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(prep(geo, col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function boxM(w, h, d, col, x, y, z) { return m(new THREE.BoxGeometry(w, h, d), col, x, y, z); }
const glassMat = new THREE.MeshLambertMaterial({ color: '#8fc6d8', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
function glassBox(w, h, d, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat); o.position.set(x, y, z); return o; }
function sign(lines, bg, fg, w, h, cw = 512, ch = 128) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTexture(lines, bg, fg, cw, ch) })); }

export function createIsland3(scene, seed, i2) {
  const r = rng(seed ^ 0x5eed3);
  // placée plus loin que Saint-Escale, en s'écartant de l'île 1
  const a2 = Math.atan2(i2.cz, i2.cx);
  const ang = a2 + (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.25);
  const d2 = Math.hypot(i2.cx, i2.cz);
  const dist = d2 + 1150 + r() * 250;
  const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
  const I = { cx, cz, R2: 380 * 380, height: height3 };
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  scene.add(group);
  const wp = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
  const colliders = [], platforms = [];
  const cBox = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; colliders.push(c); return c; };
  const cCircle = (x, z, rr, extra = {}) => { const c = { type: 'circle', x: cx + x, z: cz + z, r: rr, ...extra }; colliders.push(c); return c; };
  const dyn = [];   // objets animés (non fusionnés)

  // ── terrain : sable noir, cendres, roche volcanique ──
  let tg = new THREE.PlaneGeometry(760, 600, 170, 134);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, 0, 20);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height3(pos.getX(i), pos.getZ(i)));
  tg = tg.toNonIndexed(); tg.deleteAttribute('uv'); tg.computeVertexNormals();
  const tp = tg.attributes.position, tn = tg.attributes.normal;
  const cols = new Float32Array(tp.count * 3);
  const c = new THREE.Color();
  const SAND = new THREE.Color('#3b3739'), WET = new THREE.Color('#29262a'), DEEP = new THREE.Color('#123f55');
  const ASH1 = new THREE.Color('#6f6862'), ASH2 = new THREE.Color('#5a534f'), MOSS = new THREE.Color('#5e6b40');
  const ROCK = new THREE.Color('#4a3e3a'), LAVA = new THREE.Color('#7a3526'), CONC = new THREE.Color('#9d9890');
  for (let i = 0; i < tp.count; i += 3) {
    const h = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3;
    const x = (tp.getX(i) + tp.getX(i + 1) + tp.getX(i + 2)) / 3;
    const z = (tp.getZ(i) + tp.getZ(i + 1) + tp.getZ(i + 2)) / 3;
    const ny = tn.getY(i);
    const V = I3.volcano, vr = Math.hypot(x - V.x, z - V.z);
    if ((x > I3.ramp.x0 - 2 && Math.abs(z - I3.ramp.z) < I3.ramp.w / 2 + 1) || (x < I3.quay.x1 && z > I3.quay.z0 && z < I3.quay.z1)) c.copy(CONC);
    else if (h < -0.15) c.copy(WET).lerp(DEEP, smoothstep(-0.5, -14, h));
    else if (h < 1.3) c.copy(SAND);
    else if (vr < 30 && h > 40) c.copy(LAVA).lerp(ROCK, fbm(x * 0.1, z * 0.1));
    else if (ny < 0.8 || h > 22) c.copy(ROCK).lerp(LAVA, Math.max(0, fbm(x * 0.03, z * 0.03) - 0.45) * 1.6);
    else c.copy(ASH1).lerp(ASH2, fbm(x * 0.05, z * 0.05)).lerp(MOSS, Math.max(0, fbm(x * 0.02 + 3, z * 0.02) - 0.55) * 2);
    c.multiplyScalar(0.95 + r() * 0.08);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, flatMat);
  terrain.receiveShadow = true;
  terrain.userData.dynamic = true;
  group.add(terrain);

  // ── piste, taxiway, tarmac ──
  const Y = FLAT3 + 0.03, asphalt = '#2e3138', white = '#eceae3', yellow = '#ffd166';
  const RW = I3.runway;
  group.add(boxM(RW.x1 - RW.x0, 0.06, RW.w, asphalt, 0, Y, RW.z));
  for (let x = RW.x0 + 24; x < RW.x1 - 24; x += 14) group.add(boxM(7, 0.02, 0.6, white, x, Y + 0.04, RW.z));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 8; k++) group.add(boxM(9, 0.02, 1.2, white, sx * (RW.x1 - 7), Y + 0.04, RW.z - 12.5 + k * 3.6));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), new THREE.MeshLambertMaterial({ map: textTexture([sx < 0 ? '09' : '27'], asphalt, white, 256, 140), transparent: true }));
    num.rotation.x = -Math.PI / 2; num.rotation.z = sx < 0 ? -Math.PI / 2 : Math.PI / 2; num.position.set(sx * (RW.x1 - 22), Y + 0.05, RW.z); group.add(num);
  }
  group.add(boxM(RW.x1 - RW.x0, 0.02, 0.35, yellow, 0, Y + 0.04, RW.z - RW.w / 2 + 1));
  group.add(boxM(RW.x1 - RW.x0, 0.02, 0.35, yellow, 0, Y + 0.04, RW.z + RW.w / 2 - 1));
  const TX = I3.taxi;
  group.add(boxM(TX.x1 - TX.x0, 0.06, TX.w, '#34373f', 0, Y - 0.005, TX.z));
  group.add(boxM(TX.x1 - TX.x0, 0.02, 0.3, yellow, 0, Y + 0.04, TX.z));
  for (const x of [TX.x0, TX.x1, 0]) group.add(boxM(TX.w, 0.06, TX.z - RW.z - RW.w / 2, '#34373f', x, Y - 0.01, (TX.z + RW.z + RW.w / 2) / 2));
  const AP = I3.apron;
  group.add(boxM(AP.x1 - AP.x0, 0.06, AP.z1 - AP.z0, '#3d4048', (AP.x0 + AP.x1) / 2, Y - 0.015, (AP.z0 + AP.z1) / 2));
  // marquages de stationnement
  for (const gx of [-40, 22, 84]) {
    group.add(boxM(0.35, 0.02, 60, yellow, gx, Y + 0.035, 100));
    group.add(boxM(10, 0.02, 0.35, yellow, gx, Y + 0.035, 127));
  }
  // zone de repoussage (hachures)
  for (let k = 0; k < 7; k++) { const h = boxM(1.2, 0.02, 12, '#ff6b5b', 8 + k * 4.5, Y + 0.035, 76); h.rotation.y = 0.6; group.add(h); }
  const pbs = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshLambertMaterial({ map: textTexture(['REPOUSSAGE → TAXIWAY'], '#3d4048', '#ff6b5b', 1024, 140), transparent: true }));
  pbs.rotation.x = -Math.PI / 2; pbs.position.set(22, Y + 0.04, 68); group.add(pbs);
  // balisage de piste (toujours alimenté par la centrale géothermique)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false });
  const lampGeos = [];
  for (let x = RW.x0; x <= RW.x1; x += 12) for (const sz of [-1, 1]) lampGeos.push(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 6).translate(x, Y + 0.18, RW.z + sz * (RW.w / 2 + 0.7)));
  for (let x = TX.x0; x <= TX.x1; x += 16) for (const sz of [-1, 1]) lampGeos.push(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 6).translate(x, Y + 0.15, TX.z + sz * (TX.w / 2 + 0.5)));
  const lamps = new THREE.Mesh(mergeGeometries(lampGeos), lampMat); lamps.userData.dynamic = true; group.add(lamps);

  // ── terminal international ──
  const T = I3.terminal, TH = T.h, tz0 = T.z - T.d / 2;
  const tx0 = T.x - T.w / 2, tx1 = T.x + T.w / 2;
  const concrete = '#b8b3aa', dark = '#3a3f48';
  const tb = (w, h, d, col, x, y, z, kind = 'panel', tile = 3) => { const q = texBox(w, h, d, col, kind, tile); q.position.set(x, y, z); group.add(q); return q; };
  tb(T.w, TH, 0.5, concrete, T.x, FLAT3 + TH / 2, T.z + T.d / 2);
  for (const sx of [tx0, tx1]) tb(0.5, TH, T.d, concrete, sx, FLAT3 + TH / 2, T.z);
  cBox(tx0, tx1, T.z + T.d / 2 - 0.3, T.z + T.d / 2 + 0.3); cBox(tx0 - 0.3, tx0 + 0.3, tz0, T.z + T.d / 2); cBox(tx1 - 0.3, tx1 + 0.3, tz0, T.z + T.d / 2);
  // façade vitrée côté pistes, trois portes
  const doors = [[-12, -8], [18, 22], [40, 44]];
  let xa = tx0;
  for (const [a, b] of doors) {
    const w = (T.x + a) - xa; if (w > 0) { group.add(glassBox(w, TH - 1.2, 0.12, xa + w / 2, FLAT3 + 0.6 + (TH - 1.2) / 2, tz0)); cBox(xa, xa + w, tz0 - 0.25, tz0 + 0.25); }
    group.add(glassBox(b - a, TH - 4.2, 0.12, T.x + (a + b) / 2, FLAT3 + 3.6 + (TH - 4.2) / 2, tz0));
    xa = T.x + b;
  }
  group.add(glassBox(tx1 - xa, TH - 1.2, 0.12, (xa + tx1) / 2, FLAT3 + 0.6 + (TH - 1.2) / 2, tz0)); cBox(xa, tx1, tz0 - 0.25, tz0 + 0.25);
  for (let x = tx0; x <= tx1 + 0.1; x += 4.6) group.add(boxM(0.3, TH, 0.5, dark, x, FLAT3 + TH / 2, tz0));
  group.add(boxM(T.w, 0.6, 0.6, dark, T.x, FLAT3 + 0.3, tz0));
  group.add(boxM(T.w + 6, 0.8, T.d + 8, '#ff6b5b', T.x, FLAT3 + TH + 0.4, T.z - 2));          // toit débordant
  group.add(boxM(T.w + 6.2, 0.3, 0.4, '#ffd166', T.x, FLAT3 + TH, T.z - T.d / 2 - 6));
  for (let x = tx0 - 2; x <= tx1 + 2; x += 11.5) { group.add(boxM(0.5, TH, 0.5, dark, x, FLAT3 + TH / 2, tz0 - 5.5)); cCircle(x, tz0 - 5.5, 0.4); }
  const tsign = sign(['PORT-CENDRE · INTERNATIONAL'], '#10162b', '#ffd166', 34, 3, 1536, 140);
  tsign.position.set(T.x, FLAT3 + TH + 2.6, T.z - T.d / 2 - 6.25); tsign.rotation.y = Math.PI; group.add(tsign);
  group.add(boxM(35, 3.4, 0.3, '#10162b', T.x, FLAT3 + TH + 2.6, T.z - T.d / 2 - 6.05));
  // intérieur : comptoirs, bancs, tableau des départs, tapis
  for (let i = 0; i < 6; i++) { group.add(boxM(4.5, 1.1, 1.2, '#1f8a8a', tx0 + 10 + i * 7, FLAT3 + 0.55, T.z + 5)); cBox(tx0 + 7.75 + i * 7, tx0 + 12.25 + i * 7, T.z + 4.4, T.z + 5.6); }
  for (let i = 0; i < 5; i++) { group.add(boxM(6, 0.5, 1.1, '#6b6f78', tx0 + 12 + i * 12, FLAT3 + 0.25, T.z - 3)); cBox(tx0 + 9 + i * 12, tx0 + 15 + i * 12, T.z - 3.55, T.z - 2.45); }
  const board = sign(['DÉPARTS', 'HX-404  HÉLIOS ......... ANNULÉ', 'AA-117  SAINT-ESCALE ... ANNULÉ', 'AA-209  KERLOCH ........ ANNULÉ', 'ÉVACUATION : RESTEZ CALMES'], '#10162b', '#ffd166', 9, 4, 1024, 460);
  board.position.set(T.x - 18, FLAT3 + 6, T.z + T.d / 2 - 0.3); board.rotation.y = Math.PI; group.add(board);
  // boutique hors taxes (comptoir d'échange)
  group.add(boxM(6, 1.1, 1.4, '#ffd166', T.x + 30, FLAT3 + 0.55, T.z + 3.4)); cBox(T.x + 27, T.x + 33, T.z + 2.7, T.z + 4.1);
  group.add(boxM(6, 2.6, 0.4, '#1f8a8a', T.x + 30, FLAT3 + 1.3, T.z + 6.5));
  const df = sign(['HORS TAXES · DUTY FREE', 'troc accepté 🐚'], '#10162b', '#ffd166', 5, 1.2, 512, 150);
  df.position.set(T.x + 30, FLAT3 + 3.4, T.z + 6.25); df.rotation.y = Math.PI; group.add(df);
  const termLight = new THREE.PointLight('#ffe2a8', 10, 50, 1.2); termLight.position.set(T.x, FLAT3 + TH - 1, T.z); group.add(termLight);
  // passerelle télescopique (repliée, porte 2)
  const jb = new THREE.Group(); jb.position.set(-40, FLAT3, tz0 - 2);
  jb.add(boxM(3.2, 3, 16, '#c9cfd6', 0, 5.2, -8)); jb.add(boxM(1, 3.8, 1, dark, 0, 1.9, -13)); jb.add(boxM(3.6, 0.8, 2.2, dark, 0, 1.2, -13));
  group.add(jb); cBox(-41, -39, tz0 - 16, tz0 - 14);

  // ── tour de contrôle : escalier extérieur dont la première volée s'est effondrée ──
  const To = I3.tower, cabY = FLAT3 + To.h, SH = 2.3, LANE = 3.25, LW = 1.5, NST = 11, RUN = 5 / NST, RISE = 4 / NST;
  tb(SH * 2, To.h - 0.4, SH * 2, '#a9a49b', To.x, FLAT3 + (To.h - 0.4) / 2, To.z, 'panel', 2.3);
  for (const by of [FLAT3 + 4.6, FLAT3 + 9.4]) group.add(boxM(SH * 2 + 0.16, 0.5, SH * 2 + 0.16, '#ff8a3a', To.x, by, To.z));
  colliders.push({ type: 'box', minX: cx + To.x - SH, maxX: cx + To.x + SH, minZ: cz + To.z - SH, maxZ: cz + To.z + SH, maxY: cabY - 0.6 });
  const steel = '#4d535c', rust = '#8a5a3a';
  const FL = [
    { sx: 2.5, sz: LANE, dx: -1, dz: 0, nx: 0, nz: 1 },
    { sx: -LANE, sz: 2.5, dx: 0, dz: -1, nx: -1, nz: 0 },
    { sx: -2.5, sz: -LANE, dx: 1, dz: 0, nx: 0, nz: -1 },
    { sx: LANE, sz: -2.5, dx: 0, dz: 1, nx: 1, nz: 0 },
  ];
  const pf = (x0, x1, z0, z1, top) => platforms.push({ minX: cx + To.x + Math.min(x0, x1), maxX: cx + To.x + Math.max(x0, x1), minZ: cz + To.z + Math.min(z0, z1), maxZ: cz + To.z + Math.max(z0, z1), top });
  const rail = (x0, x1, z0, z1, y0, y1) => colliders.push({ type: 'box', minX: cx + To.x + Math.min(x0, x1), maxX: cx + To.x + Math.max(x0, x1), minZ: cz + To.z + Math.min(z0, z1), maxZ: cz + To.z + Math.max(z0, z1), minY: y0, maxY: y1 });
  const BROKEN = 6;   // volée 0 : marches 6 à 10 effondrées
  FL.forEach((f, k) => {
    const y0 = FLAT3 + k * 4, alongX = f.dx !== 0;
    for (let i = 0; i < NST; i++) {
      if (k === 0 && i >= BROKEN) continue;
      const u = (i + 0.5) * RUN, px = f.sx + f.dx * u, pz = f.sz + f.dz * u, top = y0 + (i + 1) * RISE;
      group.add(boxM(alongX ? RUN - 0.04 : LW, 0.08, alongX ? LW : RUN - 0.04, steel, To.x + px, top - 0.04, To.z + pz));
      pf(px - (alongX ? RUN / 2 : LW / 2), px + (alongX ? RUN / 2 : LW / 2), pz - (alongX ? LW / 2 : RUN / 2), pz + (alongX ? LW / 2 : RUN / 2), top);
    }
    const len = Math.hypot(5, 4), ang = Math.atan2(4, 5), mx = f.sx + f.dx * 2.5, mz = f.sz + f.dz * 2.5;
    if (k > 0) {
      for (const side of [-1, 1]) {
        const st = boxM(alongX ? len : 0.1, 0.3, alongX ? 0.1 : len, rust, To.x + mx + f.nx * side * (LW / 2 + 0.05), y0 + 1.8, To.z + mz + f.nz * side * (LW / 2 + 0.05));
        if (alongX) st.rotation.z = f.dx * ang; else st.rotation.x = -f.dz * ang;
        group.add(st);
      }
      const ox = f.sx + f.nx * (LW / 2 + 0.1), oz = f.sz + f.nz * (LW / 2 + 0.1);
      rail(ox, ox + f.dx * 5 + f.nx * 0.12, oz, oz + f.dz * 5 + f.nz * 0.12, y0 - 0.6, y0 + 4.6);
    } else {
      // tronçon intact (bas) + morceaux tordus au sol
      const ox = f.sx + f.nx * (LW / 2 + 0.1), oz = f.sz + f.nz * (LW / 2 + 0.1);
      rail(ox, ox + f.dx * BROKEN * RUN + f.nx * 0.12, oz, oz + f.dz * BROKEN * RUN + f.nz * 0.12, y0 - 0.6, y0 + 2.6);
      for (let q = 0; q < 4; q++) { const d = boxM(1.4, 0.08, 0.4, steel, To.x + f.sx - 3.2 - q * 0.6, FLAT3 + 0.1 + q * 0.05, To.z + LANE + 2.2 + (q % 2) * 0.8); d.rotation.set(0.2 * q, q * 0.7, 0.3); group.add(d); }
    }
    if (k < 3) {
      const cxL = [-LANE, -LANE, LANE][k], czL = [LANE, -LANE, -LANE][k], ly = y0 + 4;
      group.add(boxM(LW, 0.1, LW, steel, To.x + cxL, ly - 0.05, To.z + czL));
      group.add(boxM(0.2, ly - FLAT3, 0.2, rust, To.x + cxL + Math.sign(cxL) * 0.6, (ly + FLAT3) / 2, To.z + czL + Math.sign(czL) * 0.6));
      pf(cxL - LW / 2, cxL + LW / 2, czL - LW / 2, czL + LW / 2, ly);
      const sgx = Math.sign(cxL), sgz = Math.sign(czL);
      rail(cxL + sgx * (LW / 2 + 0.05), cxL + sgx * (LW / 2 + 0.17), czL - LW / 2, czL + LW / 2, ly - 0.6, ly + 1.4);
      if (k > 0) rail(cxL - LW / 2, cxL + LW / 2, czL + sgz * (LW / 2 + 0.05), czL + sgz * (LW / 2 + 0.17), ly - 0.6, ly + 1.4);
    }
  });
  const brk = sign(['⚠ ESCALIER EFFONDRÉ', 'Il manque ~2 m jusqu\'au palier.', 'Un chariot élévateur et une caisse', 'feraient un bon pont…'], '#ffd166', '#10162b', 1.8, 1.0, 512, 290);
  brk.position.set(To.x + 2.6, FLAT3 + 1.6, To.z + LANE + 0.82); group.add(brk);
  const lift = sign(['ASCENSEUR', 'HORS SERVICE'], '#10162b', '#ff6b5b', 1.4, 0.7, 512, 250);
  lift.position.set(To.x, FLAT3 + 1.6, To.z - SH - 0.03); lift.rotation.y = Math.PI; group.add(lift);
  // vigie
  const floorParts = [[-4.5, 2.3, -4.5, 4.5], [2.3, 4.5, -4.5, -1.0], [2.3, 4.5, 2.5, 4.5]];
  for (const [x0, x1, z0, z1] of floorParts) { group.add(boxM(x1 - x0, 0.4, z1 - z0, '#33373f', To.x + (x0 + x1) / 2, cabY - 0.2, To.z + (z0 + z1) / 2)); pf(Math.max(x0, -4.1), Math.min(x1, 4.1), Math.max(z0, -4.1), Math.min(z1, 4.1), cabY); }
  rail(2.25, 2.4, -1.0, 2.4, cabY - 0.5, cabY + 2); rail(2.3, 4.5, -1.1, -0.95, cabY - 0.5, cabY + 2);
  group.add(boxM(9.8, 0.6, 9.8, '#10162b', To.x, cabY + 3.3, To.z));
  for (const [w, d, dx, dz] of [[8.6, 0.06, 0, -4.3], [8.6, 0.06, 0, 4.3], [0.06, 8.6, -4.3, 0], [0.06, 8.6, 4.3, 0]]) { group.add(glassBox(w, 3.0, d, To.x + dx, cabY + 1.55, To.z + dz)); rail(dx - w / 2, dx + w / 2, dz - d / 2 - 0.1, dz + d / 2 + 0.1, cabY - 0.5, cabY + 3); }
  for (const [dx, dz] of [[-4.3, -4.3], [4.3, -4.3], [-4.3, 4.3], [4.3, 4.3]]) group.add(boxM(0.3, 3.1, 0.3, '#10162b', To.x + dx, cabY + 1.55, To.z + dz));
  group.add(boxM(4, 1.0, 1.2, '#33373f', To.x - 1, cabY + 0.5, To.z - 3.2));
  group.add(boxM(1.6, 1.4, 0.8, '#5d6470', To.x - 3.2, cabY + 0.7, To.z + 3.0));   // armoire électrique
  const radome = m(new THREE.SphereGeometry(1.6, 10, 8), '#e9e4d8', To.x, cabY + 5.0, To.z); group.add(radome);

  // ── caserne de pompiers ──
  const F = I3.fire, red = '#c9352b';
  tb(F.w, 7, 0.4, red, F.x, FLAT3 + 3.5, F.z + F.d / 2, 'brick', 2);
  for (const sx of [-1, 1]) tb(0.4, 7, F.d, red, F.x + sx * F.w / 2, FLAT3 + 3.5, F.z, 'brick', 2);
  group.add(boxM(F.w + 1, 0.5, F.d + 1, '#8d2a22', F.x, FLAT3 + 7.25, F.z));
  cBox(F.x - F.w / 2, F.x + F.w / 2, F.z + F.d / 2 - 0.3, F.z + F.d / 2 + 0.3); cBox(F.x - F.w / 2 - 0.3, F.x - F.w / 2 + 0.3, F.z - F.d / 2, F.z + F.d / 2); cBox(F.x + F.w / 2 - 0.3, F.x + F.w / 2 + 0.3, F.z - F.d / 2, F.z + F.d / 2);
  // façade : deux baies de garage à rideau, un pilier central
  const fz0 = F.z - F.d / 2;
  tb(2, 7, 0.4, red, F.x, FLAT3 + 3.5, fz0, 'brick', 2); cBox(F.x - 1, F.x + 1, fz0 - 0.25, fz0 + 0.25);
  tb(F.w, 1.6, 0.4, red, F.x, FLAT3 + 6.2, fz0, 'brick', 2);
  const bays = [];
  for (const sx of [-1, 1]) {
    const shutter = boxM(F.w / 2 - 1.2, 5.4, 0.2, '#e9e4d8', F.x + sx * (F.w / 4 + 0.4), FLAT3 + 2.7, fz0 - 0.1);
    for (let y = 0.4; y < 5.4; y += 0.45) shutter.add(boxM(F.w / 2 - 1.2, 0.05, 0.22, '#c9c4b8', 0, y - 2.7, 0));
    shutter.userData.dynamic = true; group.add(shutter);
    bays.push({ mesh: shutter, col: cBox(F.x + sx * (F.w / 4 + 0.4) - (F.w / 4 - 0.6), F.x + sx * (F.w / 4 + 0.4) + (F.w / 4 - 0.6), fz0 - 0.3, fz0 + 0.1) });
  }
  const fsign = sign(['CASERNE · SAPEURS-POMPIERS'], red, '#fff4e0', 14, 1.3, 1024, 100);
  fsign.position.set(F.x, FLAT3 + 6.2, fz0 - 0.22); fsign.rotation.y = Math.PI; group.add(fsign);
  const btn = boxM(0.5, 0.7, 0.25, '#ffd166', F.x + F.w / 2 + 0.8, FLAT3 + 1.4, fz0 - 0.2); group.add(btn);
  group.add(boxM(1.6, 1.8, 0.4, '#ff6b5b', F.x - F.w / 2 + 3, FLAT3 + 0.9, F.z + F.d / 2 - 0.5));   // armoire à extincteurs
  for (let i = 0; i < 3; i++) group.add(m(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 8), '#e0332a', F.x - F.w / 2 + 2.5 + i * 0.5, FLAT3 + 0.5, F.z + F.d / 2 - 0.85));
  group.add(boxM(1.2, 9, 1.2, '#8d2a22', F.x + F.w / 2 + 2.5, FLAT3 + 4.5, F.z + 4)); cBox(F.x + F.w / 2 + 1.9, F.x + F.w / 2 + 3.1, F.z + 3.4, F.z + 4.6);  // tour de séchage
  const siren = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false })); siren.position.set(F.x + F.w / 2 + 2.5, FLAT3 + 9.3, F.z + 4); group.add(siren);

  // ── dépôt de fret (chariot élévateur, caisses) ──
  const D = I3.depot;
  tb(D.w, 8, 0.4, '#7c8b96', D.x, FLAT3 + 4, D.z + D.d / 2, 'metal', 2.5);
  for (const sx of [-1, 1]) tb(0.4, 8, D.d, '#7c8b96', D.x + sx * D.w / 2, FLAT3 + 4, D.z, 'metal', 2.5);
  const roofG = new THREE.CylinderGeometry(D.w / 2 + 0.6, D.w / 2 + 0.6, D.d + 1, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
  const roof = m(roofG, '#5d6d78', D.x, FLAT3 + 8, D.z); roof.scale.set(1, 0.35, 1); group.add(roof);
  cBox(D.x - D.w / 2, D.x + D.w / 2, D.z + D.d / 2 - 0.3, D.z + D.d / 2 + 0.3); cBox(D.x - D.w / 2 - 0.3, D.x - D.w / 2 + 0.3, D.z - D.d / 2, D.z + D.d / 2); cBox(D.x + D.w / 2 - 0.3, D.x + D.w / 2 + 0.3, D.z - D.d / 2, D.z + D.d / 2);
  const dsign = sign(['FRET · CARGO'], '#10162b', '#5ef2c2', 8, 1.2, 1024, 150);
  dsign.position.set(D.x, FLAT3 + 7, D.z - D.d / 2 - 0.05); dsign.rotation.y = Math.PI; group.add(dsign);
  group.add(boxM(D.w, 1.4, 0.4, '#7c8b96', D.x, FLAT3 + 7.3, D.z - D.d / 2));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { group.add(boxM(1.2, 1.1, 1.2, '#b98b5e', D.x - 10 + i * 1.5, FLAT3 + 0.55 + j * 1.12, D.z + 6)); }
  cBox(D.x - 10.6, D.x - 4.4, D.z + 5.4, D.z + 6.6);
  for (let k = 0; k < 3; k++) { group.add(boxM(1.2, 0.15, 1.2, '#8a6a4a', D.x + 6 + k * 1.4, FLAT3 + 0.08, D.z + 5)); }

  // ── dépôt de kérosène et portique de chargement ──
  const FU = I3.fuel;
  for (let k = 0; k < 3; k++) {
    const x = FU.x + k * 17;
    group.add(m(new THREE.CylinderGeometry(6.5, 6.5, 9, 16), '#e9e4d8', x, FLAT3 + 4.5, FU.z));
    group.add(m(new THREE.CylinderGeometry(6.55, 6.55, 1.2, 16), '#ffd166', x, FLAT3 + 7, FU.z));
    group.add(m(new THREE.CylinderGeometry(6, 6.5, 1, 16), '#d6d0c2', x, FLAT3 + 9.5, FU.z));
    cCircle(x, FU.z, 6.7);
    const lab = sign(['JET A-1'], '#e9e4d8', '#c82020', 4, 1, 256, 70); lab.position.set(x, FLAT3 + 4.5, FU.z - 6.55); lab.rotation.y = Math.PI; group.add(lab);
  }
  // cuvette de rétention
  for (const [w, d, x, z] of [[54, 0.5, FU.x + 17, FU.z - 9], [54, 0.5, FU.x + 17, FU.z + 9], [0.5, 18, FU.x - 10, FU.z], [0.5, 18, FU.x + 44, FU.z]]) { group.add(boxM(w, 1.0, d, '#9d9890', x, FLAT3 + 0.5, z)); cBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2); }
  const GA = I3.gantry;
  for (const sx of [-1, 1]) { group.add(boxM(0.5, 6, 0.5, '#ffd166', GA.x + sx * 3.5, FLAT3 + 3, GA.z - 3)); group.add(boxM(0.5, 6, 0.5, '#ffd166', GA.x + sx * 3.5, FLAT3 + 3, GA.z + 3)); cCircle(GA.x + sx * 3.5, GA.z - 3, 0.35); cCircle(GA.x + sx * 3.5, GA.z + 3, 0.35); }
  group.add(boxM(7.5, 0.6, 7, '#ffd166', GA.x, FLAT3 + 6.2, GA.z));
  const arm = new THREE.Group(); arm.position.set(GA.x, FLAT3 + 5.9, GA.z); arm.userData.dynamic = true; group.add(arm);
  arm.add(m(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), '#8d9299', 0, -1.5, 0));
  const gsign = sign(['CHARGEMENT CITERNES', 'garez-vous sous le portique'], '#10162b', '#ffd166', 4.2, 0.9, 512, 140);
  gsign.position.set(GA.x, FLAT3 + 6.2, GA.z - 3.55); gsign.rotation.y = Math.PI; group.add(gsign);
  // pipeline vers les cuves
  { const len = FU.x - 10 - GA.x; const p = m(new THREE.CylinderGeometry(0.25, 0.25, len, 8).rotateZ(Math.PI / 2), '#8d9299', GA.x + len / 2, FLAT3 + 0.6, GA.z + 5); group.add(p); }

  // ── port industriel (quai, grues, conteneurs) ──
  const Q = I3.quay;
  platforms.push({ minX: cx + Q.x0, maxX: cx + Q.x1, minZ: cz + Q.z0, maxZ: cz + Q.z1, top: Q.top });
  group.add(boxM(Q.x1 - Q.x0, 2.5, Q.z1 - Q.z0, '#8f8b85', (Q.x0 + Q.x1) / 2, Q.top - 1.25, (Q.z0 + Q.z1) / 2));
  group.add(boxM(0.6, 0.4, Q.z1 - Q.z0, '#ffd166', Q.x0 + 0.3, Q.top + 0.2, (Q.z0 + Q.z1) / 2));
  for (let z = Q.z0 + 6; z < Q.z1; z += 12) { group.add(m(new THREE.CylinderGeometry(0.3, 0.4, 0.7, 8), '#33373f', Q.x0 + 1.2, Q.top + 0.35, z)); cCircle(Q.x0 + 1.2, z, 0.4); }
  for (const cz0 of [55, 115]) {
    const crane = new THREE.Group(); crane.position.set(Q.x0 + 12, Q.top, cz0);
    for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) { crane.add(boxM(0.8, 22, 0.8, '#ff8a3a', dx, 11, dz)); cCircle(Q.x0 + 12 + dx, cz0 + dz, 0.6); }
    crane.add(boxM(40, 2, 3, '#ff8a3a', -8, 23, 0));
    crane.add(boxM(6, 3, 5, '#e9e4d8', 4, 25.5, 0));
    crane.add(boxM(0.1, 10, 0.1, '#2a2a2a', -20, 17, 0));
    crane.add(boxM(4, 2.4, 2.4, '#1f8a8a', -20, 11, 0));
    group.add(crane);
  }
  const ctCols = ['#1f8a8a', '#ff6b5b', '#ffd166', '#b8a4ff', '#6fb7ff', '#e9e4d8', '#5a7a4a'];
  for (let i = 0; i < 26; i++) {
    const gx = -250 + (i % 5) * 7, gz = 40 + Math.floor(i / 5) * 16, st = 1 + ((i * 7) % 3);
    for (let s = 0; s < st; s++) {
      const ct = boxM(6.1, 2.6, 2.44, ctCols[(i + s * 3) % ctCols.length], gx, height3(gx, gz) + 1.3 + s * 2.6, gz);
      group.add(ct);
      group.add(boxM(6.14, 0.12, 2.48, '#2a2f38', gx, height3(gx, gz) + 2.55 + s * 2.6, gz));
    }
    cBox(gx - 3.05, gx + 3.05, gz - 1.22, gz + 1.22);
  }

  // ── décor volcanique : roches, arbres morts, fumerolles, maisons, voitures, lampadaires ──
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const deadGeo = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.14, 0.26, 4.2, 5).translate(0, 2.1, 0), '#5a504a'),
    prep(new THREE.CylinderGeometry(0.06, 0.1, 1.8, 4).rotateZ(0.9).translate(0.6, 3.1, 0), '#5a504a'),
    prep(new THREE.CylinderGeometry(0.05, 0.09, 1.5, 4).rotateZ(-1.0).translate(-0.5, 2.6, 0.1), '#5a504a'),
  ]);
  const shrubGeo = prep(new THREE.IcosahedronGeometry(0.9, 0), '#4c5a36');
  const rocks = [], deads = [], shrubs = [], vents = [];
  const inAirport = (x, z) => Math.abs(x) < 250 && z > -20 && z < 182;
  for (let i = 0; i < 3000 && (rocks.length < 90 || deads.length < 60 || shrubs.length < 80); i++) {
    const x = (r() - 0.5) * 680, z = (r() - 0.5) * 520 + 30, h = height3(x, z);
    if (h < 0.5 || inAirport(x, z) || (x < -240 && z > 20 && z < 160)) continue;
    const q = r();
    if (q < 0.4 && rocks.length < 90) rocks.push({ x, z, h, s: 0.8 + r() * 2.4, ry: r() * 6.3 });
    else if (q < 0.65 && deads.length < 60 && h < 40) deads.push({ x, z, h, s: 0.8 + r() * 0.6, ry: r() * 6.3 });
    else if (shrubs.length < 80 && h < 30) shrubs.push({ x, z, h, s: 0.6 + r() * 0.8, ry: r() * 6.3 });
  }
  const inst = (geo, list, colR = 0.4, col = null) => {
    const im = new THREE.InstancedMesh(col ? prep(geo.clone(), col) : geo, flatMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach((o, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry); s.setScalar(o.s); p.set(o.x, o.h - 0.15, o.z); m4.compose(p, q, s); im.setMatrixAt(i, m4); if (colR) cCircle(o.x, o.z, colR * o.s); });
    im.castShadow = im.receiveShadow = true; im.userData.dynamic = true;
    group.add(im);
  };
  inst(rockGeo, rocks, 0.8, '#3a3230');
  inst(deadGeo, deads, 0.3);
  inst(shrubGeo, shrubs, 0);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, rr = 40 + r() * 70, x = I3.volcano.x + Math.cos(a) * rr, z = I3.volcano.z + Math.sin(a) * rr;
    vents.push(new THREE.Vector3(cx + x, height3(x, z) + 0.5, cz + z));
    group.add(m(new THREE.CylinderGeometry(0.8, 1.4, 0.6, 7), '#8a7a4a', x, height3(x, z) + 0.2, z));
  }
  // petit village de pierre noire (au sud-ouest du terminal)
  const houses = [[-150, 150], [-162, 164], [-140, 170], [-176, 146], [-190, 168]];
  for (const [x, z] of houses) {
    const hh = height3(x, z), wall = r() < 0.5 ? '#4a4648' : '#5a5456';
    const hg = new THREE.Group(); hg.position.set(x, hh, z); hg.rotation.y = r() * 1.2;
    hg.add(boxM(6, 3.4, 5, wall, 0, 1.7, 0));
    const rf = m(new THREE.ConeGeometry(4.6, 2.4, 4), r() < 0.5 ? '#c8553d' : '#1f8a8a', 0, 4.6, 0); rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 0.85); hg.add(rf);
    hg.add(boxM(1.1, 2, 0.1, '#6d4b37', 0, 1, -2.52));
    hg.add(boxM(1.0, 0.9, 0.1, '#ffd98a', 1.8, 2, -2.52));
    group.add(hg); cCircle(x, z, 3.6);
  }
  // parking et vieilles voitures, bus de l'évacuation
  for (let i = 0; i < 7; i++) {
    const x = -20 + i * 6, z = 175, car = new THREE.Group(); car.position.set(x, FLAT3, z); car.rotation.y = (r() - 0.5) * 0.3;
    const col = ['#ff6b5b', '#1f8a8a', '#e9e4d8', '#ffd166', '#6fb7ff'][i % 5];
    car.add(boxM(1.9, 0.8, 4.2, col, 0, 0.7, 0)); car.add(boxM(1.7, 0.7, 2.2, col, 0, 1.4, 0.2)); car.add(boxM(1.72, 0.45, 2.1, '#2a3a4a', 0, 1.45, 0.2));
    for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) { const w = m(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 8), '#1e1e22', wx, 0.36, wz); w.rotation.z = Math.PI / 2; car.add(w); }
    group.add(car); cBox(x - 1, x + 1, z - 2.1, z + 2.1);
  }
  { const bus = new THREE.Group(); bus.position.set(-62, FLAT3, 128); bus.rotation.y = 0.4; bus.add(boxM(2.6, 3, 11, '#ffd166', 0, 1.9, 0)); bus.add(boxM(2.62, 0.9, 10.4, '#2a3a4a', 0, 2.5, 0)); bus.add(boxM(2.62, 0.3, 11, '#10162b', 0, 0.55, 0)); group.add(bus); const bs = sign(['ÉVACUATION'], '#10162b', '#ffd166', 2.2, 0.4, 512, 100); bs.position.set(0, 3.2, -5.52); bs.rotation.y = Math.PI; bus.add(bs); cCircle(-62 + Math.sin(0.4) * 3, 128 + Math.cos(0.4) * 3, 1.6); cCircle(-62 - Math.sin(0.4) * 3, 128 - Math.cos(0.4) * 3, 1.6); cCircle(-62, 128, 1.6); }
  // mâts d'éclairage du tarmac (allumés la nuit)
  const flood = new THREE.MeshLambertMaterial({ color: '#fff1c4', emissive: '#ffd27a', emissiveIntensity: 1.5 });
  const floodPts = [[-80, 70], [-20, 70], [60, 70], [118, 70], [-80, 130], [118, 130]];
  for (const [x, z] of floodPts) {
    group.add(boxM(0.5, 16, 0.5, '#8d9299', x, FLAT3 + 8, z)); cCircle(x, z, 0.4);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), flood); hd.position.set(x, FLAT3 + 16.2, z); hd.userData.dynamic = true; group.add(hd);
  }
  const apronLights = floodPts.slice(0, 3).map(([x, z]) => { const l = new THREE.PointLight('#ffe2a8', 0, 60, 1.1); l.position.set(x + 20, FLAT3 + 12, z + 20); group.add(l); return l; });
  // manche à air, panneau de bienvenue, ponton
  const sock = new THREE.Group(); sock.position.set(-160, FLAT3, 36);
  sock.add(m(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), '#e9e4d8', 0, 3, 0));
  const sockCloth = new THREE.Group(); sockCloth.position.y = 5.8; sockCloth.userData.dynamic = true;
  for (let k = 0; k < 4; k++) sockCloth.add(m(new THREE.CylinderGeometry(0.45 - k * 0.07, 0.38 - k * 0.07, 0.6, 8, 1, true).rotateZ(Math.PI / 2), k % 2 ? '#ffffff' : '#ff8a3a', 0.35 + k * 0.6, 0, 0));
  sock.add(sockCloth); group.add(sock);
  const welcome = signBoard(['PORT-CENDRE', 'Île volcanique · Aéroport international'], { bg: '#10162b', fg: '#ff8a3a', w: 7, h: 1.8, cw: 1024, ch: 280, y: 3.0, wood: '#3a3230' });
  welcome.position.set(226, height3(226, 30), 30); welcome.rotation.y = -Math.PI / 2; group.add(welcome);
  const rsign = sign(['RAMPE HYDRAVIONS ↑'], '#10162b', '#ffd166', 5, 0.8, 512, 100); rsign.position.set(222, FLAT3 + 2.2, -4); rsign.rotation.y = -Math.PI / 2; group.add(rsign);
  group.add(boxM(0.2, 2.8, 0.2, '#8d9299', 222, FLAT3 + 1.4, -4.3));
  // radar au sol
  const radar = new THREE.Group(); radar.position.set(-200, FLAT3, 100); radar.userData.dynamic = true;
  radar.add(m(new THREE.CylinderGeometry(0.4, 0.6, 7, 8), '#e9e4d8', 0, 3.5, 0));
  const dish = new THREE.Group(); dish.position.y = 7.4; dish.add(boxM(6, 2, 0.4, '#e9e4d8', 0, 0, 0)); radar.add(dish); group.add(radar); cCircle(-200, 100, 0.8);
  // fumée du volcan (points, suivie par le système de fumée du jeu)
  const crater = new THREE.Vector3(cx + I3.volcano.x, height3(I3.volcano.x, I3.volcano.z) + 20, cz + I3.volcano.z);

  // ── collisions automatiques puis fusion des maillages statiques ──
  autoColliders(group, colliders, { ground: (x, z) => { let g = heightAt(x, z); for (const p of platforms) if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) g = Math.max(g, p.top); return g; } });
  mergeStatic(group, flatMat, (o) => o.userData.dynamic);

  const points = {
    fireBtn: wp(F.x + F.w / 2 + 0.8, FLAT3 + 1.4, fz0 - 0.4),
    extRack: wp(F.x - F.w / 2 + 3, FLAT3 + 1.0, F.z + F.d / 2 - 1.1),
    gantry: wp(GA.x, FLAT3, GA.z),
    towerTop: wp(To.x - 3.2, cabY + 0.4, To.z + 2.1),
    towerBase: wp(To.x + 2.5, FLAT3, To.z + LANE + 1.5),
    breakGap: wp(To.x - 1.3, FLAT3, To.z + LANE),
    ramp: wp(I3.ramp.x0 + 6, FLAT3, I3.ramp.z),
    park: wp(I3.ramp.x0 - 8, FLAT3, I3.ramp.z),
    board: wp(-18, FLAT3 + 6, T.z + T.d / 2 - 0.5),
    shop: wp(T.x + 30, FLAT3 + 1.1, T.z + 2.4),
    apron: wp(22, FLAT3, 100),
    crater,
    vents,
  };
  let bayOpen = 0, bayTarget = 0;
  return {
    cx, cz, group, colliders, platforms, points, height: height3, R2: I.R2, radarPos: new THREE.Vector3(cx, 0, cz),
    info: I,
    lights: () => [{ p: wp(22, FLAT3, 100), r: 34 }, { p: wp(-50, FLAT3, 100), r: 24 }, { p: wp(T.x, FLAT3, T.z), r: 30 }],
    setNight(nf) { flood.emissiveIntensity = 0.3 + nf * 2.2; apronLights.forEach((l) => { l.intensity = nf * 26; }); termLight.intensity = 4 + nf * 12; },
    openBays(full) { bayTarget = 1; if (full) bayOpen = 1; bays.forEach((b) => { b.col.disabled = true; }); },
    resetBays() { bayTarget = 0; bayOpen = 0; bays.forEach((b) => { b.col.disabled = false; }); },
    get baysOpen() { return bayTarget > 0; },
    update(t, dt) {
      radar.children[1].rotation.y += dt * 0.8;
      sockCloth.rotation.y = -0.6 + Math.sin(t * 0.8) * 0.3;
      siren.visible = Math.sin(t * 5) > 0 && bayTarget > 0 && bayOpen < 1;
      if (bayOpen < bayTarget) bayOpen = Math.min(1, bayOpen + dt * 0.35);
      bays.forEach((b) => { b.mesh.position.y = FLAT3 + 2.7 + bayOpen * 4.6; b.mesh.scale.y = 1 - bayOpen * 0.85; });
    },
    dispose() { scene.remove(group); },
  };
}
