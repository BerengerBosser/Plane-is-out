// L'hydravion « Coucou » : grand bimoteur à flotteurs, cabine creuse où l'on peut marcher
// Repère local : l'avant est -Z, la ligne de flottaison est y = 0, le plancher est à y = FLOOR.
import * as THREE from 'three';
import { prep, flatMat, mergeStatic } from './terrain.js';

export const FLOOR = 1.6;
const CREAM = '#f3ead8', CORAL = '#ff6b5b', TEAL = '#1f8a8a', METAL = '#8d9299', DARK = '#33373f', WOOD = '#b98b5e', FLOORC = '#9a6b45';

function mesh(geo, col) { return new THREE.Mesh(prep(geo, col), flatMat); }
function box(w, h, d, col, x = 0, y = 0, z = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), col); m.position.set(x, y, z); return m; }
function cylZ(rTop, rBot, len, seg, col, dir = -1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
  g.rotateX(dir * Math.PI / 2);
  return mesh(g, col);
}
// boîte dont la face avant (-z) est réduite (nez, empennage)
function taperBox(w, h, d, sx, sy, col, dy = 0, openBack = false) {
  let g = new THREE.BoxGeometry(w, h, d);
  if (openBack) {
    // on retire la face +z (arrière) : le nez devient une coque creuse
    const gr = g.groups.find((q) => q.materialIndex === 4);
    const idx = Array.from(g.index.array);
    idx.splice(gr.start, gr.count);
    g.setIndex(idx);
    g.clearGroups();
  }
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * sx); p.setY(i, p.getY(i) * sy + dy); }
  }
  return mesh(g, col);
}
export const glassMat = new THREE.MeshLambertMaterial({ color: '#9fd6e8', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
function glass(w, h, d, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat); m.position.set(x, y, z); m.userData.glass = true; return m; }

// ── Pièces détachables (origine = point de fixation) ─────────
export function buildEngine(withProp) {
  const g = new THREE.Group();
  g.add(cylZ(0.5, 0.62, 3.2, 10, CREAM));
  const ring = cylZ(0.64, 0.64, 0.4, 10, CORAL);
  ring.position.z = -1.45;
  g.add(ring);
  const intake = cylZ(0.3, 0.3, 0.1, 10, DARK);
  intake.position.z = -1.66;
  g.add(intake);
  const ex = cylZ(0.1, 0.1, 0.8, 6, DARK);
  ex.position.set(0.45, -0.35, 0.9);
  g.add(ex);
  const pylon = box(0.25, 0.5, 1.6, CREAM, 0, 0.55, 0.2);
  g.add(pylon);
  if (withProp) {
    const p = buildProp();
    p.position.z = -1.8;
    g.add(p);
    g.userData.prop = p.userData.spin;
  }
  return g;
}

export function buildProp() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(cylZ(0.06, 0.34, 0.65, 10, CORAL));
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.BoxGeometry(0.22, 1.7, 0.06), WOOD);
    b.geometry.translate(0, 0.9, 0);
    b.rotation.z = (i / 3) * Math.PI * 2;
    b.position.z = 0.08;
    const tip = mesh(new THREE.BoxGeometry(0.23, 0.2, 0.07), '#ffd166');
    tip.position.set(0, 1.65, 0);
    b.add(tip);
    spin.add(b);
  }
  g.add(spin);
  g.userData.spin = spin;
  return g;
}

export function buildWing() {
  const g = new THREE.Group();
  g.add(box(8.2, 0.28, 2.5, CREAM));
  g.add(box(1.0, 0.3, 2.52, CORAL, -3.65, 0, 0));
  g.add(box(3.2, 0.1, 0.45, METAL, -1.8, -0.06, 1.35));
  g.add(box(0.12, 0.08, 2.4, TEAL, -1.0, 0.16, 0));
  return g;
}

export function buildFloats() {
  const g = new THREE.Group();
  for (const sx of [-2.3, 2.3]) {
    const body = cylZ(0.52, 0.52, 7.2, 8, CREAM);
    body.position.set(sx, 0, 0.4);
    g.add(body);
    const nose = cylZ(0.14, 0.52, 1.6, 8, CORAL);
    nose.position.set(sx, 0.06, -4.0);
    g.add(nose);
    const tail = cylZ(0.12, 0.52, 1.2, 8, CREAM, 1);
    tail.position.set(sx, 0.06, 4.6);
    g.add(tail);
    const stripe = cylZ(0.53, 0.53, 7.2, 8, TEAL);
    stripe.scale.set(1, 0.12, 1);
    stripe.position.set(sx, -0.12, 0.4);
    g.add(stripe);
    for (const z of [-2.0, 2.2]) {
      const st = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 6), METAL), flatMat);
      st.position.set(sx * 0.72, 0.95, z);
      st.rotation.z = sx > 0 ? 0.62 : -0.62;
      g.add(st);
    }
  }
  for (const z of [-2.0, 2.2]) g.add(box(4.6, 0.12, 0.14, METAL, 0, 0.4, z));
  return g;
}

export function buildWheels() {
  const g = new THREE.Group();
  for (const sx of [-2.3, 2.3]) {
    for (const z of [-2.8, 2.4]) {
      const leg = box(0.12, 0.5, 0.12, METAL, sx, -0.45, z);
      g.add(leg);
      const w = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), '#2a2d33'), flatMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, -0.72, z);
      g.add(w);
      const hub = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), '#ffd166'), flatMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(sx, -0.72, z);
      g.add(hub);
    }
  }
  return g;
}
// kit de roues à transporter (palette avec les 4 roues empilées)
export function buildWheelKit() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.14, 1.2, WOOD, 0, 0.07, 0));
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), '#2a2d33'), flatMat);
    w.position.set(i < 2 ? -0.4 : 0.4, 0.28 + (i % 2) * 0.27, 0);
    g.add(w);
    const hub = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), '#ffd166'), flatMat);
    hub.position.copy(w.position);
    g.add(hub);
  }
  g.add(box(0.05, 0.7, 1.22, '#ff6b5b', -0.82, 0.4, 0));
  g.add(box(0.05, 0.7, 1.22, '#ff6b5b', 0.82, 0.4, 0));
  return g;
}
export const WHEEL_DROP = 1.08; // hauteur ajoutée sous la ligne de flottaison quand les roues sont montées

export function buildDashboard() {
  const g = new THREE.Group();
  g.add(box(2.1, 0.55, 0.35, '#4a5163'));
  g.add(box(2.12, 0.08, 0.37, CREAM, 0, -0.26, 0));
  const cols = ['#ffd166', '#5ef2c2', '#ff6b5b', '#e9e4d8', '#b8a4ff', '#ffd166'];
  [-0.85, -0.6, -0.35, 0.35, 0.6, 0.85].forEach((x, i) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12), new THREE.MeshBasicMaterial({ color: cols[i], toneMapped: false }));
    d.rotation.x = Math.PI / 2;
    d.position.set(x, 0.04, 0.18);
    g.add(d);
  });
  g.add(box(2.14, 0.06, 0.42, '#1d2233', 0, 0.3, 0.02));   // casquette anti-reflets
  // écran radar (canvas mis à jour par le jeu)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.set(0, -0.02, 0.2);
  g.add(scr);
  g.add(box(0.44, 0.44, 0.04, '#1d2233', 0, -0.02, 0.18));
  g.userData.radarCanvas = cv;
  g.userData.radarTex = tex;
  return g;
}

export function buildCrate() {
  const g = new THREE.Group();
  g.add(box(1.5, 1.2, 1.2, '#4f6b58'));
  for (const x of [-0.58, 0.58]) g.add(box(0.08, 1.24, 1.24, '#2f4034', x, 0, 0));
  const sunMat = new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), sunMat);
  disc.position.set(0, 0.1, 0.61);
  g.add(disc);
  for (let i = 0; i < 8; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.14), sunMat);
    const a = (i / 8) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 0.33, 0.1 + Math.sin(a) * 0.33, 0.61);
    ray.rotation.z = a - Math.PI / 2;
    g.add(ray);
  }
  g.add(box(0.1, 0.1, 0.5, DARK, -0.8, 0.2, 0));
  g.add(box(0.1, 0.1, 0.5, DARK, 0.8, 0.2, 0));
  return g;
}

// tôle de réparation (trouvée dans les débris après un crash)
export function buildPlate() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.05, '#9aa3ab'));
  g.add(box(0.92, 0.08, 0.06, '#7d858c', 0, 0.31, 0));
  for (const [x, y] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.22], [0.38, 0.22]]) g.add(box(0.05, 0.05, 0.08, '#4f565c', x, y, 0));
  return g;
}
// trous dans la coque après un crash (repère local de la carlingue) : position et normale
export const HOLES = [
  { p: new THREE.Vector3(-1.53, 2.0, -1.2), n: new THREE.Vector3(-1, 0, 0) },
  { p: new THREE.Vector3(1.53, 1.95, 4.0), n: new THREE.Vector3(1, 0, 0) },
];

export function buildDiable() {
  const g = new THREE.Group();
  for (const x of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 5), CORAL), flatMat);
    rail.position.set(x, 0.7, 0);
    g.add(rail);
    const wheel = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), DARK), flatMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x * 1.4, 0.16, 0.08);
    g.add(wheel);
  }
  g.add(box(0.6, 0.04, 0.35, METAL, 0, 0.06, -0.16));
  const bar = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5), CORAL), flatMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.33;
  g.add(bar);
  return g;
}

// ── Emplacements et points d'intérêt (repère local) ──────────
export const SLOTS = {
  engineL: new THREE.Vector3(-3.7, 3.55, -1.3),
  engineR: new THREE.Vector3(3.7, 3.55, -1.3),
  wingL: new THREE.Vector3(-5.6, 4.1, -0.6),
  prop: new THREE.Vector3(-3.7, 3.55, -3.1),
  floats: new THREE.Vector3(0, 0.3, 0),
  dashboard: new THREE.Vector3(0, FLOOR + 0.75, -4.45),
  wheels: new THREE.Vector3(0, 0.3, 0),
};
export const PLANE_POINTS = {
  door: new THREE.Vector3(1.45, FLOOR + 0.9, 2.2),
  doorOut: new THREE.Vector3(2.45, FLOOR - 0.2, 2.2),
  doorIn: new THREE.Vector3(0.75, FLOOR, 2.2),
  winch: new THREE.Vector3(2.2, 1.2, 2.2),
  projector: new THREE.Vector3(0, 2.0, -6.2),
  pilot: new THREE.Vector3(-0.62, FLOOR, -3.45),
};
// intérieur praticable
export const CABIN = { minX: -1.18, maxX: 1.18, minZ: -4.2, maxZ: 4.75, doorZ0: 1.55, doorZ1: 2.85 };
export const SEATS = [
  { id: 'pilot', name: 'le siège pilote', x: -0.62, z: -3.45, yaw: 0, pilot: true },
  { id: 'copilot', name: 'le siège copilote', x: 0.62, z: -3.45, yaw: 0 },
  { id: 'p1', name: 'un siège passager', x: -0.82, z: -2.1, yaw: 0 },
  { id: 'p2', name: 'un siège passager', x: -0.82, z: -0.9, yaw: 0 },
  { id: 'p3', name: 'un siège passager', x: 0.82, z: -2.1, yaw: 0 },
  { id: 'bunk', name: 'la couchette', x: -0.8, z: 3.3, yaw: Math.PI / 2, bunk: true },
];

function buildSeat(col = TEAL) {
  const g = new THREE.Group();
  g.add(box(0.62, 0.14, 0.56, col, 0, 0.46, -0.03));          // assise
  g.add(box(0.58, 0.76, 0.12, col, 0, 0.9, 0.3));             // dossier (légèrement plus étroit)
  g.add(box(0.46, 0.2, 0.16, '#e9e4d8', 0, 1.2, 0.3));        // appui-tête (dépasse devant et derrière)
  g.add(box(0.07, 0.36, 0.07, METAL, -0.22, 0.2, -0.1));
  g.add(box(0.07, 0.36, 0.07, METAL, 0.22, 0.2, -0.1));
  g.add(box(0.07, 0.36, 0.07, METAL, -0.22, 0.2, 0.2));
  g.add(box(0.07, 0.36, 0.07, METAL, 0.22, 0.2, 0.2));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.06, 0.4, DARK, sx * 0.34, 0.66, 0));   // accoudoirs
  return g;
}

export function buildPlane() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = new THREE.Group(); // coque (double face pour être vue de l'intérieur)
  body.add(shell);

  const Z0 = -3.4, Z1 = 5.0, L = Z1 - Z0, ZC = (Z0 + Z1) / 2;
  const doorZ0 = 1.4, doorZ1 = 3.0;
  // plancher et fond
  shell.add(box(2.7, 0.12, L + 1.4, FLOORC, 0, FLOOR - 0.06, ZC - 0.7));
  shell.add(box(2.0, 0.1, L, CREAM, 0, 1.2, ZC));
  for (const sx of [-1, 1]) {
    const bev = box(0.62, 0.1, L, CREAM, sx * 1.22, 1.3, ZC);
    bev.rotation.z = sx * 0.55;
    shell.add(bev);
  }
  // flancs : bas, bande de hublots, haut (ouverture de porte à droite)
  const side = (sx) => {
    const segs = sx > 0 ? [[Z0, doorZ0], [doorZ1, Z1]] : [[Z0, Z1]];
    for (const [a, b] of segs) {
      const l = b - a, c = (a + b) / 2;
      shell.add(box(0.1, 0.9, l, CREAM, sx * 1.45, 1.85, c));
      shell.add(box(0.03, 0.18, l, CORAL, sx * 1.515, 2.2, c));
      shell.add(box(0.1, 0.35, l, CREAM, sx * 1.45, 3.12, c));
      // montants entre hublots + vitres
      for (let z = a; z < b - 0.01; z += 1.1) {
        const e = Math.min(b, z + 1.1);
        shell.add(box(0.1, 0.65, 0.35, CREAM, sx * 1.45, 2.62, z + 0.175));
        if (e - z > 0.5) shell.add(glass(0.04, 0.6, e - z - 0.35, sx * 1.45, 2.62, (z + 0.35 + e) / 2));
      }
    }
  };
  side(-1); side(1);
  // toit
  for (const sx of [-1, 1]) {
    const r = box(0.7, 0.1, L, CREAM, sx * 1.18, 3.47, ZC);
    r.rotation.z = -sx * 0.9;
    shell.add(r);
  }
  shell.add(box(1.9, 0.1, L, CREAM, 0, 3.72, ZC));
  shell.add(box(0.12, 0.05, L, TEAL, 0, 3.78, ZC));
  // cloison arrière
  shell.add(box(2.9, 2.5, 0.1, CREAM, 0, 2.5, Z1));
  // encadrement de la porte
  shell.add(box(0.12, 1.75, 0.12, DARK, 1.46, 2.47, doorZ0));
  shell.add(box(0.12, 1.75, 0.12, DARK, 1.46, 2.47, doorZ1));
  shell.add(box(0.12, 0.12, 1.72, DARK, 1.46, 3.35, 2.2));
  shell.add(box(0.12, 0.3, 1.6, CREAM, 1.45, 3.45, 2.2));

  // cockpit : nez bas + verrière
  const nose = taperBox(2.9, 1.2, 2.6, 0.38, 0.45, CREAM, -0.1, true);
  nose.position.set(0, 1.9, Z0 - 1.3);
  shell.add(nose);
  const noseStripe = taperBox(2.92, 0.18, 2.6, 0.38, 0.4, CORAL, -0.05);
  noseStripe.position.set(0, 2.2, Z0 - 1.3);
  shell.add(noseStripe);
  const cap = cylZ(0.18, 0.55, 0.5, 8, CORAL);
  cap.position.set(0, 1.78, Z0 - 2.85);
  shell.add(cap);
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.9), glassMat);
  wind.position.set(0, 3.04, Z0 - 0.78);
  wind.rotation.x = 0.8;
  wind.userData.glass = true;
  shell.add(wind);
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(0, 0); tri.lineTo(-1.35, 0); tri.lineTo(0, 1.3); tri.closePath();
    const sg = new THREE.Mesh(new THREE.ShapeGeometry(tri), glassMat);
    sg.rotation.y = -Math.PI / 2;
    sg.position.set(sx * 1.2, 2.45, Z0 - 0.05);
    shell.add(sg);
    shell.add(box(0.1, 0.1, 1.5, CREAM, sx * 1.15, 3.2, Z0 - 0.55));
  }
  shell.add(box(2.5, 0.1, 0.3, CREAM, 0, 3.72, Z0 - 0.05));
  // montants de verrière et rebord sous le pare-brise
  // montants dans le plan du pare-brise (même inclinaison que la vitre)
  for (const sx of [-1, 1]) { const mt = box(0.08, 1.9, 0.08, DARK, sx * 1.17, 3.04, Z0 - 0.78); mt.rotation.x = 0.8; shell.add(mt); }
  { const mid = box(0.06, 1.9, 0.06, DARK, 0, 3.04, Z0 - 0.78); mid.rotation.x = 0.8; shell.add(mid); }
  shell.add(box(2.4, 0.12, 0.2, DARK, 0, 2.37, Z0 - 1.45));
  // queue
  const tail = taperBox(2.9, 2.5, 5.6, 0.2, 0.25, CREAM, 0.35);
  tail.rotation.y = Math.PI;
  tail.position.set(0, 2.55, Z1 + 2.8);
  shell.add(tail);
  const fin = box(0.16, 2.8, 2.2, CREAM, 0, 4.6, 9.3);
  fin.rotation.x = 0.28;
  shell.add(fin);
  const finTip = box(0.18, 0.8, 1.5, CORAL, 0, 5.8, 9.75);
  finTip.rotation.x = 0.28;
  shell.add(finTip);
  shell.add(box(5.4, 0.14, 1.4, CREAM, 0, 3.2, 9.5));
  shell.add(box(1.0, 0.16, 1.42, TEAL, -2.3, 3.2, 9.5));
  shell.add(box(1.0, 0.16, 1.42, TEAL, 2.3, 3.2, 9.5));
  shell.traverse((o) => { if (o.isMesh && o.material === flatMat) o.material = shellMat; });

  // ailes : centre + aile droite fixes
  body.add(box(3.0, 0.3, 2.5, CREAM, 0, 3.95, -0.6));
  const wingR = buildWing();
  wingR.scale.x = -1;
  wingR.position.copy(SLOTS.wingL).setX(5.6);
  body.add(wingR);
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), METAL), flatMat);
    strut.position.set(sx * 3.0, 2.8, -0.4);
    strut.rotation.z = -sx * 1.15;
    body.add(strut);
  }
  // échelle sous la porte
  const ladder = new THREE.Group();
  ladder.add(box(0.06, 1.3, 0.06, METAL, 0, -0.65, -0.35));
  ladder.add(box(0.06, 1.3, 0.06, METAL, 0, -0.65, 0.35));
  for (let i = 0; i < 3; i++) ladder.add(box(0.06, 0.05, 0.7, METAL, 0, -0.3 - i * 0.4, 0));
  ladder.position.set(1.6, FLOOR, 2.2);
  body.add(ladder);

  // porte cargo (charnière côté arrière)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(1.48, 0, doorZ1);
  const doorLeaf = box(0.08, 1.7, 1.55, CREAM, 0, FLOOR + 0.87, -0.8);
  doorPivot.add(doorLeaf);
  doorPivot.add(box(0.09, 0.14, 1.55, CORAL, 0, FLOOR + 0.62, -0.8));
  doorPivot.add(glass(0.06, 0.45, 0.5, 0.01, FLOOR + 1.3, -0.8));
  body.add(doorPivot);

  // ── intérieur ──
  const cabin = new THREE.Group();
  body.add(cabin);
  // tapis et lambris
  cabin.add(box(1.0, 0.02, 5.2, '#c8553d', 0, FLOOR + 0.01, 0.4));
  cabin.add(box(0.9, 0.025, 4.8, '#e0a458', 0, FLOOR + 0.015, 0.4));
  cabin.add(box(0.04, 0.7, L - 0.2, WOOD, -1.38, FLOOR + 0.35, ZC));
  cabin.add(box(0.04, 0.7, doorZ0 - Z0 - 0.1, WOOD, 1.38, FLOOR + 0.35, (Z0 + doorZ0) / 2));
  cabin.add(box(0.04, 0.7, Z1 - doorZ1 - 0.1, WOOD, 1.38, FLOOR + 0.35, (Z1 + doorZ1) / 2));
  cabin.add(box(0.3, 0.04, doorZ1 - doorZ0 - 0.1, METAL, 1.36, FLOOR + 0.02, 2.2));   // seuil
  // sièges
  const seatMeshes = {};
  for (const s of SEATS) {
    if (s.bunk) continue;
    const g = buildSeat(s.pilot || s.id === 'copilot' ? '#2b3a55' : TEAL);
    g.position.set(s.x, FLOOR, s.z);
    cabin.add(g);
    seatMeshes[s.id] = g;
  }
  // manches et manettes
  for (const sx of [-0.62, 0.62]) {
    cabin.add(box(0.08, 0.6, 0.08, DARK, sx, FLOOR + 0.35, -4.12));
    cabin.add(box(0.36, 0.06, 0.06, DARK, sx, FLOOR + 0.68, -4.08));
  }
  cabin.add(box(0.3, 0.5, 0.45, DARK, 0, FLOOR + 0.25, -3.9));
  cabin.add(box(0.04, 0.2, 0.04, CORAL, -0.06, FLOOR + 0.58, -3.95));
  cabin.add(box(0.04, 0.2, 0.04, CORAL, 0.06, FLOOR + 0.58, -3.95));
  // couchette
  const bunk = new THREE.Group();
  bunk.add(box(0.85, 0.45, 2.0, WOOD, 0, 0.22, 0));
  bunk.add(box(0.8, 0.14, 1.95, '#e9e4d8', 0, 0.5, 0));
  bunk.add(box(0.82, 0.08, 1.3, '#b8a4ff', 0, 0.6, 0.3));
  bunk.add(box(0.55, 0.14, 0.35, '#fff4e0', 0, 0.62, -0.75));
  bunk.position.set(-0.8, FLOOR, 3.3);
  cabin.add(bunk);
  // caisse arrimée (visible quand chargée)
  const crateAboard = buildCrate();
  crateAboard.position.set(0.62, FLOOR + 0.6, 4.05);
  crateAboard.rotation.y = Math.PI / 2;
  crateAboard.scale.setScalar(0.8);
  crateAboard.visible = false;
  cabin.add(crateAboard);
  for (const z of [3.6, 4.5]) cabin.add(box(0.05, 1.1, 0.05, '#ffd166', 1.15, FLOOR + 0.55, z));
  // extincteur et carte
  const ext = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), CORAL), flatMat);
  ext.position.set(1.3, FLOOR + 0.35, 4.6);
  cabin.add(ext);
  const mapCv = document.createElement('canvas');
  mapCv.width = 256; mapCv.height = 160;
  const mapTex = new THREE.CanvasTexture(mapCv);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const mapBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshLambertMaterial({ map: mapTex }));
  mapBoard.position.set(-1.33, FLOOR + 1.35, 0.9);
  mapBoard.rotation.y = Math.PI / 2;
  cabin.add(mapBoard);
  // lampe de cabine
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
  for (const z of [-2, 0.5, 3]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 10), lampMat);
    l.position.set(0, 3.64, z);
    cabin.add(l);
  }
  const cabinLight = new THREE.PointLight('#ffcf8a', 3, 7, 1.5);
  cabinLight.position.set(0, 3.2, 0.5);
  cabin.add(cabinLight);
  const cockpitLight = new THREE.PointLight('#ffcf8a', 1.5, 4, 1.5);
  cockpitLight.position.set(0, 3.1, -3.4);
  cabin.add(cockpitLight);

  // projecteurs de proue
  const projMat = new THREE.MeshBasicMaterial({ color: '#555' });
  for (const sx of [-0.45, 0.45]) {
    const pj = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.15, 10), projMat);
    pj.rotation.x = Math.PI / 2;
    pj.position.set(sx, 1.85, -6.2);
    body.add(pj);
  }
  const projLight = new THREE.PointLight('#ffe6a8', 0, 30, 1.4);
  projLight.position.copy(PLANE_POINTS.projector).add(new THREE.Vector3(0, 0, -1));
  body.add(projLight);

  // pièces installables
  const parts = {
    engineL: buildEngine(false),
    engineR: buildEngine(true),
    wingL: buildWing(),
    prop: buildProp(),
    floats: buildFloats(),
    dashboard: buildDashboard(),
    wheels: buildWheels(),
  };
  for (const [k, g] of Object.entries(parts)) {
    g.position.copy(SLOTS[k]);
    body.add(g);
  }
  parts.wheels.visible = false;
  const spinners = [parts.engineR.userData.prop, parts.prop.userData.spin];

  const ghostMat = new THREE.MeshBasicMaterial({ color: '#5ef2c2', transparent: true, opacity: 0.35, depthWrite: false });
  const ghosts = {};
  for (const [k, g] of Object.entries(parts)) {
    const gh = g.clone(true);
    gh.traverse((o) => { if (o.isMesh) o.material = ghostMat; });
    gh.visible = false;
    body.add(gh);
    ghosts[k] = gh;
  }

  // ── améliorations achetées au comptoir (masquées au départ) ──
  const ups = {};
  const up = (k) => { const g = new THREE.Group(); g.visible = false; g.userData.up = true; body.add(g); ups[k] = g; return g; };
  const stove = up('stove');
  stove.add(box(0.5, 0.55, 0.45, '#2b2f38', 0, 0.35, 0));
  stove.add(box(0.54, 0.06, 0.49, '#4a4f5a', 0, 0.64, 0));
  stove.add(box(0.07, 0.07, 0.07, METAL, -0.2, 0.05, -0.17)); stove.add(box(0.07, 0.07, 0.07, METAL, 0.2, 0.05, 0.17));
  stove.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), new THREE.MeshLambertMaterial({ color: '#33373f' })).translateY(1.35));
  const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false }));
  ember.position.set(0.26, 0.32, 0); ember.rotation.y = Math.PI / 2;
  stove.add(ember);
  const stoveLight = new THREE.PointLight('#ff9a4a', 0, 4, 1.5);
  stoveLight.position.set(0.5, 0.5, 0);
  stove.add(stoveLight);
  stove.position.set(-1.02, FLOOR, 1.85);
  const lamps = up('lamps');
  const bulbCols = ['#ffd166', '#ff6b5b', '#5ef2c2', '#b8a4ff'];
  for (let i = 0; i < 16; i++) {
    const z = Z0 + 0.4 + i * ((L - 0.8) / 15);
    for (const sx of [-1, 1]) {
      const bb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: bulbCols[(i + (sx > 0 ? 2 : 0)) % 4], toneMapped: false }));
      bb.position.set(sx * 0.95, 3.5 - Math.abs(Math.sin(i * 1.3)) * 0.08, z);
      lamps.add(bb);
    }
  }
  const rug = up('rug');
  const rugM = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 16), '#5ef2c2'), flatMat);
  rugM.scale.set(1, 1, 1.6); rugM.position.set(0, FLOOR + 0.035, -0.4);
  rug.add(rugM);
  for (const [x, z] of [[1.1, 4.55], [-1.1, -1.5]]) {
    const pot = new THREE.Group();
    pot.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.14, 0.1, 0.25, 8), '#c0704f'), flatMat).translateY(0.12));
    for (let k = 0; k < 5; k++) { const lf = new THREE.Mesh(prep(new THREE.ConeGeometry(0.06, 0.45, 4), '#3f9b4b'), flatMat); lf.position.set(Math.cos(k * 1.3) * 0.06, 0.4, Math.sin(k * 1.3) * 0.06); lf.rotation.set(Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4); pot.add(lf); }
    pot.position.set(x, FLOOR, z);
    rug.add(pot);
  }
  const tank = up('tank');
  tank.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.4, 0.4, 3.2, 10).rotateX(Math.PI / 2), '#ffd166'), flatMat));
  for (const z of [-1.8, 1.8]) tank.add(new THREE.Mesh(prep(new THREE.ConeGeometry(0.4, 0.5, 10).rotateX(z < 0 ? -Math.PI / 2 : Math.PI / 2), '#ffd166'), flatMat).translateZ(z));
  tank.position.set(0, 0.95, 0.4);
  const engUp = up('engine');
  for (const sx of [-3.7, 3.7]) {
    for (const dz of [-0.2, 0.3]) { const ring = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12).rotateX(Math.PI / 2), '#ff6b5b'), flatMat); ring.position.set(sx, 3.55, -1.3 + dz); engUp.add(ring); }
    const ex = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6).rotateX(Math.PI / 2), '#33373f'), flatMat);
    ex.position.set(sx + 0.45, 3.2, -0.2);
    engUp.add(ex);
  }

  // trous de crash et tôles soudées
  const holes = HOLES.map((h) => {
    const g = new THREE.Group();
    g.position.copy(h.p);
    g.rotation.y = h.n.x < 0 ? -Math.PI / 2 : Math.PI / 2;
    const shape = new THREE.Shape();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = 0.36 + (i % 2) * 0.12; if (i) shape.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r); }
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#16110e', side: THREE.DoubleSide }));
    hole.position.z = 0.012;
    g.add(hole);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.75, 10), new THREE.MeshBasicMaterial({ color: '#3a302a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    scorch.position.z = 0.008;
    g.add(scorch);
    const plate = buildPlate();
    plate.position.z = 0.05;
    g.add(plate);
    body.add(g);
    return { g, hole, scorch, plate };
  });
  const setHole = (i, st) => {
    const h = holes[i];
    if (!h) return;
    h.g.visible = st > 0;
    h.hole.visible = h.scorch.visible = st === 1;
    h.plate.visible = st >= 2;
    h.plate.rotation.z = st === 2 ? 0.12 : 0;   // tôle posée de travers tant qu'elle n'est pas soudée
  };
  holes.forEach((_, i) => setHole(i, 0));

  // trophées : un souvenir par boss vaincu
  const tk = up('trophyKing');
  tk.add(box(0.5, 0.4, 0.04, WOOD, 0, 0, 0));
  const claw = new THREE.Mesh(prep(new THREE.ConeGeometry(0.12, 0.5, 5).rotateZ(-Math.PI / 2), '#e0553d'), flatMat);
  claw.position.set(0.05, 0.05, 0.12); tk.add(claw);
  const claw2 = new THREE.Mesh(prep(new THREE.ConeGeometry(0.08, 0.35, 5).rotateZ(-Math.PI / 2 - 0.5), '#ff8a5b'), flatMat);
  claw2.position.set(0.05, -0.1, 0.12); tk.add(claw2);
  tk.position.set(1.4, FLOOR + 1.45, -1.2); tk.rotation.y = -Math.PI / 2;
  const tw = up('trophyWarden');
  tw.add(box(0.5, 0.4, 0.04, WOOD, 0, 0, 0));
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(prep(new THREE.ConeGeometry(0.06, 0.45, 5), '#2a2140'), flatMat); horn.position.set(sx * 0.12, 0.12, 0.1); horn.rotation.z = -sx * 0.5; tw.add(horn); }
  const wEye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff8fab', toneMapped: false }));
  wEye.position.set(0, -0.05, 0.08); tw.add(wEye);
  tw.position.set(-1.4, FLOOR + 1.5, -2.6); tw.rotation.y = Math.PI / 2;

  // moins d'appels de dessin : coque et cabine fusionnées
  mergeStatic(shell, shellMat);
  mergeStatic(cabin, flatMat, (o) => o === crateAboard);
  root.traverse((o) => { if (o.isMesh && !o.userData.glass && o.material !== glassMat && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    root, body, parts, ghosts, spinners, projLight, projMat, doorPivot, crateAboard, seatMeshes,
    cabinLights: [cabinLight, cockpitLight], mapCanvas: mapCv, mapTex, ups, stoveLight, setHole,
    setUpgrade(k, on) { if (ups[k]) ups[k].visible = !!on; if (k === 'stove') stoveLight.intensity = on ? 2.2 : 0; },
  };
}

// coque visible des deux côtés (vue de l'intérieur)
const shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

// collisions intérieures (repère local, boîtes sur le plan xz)
export function cabinColliders(crateLoaded, ups) {
  const b = (x0, x1, z0, z1) => ({ type: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const out = [
    b(-1.3, 1.3, -4.9, -4.25),                // tableau de bord
    b(-0.15, 0.15, -4.15, -3.65),             // manettes
  ];
  for (const s of SEATS) {
    if (s.bunk) out.push(b(s.x - 0.43, s.x + 0.43, s.z - 1.0, s.z + 1.0));
    else out.push(b(s.x - 0.3, s.x + 0.3, s.z - 0.25, s.z + 0.38));
  }
  if (crateLoaded) out.push(b(0.1, 1.2, 3.5, 4.6));
  if (ups && ups.has('stove')) out.push(b(-1.3, -0.75, 1.6, 2.1));
  return out;
}
