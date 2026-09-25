// Objets d'énigmes physiques : caisses, lests, miroirs, et quelques modèles de décor partagés
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';

function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, col, seg = 8, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.CylinderGeometry(rt, rb, h, seg), col), flatMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function label(text, bg, fg, w, h) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.font = '900 64px "Bricolage Grotesque", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 66, 236);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
}

// caisse de fret en bois (1,2 m) : on peut monter dessus
export function buildCargoBox() {
  const g = new THREE.Group();
  g.add(box(1.2, 1.2, 1.2, '#b98b5e', 0, 0.6, 0));
  for (const y of [0.08, 1.12]) for (const [w, d, x, z] of [[1.24, 0.12, 0, 0.56], [1.24, 0.12, 0, -0.56], [0.12, 1.24, 0.56, 0], [0.12, 1.24, -0.56, 0]]) g.add(box(w, 0.14, d, '#7a5536', x, y, z));
  for (const [x, z] of [[0.56, 0.56], [-0.56, 0.56], [0.56, -0.56], [-0.56, -0.56]]) g.add(box(0.13, 1.2, 0.13, '#7a5536', x, 0.6, z));
  const l = label('FRET', '#b98b5e', '#3a2618', 0.8, 0.4);
  l.position.set(0, 0.62, -0.611); l.rotation.y = Math.PI; g.add(l);
  const l2 = l.clone(); l2.position.set(0, 0.62, 0.611); l2.rotation.y = 0; g.add(l2);
  return g;
}

// sac de lest (toile de jute)
export function buildSandbag() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.36, 0.6, '#c2a36b', 0, 0.2, 0));
  g.add(box(0.8, 0.12, 0.5, '#b39360', 0, 0.42, 0));
  g.add(box(0.14, 0.2, 0.3, '#8a6a3a', 0.5, 0.3, 0));
  const l = label('LEST 40 kg', '#c2a36b', '#5a3a1a', 0.6, 0.2);
  l.position.set(0, 0.24, -0.301); l.rotation.y = Math.PI; g.add(l);
  return g;
}

// bloc de béton avec anneau de levage
export function buildBallast() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.8, 0.8, '#9a9a94', 0, 0.4, 0));
  g.add(box(0.82, 0.08, 0.82, '#ffd166', 0, 0.62, 0));
  const ring = new THREE.Mesh(prep(new THREE.TorusGeometry(0.14, 0.035, 5, 10), '#5d6470'), flatMat);
  ring.position.set(0, 0.9, 0); g.add(ring);
  return g;
}

// miroir orientable sur pied (le plan du miroir suit l'axe x local)
export function buildMirror() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.14, 0.6, '#33373f', 0, 0.07, 0));
  g.add(cyl(0.05, 0.05, 0.7, '#8d9299', 6, 0, 0.5, 0));
  g.add(box(0.95, 0.62, 0.08, '#10162b', 0, 1.0, 0));
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.52, 0.1), new THREE.MeshLambertMaterial({ color: '#dff2ff', emissive: '#4a6a80' }));
  face.position.set(0, 1.0, 0); g.add(face);
  g.add(box(0.9, 0.04, 0.12, '#ff6b5b', 0, 1.33, 0));
  return g;
}

// extincteur (île 3)
export function buildExtinguisher() {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.16, 0.62, '#e0332a', 10, 0, 0.31, 0));
  g.add(cyl(0.16, 0.13, 0.08, '#b8241c', 10, 0, 0.66, 0));
  g.add(box(0.08, 0.12, 0.2, '#2a2a2a', 0, 0.76, -0.04));
  g.add(box(0.04, 0.3, 0.04, '#2a2a2a', 0.12, 0.62, -0.16));
  const l = label('CO₂', '#fff4e0', '#10162b', 0.18, 0.1);
  l.position.set(0, 0.36, -0.162); l.rotation.y = Math.PI; g.add(l);
  return g;
}

// batterie de secours (île 3)
export function buildBattery() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.45, 0.45, '#2b2f36', 0, 0.225, 0));
  g.add(box(0.72, 0.06, 0.47, '#ffd166', 0, 0.46, 0));
  g.add(cyl(0.05, 0.05, 0.08, '#ff4d4d', 6, -0.22, 0.52, 0));
  g.add(cyl(0.05, 0.05, 0.08, '#3d7bff', 6, 0.22, 0.52, 0));
  g.add(box(0.5, 0.05, 0.05, '#10162b', 0, 0.55, 0));
  return g;
}

// drapeau de boutique (bien visible de loin) : mât + fanion animé
export function buildShopFlag(col = '#ffd166', text = '🐚') {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.09, 7, '#e9e4d8', 6, 0, 3.5, 0));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })).translateY(7.1));
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = col; c.fillRect(0, 0, 256, 160);
  c.fillStyle = '#10162b'; c.fillRect(0, 128, 256, 32);
  c.font = '96px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 64);
  c.fillStyle = '#fff4e0'; c.font = '900 26px "Bricolage Grotesque", sans-serif'; c.fillText('BOUTIQUE', 128, 145);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(2.2, 1.4, 8, 1); geo.translate(1.1, 0, 0);
  const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
  flag.position.y = 6.2;
  flag.userData.base = geo.attributes.position.array.slice();
  g.add(flag);
  g.userData.flag = flag;
  g.userData.dynamic = true;
  return g;
}
// ondulation du fanion
export function waveFlag(g, t) {
  const f = g.userData.flag; if (!f) return;
  const p = f.geometry.attributes.position, b = f.userData.base;
  for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.array[i * 3 + 2] = Math.sin(t * 5 + x * 2.2) * 0.12 * x; }
  p.needsUpdate = true;
}
