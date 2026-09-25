// Le vol HX-404 : un long-courrier low poly, praticable à l'intérieur.
// Cabine habillée (coffres à bagages, sièges, galley, toilettes), poste de pilotage surélevé et vitré,
// toboggan d'évacuation à la porte avant gauche.
// Repère local : origine = train avant au sol, nez vers -z. Plancher de cabine à y = FLOOR_B, cockpit à FLOOR_C.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prep, flatMat, textTexture } from './terrain.js';

export const FLOOR_B = 4.4;
export const FLOOR_C = 4.9;          // poste de pilotage : une marche de 50 cm
const Y = 5.2, R = 2.9, NOSE = 6.2;   // axe du fuselage, rayon, longueur du nez
export const BOEING = {
  door: new THREE.Vector3(-3.25, FLOOR_B, 3.6),        // palier extérieur de la porte avant gauche
  doorIn: new THREE.Vector3(-1.4, FLOOR_B, 3.6),
  cargo: new THREE.Vector3(3.7, 2.9, 33),               // porte de soute (arrière droite)
  hatch: new THREE.Vector3(0.9, 1.6, 2.6),              // trappe avionique (batterie)
  fuel: new THREE.Vector3(8.5, 1.2, 21),                // bouche de remplissage sous l'aile droite
  cockpit: new THREE.Vector3(-0.55, FLOOR_B, -2.2),     // siège du commandant
  nose: new THREE.Vector3(0, 0.6, 0),                   // barre de tractage (train avant)
  pivot: new THREE.Vector3(0, 0, 22),                   // train principal : pivot au sol et en vol
  wheelbase: 22,
  cabin: { minX: -2.35, maxX: 2.35, minZ: -3.3, maxZ: 43.5 },
};
// toboggan d'évacuation (porte avant gauche) : du seuil jusqu'au sol, le long de -x
export const SLIDE = { x0: -2.95, x1: -10.2, z0: 2.8, z1: 4.4, y0: FLOOR_B - 0.08, y1: 0.12, steps: 14 };
// places pendant le vol : pilote, copilote, puis passagers (classe affaires, côté hublot d'abord)
export const BSEATS = [
  { x: -0.55, y: FLOOR_C, z: -2.0, cush: FLOOR_C + 0.52, pilot: true },
  { x: 0.55, y: FLOOR_C, z: -2.0, cush: FLOOR_C + 0.52 },
  { x: -1.8, y: FLOOR_B, z: 5.9, cush: FLOOR_B + 0.56 },
  { x: 1.8, y: FLOOR_B, z: 5.9, cush: FLOOR_B + 0.56 },
  { x: -1.8, y: FLOOR_B, z: 7.3, cush: FLOOR_B + 0.56 },
  { x: 1.8, y: FLOOR_B, z: 7.3, cush: FLOOR_B + 0.56 },
];

function tg(geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = prep(geo, col);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
const B = (w, h, d, col, x, y, z, rx, ry, rz) => tg(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz);
const C = (rt, rb, h, seg, col, x, y, z, rx, ry, rz) => tg(new THREE.CylinderGeometry(rt, rb, h, seg), col, x, y, z, rx, ry, rz);
// barre fine entre deux points (cadres des vitres)
function rod(a, b, t, col) {
  const len = a.distanceTo(b);
  const g = prep(new THREE.BoxGeometry(t, t, len), col);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

// profil du fuselage : nez en ogive (qui plonge un peu), cylindre, queue relevée
const noseU = (z) => Math.min(1, Math.max(0, -z / NOSE));
const noseR = (z) => R * Math.sqrt(Math.max(0, 1 - Math.pow(noseU(z), 1.6)));
const noseY = (z) => Y - 0.9 * noseU(z) ** 2;
const tailT = (z) => Math.min(1, Math.max(0, (z - 44) / 10));
const tailR = (z) => R - (R - 0.9) * Math.pow(tailT(z), 1.15);
const tailY = (z) => Y + 1.8 * tailT(z);
function ring(z, k = 1) {
  if (z < 0) return { z, r: noseR(z) * k, y: noseY(z) };
  if (z > 44) return { z, r: tailR(z) * k, y: tailY(z) };
  return { z, r: R * k, y: Y };
}
// point de la coque (θ en degrés, depuis le haut, positif vers +x)
function hullPt(z, th, k = 1.004) {
  const g = ring(z, k), a = th * Math.PI / 180;
  return new THREE.Vector3(g.r * Math.sin(a), g.y + g.r * Math.cos(a), z);
}
// surface de révolution par anneaux ; classify(θ°, z) → couleur | 'glass' | 'skip'
function loft(rings, cols, classify) {
  const op = { p: [], c: [] }, gl = { p: [], c: [] };
  const col = new THREE.Color();
  const P = (g, th) => [g.r * Math.sin(th), g.y + g.r * Math.cos(th), g.z];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let j = 0; j < cols; j++) {
      const t0 = -Math.PI + (j / cols) * Math.PI * 2, t1 = t0 + (Math.PI * 2) / cols;
      const k = classify(((t0 + t1) / 2) * 180 / Math.PI, (a.z + b.z) / 2, (a.y + b.y) / 2 + ((a.r + b.r) / 2) * Math.cos((t0 + t1) / 2));
      if (k === 'skip') continue;
      const bucket = k === 'glass' ? gl : op;
      col.set(k === 'glass' ? '#9fd6e8' : k);
      for (const q of [P(a, t0), P(b, t0), P(b, t1), P(a, t0), P(b, t1), P(a, t1)]) { bucket.p.push(...q); bucket.c.push(col.r, col.g, col.b); }
    }
  }
  const make = (s) => {
    if (!s.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.c, 3));
    g.computeVertexNormals();
    return g;
  };
  return { opaque: make(op), glass: make(gl) };
}
const WIN_FRONT = (th, z) => z > -5.7 && z < -3.6 && Math.abs(th) < 56.25;
const WIN_SIDE = (th, z) => z > -3.3 && z < -1.8 && Math.abs(th) > 56.25 && Math.abs(th) < 90;
const DOOR_L = (th, z) => z > 3.0 && z < 4.2 && th < -67.5 && th > -101.25;

// aile en flèche : boîte déformée (corde qui diminue, flèche, dièdre)
function wing(side, span, root, tip, sweep, y, z, col) {
  const g = new THREE.BoxGeometry(span, 0.45, root, 8, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / span + 0.5;             // 0 à l'emplanture, 1 au saumon
    const k = 1 - (1 - tip / root) * t;
    p.setZ(i, p.getZ(i) * k + t * sweep);
    p.setY(i, p.getY(i) * (1 - 0.5 * t) + t * 1.4);
    p.setX(i, side * (p.getX(i) + span / 2));
  }
  return tg(g, col, 0, y, z);
}

// écrans du poste (horizon artificiel, cap, moteurs, navigation) : redessinés pendant le vol
function drawDisplays(g, W, H, s) {
  g.fillStyle = '#06080c'; g.fillRect(0, 0, W, H);
  if (!s.power) { g.fillStyle = '#14181f'; for (let i = 0; i < 4; i++) g.fillRect(i * W / 4 + 6, 6, W / 4 - 12, H - 12); return; }
  const w = W / 4, pad = 6;
  // 1. horizon artificiel
  g.save(); g.beginPath(); g.rect(pad, pad, w - pad * 2, H - pad * 2); g.clip();
  g.translate(w / 2, H / 2); g.rotate(-s.roll); g.translate(0, s.pitch * 90);
  g.fillStyle = '#2f7fd6'; g.fillRect(-w, -H * 1.5, w * 2, H * 1.5);
  g.fillStyle = '#8a5a2e'; g.fillRect(-w, 0, w * 2, H * 1.5);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-w, 0); g.lineTo(w, 0); g.stroke();
  for (const k of [-2, -1, 1, 2]) { g.beginPath(); g.moveTo(-14, k * 16); g.lineTo(14, k * 16); g.stroke(); }
  g.restore();
  g.strokeStyle = '#ffd166'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2 - 30, H / 2); g.lineTo(w / 2 - 10, H / 2); g.moveTo(w / 2 + 10, H / 2); g.lineTo(w / 2 + 30, H / 2); g.stroke();
  g.font = 'bold 15px monospace'; g.fillStyle = '#5ef2c2'; g.textAlign = 'left';
  g.fillText(`${Math.round(s.speed * 3.6)}`, pad + 4, 22); g.textAlign = 'right'; g.fillText(`${Math.round(s.alt)}`, w - pad - 4, 22);
  // 2. cap (rose des vents)
  const cx = w * 1.5, cy = H * 0.62;
  g.strokeStyle = '#e9e4d8'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 44, Math.PI, 0); g.stroke();
  for (let a = 0; a < 360; a += 30) { const t = (a - s.heading) * Math.PI / 180 - Math.PI / 2; if (Math.sin(t) > 0.1) continue; g.beginPath(); g.moveTo(cx + Math.cos(t) * 44, cy + Math.sin(t) * 44); g.lineTo(cx + Math.cos(t) * 36, cy + Math.sin(t) * 36); g.stroke(); }
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = 'bold 18px monospace'; g.fillText(`${String(Math.round(s.heading) % 360).padStart(3, '0')}°`, cx, 26);
  if (s.target !== null && s.target !== undefined) { const t = (s.target - s.heading) * Math.PI / 180 - Math.PI / 2; g.strokeStyle = '#ff5ad6'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * 40, cy + Math.sin(t) * 40); g.stroke(); }
  g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 6, cy + 6); g.lineTo(cx - 6, cy + 6); g.fill();
  // 3. moteurs (N1)
  for (const k of [0, 1]) {
    const ex = w * 2 + w * (0.3 + 0.4 * k), ey = H * 0.55;
    g.strokeStyle = '#3a3f48'; g.lineWidth = 6; g.beginPath(); g.arc(ex, ey, 22, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    g.strokeStyle = s.throttle > 0.9 ? '#ffd166' : '#5ef2c2'; g.beginPath(); g.arc(ex, ey, 22, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * s.throttle)); g.stroke();
    g.fillStyle = '#e9e4d8'; g.font = 'bold 12px monospace'; g.fillText(`${Math.round(20 + s.throttle * 80)}`, ex, ey + 5);
  }
  g.fillStyle = '#5ef2c2'; g.font = 'bold 12px monospace'; g.fillText('N1', w * 2.5, H - 14);
  // 4. navigation : destination et distance
  g.textAlign = 'left'; g.fillStyle = '#ff5ad6'; g.font = 'bold 15px monospace'; g.fillText(s.dest || 'HÉLIOS', w * 3 + 12, 30);
  g.fillStyle = '#e9e4d8'; g.font = 'bold 14px monospace'; g.fillText(s.dist !== undefined ? `${(s.dist / 1000).toFixed(1)} km` : '--', w * 3 + 12, 56);
  g.fillStyle = s.onGround ? '#5ef2c2' : '#ffd166'; g.fillText(s.onGround ? 'SOL' : 'EN VOL', w * 3 + 12, 82);
  g.fillStyle = '#6fb7ff'; g.fillText('HX-404', w * 3 + 12, 108);
  g.strokeStyle = '#23272e'; g.lineWidth = 4; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, H); g.stroke(); }
}

export function buildBoeing() {
  const root = new THREE.Group();
  const WH = '#f4f3ee', CO = '#ff6b5b', TE = '#1f8a8a', GR = '#9aa0a8', DK = '#2a2f38';
  const parts = [], glow = [];

  // ── coque : nez vitré, cylindre (porte avant découpée), queue relevée ──
  const zs = [];
  for (let z = 0; z > -6.05; z -= 0.3) zs.push(Math.round(z * 100) / 100);
  const noseRings = zs.map((z) => ring(z)).concat([{ z: -NOSE, r: 0, y: noseY(-NOSE) }]).reverse();
  const tailRings = [];
  for (let z = 44; z <= 54; z += 1) tailRings.push(ring(z));
  tailRings.push({ z: 54.35, r: 0.35, y: tailY(54) }, { z: 54.5, r: 0, y: tailY(54) });
  const bodyRings = [0, 1.2, 3.0, 4.2, 44].map((z) => ring(z));
  const rings = noseRings.concat(bodyRings.slice(1), tailRings.slice(1));
  const shellL = loft(rings, 32, (th, z) => {
    if (WIN_FRONT(th, z) || WIN_SIDE(th, z)) return 'glass';
    if (DOOR_L(th, z)) return 'skip';
    if (z < -5.9) return '#c9ced6';          // radôme
    if (Math.abs(th) > 112.5) return '#dfe3e8';   // ventre
    return WH;
  });
  const shell = new THREE.Mesh(shellL.opaque, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  shell.castShadow = true; shell.receiveShadow = true;
  root.add(shell);
  const glass = new THREE.Mesh(shellL.glass, new THREE.MeshLambertMaterial({ color: '#7fb8d0', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  glass.renderOrder = 2;
  root.add(glass);
  // cadres du pare-brise et des vitres latérales
  const FR = '#23272e';
  const alongZ = (th, z0, z1) => { for (let z = z0; z > z1 + 0.01; z -= 0.3) parts.push(rod(hullPt(z, th), hullPt(Math.max(z1, z - 0.3), th), 0.09, FR)); };
  const alongT = (z, t0, t1) => { for (let t = t0; t < t1 - 0.01; t += 5.625) parts.push(rod(hullPt(z, t), hullPt(z, Math.min(t1, t + 5.625)), 0.09, FR)); };
  for (const th of [-56.25, -33.75, 0, 33.75, 56.25]) alongZ(th, -3.6, -5.7);
  for (const z of [-3.6, -4.5, -5.7]) alongT(z, -56.25, 56.25);
  for (const s of [-1, 1]) {
    for (const th of [56.25, 90]) alongZ(s * th, -1.8, -3.3);
    for (const z of [-1.8, -2.55, -3.3]) alongT(z, s < 0 ? -90 : 56.25, s < 0 ? -56.25 : 90);
  }
  // encadrement de la porte avant gauche
  for (const z of [3.0, 4.2]) alongT(z, -101.25, -67.5);
  for (const th of [-67.5, -101.25]) parts.push(rod(hullPt(3.0, th), hullPt(4.2, th), 0.1, GR));
  // livrée : bande corail + bande turquoise, sous les hublots
  for (const sx of [-1, 1]) { parts.push(B(0.06, 0.35, 44, CO, sx * 2.9, Y + 0.3, 22)); parts.push(B(0.06, 0.16, 44, TE, sx * 2.91, Y - 0.05, 22)); }
  // hublots (vus de l'extérieur)
  for (let z = 5; z < 43; z += 1.1) for (const s of [-1, 1]) parts.push(B(0.06, 0.42, 0.3, DK, s * 2.77, Y + 0.9, z));
  // ailes, moteurs, empennage
  for (const s of [-1, 1]) {
    parts.push(wing(s, 26, 9, 2.4, 13, Y - 1.6, 20, WH));
    parts.push(C(1.5, 1.35, 6.2, 12, GR, s * 10.5, Y - 3.0, 20.4, Math.PI / 2, 0, 0));
    parts.push(C(1.2, 1.2, 0.3, 12, DK, s * 10.5, Y - 3.0, 17.25, Math.PI / 2, 0, 0));
    parts.push(C(0.35, 0.05, 0.6, 8, '#c9ced6', s * 10.5, Y - 3.0, 17.1, -Math.PI / 2, 0, 0));   // cône d'entrée
    parts.push(B(0.4, 1.7, 4.0, GR, s * 10.5, Y - 1.75, 21.6));
    parts.push(C(1.52, 1.52, 0.6, 12, CO, s * 10.5, Y - 3.0, 18.1, Math.PI / 2, 0, 0));
    const hs = new THREE.BoxGeometry(10, 0.3, 4.5); const p = hs.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getX(i) / 10 + 0.5; p.setZ(i, p.getZ(i) * (1 - 0.5 * t) + t * 3.2); p.setX(i, s * (p.getX(i) + 5)); }
    parts.push(tg(hs, WH, 0, Y + 1.2, 49.5));
    // feux de navigation (rouge à gauche, vert à droite) et phares d'atterrissage
    glow.push(B(0.3, 0.3, 0.3, s < 0 ? '#ff3030' : '#3dff7a', s * 26, Y - 0.2, 33.2));
    glow.push(B(0.35, 0.2, 0.08, '#fff6d8', s * 4.2, Y - 1.45, 16.35));
  }
  const fin = new THREE.BoxGeometry(0.5, 10, 7); { const p = fin.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 10 + 0.5; p.setZ(i, p.getZ(i) * (1 - 0.55 * t) + t * 5); } }
  parts.push(tg(fin, TE, 0, Y + 6.5, 49));
  parts.push(B(0.55, 1.4, 3.2, CO, 0, Y + 9.4, 52.3));
  // trains d'atterrissage
  parts.push(C(0.14, 0.14, Y - 2.6, 8, GR, 0, (Y - 2.6) / 2 + 0.4, 0));
  for (const s of [-1, 1]) parts.push(C(0.42, 0.42, 0.3, 12, DK, s * 0.3, 0.42, 0, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    parts.push(C(0.22, 0.22, Y - 2.2, 8, GR, s * 4, (Y - 2.2) / 2 + 0.6, 22));
    for (const dz of [-0.8, 0.8]) for (const dx of [-0.45, 0.45]) parts.push(C(0.6, 0.6, 0.4, 12, DK, s * 4 + dx, 0.6, 22 + dz, 0, 0, Math.PI / 2));
  }
  // porte de soute (cadre), trappe avionique, bouche de carburant
  parts.push(B(0.08, 1.9, 2.8, GR, R + 0.03, 3.8, 33));
  parts.push(B(0.9, 0.06, 0.9, GR, 0.9, Y - R + 0.05, 2.6));
  parts.push(B(0.5, 0.2, 0.5, '#ffd166', 8.5, 2.2, 21));

  // ── habillage intérieur ──
  // cabine : parois crème, soubassement plus foncé, ciel clair ; ouverture de la porte avant gauche
  const lining = loft([1.2, 3.0, 4.2, 43.6].map((z) => ({ z, r: 2.82, y: Y })), 48, (th, z) => {
    const a = Math.abs(th);
    if (a > 106 || (z > 3.0 && z < 4.2 && th < -67.5 && th > -105)) return 'skip';
    return a < 30 ? '#f4efe6' : a < 84 ? '#ece4d6' : '#cdbfa9';
  }).opaque;
  // poste de pilotage : parois sombres, vitres laissées libres
  const ckRings = [1.2].concat(zs.filter((z) => z >= -3.6)).map((z) => ring(z, 0.965));
  const ckLining = loft(ckRings, 32, (th, z, y) => {
    if (WIN_FRONT(th, z) || WIN_SIDE(th, z) || y < FLOOR_B - 0.05) return 'skip';
    return Math.abs(th) < 40 ? '#5d6470' : '#3d434d';
  }).opaque;
  const inner = new THREE.Mesh(mergeGeometries([lining, ckLining]), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  inner.receiveShadow = true;
  root.add(inner);
  // cloisons : poste de pilotage (porte au centre) et cloison pressurisée arrière
  const bulk = new THREE.Shape(); bulk.absarc(0, 0, 2.84, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.moveTo(-0.6, FLOOR_B - Y); hole.lineTo(0.6, FLOOR_B - Y); hole.lineTo(0.6, 6.55 - Y); hole.lineTo(-0.6, 6.55 - Y); hole.closePath();
  bulk.holes.push(hole);
  parts.push(tg(new THREE.ExtrudeGeometry(bulk, { depth: 0.1, bevelEnabled: false, curveSegments: 20 }), '#d6cfc0', 0, Y, 1.15));
  parts.push(tg(new THREE.CircleGeometry(2.84, 20), '#d6cfc0', 0, Y, 43.62, 0, Math.PI, 0));
  parts.push(B(0.06, 2.1, 1.1, '#bdb5a6', -0.64, FLOOR_B + 1.05, 0.6));        // porte du poste, ouverte
  parts.push(B(1.3, 0.12, 0.14, '#ffd166', 0, 6.62, 1.1));                     // linteau
  // planchers : cabine, vestibule, estrade du poste (bord jaune)
  parts.push(B(4.8, 0.2, 42.4, '#4a515c', 0, 4.3, 22.4));
  parts.push(B(4.6, 0.2, 2.1, '#3d434d', 0, 4.3, 0.2));
  parts.push(B(4.3, 0.7, 2.6, '#2f343c', 0, FLOOR_C - 0.35, -2.1));
  parts.push(B(4.2, 0.04, 0.1, '#ffd166', 0, FLOOR_C + 0.01, -0.83));
  // moquette de l'allée (corail, liserés dorés)
  parts.push(B(0.9, 0.02, 32.4, '#c8553d', 0, 4.41, 27.4));
  for (const s of [-1, 1]) parts.push(B(0.05, 0.022, 32.4, '#ffd166', s * 0.42, 4.412, 27.4));
  parts.push(B(1.6, 0.02, 2.3, '#233b5c', -1.2, 4.41, 3.6));                   // tapis du vestibule

  // ── poste de pilotage ──
  const PNL = '#23272e', SEATC = '#3a3f48';
  parts.push(B(2.7, 0.75, 0.3, PNL, 0, 5.4, -3.4, -0.3));                      // planche de bord
  parts.push(B(2.8, 0.14, 0.55, '#1b1e23', 0, 5.86, -3.5));                    // auvent anti-reflets
  parts.push(B(0.55, 0.6, 1.25, '#2b2f36', 0, FLOOR_C + 0.3, -2.45));          // pylône central
  parts.push(B(0.5, 0.04, 1.1, '#1b1e23', 0, FLOOR_C + 0.62, -2.45));
  for (const s of [-1, 1]) {
    parts.push(B(0.42, 0.55, 1.6, '#2b2f36', s * 1.55, FLOOR_C + 0.28, -2.3));  // consoles latérales
    parts.push(B(0.3, 0.3, 0.22, '#1b1e23', s * 1.5, FLOOR_C + 0.62, -2.6));    // tablette
    // sièges pilotes : peau de mouton, appuie-tête, accoudoirs
    const sx = s * 0.55;
    parts.push(B(0.46, 0.3, 0.46, '#2b2f36', sx, FLOOR_C + 0.15, -1.98));
    parts.push(B(0.58, 0.14, 0.58, SEATC, sx, FLOOR_C + 0.44, -2.0));
    parts.push(B(0.6, 0.95, 0.16, SEATC, sx, FLOOR_C + 0.98, -1.68, 0.12));
    parts.push(B(0.46, 0.7, 0.05, '#efe6d2', sx, FLOOR_C + 0.98, -1.77, 0.12));
    parts.push(B(0.36, 0.22, 0.16, SEATC, sx, FLOOR_C + 1.56, -1.6, 0.12));
    for (const ax of [-0.34, 0.34]) parts.push(B(0.07, 0.07, 0.46, '#23272e', sx + ax, FLOOR_C + 0.74, -1.95));
    parts.push(B(0.36, 0.05, 0.2, '#15181d', sx, FLOOR_C + 0.12, -2.95, -0.4));   // palonnier
  }
  parts.push(B(1.5, 0.12, 1.3, '#2b2f36', 0, 7.35, -2.3, 0.2));                 // panneau plafond
  parts.push(B(0.5, 1.0, 0.5, '#3a3f48', 1.9, FLOOR_B + 0.5, 0.5));             // strapontin et coffre
  // voyants du poste
  for (let i = 0; i < 14; i++) glow.push(B(0.05, 0.03, 0.05, ['#5ef2c2', '#ffd166', '#ff6b5b', '#6fb7ff'][i % 4], -0.6 + (i % 7) * 0.2, 7.29 - Math.floor(i / 7) * 0.02, -2.6 + Math.floor(i / 7) * 0.5));
  for (let i = 0; i < 6; i++) glow.push(B(0.04, 0.04, 0.04, i % 2 ? '#5ef2c2' : '#ffd166', -0.1 + (i % 3) * 0.1, FLOOR_C + 0.65, -2.8 + Math.floor(i / 3) * 0.3));

  // ── galley (avant droit) et vestibule de la porte ──
  parts.push(B(1.5, 1.0, 3.1, '#c9ccd2', 1.55, FLOOR_B + 0.5, 3.0));
  parts.push(B(1.56, 0.05, 3.16, '#8d9299', 1.55, FLOOR_B + 1.02, 3.0));
  parts.push(B(0.9, 0.7, 3.1, '#e9e4d8', 1.75, 6.55, 3.0));
  for (const z of [1.9, 2.6, 3.3]) parts.push(B(0.04, 0.55, 0.6, '#8d9299', 0.79, FLOOR_B + 0.5, z));   // fours
  for (const z of [4.0]) { parts.push(B(0.05, 0.9, 0.55, '#dfe3e8', 0.78, FLOOR_B + 0.48, z)); parts.push(B(0.052, 0.1, 0.55, CO, 0.78, FLOOR_B + 0.7, z)); }  // chariot
  parts.push(B(0.3, 0.4, 0.3, '#33373f', 1.2, FLOOR_B + 1.25, 2.1));            // machine à café
  glow.push(B(0.02, 0.08, 0.14, '#5ef2c2', 1.04, FLOOR_B + 1.3, 2.1));
  glow.push(B(0.5, 0.12, 0.02, '#3dff7a', -1.2, 6.62, 2.95));                   // SORTIE
  // ── classe affaires (2-2), cloison, classe économique (3-3) ──
  const BUS = '#233b5c', ECO = '#1f8a8a', EXIT = '#c8553d', CREAM = '#fff4e0', FRM = '#2b2f36', LEG = '#8d9299';
  for (const z of [5.9, 7.3, 8.7, 10.1]) for (const s of [-1, 1]) {
    for (const x of [0.95, 1.8]) {
      const sx = s * x;
      parts.push(B(0.6, 0.34, 0.56, FRM, sx, FLOOR_B + 0.17, z));
      parts.push(B(0.74, 0.16, 0.7, BUS, sx, FLOOR_B + 0.44, z - 0.02));
      parts.push(B(0.74, 1.02, 0.17, BUS, sx, FLOOR_B + 1.02, z + 0.34, 0.1));
      parts.push(B(0.52, 0.22, 0.18, CREAM, sx, FLOOR_B + 1.44, z + 0.39, 0.1));
      glow.push(B(0.3, 0.2, 0.02, '#6fb7ff', sx, FLOOR_B + 1.05, z + 0.44, 0.1));   // écran
    }
    parts.push(B(0.14, 0.16, 0.62, FRM, s * 1.375, FLOOR_B + 0.64, z));          // console entre les deux
    parts.push(B(0.12, 0.14, 0.6, FRM, s * 0.54, FLOOR_B + 0.62, z));
    parts.push(B(0.12, 0.14, 0.6, FRM, s * 2.22, FLOOR_B + 0.62, z));
  }
  for (const s of [-1, 1]) {
    parts.push(B(1.75, 1.3, 0.08, '#d6cfc0', s * 1.48, FLOOR_B + 0.65, 11.15));  // cloison basse
    parts.push(B(1.75, 0.9, 0.03, BUS, s * 1.48, FLOOR_B + 1.75, 11.15));        // rideau
  }
  let row = 0;
  for (let z = 12.3; z < 41.7; z += 1.05, row++) {
    const col = row === 11 || row === 12 ? EXIT : ECO;
    for (const s of [-1, 1]) {
      parts.push(B(1.9, 0.08, 0.5, FRM, s * 1.46, FLOOR_B + 0.38, z));
      for (const lx of [0.72, 2.2]) parts.push(B(0.06, 0.36, 0.42, LEG, s * lx, FLOOR_B + 0.18, z));
      for (const x of [0.83, 1.46, 2.09]) {
        const sx = s * x;
        parts.push(B(0.58, 0.13, 0.5, col, sx, FLOOR_B + 0.49, z - 0.02));
        parts.push(B(0.58, 0.8, 0.12, col, sx, FLOOR_B + 0.95, z + 0.28, 0.12));
        parts.push(B(0.42, 0.18, 0.13, CREAM, sx, FLOOR_B + 1.3, z + 0.34, 0.12));
        glow.push(B(0.2, 0.14, 0.02, '#4a8fd6', sx, FLOOR_B + 1.02, z + 0.35, 0.12));
      }
      for (const ax of [0.53, 1.145, 1.775, 2.4]) parts.push(B(0.05, 0.07, 0.42, FRM, s * ax, FLOOR_B + 0.68, z));
    }
  }
  // toilettes (arrière), portes et voyants
  for (const s of [-1, 1]) {
    parts.push(B(1.7, 2.3, 1.3, '#e9e4d8', s * 1.5, FLOOR_B + 1.15, 42.85));
    parts.push(B(0.03, 1.9, 0.8, '#d6cfc0', s * 0.64, FLOOR_B + 0.98, 42.85));
    glow.push(B(0.02, 0.1, 0.24, s < 0 ? '#3dff7a' : '#ff6b5b', s * 0.62, FLOOR_B + 2.05, 42.85));
  }
  // coffres à bagages, blocs passagers (lampes de lecture), ciel lumineux
  // profil des coffres : dessous plat, dos qui épouse la paroi (rayon 2,8 m)
  const binShape = (s) => {
    const sh = new THREE.Shape();
    const a0 = Math.acos((6.94 - Y) / 2.8), a1 = Math.asin(1.2 / 2.8);
    sh.moveTo(s * 1.2, 6.94);
    for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; sh.lineTo(s * 2.8 * Math.sin(a), Y + 2.8 * Math.cos(a)); }
    sh.lineTo(s * 1.2, 6.94);
    return sh;
  };
  const bins = [binShape(-1), binShape(1)];
  for (let z = 5.0; z < 41.5; z += 2.2) {
    for (const s of [-1, 1]) {
      parts.push(tg(new THREE.ExtrudeGeometry(bins[s < 0 ? 0 : 1], { depth: 2.12, bevelEnabled: false }), '#f1ece2', 0, 0, z + 0.04));
      parts.push(B(0.97, 0.05, 2.14, '#cfc6b6', s * 1.7, 6.93, z + 1.1));
      parts.push(B(0.03, 0.05, 0.3, '#8d9299', s * 1.19, 7.02, z + 1.1));
      parts.push(B(0.9, 0.04, 2.1, '#dcd6cb', s * 1.7, 6.88, z + 1.1));
    }
  }
  for (let z = 5.9; z < 41.7; z += 1.05) for (const s of [-1, 1]) for (const x of [1.4, 2.0]) glow.push(B(0.06, 0.02, 0.06, '#fff1c8', s * x, 6.855, z - 0.1));
  glow.push(B(0.45, 0.03, 38.5, '#fff6e2', 0, 7.97, 24.1));
  for (const s of [-1, 1]) glow.push(B(0.05, 0.05, 37, '#ffd9a0', s * 1.14, 7.7, 23.5));
  // hublots (vus de l'intérieur) : encadrement et vitre (couleur du ciel)
  const panes = [];
  for (let z = 5; z < 42.2; z += 1.1) for (const s of [-1, 1]) {
    const th = s * 71.4 * Math.PI / 180, nx = Math.sin(th), ny = Math.cos(th);
    const px = 2.82 * nx, py = Y + 2.82 * ny, rz = Math.atan2(ny, nx);
    parts.push(B(0.05, 0.62, 0.46, '#fbf8f2', px - nx * 0.02, py - ny * 0.02, z, 0, 0, rz));
    panes.push(B(0.02, 0.42, 0.28, '#ffffff', px - nx * 0.05, py - ny * 0.05, z, 0, 0, rz));
    if ((Math.round(z * 10) + (s > 0 ? 3 : 0)) % 7 === 0) parts.push(B(0.025, 0.22, 0.3, '#e0d8c8', px - nx * 0.065, py + 0.1 - ny * 0.065, z, 0, 0, rz));  // volet à moitié baissé
  }
  const paneMat = new THREE.MeshBasicMaterial({ color: '#cfeaff', toneMapped: false });
  root.add(new THREE.Mesh(mergeGeometries(panes), paneMat));

  const merged = new THREE.Mesh(mergeGeometries(parts), flatMat);
  merged.castShadow = true; merged.receiveShadow = true;
  root.add(merged);
  root.add(new THREE.Mesh(mergeGeometries(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // ── éléments animés du poste : manches, manettes des gaz, écrans ──
  const yokes = [];
  for (const s of [-1, 1]) {
    const col = new THREE.Group(); col.position.set(s * 0.55, FLOOR_C, -2.85); root.add(col);
    col.add(new THREE.Mesh(tg(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 6), '#15181d', 0, 0.31, 0), flatMat));
    const horn = new THREE.Group(); horn.position.set(0, 0.64, 0.02); col.add(horn);
    horn.add(new THREE.Mesh(mergeGeometries([B(0.34, 0.05, 0.05, '#15181d', 0, 0, 0), B(0.05, 0.16, 0.05, '#15181d', -0.17, 0.06, 0), B(0.05, 0.16, 0.05, '#15181d', 0.17, 0.06, 0), B(0.1, 0.06, 0.03, '#ff6b5b', 0, 0.02, 0.03)]), flatMat));
    yokes.push({ col, horn });
  }
  const throttles = [];
  for (const s of [-1, 1]) {
    const lv = new THREE.Group(); lv.position.set(s * 0.09, FLOOR_C + 0.64, -2.5); root.add(lv);
    lv.add(new THREE.Mesh(mergeGeometries([B(0.03, 0.22, 0.03, '#8d9299', 0, 0.11, 0), B(0.1, 0.05, 0.06, '#15181d', 0, 0.23, 0)]), flatMat));
    throttles.push(lv);
  }
  const scv = document.createElement('canvas'); scv.width = 512; scv.height = 128;
  const sctx = scv.getContext('2d');
  const stex = new THREE.CanvasTexture(scv); stex.colorSpace = THREE.SRGBColorSpace;
  drawDisplays(sctx, 512, 128, { power: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.56), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }));
  screen.position.set(0, 5.447, -3.247); screen.rotation.x = -0.3; root.add(screen);

  // ── inscriptions ──
  const livery = textTexture(['AIR ARCHIPEL · HX-404'], '#f4f3ee', '#1f8a8a', 1024, 110);
  const liveryA = Math.asin(1.55 / R);
  for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.position.set(0, Y, 20); pv.rotation.z = s * liveryA; root.add(pv);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.0), new THREE.MeshLambertMaterial({ map: livery }));
    m.position.set(s * (R + 0.02), 0, 0); m.rotation.y = s * Math.PI / 2; pv.add(m);
  }
  const tailTx = textTexture(['HX'], '#1f8a8a', '#ffd166', 256, 180);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshLambertMaterial({ map: tailTx })); m.position.set(s * 0.28, Y + 7.5, 52); m.rotation.y = s * Math.PI / 2; root.add(m); }
  const cabSign = textTexture(['AIR ARCHIPEL', 'bienvenue à bord'], '#233b5c', '#ffd166', 512, 160);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.38), new THREE.MeshBasicMaterial({ map: cabSign, toneMapped: false }));
  cs.position.set(-1.48, FLOOR_B + 1.05, 11.1); cs.rotation.y = Math.PI; root.add(cs);

  // porte avant gauche (s'ouvre vers l'extérieur : escalier accosté ou toboggan déployé)
  const doorPivot = new THREE.Group(); doorPivot.position.set(-R - 0.02, FLOOR_B, 3.0); root.add(doorPivot);
  const door = new THREE.Mesh(prep(new THREE.BoxGeometry(0.12, 2.0, 1.2), WH), flatMat); door.position.set(0, 1.0, 0.6); doorPivot.add(door);
  const dstripe = new THREE.Mesh(prep(new THREE.BoxGeometry(0.13, 0.12, 1.2), CO), flatMat); dstripe.position.set(0, 0.6, 0.6); doorPivot.add(dstripe);
  const dwin = new THREE.Mesh(prep(new THREE.BoxGeometry(0.13, 0.3, 0.24), DK), flatMat); dwin.position.set(0, 1.5, 0.6); doorPivot.add(dwin);
  // porte de soute
  const cargoPivot = new THREE.Group(); cargoPivot.position.set(R + 0.05, 4.75, 33); root.add(cargoPivot);
  const cdoor = new THREE.Mesh(prep(new THREE.BoxGeometry(0.1, 1.9, 2.7), WH), flatMat); cdoor.position.set(0, -0.95, 0); cargoPivot.add(cdoor);
  // toboggan d'évacuation gonflable (masqué tant qu'il n'est pas déployé)
  const slide = new THREE.Group(); slide.visible = false; root.add(slide);
  {
    const S = SLIDE, len = Math.hypot(S.x1 - S.x0, S.y1 - S.y0), ang = Math.atan2(S.y0 - S.y1, S.x0 - S.x1), mz = (S.z0 + S.z1) / 2;
    const cx = (S.x0 + S.x1) / 2, cy = (S.y0 + S.y1) / 2;
    const sp = [
      B(len, 0.16, S.z1 - S.z0, '#ff8a3a', cx, cy - 0.06, mz, 0, 0, ang),
      C(0.24, 0.24, len + 0.3, 10, '#ffd166', cx, cy + 0.1, S.z0 - 0.05, 0, 0, Math.PI / 2 + ang),
      C(0.24, 0.24, len + 0.3, 10, '#ffd166', cx, cy + 0.1, S.z1 + 0.05, 0, 0, Math.PI / 2 + ang),
      B(1.6, 0.35, 2.3, '#ffd166', S.x1 - 0.5, 0.17, mz),
      B(0.5, 0.55, 2.2, '#ffd166', S.x0 - 0.1, S.y0 + 0.1, mz),
    ];
    const sm = new THREE.Mesh(mergeGeometries(sp), flatMat); sm.castShadow = true; slide.add(sm);
  }
  // lumières : feu anticollision et cabine
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false }));
  strobe.position.set(0, Y + R + 0.1, 20); root.add(strobe);
  const cabinLight = new THREE.PointLight('#ffe8c0', 0, 30, 1.2); cabinLight.position.set(0, 7, 14); root.add(cabinLight);
  const engines = [];
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.CircleGeometry(1.05, 12), new THREE.MeshBasicMaterial({ color: '#6fb7ff', toneMapped: false, transparent: true, opacity: 0 })); f.position.set(s * 10.5, Y - 3.0, 23.6); root.add(f); engines.push(f); }
  return { root, doorPivot, cargoPivot, strobe, cabinLight, engines, yokes, throttles, screen: { ctx: sctx, tex: stex, t: 0 }, paneMat, slide };
}

// animation de l'intérieur : couleur des hublots, écrans, manches et manettes (s : état de vol)
export function animateBoeing(b, s, dt) {
  b.paneMat.color.set(s.night > 0.5 ? '#1b2550' : s.night > 0.05 ? '#8a7fb8' : '#cfeaff');
  b.yokes.forEach((y) => { y.horn.rotation.z = -(s.roll || 0) * 0.9; y.col.rotation.x = -(s.pitch || 0) * 0.35; });
  b.throttles.forEach((t) => { t.rotation.x = -0.5 + (s.throttle || 0) * 1.0; });
  const sc = b.screen;
  sc.t -= dt;
  if (sc.t <= 0 && s.visible) { sc.t = 0.1; drawDisplays(sc.ctx, 512, 128, s); sc.tex.needsUpdate = true; }
}

// colliders dynamiques (recalculés si l'avion bouge) : extérieur au sol + parois de la cabine
export function boeingColliders(pose, open) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const W = (x, z) => ({ x: pose.x + x * c + z * s, z: pose.z - x * s + z * c });
  const out = [];
  const circ = (x, z, r, minY, maxY) => { const p = W(x, z); out.push({ type: 'circle', x: p.x, z: p.z, r, minY: pose.y + minY, maxY: pose.y + maxY, boeing: true }); };
  // au sol : trains, moteurs
  circ(0, 0, 0.5, -2, 3.5);
  for (const sx of [-1, 1]) { circ(sx * 4, 22, 1.3, -2, 3.3); circ(sx * 10.5, 18.9, 1.6, -2, 1.8); circ(sx * 10.5, 21.9, 1.6, -2, 1.8); }
  // cabine : parois (cercles), porte ouverte si l'escalier est accosté ou le toboggan déployé
  const y0 = FLOOR_B - 0.5, y1 = FLOOR_B + 3.5;
  for (let z = -3.2; z <= 44; z += 0.7) {
    circ(2.75, z, 0.4, y0, y1);
    if (!(open.door && z > 3.0 && z < 4.3)) circ(-2.75, z, 0.4, y0, y1);
  }
  for (let x = -2.1; x <= 2.1; x += 0.7) { circ(x, -3.55, 0.4, y0, y1); circ(x, 44.2, 0.4, y0, y1); }
  // poste : pylône central, sièges ; cloison (passage au centre)
  circ(0, -2.25, 0.3, y0, y1); circ(0, -2.75, 0.3, y0, y1);
  for (const sx of [-1, 1]) { circ(sx * 0.55, -1.95, 0.28, y0, y1); circ(sx * 1.55, -2.3, 0.4, y0, y1); }
  for (const sx of [-1, 1]) { circ(sx * 1.05, 1.18, 0.3, y0, y1); circ(sx * 1.7, 1.18, 0.55, y0, y1); circ(sx * 2.35, 1.18, 0.4, y0, y1); }
  // galley (avant droit), blocs de sièges, cloison des classes, toilettes
  for (const z of [1.9, 3.0, 4.1]) circ(1.55, z, 0.78, y0, y1);
  for (const sx of [-1, 1]) {
    for (let z = 5.8; z < 10.4; z += 1.15) circ(sx * 1.42, z, 0.85, y0, y1);
    circ(sx * 1.48, 11.15, 0.8, y0, y1);
    for (let z = 12.2; z < 41.8; z += 1.3) circ(sx * 1.45, z, 0.78, y0, y1);
    circ(sx * 1.5, 42.85, 0.85, y0, y1);
  }
  return out;
}
// plateformes : plancher de cabine, estrade du poste ; seuil et toboggan si la porte est ouverte
export function boeingPlatform(pose, open = {}) {
  const { minX, maxX, minZ, maxZ } = BOEING.cabin;
  const P = (a, b, c, d, top, extra = {}) => ({ obb: true, x: pose.x, z: pose.z, r: pose.yaw, minX: a, maxX: b, minZ: c, maxZ: d, top: pose.y + top, boeing: true, ...extra });
  const out = [P(minX, maxX, minZ, maxZ, FLOOR_B), P(-2.15, 2.15, -3.35, -0.8, FLOOR_C)];
  if (open.slide) {
    out.push(P(SLIDE.x0 - 0.05, -2.3, 2.95, 4.25, FLOOR_B));   // seuil de la porte
    const S = SLIDE, n = S.steps;
    for (let i = 0; i < n; i++) {
      const xa = S.x0 + (S.x1 - S.x0) * i / n, xb = S.x0 + (S.x1 - S.x0) * (i + 1) / n;
      out.push(P(Math.min(xa, xb), Math.max(xa, xb), S.z0, S.z1, S.y0 + (S.y1 - S.y0) * (i + 0.5) / n + 0.08, { slide: true }));
    }
  }
  return out;
}
