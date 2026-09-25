// Île 4 — Hélios, la ville-lumière : l'île du laboratoire de Marthe.
// Au sud, l'aéroport Soleil-Levant (piste est-ouest, aérogare, hangar de fret). Un canal coupe l'île en deux :
// le pont du Soleil est un pont-levis à deux manivelles. Au nord, la ville : avenue du Zénith, gare routière,
// cordon sanitaire (barrage à code), place du Soleil, Tour Hélios et l'Institut Hélios (sas de décontamination).
// Coordonnées locales : x vers l'est, z vers le sud, origine au centre de l'île.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, rng, smoothstep } from './noise.js';
import { prep, flatMat, textTexture, mergeStatic, signBoard, autoColliders, heightAt, colorize } from './terrain.js';

export const FLAT4 = 2.6;
export const I4 = {
  runway: { x0: -235, x1: 235, z: 160, w: 40 },
  apron: { x0: -130, x1: 70, z0: 117, z1: 140 },
  terminal: { x: -95, z: 108, w: 46, d: 14, h: 8 },     // aérogare (façade vitrée côté piste)
  fret: { x: 40, z: 106, w: 24, d: 14, h: 8 },          // hangar de fret, ouvert côté piste
  ctower: { x: 118, z: 104 },
  canal: { z: 78, half: 9 },
  bridge: { x0: -8, x1: 8 },
  cranks: [{ x: -13, z: 95 }, { x: 13, z: 95 }],
  gate: { z: -14.5, x0: -10, x1: 10, booth: { x: 17.5, z: -8 } },
  board: { x: -22, z: 12 },
  plaza: { x0: -45, x1: 45, z0: -112, z1: -30 },
  fountain: { x: 0, z: -68 },
  pad: { x: 0, z: -105, r: 5 },
  lab: { x0: -32, x1: 32, z0: -158, z1: -118, h: 14, door: 4 },
  tower: { x: 100, z: -95, w: 26, d: 26, h: 112 },
  hill: { x: -120, z: -300, h: 28, r: 45 },
  vehicles: {
    fork: { x: 40, z: 108, yaw: Math.PI },
    kart: { x: -70, z: 124, yaw: Math.PI / 2 },
  },
};
// lignes de bus de la gare routière (symbole, nom)
export const BUS_LINES = [['⚓', 'PORT'], ['☀', 'SOLEIL'], ['★', 'ÉTOILE'], ['♣', 'TRÈFLE'], ['♥', 'CŒUR'], ['✈', 'AÉROPORT']];

function rawT(x, z) {
  const ex = x / 380, ez = (z + 25) / 330;
  return 1 - Math.sqrt(ex * ex + ez * ez) + (fbm(x * 0.01 + 17, z * 0.01 - 9) - 0.5) * 0.2;
}
export function height4(x, z) {
  const t = rawT(x, z);
  let h;
  if (t < 0) h = Math.max(-18, t > -0.05 ? t * 30 : -1.5 + (t + 0.05) * 130);
  else {
    const land = smoothstep(0.02, 0.14, t);
    h = Math.min(t / 0.06, 1) * 1.2 + Math.max(0, t - 0.06) * 5 + (fbm(x * 0.03, z * 0.03) - 0.5) * 3 * land;
    const H = I4.hill;
    h += H.h * Math.exp(-((x - H.x) ** 2 + (z - H.z) ** 2) / (2 * H.r * H.r)) * land;
  }
  // plateau de la ville et de l'aéroport (quais maçonnés au bord de l'eau)
  const fx = 1 - smoothstep(262, 290, Math.abs(x));
  const fz = 1 - smoothstep(0, 26, Math.max(z - 212, -262 - z, 0));
  h += (FLAT4 - h) * fx * fz;
  // canal : bords francs, cachés sous les dalles des quais
  if (Math.abs(z - I4.canal.z) < I4.canal.half && Math.abs(x) < 340) h = Math.min(h, -4.2);
  return h;
}

// ── aides de construction ──
function m(geo, col, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(prep(geo, col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function boxM(w, h, d, col, x, y, z) { return m(new THREE.BoxGeometry(w, h, d), col, x, y, z); }
const glassMat = new THREE.MeshLambertMaterial({ color: '#8fc6d8', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
function glassBox(w, h, d, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat); o.position.set(x, y, z); return o; }
function sign(lines, bg, fg, w, h, cw = 512, ch = 128, basic = false) {
  const mat = basic ? new THREE.MeshBasicMaterial({ map: textTexture(lines, bg, fg, cw, ch), toneMapped: false }) : new THREE.MeshLambertMaterial({ map: textTexture(lines, bg, fg, cw, ch) });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// façades : fenêtres (bureaux, immeubles) et murs-rideaux (tours de verre), avec fenêtres allumées la nuit
let TEXS = null;
function facadeTextures() {
  if (TEXS) return TEXS;
  const r = rng(77);
  const mk = (S, draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = S; draw(cv.getContext('2d'), S); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const lit = [];
  const win = mk(512, (g, S) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    const c = S / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * c, y = j * c;
      g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, y + c - 7, c, 4);
      g.fillStyle = '#e9e3d8'; g.fillRect(x + 18, y + 22, c - 36, c - 44);
      g.fillStyle = '#33465f'; g.fillRect(x + 22, y + 26, c - 44, c - 52);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 22, y + 26, c - 44, 9);
      g.fillStyle = '#e9e3d8'; g.fillRect(x + c / 2 - 2, y + 26, 4, c - 52);
      if (r() < 0.28) lit.push([x + 22, y + 26, c - 44, c - 52]);
    }
  });
  const winLit = mk(512, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); for (const [x, y, w, h] of lit) { g.fillStyle = r() < 0.5 ? '#ffd08a' : '#fff1c9'; g.fillRect(x, y, w, h); } });
  const litG = [];
  const glass = mk(256, (g, S) => {
    const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#d9ecf6'); grd.addColorStop(1, '#8fb2c8');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; g.fillRect(i * 64 + 4, j * 64 + 4, 56, 56); if (r() < 0.22) litG.push([i * 64 + 4, j * 64 + 4, 56, 56]); }
    g.fillStyle = '#2a3440'; for (let k = 0; k <= 4; k++) { g.fillRect(k * 64 - 2, 0, 4, S); g.fillRect(0, k * 64 - 3, S, 5); }
  });
  const glassLit = mk(256, (g, S) => { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); for (const [x, y, w, h] of litG) { g.fillStyle = '#fff2cf'; g.fillRect(x, y, w, h); } });
  TEXS = { win, winLit, glass, glassLit };
  return TEXS;
}
// boîte de façade : UV à l'échelle (tu × tv mètres par motif), toit sur un coin de mur uni
function facadeBox(w, h, d, tu, tv) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) uv.setXY(i, 0.004, 0.004);
    else uv.setXY(i, uv.getX(i) * dims[f][0] / tu, uv.getY(i) * dims[f][1] / tv);
  }
  return g.toNonIndexed();
}

export function createIsland4(scene, seed, i3) {
  const r = rng(seed ^ 0x4e11057);
  // plus loin que Port-Cendre, dans le prolongement de la route
  const a3 = Math.atan2(i3.cz, i3.cx);
  const ang = a3 + (r() - 0.5) * 0.7;
  const dist = Math.hypot(i3.cx, i3.cz) + 1900 + r() * 400;
  const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  scene.add(group);
  const wp = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
  const colliders = [], platforms = [], bld = [];
  const cBox = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; colliders.push(c); return c; };
  const cCircle = (x, z, rr, extra = {}) => { const c = { type: 'circle', x: cx + x, z: cz + z, r: rr, ...extra }; colliders.push(c); return c; };
  const solid = (x0, x1, z0, z1, top) => { cBox(x0, x1, z0, z1, { top }); bld.push({ minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, top }); };
  const dyn = (o) => { o.userData.dynamic = true; group.add(o); return o; };
  const Y = FLAT4;

  // ── énigme du barrage : lignes de bus → quais, code = quais de 4 lignes tirées au sort ──
  const rp = rng(seed ^ 0xb05);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rp() - 0.5).slice(0, 6);
  const order = [0, 1, 2, 3, 4, 5].sort(() => rp() - 0.5).slice(0, 4);
  const puzzle = { quais: digits, syms: order.map((i) => BUS_LINES[i][0]), code: order.map((i) => String(digits[i])).join('') };

  // ── terrain : sable clair, garrigue, plateau pavé ──
  let tg = new THREE.PlaneGeometry(860, 760, 172, 152);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, 0, -25);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height4(pos.getX(i), pos.getZ(i)));
  tg = tg.toNonIndexed(); tg.deleteAttribute('uv'); tg.computeVertexNormals();
  const tp = tg.attributes.position, tn = tg.attributes.normal;
  const cols = new Float32Array(tp.count * 3);
  const c = new THREE.Color();
  const SAND = new THREE.Color('#ecdcaa'), WET = new THREE.Color('#cbb27c'), DEEP = new THREE.Color('#15607a');
  const GR1 = new THREE.Color('#8fb069'), GR2 = new THREE.Color('#7a9c5a'), ROCK = new THREE.Color('#b5a58c');
  const PAVE = new THREE.Color('#bdb6aa'), AIRG = new THREE.Color('#93b46c');
  for (let i = 0; i < tp.count; i += 3) {
    const h = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3;
    const x = (tp.getX(i) + tp.getX(i + 1) + tp.getX(i + 2)) / 3;
    const z = (tp.getZ(i) + tp.getZ(i + 1) + tp.getZ(i + 2)) / 3;
    const ny = tn.getY(i);
    const onPlat = Math.abs(h - Y) < 0.05 && Math.abs(x) < 262 && z > -262 && z < 212;
    if (h < -0.15) c.copy(WET).lerp(DEEP, smoothstep(-0.5, -14, h));
    else if (onPlat) c.copy(z > I4.canal.z ? AIRG : PAVE).multiplyScalar(0.97 + fbm(x * 0.05, z * 0.05) * 0.06);
    else if (h < 1.4) c.copy(SAND);
    else if (ny < 0.8) c.copy(ROCK);
    else c.copy(GR1).lerp(GR2, fbm(x * 0.04 + 5, z * 0.04));
    c.multiplyScalar(0.96 + r() * 0.06);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, flatMat);
  terrain.receiveShadow = true;
  terrain.userData.dynamic = true;
  group.add(terrain);
  // fond marin sous l'île (loin du fond général)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1300), new THREE.MeshLambertMaterial({ color: '#1f5d70' }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -18.5, -25); floor.userData.dynamic = true; group.add(floor);

  // ── canal : dalles des quais, garde-corps, échelles ──
  const CZ = I4.canal.z, CH = I4.canal.half;
  for (const s of [-1, 1]) {
    const zq = CZ + s * (CH + 2.5);
    group.add(boxM(640, 0.3, 5, '#cfc6b2', 0, Y - 0.1, zq));
    group.add(boxM(640, 7.2, 0.6, '#a79f8e', 0, Y - 3.6, CZ + s * (CH + 0.3)));        // mur de quai
    for (const x0 of [-300, 14]) {                                                      // garde-corps (le pont reste libre)
      const len = 286;
      group.add(boxM(len, 0.08, 0.08, '#3a3f48', x0 + len / 2, Y + 1.0, CZ + s * (CH + 0.6)));
      for (let x = x0; x <= x0 + len; x += 3) group.add(boxM(0.08, 1.0, 0.08, '#3a3f48', x, Y + 0.5, CZ + s * (CH + 0.6)));
      cBox(x0, x0 + len, CZ + s * (CH + 0.6) - 0.15, CZ + s * (CH + 0.6) + 0.15);
    }
  }
  // échelles pour sortir de l'eau (deux de chaque côté)
  const ladders = [];
  for (const s of [-1, 1]) for (const x of [-40, 40]) {
    const zl = CZ + s * (CH - 0.45);
    for (const dx of [-0.32, 0.32]) group.add(boxM(0.07, 7.3, 0.07, '#8d9299', x + dx, Y - 3.0, zl));
    for (let y = -3.8; y < Y; y += 0.35) group.add(boxM(0.64, 0.05, 0.05, '#b8bec6', x, y, zl));
    ladders.push({ x: cx + x, z: cz + zl - s * 0.2, y0: -1.4, y1: Y, dir: new THREE.Vector3(0, 0, s), top: wp(x, Y, CZ + s * (CH + 1.6)), i4: true });
  }

  // ── pont du Soleil : pont-levis à deux volées ──
  const BX = I4.bridge, BW = BX.x1 - BX.x0;
  const leaves = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(0, Y, CZ + s * CH); dyn(pv);
    const leaf = new THREE.Group(); leaf.position.z = -s * CH / 2; pv.add(leaf);
    leaf.add(boxM(BW, 0.5, CH, '#5d6470', 0, -0.25, 0));
    leaf.add(boxM(BW - 1, 0.04, CH, '#3b3f47', 0, 0.02, 0));
    for (const sx of [-1, 1]) { leaf.add(boxM(0.25, 1.1, CH, '#ffd166', sx * (BW / 2 - 0.12), 0.55, 0)); leaf.add(boxM(0.25, 0.25, CH, '#c8553d', sx * (BW / 2 - 0.12), 1.1, 0)); }
    for (let k = 0; k < 4; k++) leaf.add(boxM(BW - 1, 0.03, 0.5, k % 2 ? '#ffd166' : '#10162b', 0, 0.05, -s * (CH / 2 - 0.4) + s * k * 0.02));
    leaves.push({ pv, s });
    // piliers et contrepoids de chaque rive
    for (const sx of [-1, 1]) {
      group.add(boxM(1.6, 9, 1.6, '#d8cfbd', sx * (BW / 2 + 1.2), Y + 4.5, CZ + s * (CH + 1.4)));
      group.add(boxM(2.0, 1.0, 2.0, '#c8553d', sx * (BW / 2 + 1.2), Y + 9.3, CZ + s * (CH + 1.4)));
      cCircle(sx * (BW / 2 + 1.2), CZ + s * (CH + 1.4), 1.1);
    }
  }
  const bridgePlat = { minX: cx + BX.x0, maxX: cx + BX.x1, minZ: cz + CZ - CH - 0.5, maxZ: cz + CZ + CH + 0.5, top: Y + 0.02, bridge: true };
  const bridgeRails = [cBox(BX.x0 - 0.2, BX.x0 + 0.3, CZ - CH, CZ + CH), cBox(BX.x1 - 0.3, BX.x1 + 0.2, CZ - CH, CZ + CH)];
  const bsign = signBoard(['PONT DU SOLEIL', 'pont-levis · manivelles A et B'], { bg: '#10162b', fg: '#ffd166', w: 4.2, h: 1.1, cw: 1024, ch: 270, y: 2.4 });
  bsign.position.set(-14, Y, 99); group.add(bsign);
  // manivelles (roue qui tourne quand on les actionne)
  const cranks = I4.cranks.map((p, i) => {
    group.add(boxM(1.0, 1.1, 1.0, '#33373f', p.x, Y + 0.55, p.z));
    group.add(boxM(1.1, 0.12, 1.1, '#ffd166', p.x, Y + 1.12, p.z));
    const wheel = new THREE.Group(); wheel.position.set(p.x, Y + 1.5, p.z - 0.62); dyn(wheel);
    wheel.add(m(new THREE.TorusGeometry(0.45, 0.06, 5, 14), '#c8553d'));
    for (let k = 0; k < 3; k++) { const sp = boxM(0.06, 0.9, 0.06, '#c8553d', 0, 0, 0); sp.rotation.z = k * Math.PI / 3; wheel.add(sp); }
    wheel.add(boxM(0.08, 0.08, 0.3, '#10162b', 0.45, 0, -0.15));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff4d4d', toneMapped: false }));
    lamp.position.set(p.x, Y + 1.35, p.z + 0.4); dyn(lamp);
    const s = sign([`MANIVELLE ${i ? 'B' : 'A'}`, 'tourner avec l\'autre'], '#fff4e0', '#10162b', 1.0, 0.45, 512, 230);
    s.position.set(p.x, Y + 0.7, p.z - 0.51); s.rotation.y = Math.PI; group.add(s);
    cCircle(p.x, p.z, 0.7);
    return { wheel, lamp };
  });

  // ── aéroport Soleil-Levant ──
  const RW = I4.runway, asphalt = '#2e3138', white = '#eceae3', yellow = '#ffd166', Yr = Y + 0.03;
  group.add(boxM(RW.x1 - RW.x0, 0.06, RW.w, asphalt, 0, Yr, RW.z));
  for (let x = RW.x0 + 26; x < RW.x1 - 26; x += 14) group.add(boxM(7, 0.02, 0.6, white, x, Yr + 0.04, RW.z));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 9; k++) group.add(boxM(10, 0.02, 1.3, white, sx * (RW.x1 - 8), Yr + 0.04, RW.z - 15 + k * 3.8));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.5), new THREE.MeshLambertMaterial({ map: textTexture([sx < 0 ? '09' : '27'], asphalt, white, 256, 140), transparent: true }));
    num.rotation.x = -Math.PI / 2; num.rotation.z = sx < 0 ? -Math.PI / 2 : Math.PI / 2; num.position.set(sx * (RW.x1 - 24), Yr + 0.05, RW.z); group.add(num);
    // zone de toucher : bandes épaisses
    for (const dz of [-8, 8]) group.add(boxM(22, 0.02, 2.2, white, sx * (RW.x1 - 55), Yr + 0.04, RW.z + dz));
  }
  for (const s of [-1, 1]) group.add(boxM(RW.x1 - RW.x0, 0.02, 0.35, yellow, 0, Yr + 0.04, RW.z + s * (RW.w / 2 - 1)));
  const AP = I4.apron;
  group.add(boxM(AP.x1 - AP.x0, 0.06, AP.z1 - AP.z0, '#3d4048', (AP.x0 + AP.x1) / 2, Yr - 0.015, (AP.z0 + AP.z1) / 2));
  for (const gx of [-60, 0]) group.add(boxM(0.35, 0.02, 20, yellow, gx, Yr + 0.035, 128));
  // balisage (lampes toujours alimentées : panneaux solaires)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false });
  const lampGeos = [];
  for (let x = RW.x0; x <= RW.x1; x += 12) for (const sz of [-1, 1]) lampGeos.push(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 6).translate(x, Yr + 0.18, RW.z + sz * (RW.w / 2 + 0.7)));
  for (const sx of [-1, 1]) for (let k = -6; k <= 6; k++) lampGeos.push(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 6).translate(sx * (RW.x1 + 1.5), Yr + 0.18, RW.z + k * 3));
  dyn(new THREE.Mesh(mergeGeometries(lampGeos), lampMat));
  // aérogare : façade vitrée côté piste, portes, comptoirs, relais (troc)
  const T = I4.terminal, tz0 = T.z - T.d / 2, tz1 = T.z + T.d / 2, tx0 = T.x - T.w / 2, tx1 = T.x + T.w / 2;
  const cream = '#efe6d2', teal = '#1f8a8a', coral = '#ff6b5b';
  group.add(boxM(T.w, T.h, 0.5, cream, T.x, Y + T.h / 2, tz0));
  cBox(tx0, T.x - 3, tz0 - 0.3, tz0 + 0.3); cBox(T.x + 3, tx1, tz0 - 0.3, tz0 + 0.3);
  group.add(boxM(6, T.h - 3, 0.5, cream, T.x, Y + 3 + (T.h - 3) / 2, tz0));
  for (const sx of [tx0, tx1]) { group.add(boxM(0.5, T.h, T.d, cream, sx, Y + T.h / 2, T.z)); cBox(sx - 0.3, sx + 0.3, tz0, tz1); }
  const doorsT = [[-3, 3], [12, 16]];
  let xa = tx0;
  for (const [a, b] of doorsT) {
    const w = (T.x + a) - xa; if (w > 0) { group.add(glassBox(w, T.h - 1.2, 0.12, xa + w / 2, Y + 0.6 + (T.h - 1.2) / 2, tz1)); cBox(xa, xa + w, tz1 - 0.25, tz1 + 0.25); }
    group.add(glassBox(b - a, T.h - 3.2, 0.12, T.x + (a + b) / 2, Y + 3 + (T.h - 3.2) / 2, tz1));
    xa = T.x + b;
  }
  group.add(glassBox(tx1 - xa, T.h - 1.2, 0.12, (xa + tx1) / 2, Y + 0.6 + (T.h - 1.2) / 2, tz1)); cBox(xa, tx1, tz1 - 0.25, tz1 + 0.25);
  for (let x = tx0; x <= tx1 + 0.1; x += 4.6) group.add(boxM(0.3, T.h, 0.4, '#3a3f48', x, Y + T.h / 2, tz1));
  group.add(boxM(T.w + 4, 0.7, T.d + 6, coral, T.x, Y + T.h + 0.35, T.z + 1));
  group.add(boxM(T.w + 4.2, 0.25, 0.4, yellow, T.x, Y + T.h, tz1 + 4));
  for (let x = tx0 - 1; x <= tx1 + 1; x += 11.5) { group.add(boxM(0.4, T.h, 0.4, '#3a3f48', x, Y + T.h / 2, tz1 + 3.8)); cCircle(x, tz1 + 3.8, 0.35); }
  bld.push({ minX: cx + tx0, maxX: cx + tx1, minZ: cz + tz0, maxZ: cz + tz1 + 4, top: Y + T.h + 1 });
  const tsign = sign(['HÉLIOS · SOLEIL-LEVANT'], '#10162b', '#ffd166', 26, 2.4, 1536, 140);
  tsign.position.set(T.x, Y + T.h + 1.9, tz1 + 3.95); group.add(tsign);
  group.add(boxM(26.5, 2.8, 0.25, '#10162b', T.x, Y + T.h + 1.9, tz1 + 3.8));
  for (let i = 0; i < 4; i++) { group.add(boxM(4.2, 1.1, 1.1, teal, tx0 + 8 + i * 6.5, Y + 0.55, T.z - 3)); cBox(tx0 + 5.9 + i * 6.5, tx0 + 10.1 + i * 6.5, T.z - 3.55, T.z - 2.45); }
  for (let i = 0; i < 3; i++) { group.add(boxM(5, 0.5, 1.0, '#6b6f78', tx0 + 10 + i * 9, Y + 0.25, T.z + 3)); cBox(tx0 + 7.5 + i * 9, tx0 + 12.5 + i * 9, T.z + 2.5, T.z + 3.5); }
  group.add(boxM(6, 1.1, 1.4, yellow, T.x + 14, Y + 0.55, T.z - 2)); cBox(T.x + 11, T.x + 17, T.z - 2.7, T.z - 1.3);
  group.add(boxM(6, 2.6, 0.4, teal, T.x + 14, Y + 1.3, tz0 + 0.5));
  const relais = sign(['RELAIS SOLEIL-LEVANT', 'troc accepté 🐚'], '#10162b', '#ffd166', 5, 1.2, 512, 150);
  relais.position.set(T.x + 14, Y + 3.3, tz0 + 0.72); group.add(relais);
  const dep = sign(['ARRIVÉES', 'HX-404  PORT-CENDRE ..... ?', 'AA-310  SAINT-ESCALE .... ANNULÉ', 'CONFINEMENT : RESTEZ CHEZ VOUS'], '#10162b', '#ffd166', 9, 3.6, 1024, 420);
  dep.position.set(T.x - 12, Y + 5.2, tz0 + 0.3); group.add(dep);
  // hangar de fret (ouvert côté piste) : caisses, palettes
  const F = I4.fret, fz0 = F.z - F.d / 2, fx0 = F.x - F.w / 2, fx1 = F.x + F.w / 2;
  group.add(boxM(F.w, F.h, 0.4, '#7c8b96', F.x, Y + F.h / 2, fz0)); cBox(fx0, fx1, fz0 - 0.3, fz0 + 0.3);
  for (const sx of [fx0, fx1]) { group.add(boxM(0.4, F.h, F.d, '#7c8b96', sx, Y + F.h / 2, F.z)); cBox(sx - 0.3, sx + 0.3, fz0, F.z + F.d / 2); }
  const fr = m(new THREE.CylinderGeometry(F.w / 2 + 0.6, F.w / 2 + 0.6, F.d + 1, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), '#5d6d78', F.x, Y + F.h, F.z); fr.scale.set(1, 0.3, 1); group.add(fr);
  bld.push({ minX: cx + fx0, maxX: cx + fx1, minZ: cz + fz0, maxZ: cz + F.z + F.d / 2, top: Y + F.h + 3.6 });
  const fsign = sign(['FRET · CARGO HÉLIOS'], '#10162b', '#5ef2c2', 10, 1.2, 1024, 130);
  fsign.position.set(F.x, Y + F.h - 1, F.z + F.d / 2 + 0.05); group.add(fsign);
  group.add(boxM(F.w, 1.4, 0.3, '#7c8b96', F.x, Y + F.h - 0.7, F.z + F.d / 2 - 0.1));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) group.add(boxM(1.2, 1.1, 1.2, '#b98b5e', fx0 + 2 + i * 1.5, Y + 0.55 + j * 1.12, fz0 + 2));
  cBox(fx0 + 1.3, fx0 + 5.7, fz0 + 1.3, fz0 + 2.7);
  // petite tour de contrôle
  const CT = I4.ctower;
  group.add(boxM(4, 12, 4, '#d8cfbd', CT.x, Y + 6, CT.z)); cBox(CT.x - 2, CT.x + 2, CT.z - 2, CT.z + 2, { top: Y + 15 });
  group.add(boxM(6.5, 0.5, 6.5, '#10162b', CT.x, Y + 12.2, CT.z));
  group.add(glassBox(6, 2.4, 6, CT.x, Y + 13.6, CT.z));
  group.add(boxM(6.6, 0.4, 6.6, '#10162b', CT.x, Y + 15, CT.z));
  bld.push({ minX: cx + CT.x - 3.3, maxX: cx + CT.x + 3.3, minZ: cz + CT.z - 3.3, maxZ: cz + CT.z + 3.3, top: Y + 16 });
  // manche à air
  const sock = new THREE.Group(); sock.position.set(150, Y, 128);
  sock.add(m(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), '#e9e4d8', 0, 3, 0));
  const sockCloth = new THREE.Group(); sockCloth.position.y = 5.8; sockCloth.userData.dynamic = true;
  for (let k = 0; k < 4; k++) sockCloth.add(m(new THREE.CylinderGeometry(0.45 - k * 0.07, 0.38 - k * 0.07, 0.6, 8, 1, true).rotateZ(Math.PI / 2), k % 2 ? '#ffffff' : '#ff8a3a', 0.35 + k * 0.6, 0, 0));
  sock.add(sockCloth); group.add(sock); cCircle(150, 128, 0.3);

  // ── ville : rues, trottoirs, marquages ──
  const road = '#3a3e46', mark = '#f2efe6', RY = Y + 0.025;
  const flat = (w, d, col, x, z, dy = 0) => group.add(boxM(w, 0.05, d, col, x, RY + dy, z));
  flat(14, 94, road, 0, 17);                              // avenue du Zénith (quai → place)
  for (let z = 62; z > -28; z -= 7) flat(0.3, 3.2, mark, 0, z, 0.01);
  for (const [zs, w] of [[40, 14], [-20, 14], [-170, 14]]) {
    flat(524, w, road, 0, zs);
    for (let x = -258; x < 258; x += 8) if (Math.abs(x) > 12) flat(3.2, 0.3, mark, x, zs, 0.01);
  }
  for (const xs of [-225, -150, -75, 75, 150, 225]) {
    flat(14, 318, road, xs, -96);
    for (let z = 60; z > -250; z -= 8) flat(0.3, 3.2, mark, xs, z, 0.01);
  }
  // passages piétons
  for (const [x, z, rot] of [[0, 32, 0], [0, -12, 0], [0, 48, 0], [-10, 40, 1], [10, 40, 1], [-10, -20, 1], [10, -20, 1]]) {
    for (let k = -3; k <= 3; k++) flat(rot ? 3.2 : 0.7, rot ? 0.7 : 3.2, mark, x + (rot ? 0 : k * 1.4), z + (rot ? k * 1.4 : 0), 0.012);
  }
  // rails du tramway (boulevard de la Lumière)
  for (const dz of [-1.7, -0.3, 0.3, 1.7]) flat(524, 0.12, '#8d9299', 0, -20 + dz, 0.015);

  // ── bâtiments (façades à fenêtres) ──
  const T4 = facadeTextures();
  const winMat = new THREE.MeshLambertMaterial({ map: T4.win, emissiveMap: T4.winLit, emissive: '#ffcf85', emissiveIntensity: 0.05, vertexColors: true });
  const glassBMat = new THREE.MeshLambertMaterial({ map: T4.glass, emissiveMap: T4.glassLit, emissive: '#fff1c8', emissiveIntensity: 0.05, vertexColors: true });
  const winGeos = [], glassGeos = [];
  const TINTS = ['#f0e2c8', '#e8c9a8', '#dcae8f', '#cddbc4', '#e7dbef', '#f3efe6', '#dcc79f', '#c3d0de', '#f2d1c4'];
  const GTINT = ['#a8dcec', '#98bfe0', '#a9e3cf'];
  const roofCols = ['#6b6f78', '#8a7f72', '#5d6470', '#7c6a5a'];
  const building = (x0, x1, z0, z1, h, style = 'win') => {
    const w = x1 - x0, d = z1 - z0, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    const glass = style === 'glass';
    const g = facadeBox(w, h, d, glass ? 12 : 16, glass ? 12 : 14);
    g.translate(x, Y + h / 2, z);
    colorize(g, glass ? GTINT[Math.floor(r() * GTINT.length)] : TINTS[Math.floor(r() * TINTS.length)]);
    (glass ? glassGeos : winGeos).push(g);
    group.add(boxM(w + 0.3, 0.45, d + 0.3, roofCols[Math.floor(r() * roofCols.length)], x, Y + h + 0.22, z));
    group.add(boxM(w + 0.1, 0.9, d + 0.1, '#6b6f78', x, Y + 0.45, z));                  // soubassement
    // toiture : climatiseurs, château d'eau, antenne
    const nAc = 1 + Math.floor(r() * 3);
    for (let k = 0; k < nAc; k++) group.add(boxM(2.2, 1.2, 1.6, '#c9cfd6', x + (r() - 0.5) * (w - 4), Y + h + 1.05, z + (r() - 0.5) * (d - 4)));
    if (r() < 0.45) { const tx = x + (r() - 0.5) * (w - 6), tz = z + (r() - 0.5) * (d - 6); group.add(m(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 10), '#8a6a4a', tx, Y + h + 2.6, tz)); for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) group.add(boxM(0.12, 1.4, 0.12, '#5d6470', tx + dx, Y + h + 1.1, tz + dz)); }
    if (r() < 0.35) group.add(boxM(0.12, 6, 0.12, '#8d9299', x + w * 0.3, Y + h + 3.4, z - d * 0.3));
    solid(x0, x1, z0, z1, Y + h + 1);
    return { x, z, w, d, h };
  };
  // découpe des îlots : une à trois constructions, hauteurs variées
  const XB = [[12, 68], [82, 143], [157, 218], [232, 258]];
  const strip = (x0, x1, z0, z1, n, hMin, hMax, axis = 'z', glassP = 0.18) => {
    const L = axis === 'z' ? z1 - z0 : x1 - x0, seg = L / n;
    for (let k = 0; k < n; k++) {
      const a = (axis === 'z' ? z0 : x0) + k * seg + 1.5, b = a + seg - 3;
      const h = Math.round(hMin + r() * (hMax - hMin));
      if (axis === 'z') building(x0 + 1.5, x1 - 1.5, a, b, h, r() < glassP ? 'glass' : 'win');
      else building(a, b, z0 + 1.5, z1 - 1.5, h, r() < glassP ? 'glass' : 'win');
    }
  };
  for (const s of [-1, 1]) {
    for (const [a, b] of XB) {
      const x0 = s < 0 ? -b : a, x1 = s < 0 ? -a : b;
      // bord du canal : cafés et petits immeubles
      strip(x0, x1, 47, 60, 2, 8, 14, 'x', 0);
      // entre le canal et le boulevard (la gare routière occupe l'îlot ouest de l'avenue)
      if (!(s < 0 && a === 12)) {
        if (s > 0 && a === 12) building(x0 + 2, x1 - 2, -9, 29, 24);          // Hôtel du Canal
        else strip(x0, x1, -13, 33, 2, 12, 30, 'z');
      }
      // au nord du boulevard
      if (a === 12) strip(s < 0 ? -68 : 52, s < 0 ? -52 : 68, -163, -27, 3, 18, 34, 'z');
      else if (a === 82 && s > 0) { strip(x0, x1, -163, -120, 1, 22, 38, 'z'); strip(x0, x1, -70, -27, 1, 16, 28, 'z'); }
      else strip(x0, x1, -163, -27, 3, 14, 42, 'z');
      strip(x0, x1, -255, -177, 2, 14, 40, 'z');
    }
  }
  // Tour Hélios : repère visible de loin (feu clignotant au sommet)
  const TW = I4.tower;
  { const g = facadeBox(TW.w, TW.h, TW.d, 12, 12); g.translate(TW.x, Y + TW.h / 2, TW.z); colorize(g, '#9fd3e6'); glassGeos.push(g);
    const g2 = facadeBox(TW.w - 8, 14, TW.d - 8, 12, 12); g2.translate(TW.x, Y + TW.h + 7, TW.z); colorize(g2, '#b8e6f2'); glassGeos.push(g2); }
  for (const dy of [0.25 * TW.h, 0.5 * TW.h, 0.75 * TW.h]) group.add(boxM(TW.w + 0.4, 0.6, TW.d + 0.4, '#e9e4d8', TW.x, Y + dy, TW.z));
  group.add(boxM(TW.w - 7.6, 0.6, TW.d - 7.6, '#e9e4d8', TW.x, Y + TW.h + 14.3, TW.z));
  group.add(m(new THREE.CylinderGeometry(0.25, 0.6, 18, 6), '#e9e4d8', TW.x, Y + TW.h + 23.5, TW.z));
  solid(TW.x - TW.w / 2, TW.x + TW.w / 2, TW.z - TW.d / 2, TW.z + TW.d / 2, Y + TW.h + 33);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
  beacon.position.set(TW.x, Y + TW.h + 33, TW.z); dyn(beacon);
  const crown = sign(['HÉLIOS'], '#10162b', '#ffd166', 16, 3.2, 1024, 200, true);
  for (let k = 0; k < 4; k++) { const cr = crown.clone(); const a = k * Math.PI / 2; cr.position.set(TW.x + Math.sin(a) * (TW.w / 2 - 3.9), Y + TW.h + 7, TW.z + Math.cos(a) * (TW.d / 2 - 3.9)); cr.rotation.y = a; group.add(cr); }

  // enseignes (néons la nuit)
  const neon = (lines, bg, fg, w, h, x, y, z, ry) => { const s = sign(lines, bg, fg, w, h, 512, 160, true); s.position.set(x, y, z); s.rotation.y = ry; group.add(s); };
  neon(['HÔTEL DU CANAL'], '#10162b', '#ff8fab', 12, 1.6, 38, Y + 20, 29.2, 0);
  neon(['CAFÉ DU CANAL'], '#1f8a8a', '#fff4e0', 6, 1.0, 26, Y + 5, 60.2, 0);
  neon(['PHARMACIE ✚'], '#10162b', '#3dff7a', 5, 1.0, -26, Y + 5, 60.2, 0);
  neon(['CINÉMA LUMIÈRE'], '#10162b', '#ffd166', 8, 1.3, 68.2, Y + 9, -60, Math.PI / 2);
  neon(['MAIRIE'], '#233b5c', '#fff4e0', 6, 1.0, -51.8, Y + 8, -60, -Math.PI / 2);
  neon(['BOULANGERIE'], '#c8553d', '#fff4e0', 6, 1.0, 97, Y + 4, 33.2, 0);
  neon(['PRESSE · TABAC'], '#10162b', '#6fb7ff', 6, 1.0, -97, Y + 4, 33.2, 0);
  neon(['BANQUE DU SOLEIL'], '#10162b', '#ffd166', 8, 1.2, 51.8, Y + 7, -130, -Math.PI / 2);
  const welcome = signBoard(['Bienvenue à HÉLIOS', 'la ville-lumière'], { bg: '#ffd166', fg: '#10162b', w: 5, h: 1.4, cw: 1024, ch: 280, y: 2.6, wood: '#3a3f48' });
  welcome.position.set(-14, Y, 58); group.add(welcome);

  // ── gare routière (îlot ouest) : abris, bus, panneau des départs ──
  group.add(boxM(54, 0.05, 44, road, -39, RY, 10));
  for (const zs of [-4, 10, 24]) {
    for (const x of [-60, -40]) for (const dz of [-1.2, 1.2]) group.add(boxM(0.2, 2.8, 0.2, '#8d9299', x, Y + 1.4, zs + dz));
    for (const x of [-60, -40]) { group.add(boxM(9, 0.2, 3.2, teal, x, Y + 2.9, zs)); group.add(boxM(7, 0.45, 0.6, '#b98b5e', x, Y + 0.45, zs + 0.9)); cBox(x - 3.5, x + 3.5, zs + 0.6, zs + 1.2); }
    for (const x of [-60, -40]) for (const dz of [-1.2, 1.2]) cCircle(x, zs + dz, 0.2);
  }
  const bus = (x, z, ry, col) => {
    const b = new THREE.Group(); b.position.set(x, Y, z); b.rotation.y = ry;
    b.add(boxM(2.6, 3, 11, col, 0, 1.9, 0)); b.add(boxM(2.62, 0.9, 10.4, '#2a3a4a', 0, 2.5, 0)); b.add(boxM(2.62, 0.3, 11, '#10162b', 0, 0.55, 0));
    group.add(b);
    const s = Math.sin(ry), co = Math.cos(ry);
    for (const k of [-3.5, 0, 3.5]) cCircle(x + s * k, z + co * k, 1.5);
  };
  bus(-50, 3, Math.PI / 2, '#ffd166'); bus(-50, 17, Math.PI / 2, '#ff6b5b');
  const B0 = I4.board;
  const boardLines = ['GARE ROUTIÈRE · DERNIERS DÉPARTS'].concat(BUS_LINES.map(([s, n], i) => `${s}  LIGNE ${n} ········ QUAI ${digits[i]}`));
  const board = signBoard(boardLines, { bg: '#10162b', fg: '#ffd166', w: 7.2, h: 4.2, cw: 1024, ch: 620, y: 3.2, wood: '#3a3f48' });
  board.position.set(B0.x, Y, B0.z); board.rotation.y = Math.PI / 2; group.add(board);
  cCircle(B0.x, B0.z - 3.3, 0.25); cCircle(B0.x, B0.z + 3.3, 0.25);

  // ── cordon sanitaire : grillage d'une mer à l'autre, barrage sur l'avenue ──
  const G = I4.gate;
  const fence = (x0, x1) => {
    const len = x1 - x0;
    for (const y of [0.25, 1.4, 2.6]) group.add(boxM(len, 0.07, 0.07, '#5d6470', (x0 + x1) / 2, Y + y, G.z));
    group.add(boxM(len, 2.5, 0.03, '#8d9aa6', (x0 + x1) / 2, Y + 1.35, G.z));
    for (let x = x0; x <= x1 + 0.01; x += 4) group.add(boxM(0.12, 3.0, 0.12, '#3a3f48', x, Y + 1.5, G.z));
    for (let x = x0; x < x1; x += 60) cBox(x, Math.min(x1, x + 60), G.z - 0.2, G.z + 0.2);
  };
  fence(-300, G.x0 - 0.6); fence(G.x1 + 0.6, 300);
  for (const sx of [G.x0 - 0.3, G.x1 + 0.3]) { group.add(boxM(0.6, 3.6, 0.6, '#c8553d', sx, Y + 1.8, G.z)); cCircle(sx, G.z, 0.4); }
  const gates = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(s * (G.x1 - G.x0) / 2, Y, G.z); dyn(pv);
    const leaf = new THREE.Group(); leaf.position.x = -s * 5; pv.add(leaf);
    leaf.add(boxM(10, 0.12, 0.12, '#ffd166', 0, 0.3, 0)); leaf.add(boxM(10, 0.12, 0.12, '#ffd166', 0, 2.7, 0));
    leaf.add(boxM(10, 2.3, 0.04, '#8d9aa6', 0, 1.5, 0));
    for (let k = -2; k <= 2; k++) leaf.add(boxM(0.1, 2.5, 0.1, '#c8553d', k * 2.3, 1.5, 0));
    gates.push({ pv, s });
  }
  const gateCol = cBox(G.x0 - 0.2, G.x1 + 0.2, G.z - 0.25, G.z + 0.25);
  const qs = sign(['BARRAGE SANITAIRE', 'accès Institut Hélios · code requis'], '#c8553d', '#fff4e0', 6, 1.2, 1024, 210);
  qs.position.set(0, Y + 3.6, G.z + 0.1); group.add(qs);
  const qs2 = sign(['⚠ QUARANTAINE ⚠'], '#ffd166', '#10162b', 3.2, 0.6, 512, 96);
  for (const x of [-40, 40, -130, 130]) { const q = qs2.clone(); q.position.set(x, Y + 1.8, G.z + 0.06); group.add(q); }
  // guérite du barrage (clavier côté avenue) et tente de dépistage
  const BO = G.booth;
  group.add(boxM(3, 2.8, 3, '#e9e4d8', BO.x, Y + 1.4, BO.z)); group.add(boxM(3.4, 0.25, 3.4, '#c8553d', BO.x, Y + 2.9, BO.z));
  group.add(glassBox(0.06, 1.0, 2.2, BO.x - 1.52, Y + 1.8, BO.z));
  cBox(BO.x - 1.5, BO.x + 1.5, BO.z - 1.5, BO.z + 1.5);
  const keypad = sign([`CODE : ${puzzle.syms.join('  ')}`, 'quais des lignes (gare routière)'], '#10162b', '#5ef2c2', 1.4, 0.5, 768, 270, true);
  keypad.position.set(BO.x - 1.53, Y + 1.05, BO.z - 0.9); keypad.rotation.y = -Math.PI / 2; group.add(keypad);
  group.add(boxM(4.5, 2.6, 6, '#e9e4d8', 32, Y + 1.3, -5)); group.add(boxM(4.7, 0.3, 6.2, '#ff6b5b', 32, Y + 2.7, -5));
  cBox(29.75, 34.25, -8, -2);
  const tent = sign(['✚ DÉPISTAGE'], '#fff4e0', '#c8553d', 3, 0.6, 512, 96); tent.position.set(29.7, Y + 2, -5); tent.rotation.y = -Math.PI / 2; group.add(tent);
  for (const x of [-7, 7]) { group.add(boxM(3.8, 0.9, 0.7, '#cfc8ba', x, Y + 0.45, -9)); }
  cBox(-8.9, -5.1, -9.35, -8.65); cBox(5.1, 8.9, -9.35, -8.65);

  // ── place du Soleil : dalles, fontaine, arbres, bancs, kiosque ──
  const PL = I4.plaza;
  group.add(boxM(PL.x1 - PL.x0, 0.06, PL.z1 - PL.z0, '#d8ccb0', (PL.x0 + PL.x1) / 2, RY, (PL.z0 + PL.z1) / 2));
  for (let x = PL.x0 + 5; x < PL.x1; x += 10) group.add(boxM(0.3, 0.02, PL.z1 - PL.z0, '#c4b797', x, RY + 0.035, (PL.z0 + PL.z1) / 2));
  const FO = I4.fountain;
  group.add(m(new THREE.CylinderGeometry(7, 7.3, 0.9, 20), '#cfc6b2', FO.x, Y + 0.45, FO.z)); cCircle(FO.x, FO.z, 7.3);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.1, 20), new THREE.MeshLambertMaterial({ color: '#5fb8d6', emissive: '#1a4a60', transparent: true, opacity: 0.85 }));
  water.position.set(FO.x, Y + 0.8, FO.z); dyn(water);
  group.add(m(new THREE.CylinderGeometry(0.6, 0.9, 3.4, 8), '#e9e4d8', FO.x, Y + 2.1, FO.z));
  const sun = new THREE.Group(); sun.position.set(FO.x, Y + 4.7, FO.z); dyn(sun);
  sun.add(new THREE.Mesh(prep(new THREE.IcosahedronGeometry(1.3, 0), '#ffd166'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#6a4a10' })));
  for (let k = 0; k < 8; k++) { const ray = m(new THREE.ConeGeometry(0.35, 1.4, 5), '#ffb020'); const a = k * Math.PI / 4; ray.position.set(Math.cos(a) * 2, Math.sin(a) * 2, 0); ray.rotation.z = a - Math.PI / 2; sun.add(ray); }
  const treeGeo = mergeGeometries([prep(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 5).translate(0, 1.1, 0), '#7f5d40'), prep(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.3, 0), '#6f9f5b')]);
  const trees = [];
  for (let z = 56; z > -26; z -= 12) for (const x of [-9, 9]) trees.push([x, z]);
  for (const x of [-38, -26, 26, 38]) for (const z of [-40, -56, -80, -96]) trees.push([x, z]);
  for (let x = -250; x < 250; x += 26) if (Math.abs(x) > 16) trees.push([x, -12.5 - 12]);
  const tm = new THREE.InstancedMesh(treeGeo, flatMat, trees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  trees.forEach(([x, z], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7); sc.setScalar(0.9 + (i % 3) * 0.15); m4.compose(new THREE.Vector3(x, Y, z), q, sc); tm.setMatrixAt(i, m4); cCircle(x, z, 0.35); });
  tm.castShadow = true; tm.userData.dynamic = true; group.add(tm);
  for (const [x, z, ry] of [[-18, -60, 0], [18, -60, 0], [-18, -80, 0], [18, -80, 0], [-12, -45, Math.PI / 2], [12, -45, Math.PI / 2]]) {
    const b = new THREE.Group(); b.position.set(x, Y, z); b.rotation.y = ry;
    b.add(boxM(2.2, 0.1, 0.6, '#b98b5e', 0, 0.5, 0)); b.add(boxM(2.2, 0.5, 0.08, '#b98b5e', 0, 0.8, 0.28)); b.add(boxM(0.1, 0.5, 0.5, '#3a3f48', -0.9, 0.25, 0)); b.add(boxM(0.1, 0.5, 0.5, '#3a3f48', 0.9, 0.25, 0));
    group.add(b);
  }
  group.add(boxM(3, 2.6, 3, '#1f8a8a', -30, Y + 1.3, -100)); group.add(m(new THREE.ConeGeometry(2.6, 1.4, 4), '#ffd166', -30, Y + 3.3, -100)); cBox(-31.5, -28.5, -101.5, -98.5);
  const kio = sign(['KIOSQUE · JOURNAUX'], '#1f8a8a', '#fff4e0', 2.8, 0.5, 512, 90); kio.position.set(-30, Y + 2.2, -98.45); group.add(kio);

  // ── Institut Hélios : façade vitrée, sas, synthétiseur, salle blanche ──
  const L = I4.lab, LW = L.x1 - L.x0, LD = L.z1 - L.z0, lzc = (L.z0 + L.z1) / 2, DW = L.door;
  const labW = '#f1ede4';
  group.add(boxM(LW, 1.0, 0.5, '#3a3f48', 0, Y + 0.5, L.z1));
  group.add(boxM(LW, 3.5, 0.5, labW, 0, Y + L.h - 1.75, L.z1));
  for (const [a, b] of [[L.x0, -DW], [DW, L.x1]]) {
    group.add(glassBox(b - a, L.h - 4.5, 0.14, (a + b) / 2, Y + 1 + (L.h - 4.5) / 2, L.z1));
    for (let x = a; x <= b + 0.01; x += 4) group.add(boxM(0.25, L.h - 3.5, 0.3, '#3a3f48', x, Y + (L.h - 3.5) / 2, L.z1));
    cBox(a, b, L.z1 - 0.3, L.z1 + 0.3);
  }
  for (const sx of [L.x0, L.x1]) { group.add(boxM(0.6, L.h, LD, labW, sx, Y + L.h / 2, lzc)); cBox(sx - 0.3, sx + 0.3, L.z0, L.z1); }
  group.add(boxM(LW, L.h, 0.6, labW, 0, Y + L.h / 2, L.z0)); cBox(L.x0, L.x1, L.z0 - 0.3, L.z0 + 0.3);
  group.add(boxM(LW + 2, 0.9, LD + 2, '#1f8a8a', 0, Y + L.h + 0.45, lzc));
  group.add(boxM(LW + 2.1, 0.3, 0.3, '#ffd166', 0, Y + L.h + 0.1, L.z1 + 1));
  group.add(boxM(LW - 0.4, 0.1, LD - 0.4, '#d9d5cc', 0, Y + L.h - 0.1, lzc));      // plafond
  bld.push({ minX: cx + L.x0, maxX: cx + L.x1, minZ: cz + L.z0, maxZ: cz + L.z1, top: Y + L.h + 6 });
  // hélisurface et antennes sur le toit
  group.add(m(new THREE.CylinderGeometry(7, 7, 0.3, 16), '#3a3f48', 12, Y + L.h + 1.05, lzc));
  group.add(boxM(0.8, 0.04, 6, '#fff4e0', 12, Y + L.h + 1.22, lzc)); group.add(boxM(4, 0.04, 0.8, '#fff4e0', 12, Y + L.h + 1.22, lzc));
  group.add(boxM(0.2, 8, 0.2, '#8d9299', -24, Y + L.h + 4.9, lzc - 10));
  const lsign = sign(['INSTITUT HÉLIOS'], '#10162b', '#ffd166', 16, 2.0, 1024, 130, true);
  lsign.position.set(0, Y + L.h - 1.75, L.z1 + 0.28); group.add(lsign);
  const sas = sign(['SAS DE DÉCONTAMINATION'], '#c8553d', '#fff4e0', 6, 0.7, 1024, 110);
  sas.position.set(0, Y + 3.6, L.z1 + 0.33); group.add(sas);
  group.add(boxM(2 * DW + 1, 0.5, 0.6, '#c8553d', 0, Y + 3.2, L.z1));
  // portes coulissantes du sas
  const labDoors = [];
  for (const s of [-1, 1]) {
    const d = boxM(DW, 3.1, 0.2, '#dfe3e8', s * DW / 2, Y + 1.55, L.z1 - 0.05); d.userData.dynamic = true; group.add(d);
    d.add(boxM(DW * 0.6, 1.6, 0.22, '#8fc6d8', 0, 0.3, 0));
    labDoors.push({ mesh: d, s });
  }
  const labDoorCol = cBox(-DW, DW, L.z1 - 0.3, L.z1 + 0.3);
  // intérieur : sol clair, synthétiseur, consoles, salle blanche vitrée
  group.add(boxM(LW - 1, 0.06, LD - 1, '#e6e8ea', 0, RY + 0.01, lzc));
  const SY = { x: 0, z: -139 };
  group.add(m(new THREE.CylinderGeometry(2.6, 3.0, 1.2, 14), '#5d6470', SY.x, Y + 0.6, SY.z));
  group.add(m(new THREE.CylinderGeometry(1.4, 1.4, 3.6, 12, 1, true), '#8d9299', SY.x, Y + 3.0, SY.z));
  group.add(m(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 14), '#3a3f48', SY.x, Y + 5.0, SY.z));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; group.add(boxM(0.4, 5, 0.4, '#3a3f48', SY.x + Math.cos(a) * 2.4, Y + 2.5, SY.z + Math.sin(a) * 2.4)); }
  const coreMat = new THREE.MeshBasicMaterial({ color: '#2a3a4a', toneMapped: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 12), coreMat); core.position.set(SY.x, Y + 3.0, SY.z); dyn(core);
  cCircle(SY.x, SY.z, 3.1);
  // tapis roulant du sas au synthétiseur, caisse posée dessus une fois entrée
  group.add(boxM(2.2, 0.5, 18, '#33373f', 0, Y + 0.25, -127)); group.add(boxM(2.0, 0.04, 18, '#1b1e23', 0, Y + 0.52, -127));
  cBox(-1.1, 1.1, -136, -118.4);
  const crateIn = new THREE.Group(); crateIn.position.set(0, Y + 0.54, -134); crateIn.visible = false; dyn(crateIn);
  crateIn.add(boxM(1.4, 1.0, 1.0, '#e9e4d8', 0, 0.5, 0)); crateIn.add(boxM(1.42, 0.14, 1.02, '#ffd166', 0, 0.75, 0));
  const csig = sign(['HÉLIOS'], '#e9e4d8', '#c8553d', 1.0, 0.3, 256, 80); csig.position.set(0, 0.45, 0.51); crateIn.add(csig);
  const consoles = [{ k: 'A', x: -8, z: -131, name: 'Séquenceur ARN' }, { k: 'B', x: 8, z: -131, name: 'Refroidissement' }, { k: 'C', x: 0, z: -122.5, name: 'Centrifugeuse' }];
  const consoleLamps = {};
  for (const cs of consoles) {
    group.add(boxM(1.6, 1.0, 0.8, '#3a3f48', cs.x, Y + 0.5, cs.z)); group.add(boxM(1.6, 0.6, 0.1, '#1b1e23', cs.x, Y + 1.35, cs.z + 0.35));
    cBox(cs.x - 0.8, cs.x + 0.8, cs.z - 0.4, cs.z + 0.4);
    const sc2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ color: '#5a2a2a', toneMapped: false })); sc2.position.set(cs.x, Y + 1.35, cs.z + 0.41); dyn(sc2);
    consoleLamps[cs.k] = sc2;
    const s = sign([`${cs.k} · ${cs.name.toUpperCase()}`], '#10162b', '#5ef2c2', 1.6, 0.3, 512, 90); s.position.set(cs.x, Y + 1.8, cs.z + 0.42); group.add(s);
  }
  // salle blanche : Marthe derrière la vitre
  group.add(glassBox(40, L.h - 1, 0.14, 0, Y + (L.h - 1) / 2, -146)); cBox(-20, 20, -146.3, -145.7);
  for (let x = -20; x <= 20; x += 5) group.add(boxM(0.2, L.h - 1, 0.25, '#3a3f48', x, Y + (L.h - 1) / 2, -146));
  for (const sx of [-20.2, 20.2]) { group.add(boxM(0.4, L.h, 12, labW, sx, Y + L.h / 2, -152)); cBox(sx - 0.2, sx + 0.2, -158, -146); }
  group.add(boxM(3, 0.9, 1.2, '#e9e4d8', -6, Y + 0.45, -152)); group.add(boxM(1, 2.2, 0.8, '#dfe3e8', 8, Y + 1.1, -155));
  const lab2 = sign(['SALLE BLANCHE · ACCÈS INTERDIT'], '#ffd166', '#10162b', 5, 0.5, 1024, 100); lab2.position.set(0, Y + 3.2, -145.9); group.add(lab2);
  const ceilGlow = new THREE.Mesh(mergeGeometries([-20, -8, 4, 16].flatMap((x) => [-150, -136, -124].map((z) => new THREE.BoxGeometry(6, 0.06, 1.2).translate(x + 2, Y + L.h - 0.2, z)))), new THREE.MeshBasicMaterial({ color: '#f4fbff', toneMapped: false }));
  dyn(ceilGlow);
  // sas de décontamination : dalle, balises, buses, pupitre
  const PD = I4.pad;
  group.add(m(new THREE.CylinderGeometry(PD.r, PD.r, 0.1, 24), '#3a3f48', PD.x, Y + 0.05, PD.z));
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; const s = boxM(1.2, 0.03, 0.5, k % 2 ? '#ffd166' : '#10162b', PD.x + Math.cos(a) * (PD.r - 0.35), Y + 0.11, PD.z + Math.sin(a) * (PD.r - 0.35)); s.rotation.y = -a; group.add(s); }
  const padMark = sign(['DÉPOSER LA CAISSE ICI'], '#3a3f48', '#ffd166', 5, 0.8, 1024, 150); padMark.rotation.x = -Math.PI / 2; padMark.position.set(PD.x, Y + 0.12, PD.z); group.add(padMark);
  const nozzles = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, x = PD.x + Math.cos(a) * (PD.r + 1.2), z = PD.z + Math.sin(a) * (PD.r + 1.2);
    group.add(boxM(0.5, 3.2, 0.5, '#8d9299', x, Y + 1.6, z)); cCircle(x, z, 0.35);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff8a3a', toneMapped: false })); lamp.position.set(x, Y + 3.4, z); dyn(lamp);
    nozzles.push({ lamp, p: wp(x, Y + 3.0, z) });
  }
  group.add(boxM(0.8, 1.2, 0.6, '#33373f', PD.x + 8, Y + 0.6, PD.z)); cBox(PD.x + 7.6, PD.x + 8.4, PD.z - 0.3, PD.z + 0.3);
  const pcs = sign(['CYCLE DE', 'DÉCONTAMINATION'], '#10162b', '#5ef2c2', 0.8, 0.4, 512, 250, true); pcs.position.set(PD.x + 8, Y + 1.0, PD.z + 0.31); group.add(pcs);

  // ── colline et phare solaire (repère d'approche) ──
  const HL = I4.hill, hy = height4(HL.x, HL.z);
  group.add(m(new THREE.CylinderGeometry(2.2, 3.0, 18, 10), '#f4efe4', HL.x, hy + 9, HL.z));
  for (const y of [5, 11]) group.add(m(new THREE.CylinderGeometry(3.05, 3.1, 1.4, 10), '#ffd166', HL.x, hy + y, HL.z));
  group.add(m(new THREE.CylinderGeometry(2.6, 2.6, 0.6, 10), '#3a3f48', HL.x, hy + 18.3, HL.z));
  cCircle(HL.x, HL.z, 3.1);
  const beam = new THREE.Group(); beam.position.set(HL.x, hy + 19.5, HL.z); dyn(beam);
  const bm = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 12, 1, true).rotateZ(Math.PI / 2).translate(30, 0, 0), new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.add(bm);
  beam.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff1b0', toneMapped: false })));

  // ── lampadaires, voitures abandonnées, barrières de chantier ──
  const lampHead = new THREE.MeshLambertMaterial({ color: '#fff1c4', emissive: '#ffd27a', emissiveIntensity: 0.3 });
  const heads = [];
  const lampPts = [];
  for (let z = 58; z > -28; z -= 16) for (const x of [-11, 11]) lampPts.push([x, z]);
  for (const x of [-40, -20, 20, 40]) for (const z of [-34, -108]) lampPts.push([x, z]);
  for (let x = -240; x <= 240; x += 40) if (Math.abs(x) > 20) lampPts.push([x, -28]);
  for (const x of [-120, -60, 0, 60]) lampPts.push([x, 116]);
  for (const [x, z] of lampPts) {
    group.add(boxM(0.18, 6, 0.18, '#3a3f48', x, Y + 3, z)); cCircle(x, z, 0.2);
    heads.push(new THREE.BoxGeometry(1.1, 0.25, 0.5).translate(x, Y + 6.05, z));
  }
  dyn(new THREE.Mesh(mergeGeometries(heads), lampHead));
  const carCols = ['#ff6b5b', '#1f8a8a', '#e9e4d8', '#ffd166', '#6fb7ff', '#b8a4ff', '#3a3f48'];
  const car = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, Y, z); g.rotation.y = ry;
    const col = carCols[Math.floor(r() * carCols.length)];
    g.add(boxM(1.9, 0.8, 4.2, col, 0, 0.7, 0)); g.add(boxM(1.7, 0.7, 2.2, col, 0, 1.4, 0.2)); g.add(boxM(1.72, 0.45, 2.1, '#2a3a4a', 0, 1.45, 0.2));
    for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) { const w = m(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 8), '#1e1e22', wx, 0.36, wz); w.rotation.z = Math.PI / 2; g.add(w); }
    group.add(g);
    const s = Math.sin(ry), co = Math.cos(ry);
    for (const k of [-1.2, 1.2]) cCircle(x + s * k, z + co * k, 1.05);
  };
  for (const [x, z, ry] of [[-5, 22, 0.2], [5, 48, Math.PI + 0.1], [-4.5, -40, 0.4], [60, 40, Math.PI / 2], [-110, 40, -Math.PI / 2 + 0.2], [150, -60, 0.1], [-75, -90, 0.3], [75, -140, Math.PI], [-150, -200, 0.2], [225, 10, 0], [-225, -110, Math.PI], [120, -20, Math.PI / 2 - 0.3], [-60, -21, -Math.PI / 2], [180, -170, Math.PI / 2]]) car(x, z, ry);
  // tramway arrêté sur le boulevard
  { const tram = new THREE.Group(); tram.position.set(-95, Y, -20); group.add(tram);
    for (const k of [-8.5, 8.5]) { tram.add(boxM(16, 3.2, 2.6, '#ffd166', k, 1.9, 0)); tram.add(boxM(15.4, 1.0, 2.62, '#2a3a4a', k, 2.5, 0)); tram.add(boxM(16, 0.3, 2.62, '#10162b', k, 0.45, 0)); }
    tram.add(boxM(1.2, 0.08, 1.2, '#10162b', -8.5, 4.2, 0)); tram.add(boxM(0.08, 1.4, 1.2, '#10162b', -8.5, 3.6, 0));
    const ts = sign(['TRAM · LIGNE ☀ · SOLEIL'], '#10162b', '#ffd166', 5, 0.5, 768, 90); ts.position.set(-8.5, 3.1, 1.32); tram.add(ts);
    cBox(-112, -78, -21.4, -18.6); }

  // ── collisions automatiques (petit mobilier), fusion des maillages statiques ──
  autoColliders(group, colliders, { ground: (x, z) => heightAt(x, z) });
  mergeStatic(group, flatMat, (o) => o.userData.dynamic);
  group.add(new THREE.Mesh(mergeGeometries(winGeos), winMat));
  group.add(new THREE.Mesh(mergeGeometries(glassGeos), glassBMat));
  group.children.slice(-2).forEach((o) => { o.castShadow = true; o.receiveShadow = true; });

  const points = {
    forkHome: wp(I4.vehicles.fork.x, Y, I4.vehicles.fork.z),
    cranks: I4.cranks.map((p) => wp(p.x, Y + 1.2, p.z - 1.0)),
    bridge: wp(0, Y, CZ),
    booth: wp(BO.x - 1.9, Y + 1.2, BO.z - 0.9),
    gate: wp(0, Y, G.z),
    board: wp(B0.x + 0.6, Y + 2.4, B0.z),
    shop: wp(T.x + 14, Y + 1.1, T.z - 1.2),
    terminal: wp(T.x, Y, T.z),
    pad: wp(PD.x, Y, PD.z),
    padConsole: wp(PD.x + 8, Y + 1.0, PD.z + 0.6),
    labDoor: wp(0, Y + 1.5, L.z1 + 1.5),
    labIn: wp(0, Y, -121),
    synth: wp(SY.x, Y, SY.z),
    consoles: consoles.map((cs) => ({ k: cs.k, name: cs.name, p: wp(cs.x, Y + 1.1, cs.z + 0.9) })),
    marthe: wp(0, Y, -151),
    glass: wp(0, Y + 1.6, -145),
    fountain: wp(FO.x, Y, FO.z),
    tower: wp(TW.x, Y, TW.z),
    ducks: [{ id: 'd9', x: cx + FO.x + 6.4, z: cz + FO.z + 1.8, y: Y + 0.95, hint: 'sur la fontaine de la place du Soleil' }, { id: 'd10', x: cx - 40, z: cz + 11, y: Y + 0.72, hint: 'sur un banc de la gare routière' }],
  };
  const nightLights = [{ p: wp(0, Y, 30), r: 18 }, { p: wp(0, Y, -70), r: 26 }, { p: wp(0, Y, -105), r: 18 }, { p: wp(T.x, Y, T.z), r: 22 }];
  let bridgeK = 0, bridgeT = 0, gateK = 0, gateT = 0, doorK = 0, doorT = 0, decon = 0, synthN = 0, cured = 0, nightF = 0;
  return {
    cx, cz, group, colliders, platforms, points, ladders, puzzle, bld, height: height4, R2: 420 * 420,
    bridgePlat, marthePos: points.marthe,
    lights: () => nightLights.concat(decon > 0 ? [{ p: points.pad, r: 14 }] : []),
    setNight(nf) { nightF = nf; lampHead.emissiveIntensity = 0.3 + nf * 2.2; winMat.emissiveIntensity = 0.05 + nf * 0.95; glassBMat.emissiveIntensity = 0.05 + nf * 0.8; },
    setBridge(k, instant) { bridgeT = k; if (instant) bridgeK = k; },
    setGate(open, instant) { gateT = open ? 1 : 0; if (instant) gateK = gateT; gateCol.disabled = !!open; },
    setLabDoor(open, instant) { doorT = open ? 1 : 0; if (instant) doorK = doorT; labDoorCol.disabled = !!open; },
    setDecon(k) { decon = k; },
    setSynth(done, isCured) { synthN = done; cured = isCured ? 1 : 0; },
    setConsole(k, on) { consoleLamps[k]?.material.color.set(on ? '#5ef2c2' : '#5a2a2a'); },
    setCrateIn(on) { crateIn.visible = !!on; },
    // manivelles : roue qui tourne, voyant vert quand elles sont au bout
    setCranks(a, b) { [a, b].forEach((v, i) => { cranks[i].wheel.rotation.z = -v * 40; cranks[i].lamp.material.color.set(v >= 1 ? '#5ef2c2' : v > 0 ? '#ffd166' : '#ff4d4d'); }); },
    get bridgeDown() { return bridgeK > 0.995; },
    update(t, dt) {
      sockCloth.rotation.y = -0.6 + Math.sin(t * 0.8) * 0.3;
      beacon.visible = Math.sin(t * 3) > 0.3;
      beam.rotation.y = t * 0.6;
      bm.material.opacity = 0.05 + nightF * 0.15;
      sun.rotation.z = t * 0.2;
      water.position.y = Y + 0.8 + Math.sin(t * 1.5) * 0.02;
      // pont : les deux volées descendent ensemble (0 levé, 1 baissé)
      bridgeK += Math.max(-dt * 0.5, Math.min(dt * 0.5, bridgeT - bridgeK));
      const ang = (1 - bridgeK) * 1.3;
      leaves.forEach(({ pv, s }) => { pv.rotation.x = s > 0 ? ang : -ang; });
      bridgeRails.forEach((cc) => { cc.disabled = bridgeK < 0.995; });
      gateK += Math.max(-dt * 0.6, Math.min(dt * 0.6, gateT - gateK));
      gates.forEach(({ pv, s }) => { pv.rotation.y = s * gateK * 1.55; });
      doorK += Math.max(-dt * 0.8, Math.min(dt * 0.8, doorT - doorK));
      labDoors.forEach(({ mesh, s }) => { mesh.position.x = s * (DW / 2 + doorK * DW * 0.95); });
      // sas : balises qui clignotent pendant le cycle
      nozzles.forEach((n, i) => { n.lamp.material.color.set(decon > 0 ? (Math.sin(t * 8 + i) > 0 ? '#5ef2c2' : '#1f8a8a') : cured ? '#5ef2c2' : '#ff8a3a'); });
      coreMat.color.set(cured ? (Math.sin(t * 4) > 0 ? '#5ef2c2' : '#3dff7a') : synthN >= 3 ? '#ffd166' : synthN > 0 ? `hsl(${180 + synthN * 30}, 60%, ${35 + Math.sin(t * 3) * 10}%)` : '#2a3a4a');
    },
    nozzles,
    dispose() { scene.remove(group); },
  };
}
