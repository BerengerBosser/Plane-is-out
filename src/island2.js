// Île 2 — Saint-Escale : île aride avec un vrai aéroport (piste, tour, hangar, terminal, dépôt de carburant)
// Position aléatoire autour de l'île 1. Toutes les coordonnées ci-dessous sont locales (centre de l'île).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, rng, smoothstep } from './noise.js';
import { prep, flatMat, textTexture, setIsland2, mergeStatic, signBoard, autoColliders, heightAt } from './terrain.js';
import { CFG } from './config.js';

export const FLAT = 3.2;
export const I2 = {
  runway: { x0: -125, x1: 125, z: -5, w: 24 },
  terminal: { x: -30, z: 36, w: 36, d: 12, h: 6 },
  tower: { x: 15, z: 38, h: 16 },
  hangar: { x: -100, z: 30, w: 30, d: 26 },
  power: { x: -62, z: 38 },
  tanks: [{ x: 105, z: 32 }, { x: 119, z: 32 }],
  valves: { x: 96, z: 18 },
  shed: { x: 124, z: 14 },
  dock: { x0: 68, x1: 92, z0: 96, z1: 101, top: 0.55 },
  pump: { x: 78, z: 98.4 },
  ramp: { x: 55, z0: 48, z1: 108 },
  park: { x: 80, z: 103.6, yaw: Math.PI / 2 },   // amarrage conseillé (porte côté ponton)
  airliner: { x: 162, z: -34 },
  carts: [{ x: -6, z: 27 }, { x: 1, z: 28.5 }, { x: 8, z: 27.5 }],
  vending: { x: -45.6, z: 40.9 },
  desk: { x: -40, z: 39.5 },
  poster: { x: -24, z: 41.7 },
  flareBox: { x: -34, z: 34.5 },
  harpRack: { x: 93.5, z: 97 },
  bar: { x: -128, z: 88 },
  containers: [{ x: 128, z: -30, r: 0.1, c: '#1f8a8a' }, { x: 128, z: -24, r: 0.1, c: '#ff6b5b' }, { x: 132, z: -27, r: 0.1, c: '#ffd166', y: 1 }, { x: -140, z: 36, r: 1.5, c: '#b8a4ff' }],
};

function rawT(x, z) {
  const ex = x / 235, ez = (z + 10) / 145;
  const d = Math.sqrt(ex * ex + ez * ez);
  let t = 1 - d + (fbm(x * 0.012 + 40, z * 0.012 - 12) - 0.5) * 0.28;
  const bd = Math.hypot(x - 58, z - 132) / 50;
  if (bd < 1.4) t = Math.min(t, (bd - 1) * 0.35);
  return t;
}

export function height2(x, z) {
  const t = rawT(x, z);
  let h;
  if (t < 0) h = Math.max(-16, t > -0.05 ? t * 30 : -1.5 + (t + 0.05) * 120);
  else {
    const land = smoothstep(0.02, 0.15, t);
    h = Math.min(t / 0.06, 1) * 1.3 + Math.max(0, t - 0.06) * 8;
    h += (fbm(x * 0.03, z * 0.03) - 0.5) * 3 * land;
    h += 34 * Math.exp(-((x + 70) ** 2 + (z + 108) ** 2) / (2 * 36 * 36)) * land;
    h += 27 * Math.exp(-((x - 95) ** 2 + (z + 100) ** 2) / (2 * 30 * 30)) * land;
    const fx = 1 - smoothstep(145, 172, Math.abs(x));
    const fz = 1 - smoothstep(0, 22, Math.max(z - 50, -45 - z, 0));
    const w = fx * fz;
    h += (FLAT - h) * w;
  }
  // rampe de mise à l'eau (béton)
  if (x > 41 && x < 69 && z > 46 && z < 114) {
    const k = Math.min(1, (z - 48) / 60);
    const rh = FLAT + (-2.3 - FLAT) * Math.max(0, k);
    const edge = 1 - smoothstep(8, 13, Math.abs(x - 55));
    h += (rh - h) * edge;
  }
  return h;
}

// ── aides de construction ──
function m(geo, col, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(prep(geo, col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function boxM(w, h, d, col, x, y, z) { return m(new THREE.BoxGeometry(w, h, d), col, x, y, z); }
const glassMat = new THREE.MeshLambertMaterial({ color: '#9fd6e8', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
function glassBox(w, h, d, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat); o.position.set(x, y, z); return o; }
function sign(lines, bg, fg, w, h, cw = 512, ch = 128) {
  const t = textTexture(lines, bg, fg, cw, ch);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
}

export function createIsland2(scene, seed) {
  const r = rng(seed);
  const ang = r() * Math.PI * 2;
  const dist = CFG.island2.minDist + r() * (CFG.island2.maxDist - CFG.island2.minDist);
  const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
  setIsland2({ cx, cz, R2: 300 * 300, height: height2 });

  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  scene.add(group);
  const W = (x, z) => new THREE.Vector3(cx + x, 0, cz + z); // local → monde
  const colliders = [], platforms = [];
  const cBox = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; colliders.push(c); return c; };
  const cCircle = (x, z, rr) => { const c = { type: 'circle', x: cx + x, z: cz + z, r: rr }; colliders.push(c); return c; };

  // ── terrain ──
  let tg = new THREE.PlaneGeometry(600, 440, 150, 110);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, 0, -5);
  const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height2(pos.getX(i), pos.getZ(i)));
  tg = tg.toNonIndexed();
  tg.deleteAttribute('uv');
  tg.computeVertexNormals();
  const tp = tg.attributes.position, tn = tg.attributes.normal;
  const cols = new Float32Array(tp.count * 3);
  const c = new THREE.Color();
  const SAND = new THREE.Color('#f1d8a6'), WET = new THREE.Color('#cdb27b'), DEEP = new THREE.Color('#1a5a72');
  const DRY1 = new THREE.Color('#cdb46b'), DRY2 = new THREE.Color('#b79b55'), ROCK = new THREE.Color('#c0704f'), ROCK2 = new THREE.Color('#9d5540');
  const CONC = new THREE.Color('#bdb6a9');
  for (let i = 0; i < tp.count; i += 3) {
    const h = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3;
    const x = (tp.getX(i) + tp.getX(i + 1) + tp.getX(i + 2)) / 3;
    const z = (tp.getZ(i) + tp.getZ(i + 1) + tp.getZ(i + 2)) / 3;
    const ny = tn.getY(i);
    if (x > 45 && x < 65 && z > 46 && z < 110) c.copy(CONC);
    else if (h < -0.15) c.copy(WET).lerp(DEEP, smoothstep(-0.5, -14, h));
    else if (h < 1.5) c.copy(SAND);
    else if (ny < 0.82 || h > 14) c.copy(ROCK).lerp(ROCK2, fbm(x * 0.05, z * 0.05));
    else c.copy(DRY1).lerp(DRY2, fbm(x * 0.04 + 9, z * 0.04));
    c.multiplyScalar(0.96 + r() * 0.08);
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = c.r; cols[(i + k) * 3 + 1] = c.g; cols[(i + k) * 3 + 2] = c.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, flatMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // ── piste, taxiway, tarmac ──
  const Y = FLAT + 0.03;
  const RW = I2.runway;
  const asphalt = '#3b3f47';
  group.add(boxM(RW.x1 - RW.x0, 0.06, RW.w, asphalt, 0, Y, RW.z));
  group.add(boxM(12, 0.06, 36, asphalt, 40, Y, 16));
  group.add(boxM(130, 0.06, 24, '#4a4e57', 5, Y, 34));
  const white = '#f4f1ea';
  for (let x = RW.x0 + 22; x < RW.x1 - 22; x += 12) group.add(boxM(6, 0.02, 0.5, white, x, Y + 0.04, RW.z));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) group.add(boxM(8, 0.02, 1.1, white, sx * (RW.x1 - 6), Y + 0.04, RW.z - 7.5 + k * 3));
    const num = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshLambertMaterial({ map: textTexture([sx < 0 ? '09' : '27'], asphalt, white, 256, 140), transparent: true }));
    num.rotation.x = -Math.PI / 2;
    num.rotation.z = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
    num.position.set(sx * (RW.x1 - 18), Y + 0.05, RW.z);
    group.add(num);
  }
  group.add(boxM(RW.x1 - RW.x0, 0.02, 0.3, '#ffd166', 0, Y + 0.04, RW.z - RW.w / 2 + 1));
  group.add(boxM(RW.x1 - RW.x0, 0.02, 0.3, '#ffd166', 0, Y + 0.04, RW.z + RW.w / 2 - 1));
  // balisage (s'allume avec le courant)
  const lampOff = new THREE.MeshLambertMaterial({ color: '#555' });
  const lampOn = new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false });
  const lampGreen = new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false });
  const runwayLamps = [];
  for (let x = RW.x0; x <= RW.x1; x += 10) {
    for (const sz of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 6), lampOff);
      l.position.set(x, Y + 0.18, RW.z + sz * (RW.w / 2 + 0.6));
      l.userData.on = (x === RW.x0 || x === RW.x1) ? lampGreen : lampOn;
      l.userData.dynamic = true;
      group.add(l);
      runwayLamps.push(l);
    }
  }

  // ── terminal (on peut y entrer) ──
  const T = I2.terminal, TH = T.h;
  const tw = (w, d, x, z, col = '#f3ead8') => group.add(boxM(w, TH, d, col, x, FLAT + TH / 2, z));
  tw(T.w, 0.4, T.x, T.z + T.d / 2);                                 // fond
  tw(0.4, T.d, T.x - T.w / 2, T.z); tw(0.4, T.d, T.x + T.w / 2, T.z);  // côtés
  // façade vitrée avec deux portes
  const fz = T.z - T.d / 2;
  for (const [a, b] of [[-18, -11], [-8, 8], [11, 18]]) {
    group.add(boxM(b - a, 1.0, 0.4, '#f3ead8', T.x + (a + b) / 2, FLAT + 0.5, fz));
    group.add(glassBox(b - a, TH - 1.6, 0.1, T.x + (a + b) / 2, FLAT + 1 + (TH - 1.6) / 2, fz));
    for (let x = a; x <= b; x += 3.5) group.add(boxM(0.25, TH, 0.45, '#ff6b5b', T.x + x, FLAT + TH / 2, fz));
  }
  group.add(boxM(T.w + 1, 0.6, T.d + 1, '#ff6b5b', T.x, FLAT + TH + 0.3, T.z));
  group.add(boxM(T.w + 3, 0.2, 4, '#f3ead8', T.x, FLAT + TH - 0.6, fz - 2));
  const tsign = sign(['SAINT-ESCALE'], '#10162b', '#ffd166', 16, 2.2, 1024, 140);
  tsign.position.set(T.x, FLAT + TH + 1.8, fz);
  tsign.rotation.y = Math.PI;
  group.add(tsign);
  group.add(boxM(16.5, 2.5, 0.2, '#10162b', T.x, FLAT + TH + 1.8, fz + 0.12));
  cBox(T.x - T.w / 2, T.x + T.w / 2, T.z + T.d / 2 - 0.2, T.z + T.d / 2 + 0.2);
  cBox(T.x - T.w / 2 - 0.2, T.x - T.w / 2 + 0.2, T.z - T.d / 2, T.z + T.d / 2);
  cBox(T.x + T.w / 2 - 0.2, T.x + T.w / 2 + 0.2, T.z - T.d / 2, T.z + T.d / 2);
  for (const [a, b] of [[-18, -11], [-8, 8], [11, 18]]) cBox(T.x + a, T.x + b, fz - 0.2, fz + 0.2);
  // intérieur : banquettes, tapis à bagages, bureau des objets trouvés, distributeur, affiche
  for (let i = 0; i < 4; i++) group.add(boxM(4, 0.5, 1, '#1f8a8a', T.x - 10 + i * 5.5, FLAT + 0.25, T.z + 1));
  group.add(boxM(9, 0.8, 2.2, '#33373f', T.x + 12, FLAT + 0.4, T.z + 3));
  cBox(T.x + 7.5, T.x + 16.5, T.z + 1.9, T.z + 4.1);                                   // tapis à bagages
  for (let i = 0; i < 4; i++) cBox(T.x - 12 + i * 5.5, T.x - 8 + i * 5.5, T.z + 0.5, T.z + 1.5);   // banquettes
  group.add(boxM(8.4, 0.08, 1.8, '#5d6470', T.x + 12, FLAT + 0.84, T.z + 3));
  group.add(boxM(1.2, 0.5, 0.8, '#b98b5e', T.x + 10, FLAT + 1.1, T.z + 3));
  group.add(boxM(0.8, 0.6, 0.6, '#ff6b5b', T.x + 13, FLAT + 1.1, T.z + 3.2));
  const desk = I2.desk;
  group.add(boxM(4, 1.1, 1.2, '#b98b5e', desk.x, FLAT + 0.55, desk.z));
  const lf = sign(['OBJETS TROUVÉS'], '#ffd166', '#10162b', 3, 0.5, 512, 90);
  lf.position.set(desk.x, FLAT + 2.2, T.z + T.d / 2 - 0.25);
  lf.rotation.y = Math.PI;
  group.add(lf);
  cBox(desk.x - 2, desk.x + 2, desk.z - 0.6, desk.z + 0.6);
  const v = I2.vending;
  group.add(boxM(1.3, 2.2, 0.9, '#ff6b5b', v.x, FLAT + 1.1, v.z));
  group.add(glassBox(0.9, 1.3, 0.05, v.x - 0.1, FLAT + 1.35, v.z - 0.47));
  cBox(v.x - 0.65, v.x + 0.65, v.z - 0.45, v.z + 0.45);
  const poster = sign(['CONSIGNES ÉLECTRIQUES', '☀ Éclairage : fusible ROUGE', '⚓ Ponton : fusible BLEU', '✈ Balisage : fusible JAUNE'], '#fff4e0', '#10162b', 2.6, 2.0, 512, 400);
  poster.position.set(I2.poster.x, FLAT + 2.0, I2.poster.z);
  poster.rotation.y = Math.PI;
  group.add(poster);
  // lumière du terminal (avec le courant)
  const termLight = new THREE.PointLight('#ffe2a8', 0, 34, 1.3);
  termLight.position.set(T.x, FLAT + TH - 1, T.z);
  group.add(termLight);

  // ── tour de contrôle (ascenseur, cabine vitrée praticable) ──
  const To = I2.tower;
  group.add(m(new THREE.CylinderGeometry(2.2, 2.6, To.h, 10), '#f3ead8', To.x, FLAT + To.h / 2, To.z));
  group.add(m(new THREE.CylinderGeometry(2.25, 2.25, 1.2, 10), '#ff6b5b', To.x, FLAT + To.h - 3, To.z));
  const lift = boxM(1.6, 2.4, 0.3, '#33373f', To.x, FLAT + 1.2, To.z - 2.45);
  group.add(lift);
  const liftLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false }));
  liftLamp.position.set(To.x + 1.1, FLAT + 2.2, To.z - 2.55);
  group.add(liftLamp);
  cCircle(To.x, To.z, 2.7).maxY = FLAT + To.h - 2;
  const cabY = FLAT + To.h;
  group.add(boxM(9, 0.4, 9, '#33373f', To.x, cabY - 0.2, To.z));
  group.add(boxM(9.6, 0.5, 9.6, '#10162b', To.x, cabY + 3.3, To.z));
  group.add(glassBox(8.6, 3.0, 8.6, To.x, cabY + 1.55, To.z));
  for (const [dx, dz] of [[-4.3, -4.3], [4.3, -4.3], [-4.3, 4.3], [4.3, 4.3]]) group.add(boxM(0.3, 3.1, 0.3, '#10162b', To.x + dx, cabY + 1.55, To.z + dz));
  group.add(boxM(8.4, 1.0, 0.4, '#f3ead8', To.x, cabY + 0.5, To.z + 4.05));
  group.add(boxM(4, 1.0, 1.2, '#33373f', To.x, cabY + 0.5, To.z - 3.2));   // console radio
  const radioScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), new THREE.MeshBasicMaterial({ color: '#10162b', toneMapped: false }));
  radioScreen.position.set(To.x, cabY + 1.2, To.z - 3.0);
  radioScreen.rotation.x = -0.6;
  group.add(radioScreen);
  platforms.push({ minX: cx + To.x - 4.1, maxX: cx + To.x + 4.1, minZ: cz + To.z - 4.1, maxZ: cz + To.z + 4.1, top: cabY, contain: true });
  colliders.push({ type: 'box', minX: cx + To.x - 2, maxX: cx + To.x + 2, minZ: cz + To.z - 3.8, maxZ: cz + To.z - 2.6, minY: cabY - 1 });
  // radar tournant
  const radar = new THREE.Group();
  radar.position.set(To.x, cabY + 3.6, To.z);
  radar.userData.dynamic = true;
  radar.add(m(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 6), '#8d9299', 0, 0.6, 0));
  const dish = boxM(3.2, 0.9, 0.2, '#f3ead8', 0, 1.3, 0.2);
  radar.add(dish);
  group.add(radar);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false, fog: false }));
  beacon.position.set(To.x, cabY + 5.2, To.z);
  group.add(beacon);
  const towerLight = new THREE.PointLight('#ffe2a8', 0, 26, 1.3);
  towerLight.position.set(To.x, FLAT + 4, To.z - 5);
  group.add(towerLight);

  // ── hangar voûté (porte à code, moteur électrique) ──
  const H = I2.hangar;
  const arch = new THREE.CylinderGeometry(H.w / 2, H.w / 2, H.d, 12, 1, true, -Math.PI / 2, Math.PI);
  arch.rotateX(-Math.PI / 2);   // voûte au-dessus du sol (et non dessous)
  const archMesh = new THREE.Mesh(prep(arch, '#8fa3b0'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  archMesh.position.set(H.x, FLAT, H.z);
  archMesh.scale.y = 0.62;
  archMesh.castShadow = archMesh.receiveShadow = true;
  group.add(archMesh);
  const back = new THREE.Mesh(prep(new THREE.CircleGeometry(H.w / 2, 12, 0, Math.PI), '#7a8d99'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  back.position.set(H.x, FLAT, H.z + H.d / 2);
  back.scale.y = 0.62;
  group.add(back);
  const hDoors = [];
  for (const sx of [-1, 1]) {
    const d = boxM(H.w / 2, 8.8, 0.4, '#ff6b5b', H.x + sx * H.w / 4, FLAT + 4.4, H.z - H.d / 2);
    d.userData.closedX = H.x + sx * H.w / 4;
    d.userData.sx = sx;
    d.userData.dynamic = true;
    group.add(d);
    hDoors.push(d);
  }
  const hsign = sign(['HANGAR 2'], '#10162b', '#fff4e0', 6, 1.2, 512, 110);
  hsign.position.set(H.x, FLAT + 7.4, H.z - H.d / 2 - 0.25);
  hsign.rotation.y = Math.PI;
  group.add(hsign);
  const keypadBox = boxM(0.5, 0.7, 0.2, '#33373f', H.x + H.w / 2 + 1.2, FLAT + 1.5, H.z - H.d / 2 - 0.1);
  group.add(keypadBox);
  // verrous manuels : deux leviers aux deux extrémités de la façade (à tirer presque ensemble)
  const levers = {};
  for (const [k, lx] of [['L', H.x - H.w / 2 - 1.6], ['R', H.x + H.w / 2 + 2.6]]) {
    const lg = new THREE.Group();
    lg.position.set(lx, FLAT, H.z - H.d / 2 - 0.5);
    lg.add(boxM(0.7, 1.3, 0.35, '#ffd166', 0, 0.65, 0));
    lg.add(boxM(0.72, 0.12, 0.37, '#10162b', 0, 1.0, 0));
    const handle = new THREE.Group();
    handle.position.set(0, 1.15, -0.2);
    handle.add(boxM(0.08, 0.7, 0.08, '#8d9299', 0, 0.35, 0));
    handle.add(m(new THREE.SphereGeometry(0.11, 8, 6), '#ff6b5b', 0, 0.72, 0));
    handle.rotation.x = -0.5;
    lg.add(handle);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false }));
    lamp.position.set(0.22, 1.2, -0.18);
    lg.add(lamp);
    lg.userData.dynamic = true;
    group.add(lg);
    cCircle(lx, H.z - H.d / 2 - 0.5, 0.45);
    levers[k] = { group: lg, handle, lamp, down: false };
  }
  cBox(H.x - H.w / 2 - 0.3, H.x - H.w / 2 + 0.3, H.z - H.d / 2, H.z + H.d / 2);
  cBox(H.x + H.w / 2 - 0.3, H.x + H.w / 2 + 0.3, H.z - H.d / 2, H.z + H.d / 2);
  cBox(H.x - H.w / 2, H.x + H.w / 2, H.z + H.d / 2 - 0.3, H.z + H.d / 2 + 0.3);
  const hangarDoorCol = cBox(H.x - H.w / 2, H.x + H.w / 2, H.z - H.d / 2 - 0.3, H.z - H.d / 2 + 0.3);
  // intérieur : établi, carcasse de biplan
  group.add(boxM(5, 1, 1.4, '#b98b5e', H.x - 10, FLAT + 0.5, H.z + 9));
  cBox(H.x - 12.5, H.x - 7.5, H.z + 8.3, H.z + 9.7);
  const bip = new THREE.Group();
  bip.add(m(new THREE.CylinderGeometry(0.5, 0.3, 6, 6).rotateX(Math.PI / 2), '#ffd166'));
  bip.add(boxM(7, 0.1, 1.2, '#ffd166', 0, 0.6, -1));
  bip.add(boxM(7, 0.1, 1.2, '#ffd166', 0, 1.8, -1));
  bip.position.set(H.x + 7, FLAT + 0.9, H.z + 6);
  bip.rotation.set(0.05, 0.4, 0.12);
  group.add(bip);
  cCircle(H.x + 7, H.z + 6, 3);

  // ── centrale électrique + tableau à fusibles ──
  const P = I2.power;
  group.add(boxM(7, 4, 5, '#f3ead8', P.x, FLAT + 2, P.z));
  group.add(boxM(7.4, 0.4, 5.4, '#1f8a8a', P.x, FLAT + 4.2, P.z));
  const warn = sign(['⚡ DANGER ⚡'], '#ffd166', '#10162b', 2.2, 0.6, 512, 130);
  warn.position.set(P.x - 2, FLAT + 3, P.z - 2.52);
  warn.rotation.y = Math.PI;
  group.add(warn);
  const panel = boxM(1.8, 1.2, 0.2, '#33373f', P.x + 1.2, FLAT + 1.6, P.z - 2.6);
  group.add(panel);
  const fuseSlots = [];
  const slotIcons = ['☀', '⚓', '✈'];
  for (let i = 0; i < 3; i++) {
    const s = boxM(0.35, 0.6, 0.1, '#1a1d22', P.x + 0.6 + i * 0.6, FLAT + 1.55, P.z - 2.72);
    s.userData.dynamic = true;
    group.add(s);
    const ic = sign([slotIcons[i]], '#33373f', '#fff4e0', 0.34, 0.3, 128, 110);
    ic.position.set(P.x + 0.6 + i * 0.6, FLAT + 2.05, P.z - 2.72);
    ic.rotation.y = Math.PI;
    group.add(ic);
    fuseSlots.push(s);
  }
  cBox(P.x - 3.5, P.x + 3.5, P.z - 2.5, P.z + 2.5);
  const gen = new THREE.Group();
  gen.position.set(P.x - 5.5, FLAT, P.z);
  gen.add(boxM(2.4, 1.6, 1.6, '#ffd166', 0, 0.8, 0));
  gen.add(m(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 6), '#33373f', 0.6, 2.1, 0));
  group.add(gen);
  cBox(P.x - 6.7, P.x - 4.3, P.z - 0.8, P.z + 0.8);

  // ── dépôt de carburant, vannes, cabane avec le schéma ──
  for (const t of I2.tanks) {
    group.add(m(new THREE.CylinderGeometry(5, 5, 7, 14), '#e9e4d8', t.x, FLAT + 3.5, t.z));
    group.add(m(new THREE.CylinderGeometry(5.05, 5.05, 1, 14), '#ff6b5b', t.x, FLAT + 5.5, t.z));
    group.add(m(new THREE.CylinderGeometry(4.6, 5, 0.8, 14), '#d6d0c2', t.x, FLAT + 7.4, t.z));
    cCircle(t.x, t.z, 5.2);
  }
  const Vv = I2.valves;
  group.add(m(new THREE.CylinderGeometry(0.22, 0.22, 7, 8).rotateZ(Math.PI / 2), '#8d9299', Vv.x + 1.8, FLAT + 1.1, Vv.z));
  for (const px of [Vv.x - 1.2, Vv.x + 4.8]) group.add(boxM(0.2, 1.2, 0.2, '#33373f', px, FLAT + 0.6, Vv.z));
  const valves = {};
  ['A', 'B', 'C', 'D'].forEach((k, i) => {
    const vg = new THREE.Group();
    vg.position.set(Vv.x + i * 1.2, FLAT + 1.1, Vv.z - 0.35);
    vg.userData.dynamic = true;
    vg.add(m(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8).rotateX(Math.PI / 2), '#8d9299', 0, 0, 0.1));
    const wheel = new THREE.Group();
    wheel.position.z = -0.12;
    const ring = new THREE.Mesh(prep(new THREE.TorusGeometry(0.3, 0.05, 5, 12), k === 'A' ? '#ff6b5b' : '#ffd166'), flatMat);
    wheel.add(ring);
    wheel.add(boxM(0.56, 0.05, 0.05, '#33373f', 0, 0, 0));
    wheel.add(boxM(0.05, 0.56, 0.05, '#33373f', 0, 0, 0));
    vg.add(wheel);
    const lab = sign([k], '#10162b', '#fff4e0', 0.3, 0.3, 128, 128);
    lab.position.set(0, 0.55, -0.12);
    lab.rotation.y = Math.PI;
    vg.add(lab);
    group.add(vg);
    valves[k] = { group: vg, wheel, open: false };
  });
  const S = I2.shed;
  group.add(boxM(5, 3, 4, '#b98b5e', S.x, FLAT + 1.5, S.z));
  group.add(boxM(5.6, 0.25, 4.6, '#6d4b37', S.x, FLAT + 3.1, S.z));
  cBox(S.x - 2.5, S.x + 2.5, S.z - 2, S.z + 2);
  const schema = sign(['SCHÉMA DU CIRCUIT', 'Ligne PONTON : ouvrir B et D', 'A = vidange · C = retour cuve', 'Ne jamais ouvrir A !'], '#fff4e0', '#10162b', 2.4, 1.8, 512, 400);
  schema.position.set(S.x, FLAT + 1.8, S.z - 2.03);
  schema.rotation.y = Math.PI;
  group.add(schema);
  // canalisation jusqu'au ponton
  const pipePts = [[Vv.x - 1.2, Vv.z], [72, Vv.z], [72, 60], [70, 90], [I2.pump.x, I2.pump.z]];
  for (let i = 0; i < pipePts.length - 1; i++) {
    const [ax, az] = pipePts[i], [bx, bz] = pipePts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const pm = m(new THREE.CylinderGeometry(0.18, 0.18, len, 6).rotateZ(Math.PI / 2), '#8d9299');
    pm.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    pm.rotation.y = -Math.atan2(bz - az, bx - ax);
    pm.userData.follow = true;
    group.add(pm);
    const hmid = Math.max(height2((ax + bx) / 2, (az + bz) / 2), 0.4);
    pm.position.y = hmid + 0.25;
  }

  // ── ponton, pompe, panneau de bienvenue ──
  const D = I2.dock;
  const dockG = new THREE.Group();
  for (let x = D.x0; x < D.x1; x += 0.5) dockG.add(boxM(0.46, 0.12, D.z1 - D.z0, '#9b7452', x + 0.25, D.top - 0.06, (D.z0 + D.z1) / 2));
  for (let x = D.x0; x <= D.x1; x += 4) for (const z of [D.z0, D.z1]) dockG.add(m(new THREE.CylinderGeometry(0.15, 0.17, 3, 6), '#6f5038', x, D.top - 1.5, z));
  group.add(dockG);
  platforms.push({ minX: cx + D.x0, maxX: cx + D.x1, minZ: cz + D.z0, maxZ: cz + D.z1, top: D.top });
  const pump = new THREE.Group();
  pump.position.set(I2.pump.x, D.top, I2.pump.z);
  pump.add(boxM(0.9, 1.6, 0.7, '#ff6b5b', 0, 0.8, 0));
  pump.add(boxM(0.6, 0.35, 0.05, '#10162b', 0, 1.25, 0.37));
  const pumpLamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false }));
  pumpLamp.position.set(0.3, 1.5, 0.37);
  pump.add(pumpLamp);
  group.add(pump);
  const welcome = signBoard(['BIENVENUE À SAINT-ESCALE', 'Aéroport · Escale technique'], { bg: '#1f8a8a', fg: '#fff4e0', w: 6, h: 1.6, cw: 1024, ch: 280, y: 2.8, wood: '#6f5038' });
  welcome.position.set(D.x0 - 3, height2(D.x0 - 3, D.z0 - 3), D.z0 - 3);
  welcome.rotation.y = Math.PI * 0.85;
  group.add(welcome);
  const dockLight = new THREE.PointLight('#ffe2a8', 0, 22, 1.3);
  dockLight.position.set(80, 4, 98);
  group.add(dockLight);

  // ── décor : palmiers, cactus, manche à air, épave d'avion de ligne, chariots, voiturette, flamants ──
  const palmGeo = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.18, 0.28, 5, 6).translate(0, 2.5, 0), '#9a7a55'),
    ...[0, 1, 2, 3, 4, 5].map((k) => prep(new THREE.BoxGeometry(2.6, 0.06, 0.6).translate(1.3, 5, 0).rotateY((k / 6) * Math.PI * 2), k % 2 ? '#4f9a57' : '#5fae5e')),
  ]);
  const cactusGeo = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.28, 0.32, 2.6, 7).translate(0, 1.3, 0), '#5f9a5a'),
    prep(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6).translate(0.45, 1.5, 0), '#5f9a5a'),
    prep(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6).translate(-0.45, 1.9, 0), '#5f9a5a'),
  ]);
  const palms = [], cacti = [];
  for (let i = 0; i < 1800 && (palms.length < 60 || cacti.length < 70); i++) {
    const x = (r() - 0.5) * 460, z = (r() - 0.5) * 290 - 5;
    const h = height2(x, z);
    const inAirport = Math.abs(x) < 165 && z > -52 && z < 58;
    const onRamp = x > 38 && x < 72 && z > 40;
    if (h < 0.4 || inAirport || onRamp) continue;
    if (h < 3.5 && palms.length < 60) palms.push({ x, z, h, s: 0.8 + r() * 0.6, ry: r() * 6.3 });
    else if (h > 2 && h < 20 && cacti.length < 70) cacti.push({ x, z, h, s: 0.7 + r() * 0.8, ry: r() * 6.3 });
  }
  // palmiers autour du terminal
  for (let i = 0; i < 8; i++) palms.push({ x: T.x - 20 + i * 5.5, z: fz - 6, h: FLAT, s: 0.9 + r() * 0.3, ry: r() * 6.3 });
  const inst = (geo, list) => {
    const im = new THREE.InstancedMesh(geo, flatMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach((o, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry); s.setScalar(o.s); p.set(o.x, o.h - 0.1, o.z); m4.compose(p, q, s); im.setMatrixAt(i, m4); cCircle(o.x, o.z, 0.4 * o.s); });
    im.castShadow = im.receiveShadow = true;
    group.add(im);
  };
  inst(palmGeo, palms);
  inst(cactusGeo, cacti);
  // manche à air
  const sock = new THREE.Group();
  sock.position.set(-138, FLAT, 14);
  sock.add(m(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), '#e9e4d8', 0, 3, 0));
  const sockCloth = new THREE.Group();
  sockCloth.position.y = 5.8;
  sockCloth.userData.dynamic = true;
  for (let k = 0; k < 4; k++) sockCloth.add(m(new THREE.CylinderGeometry(0.45 - k * 0.07, 0.38 - k * 0.07, 0.6, 8, 1, true).rotateZ(Math.PI / 2), k % 2 ? '#ffffff' : '#ff6b5b', 0.35 + k * 0.6, 0, 0));
  sock.add(sockCloth);
  group.add(sock);
  // épave d'avion de ligne (fusible jaune dans le cockpit)
  const A = I2.airliner;
  const air = new THREE.Group();
  air.position.set(A.x, height2(A.x, A.z) - 0.8, A.z);
  air.rotation.set(0.04, 0.5, 0.18);
  air.add(m(new THREE.CylinderGeometry(2.6, 2.6, 16, 10, 1, true).rotateZ(Math.PI / 2), '#e9e4d8', -8, 2.5, 0));
  air.add(m(new THREE.CylinderGeometry(2.6, 1.2, 9, 10, 1, true).rotateZ(Math.PI / 2), '#e9e4d8', 6, 2.3, 0.6));
  air.add(m(new THREE.CylinderGeometry(2.62, 2.62, 16, 10, 1, true).rotateZ(Math.PI / 2).scale(1, 0.12, 1), '#1f8a8a', -8, 2.1, 0));
  air.add(boxM(4, 0.35, 16, '#d6d0c2', -9, 1.3, 6));
  air.add(boxM(3, 4, 0.3, '#ff6b5b', 9.5, 4.5, 0.6));
  air.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; } });
  group.add(air);
  cCircle(A.x - 7, A.z - 3.5, 3); cCircle(A.x + 1, A.z + 0.5, 2.6); cCircle(A.x - 14, A.z - 7, 2.8);
  // chariots à bagages et valises
  const bagCols = ['#ff6b5b', '#1f8a8a', '#ffd166', '#b8a4ff', '#5ef2c2'];
  I2.carts.forEach((ct, i) => {
    const g = new THREE.Group();
    g.position.set(ct.x, FLAT, ct.z);
    g.rotation.y = 0.2 * i;
    g.add(boxM(3, 0.15, 1.6, '#8d9299', 0, 0.6, 0));
    for (const [wx, wz] of [[-1.2, -0.7], [1.2, -0.7], [-1.2, 0.7], [1.2, 0.7]]) g.add(m(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8).rotateX(Math.PI / 2), '#33373f', wx, 0.22, wz));
    for (let k = 0; k < 4; k++) g.add(boxM(0.8, 0.55, 0.5, bagCols[(k + i) % 5], -0.9 + (k % 2) * 1.6, 0.95 + Math.floor(k / 2) * 0.55, (k % 2 ? 0.3 : -0.3)));
    group.add(g);
    cBox(ct.x - 1.6, ct.x + 1.6, ct.z - 0.9, ct.z + 0.9);
  });
  const golf = new THREE.Group();
  golf.position.set(-50, FLAT, 28);
  golf.rotation.y = 0.8;
  golf.add(boxM(1.4, 0.6, 2.4, '#fff4e0', 0, 0.6, 0));
  golf.add(boxM(1.4, 0.08, 1.6, '#1f8a8a', 0, 2.1, 0.2));
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.9, 0.9]) golf.add(m(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 8).rotateZ(Math.PI / 2), '#33373f', sx, 0.25, sz));
  for (const sx of [-0.6, 0.6]) golf.add(boxM(0.06, 1.4, 0.06, '#33373f', sx, 1.4, 0.9));
  group.add(golf);
  cCircle(-50, 28, 1.3);
  // flamants roses dans la baie
  const flamingos = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const pink = '#ff8fab';
    g.add(boxM(0.04, 1.0, 0.04, '#e0707f', 0, 0.5, 0));
    g.add(m(new THREE.SphereGeometry(0.28, 6, 4).scale(1, 0.75, 1.5), pink, 0, 1.15, 0));
    const neck = m(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5), pink, 0, 1.55, -0.25);
    neck.rotation.x = 0.3;
    g.add(neck);
    g.add(m(new THREE.SphereGeometry(0.1, 6, 4), pink, 0, 1.9, -0.36));
    g.add(boxM(0.06, 0.06, 0.18, '#33373f', 0, 1.86, -0.5));
    const a = r() * Math.PI * 2, d = 14 + r() * 18;
    const fx = 58 + Math.cos(a) * d, fzz = 118 + Math.sin(a) * d * 0.6;
    g.position.set(fx, Math.max(height2(fx, fzz), -0.8), fzz);
    g.rotation.y = r() * 6;
    g.userData.ph = r() * 6;
    g.userData.dynamic = true;
    group.add(g);
    flamingos.push(g);
  }
  // parasols et transats
  for (let i = 0; i < 3; i++) {
    const x = -150 + i * 7, z = 96 + i * 2;
    const h = height2(x, z);
    if (h < 0.2) continue;
    group.add(m(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), '#fff4e0', x, h + 1.3, z));
    group.add(m(new THREE.ConeGeometry(1.6, 0.6, 8), i % 2 ? '#ff6b5b' : '#1f8a8a', x, h + 2.5, z));
    const chair = boxM(0.7, 0.1, 1.8, '#fff4e0', x + 1.2, h + 0.35, z + 0.5);
    chair.rotation.x = -0.2;
    group.add(chair);
  }

  // ── décor supplémentaire : conteneurs, clôture, cônes, camion-citerne, jeep, bar de plage ──
  for (const ct of I2.containers) {
    const y0 = FLAT + (ct.y ? 2.6 : 0);
    const c = boxM(6, 2.6, 2.4, ct.c, ct.x, y0 + 1.3, ct.z);
    c.rotation.y = ct.r;
    group.add(c);
    for (let k = -2; k <= 2; k++) { const rib = boxM(0.12, 2.5, 2.46, '#10162b', ct.x + k * 1.1 * Math.cos(ct.r), y0 + 1.3, ct.z - k * 1.1 * Math.sin(ct.r)); rib.rotation.y = ct.r; group.add(rib); }
    if (!ct.y) cBox(ct.x - 3.1, ct.x + 3.1, ct.z - 1.3, ct.z + 1.3);
  }
  for (let x = RW.x0 - 10; x <= RW.x1 + 10; x += 5) {
    for (const zz of [-44, 54]) {
      if (zz === 54 && x > 30 && x < 80) continue;
      group.add(boxM(0.1, 1.6, 0.1, '#8d9299', x, height2(x, zz) + 0.8, zz));
      group.add(boxM(5, 0.05, 0.05, '#8d9299', x + 2.5, height2(x, zz) + 1.5, zz));
      group.add(boxM(5, 0.05, 0.05, '#8d9299', x + 2.5, height2(x, zz) + 0.8, zz));
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = -20 + i * 5, z = 22.5 + (i % 2) * 0.5;
    group.add(m(new THREE.ConeGeometry(0.25, 0.7, 8), '#ff8a3d', x, FLAT + 0.35, z));
    group.add(m(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 8), '#fff4e0', x, FLAT + 0.42, z));
  }
  const truck = new THREE.Group();
  truck.position.set(88, FLAT, 30);
  truck.rotation.y = -0.3;
  truck.add(boxM(2.4, 2.0, 2.4, '#ff6b5b', 0, 1.4, -3.2));
  truck.add(boxM(1.8, 0.8, 0.05, '#9fd6e8', 0, 1.9, -4.42));
  truck.add(m(new THREE.CylinderGeometry(1.2, 1.2, 5, 12).rotateX(Math.PI / 2), '#e9e4d8', 0, 1.6, 0.6));
  truck.add(boxM(2.2, 0.3, 7.6, '#33373f', 0, 0.5, -0.6));
  for (const z of [-3.3, 0, 2.2]) for (const sx of [-1.1, 1.1]) truck.add(m(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10).rotateZ(Math.PI / 2), '#1a1d22', sx, 0.45, z));
  group.add(truck);
  cCircle(88, 30, 2.4); cCircle(88 + Math.sin(-0.3) * -3.2, 30 - 3.2 * Math.cos(-0.3), 1.6);
  const jeep = new THREE.Group();
  jeep.position.set(-60, FLAT, 16);
  jeep.rotation.y = 1.2;
  jeep.add(boxM(1.8, 0.8, 3.4, '#5f7a4a', 0, 0.9, 0));
  jeep.add(boxM(1.7, 0.5, 1.4, '#5f7a4a', 0, 1.5, 0.3));
  jeep.add(boxM(1.6, 0.05, 0.6, '#9fd6e8', 0, 1.6, -0.6));
  for (const z of [-1.1, 1.1]) for (const sx of [-0.95, 0.95]) jeep.add(m(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10).rotateZ(Math.PI / 2), '#1a1d22', sx, 0.4, z));
  group.add(jeep);
  cCircle(-60, 16, 1.9);
  // bar de plage en ruine
  const B = I2.bar, bh = height2(B.x, B.z);
  if (bh > 0.2) {
    group.add(boxM(6, 1.1, 1.2, '#b98b5e', B.x, bh + 0.55, B.z));
    for (const [dx, dz] of [[-3, -2], [3, -2], [-3, 1.5], [3, 1.5]]) group.add(boxM(0.2, 3, 0.2, '#8a6a4a', B.x + dx, bh + 1.5, B.z + dz));
    const roof = boxM(7, 0.3, 4.5, '#e0a458', B.x, bh + 3.1, B.z - 0.2);
    roof.rotation.z = 0.08;
    group.add(roof);
    const bs = sign(['BAR DE L\'ESCALE'], '#1f8a8a', '#fff4e0', 3.2, 0.7, 512, 110);
    bs.position.set(B.x, bh + 2.5, B.z - 2.3);
    bs.rotation.y = Math.PI;
    group.add(bs);
    for (let i = 0; i < 3; i++) group.add(m(new THREE.CylinderGeometry(0.25, 0.2, 0.8, 8), '#8a6a4a', B.x - 2 + i * 2, bh + 0.4, B.z - 1.8));
    cBox(B.x - 3, B.x + 3, B.z - 0.6, B.z + 0.6);
  }
  // caisse de fusées (terminal) et râtelier à harpons (ponton)
  const FB = I2.flareBox;
  group.add(boxM(1.2, 0.6, 0.7, '#ff6b5b', FB.x, FLAT + 0.3, FB.z));
  group.add(boxM(1.22, 0.1, 0.72, '#fff4e0', FB.x, FLAT + 0.62, FB.z));
  cBox(FB.x - 0.6, FB.x + 0.6, FB.z - 0.35, FB.z + 0.35);
  const HR = I2.harpRack;
  group.add(boxM(1.6, 1.4, 0.2, '#8a6a4a', HR.x, D.top + 0.7, HR.z));
  for (let k = 0; k < 4; k++) group.add(boxM(0.04, 1.3, 0.04, '#c9ccd2', HR.x - 0.6 + k * 0.4, D.top + 0.8, HR.z - 0.15));
  // rochers rouges
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 440, z = (r() - 0.5) * 270 - 5;
    const h = height2(x, z);
    if (h < 0.5 || (Math.abs(x) < 165 && z > -52 && z < 58) || (x > 38 && x < 72 && z > 40)) continue;
    const s = 0.8 + r() * 2.2;
    const rk = m(new THREE.DodecahedronGeometry(s, 0), '#b8674a', x, h + s * 0.2, z);
    rk.scale.y = 0.7;
    group.add(rk);
    cCircle(x, z, s * 0.85);
  }


  // ── décor : avions de tourisme, tracteur à bagages, parking, réverbères, panneaux, bar animé ──
  const cessna = (col) => {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(0.55, 0.35, 5.2, 8).rotateX(Math.PI / 2), '#f4f1ea', 0, 1.25, 0));
    g.add(m(new THREE.ConeGeometry(0.55, 1.1, 8).rotateX(-Math.PI / 2), col, 0, 1.25, -3.1));
    g.add(boxM(8.4, 0.12, 1.3, '#f4f1ea', 0, 2.0, -0.6));
    g.add(boxM(1.2, 0.14, 1.32, col, -3.6, 2.0, -0.6)); g.add(boxM(1.2, 0.14, 1.32, col, 3.6, 2.0, -0.6));
    g.add(boxM(2.8, 0.08, 0.8, '#f4f1ea', 0, 1.45, 2.4));
    g.add(boxM(0.1, 1.2, 0.9, col, 0, 2.0, 2.4));
    g.add(boxM(0.9, 0.5, 1.2, '#9fd6e8', 0, 1.75, -1.0));
    g.add(boxM(0.08, 1.6, 0.18, '#33373f', 0, 1.25, -3.75));
    for (const sx of [-0.9, 0.9]) g.add(m(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10).rotateZ(Math.PI / 2), '#1a1d22', sx, 0.28, -0.3));
    g.add(m(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10).rotateZ(Math.PI / 2), '#1a1d22', 0, 0.2, 2.1));
    return g;
  };
  for (const [x, z, ry, col] of [[-12, 13, 0.4, '#ff6b5b'], [18, 14.5, -0.5, '#1f8a8a'], [118, 14, 2.6, '#b8a4ff']]) {
    const c = cessna(col);
    c.position.set(x, FLAT, z); c.rotation.y = ry;
    group.add(c);
    cCircle(x, z, 1.6);
  }
  // tracteur à bagages
  const tug = new THREE.Group();
  tug.position.set(14, FLAT, 27.5); tug.rotation.y = -0.2;
  tug.add(boxM(1.5, 0.9, 2.2, '#ffd166', 0, 0.75, 0));
  tug.add(boxM(1.3, 0.9, 0.9, '#33373f', 0, 1.6, 0.5));
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.7, 0.7]) tug.add(m(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 8).rotateZ(Math.PI / 2), '#1a1d22', sx, 0.3, sz));
  group.add(tug);
  cCircle(14, 27.5, 1.3);
  // parking derrière le terminal
  group.add(boxM(34, 0.05, 9, '#4a4e57', -30, FLAT + 0.035, 48));
  for (let i = 0; i < 7; i++) group.add(boxM(0.15, 0.02, 4, '#f4f1ea', -45 + i * 5, FLAT + 0.07, 48));
  [['#ff8fab', -42.5], ['#6fb7ff', -32.5], ['#e0a458', -22.5]].forEach(([col, x], i) => {
    const car = new THREE.Group();
    car.position.set(x, FLAT, 48); car.rotation.y = (i - 1) * 0.08;
    car.add(boxM(1.8, 0.7, 3.8, col, 0, 0.65, 0));
    car.add(boxM(1.6, 0.6, 2.0, col, 0, 1.3, 0.2));
    car.add(boxM(1.62, 0.45, 1.9, '#9fd6e8', 0, 1.3, 0.2));
    for (const sx of [-0.9, 0.9]) for (const sz of [-1.2, 1.2]) car.add(m(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10).rotateZ(Math.PI / 2), '#1a1d22', sx, 0.33, sz));
    group.add(car);
    cCircle(x, 48 - 0.9, 1.1); cCircle(x, 48 + 0.9, 1.1);
  });
  // réverbères du tarmac (s'allument avec le courant)
  const streetMat = new THREE.MeshLambertMaterial({ color: '#fff1c4', emissive: '#ffd27a', emissiveIntensity: 0 });
  for (let x = -60; x <= 70; x += 13) {
    group.add(m(new THREE.CylinderGeometry(0.1, 0.14, 6, 6), '#8d9299', x, FLAT + 3, 21.5));
    group.add(boxM(1.2, 0.1, 0.12, '#8d9299', x, FLAT + 5.95, 21.1));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), streetMat);
    head.position.set(x, FLAT + 5.85, 20.6);
    head.userData.dynamic = true;
    group.add(head);
    cCircle(x, 21.5, 0.2);
  }
  // panneau publicitaire
  const bill = signBoard(['SAINT-ESCALE', 'soleil garanti · 300 jours par an'], { bg: '#ff6b5b', fg: '#fff4e0', w: 8, h: 3, cw: 1024, ch: 400, y: 5.2, wood: '#8d9299' });
  bill.position.set(58, FLAT, 44.8); bill.rotation.y = Math.PI * 0.9;
  group.add(bill);
  // centrale : projecteurs et sacs de sable autour du générateur
  for (const [dx, dz] of [[-9, -4], [-9, 4], [-2, -6]]) {
    group.add(m(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), '#33373f', P.x + dx, FLAT + 2.25, P.z + dz));
    group.add(boxM(0.7, 0.45, 0.4, '#ffd166', P.x + dx, FLAT + 4.5, P.z + dz));
    cCircle(P.x + dx, P.z + dz, 0.15);
  }
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI;
    if (k === 4) continue; // passage vers le générateur
    const bx = P.x - 5.5 - Math.cos(a) * 3.6, bz = P.z + Math.sin(a) * 3.6;
    const bag = boxM(1.1, 0.45, 0.6, '#c9b27d', bx, FLAT + 0.23, bz);
    bag.rotation.y = -a;
    group.add(bag);
    const bag2 = boxM(1.0, 0.4, 0.55, '#bda36d', bx, FLAT + 0.65, bz);
    bag2.rotation.y = -a + 0.2;
    group.add(bag2);
  }
  const genLight = new THREE.PointLight('#fff1c4', 0, 26, 1.2);
  genLight.position.set(P.x - 6, FLAT + 5, P.z);
  group.add(genLight);
  // bar : tabourets, bouteilles, ardoise « troc », guirlande
  {
    const Bx = I2.bar.x, Bz = I2.bar.z, bh2 = height2(Bx, Bz);
    if (bh2 > 0.2) {
      for (let i = 0; i < 4; i++) {
        group.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5), '#33373f', Bx - 2.2 + i * 1.45, bh2 + 0.38, Bz - 1.4));
        group.add(m(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 10), i % 2 ? '#ff6b5b' : '#1f8a8a', Bx - 2.2 + i * 1.45, bh2 + 0.78, Bz - 1.4));
      }
      const bottles = ['#5ef2c2', '#ffd166', '#ff6b5b', '#b8a4ff', '#6fb7ff'];
      for (let i = 0; i < 9; i++) group.add(m(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 6), bottles[i % 5], Bx - 2.4 + i * 0.55, bh2 + 1.27, Bz + 0.3));
      group.add(boxM(0.9, 0.3, 0.5, '#33373f', Bx + 2.2, bh2 + 1.25, Bz));
      const chalk = sign(['TROC', 'ferraille ⇄ matériel'], '#10162b', '#fff4e0', 1.6, 1.0, 512, 320);
      chalk.position.set(Bx - 3.6, bh2 + 1.0, Bz - 1.2); chalk.rotation.y = Math.PI + 0.4;
      group.add(chalk);
      const bulbCols = ['#ffd166', '#ff6b5b', '#5ef2c2', '#b8a4ff'];
      for (let i = 0; i < 14; i++) {
        const u = i / 13;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: bulbCols[i % 4], toneMapped: false }));
        bulb.position.set(Bx - 3 + u * 6, bh2 + 2.75 - Math.sin(u * Math.PI) * 0.35, Bz - 2.1);
        group.add(bulb);
      }
    }
  }
  // fusion des bâtiments et du décor statiques
  terrain.userData.dynamic = true;
  // une boîte de collision pour chaque objet qui gêne le passage (barrières, cônes, tabourets, voitures…)
  autoColliders(group, colliders, { ground: (x, z) => {
    let g = heightAt(x, z);
    for (const p of platforms) if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) g = Math.max(g, p.top);
    return g;
  } });
  mergeStatic(group, flatMat, (o) => o.userData.dynamic);

  // points d'intérêt en coordonnées monde
  const wp = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
  const points = {
    center: wp(0, FLAT, 0),
    park: wp(I2.park.x, 0, I2.park.z),
    lift: wp(To.x, FLAT + 1.2, To.z - 2.8),
    liftTop: wp(To.x + 2.9, cabY, To.z + 2.9),
    console: wp(To.x, cabY + 1.0, To.z - 2.6),
    fusePanel: wp(P.x + 1.2, FLAT + 1.6, P.z - 2.8),
    hangarPad: wp(H.x + H.w / 2 + 1.2, FLAT + 1.5, H.z - H.d / 2 - 0.4),
    leverL: wp(H.x - H.w / 2 - 1.6, FLAT + 1.3, H.z - H.d / 2 - 1.0),
    leverR: wp(H.x + H.w / 2 + 2.6, FLAT + 1.3, H.z - H.d / 2 - 1.0),
    wheels: wp(H.x - 2, FLAT, H.z + 2),
    pump: wp(I2.pump.x, D.top + 1.1, I2.pump.z + 0.5),
    shed: wp(S.x, FLAT + 1.8, S.z - 2.2),
    poster: wp(I2.poster.x, FLAT + 2.0, I2.poster.z - 0.2),
    vending: wp(v.x, FLAT + 1.2, v.z - 0.6),
    fuseRed: wp(desk.x, FLAT + 1.2, desk.z - 0.8),
    fuseBlue: wp(I2.carts[1].x, FLAT + 1.1, I2.carts[1].z - 1),
    fuseYellow: wp(A.x - 12, height2(A.x - 12, A.z - 4) + 1.2, A.z - 4),
    valves: Object.fromEntries(Object.entries(valves).map(([k, vv]) => [k, wp(vv.group.position.x, FLAT + 1.1, vv.group.position.z - 0.5)])),
    runwayStart: wp(RW.x0 + 20, FLAT, RW.z),
    flareBox: wp(FB.x, FLAT + 0.8, FB.z - 0.5),
    harpRack: wp(HR.x, D.top + 1, HR.z - 0.6),
    generator: wp(P.x - 5.5, FLAT + 0.9, P.z),
    bar: wp(I2.bar.x, height2(I2.bar.x, I2.bar.z) + 1.1, I2.bar.z - 1.8),
  };
  // plages pour les crabes
  const crabs = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    for (let rr = 250; rr > 40; rr -= 1) {
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.62 - 10;
      const h = height2(x, z);
      if (h > 0.6 && h < 1.4) { crabs.push({ x: cx + x, z: cz + z }); break; }
    }
  }

  let power = false, hangarOpen = 0, hangarTarget = 0;
  const lights = () => (power ? [
    { p: wp(T.x, FLAT, T.z - 2), r: CFG.island2.lightRadius },
    { p: wp(To.x, FLAT, To.z - 4), r: 14 },
    { p: wp(80, 0.5, 98), r: 13 },
    { p: wp(P.x - 2, FLAT, P.z), r: 13 },
  ] : []);

  return {
    cx, cz, group, colliders, platforms, points, valves, fuseSlots, crabs, hangarDoorCol, radarPos: new THREE.Vector3(cx, 0, cz),
    get power() { return power; },
    lights,
    setPower(on) {
      power = on;
      runwayLamps.forEach((l) => { l.material = on ? l.userData.on : lampOff; });
      termLight.intensity = on ? 14 : 0;
      towerLight.intensity = on ? 10 : 0;
      dockLight.intensity = on ? 9 : 0;
      genLight.intensity = on ? 12 : 0;
      streetMat.emissiveIntensity = on ? 1.8 : 0;
      liftLamp.material.color.set(on ? '#5ef2c2' : '#ff6b5b');
      pumpLamp.material.color.set(on ? '#5ef2c2' : '#ff6b5b');
      radioScreen.material.color.set(on ? '#1f8a8a' : '#10162b');
    },
    setFuse(i, color) { fuseSlots[i].material = color ? new THREE.MeshLambertMaterial({ color: { red: '#ff4d4d', blue: '#3d7bff', yellow: '#ffd166' }[color] }) : flatMat; },
    setValve(k, open) { valves[k].open = open; },
    openHangar() { hangarTarget = 1; hangarDoorCol.disabled = true; },
    setHangarOpen() { hangarOpen = hangarTarget = 1; hangarDoorCol.disabled = true; },
    update(t, dt) {
      if (power) radar.rotation.y += dt * 1.2;
      beacon.visible = Math.sin(t * 3) > 0;
      sockCloth.rotation.y = 0.8 + Math.sin(t * 0.7) * 0.25;
      sockCloth.rotation.z = -0.15 + Math.sin(t * 2.1) * 0.05;
      for (const f of flamingos) f.children[3].position.y = 1.9 + Math.sin(t * 1.5 + f.userData.ph) * 0.03;
      for (const [, vv] of Object.entries(valves)) vv.wheel.rotation.z += ((vv.open ? Math.PI * 1.5 : 0) - vv.wheel.rotation.z) * Math.min(1, dt * 4);
      if (hangarOpen < hangarTarget) {
        hangarOpen = Math.min(1, hangarOpen + dt * 0.25);
      }
      hDoors.forEach((d) => { d.position.x = d.userData.closedX + d.userData.sx * hangarOpen * (H.w / 2 - 1); });
      for (const L of Object.values(levers)) L.handle.rotation.x += ((L.down ? 0.9 : -0.5) - L.handle.rotation.x) * Math.min(1, dt * 10);
    },
    setLever(k, down) {
      const L = levers[k];
      if (!L) return;
      L.down = down;
      L.lamp.material.color.set(down ? '#5ef2c2' : '#ff6b5b');
    },
    dispose() {
      scene.remove(group);
      setIsland2(null);
    },
  };
}
