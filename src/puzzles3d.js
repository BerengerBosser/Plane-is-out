// Énigmes physiques de Saint-Escale (esprit Portal / The Talos Principle / Firewatch) : tout se manipule dans le monde.
//  · fusible rouge : sur le toit du terminal. L'échelle de service est arrachée en bas : glisser une caisse dessous.
//  · fusible bleu  : poste de sécurité. Un laser doit atteindre le capteur : poser deux miroirs sur les socles et les
//                    orienter à la main (angle libre, vraie réflexion). La salle est tirée au sort à chaque partie ;
//                    un corps (ou une caisse) coupe le faisceau.
//  · fusible jaune : local technique du balisage, en bout de piste. Porte à double commande : deux pédales enfoncées.
//  · tableau électrique : chaque fusible dans son emplacement (l'affiche du terminal donne l'ordre, tiré au sort).
//  · radio de la tour : on cherche la fréquence au bouton de réglage, à l'oreille (parasites, stations parasites).
//  · purge du circuit de carburant : quatre vannes, trois manomètres ; amener les trois aiguilles dans le vert.
//  · hangar 2 : clavier physique (le code vient de la radio).
import * as THREE from 'three';
import { prep, flatMat, textTexture } from './terrain.js';
import { FLAT, I2 } from './island2.js';
import { buildKeypad, makeLcd } from './devices.js';
import { valvePressure, VALVE_KEYS } from './secrets.js';
import { traceBeam, LROOM } from './laser.js';
import { FUSE_SLOTS } from './defs.js';

const LASER_Y = 1.0;
export const P2 = {
  ladder: { x: -11.25, z: 39, y0: 2.6, y1: 6.6 },          // relatif à FLAT
  roofBox: { x: -18, z: 38.5 },
  room: { x: -35, z: 14, w: LROOM.w, d: LROOM.d, h: 3.6 }, // poste de sécurité
  cage: { x: 110, z: 16 },                                // local technique du balisage (porte côté piste)
  plates: [{ x: 101, z: 10.5 }, { x: 119, z: 10.5 }],     // pédales de sécurité : deux techniciens (ou du lest)
  items: {
    cargoBox: { x: -3, z: 47, r: 0.3 },
    sandbag: { x: 129, z: 20, r: 0.6 },                   // sacs de lest de la manche à air
    ballast: { x: 91, z: 11, r: 0.2 },                    // bloc de béton du chantier des vannes
    mirror1: { room: true, r: Math.PI / 4 },
    mirror2: { x: -37.6, z: 37.8, r: Math.PI / 4 },
  },
};
const SAFE = [11.8, 3.2];     // coffre mural (fusible bleu), mur est
const FUSE_NAMES = { red: 'rouge', blue: 'bleu', yellow: 'jaune' };
const FUSE_COL = { red: '#ff4d4d', blue: '#3d7bff', yellow: '#ffd166' };
// textes des stations captées par la radio de la tour
const STATIONS = {
  marthe: 'ICI MARTHE · LABO HÉLIOS · VOUS ME RECEVEZ ? RÉPONDEZ ! ',
  meteo: 'BALISE MÉTÉO SAINT-ESCALE · RAFALES 90 KM/H · TEMPÊTE À PARTIR DE 19 H · ',
  music: '♪ RADIO ARCHIPEL · « TROPICAL 1987 » · ♪ ',
};

function boxM(w, h, d, col, x, y, z) { const o = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function sign(lines, bg, fg, w, h, cw = 512, ch = 256) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTexture(lines, bg, fg, cw, ch) })); return o; }
const tagParts = (o, part) => o.traverse((q) => { q.userData.part = part; });
const deg = (a) => ((((a * 180) / Math.PI) % 360) + 360) % 360;

// cadran de manomètre : échelle 0 → 1,2, zone verte (réglage cible) et zone rouge (surpression)
function gaugeFace(target, band) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2, R = S * 0.44;
  const ang = (p) => ((-135 + (p / 1.2) * 270) - 90) * Math.PI / 180;
  g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(c, c, S / 2 - 2, 0, Math.PI * 2); g.fill();
  const arc = (a, b, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(c, c, R - w / 2, ang(a), ang(b)); g.stroke(); };
  arc(0, 1.2, '#c9c4b6', 10);
  arc(1.0, 1.2, '#e0332a', 18);
  arc(target - band, target + band, '#2fbf71', 26);
  g.strokeStyle = '#10162b'; g.fillStyle = '#10162b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 20px monospace';
  for (let i = 0; i <= 12; i++) {
    const a = ang(i / 10), l = i % 2 ? 12 : 22;
    g.lineWidth = i % 2 ? 2 : 4;
    g.beginPath(); g.moveTo(c + Math.cos(a) * (R - 26), c + Math.sin(a) * (R - 26)); g.lineTo(c + Math.cos(a) * (R - 26 - l), c + Math.sin(a) * (R - 26 - l)); g.stroke();
    if (!(i % 2)) g.fillText(String(i / 10).replace('.', ','), c + Math.cos(a) * (R - 64), c + Math.sin(a) * (R - 64));
  }
  g.font = 'bold 18px sans-serif'; g.fillText('bar', c, c + 58);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const PhysPuzzleMixin = {
  // construit les énigmes dans le groupe de l'île 2 et recale les fusibles (après applySecrets : la graine fixe tout)
  buildPhysPuzzles() {
    if (this.pz2) this.pz2.beams.forEach((b) => this.scene.remove(b));
    this.removeDevices?.('i2');
    const I = this.island2, g = new THREE.Group(), cx = I.cx, cz = I.cz, S = this.secrets;
    I.group.add(g);
    const col = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; I.colliders.push(c); return c; };
    const W = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
    const pz = this.pz2 = { g, beams: [], lit: false, charge: 0, safe: 0, cage: 0, plates: [false, false], ladders: [], press: [0, 0, 0], green: 0, radio: { f: 118, acc: 0 } };

    // ── toit du terminal + échelle de service ──
    const T = I2.terminal, roofTop = FLAT + T.h + 0.6;
    I.platforms.push({ minX: cx + T.x - T.w / 2 - 0.5, maxX: cx + T.x + T.w / 2 + 0.5, minZ: cz + T.z - T.d / 2 - 0.5, maxZ: cz + T.z + T.d / 2 + 0.5, top: roofTop });
    col(T.x - 8.4, T.x + 8.4, T.z - T.d / 2 - 0.1, T.z - T.d / 2 + 0.35, { minY: roofTop - 0.5, maxY: roofTop + 3 });   // enseigne
    // blocs de clim et boîtier du fusible : on bute contre, et on peut sauter dessus (plateformes)
    const roofPlat = (x0, x1, z0, z1, top) => I.platforms.push({ minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, top });
    for (const [x, z] of [[-40, 36], [-30, 39], [-24, 35]]) { g.add(boxM(2.2, 1.2, 1.6, '#c9cfd6', x, roofTop + 0.6, z)); g.add(boxM(1.2, 0.08, 1.2, '#5d6470', x, roofTop + 1.24, z)); col(x - 1.1, x + 1.1, z - 0.8, z + 0.8, { minY: roofTop - 1, maxY: roofTop + 1 }); roofPlat(x - 1.1, x + 1.1, z - 0.8, z + 0.8, roofTop + 1.2); }
    const rb = P2.roofBox;
    g.add(boxM(1.0, 1.3, 0.6, '#ff6b5b', rb.x, roofTop + 0.65, rb.z));
    const rbDoor = boxM(0.9, 1.1, 0.06, '#c94a3a', rb.x, roofTop + 0.7, rb.z - 0.33); g.add(rbDoor);
    const rbSign = sign(['⚡ SECOURS', 'ÉCLAIRAGE'], '#ffd166', '#10162b', 0.8, 0.4, 256, 128); rbSign.position.set(rb.x, roofTop + 1.05, rb.z - 0.37); rbSign.rotation.y = Math.PI; g.add(rbSign);
    col(rb.x - 0.5, rb.x + 0.5, rb.z - 0.3, rb.z + 0.3, { minY: roofTop - 1, maxY: roofTop + 1 });
    roofPlat(rb.x - 0.5, rb.x + 0.5, rb.z - 0.3, rb.z + 0.3, roofTop + 1.3);
    const L = P2.ladder;
    for (const dz of [-0.32, 0.32]) g.add(boxM(0.07, L.y1 - L.y0 + 1.1, 0.07, '#8d9299', L.x, FLAT + (L.y0 + L.y1 + 1.1) / 2, L.z + dz));
    for (let y = L.y0 + 0.15; y < L.y1 + 1.0; y += 0.32) g.add(boxM(0.05, 0.05, 0.64, '#b8bec6', L.x, FLAT + y, L.z));
    for (const y of [L.y0 + 0.3, L.y1 - 0.5]) g.add(boxM(0.75, 0.06, 0.06, '#5d6470', L.x - 0.37, FLAT + y, L.z));
    const bent = boxM(0.05, 0.05, 0.3, '#8d9299', L.x, FLAT + L.y0 - 0.5, L.z + 0.25); bent.rotation.x = 0.7; g.add(bent);
    const ls = sign(['ÉCHELLE DE SERVICE', 'barreaux du bas arrachés', '→ toit'], '#fff4e0', '#10162b', 1.2, 0.7, 512, 300);
    ls.position.set(L.x + 0.05, FLAT + 1.6, L.z + 1.1); ls.rotation.y = Math.PI / 2; g.add(ls);
    pz.ladders.push({ x: cx + L.x + 0.55, z: cz + L.z, y0: FLAT + L.y0, y1: roofTop, dir: new THREE.Vector3(-1, 0, 0), top: W(L.x - 0.9, roofTop, L.z) });

    // ── poste de sécurité (laser et miroirs) : disposition tirée au sort ──
    const LZ = pz.layout = S.laser;
    const R = P2.room, x0 = R.x - R.w / 2, z0 = R.z - R.d / 2;
    const U = (u, v, y = 0) => new THREE.Vector3(cx + x0 + u, y, cz + z0 + v);
    pz.U = U; pz.x0 = cx + x0; pz.z0 = cz + z0;
    const wallC = '#d6cfc0';
    g.add(boxM(R.w, 0.12, R.d, '#6b6f78', R.x, FLAT + 0.06, R.z));
    const wall = (u0, u1, v0, v1) => { g.add(boxM(u1 - u0, R.h, v1 - v0, wallC, x0 + (u0 + u1) / 2, FLAT + R.h / 2, z0 + (v0 + v1) / 2)); col(x0 + u0, x0 + u1, z0 + v0, z0 + v1); };
    wall(-0.2, 0, 0, R.d); wall(R.w, R.w + 0.2, 0, R.d); wall(-0.2, R.w + 0.2, -0.2, 0);
    wall(-0.2, LROOM.doorU0, R.d, R.d + 0.2); wall(LROOM.doorU1, R.w + 0.2, R.d, R.d + 0.2);
    g.add(boxM(2, R.h - 2.6, 0.2, wallC, x0 + 6, FLAT + 2.6 + (R.h - 2.6) / 2, z0 + R.d + 0.1));
    g.add(boxM(R.w + 0.8, 0.3, R.d + 0.8, '#3d434d', R.x, FLAT + R.h + 0.15, R.z));
    g.add(boxM(R.w + 0.9, 0.35, 0.3, '#ffd166', R.x, FLAT + R.h - 0.2, z0 + R.d + 0.26));
    const rs = sign(['POSTE DE SÉCURITÉ'], '#10162b', '#ffd166', 4.6, 0.7, 1024, 150);
    rs.position.set(R.x, FLAT + R.h - 0.7, z0 + R.d + 0.22); g.add(rs);
    const how = sign(['CONSIGNE', 'Le coffre s\'ouvre quand le', 'faisceau touche le capteur.', 'Miroirs : sur les socles, à orienter.'], '#fff4e0', '#10162b', 1.5, 1.1, 512, 380);
    how.position.set(x0 + 4.2, FLAT + 1.8, z0 + R.d + 0.22); g.add(how);
    const room = new THREE.PointLight('#ff9a8a', 3, 16, 1.5); room.position.copy(U(6, 5, FLAT + 3)); pz.roomLight = room; I.group.add(room); room.position.sub(I.group.position);
    const em = LZ.emitter;
    g.add(boxM(0.5, 0.5, 0.6, '#33373f', x0 + em.u - 0.1, FLAT + LASER_Y, z0 + em.v));
    g.add(boxM(0.18, 0.18, 0.18, '#ff4d4d', x0 + em.u + 0.2, FLAT + LASER_Y, z0 + em.v));
    // capteur (mur est, sud ou nord selon la partie)
    const sn = LZ.sensor, alongU = sn.nv !== 0;
    g.add(boxM(alongU ? 0.7 : 0.2, 0.7, alongU ? 0.2 : 0.7, '#33373f', x0 + sn.u - sn.nu * 0.15, FLAT + LASER_Y, z0 + sn.v - sn.nv * 0.15));
    pz.sensorLamp = new THREE.Mesh(new THREE.BoxGeometry(alongU ? 0.4 : 0.06, 0.36, alongU ? 0.06 : 0.4), new THREE.MeshBasicMaterial({ color: '#552222', toneMapped: false }));
    pz.sensorLamp.position.set(x0 + sn.u - sn.nu * 0.02, FLAT + LASER_Y, z0 + sn.v - sn.nv * 0.02); g.add(pz.sensorLamp);
    for (const [pu, pv, h] of LZ.pillars) {
      g.add(boxM(h * 2, 2.2, h * 2, '#b98b5e', x0 + pu, FLAT + 1.1, z0 + pv));
      g.add(boxM(h * 2 + 0.05, 0.12, h * 2 + 0.05, '#7a5536', x0 + pu, FLAT + 2.2, z0 + pv));
      col(x0 + pu - h, x0 + pu + h, z0 + pv - h, z0 + pv + h);
    }
    pz.sockets = LZ.sockets.map(([u, v]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false, transparent: true, opacity: 0.55 }));
      m.position.set(x0 + u, FLAT + 0.15, z0 + v); g.add(m);
      return { u, v, mesh: m, pos: U(u, v, FLAT + 0.15) };
    });
    // où poser le miroir de la salle : un coin dégagé
    const free = [[1.2, 9.0], [1.2, 1.0], [10.8, 9.0], [7.9, 9.2], [4.1, 9.2], [10.8, 1.0]].find(([u, v]) => LZ.pillars.every(([a, b, h]) => Math.hypot(a - u, b - v) > h + 1.0) && LZ.sockets.every(([a, b]) => Math.hypot(a - u, b - v) > 1.2)) || [6, 9];
    pz.mirrorSpot = free;
    const [fu, fv] = SAFE;
    g.add(boxM(0.4, 1.0, 1.0, '#5d6470', x0 + fu - 0.1, FLAT + 1.2, z0 + fv));
    const safeDoor = new THREE.Group(); safeDoor.position.set(x0 + fu - 0.32, FLAT + 1.2, z0 + fv - 0.48);
    safeDoor.add(boxM(0.06, 0.9, 0.9, '#8d9299', 0, 0, 0.45));
    safeDoor.add(boxM(0.08, 0.2, 0.2, '#ffd166', -0.04, 0, 0.62));
    g.add(safeDoor); pz.safeDoor = safeDoor;
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1), beamMat); b.visible = false; b.userData.dynamic = true; this.scene.add(b); pz.beams.push(b); }
    pz.spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff6060', toneMapped: false }));
    pz.spot.visible = false; this.scene.add(pz.spot); pz.beams.push(pz.spot);

    // ── local technique du balisage + pédales de sécurité ──
    const C = P2.cage;
    const cage = new THREE.Group(); cage.position.set(C.x, FLAT, C.z); g.add(cage);
    const CON = '#b9b4a8', CON2 = '#9a958a';
    g.add(boxM(24, 0.06, 10, '#8d8a84', C.x, FLAT + 0.03, C.z - 3.6));
    cage.add(boxM(3.4, 2.8, 0.25, CON, 0, 1.4, 1.5));
    for (const sx of [-1, 1]) cage.add(boxM(0.25, 2.8, 3.2, CON, sx * 1.575, 1.4, 0));
    for (const sx of [-1, 1]) cage.add(boxM(0.6, 2.8, 0.25, CON, sx * 1.4, 1.4, -1.5));
    cage.add(boxM(3.4, 0.5, 0.25, CON2, 0, 2.55, -1.5));
    cage.add(boxM(3.8, 0.2, 3.6, CON2, 0, 2.9, 0));
    cage.add(boxM(0.06, 0.06, 3.0, '#ffd166', -1.7, 2.3, 0)); cage.add(boxM(0.06, 0.06, 3.0, '#ffd166', 1.7, 2.3, 0));
    const lampT = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false })); lampT.position.set(0, 3.1, -1.2); cage.add(lampT);
    const door = new THREE.Group(); door.position.set(0, 0, -1.52); cage.add(door);
    for (let y = 0.12; y < 2.3; y += 0.16) door.add(boxM(2.2, 0.13, 0.05, y % 0.32 < 0.16 ? '#8d9299' : '#7a7f86', 0, y, 0));
    door.add(boxM(2.2, 0.08, 0.08, '#ffd166', 0, 0.05, 0));
    pz.cageDoor = door;
    cage.add(boxM(0.5, 0.9, 0.5, '#33373f', 0, 0.45, 0.6));
    cage.add(boxM(0.9, 1.4, 0.3, '#5d6470', -0.9, 0.9, 1.25));
    col(C.x - 1.7, C.x + 1.7, C.z + 1.35, C.z + 1.65); col(C.x - 1.7, C.x - 1.45, C.z - 1.6, C.z + 1.6); col(C.x + 1.45, C.x + 1.7, C.z - 1.6, C.z + 1.6);
    col(C.x - 1.7, C.x - 1.1, C.z - 1.65, C.z - 1.35); col(C.x + 1.1, C.x + 1.7, C.z - 1.65, C.z - 1.35);
    pz.cageCol = col(C.x - 1.1, C.x + 1.1, C.z - 1.65, C.z - 1.4);
    const hs = sign(['LOCAL BALISAGE', 'piste 09 / 27'], '#10162b', '#ffd166', 2.2, 0.5, 512, 120);
    hs.position.set(C.x, FLAT + 2.55, C.z - 1.64); hs.rotation.y = Math.PI; g.add(hs);
    const cs = sign(['PORTE À DOUBLE COMMANDE', 'Haute tension : deux techniciens', 'maintiennent chacun une pédale', 'de sécurité enfoncée'], '#fff4e0', '#10162b', 1.9, 1.1, 512, 300);
    cs.position.set(C.x + 2.6, FLAT + 1.5, C.z - 1.8); cs.rotation.y = Math.PI; g.add(cs);
    g.add(boxM(0.08, 1.0, 0.08, '#3d434d', C.x + 2.6, FLAT + 0.5, C.z - 1.75));
    pz.plates = P2.plates.map((p) => {
      const pg = new THREE.Group(); pg.position.set(p.x, FLAT, p.z); g.add(pg);
      pg.add(boxM(1.9, 0.08, 1.9, '#3d434d', 0, 0.04, 0));
      for (const [dx, dz] of [[-0.95, 0], [0.95, 0]]) pg.add(boxM(0.08, 0.1, 1.9, '#ffd166', dx, 0.06, dz));
      const top = boxM(1.5, 0.12, 1.5, '#c9352b', 0, 0.14, 0); pg.add(top);
      const ps = sign(['PÉDALE DE SÉCURITÉ'], '#ffd166', '#10162b', 0.9, 0.22, 256, 64); ps.position.set(0, 1.25, 1.06); ps.rotation.y = Math.PI; pg.add(ps);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff4d4d', toneMapped: false }));
      lamp.position.set(0, 1.4, 1.1); pg.add(lamp); pg.add(boxM(0.08, 1.35, 0.08, '#3d434d', 0, 0.68, 1.1));
      return { x: cx + p.x, z: cz + p.z, top, lamp, on: false };
    });
    for (const p of P2.plates) {
      const len = Math.hypot(C.x - p.x, C.z - p.z), c = boxM(0.08, 0.05, len, '#10162b', (C.x + p.x) / 2, FLAT + 0.05, (C.z + p.z) / 2);
      c.rotation.y = Math.atan2(C.x - p.x, C.z - p.z); g.add(c);
    }

    // ── purge du circuit de carburant : manomètres au-dessus des vannes ──
    const Vv = I2.valves, VS = S.valves;
    pz.gauges = [0, 1, 2].map((j) => {
      const gg = new THREE.Group(); gg.position.set(Vv.x + 0.6 + j * 1.2, FLAT + 2.15, Vv.z - 0.25); gg.rotation.y = Math.PI; g.add(gg);
      gg.add(boxM(0.05, 0.75, 0.05, '#8d9299', 0, -0.55, -0.06));
      const back = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 18).rotateX(Math.PI / 2), '#33373f'), flatMat); gg.add(back);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.215, 28), new THREE.MeshLambertMaterial({ map: gaugeFace(VS.target[j], VS.band) })); face.position.z = 0.042; gg.add(face);
      const needle = new THREE.Group(); needle.position.z = 0.05; gg.add(needle);
      const nm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.18, 0.008), new THREE.MeshBasicMaterial({ color: '#e0332a' })); nm.position.y = 0.075; needle.add(nm);
      needle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#10162b' })));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#552222', toneMapped: false })); lamp.position.y = 0.34; gg.add(lamp);
      const lab = sign([`M${j + 1}`], '#10162b', '#fff4e0', 0.18, 0.12, 128, 80); lab.position.set(0, -0.33, 0.01); gg.add(lab);
      return { needle, lamp };
    });
    const purge = sign(['PURGE DU CIRCUIT', 'Amener M1, M2 et M3 dans le vert', 'en même temps, puis attendre', 'A = vidange · B C D = arrivées'], '#fff4e0', '#10162b', 1.6, 0.9, 512, 290);
    purge.position.set(Vv.x - 1.9, FLAT + 1.6, Vv.z - 0.3); purge.rotation.y = Math.PI; g.add(purge);
    g.add(boxM(0.06, 1.2, 0.06, '#3d434d', Vv.x - 1.9, FLAT + 0.6, Vv.z - 0.28));
    // volants des vannes : saisis à la main
    VALVE_KEYS.forEach((k) => {
      const vg = I.valves[k]?.group; if (!vg) return;
      tagParts(vg, k);
      this.addDevice({
        tag: 'i2', obj: vg, range: 2.4,
        active: () => this.mode === 'explore',
        prompt: () => `Vanne <b>${k}</b>${k === 'A' ? ' (vidange)' : ''} : ${Math.round((+this.valves[k] || 0) * 100)} % · <kbd>E</kbd> maintenu + souris : tourner · molette : un cran`,
        grab: {
          move: (dx, dy, part, dt, fine) => this.turnValve(k, dx * (fine ? 0.0004 : 0.0018)),
          end: () => this.sendValve(k, true),
          prompt: () => `Vanne <b>${k}</b> : ${Math.round((+this.valves[k] || 0) * 100)} % · souris ← → · <kbd>Maj</kbd> fin · relâchez <kbd>E</kbd>`,
        },
        wheel: (p, dir) => { this.turnValve(k, dir * 0.03); this.sendValve(k, true); },
      });
    });

    // ── tableau électrique : chaque emplacement se vise ──
    I.fuseSlots.forEach((m, i) => {
      m.userData.part = i;
      const slot = FUSE_SLOTS[i];
      this.addDevice({
        tag: 'i2', obj: m, range: 2.2,
        active: () => this.mode === 'explore',
        prompt: () => {
          const cur = this.fuseSlots[i].fuse, pool = [...this.fuses];
          const next = pool.length ? `<kbd>E</kbd> ${cur ? 'échanger contre' : 'insérer'} le fusible ${FUSE_NAMES[this.nextFuse(i)]}` : cur ? '' : '<span class="warn">aucun fusible en poche</span>';
          return `${slot.icon} ${slot.label} : ${cur ? `fusible <b>${FUSE_NAMES[cur]}</b>` : 'vide'}${next ? ` · ${next}` : ''}${cur ? ' · <kbd>R</kbd> retirer' : ''}`;
        },
        press: () => { const f = this.nextFuse(i); if (!f) { this.audio.error(); return; } this.setFuseSlot(i, f); },
        alt: () => { if (this.fuseSlots[i].fuse) this.setFuseSlot(i, null); },
      });
    });

    // ── radio de la tour : bouton de réglage, bouton d'émission, écran ──
    const To = I2.tower, cabY = FLAT + To.h;
    const radio = new THREE.Group(); radio.position.set(To.x - 1.3, cabY + 1.0, To.z - 3.15); g.add(radio);
    radio.add(boxM(0.84, 0.44, 0.45, '#3d434d', 0, 0.22, 0));
    radio.add(boxM(0.86, 0.05, 0.47, '#1f8a8a', 0, 0.45, 0));
    const lcd = makeLcd(0.5, 0.25, 320, 160);
    lcd.mesh.position.set(-0.13, 0.25, 0.227); radio.add(lcd.mesh);
    const knob = new THREE.Group(); knob.position.set(0.27, 0.28, 0.23); radio.add(knob);
    knob.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 14).rotateX(Math.PI / 2), '#10162b'), flatMat));
    const notch = boxM(0.012, 0.05, 0.012, '#ffd166', 0, 0.045, 0.034); knob.add(notch);
    tagParts(knob, 'knob');
    const ptt = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12).rotateX(Math.PI / 2), '#e0332a'), flatMat);
    ptt.position.set(0.27, 0.1, 0.235); ptt.userData.part = 'ptt'; radio.add(ptt);
    const pttLab = sign(['ÉMETTRE'], '#10162b', '#fff4e0', 0.14, 0.04, 128, 36); pttLab.position.set(0.27, 0.035, 0.228); radio.add(pttLab);
    for (let k = 0; k < 5; k++) radio.add(boxM(0.2, 0.008, 0.01, '#10162b', -0.13, 0.07 + k * 0.018, 0.228));   // grille du haut-parleur
    // micro sur son pied
    radio.add(boxM(0.05, 0.25, 0.05, '#10162b', -0.52, 0.12, 0.12));
    radio.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.05, 8, 6), '#5d6470'), flatMat).translateX(-0.52).translateY(0.28).translateZ(0.12));
    pz.radioObj = { group: radio, lcd, knob, ptt, pos: W(To.x - 1.3, cabY + 1.3, To.z - 3.0) };
    this.addDevice({
      tag: 'i2', obj: radio, range: 2.2,
      active: () => this.mode === 'explore',
      prompt: (p) => {
        if (!I.power) return '<span class="warn">Radio éteinte : pas de courant</span>';
        const f = pz.radio.f.toFixed(2);
        if (p === 'knob') return `Réglage : <b>${f} MHz</b> · <kbd>E</kbd> maintenu + souris : chercher · molette : 0,05 · <kbd>R</kbd> +1 MHz`;
        if (p === 'ptt') return `<kbd>E</kbd> émettre sur ${f} MHz`;
        return null;
      },
      press: (p) => { if (p === 'ptt') this.radioTransmit(); else if (p === 'knob' && I.power) this.startGrab(this.devices.find((d) => d.obj === radio), 'knob'); },
      alt: (p) => { if (p === 'knob' && I.power) this.tuneRadio(20); },
      wheel: (p, dir) => { if (I.power) this.tuneRadio(dir); },
      grab: {
        move: (dx, dy, p, dt, fine) => {
          if (!I.power) return;
          const st = fine ? 16 : 6;
          pz.radio.acc += dx;
          while (Math.abs(pz.radio.acc) >= st) { this.tuneRadio(Math.sign(pz.radio.acc)); pz.radio.acc -= Math.sign(pz.radio.acc) * st; }
        },
        prompt: () => `<b>${pz.radio.f.toFixed(2)} MHz</b> · souris ← → · <kbd>Maj</kbd> fin · écoutez les parasites`,
      },
    });

    // ── clavier du hangar 2 ──
    const H = I2.hangar;
    const kp = pz.hangarKp = buildKeypad({ title: 'HANGAR 2', len: 3 });
    kp.group.position.set(H.x + H.w / 2 + 1.2, FLAT + 1.5, H.z - H.d / 2 - 0.205); kp.group.rotation.y = Math.PI;
    g.add(kp.group);
    this.addDevice({
      tag: 'i2', obj: kp.group, range: 2.2,
      active: () => this.mode === 'explore' && !this.flags.hangarOpen,
      prompt: (l) => `<kbd>E</kbd> touche <b>${l}</b>`,
      hover: (l, on) => kp.hover(on ? l : null),
      press: (l) => {
        if (!I.power) { this.audio.error(); this.ui.toast('Clavier éteint', 'Pas de courant : rétablissez-le à la centrale.', 'bad', 2000); return; }
        this.audio.beep();
        const code = kp.key(l);
        if (code === null) return;
        if (code === S.hangarCode) { kp.flash('OUVERT', 3); this.act('hangar'); this.audio.success(); }
        else { kp.flash('REFUSÉ'); this.audio.error(); }
      },
    });

    // nouveaux emplacements des fusibles
    const P = I.points;
    P.fuseRed = W(rb.x, roofTop + 0.75, rb.z - 0.1);
    P.fuseBlue = U(fu - 0.12, fv, FLAT + 1.2);
    P.fuseYellow = W(C.x, FLAT + 1.1, C.z + 0.6);
    P.laserRoom = U(6, 9, FLAT + 1);
    P.cage = W(C.x, FLAT + 1, C.z);
    P.ladder = W(L.x + 0.6, FLAT + 1, L.z);
    P.valvesMid = W(Vv.x + 1.8, FLAT + 1.2, Vv.z - 1.2);
    [rbDoor, safeDoor, door, ...pz.plates.map((p) => p.top)].forEach((o) => { o.userData.dynamic = true; });
    g.traverse((o) => { if (o.isMesh) o.userData.dynamic = o.userData.dynamic || false; });
    this.ladders = [...pz.ladders];
  },

  // pose les objets des énigmes s'ils ne sont pas encore dans le monde (nouvelle partie, vieille sauvegarde)
  ensurePuzzleItems(island = 2) {
    if (island !== 2 || !this.pz2) return;
    const I = this.island2;
    for (const [id, p] of Object.entries(P2.items)) {
      const it = this.items[id];
      if (!it || it.state !== 'hidden') continue;
      if (p.room) { const w = this.pz2.U(...this.pz2.mirrorSpot); this.placeItem(it, w.x, w.z, p.r); } else this.placeItem(it, I.cx + p.x, I.cz + p.z, p.r);
    }
  },

  // ── blocs : plateformes et obstacles dynamiques ──
  updateBlocks() {
    const plats = [], cols = [];
    for (const it of Object.values(this.items)) {
      const b = it.def.block;
      if (!b || it.state !== 'ground' || !it.mesh.visible) continue;
      const c = Math.abs(Math.cos(it.rotY)), s = Math.abs(Math.sin(it.rotY));
      const ex = (c * b.w + s * b.d) / 2, ez = (s * b.w + c * b.d) / 2;
      const base = it.mesh.position.y - it.rest + 0.05, top = base + b.h;
      if (!b.noStand) plats.push({ minX: it.pos.x - ex, maxX: it.pos.x + ex, minZ: it.pos.z - ez, maxZ: it.pos.z + ez, top, item: it });
      cols.push({ type: 'box', minX: it.pos.x - ex, maxX: it.pos.x + ex, minZ: it.pos.z - ez, maxZ: it.pos.z + ez, minY: base - 1.7, maxY: b.noStand ? top + 5 : top - 0.55, top, item: it });
    }
    this.blockPlats = plats;
    this.blockCols = cols;
  },

  // ── laser ──
  mirrorOn(it) {
    if (!this.pz2 || !it.def.mirror || it.state !== 'ground') return -1;
    return this.pz2.sockets.findIndex((s) => Math.hypot(s.pos.x - it.pos.x, s.pos.z - it.pos.z) < 0.35);
  },
  // miroirs posés : orientables à la main (dispositifs créés à la volée)
  mirrorDevices() {
    if (!this.pz2 || this.carrying) return [];
    const out = [];
    for (const it of Object.values(this.items)) {
      if (this.mirrorOn(it) < 0) continue;
      if (!it._devTagged) { tagParts(it.mesh, it.id); it._devTagged = true; }
      out.push({
        tag: 'mirror', obj: it.mesh, range: 2.6,
        prompt: () => `${it.def.name} : <b>${deg(it.rotY).toFixed(1)}°</b> · <kbd>E</kbd> maintenu + souris : orienter · molette : ½° · <kbd>R</kbd> reprendre`,
        grab: {
          move: (dx, dy, p, dt, fine) => this.rotateMirror(it, -dx * (fine ? 0.0005 : 0.0028)),
          end: () => this.rotateMirror(it, 0, true),
          prompt: () => `Orientation : <b>${deg(it.rotY).toFixed(1)}°</b> · souris ← → · <kbd>Maj</kbd> très fin · relâchez <kbd>E</kbd>`,
        },
        wheel: (p, dir) => { this.rotateMirror(it, dir * Math.PI / 360, true); this.audio.ratchet(); },
        alt: () => this.pickUp(it, 'hand'),
      });
    }
    return out;
  },
  rotateMirror(it, da, send) {
    if (da) { it.rotY += da; this.poseGround(it); }
    this._mirT = (this._mirT || 0) + Math.abs(da);
    const now = this.t;
    if (send || now - (this._mirSend || 0) > 0.12) {
      this._mirSend = now;
      this.act('irot', { id: it.id, r: +it.rotY.toFixed(4) });
    }
    if (this._mirT > 0.05) { this._mirT = 0; this.audio.ratchet(); }
  },
  // corps et caisses dans la salle : ils coupent le faisceau
  laserBlockers() {
    const pz = this.pz2, out = [];
    const toRoom = (p) => ({ u: p.x - pz.x0, v: p.z - pz.z0 });
    const inRoom = (q) => q.u > 0 && q.u < LROOM.w && q.v > 0 && q.v < LROOM.d;
    const bodies = [];
    if (this.mode === 'explore' && !this.aboard && !this.bseat) bodies.push(this.playerWorld());
    for (const m of this.mateList()) if (!m.aboard && m.mode === 'explore') bodies.push(m.pos);
    for (const b of bodies) { if (b.y > FLAT + 2.2 || b.y < FLAT - 1) continue; const q = toRoom(b); if (inRoom(q)) out.push({ ...q, r: 0.24 }); }
    for (const it of Object.values(this.items)) {
      if (!it.def.block || it.def.mirror || it.state !== 'ground') continue;
      const q = toRoom(it.pos); if (inRoom(q)) out.push({ ...q, r: Math.max(it.def.block.w, it.def.block.d) * 0.5 });
    }
    return out;
  },
  traceLaser() {
    const pz = this.pz2;
    const mirrors = [];
    for (const it of Object.values(this.items)) {
      const si = this.mirrorOn(it);
      if (si >= 0) mirrors.push({ u: pz.sockets[si].u, v: pz.sockets[si].v, a: it.rotY });
    }
    return traceBeam(pz.layout, mirrors, this.laserBlockers());
  },

  // ── vannes et manomètres ──
  turnValve(k, dv) {
    const v = Math.min(1, Math.max(0, (+this.valves[k] || 0) + dv));
    if (v === (+this.valves[k] || 0)) return;
    this.valves[k] = v;
    this.island2.setValve(k, v);
    this._valveAcc = (this._valveAcc || 0) + Math.abs(dv);
    if (this._valveAcc > 0.06) { this._valveAcc = 0; this.audio.ratchet(); }
    this.sendValve(k);
  },
  sendValve(k, now) {
    if (!now && this.t - (this._valveSend || 0) < 0.12) return;
    this._valveSend = this.t;
    this.act('valve', { k, v: +(+this.valves[k] || 0).toFixed(3) });
  },

  // ── fusibles ──
  nextFuse(i) {
    const order = ['red', 'blue', 'yellow'], cur = this.fuseSlots[i].fuse, pool = [...this.fuses];
    if (!pool.length) return null;
    const start = cur ? order.indexOf(cur) + 1 : 0;
    for (let k = 0; k < 3; k++) { const f = order[(start + k) % 3]; if (pool.includes(f)) return f; }
    return null;
  },
  setFuseSlot(i, f) {
    const sl = this.fuseSlots.map((s) => s.fuse);
    const wasFull = sl.every(Boolean);
    sl[i] = f;
    this.audio.clank();
    this.act('fslots', { slots: sl });
    const full = sl.every(Boolean), ok = this.fuseSlots.every((s, j) => sl[j] === this.secrets.fuses[s.key]);
    // la décharge part quand le tableau se ferme sur un mauvais montage (pas à chaque échange)
    if (full && !ok && !wasFull) {
      this.audio.spark();
      this.hp -= 8; this.lastHurt = this.t; this.ui.hurt(0.6); setTimeout(() => this.ui.hurt(0), 250);
      this.ui.toast('Court-circuit !', 'Mauvais ordre : voir l\'affiche du terminal.', 'bad', 3000);
    }
  },

  // ── radio de la tour ──
  tuneRadio(steps) {
    const r = this.pz2.radio;
    const f = Math.min(136, Math.max(118, Math.round((r.f + steps * 0.05) * 100) / 100));
    if (f !== r.f) { r.f = f; if (Math.abs(steps) > 1 || Math.random() < 0.35) this.audio.ratchet(); }
  },
  radioSignal() {
    const S = this.secrets, f = this.pz2.radio.f;
    let best = { id: null, s: 0, d: 99 };
    for (const [id, q] of [['marthe', S.radioFreq], ['meteo', S.meteoFreq], ['music', S.musicFreq]]) {
      const d = Math.abs(f - +q), s = Math.max(0, 1 - d / 0.5);
      if (s > best.s) best = { id, s, d };
    }
    return best;
  },
  radioTransmit() {
    if (!this.island2.power) { this.audio.error(); return; }
    const sig = this.radioSignal(), S = this.secrets;
    this.audio.radio();
    if (sig.id === 'marthe' && sig.d < 0.001) {
      if (this.flags.radioDone) { this.ui.radio('Je vous entends toujours ! Le plein au ponton, les roues du hangar 2, et tenez la centrale pendant la tempête.', () => this.audio.radio()); return; }
      this.act('flag', { radioDone: true });
      this.audio.success();
      this.ui.radio(`Enfin une liaison claire ! Écoutez : la météo de la tour annonce une tempête, elle arrive vite. La mer sera trop forte pour décoller sur l'eau : il vous faudra la piste, donc les roues amphibies du hangar 2. Le code : ${S.hangarCode}. Ma sœur était contrôleuse ici, c'était son code.`, () => this.audio.radio());
      this.ui.radio('Faites le plein au ponton et montez les roues. La tempête durera deux bonnes heures : dans le noir, seul le balisage de la piste vous guidera, et il tourne sur le générateur de la centrale. Et prenez les talkies de la tour : vous vous entendrez partout sur l\'île.', () => this.audio.radio());
      this.addNote(`Radio : code du hangar 2 = ${S.hangarCode}`);
    } else if (sig.id === 'meteo' && sig.d < 0.001) this.ui.toast('Balise automatique', 'Une voix enregistrée répète la météo. Personne ne répond.', '', 2600);
    else if (sig.id === 'music' && sig.d < 0.001) this.ui.toast('Radio Archipel', 'Rien qu\'une vieille station musicale en boucle.', '', 2600);
    else if (sig.s > 0.3) this.ui.toast('Presque…', 'Une voix perce les parasites : affinez le réglage (molette, <kbd>Maj</kbd>).', '', 2400);
    else { this.audio.error(); this.ui.toast('Grésillements', 'Personne sur cette fréquence.', 'bad', 1800); }
  },
  updateTowerRadio(dt, me) {
    const pz = this.pz2, R = pz.radioObj, I = this.island2;
    const d = me.distanceTo(R.pos);
    const near = d < 6 && this.mode === 'explore';
    const sig = I.power ? this.radioSignal() : { id: null, s: 0, d: 99 };
    // bouton : il tourne avec la fréquence
    R.knob.rotation.z = -(pz.radio.f - 118) * 2.2;
    if (near) {
      // texte capté : les lettres percent le bruit à mesure qu'on approche de la station
      const txt = sig.id ? STATIONS[sig.id] : '';
      const slot = Math.floor(this.t * 6), off = Math.floor(this.t * 5) % Math.max(1, txt.length);
      let line = '';
      for (let i = 0; i < 18; i++) {
        const ch = txt ? txt[(off + i) % txt.length] : ' ';
        const h = Math.abs(Math.sin((i + 1) * 12.9898 + slot * 78.233) * 43758.5453) % 1;
        line += h < Math.pow(sig.s, 1.6) ? ch : h < 0.5 ? '·' : ' ';
      }
      const bars = Math.round(sig.s * 5);
      R.lcd.draw(`${I.power}|${pz.radio.f}|${line}|${bars}`, (c, w, h) => {
        c.fillStyle = I.power ? '#0d2a24' : '#0a0c10'; c.fillRect(0, 0, w, h);
        if (!I.power) return;
        c.fillStyle = '#5ef2c2'; c.textAlign = 'left'; c.textBaseline = 'top';
        c.font = 'bold 54px monospace'; c.fillText(pz.radio.f.toFixed(2), 14, 10);
        c.font = 'bold 22px monospace'; c.fillText('MHz', 232, 38);
        for (let b = 0; b < 5; b++) { c.fillStyle = b < bars ? '#5ef2c2' : '#1d4a40'; c.fillRect(14 + b * 22, 118 - b * 6, 16, 22 + b * 6); }
        c.fillStyle = '#5ef2c2'; c.font = 'bold 20px monospace'; c.fillText(line.slice(0, 13), 128, 82); c.fillText(line.slice(13), 128, 110);
      });
      this.audio.setStatic?.(I.power ? Math.max(0.03, 0.22 * (1 - d / 6)) * (sig.id === 'music' && sig.s > 0.3 ? 0.5 : 1) : 0, sig.s);
      // la station musicale passe dans le haut-parleur
      if (sig.id === 'music' && sig.s > 0.3) { this.audio.setMusic(true, sig.s * 0.7); this._radioMus = true; }
      else if (this._radioMus) { this._radioMus = false; if (!this.music) this.audio.setMusic(false); }
      this._staticOn = true;
    } else if (this._staticOn) {
      this._staticOn = false;
      this.audio.setStatic?.(0, 0);
      if (this._radioMus) { this._radioMus = false; if (!this.music) this.audio.setMusic(false); }
    }
  },

  // ── mise à jour (chaque image, près de Saint-Escale) ──
  updatePhysPuzzles(dt) {
    this.updateBlocks();
    const pz = this.pz2;
    if (!pz || !this.inGame()) return;
    const me = this.playerWorld();
    const I = this.island2;
    const near = Math.hypot(me.x - I.cx, me.z - I.cz) < 400;
    pz.g.visible = near || this.mode === 'flight';
    if (!near) { pz.beams.forEach((b) => { b.visible = false; }); if (this._staticOn) this.updateTowerRadio(dt, me); return; }
    // laser
    const rc = pz.U(LROOM.w / 2, LROOM.d / 2);
    const nearRoom = Math.hypot(me.x - rc.x, me.z - rc.z) < 45;
    if (nearRoom) {
      const { segs, lit, end } = this.traceLaser();
      pz.beams.forEach((b, i) => {
        if (b === pz.spot) return;
        const s = segs[i];
        b.visible = !!s;
        if (!s) return;
        const a = pz.U(s[0], s[1], FLAT + LASER_Y), c = pz.U(s[2], s[3], FLAT + LASER_Y);
        b.position.copy(a).add(c).multiplyScalar(0.5);
        b.scale.z = Math.max(0.01, a.distanceTo(c));
        b.lookAt(c);
      });
      // point d'impact (mur, pilier, corps) : on voit où le faisceau s'arrête
      const last = segs[segs.length - 1];
      pz.spot.visible = !!last && end !== 'sensor';
      if (last) pz.spot.position.copy(pz.U(last[2], last[3], FLAT + LASER_Y));
      pz.charge = lit ? Math.min(1, pz.charge + dt / 0.8) : Math.max(0, pz.charge - dt * 2);
      if (pz.charge >= 1 && !this.puzzles.laser) { this.act('puzzle', { k: 'laser', v: 1 }); this.audio.success(); this.ui.toast('Capteur activé !', 'Le coffre du poste de sécurité s\'ouvre.', 'good'); }
      pz.lit = lit;
    } else pz.beams.forEach((b) => { b.visible = false; });
    pz.sensorLamp.material.color.set(this.puzzles.laser ? '#5ef2c2' : pz.lit ? (Math.sin(this.t * 20) > 0 ? '#ffd166' : '#ff9a3d') : '#552222');
    pz.safe += ((this.puzzles.laser ? 1 : 0) - pz.safe) * Math.min(1, dt * 2);
    pz.safeDoor.rotation.y = -pz.safe * 1.7;
    pz.sockets.forEach((s) => { s.mesh.material.opacity = 0.35 + 0.25 * Math.sin(this.t * 3); });
    // plaques de pression
    const bodies = [me, ...this.mateList().filter((m) => !m.aboard).map((m) => m.pos)];
    let all = true;
    pz.plates.forEach((p) => {
      let on = bodies.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 0.9 && Math.abs(b.y - FLAT - 0.2) < 0.9);
      if (!on) for (const it of Object.values(this.items)) if (it.def.block && !it.def.mirror && it.state === 'ground' && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < 0.95) { on = true; break; }
      if (on !== p.on) { p.on = on; this.audio.clank(); }
      p.top.position.y = on ? 0.08 : 0.14;
      p.lamp.material.color.set(on ? '#5ef2c2' : '#ff4d4d');
      if (!on) all = false;
    });
    const wantCage = all || !this.fuseMeshes.yellow.visible ? 1 : 0;
    if (wantCage && pz.cage < 0.05) this.audio.powerUp?.();
    pz.cage += (wantCage - pz.cage) * Math.min(1, dt * 3);
    pz.cageDoor.position.y = pz.cage * 2.3;
    pz.cageCol.disabled = pz.cage > 0.7;
    // purge : les aiguilles suivent les vannes avec un temps de retard
    const VS = this.secrets.valves, want = valvePressure(VS, this.valves), done = !!this.puzzles.pipes;
    let inBand = 0;
    pz.gauges.forEach((gq, j) => {
      const target = done ? VS.target[j] : want[j];
      pz.press[j] += (target - pz.press[j]) * Math.min(1, dt * 1.6);
      const p = Math.min(1.25, pz.press[j] + Math.sin(this.t * 23 + j * 2) * 0.004);
      gq.needle.rotation.z = -((-135 + (p / 1.2) * 270) * Math.PI / 180);
      const ok = Math.abs(pz.press[j] - VS.target[j]) < VS.band;
      if (ok) inBand++;
      gq.lamp.material.color.set(done || ok ? '#5ef2c2' : pz.press[j] > 1.0 ? (Math.sin(this.t * 16) > 0 ? '#ff3030' : '#552222') : '#552222');
    });
    const dv = me.distanceTo(I.points.valvesMid);
    if (!done && dv < 30) {
      pz.green = inBand === 3 ? pz.green + dt : 0;
      if (pz.press.some((p) => p > 1.0)) {
        this._overT = (this._overT || 0) - dt;
        if (this._overT <= 0) { this._overT = 1.6; this.audio.hiss(); if (!this.said.has('overpress')) { this.said.add('overpress'); this.ui.toast('Surpression !', 'Une aiguille est dans le rouge : ouvrez un peu la vidange (A) ou fermez une arrivée.', 'bad', 3500); } }
      }
      if (pz.green > 2.5) {
        pz.green = 0;
        this.act('puzzle', { k: 'pipes', v: 1 });
        this.audio.powerUp(); this.audio.hiss();
        this.ui.toast('Circuit purgé', 'La pression est stable : la pompe du ponton est prête.', 'good', 4500);
        this.addNote('Circuit de carburant purgé (vannes du dépôt) : la pompe du ponton est prête');
      }
    }
    // radio de la tour et clavier du hangar
    this.updateTowerRadio(dt, me);
    const kp = pz.hangarKp;
    kp.state.power = I.power || this.flags.hangarOpen;
    if (this.flags.hangarOpen) kp.state.msg = 'OUVERT';
    kp.update(dt);
  },

  // interactions des énigmes (dehors) : ce qui ne se vise pas pièce par pièce
  physInteractions(add, me) {
    const pz = this.pz2;
    if (!pz) return;
    // poser un miroir porté sur un socle libre
    if (this.carrying && this.carrying.def.mirror) {
      pz.sockets.forEach((s) => {
        const busy = Object.values(this.items).some((it) => it.def.mirror && it.state === 'ground' && Math.hypot(s.pos.x - it.pos.x, s.pos.z - it.pos.z) < 0.35);
        if (!busy) add(s.pos.clone().setY(s.pos.y + 0.6), 2.2, { prio: 3, prompt: '<kbd>E</kbd> poser le miroir sur le socle', press: () => { const it = this.carrying; this.act('drop', { id: it.id, x: s.pos.x, z: s.pos.z, y: s.pos.y, r: this.playerYawWorld() }); this.carrying = null; this.audio.clank(); } });
      });
    }
    const em = pz.layout.emitter;
    add(pz.U(em.u + 0.3, em.v, FLAT + 1), 2.2, { prompt: '<kbd>E</kbd> examiner l\'émetteur laser', press: () => this.openNote('Émetteur laser', 'Barrière de sécurité, sur batterie.<br>Le faisceau part droit devant, vers l\'est.<br>Posez les miroirs sur les socles lumineux, puis orientez-les à la main : visez un miroir, <kbd>E</kbd> maintenu et bougez la souris (<kbd>Maj</kbd> : très fin, molette : demi-degré).<br>Le capteur doit rester éclairé un instant. Attention : un corps coupe le faisceau.', 'Poste de sécurité : guider le laser jusqu\'au capteur avec 2 miroirs orientés à la main (un dans la salle, un au terminal)') });
    if (this.fuseMeshes.blue.visible && !this.puzzles.laser) add(this.island2.points.fuseBlue, 2.0, { prompt: '<span class="warn">Coffre verrouillé : il s\'ouvre quand le laser touche le capteur</span>' });
    if (this.fuseMeshes.yellow.visible && pz.cage < 0.7) add(this.island2.points.cage.clone().add(new THREE.Vector3(0, 0, -1.6)), 2.6, { prompt: `<span class="warn">Porte à double commande · pédales : ${pz.plates.filter((p) => p.on).length}/2 enfoncées</span>` });
    if (!this.puzzles.pipes) add(this.island2.points.valvesMid, 3.2, { prompt: 'Purge : visez un volant de vanne (<kbd>E</kbd> maintenu + souris) et amenez les trois aiguilles dans le vert' });
  },
};
