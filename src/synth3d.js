// Finale du chapitre 4 : le synthétiseur de l'Institut Hélios. Trois postes à manipuler dans le monde, sans fenêtre d'énigme.
//  A · séquenceur ARN : l'hélice, sous sa cloche, joue une suite de bases (couleur, note, lettre en hologramme).
//      On la rejoue sur les quatre gros boutons du pupitre. Trois manches (3, 4 puis 5 bases) : chaque manche prolonge la précédente.
//  B · refroidissement : une table de 24 raccords en 3D. On vise un raccord : E (ou R, ou la molette) le fait pivoter d'un quart
//      de tour. L'azote liquide s'allume dans les tuyaux dès qu'ils sont reliés à la bonbonne ; il faut atteindre la cuve.
//  C · centrifugeuse : le tube d'échantillon (rouge) est en place. On charge des contrepoids (bleus) pour équilibrer le rotor,
//      puis on règle le régime au levier (E maintenu + souris) et on tient l'aiguille dans le vert. Le régime dérive : il faut
//      corriger. Rotor déséquilibré : il broute puis s'arrête d'urgence. Trop vite : surchauffe, arrêt d'urgence.
//  Les trois postes réglés, la dose file par le tube pneumatique jusqu'au passe-plat de la salle blanche : on l'envoie à Marthe.
// État partagé (énigmes du monde) : sA = [manche, rang], sB = quarts de tour des raccords, sC = contrepoids chargés (bits), sT = essais.
import * as THREE from 'three';
import { prep, flatMat, textTexture } from './terrain.js';
import { I4, FLAT4 } from './island4.js';
import { glyphTex, makeLcd } from './devices.js';
import { makePipes } from './interact.js';
import { rng } from './noise.js';

const BASES = [
  { k: 'A', col: '#ff5a4d', note: 392 },
  { k: 'U', col: '#ffd166', note: 523 },
  { k: 'G', col: '#5ef2c2', note: 659 },
  { k: 'C', col: '#4d8bff', note: 784 },
];
const ROUNDS = [3, 4, 5];
const STEP = 0.72, LIT = 0.5, PAUSE = 1.8;      // rythme de l'hélice
const TILE = 0.5;                                // raccords de 50 cm
const BAND = [0.6, 0.74];                        // régime visé (fraction du maximum)
const RED = 1.0;                                 // au-delà : surchauffe
const SPIN_HOLD = 4;                             // secondes dans le vert
const PASS = { x: 5, z: -145.4 };                // passe-plat de la salle blanche

function boxM(w, h, d, col, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function cyl(rt, rb, h, col, x = 0, y = 0, z = 0, seg = 12) { const o = new THREE.Mesh(prep(new THREE.CylinderGeometry(rt, rb, h, seg), col), flatMat); o.position.set(x, y, z); o.castShadow = true; return o; }
function label(lines, bg, fg, w, h, cw = 512, ch = 128) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(lines, bg, fg, cw, ch), toneMapped: false })); }
const tag = (o, part) => o.traverse((q) => { q.userData.part = part; });
const rot4 = (m) => ((m << 1) | (m >> 3)) & 15;
const rotN = (m, n) => { for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = rot4(m); return m; };
const bits = (m) => { let n = 0; for (let k = 0; k < 6; k++) n += (m >> k) & 1; return n; };
const glass = new THREE.MeshLambertMaterial({ color: '#bfe6f2', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

// cadran du régime : 0 → 120 %, zone verte (réglage visé) et zone rouge (surchauffe)
function rpmFace() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2, R = S * 0.44;
  const ang = (p) => ((-135 + (p / 1.2) * 270) - 90) * Math.PI / 180;
  g.fillStyle = '#10162b'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(c, c, S / 2 - 6, 0, Math.PI * 2); g.fill();
  const arc = (a, b, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(c, c, R - w / 2, ang(a), ang(b)); g.stroke(); };
  arc(0, 1.2, '#c9c4b6', 10); arc(RED, 1.2, '#e0332a', 20); arc(BAND[0], BAND[1], '#2fbf71', 28);
  g.strokeStyle = '#10162b'; g.fillStyle = '#10162b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 20px monospace';
  for (let i = 0; i <= 12; i++) {
    const a = ang(i / 10), l = i % 2 ? 12 : 22;
    g.lineWidth = i % 2 ? 2 : 4;
    g.beginPath(); g.moveTo(c + Math.cos(a) * (R - 28), c + Math.sin(a) * (R - 28)); g.lineTo(c + Math.cos(a) * (R - 28 - l), c + Math.sin(a) * (R - 28 - l)); g.stroke();
    if (!(i % 2)) g.fillText(String(i * 10), c + Math.cos(a) * (R - 66), c + Math.sin(a) * (R - 66));
  }
  g.font = 'bold 18px sans-serif'; g.fillText('RÉGIME %', c, c + 60);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const Synth3DMixin = {
  // ── construction (dans le groupe de l'île 4 ; rappelée si l'île est reconstruite) ──
  buildSynth3D() {
    const I = this.island4; if (!I) return;
    this.removeDevices?.('i4s');
    const g = new THREE.Group();
    I.group.add(g);
    const Y = FLAT4, ST = I4.synthSt, cx = I.cx, cz = I.cz;
    const col = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; I.colliders.push(c); this.colliders.push(c); return c; };
    const colC = (x, z, r) => { const c = { type: 'circle', x: cx + x, z: cz + z, r }; I.colliders.push(c); this.colliders.push(c); return c; };
    const W = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
    const S = this.s4 = { g, A: { demoT: 0, fail: 0, key: '' }, B: { tiles: [], mine: -99, doneT: 0 }, C: { thr: 0, rpm: 0, prog: 0, drift: 0, wobble: 0, heat: 0, lockT: 0, tick: 0 }, dose: { t: 0 }, layoutT: -1, sent: {} };
    S.points = { A: W(ST.A.x, Y + 1.1, ST.A.z + 0.9), B: W(ST.B.x, Y + 1.1, ST.B.z + 1.5), C: W(ST.C.x + 2.4, Y + 1.1, ST.C.z + 2.0), pass: W(PASS.x, Y + 1.2, PASS.z + 0.9), synth: W(0, Y, -139) };

    // ── A · séquenceur ARN : hélice sous cloche, pupitre à quatre boutons ──
    {
      const A = S.A, x = ST.A.x, z = ST.A.z, hz = z - 4;
      g.add(cyl(1.25, 1.35, 0.6, '#3a3f48', x, Y + 0.3, hz, 18));
      g.add(cyl(1.12, 1.12, 0.1, '#ff5a4d', x, Y + 0.64, hz, 18));
      g.add(cyl(1.25, 1.25, 0.3, '#3a3f48', x, Y + 4.3, hz, 18));
      g.add(cyl(0.5, 0.7, 0.3, '#5d6470', x, Y + 4.6, hz, 12));
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.5, 24, 1, true), glass); bell.position.set(x, Y + 2.4, hz); g.add(bell);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.add(boxM(0.08, 3.5, 0.08, '#8d9299', x + Math.cos(a) * 1.08, Y + 2.4, hz + Math.sin(a) * 1.08)); }
      colC(x, hz, 1.35);
      const helix = new THREE.Group(); helix.position.set(x, Y + 0.85, hz); g.add(helix);
      A.rungMat = new THREE.MeshLambertMaterial({ color: '#e9ecef', emissive: '#000000' });
      const sA = new THREE.MeshLambertMaterial({ color: '#b8c6d8' }), sB = new THREE.MeshLambertMaterial({ color: '#8fa3b8' });
      const ball = new THREE.SphereGeometry(0.1, 8, 6), rung = new THREE.BoxGeometry(1.1, 0.05, 0.05);
      for (let i = 0; i < 16; i++) {
        const y = i * 0.2, a = i * 0.5;
        const b1 = new THREE.Mesh(ball, sA); b1.position.set(Math.cos(a) * 0.55, y, Math.sin(a) * 0.55); helix.add(b1);
        const b2 = new THREE.Mesh(ball, sB); b2.position.set(-Math.cos(a) * 0.55, y, -Math.sin(a) * 0.55); helix.add(b2);
        const rg = new THREE.Mesh(rung, A.rungMat); rg.position.y = y; rg.rotation.y = -a; helix.add(rg);
      }
      A.helix = helix;
      // hologramme de la base jouée, au-dessus de la cloche (face au pupitre)
      A.holo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: glyphTex('A', '#10162b', '#ff5a4d', 128), transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false }));
      A.holo.position.set(x, Y + 5.4, hz + 0.2); A.holo.visible = false; g.add(A.holo);
      A.holoTex = BASES.map((b) => glyphTex(b.k, '#10162b', b.col, 128)).concat([glyphTex('✔', '#10162b', '#5ef2c2', 128), glyphTex('✖', '#10162b', '#ff3030', 128)]);
      // pupitre
      const desk = new THREE.Group(); desk.position.set(x, Y, z); g.add(desk);
      desk.add(boxM(2.6, 0.95, 0.9, '#3a3f48', 0, 0.475, 0));
      desk.add(boxM(2.66, 0.06, 0.96, '#ff5a4d', 0, 0.98, 0));
      desk.add(boxM(2.6, 0.75, 0.08, '#2a2f38', 0, 1.38, -0.42));
      for (const dx of [-1.25, 1.25]) desk.add(boxM(0.1, 0.8, 0.12, '#8d9299', dx, 1.38, -0.4));
      col(x - 1.3, x + 1.3, z - 0.45, z + 0.45);
      A.lcd = makeLcd(1.3, 0.42, 416, 134); A.lcd.mesh.position.set(0, 1.43, -0.375); desk.add(A.lcd.mesh);
      const t = label(['A · SÉQUENCEUR ARN'], '#10162b', '#ff5a4d', 1.8, 0.22, 768, 94); t.position.set(0, 1.9, -0.37); desk.add(t);
      desk.add(boxM(1.84, 0.26, 0.04, '#2a2f38', 0, 1.9, -0.4));
      A.btns = BASES.map((b, i) => {
        const grp = new THREE.Group(); grp.position.set(-0.84 + i * 0.56, 1.01, 0.1); desk.add(grp);
        grp.add(cyl(0.21, 0.23, 0.06, '#1b1e23', 0, 0.03, 0, 18));
        const capMat = new THREE.MeshLambertMaterial({ color: b.col, emissive: '#000000' });
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.1, 18), capMat); cap.position.y = 0.11; grp.add(cap);
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: glyphTex(b.k, b.col, '#10162b'), toneMapped: false }));
        lbl.rotation.x = -Math.PI / 2; lbl.position.y = 0.162; cap.add(lbl); lbl.position.y = 0.051;
        tag(grp, i);
        return { grp, cap, capMat, col: new THREE.Color(b.col), press: 0, glow: 0, hover: false };
      });
      this.addDevice({
        tag: 'i4s', obj: desk, range: 2.4,
        active: () => this.synthOn() && !this.flags.synthA,
        prompt: (i) => `Base <b style="color:${BASES[i].col}">${BASES[i].k}</b> · <kbd>E</kbd> appuyer · rejouez la suite jouée par l'hélice`,
        press: (i) => this.pressSeqA(i),
        hover: (i, on) => { if (A.btns[i]) A.btns[i].hover = on; },
      });
    }

    // ── B · refroidissement : table de raccords, bonbonne d'azote, cuve ──
    {
      const B = S.B, x = ST.B.x, z = ST.B.z;
      g.add(boxM(3.5, 0.08, 2.5, '#3a3f48', x, Y + 0.96, z));
      g.add(boxM(3.56, 0.1, 0.06, '#4d8bff', x, Y + 0.95, z + 1.27));
      for (const [dx, dz] of [[-1.65, -1.15], [1.65, -1.15], [-1.65, 1.15], [1.65, 1.15]]) g.add(boxM(0.1, 0.92, 0.1, '#8d9299', x + dx, Y + 0.46, z + dz));
      g.add(boxM(3.4, 0.05, 2.4, '#1b1e23', x, Y + 0.3, z));
      col(x - 1.75, x + 1.75, z - 1.25, z + 1.25);
      col(x - 2.85, x - 1.75, z - 1.25, z + 1.25); col(x + 1.75, x + 3.0, z - 1.25, z + 1.25);
      const t = label(['B · REFROIDISSEMENT', 'reliez l\'azote ❄ à la cuve ⚗'], '#10162b', '#6fb7ff', 1.9, 0.42, 768, 170); t.position.set(x, Y + 1.25, z + 1.3); g.add(t);
      g.add(boxM(1.96, 0.46, 0.04, '#2a2f38', x, Y + 1.25, z + 1.27));
      B.dry = new THREE.MeshLambertMaterial({ color: '#8a93b8' });
      B.wet = new THREE.MeshLambertMaterial({ color: '#b6f6ff', emissive: '#2bb8d8', emissiveIntensity: 0.9 });
      B.plateMat = new THREE.MeshLambertMaterial({ color: '#2a2f38' });
      B.geo = { plate: new THREE.BoxGeometry(0.46, 0.03, 0.46), hub: new THREE.CylinderGeometry(0.075, 0.075, 0.1, 10), arm: new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8).rotateX(Math.PI / 2), stub: new THREE.CylinderGeometry(0.05, 0.05, 1, 8).rotateZ(Math.PI / 2) };
      B.tileRoot = new THREE.Group(); B.tileRoot.position.set(x, Y + 1.0, z); g.add(B.tileRoot);
      // bonbonne d'azote (ouest) et cuve (est) : leur rangée change avec le circuit
      B.tank = new THREE.Group(); B.tank.position.set(x - 2.3, Y, z); g.add(B.tank);
      B.tank.add(cyl(0.42, 0.42, 1.7, '#e9f2f8', 0, 0.85, 0, 16)); B.tank.add(cyl(0.3, 0.42, 0.25, '#e9f2f8', 0, 1.82, 0, 16));
      B.tank.add(cyl(0.44, 0.44, 0.2, '#4d8bff', 0, 1.2, 0, 16)); B.tank.add(cyl(0.08, 0.08, 0.25, '#8d9299', 0, 2.05, 0));
      B.tank.add(cyl(0.12, 0.12, 0.06, '#ff5a4d', 0, 2.2, 0));
      const tl = label(['AZOTE ❄'], '#10162b', '#b6f6ff', 0.62, 0.2, 256, 84); tl.position.set(0, 1.5, 0.425); B.tank.add(tl);
      const s1 = new THREE.Mesh(B.geo.stub, B.wet); s1.scale.x = 0.5; s1.position.set(0.55, 1.09, 0); B.tank.add(s1);
      B.vat = new THREE.Group(); B.vat.position.set(x + 2.35, Y, z); g.add(B.vat);
      B.vat.add(cyl(0.5, 0.45, 1.0, '#b8bec6', 0, 0.5, 0, 16)); B.vat.add(cyl(0.53, 0.53, 0.08, '#3a3f48', 0, 1.02, 0, 16));
      B.liquidMat = new THREE.MeshBasicMaterial({ color: '#1f3a4a', toneMapped: false });
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 16), B.liquidMat); liq.position.y = 1.05; B.vat.add(liq);
      const vl = label(['CUVE ⚗'], '#10162b', '#5ef2c2', 0.62, 0.2, 256, 84); vl.position.set(0, 0.62, 0.5); B.vat.add(vl);
      B.vatStub = new THREE.Mesh(B.geo.stub, B.dry); B.vatStub.scale.x = 0.55; B.vatStub.position.set(-0.6, 1.09, 0); B.vat.add(B.vatStub);
      this.addDevice({
        tag: 'i4s', obj: B.tileRoot, range: 3.0,
        active: () => this.synthOn() && !this.flags.synthB,
        prompt: () => 'Raccord · <kbd>E</kbd> ou molette : quart de tour · <kbd>R</kbd> : sens inverse',
        press: (i) => this.turnTileB(i, 1),
        alt: (i) => this.turnTileB(i, -1),
        wheel: (i, d) => this.turnTileB(i, d),
        hover: (i, on) => { const q = B.tiles[i]; if (q) q.hover = on; },
      });
    }

    // ── C · centrifugeuse : rotor à six logements, portoir de contrepoids, pupitre du régime ──
    {
      const C = S.C, x = ST.C.x, z = ST.C.z;
      C.body = new THREE.Group(); C.body.position.set(x, Y, z); g.add(C.body);
      C.body.add(cyl(1.25, 1.35, 0.95, '#e9ecef', 0, 0.475, 0, 24));
      C.body.add(cyl(1.28, 1.28, 0.08, '#ffd166', 0, 0.96, 0, 24));
      C.body.add(cyl(1.02, 1.02, 0.04, '#1b1e23', 0, 0.95, 0, 24));
      C.body.add(boxM(0.6, 0.35, 0.05, '#33373f', 0, 0.6, 1.3));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 24), glass); lid.rotation.x = -1.25; lid.position.set(0, 1.55, -1.1); C.body.add(lid);
      C.body.add(boxM(0.5, 0.12, 0.12, '#8d9299', 0, 1.0, -1.28));
      colC(x, z, 1.35);
      const cl = label(['C · CENTRIFUGEUSE'], '#10162b', '#ffd166', 1.2, 0.2, 512, 84); cl.position.set(0, 0.62, 1.358); C.body.add(cl);
      C.rotor = new THREE.Group(); C.rotor.position.set(x, Y + 0.99, z); g.add(C.rotor);
      C.rotor.add(cyl(0.9, 0.9, 0.08, '#b8bec6', 0, 0, 0, 28));
      C.rotor.add(cyl(0.18, 0.18, 0.2, '#3a3f48', 0, 0.08, 0, 12));
      for (let k = 0; k < 3; k++) { const bar = boxM(1.7, 0.02, 0.1, '#8d9299', 0, 0.05, 0); bar.rotation.y = k * Math.PI / 3 + Math.PI / 6; C.rotor.add(bar); }
      const tubeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.4, 10), liqGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.24, 10), capGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10);
      const tubeMat = new THREE.MeshLambertMaterial({ color: '#dfe8ee', transparent: true, opacity: 0.55 });
      C.sampleLiq = new THREE.MeshLambertMaterial({ color: '#ff5a4d', emissive: '#551a14' });
      C.weightLiq = new THREE.MeshLambertMaterial({ color: '#6fb7ff', emissive: '#12304a' });
      const mkTube = (liqMat, capCol) => {
        const tb = new THREE.Group();
        const glassT = new THREE.Mesh(tubeGeo, tubeMat); glassT.position.y = 0.2; tb.add(glassT);
        const lq = new THREE.Mesh(liqGeo, liqMat); lq.position.y = 0.13; tb.add(lq);
        tb.add(cyl(0.075, 0.075, 0.06, capCol, 0, 0.42, 0, 10));
        return { tb, lq };
      };
      C.slots = [];
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, sg = new THREE.Group(); sg.position.set(Math.cos(a) * 0.58, 0, Math.sin(a) * 0.58); C.rotor.add(sg);
        sg.add(cyl(0.12, 0.12, 0.1, '#1b1e23', 0, 0.02, 0, 12));
        const ringMat = new THREE.MeshBasicMaterial({ color: '#3a3f48', toneMapped: false });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 16).rotateX(Math.PI / 2), ringMat); ring.position.y = 0.075; sg.add(ring);
        const t = mkTube(C.weightLiq, '#4d8bff'); sg.add(t.tb);
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.2; sg.add(hit);
        tag(sg, k);
        C.slots.push({ sg, tube: t.tb, lq: t.lq, ringMat, hover: false });
      }
      // portoir des contrepoids, sur un chariot au sud
      const rack = new THREE.Group(); rack.position.set(x - 0.2, Y, z + 2.0); g.add(rack);
      rack.add(boxM(1.0, 0.85, 0.55, '#e9ecef', 0, 0.425, 0)); rack.add(boxM(1.04, 0.05, 0.6, '#ffd166', 0, 0.87, 0));
      rack.add(boxM(0.9, 0.12, 0.25, '#3a3f48', 0, 0.95, 0));
      col(x - 0.72, x + 0.32, z + 1.72, z + 2.28);
      C.rackTubes = [];
      for (let k = 0; k < 5; k++) { const t = mkTube(C.weightLiq, '#4d8bff'); t.tb.position.set(-0.34 + k * 0.17, 0.9, 0); rack.add(t.tb); C.rackTubes.push(t.tb); }
      const rl = label(['CONTREPOIDS'], '#10162b', '#6fb7ff', 0.8, 0.16, 384, 76); rl.position.set(0, 0.6, 0.28); rack.add(rl);
      // pupitre du régime : cadran, écran, levier
      const pd = new THREE.Group(); pd.position.set(x + 2.4, Y, z + 1.3); g.add(pd);
      pd.add(boxM(1.1, 1.05, 0.6, '#3a3f48', 0, 0.525, 0));
      const top = boxM(1.14, 0.06, 0.66, '#ffd166', 0, 1.06, 0); pd.add(top);
      pd.add(boxM(1.1, 0.7, 0.1, '#2a2f38', 0, 1.42, -0.25));
      col(x + 1.85, x + 2.95, z + 1.0, z + 1.6);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), new THREE.MeshBasicMaterial({ map: rpmFace(), toneMapped: false })); face.position.set(-0.24, 1.45, -0.195); pd.add(face);
      C.needle = new THREE.Group(); C.needle.position.set(-0.24, 1.45, -0.19); pd.add(C.needle);
      const nd = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.008), new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false })); nd.position.y = 0.09; C.needle.add(nd);
      C.lcd = makeLcd(0.44, 0.3, 256, 176); C.lcd.mesh.position.set(0.27, 1.45, -0.195); pd.add(C.lcd.mesh);
      C.lever = new THREE.Group(); C.lever.position.set(0.3, 1.1, 0.08); pd.add(C.lever);
      C.lever.add(boxM(0.3, 0.06, 0.24, '#1b1e23', 0, -0.02, 0));
      C.leverArm = new THREE.Group(); C.lever.add(C.leverArm);
      C.leverArm.add(boxM(0.05, 0.42, 0.05, '#b8bec6', 0, 0.21, 0));
      C.leverArm.add(cyl(0.06, 0.06, 0.16, '#ff5a4d', 0, 0.46, 0, 10));
      const lh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 0.35), new THREE.MeshBasicMaterial({ visible: false })); lh.position.y = 0.3; C.leverArm.add(lh);
      tag(C.lever, 'lever');
      const pl = label(['RÉGIME ⟳'], '#10162b', '#ffd166', 0.5, 0.14, 256, 72); pl.position.set(0.3, 1.1, 0.305); pd.add(pl);
      this.addDevice({
        tag: 'i4s', obj: C.rotor, range: 2.6,
        active: () => this.synthOn() && !this.flags.synthC && C.rpm < 0.05,
        prompt: (k) => (k === this.sampleSlotC() ? 'Tube d\'<b>échantillon</b> (rouge) : il reste en place' : (this.sCmask() >> k) & 1 ? '<kbd>E</kbd> retirer ce contrepoids' : `<kbd>E</kbd> placer un contrepoids ici · portoir : ${5 - bits(this.sCmask())}`),
        press: (k) => this.toggleTubeC(k),
        hover: (k, on) => { if (C.slots[k]) C.slots[k].hover = on; },
      });
      this.addDevice({
        tag: 'i4s', obj: C.lever, range: 2.4,
        active: () => this.synthOn() && !this.flags.synthC,
        prompt: () => `Levier du régime : <b>${Math.round(C.rpm * 100)} %</b> · <kbd>E</kbd> maintenu + souris ↑↓ · molette : un cran`,
        grab: {
          move: (dx, dy, p, dt, fine) => this.setThrottleC(C.thr - dy * (fine ? 0.0005 : 0.0022)),
          prompt: () => `Régime <b>${Math.round(C.rpm * 100)} %</b> · souris ↑↓ · <kbd>Maj</kbd> fin · tenez l'aiguille dans le vert · relâchez <kbd>E</kbd>`,
        },
        wheel: (p, d) => this.setThrottleC(C.thr + d * 0.03),
      });
    }

    // ── synthétiseur : trois tubes de niveau (un par poste) autour de la cloche ──
    {
      S.levels = {};
      for (const [k, a, c] of [['A', Math.PI, '#ff5a4d'], ['B', 0, '#4d8bff'], ['C', -Math.PI / 2, '#ffd166']]) {
        const px = Math.cos(a) * 2.0, pz = -139 + Math.sin(a) * 2.0;
        g.add(cyl(0.3, 0.3, 0.2, '#3a3f48', px, Y + 1.3, pz, 12)); g.add(cyl(0.3, 0.3, 0.2, '#3a3f48', px, Y + 4.1, pz, 12));
        const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.6, 14, 1, true), glass); gl.position.set(px, Y + 2.7, pz); g.add(gl);
        const lq = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.56, 12).translate(0, 1.28, 0), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
        lq.position.set(px, Y + 1.42, pz); lq.scale.y = 0.001; g.add(lq);
        S.levels[k] = { lq, v: 0 };
      }
    }

    // ── passe-plat de la salle blanche et tube pneumatique depuis le synthétiseur ──
    {
      const D = S.dose, px = PASS.x, pz = PASS.z;
      g.add(boxM(1.6, 1.0, 0.8, '#b8bec6', px, Y + 0.5, pz + 0.5)); g.add(boxM(1.66, 0.06, 0.86, '#3a3f48', px, Y + 1.02, pz + 0.5));
      col(px - 0.8, px + 0.8, pz + 0.1, pz + 0.9);
      g.add(boxM(0.9, 0.75, 0.9, '#dfe3e8', px, Y + 1.43, -146)); g.add(boxM(0.92, 0.08, 0.92, '#1f8a8a', px, Y + 1.84, -146));
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), glass); win.position.set(px, Y + 1.43, -145.54); g.add(win);
      const pl = label(['PASSE-PLAT', 'salle blanche'], '#10162b', '#5ef2c2', 0.8, 0.2, 384, 96); pl.position.set(px, Y + 1.94, -145.53); g.add(pl);
      D.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#552222', toneMapped: false })); D.lamp.position.set(px + 0.35, Y + 1.72, -145.53); g.add(D.lamp);
      // tube pneumatique : du passe-plat au plafond, puis jusqu'à la couronne du synthétiseur
      const TY = Y + 6.4;
      D.path = [new THREE.Vector3(2.0, Y + 5.9, -139), new THREE.Vector3(px, TY, -139), new THREE.Vector3(px, TY, -145.9), new THREE.Vector3(px, Y + 1.5, -145.9)];
      for (let i = 0; i < D.path.length - 1; i++) {
        const a = D.path[i], b = D.path[i + 1], len = a.distanceTo(b);
        const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, len, 10, 1, true), glass);
        tb.position.copy(a).add(b).multiplyScalar(0.5);
        tb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(tb);
      }
      D.capsule = new THREE.Group(); g.add(D.capsule);
      D.capsule.add(cyl(0.085, 0.085, 0.28, '#dfe8ee', 0, 0, 0, 10));
      D.glowMat = new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), D.glowMat); D.capsule.add(core);
      D.capsule.visible = false;
    }
    this.layoutSynth3D(true);
  },

  // ── état partagé ──
  s4Val(k, d) { const v = this.puzzles?.[k]; return v === undefined || v === null ? d : v; },
  s4Tries() { return +this.s4Val('sT', 0) || 0; },
  synthOn() { const f = this.flags; return this.mode === 'explore' && f.decon4 && !f.doseReady && !f.cured; },
  // suite de bases de la partie (change à chaque essai raté) : jamais trois fois la même base de suite
  seqA() {
    const r = rng(((this.seed ^ 0xa11ce) + this.s4Tries() * 977) >>> 0), out = [];
    for (let i = 0; i < ROUNDS[ROUNDS.length - 1]; i++) { let b; do b = Math.floor(r() * 4); while (i >= 2 && b === out[i - 1] && b === out[i - 2]); out.push(b); }
    return out;
  },
  sampleSlotC() { return Math.floor(rng(((this.seed ^ 0xce27) + this.s4Tries() * 31) >>> 0)() * 6); },
  sCmask() { return (+this.s4Val('sC', 0) || 0) & ~(1 << this.sampleSlotC()) & 63; },
  sBArr() { const v = this.puzzles?.sB, n = this.s4?.B.tiles.length || 24; return Array.isArray(v) && v.length === n ? v : new Array(n).fill(0); },
  // nouvel essai (ou premier affichage) : circuit, logement de l'échantillon, réglages locaux
  layoutSynth3D(force) {
    const S = this.s4; if (!S) return;
    const T = this.s4Tries();
    if (!force && S.layoutT === T) return;
    S.layoutT = T;
    const B = S.B, pz = B.pz = makePipes(((this.seed ^ 0x5171) + T * 7919) >>> 0);
    B.tileRoot.clear(); B.tiles = []; B.mine = -99; B.doneT = 0;
    for (let y = 0; y < pz.H; y++) for (let x = 0; x < pz.W; x++) {
      const i = y * pz.W + x, m0 = pz.cells[y][x];
      const grp = new THREE.Group(); grp.position.set((x - (pz.W - 1) / 2) * TILE, 0, (y - (pz.H - 1) / 2) * TILE);
      const plate = new THREE.Mesh(B.geo.plate, B.plateMat); plate.position.y = 0.015; grp.add(plate);
      const arms = new THREE.Group(); grp.add(arms);
      const hub = new THREE.Mesh(B.geo.hub, B.dry); hub.position.y = 0.09; arms.add(hub);
      for (const [bit, dx, dz] of [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]) {
        if (!(m0 & bit)) continue;
        const a = new THREE.Mesh(B.geo.arm, B.dry); a.position.set(dx * 0.13, 0.09, dz * 0.13); if (dx) a.rotation.y = Math.PI / 2; arms.add(a);
      }
      tag(grp, i);
      B.tileRoot.add(grp);
      B.tiles.push({ grp, arms, m0, k: 0, vis: 0, wet: false, hover: false });
    }
    B.tank.position.z = I4.synthSt.B.z + (pz.src - (pz.H - 1) / 2) * TILE;
    B.vat.position.z = I4.synthSt.B.z + (pz.dst - (pz.H - 1) / 2) * TILE;
    const C = S.C; C.thr = 0; C.rpm = 0; C.prog = 0; C.wobble = 0; C.heat = 0;
    S.A.demoT = -0.5; S.A.fail = 0;
    S.sent = {};
  },

  // ── A · séquenceur ──
  pressSeqA(i) {
    const A = this.s4.A, st = this.s4Val('sA', [0, 0]), r = Math.min(st[0] | 0, ROUNDS.length - 1), idx = st[1] | 0, seq = this.seqA(), L = ROUNDS[r];
    const b = A.btns[i]; b.press = 1; b.glow = 1;
    this.audio.note?.(BASES[i].note);
    if (seq[idx] === i) {
      if (idx + 1 < L) { this.act('puzzle', { k: 'sA', v: [r, idx + 1] }); return; }
      if (r + 1 >= ROUNDS.length) {
        this.act('puzzle', { k: 'sA', v: [ROUNDS.length, 0] });
        this.act('synth', { k: 'A' });
        this.audio.success?.();
        return;
      }
      this.act('puzzle', { k: 'sA', v: [r + 1, 0] });
      this.audio.powerUp?.();
      this.ui.toast(`Manche ${r + 2}/${ROUNDS.length}`, 'Regardez l\'hélice : la suite s\'allonge d\'une base.', 'good', 2400);
      A.demoT = -1.2;
    } else {
      this.act('puzzle', { k: 'sA', v: [r, 0] });
      A.fail = 1; A.demoT = -1.4;
      this.audio.error?.();
      this.ui.toast('Mauvaise base', 'L\'hélice rejoue la suite : observez-la jusqu\'au bout.', 'bad', 2200);
    }
  },

  // ── B · raccords ──
  turnTileB(i, dir) {
    const arr = this.sBArr().slice();
    arr[i] = ((((arr[i] | 0) + dir) % 4) + 4) % 4;
    this.act('puzzle', { k: 'sB', v: arr });
    this.s4.B.mine = this.t;
    this.audio.ratchet?.();
  },
  flowB() {
    const B = this.s4.B, pz = B.pz, arr = this.sBArr(), W = pz.W, H = pz.H;
    const mask = (x, y) => rotN(B.tiles[y * W + x].m0, arr[y * W + x] | 0);
    const on = new Set(), q = [];
    if (mask(0, pz.src) & 8) { q.push([0, pz.src]); on.add(pz.src * W); }
    const D = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
    while (q.length) {
      const [x, y] = q.shift(), m = mask(x, y);
      for (const [dx, dy, b, back] of D) {
        if (!(m & b)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || on.has(ny * W + nx) || !(mask(nx, ny) & back)) continue;
        on.add(ny * W + nx); q.push([nx, ny]);
      }
    }
    return { on, done: on.has(pz.dst * W + W - 1) && !!(mask(W - 1, pz.dst) & 2) };
  },

  // ── C · centrifugeuse ──
  toggleTubeC(k) {
    if (k === this.sampleSlotC()) { this.audio.error?.(); this.ui.toast('Tube d\'échantillon', 'Il ne bouge pas : c\'est aux contrepoids de l\'équilibrer.', 'bad', 2200); return; }
    const m = this.sCmask(), on = (m >> k) & 1;
    if (!on && bits(m) >= 5) { this.audio.error?.(); return; }
    this.act('puzzle', { k: 'sC', v: m ^ (1 << k) });
    this.audio.clank?.();
  },
  balanceC() {
    const m = this.sCmask() | (1 << this.sampleSlotC());
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < 6; k++) if ((m >> k) & 1) { sx += Math.cos(k * Math.PI / 3); sz += Math.sin(k * Math.PI / 3); n++; }
    return { n, off: Math.hypot(sx, sz) };
  },
  setThrottleC(v) {
    const C = this.s4.C;
    if (C.lockT > 0) return;
    const before = C.thr;
    C.thr = Math.max(0, Math.min(1, v));
    if (before < 0.02 && C.thr >= 0.02) this.audio.powerUp?.();
    if (Math.floor(before * 20) !== Math.floor(C.thr * 20)) this.audio.ratchet?.();
  },
  stopC(title, text) {
    const C = this.s4.C;
    C.thr = 0; C.rpm *= 0.4; C.wobble = 0; C.heat = 0; C.prog = 0; C.lockT = 2.2; C.alarm = 2.2;
    this.audio.error?.(); this.audio.thud?.(); this.audio.hiss?.();
    this.player.shake = Math.max(this.player.shake, 0.6);
    this.ui.toast(title, text, 'bad', 3800);
  },

  // ── image par image (près du labo) ──
  updateSynth3D(dt) {
    const S = this.s4, I = this.island4; if (!S || !I) return;
    const me = this.playerWorld();
    if (Math.hypot(me.x - S.points.synth.x, me.z - S.points.synth.z) > 90) return;
    this.layoutSynth3D();
    const f = this.flags, on = f.decon4 && !f.doseReady && !f.cured, t = this.t;
    const near = (p, r) => Math.hypot(me.x - p.x, me.z - p.z) < r;

    // A · hélice et pupitre
    {
      const A = S.A, st = this.s4Val('sA', [0, 0]), r = st[0] | 0, idx = st[1] | 0, done = !!f.synthA, seq = this.seqA();
      const key = `${r}|${idx}`;
      if (key !== A.key) { if (A.key && idx === 0 && !A.fail) A.demoT = Math.min(A.demoT, -0.8); A.key = key; }
      A.helix.rotation.y += dt * (done ? 1.6 : 0.5);
      A.fail = Math.max(0, A.fail - dt * 1.4);
      let lit = -1;
      if (on && !done && idx === 0) {
        A.demoT += dt;
        const n = ROUNDS[Math.min(r, ROUNDS.length - 1)], cyc = n * STEP + PAUSE;
        if (A.demoT >= 0) {
          const u = A.demoT % cyc, step = Math.floor(u / STEP);
          if (step < n && u - step * STEP < LIT) {
            lit = seq[step];
            const k = `${Math.floor(A.demoT / cyc)}:${step}`;
            if (k !== A.lastStep) { A.lastStep = k; if (near(S.points.A, 16)) this.audio.note?.(BASES[lit].note); }
          }
        }
      } else if (idx > 0) A.demoT = -0.6;
      const c = A.rungMat.emissive;
      if (done) c.set('#2fbf71'); else if (A.fail > 0) c.set('#ff3030').multiplyScalar(A.fail); else if (lit >= 0) c.set(BASES[lit].col); else c.setRGB(0.05, 0.06, 0.08);
      A.holo.visible = done || lit >= 0 || A.fail > 0.3;
      if (A.holo.visible) { A.holo.material.map = A.holoTex[done ? 4 : lit >= 0 ? lit : 5]; A.holo.position.y = FLAT4 + 5.4 + Math.sin(t * 2) * 0.05; }
      for (const b of A.btns) {
        b.press = Math.max(0, b.press - dt * 6); b.glow = Math.max(0, b.glow - dt * 3);
        b.cap.position.y = 0.11 - b.press * 0.05;
        b.capMat.emissive.copy(b.col).multiplyScalar(Math.min(1, b.glow * 0.8 + (b.hover ? 0.18 : 0) + (done ? 0.25 : 0)));
      }
      if (near(S.points.A, 30)) {
        const L = ROUNDS[Math.min(r, ROUNDS.length - 1)];
        A.lcd.draw(`${key}|${done}|${on}|${A.fail > 0.3}`, (g, w, h) => {
          g.fillStyle = '#0d2a24'; g.fillRect(0, 0, w, h);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = done ? '#5ef2c2' : A.fail > 0.3 ? '#ff6b5b' : '#5ef2c2';
          if (!on && !done) { g.font = 'bold 30px monospace'; g.fillText('EN ATTENTE', w / 2, h / 2); return; }
          if (done) { g.font = 'bold 36px monospace'; g.fillText('SÉQUENCE OK ✔', w / 2, h / 2); return; }
          g.font = 'bold 26px monospace'; g.fillText(A.fail > 0.3 ? 'ERREUR · ON REPREND' : `MANCHE ${r + 1}/${ROUNDS.length}`, w / 2, h * 0.3);
          for (let i = 0; i < L; i++) { g.fillStyle = i < idx ? '#5ef2c2' : '#1d4a40'; g.beginPath(); g.arc(w / 2 + (i - (L - 1) / 2) * 44, h * 0.7, 14, 0, Math.PI * 2); g.fill(); }
        });
      }
    }

    // B · raccords : rotation animée, azote dans les tuyaux reliés
    {
      const B = S.B, arr = this.sBArr(), done = !!f.synthB;
      const fl = this.flowB();
      B.tiles.forEach((q, i) => {
        const k = arr[i] | 0;
        if (k !== q.k) { const d = (((k - q.k) % 4) + 4) % 4; q.vis += d === 3 ? -1 : d; q.k = k; }
        const want = -q.vis * Math.PI / 2;
        q.arms.rotation.y += (want - q.arms.rotation.y) * Math.min(1, dt * 14);
        const wet = fl.on.has(i) || done;
        if (wet !== q.wet) { q.wet = wet; q.arms.children.forEach((o) => { o.material = wet ? B.wet : B.dry; }); }
        q.grp.position.y += ((q.hover && on && !done ? 0.03 : 0) - q.grp.position.y) * Math.min(1, dt * 12);
      });
      B.wet.emissiveIntensity = 0.7 + Math.sin(t * 4) * 0.2;
      const full = fl.done || done;
      B.vatStub.material = full ? B.wet : B.dry;
      B.liquidMat.color.set(full ? (Math.sin(t * 3) > 0 ? '#9ff4ff' : '#5ef2c2') : '#1f3a4a');
      if (on && !done && fl.done && t - B.mine < 4 && !S.sent.B) {
        B.doneT += dt;
        if (B.doneT > 0.9) { S.sent.B = true; this.act('synth', { k: 'B' }); this.audio.hiss?.(); }
      } else if (!fl.done) B.doneT = 0;
    }

    // C · centrifugeuse (simulation locale : celui qui tient le levier fait tourner le rotor)
    {
      const C = S.C, done = !!f.synthC, s0 = this.sampleSlotC(), m = this.sCmask();
      C.slots.forEach((q, k) => {
        const has = k === s0 || ((m >> k) & 1);
        q.tube.visible = !!has;
        q.lq.material = k === s0 ? C.sampleLiq : C.weightLiq;
        q.ringMat.color.set(q.hover && on && !done && C.rpm < 0.05 ? '#ffd166' : k === s0 ? '#ff5a4d' : has ? '#4d8bff' : '#3a3f48');
      });
      const loaded = bits(m);
      C.rackTubes.forEach((tb, k) => { tb.visible = k < 5 - loaded; });
      C.lockT = Math.max(0, C.lockT - dt); C.alarm = Math.max(0, (C.alarm || 0) - dt);
      if (done || !on) C.thr = 0;
      const spin = C.rpm > 0.1;
      C.drift += (Math.random() - 0.5) * dt * 0.9; C.drift *= Math.exp(-dt * 0.25); C.drift = Math.max(-0.13, Math.min(0.13, C.drift));
      const target = C.thr * 1.2 + (spin && !done ? C.drift + Math.sin(t * 0.7) * 0.05 : 0);
      C.rpm = Math.max(0, C.rpm + (target - C.rpm) * Math.min(1, dt * (target > C.rpm ? 0.9 : 0.6)));
      C.rotor.rotation.y += C.rpm * 38 * dt;
      const bal = this.balanceC(), unb = bal.off > 0.05 || bal.n < 2;
      C.wobble = unb && C.rpm > 0.2 && !done ? C.wobble + dt * C.rpm * 1.1 : Math.max(0, C.wobble - dt * 2);
      const wob = Math.min(1, C.wobble);
      C.rotor.rotation.x = Math.sin(t * 43) * 0.06 * wob; C.rotor.rotation.z = Math.cos(t * 39) * 0.06 * wob;
      C.body.position.x = I4.synthSt.C.x + Math.sin(t * 57) * 0.03 * wob;
      if (wob > 0.3 && near(S.points.C, 8)) this.player.shake = Math.max(this.player.shake, wob * 0.35);
      C.heat = C.rpm > RED ? C.heat + dt : Math.max(0, C.heat - dt * 0.6);
      C.leverArm.rotation.x = 0.75 - C.thr * 1.5;
      C.needle.rotation.z = -((-135 + (Math.min(1.25, C.rpm) / 1.2) * 270) * Math.PI / 180);
      if (spin) { C.tick -= dt; if (C.tick <= 0) { C.tick = 0.9 / (0.4 + C.rpm * 3); if (near(S.points.C, 14)) this.audio.ratchet?.(); } }
      if (on && !done) {
        if (C.wobble > 1) this.stopC('Arrêt d\'urgence : rotor déséquilibré', bal.n < 2 ? 'Un tube seul fait brouter le rotor : ajoutez des contrepoids pour répartir la masse.' : 'Répartissez les tubes pour que le rotor soit équilibré (masse égale tout autour).');
        else if (C.heat > 1.4) this.stopC('Arrêt d\'urgence : surchauffe', 'Le régime a trop longtemps dépassé le rouge. Remontez doucement jusqu\'au vert.');
        const inBand = C.rpm >= BAND[0] && C.rpm <= BAND[1] && !unb;
        C.prog = inBand ? Math.min(1, C.prog + dt / SPIN_HOLD) : Math.max(0, C.prog - dt / 9);
        if (C.prog >= 1 && C.thr > 0 && !S.sent.C) { S.sent.C = true; this.act('synth', { k: 'C' }); this.audio.success?.(); C.thr = 0; }
      }
      if (near(S.points.C, 30)) {
        const pct = Math.round(C.rpm * 100), pr = Math.round((done ? 1 : C.prog) * 100);
        const msg = done ? 'SÉPARÉ ✔' : !on ? 'EN ATTENTE' : C.alarm > 0 ? 'ARRÊT URGENCE' : C.heat > 0.3 ? 'SURCHAUFFE !' : unb && spin ? 'BALOURD !' : spin ? (C.rpm >= BAND[0] && C.rpm <= BAND[1] ? 'STABLE' : C.rpm < BAND[0] ? 'PLUS VITE' : 'MOINS VITE') : 'PRÊT';
        C.lcd.draw(`${pct}|${pr}|${msg}`, (g, w, h) => {
          g.fillStyle = '#0d2a24'; g.fillRect(0, 0, w, h);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillStyle = /URGENCE|SURCHAUFFE|BALOURD/.test(msg) ? '#ff6b5b' : '#5ef2c2';
          g.font = 'bold 30px monospace'; g.fillText(msg, w / 2, h * 0.22);
          g.fillStyle = '#5ef2c2'; g.font = 'bold 24px monospace'; g.fillText(`SÉPARATION ${pr} %`, w / 2, h * 0.52);
          g.fillStyle = '#1d4a40'; g.fillRect(20, h * 0.72, w - 40, 26);
          g.fillStyle = '#5ef2c2'; g.fillRect(20, h * 0.72, (w - 40) * pr / 100, 26);
        });
      }
    }

    // niveaux du synthétiseur
    for (const k of ['A', 'B', 'C']) {
      const L = S.levels[k], want = f[`synth${k}`] || f.cured ? 1 : 0;
      L.v += (want - L.v) * Math.min(1, dt * 0.8);
      L.lq.scale.y = Math.max(0.001, L.v);
    }

    // dose : elle file dans le tube pneumatique, puis attend dans le passe-plat
    {
      const D = S.dose, ready = !!f.doseReady && !f.cured;
      D.t = ready ? Math.min(1, D.t + dt / 3.2) : 0;
      D.capsule.visible = ready;
      if (ready) {
        const P = D.path, segs = P.length - 1, u = D.t * segs, i = Math.min(segs - 1, Math.floor(u));
        D.capsule.position.lerpVectors(P[i], P[i + 1], u - i);
        if (D.t >= 1) D.capsule.position.y = FLAT4 + 1.3 + Math.sin(t * 2.5) * 0.02;
        D.capsule.rotation.y += dt * 1.5;
        D.glowMat.color.set(Math.sin(t * 5) > 0 ? '#5ef2c2' : '#b6ffe6');
      }
      D.lamp.material.color.set(f.cured ? '#5ef2c2' : ready && D.t >= 1 ? (Math.sin(t * 8) > 0 ? '#5ef2c2' : '#1f8a8a') : '#552222');
    }
  },

  // ── invites hors dispositifs : guides, protocole, passe-plat ──
  synthInteractions(add) {
    const S = this.s4, f = this.flags; if (!S) return;
    add(this.island4.points.synthBoard, 3.2, { prompt: '<kbd>E</kbd> lire le protocole de synthèse', press: () => this.readSynthBoard() });
    if (f.decon4 && !f.doseReady && !f.cured) {
      if (!f.synthA) add(S.points.A, 3.4, { prompt: 'Poste A · regardez l\'hélice jouer sa suite, puis rejouez-la sur les boutons (visez un bouton, <kbd>E</kbd>)' });
      if (!f.synthB) add(S.points.B, 3.6, { prompt: 'Poste B · visez un raccord : <kbd>E</kbd> quart de tour. Reliez la bonbonne d\'azote à la cuve' });
      if (!f.synthC) add(S.points.C, 3.2, { prompt: 'Poste C · équilibrez le rotor avec les contrepoids, puis levier du régime (<kbd>E</kbd> maintenu + souris)' });
    }
    if (f.doseReady && !f.cured) {
      add(S.points.pass, 2.8, S.dose.t < 1 ? { prompt: 'La dose arrive par le tube pneumatique…' } : {
        prio: 4,
        prompt: '<kbd>E</kbd> maintenu : envoyer la dose à Marthe par le passe-plat',
        hold: { seconds: 2.4, tick: (dt, bf) => { if (Math.floor(bf / 0.4) !== Math.floor(this.holdT / 0.4)) this.audio.ratchet?.(); }, done: () => { this.audio.whoosh?.(); this.act('flag', { cured: true, ended: true }); } },
      });
    }
  },
  readSynthBoard() {
    this.openNote('Protocole de synthèse · HX-1',
      '<b style="color:#ff5a4d">A · Séquenceur ARN</b> : l\'hélice joue une suite de bases (couleur, note, lettre). Rejouez-la sur les boutons du pupitre. Trois manches : la suite s\'allonge à chaque fois.<br><br>'
      + '<b style="color:#4d8bff">B · Refroidissement</b> : faites pivoter les raccords de la table (<kbd>E</kbd>, <kbd>R</kbd> ou la molette) jusqu\'à relier la bonbonne d\'azote ❄ à la cuve ⚗. Les tuyaux reliés s\'allument.<br><br>'
      + '<b style="color:#ffd166">C · Centrifugeuse</b> : le tube d\'échantillon (rouge) ne bouge pas. Placez des contrepoids (bleus) pour que la masse soit répartie tout autour du rotor. Puis montez le régime au levier et tenez l\'aiguille dans le vert : il dérive, corrigez-le.<br><br>'
      + 'Dès le premier poste réglé, le mélange commence à tourner : finissez les trois à temps. La dose rejoint ensuite le passe-plat de la salle blanche.',
      'Synthèse : A = rejouer la suite de l\'hélice · B = relier l\'azote à la cuve · C = rotor équilibré puis régime dans le vert · dose au passe-plat');
  },
  // point d'objectif : le premier poste qui reste à régler
  synthTarget() {
    const S = this.s4, f = this.flags; if (!S) return null;
    if (f.doseReady) return S.points.pass;
    for (const k of ['A', 'B', 'C']) if (!f[`synth${k}`]) return S.points[k];
    return S.points.synth;
  },
  // nouvel essai (échec du chrono, nouvelle journée) : tout est remis à zéro, circuits et suite tirés à nouveau
  resetSynthPuzzles() {
    const P = this.puzzles;
    P.sA = [0, 0]; P.sB = null; P.sC = 0; P.sT = (+P.sT || 0) + 1;
  },
};
