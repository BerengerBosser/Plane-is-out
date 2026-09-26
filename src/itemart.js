// Vignettes 3D des objets d'inventaire : chaque objet a un petit modèle low poly, rendu une fois
// hors écran (caméra orthographique cadrée au plus juste) puis gardé en image. Deux sens : normal et tourné.
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';
import { GEAR } from './gear.js';

const PI = Math.PI;

// ── petites briques ──
function kit(g) {
  const put = (geo, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, mat) => {
    const m = new THREE.Mesh(mat ? geo : prep(geo, col), mat || flatMat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  return {
    put,
    box: (w, h, d, col, x, y, z, rx, ry, rz) => put(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz),
    // cylindre debout (axe Y)
    cyl: (rt, rb, h, col, x, y, z, rx, ry, rz, seg = 12) => put(new THREE.CylinderGeometry(rt, rb, h, seg), col, x, y, z, rx, ry, rz),
    // cylindre couché le long de X (rt du côté +X)
    cx: (rt, rb, len, col, x, y, z, seg = 12) => put(new THREE.CylinderGeometry(rt, rb, len, seg).rotateZ(-PI / 2), col, x, y, z),
    // cylindre face à la caméra (axe Z)
    cz: (r, len, col, x, y, z, seg = 16) => put(new THREE.CylinderGeometry(r, r, len, seg).rotateX(PI / 2), col, x, y, z),
    sph: (r, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 12) => { const m = put(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), col, x, y, z); m.scale.set(sx, sy, sz); return m; },
    // profil 2D (plan XY) extrudé en épaisseur, centré en Z
    ext: (pts, depth, col, x = 0, y = 0, z = 0, bevel = 0) => {
      const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
      geo.translate(0, 0, -depth / 2);
      return put(geo, col, x, y, z);
    },
    glow: (geo, col, x = 0, y = 0, z = 0) => put(geo, col, x, y, z, 0, 0, 0, new THREE.MeshBasicMaterial({ color: col, toneMapped: false })),
  };
}
// rectangle arrondi (profil)
function rrect(w, h, r, n = 3) {
  const pts = [];
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, PI / 2], [-w / 2 + r, -h / 2 + r, PI], [w / 2 - r, -h / 2 + r, PI * 1.5]];
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

// ── armes ──
function gunGrip(k, x, y, col, rake = -0.25, w = 0.28, h = 0.6) { k.box(w, h, 0.18, col, x, y, 0, 0, 0, rake); }
function triggerGuard(k, x, y, col = '#1a1d22') {
  k.box(0.3, 0.04, 0.12, col, x, y, 0);
  k.box(0.04, 0.14, 0.12, col, x + 0.14, y + 0.06, 0);
  k.box(0.03, 0.1, 0.05, col, x - 0.02, y + 0.07, 0);
}
const MODELS = {
  wrench(k) {
    k.box(1.5, 0.16, 0.08, '#8d949c', -0.15, 0, 0);
    k.box(0.4, 0.2, 0.09, '#7a8189', -0.8, 0, 0);
    k.cz(0.06, 0.1, '#2b2f36', -0.85, 0, 0.001);
    k.box(0.34, 0.5, 0.1, '#a3aab2', 0.72, 0.04, 0);
    k.box(0.3, 0.13, 0.1, '#a3aab2', 0.98, 0.24, 0);
    k.box(0.24, 0.1, 0.1, '#a3aab2', 0.96, -0.1, 0);
    k.cx(0.07, 0.07, 0.18, '#6d747c', 0.68, -0.06, 0.07, 8);
  },
  machete(k) {
    k.box(0.62, 0.17, 0.14, '#3a2a1e', -0.95, 0, 0);
    for (const x of [-1.1, -0.8]) k.cz(0.03, 0.16, '#c9a35a', x, 0, 0);
    k.box(0.06, 0.26, 0.16, '#2b2f36', -0.62, 0, 0);
    k.ext([[-0.6, -0.1], [0.9, -0.15], [1.25, -0.06], [1.32, 0.1], [1.12, 0.17], [-0.6, 0.1]], 0.03, '#c9ccd2');
    k.box(1.5, 0.04, 0.035, '#8d9299', 0.25, 0.12, 0);
  },
  flare(k) {
    k.cx(0.13, 0.13, 0.9, '#ff6b5b', 0.35, 0.18, 0);
    k.cx(0.16, 0.16, 0.1, '#d8453a', 0.8, 0.18, 0);
    k.box(0.42, 0.32, 0.22, '#ff6b5b', -0.15, 0.12, 0);
    k.box(0.1, 0.12, 0.1, '#33373f', -0.36, 0.33, 0, 0, 0, 0.4);
    gunGrip(k, -0.3, -0.25, '#d8453a', -0.3, 0.28, 0.62);
    triggerGuard(k, 0.0, -0.1, '#33373f');
  },
  pistol(k) {
    k.box(1.15, 0.24, 0.2, '#2b2f36', 0.1, 0.16, 0);
    for (let i = 0; i < 4; i++) k.box(0.02, 0.18, 0.01, '#15181d', -0.36 + i * 0.05, 0.16, 0.101);
    k.box(0.95, 0.14, 0.18, '#3a3f48', 0.05, -0.02, 0);
    k.cx(0.055, 0.055, 0.06, '#15181d', 0.69, 0.16, 0);
    gunGrip(k, -0.3, -0.3, '#3a3f48', -0.22, 0.3, 0.62);
    k.box(0.22, 0.4, 0.01, '#23272e', -0.31, -0.33, 0.1, 0, 0, -0.22);
    triggerGuard(k, 0.05, -0.2);
    k.box(0.04, 0.05, 0.05, '#ffd166', 0.6, 0.3, 0);
    k.box(0.06, 0.05, 0.12, '#15181d', -0.38, 0.3, 0);
  },
  revolver(k) {
    k.cx(0.07, 0.07, 0.85, '#9aa0a8', 0.45, 0.18, 0);
    k.box(0.85, 0.05, 0.07, '#9aa0a8', 0.45, 0.26, 0);
    k.cx(0.035, 0.035, 0.6, '#6d7278', 0.35, 0.07, 0, 8);
    k.cx(0.2, 0.2, 0.36, '#6d7278', -0.08, 0.12, 0, 8);
    k.box(0.5, 0.3, 0.16, '#9aa0a8', -0.12, 0.12, 0);
    k.box(0.1, 0.14, 0.08, '#5d6470', -0.4, 0.3, 0, 0, 0, 0.4);
    gunGrip(k, -0.46, -0.24, '#7a4a2c', -0.45, 0.26, 0.6);
    triggerGuard(k, -0.12, -0.08);
    k.box(0.04, 0.08, 0.04, '#ffd166', 0.85, 0.3, 0);
  },
  smg(k) {
    k.box(1.3, 0.3, 0.2, '#2b2f36', 0.05, 0.1, 0);
    k.cx(0.08, 0.08, 0.45, '#15181d', 0.92, 0.12, 0, 8);
    k.box(0.16, 0.7, 0.14, '#3a3f48', 0.3, -0.35, 0, 0, 0, 0.08);
    gunGrip(k, -0.3, -0.24, '#2b2f36', -0.2, 0.2, 0.5);
    triggerGuard(k, 0.0, -0.1);
    k.box(0.8, 0.05, 0.05, '#15181d', -0.95, 0.2, 0);
    k.box(0.8, 0.05, 0.05, '#15181d', -0.95, -0.02, 0);
    k.box(0.06, 0.36, 0.1, '#15181d', -1.35, 0.09, 0);
    k.box(0.1, 0.1, 0.06, '#15181d', 0.55, 0.3, 0);
    k.box(0.1, 0.1, 0.06, '#15181d', -0.45, 0.3, 0);
  },
  shotgun(k) {
    k.cx(0.07, 0.07, 2.3, '#2b2f36', 0.75, 0.2, 0);
    k.cx(0.065, 0.065, 1.7, '#3a3f48', 0.45, 0.05, 0);
    k.box(0.62, 0.2, 0.22, '#8a5f3a', 0.6, 0.05, 0);
    for (let i = 0; i < 5; i++) k.box(0.025, 0.2, 0.225, '#6d4b37', 0.38 + i * 0.1, 0.05, 0);
    k.box(0.7, 0.36, 0.2, '#3a3f48', -0.38, 0.1, 0);
    k.box(0.04, 0.05, 0.04, '#ffd166', 1.86, 0.29, 0);
    triggerGuard(k, -0.45, -0.14);
    k.ext([[-0.72, 0.26], [-0.72, -0.1], [-1.25, -0.3], [-1.95, -0.44], [-1.95, 0.2], [-1.3, 0.22]], 0.18, '#8a5f3a');
    k.box(0.07, 0.66, 0.2, '#15181d', -1.98, -0.12, 0);
  },
  rifle(k) {
    k.box(1.0, 0.26, 0.2, '#3a4a3a', -0.1, 0.18, 0);
    k.box(0.7, 0.2, 0.18, '#2b2f36', -0.15, -0.02, 0);
    k.box(0.9, 0.26, 0.22, '#2b2f36', 0.85, 0.17, 0);
    for (let i = 0; i < 4; i++) k.box(0.1, 0.04, 0.01, '#15181d', 0.55 + i * 0.2, 0.17, 0.111);
    k.cx(0.045, 0.045, 0.7, '#15181d', 1.63, 0.19, 0, 8);
    k.cx(0.065, 0.065, 0.16, '#15181d', 2.0, 0.19, 0, 8);
    k.box(0.05, 0.28, 0.06, '#15181d', 1.22, 0.4, 0);
    k.box(0.55, 0.08, 0.1, '#15181d', -0.1, 0.42, 0);
    for (const x of [-0.3, 0.1]) k.box(0.06, 0.12, 0.1, '#15181d', x, 0.33, 0);
    k.box(0.2, 0.62, 0.16, '#15181d', 0.12, -0.38, 0, 0, 0, 0.2);
    gunGrip(k, -0.42, -0.26, '#15181d', -0.35, 0.18, 0.44);
    triggerGuard(k, -0.2, -0.14);
    k.ext([[-0.6, 0.28], [-0.6, 0.02], [-1.55, -0.2], [-1.55, 0.26]], 0.18, '#3a4a3a');
    k.box(0.07, 0.52, 0.2, '#15181d', -1.58, 0.03, 0);
  },
  sniper(k) {
    k.ext([[-1.9, 0.14], [-1.9, -0.42], [-1.3, -0.3], [-0.8, -0.1], [-0.55, -0.34], [-0.32, -0.34], [-0.28, -0.06], [0.95, -0.06], [0.95, 0.12], [-0.8, 0.14]], 0.2, '#6d4b37');
    k.cx(0.05, 0.04, 1.3, '#15181d', 1.45, 0.08, 0, 8);
    k.cx(0.075, 0.075, 0.18, '#15181d', 2.15, 0.08, 0, 8);
    k.cx(0.09, 0.09, 0.8, '#2b2f36', 0.0, 0.14, 0);
    k.box(0.04, 0.04, 0.22, '#c9ccd2', -0.32, 0.12, 0.14);
    k.sph(0.05, '#c9ccd2', -0.32, 0.12, 0.26);
    k.cx(0.1, 0.1, 0.9, '#10162b', 0.05, 0.44, 0);
    k.cx(0.15, 0.1, 0.25, '#10162b', 0.6, 0.44, 0);
    k.cx(0.1, 0.13, 0.2, '#10162b', -0.5, 0.44, 0);
    k.cyl(0.05, 0.05, 0.14, '#10162b', 0.05, 0.58, 0, 0, 0, 0, 8);
    for (const x of [-0.2, 0.3]) k.box(0.06, 0.2, 0.1, '#15181d', x, 0.27, 0);
    k.box(0.03, 0.5, 0.03, '#15181d', 0.85, -0.3, 0.06, 0, 0, 0.35);
    k.box(0.03, 0.5, 0.03, '#15181d', 0.85, -0.3, -0.06, 0, 0, -0.35);
    k.box(0.07, 0.58, 0.22, '#15181d', -1.93, -0.14, 0);
  },
  launcher(k) {
    k.cx(0.22, 0.22, 1.7, '#4a5a32', 0.45, 0.15, 0, 14);
    k.cx(0.25, 0.25, 0.12, '#2b2f36', 1.3, 0.15, 0, 14);
    k.cx(0.225, 0.225, 0.08, '#ffd166', 1.05, 0.15, 0, 14);
    k.cx(0.26, 0.26, 0.18, '#2b2f36', -0.4, 0.15, 0, 14);
    gunGrip(k, -0.2, -0.32, '#2b2f36', -0.25, 0.2, 0.55);
    k.box(0.16, 0.45, 0.16, '#2b2f36', 0.62, -0.26, 0);
    k.box(0.06, 0.26, 0.06, '#15181d', 0.2, 0.46, 0);
    k.box(0.22, 0.04, 0.06, '#15181d', 0.2, 0.58, 0);
    k.ext([[-0.48, 0.22], [-0.48, -0.04], [-1.5, -0.24], [-1.5, 0.3]], 0.18, '#4a5a32');
    k.box(0.07, 0.6, 0.2, '#15181d', -1.53, 0.03, 0);
  },
  harpoon(k) {
    k.box(1.6, 0.15, 0.15, '#b98b5e', -0.3, 0, 0);
    gunGrip(k, -0.55, -0.26, '#6d4b37', -0.3, 0.18, 0.46);
    k.box(0.3, 0.24, 0.16, '#6d4b37', -1.2, -0.02, 0);
    k.cx(0.025, 0.025, 2.2, '#c9ccd2', 0.6, 0.13, 0, 6);
    k.put(new THREE.ConeGeometry(0.06, 0.24, 6).rotateZ(-PI / 2), '#ff6b5b', 1.8, 0.13, 0);
    k.box(0.12, 0.26, 0.26, '#33373f', 0.52, 0.05, 0);
    for (const z of [-0.1, 0.1]) k.box(0.9, 0.035, 0.035, '#15181d', 0.2, 0.09, z);
    triggerGuard(k, -0.4, -0.1, '#33373f');
  },
  rod(k) {
    k.cx(0.02, 0.045, 2.8, '#3a2a1e', 0.2, 0, 0, 8);
    k.cx(0.075, 0.075, 0.62, '#d8b27a', -1.1, 0, 0, 8);
    k.cx(0.085, 0.085, 0.06, '#2b2f36', -0.78, 0, 0, 8);
    k.box(0.06, 0.18, 0.04, '#8d9299', -0.65, -0.1, 0);
    k.cz(0.15, 0.12, '#c9ccd2', -0.65, -0.28, 0);
    k.cz(0.06, 0.14, '#6d7278', -0.65, -0.28, 0);
    k.box(0.14, 0.03, 0.03, '#2b2f36', -0.6, -0.3, 0.09);
    for (const x of [-0.2, 0.4, 0.95, 1.45]) k.box(0.02, 0.07, 0.02, '#8d9299', x, -0.05, 0);
    k.box(0.006, 0.3, 0.006, '#eeeeee', 1.6, -0.15, 0);
    k.sph(0.08, '#ff5040', 1.6, -0.34, 0);
    k.sph(0.08, '#f4f1ea', 1.6, -0.4, 0, 1, 0.7, 1);
  },
  bat(k) {
    k.cx(0.16, 0.05, 2.4, '#b98b5e', 0.1, 0, 0, 10);
    k.cx(0.08, 0.08, 0.06, '#8a6440', -1.12, 0, 0, 10);
    k.cx(0.062, 0.057, 0.5, '#2b2f36', -0.8, 0, 0, 10);
    const nails = [[0.7, 0.4], [0.82, -0.9], [0.95, 1.4], [1.05, -0.2], [1.18, 0.9], [1.2, -1.3], [0.6, -0.5]];
    for (const [x, a] of nails) k.box(0.02, 0.36, 0.02, '#aab0b8', x, Math.cos(a) * 0.14, Math.sin(a) * 0.14, a, 0, 0);
  },
  axe(k) {
    k.cx(0.07, 0.07, 2.4, '#c9352b', 0, 0, 0, 8);
    k.cx(0.085, 0.085, 0.55, '#15181d', -0.92, 0, 0, 8);
    k.box(0.28, 0.34, 0.14, '#b02820', 1.05, 0, 0);
    k.ext([[0.94, 0.15], [1.16, 0.15], [1.34, 0.74], [0.76, 0.74]], 0.08, '#d8322a');
    k.box(0.6, 0.06, 0.085, '#e4e8ee', 1.05, 0.74, 0);
    k.ext([[0.95, -0.15], [1.15, -0.15], [1.06, -0.78]], 0.08, '#d8322a');
    k.group.rotation.z = 0.32;
  },
  sledge(k) {
    k.cx(0.06, 0.06, 2.3, '#8a6a4a', 0, 0, 0, 8);
    k.cx(0.075, 0.075, 0.5, '#15181d', -0.9, 0, 0, 8);
    k.box(0.42, 0.82, 0.42, '#5d6470', 1.1, 0, 0);
    for (const y of [-0.42, 0.42]) k.box(0.44, 0.06, 0.44, '#3d434d', 1.1, y, 0);
    k.group.rotation.z = 0.3;
  },
  katana(k) {
    k.ext([[-0.55, -0.04], [0.5, -0.03], [1.3, 0.04], [1.78, 0.16], [1.62, 0.21], [1.25, 0.13], [0.5, 0.06], [-0.55, 0.06]], 0.03, '#e4e8ee');
    k.box(1.9, 0.015, 0.032, '#b9c0c8', 0.55, 0.035, 0, 0, 0, 0.05);
    k.box(0.08, 0.12, 0.06, '#d8a53a', -0.57, 0.01, 0);
    k.cx(0.16, 0.16, 0.04, '#15181d', -0.63, 0.01, 0, 10);
    k.box(0.75, 0.13, 0.09, '#15181d', -1.03, 0.01, 0);
    for (let i = 0; i < 6; i++) k.box(0.06, 0.06, 0.01, '#f4efe4', -1.3 + i * 0.11, 0.01, 0.047, 0, 0, PI / 4);
    k.box(0.06, 0.14, 0.1, '#d8a53a', -1.42, 0.01, 0);
  },
  diable(k) {
    for (const x of [-0.35, 0.35]) k.box(0.08, 2.6, 0.08, '#d8322a', x, 0.2, 0);
    for (const y of [-0.6, 0.1, 0.8]) k.box(0.7, 0.06, 0.06, '#d8322a', 0, y, 0);
    k.box(0.9, 0.09, 0.09, '#15181d', 0, 1.52, 0);
    k.box(0.9, 0.06, 0.5, '#8d9299', 0, -1.1, 0.22);
    k.box(0.9, 0.06, 0.06, '#15181d', 0, -0.88, -0.2);
    for (const x of [-0.52, 0.52]) {
      k.put(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14).rotateZ(PI / 2), '#15181d', x, -0.88, -0.2);
      k.put(new THREE.CylinderGeometry(0.12, 0.12, 0.17, 10).rotateZ(PI / 2), '#c9ccd2', x, -0.88, -0.2);
    }
  },
  // ── équipements rapides ──
  lantern(k) {
    k.cyl(0.34, 0.38, 0.14, '#3b3f45', 0, -0.72, 0);
    k.glow(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12), '#ffcf6b', 0, -0.25, 0);
    k.glow(new THREE.ConeGeometry(0.08, 0.26, 8), '#fff4d0', 0, -0.3, 0.02);
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; k.box(0.04, 0.84, 0.04, '#3b3f45', Math.cos(a) * 0.29, -0.25, Math.sin(a) * 0.29); }
    k.cyl(0.12, 0.36, 0.24, '#3b3f45', 0, 0.26, 0);
    k.cyl(0.1, 0.1, 0.14, '#3b3f45', 0, 0.44, 0);
    k.put(new THREE.TorusGeometry(0.26, 0.03, 6, 16, PI), '#15181d', 0, 0.48, 0);
  },
  talkie(k) {
    k.box(0.44, 0.82, 0.22, '#2b2f36', 0, -0.1, 0);
    k.cyl(0.05, 0.05, 0.7, '#10162b', 0.12, 0.62, 0, 0, 0, 0, 8);
    k.cyl(0.07, 0.07, 0.12, '#15181d', -0.12, 0.37, 0, 0, 0, 0, 8);
    k.glow(new THREE.BoxGeometry(0.3, 0.16, 0.01), '#ffb34a', 0, 0.14, 0.113);
    for (let i = 0; i < 4; i++) k.box(0.3, 0.025, 0.01, '#555a62', 0, -0.1 - i * 0.07, 0.113);
    k.box(0.04, 0.2, 0.12, '#d8322a', -0.24, 0.02, 0);
    k.sph(0.025, '#ff3030', 0.14, 0.34, 0.1);
  },
  bandage(k) {
    k.cz(0.34, 0.42, '#f4f1ea', 0, 0.06, 0, 18);
    k.cz(0.11, 0.43, '#d9d4c8', 0, 0.06, 0, 10);
    k.box(0.5, 0.42, 0.02, '#ece6da', 0.28, -0.3, 0.02, -1.2, 0, -0.15);
    k.box(0.08, 0.1, 0.43, '#c9ccd2', -0.3, 0.2, 0, 0, 0, 0.9);
    k.group.rotation.set(0.2, -0.5, 0);
  },
  medkit(k) {
    k.ext(rrect(1.3, 0.9, 0.1), 0.45, '#f4f1ea');
    k.box(1.32, 0.04, 0.47, '#d9d4c8', 0, 0.2, 0);
    k.box(0.44, 0.14, 0.02, '#d8322a', 0, -0.06, 0.235);
    k.box(0.14, 0.44, 0.02, '#d8322a', 0, -0.06, 0.235);
    k.box(0.52, 0.08, 0.12, '#2b2f36', 0, 0.56, 0);
    for (const x of [-0.23, 0.23]) { k.box(0.06, 0.14, 0.1, '#2b2f36', x, 0.49, 0); k.box(0.1, 0.12, 0.03, '#8d9299', x * 2, 0.2, 0.235); }
  },
  parachute(k) {
    k.ext(rrect(1.1, 1.2, 0.14), 0.45, '#ff6b5b');
    k.ext(rrect(1.14, 0.34, 0.1), 0.47, '#d8453a', 0, 0.44, 0);
    for (const x of [-0.3, 0.3]) k.box(0.12, 1.24, 0.03, '#10162b', x, 0, 0.23);
    k.box(1.14, 0.1, 0.03, '#10162b', 0, -0.2, 0.235);
    k.put(new THREE.TorusGeometry(0.1, 0.025, 6, 12), '#c9ccd2', 0.3, -0.36, 0.26);
    k.box(0.16, 0.08, 0.05, '#ffd166', -0.3, -0.36, 0.26);
  },
  stake(k) {
    k.cyl(0.05, 0.05, 1.5, '#8d9299', 0, 0, 0, 0, 0, 0, 8);
    k.put(new THREE.ConeGeometry(0.07, 0.3, 8).rotateX(PI), '#6d7278', 0, -0.9, 0);
    k.put(new THREE.TorusGeometry(0.17, 0.035, 6, 14, PI * 1.3), '#6d7278', 0, 0.85, 0, 0, 0, -0.15);
    k.cyl(0.065, 0.065, 0.14, '#ffd166', 0, 0.45, 0, 0, 0, 0, 8);
    k.group.rotation.z = -0.25;
  },
};

// ── munitions ──
function cartridge(k, x, z, o, y0 = 0) {
  k.cyl(o.r * 1.05, o.r * 1.05, 0.03, o.rim || o.case, x, y0 + 0.015, z, 0, 0, 0, 10);
  k.cyl(o.r, o.r, o.len, o.case, x, y0 + o.len / 2, z, 0, 0, 0, 10);
  if (o.tip) k.cyl(o.r * 0.25, o.r * 0.92, o.tipLen, o.tip, x, y0 + o.len + o.tipLen / 2, z, 0, 0, 0, 10);
  if (o.band) k.cyl(o.r * 1.02, o.r * 1.02, o.band[1], o.band[0], x, y0 + o.len * 0.25, z, 0, 0, 0, 10);
}
function ammoBox(k, o) {
  const W = 1.0, H = 0.38, D = 0.66;
  k.box(W, H, D, o.box, 0, H / 2, 0);
  k.box(W + 0.01, 0.1, D + 0.01, o.stripe, 0, H * 0.45, 0);
  const cols = o.cols || 3, rows = 2;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = (i - (cols - 1) / 2) * (W / (cols + 0.3)), z = (j - 0.5) * 0.3;
    cartridge(k, x, z, o, H - o.len * 0.55);
  }
  // une munition couchée devant la boîte
  const lay = new THREE.Group(); const k2 = kit(lay);
  cartridge(k2, 0, 0, o);
  lay.rotation.set(0, 0.4, -PI / 2); lay.position.set(-0.3, o.r, D / 2 + 0.2);
  k.group.add(lay);
}
const AMMO = {
  a_p9: { box: '#c9a26a', stripe: '#d8322a', case: '#d8a53a', r: 0.075, len: 0.32, tip: '#b87333', tipLen: 0.12 },
  a_r556: { box: '#5a6a3a', stripe: '#ffd166', case: '#d8a53a', r: 0.055, len: 0.55, tip: '#b87333', tipLen: 0.2, cols: 4 },
  a_357: { box: '#3a4450', stripe: '#c9ccd2', case: '#c9ccd2', r: 0.08, len: 0.4, tip: '#8d9299', tipLen: 0.1 },
  a_762: { box: '#4a5a32', stripe: '#d8322a', case: '#d8a53a', r: 0.07, len: 0.6, tip: '#b87333', tipLen: 0.26 },
  a_buck: { box: '#2b2f36', stripe: '#d8322a', case: '#c8322a', rim: '#d8a53a', band: ['#d8a53a', 0.14], r: 0.12, len: 0.5, tip: null, cols: 3 },
};
function buildAmmo(k, key) {
  if (AMMO[key]) { ammoBox(k, AMMO[key]); return; }
  if (key === 'a_grenade') {
    for (const [x, z] of [[-0.3, 0], [0.3, 0.12]]) {
      k.cyl(0.24, 0.24, 0.36, '#d8a53a', x, 0.18, z, 0, 0, 0, 14);
      k.cyl(0.23, 0.23, 0.2, '#6b7a2a', x, 0.46, z, 0, 0, 0, 14);
      k.cyl(0.235, 0.235, 0.05, '#ffd166', x, 0.42, z, 0, 0, 0, 14);
      k.sph(0.23, '#6b7a2a', x, 0.56, z, 1, 0.8, 1);
    }
  } else if (key === 'a_flare') {
    for (const [x, z] of [[-0.24, 0], [0.24, 0.1]]) {
      k.cyl(0.18, 0.18, 0.06, '#d8a53a', x, 0.03, z, 0, 0, 0, 14);
      k.cyl(0.16, 0.16, 0.8, '#ff6b5b', x, 0.46, z, 0, 0, 0, 14);
      k.cyl(0.165, 0.165, 0.1, '#f4f1ea', x, 0.86, z, 0, 0, 0, 14);
    }
  } else if (key === 'a_harpoon') {
    for (let i = 0; i < 3; i++) {
      const y = i * 0.18, x = (i - 1) * 0.08;
      k.cx(0.03, 0.03, 2.0, '#c9ccd2', x, y, -i * 0.05, 6);
      k.put(new THREE.ConeGeometry(0.07, 0.26, 6).rotateZ(-PI / 2), '#ff6b5b', x + 1.12, y, -i * 0.05);
      k.box(0.12, 0.1, 0.02, '#33373f', x - 0.96, y, -i * 0.05);
    }
  }
}

// ── poissons ──
const FISHES = {
  f_sardine: { col: '#9fb8c8', belly: '#e6eef2', h: 0.24, fin: '#7f98a8' },
  f_maquereau: { col: '#3f7a8a', belly: '#d9e6ea', h: 0.28, fin: '#2f5a6a', stripes: '#1f3f4a' },
  f_dorade: { col: '#c8b870', belly: '#efe6c8', h: 0.46, fin: '#a89050', band: '#e8b830' },
  f_merou: { col: '#8a5a3a', belly: '#c8a080', h: 0.44, fin: '#6a4028', spots: '#5a3a24', mouth: 1 },
  f_thon: { col: '#3a4f8a', belly: '#d8dde8', h: 0.36, fin: '#ffd166', finlets: 1 },
  f_lanterne: { col: '#1e3350', belly: '#34507a', h: 0.36, fin: '#10223a', lure: '#7df9ff' },
};
function buildFish(k, o) {
  k.sph(1, o.col, 0, 0, 0, 0.9, o.h, 0.2, 14);
  k.sph(1, o.belly, 0.05, -o.h * 0.35, 0.02, 0.8, o.h * 0.62, 0.19, 14);
  k.ext([[-0.78, 0], [-1.25, o.h + 0.12], [-1.12, 0], [-1.25, -o.h - 0.12]], 0.04, o.fin);
  k.ext([[-0.35, o.h * 0.8], [0.25, o.h * 0.85], [-0.15, o.h + 0.22]], 0.04, o.fin);
  k.ext([[-0.2, -o.h * 0.8], [0.1, -o.h * 0.8], [-0.1, -o.h - 0.14]], 0.04, o.fin);
  k.sph(0.075, '#f4f1ea', 0.62, o.h * 0.25, 0.14);
  k.sph(0.045, '#10121a', 0.65, o.h * 0.25, 0.19);
  if (o.stripes) for (let i = 0; i < 6; i++) k.box(0.05, o.h * 0.8, 0.02, o.stripes, -0.45 + i * 0.16, o.h * 0.35, 0.17, 0, 0, 0.35 * (i % 2 ? 1 : -1));
  if (o.band) k.box(0.06, o.h * 0.9, 0.02, o.band, 0.45, 0.02, 0.18);
  if (o.spots) for (const [x, y] of [[-0.3, 0.1], [0, 0.2], [0.2, 0.0], [-0.1, -0.08], [0.35, 0.18], [-0.45, 0.02]]) k.sph(0.05, o.spots, x, y * o.h * 2, 0.17, 1, 1, 0.3);
  if (o.mouth) k.box(0.14, 0.05, 0.3, '#3a241a', 0.84, -0.05, 0);
  if (o.finlets) for (let i = 0; i < 4; i++) { k.box(0.05, 0.08, 0.03, o.fin, -0.45 - i * 0.08, o.h * 0.5 - i * 0.04, 0); k.box(0.05, 0.08, 0.03, o.fin, -0.45 - i * 0.08, -o.h * 0.5 + i * 0.04, 0); }
  if (o.lure) { k.box(0.02, 0.5, 0.02, o.fin, 0.6, o.h + 0.2, 0, 0, 0, -0.5); k.glow(new THREE.SphereGeometry(0.09, 10, 6), o.lure, 0.78, o.h + 0.44, 0); for (const x of [-0.4, -0.1, 0.2]) k.glow(new THREE.SphereGeometry(0.03, 6, 4), o.lure, x, -o.h * 0.4, 0.18); }
}

// ── vêtements ──
const TEE = [[-0.5, -0.7], [0.5, -0.7], [0.5, 0.15], [0.72, 0.0], [0.92, 0.3], [0.55, 0.62], [0.2, 0.66], [0, 0.52], [-0.2, 0.66], [-0.55, 0.62], [-0.92, 0.3], [-0.72, 0.0], [-0.5, 0.15]];
const LONG = [[-0.5, -0.75], [0.5, -0.75], [0.5, 0.2], [0.6, -0.7], [0.86, -0.66], [0.78, 0.45], [0.55, 0.64], [0.2, 0.68], [0, 0.52], [-0.2, 0.68], [-0.55, 0.64], [-0.78, 0.45], [-0.86, -0.66], [-0.6, -0.7], [-0.5, 0.2]];
const PANTS = [[-0.5, 0.72], [0.5, 0.72], [0.58, -0.82], [0.12, -0.82], [0, 0.12], [-0.12, -0.82], [-0.58, -0.82]];
const VEST = [[-0.6, -0.7], [0.6, -0.7], [0.6, 0.3], [0.38, 0.45], [0.35, 0.72], [0.18, 0.72], [0.15, 0.42], [-0.15, 0.42], [-0.18, 0.72], [-0.35, 0.72], [-0.38, 0.45], [-0.6, 0.3]];
const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return `#${c.getHexString()}`; };
function pocket(k, x, y, w, h, col, z = 0.13) { k.box(w, h, 0.03, col, x, y, z); k.box(w + 0.02, h * 0.3, 0.04, shade(col, 0.8), x, y + h * 0.38, z + 0.005); }
function buildWear(k, key, d) {
  const L = d.look || {};
  const Z = 0.12;
  if (d.wear === 'top') {
    const col = L.col || '#3d6f86';
    const long = L.kind && L.kind !== 'base';
    k.ext(long ? LONG : TEE, 0.18, col, 0, 0, 0, 0.04);
    k.box(1.0, 0.08, 0.26, shade(col, 0.8), 0, -0.7, 0);
    if (long) for (const s of [-1, 1]) k.box(0.3, 0.1, 0.26, L.cuff || shade(col, 0.8), s * 0.73, -0.64, 0, 0, 0, s * -0.08);
    if (L.kind === 'shirt') {
      k.box(0.05, 1.2, 0.02, shade(col, 0.8), 0, -0.12, Z);
      for (let i = 0; i < 4; i++) k.box(0.05, 0.05, 0.03, '#f4efe4', 0, 0.3 - i * 0.28, Z + 0.01);
      for (const s of [-1, 1]) { pocket(k, s * 0.26, 0.2, 0.24, 0.22, shade(col, 0.9)); k.ext([[0, 0.52], [s * 0.2, 0.66], [s * 0.26, 0.42]], 0.05, shade(col, 0.75), 0, 0, Z); }
    } else if (L.kind === 'coat') {
      k.ext(rrect(0.8, 0.5, 0.2), 0.14, shade(col, 0.88), 0, 0.62, -0.1);
      for (let i = 0; i < 4; i++) k.box(0.1, 0.05, 0.03, '#2a2a2a', 0.06, 0.3 - i * 0.26, Z);
      for (const s of [-1, 1]) pocket(k, s * 0.28, -0.42, 0.3, 0.24, shade(col, 0.92));
    } else if (L.kind === 'jacket') {
      k.box(0.04, 1.25, 0.02, '#c9ccd2', 0, -0.12, Z);
      for (const s of [-1, 1]) k.ext([[0, 0.52], [s * 0.22, 0.7], [s * 0.4, 0.62], [s * 0.18, 0.28]], 0.06, L.collar || shade(col, 0.8), 0, 0, Z);
      for (const s of [-1, 1]) { pocket(k, s * 0.27, 0.15, 0.26, 0.2, shade(col, 0.9)); pocket(k, s * 0.27, -0.42, 0.28, 0.24, shade(col, 0.9)); }
      if (key === 'c_miljacket') { for (const [x, y] of [[-0.35, -0.1], [0.3, 0.4], [0.12, -0.55], [-0.62, 0.3], [0.7, -0.2]]) k.sph(0.09, '#3f4a28', x, y, 0.1, 1.4, 0.8, 0.3); k.box(0.14, 0.1, 0.02, '#ffd166', -0.74, 0.3, 0.1, 0, 0, 0.2); }
    } else {
      k.put(new THREE.TorusGeometry(0.18, 0.035, 6, 14, PI).rotateZ(PI), shade(col, 0.75), 0, 0.64, Z * 0.6);
      k.box(0.2, 0.08, 0.03, shade(col, 0.8), -0.72, 0.1, Z, 0, 0, 0.9);
    }
  } else if (d.wear === 'bottom') {
    const col = L.col || '#8a8070';
    k.ext(PANTS, 0.18, col, 0, 0, 0, 0.04);
    k.box(1.06, 0.12, 0.26, shade(col, 0.8), 0, 0.66, 0);
    k.box(0.12, 0.08, 0.03, '#c9ccd2', 0, 0.66, 0.13);
    k.box(0.03, 0.4, 0.02, shade(col, 0.7), 0.06, 0.38, Z);
    for (const s of [-1, 1]) k.box(0.46, 0.08, 0.26, shade(col, 0.82), s * 0.35, -0.78, 0);
    if (L.pockets) for (const s of [-1, 1]) pocket(k, s * 0.37, -0.2, 0.26, 0.28, shade(col, 0.9));
    if (key === 'c_jeans') for (const s of [-1, 1]) k.box(0.02, 1.3, 0.01, '#d8a53a', s * 0.3, -0.15, Z + 0.01, 0, 0, s * 0.05);
    if (key === 'c_milpants') for (const [x, y] of [[-0.3, 0.3], [0.32, 0.1], [-0.35, -0.55], [0.4, -0.6]]) k.sph(0.09, '#3f4a28', x, y, 0.1, 1.3, 0.8, 0.3);
  } else if (d.wear === 'vest') {
    const col = L.col || '#4a5a32';
    if (L.kind === 'life') {
      const P = [[-0.62, -0.62], [-0.08, -0.62], [-0.08, 0.35], [-0.2, 0.62], [-0.42, 0.62], [-0.62, 0.3]];
      k.ext(P, 0.24, col, 0, 0, 0, 0.05);
      k.ext(mirror(P), 0.24, col, 0, 0, 0, 0.05);
      for (const y of [-0.15, -0.42]) { k.box(1.34, 0.07, 0.3, '#10162b', 0, y, 0); k.box(0.16, 0.12, 0.33, '#2b2f36', 0, y, 0); }
      for (const s of [-1, 1]) k.box(0.3, 0.07, 0.02, '#e4e8ee', s * 0.36, 0.2, 0.18);
    } else {
      k.ext(VEST, 0.26, col, 0, 0, 0, 0.04);
      if (L.kind === 'armor') {
        k.ext(rrect(0.86, 0.72, 0.1), 0.06, shade(col, 1.2), 0, -0.14, 0.17);
        k.box(0.42, 0.14, 0.02, shade(col, 0.7), 0, 0.1, 0.21);
        for (const s of [-1, 1]) k.box(0.14, 0.4, 0.05, '#15181d', s * 0.52, -0.4, 0.16);
      } else {
        for (let i = 0; i < 4; i++) { const x = -0.39 + i * 0.26; k.box(0.22, 0.34, 0.14, shade(col, 0.85), x, -0.36, 0.2); k.box(0.23, 0.1, 0.15, shade(col, 0.65), x, -0.2, 0.205); }
        for (const y of [0.05, 0.18]) k.box(1.1, 0.03, 0.02, shade(col, 0.6), 0, y, 0.16);
        k.box(0.16, 0.3, 0.1, '#2b2f36', 0.26, 0.42, 0.18);
      }
    }
  } else if (d.wear === 'back') {
    const col = L.col || '#c84a3a';
    if (key === 'c_satchel') {
      k.ext(rrect(1.2, 0.8, 0.16), 0.26, col);
      k.ext([[-0.6, 0.38], [0.6, 0.38], [0.58, -0.05], [0, -0.14], [-0.58, -0.05]], 0.05, shade(col, 0.82), 0, 0.02, 0.15);
      k.box(0.14, 0.14, 0.03, '#d8a53a', 0, -0.1, 0.19);
      k.put(new THREE.TorusGeometry(0.56, 0.045, 6, 18, PI), shade(col, 0.7), 0, 0.3, 0);
    } else {
      k.ext(rrect(0.95, 1.2, 0.22), 0.5, col);
      k.ext(rrect(0.72, 0.46, 0.14), 0.18, shade(col, 0.88), 0, -0.26, 0.28);
      k.ext([[-0.5, 0.62], [0.5, 0.62], [0.46, 0.18], [-0.46, 0.18]], 0.08, shade(col, 0.8), 0, 0, 0.27);
      k.box(0.1, 0.42, 0.04, '#15181d', 0, 0.12, 0.33);
      k.box(0.14, 0.08, 0.05, '#8d9299', 0, 0.0, 0.34);
      for (const s of [-1, 1]) k.box(0.06, 0.9, 0.04, shade(col, 0.7), s * 0.44, -0.05, 0.26);
      k.put(new THREE.TorusGeometry(0.14, 0.03, 6, 12, PI), '#15181d', 0, 0.62, 0);
      if (L.roll) { k.cx(0.16, 0.16, 1.05, key === 'c_milpack' ? '#6b7a4a' : '#3a4450', 0, 0.76, 0.05, 10); for (const s of [-1, 1]) k.cx(0.17, 0.17, 0.04, '#15181d', s * 0.3, 0.76, 0.05, 10); }
      if (key === 'c_milpack') { for (const s of [-1, 1]) k.ext(rrect(0.24, 0.6, 0.06), 0.24, shade(col, 0.85), s * 0.56, -0.2, 0.06); for (const y of [0.0, 0.08]) k.box(0.62, 0.025, 0.02, shade(col, 0.6), 0, y - 0.18, 0.38); }
      if (key === 'c_hiking') k.box(0.2, 0.9, 0.02, '#ffd166', 0.36, -0.05, 0.26);
    }
  } else if (d.wear === 'hat') {
    const col = L.col || '#ff6b5b';
    const dome = (r, sy) => { const m = k.put(new THREE.SphereGeometry(r, 16, 8, 0, PI * 2, 0, PI / 2), col, 0, 0, 0); m.scale.y = sy; return m; };
    if (L.kind === 'cap') {
      dome(0.55, 0.85);
      k.put(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16, 1, false, -PI / 2, PI), shade(col, 0.85), 0, 0.02, 0.32).scale.set(1, 1, 1.3);
      k.sph(0.06, shade(col, 0.8), 0, 0.47, 0);
      k.box(0.3, 0.2, 0.02, '#f4efe4', 0, 0.25, 0.5, -0.5, 0, 0);
      k.group.rotation.y = -0.6;
    } else if (L.kind === 'fire') {
      dome(0.52, 0.9);
      k.cyl(0.8, 0.8, 0.05, shade(col, 0.9), 0, 0.02, -0.08, 0, 0, 0, 18).scale.set(1, 1, 1.25);
      k.box(0.1, 0.12, 0.95, shade(col, 0.75), 0, 0.44, 0);
      k.ext(rrect(0.36, 0.4, 0.06), 0.04, '#ffd166', 0, 0.3, 0.52);
      k.group.rotation.y = -0.4;
    } else {
      dome(0.58, 0.82);
      k.cyl(0.66, 0.68, 0.08, shade(col, 0.85), 0, 0.03, 0, 0, 0, 0, 18);
      for (const [x, z] of [[0.2, 0.35], [-0.3, 0.2], [0.05, 0.1]]) k.sph(0.1, '#3f4a28', x, 0.35, z, 1.2, 0.5, 1);
      k.box(0.05, 0.4, 0.02, '#2b2f36', 0.52, -0.18, 0.3, 0, 0, 0.2);
    }
  }
}

// ── angles de vue ──
const DIR = { wear: [0.12, 0.3, 1], hat: [0.1, 0.55, 1], fish: [0.1, 0.35, 1], ammo: [0.35, 0.55, 1], util: [0.4, 0.4, 1], weapon: [0.12, 0.28, 1], misc: [0.3, 0.4, 1] };
const DIR_KEY = { diable: [0.9, 0.35, 1], lantern: [0.3, 0.35, 1], a_harpoon: [0.1, 0.5, 1] };

function buildModel(key) {
  const d = GEAR[key];
  const g = new THREE.Group();
  const k = kit(g); k.group = g;
  if (MODELS[key]) MODELS[key](k);
  else if (d.cat === 'ammo') buildAmmo(k, key);
  else if (FISHES[key]) buildFish(k, FISHES[key]);
  else if (d.wear) buildWear(k, key, d);
  else k.box(0.8, 0.8, 0.8, '#6a7398');
  return g;
}

// ── rendu hors écran ──
let R = null, scene = null, cam = null;
const cache = new Map();
function setup() {
  const canvas = document.createElement('canvas');
  R = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.15;
  R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a6078', 1.5));
  const key = new THREE.DirectionalLight('#fff4e0', 2.4); key.position.set(0.6, 1.2, 1); scene.add(key);
  const rim = new THREE.DirectionalLight('#9fc4ff', 0.9); rim.position.set(-1, 0.4, -0.6); scene.add(rim);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
}
const v = new THREE.Vector3();
function render(key, rot) {
  if (!R) setup();
  const d = GEAR[key];
  const obj = buildModel(key);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const dir = new THREE.Vector3(...(DIR_KEY[key] || (d.wear === 'hat' ? DIR.hat : DIR[d.cat] || DIR.misc))).normalize();
  cam.position.copy(dir).multiplyScalar(50);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  if (rot) cam.rotateZ(-PI / 2);
  cam.updateMatrixWorld(true);
  // cadrage au plus juste dans le repère de la caméra
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
    }
  });
  const cw = rot ? d.h : d.w, ch = rot ? d.w : d.h;
  const px = Math.round(84 * Math.min(2, Math.max(1, devicePixelRatio || 1)));
  const W = cw * px, H = ch * px, aspect = W / H;
  let hw = (x1 - x0) / 2 * 1.08, hh = (y1 - y0) / 2 * 1.08;
  if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  Object.assign(cam, { left: mx - hw, right: mx + hw, top: my + hh, bottom: my - hh });
  cam.updateProjectionMatrix();
  R.setSize(W, H, false);
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(obj);
  obj.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (m.material !== flatMat) m.material.dispose(); } });
  return url;
}

// image (data URL) de l'objet ; rot : tourné d'un quart de tour (occupe h × w cases)
export function itemArt(key, rot = 0) {
  if (!GEAR[key]) return '';
  const id = `${key}:${rot ? 1 : 0}`;
  let url = cache.get(id);
  if (url === undefined) {
    try { url = render(key, !!rot); } catch (e) { console.warn('itemArt', key, e); url = ''; }
    cache.set(id, url);
  }
  return url;
}
// précalcule les vignettes quand le navigateur est libre (évite un à-coup à la première ouverture)
export function warmItemArt() {
  const keys = Object.keys(GEAR);
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 60));
  const step = (dl) => {
    while (keys.length && dl.timeRemaining() > 4) itemArt(keys.shift(), 0);
    if (keys.length) idle(step);
  };
  idle(step);
}
