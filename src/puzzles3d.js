// Énigmes physiques (esprit Portal / Deliver Us the Moon) : chaque fusible de Saint-Escale est derrière l'une d'elles.
//  · rouge : sur le toit du terminal. L'échelle de service est arrachée en bas : glisser une caisse dessous pour l'atteindre.
//  · bleu  : poste de sécurité. Un laser doit atteindre le capteur : poser et orienter deux miroirs sur les socles.
//  · jaune : local technique du balisage, en bout de piste. Sa porte à double commande ne s'ouvre que si ses deux pédales de sécurité sont enfoncées
//            (sacs, blocs… ou coéquipiers).
// Les blocs posés au sol sont des plateformes (on monte dessus) et des obstacles.
import * as THREE from 'three';
import { prep, flatMat, textTexture } from './terrain.js';
import { FLAT, I2 } from './island2.js';

const LASER_Y = 1.0;
export const P2 = {
  ladder: { x: -11.25, z: 39, y0: 2.6, y1: 6.6 },          // relatif à FLAT
  roofBox: { x: -18, z: 38.5 },
  room: { x: -35, z: 14, w: 12, d: 10, h: 3.6 },          // poste de sécurité
  cage: { x: 110, z: 16 },                                // local technique du balisage (porte côté piste)
  plates: [{ x: 101, z: 10.5 }, { x: 119, z: 10.5 }],     // pédales de sécurité : deux techniciens (ou du lest)
  items: {
    cargoBox: { x: -3, z: 47, r: 0.3 },
    sandbag: { x: 129, z: 20, r: 0.6 },                   // sacs de lest de la manche à air
    ballast: { x: 91, z: 11, r: 0.2 },                    // bloc de béton du chantier des vannes
    mirror1: { room: [1.6, 8.4], r: Math.PI / 4 },
    mirror2: { x: -37.6, z: 37.8, r: Math.PI / 4 },
  },
};
// salle du laser (coordonnées u, v depuis l'angle sud-ouest de la salle)
const ROOM = {
  emitter: [0.35, 2], sensor: [11.65, 7], safe: [11.8, 3.2],
  sockets: [[3, 2], [6, 2], [3, 7], [6, 7], [9, 4.6]],
  pillars: [[9, 2, 0.6], [3, 5, 0.6], [8.5, 8.6, 0.5]],     // u, v, demi-côté
};

function boxM(w, h, d, col, x, y, z) { const o = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function sign(lines, bg, fg, w, h, cw = 512, ch = 256) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTexture(lines, bg, fg, cw, ch) })); return o; }

export const PhysPuzzleMixin = {
  // construit les énigmes dans le groupe de l'île 2 et recale les fusibles
  buildPhysPuzzles() {
    if (this.pz2) this.pz2.beams.forEach((b) => this.scene.remove(b));
    const I = this.island2, g = new THREE.Group(), cx = I.cx, cz = I.cz;
    I.group.add(g);
    const col = (x0, x1, z0, z1, extra = {}) => { const c = { type: 'box', minX: cx + x0, maxX: cx + x1, minZ: cz + z0, maxZ: cz + z1, ...extra }; I.colliders.push(c); return c; };
    const W = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
    const pz = this.pz2 = { g, beams: [], lit: false, safe: 0, cage: 0, plates: [false, false], ladders: [] };

    // ── toit du terminal + échelle de service ──
    const T = I2.terminal, roofTop = FLAT + T.h + 0.6;
    I.platforms.push({ minX: cx + T.x - T.w / 2 - 0.5, maxX: cx + T.x + T.w / 2 + 0.5, minZ: cz + T.z - T.d / 2 - 0.5, maxZ: cz + T.z + T.d / 2 + 0.5, top: roofTop });
    col(T.x - 8.4, T.x + 8.4, T.z - T.d / 2 - 0.1, T.z - T.d / 2 + 0.35, { minY: roofTop - 0.5, maxY: roofTop + 3 });   // enseigne
    // groupes de climatisation et boîte de maintenance
    for (const [x, z] of [[-40, 36], [-30, 39], [-24, 35]]) { g.add(boxM(2.2, 1.2, 1.6, '#c9cfd6', x, roofTop + 0.6, z)); g.add(boxM(1.2, 0.08, 1.2, '#5d6470', x, roofTop + 1.24, z)); col(x - 1.1, x + 1.1, z - 0.8, z + 0.8, { minY: roofTop - 1, maxY: roofTop + 1 }); }
    const rb = P2.roofBox;
    g.add(boxM(1.0, 1.3, 0.6, '#ff6b5b', rb.x, roofTop + 0.65, rb.z));
    const rbDoor = boxM(0.9, 1.1, 0.06, '#c94a3a', rb.x, roofTop + 0.7, rb.z - 0.33); g.add(rbDoor);
    const rbSign = sign(['⚡ SECOURS', 'ÉCLAIRAGE'], '#ffd166', '#10162b', 0.8, 0.4, 256, 128); rbSign.position.set(rb.x, roofTop + 1.05, rb.z - 0.37); rbSign.rotation.y = Math.PI; g.add(rbSign);
    col(rb.x - 0.5, rb.x + 0.5, rb.z - 0.3, rb.z + 0.3, { minY: roofTop - 1, maxY: roofTop + 1 });
    // échelle : les barreaux du bas ont été arrachés
    const L = P2.ladder;
    for (const dz of [-0.32, 0.32]) g.add(boxM(0.07, L.y1 - L.y0 + 1.1, 0.07, '#8d9299', L.x, FLAT + (L.y0 + L.y1 + 1.1) / 2, L.z + dz));
    for (let y = L.y0 + 0.15; y < L.y1 + 1.0; y += 0.32) g.add(boxM(0.05, 0.05, 0.64, '#b8bec6', L.x, FLAT + y, L.z));
    for (const y of [L.y0 + 0.3, L.y1 - 0.5]) g.add(boxM(0.75, 0.06, 0.06, '#5d6470', L.x - 0.37, FLAT + y, L.z));
    const bent = boxM(0.05, 0.05, 0.3, '#8d9299', L.x, FLAT + L.y0 - 0.5, L.z + 0.25); bent.rotation.x = 0.7; g.add(bent);     // barreau tordu
    const ls = sign(['ÉCHELLE DE SERVICE', 'barreaux du bas arrachés', '→ toit'], '#fff4e0', '#10162b', 1.2, 0.7, 512, 300);
    ls.position.set(L.x + 0.05, FLAT + 1.6, L.z + 1.1); ls.rotation.y = Math.PI / 2; g.add(ls);
    pz.ladders.push({ x: cx + L.x + 0.55, z: cz + L.z, y0: FLAT + L.y0, y1: roofTop, dir: new THREE.Vector3(-1, 0, 0), top: W(L.x - 0.9, roofTop, L.z) });

    // ── poste de sécurité (laser et miroirs) ──
    const R = P2.room, x0 = R.x - R.w / 2, z0 = R.z - R.d / 2;
    const U = (u, v, y = 0) => new THREE.Vector3(cx + x0 + u, y, cz + z0 + v);
    pz.U = U;
    const wallC = '#d6cfc0';
    g.add(boxM(R.w, 0.12, R.d, '#6b6f78', R.x, FLAT + 0.06, R.z));   // dalle
    const wall = (u0, u1, v0, v1) => { g.add(boxM(u1 - u0, R.h, v1 - v0, wallC, x0 + (u0 + u1) / 2, FLAT + R.h / 2, z0 + (v0 + v1) / 2)); col(x0 + u0, x0 + u1, z0 + v0, z0 + v1); };
    wall(-0.2, 0, 0, R.d); wall(R.w, R.w + 0.2, 0, R.d); wall(-0.2, R.w + 0.2, -0.2, 0);
    wall(-0.2, 5, R.d, R.d + 0.2); wall(7, R.w + 0.2, R.d, R.d + 0.2);   // porte côté nord (u 5 → 7)
    g.add(boxM(2, R.h - 2.6, 0.2, wallC, x0 + 6, FLAT + 2.6 + (R.h - 2.6) / 2, z0 + R.d + 0.1));
    g.add(boxM(R.w + 0.8, 0.3, R.d + 0.8, '#3d434d', R.x, FLAT + R.h + 0.15, R.z));
    g.add(boxM(R.w + 0.9, 0.35, 0.3, '#ffd166', R.x, FLAT + R.h - 0.2, z0 + R.d + 0.26));
    const rs = sign(['POSTE DE SÉCURITÉ'], '#10162b', '#ffd166', 4.6, 0.7, 1024, 150);
    rs.position.set(R.x, FLAT + R.h - 0.7, z0 + R.d + 0.22); g.add(rs);
    const how = sign(['CONSIGNE', 'Le coffre s\'ouvre quand', 'le faisceau touche le capteur.', 'Miroirs : sur les socles.'], '#fff4e0', '#10162b', 1.5, 1.1, 512, 380);
    how.position.set(x0 + 4.2, FLAT + 1.8, z0 + R.d + 0.22); g.add(how);
    // intérieur
    const room = new THREE.PointLight('#ff9a8a', 3, 16, 1.5); room.position.copy(U(6, 5, FLAT + 3)); pz.roomLight = room; I.group.add(room); room.position.sub(I.group.position);
    const [eu, ev] = ROOM.emitter;
    g.add(boxM(0.5, 0.5, 0.6, '#33373f', x0 + eu - 0.1, FLAT + LASER_Y, z0 + ev));
    g.add(boxM(0.18, 0.18, 0.18, '#ff4d4d', x0 + eu + 0.2, FLAT + LASER_Y, z0 + ev));
    const [su, sv] = ROOM.sensor;
    g.add(boxM(0.2, 0.7, 0.7, '#33373f', x0 + su + 0.15, FLAT + LASER_Y, z0 + sv));
    pz.sensorLamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.36), new THREE.MeshBasicMaterial({ color: '#552222', toneMapped: false }));
    pz.sensorLamp.position.set(x0 + su + 0.02, FLAT + LASER_Y, z0 + sv); g.add(pz.sensorLamp);
    for (const [pu, pv, h] of ROOM.pillars) {
      g.add(boxM(h * 2, 2.2, h * 2, '#b98b5e', x0 + pu, FLAT + 1.1, z0 + pv));
      g.add(boxM(h * 2 + 0.05, 0.12, h * 2 + 0.05, '#7a5536', x0 + pu, FLAT + 2.2, z0 + pv));
      col(x0 + pu - h, x0 + pu + h, z0 + pv - h, z0 + pv + h);
    }
    pz.sockets = ROOM.sockets.map(([u, v]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false, transparent: true, opacity: 0.55 }));
      m.position.set(x0 + u, FLAT + 0.15, z0 + v); g.add(m);
      return { u, v, mesh: m, pos: U(u, v, FLAT + 0.15) };
    });
    // coffre mural (fusible bleu)
    const [fu, fv] = ROOM.safe;
    g.add(boxM(0.4, 1.0, 1.0, '#5d6470', x0 + fu - 0.1, FLAT + 1.2, z0 + fv));
    const safeDoor = new THREE.Group(); safeDoor.position.set(x0 + fu - 0.32, FLAT + 1.2, z0 + fv - 0.48);
    safeDoor.add(boxM(0.06, 0.9, 0.9, '#8d9299', 0, 0, 0.45));
    safeDoor.add(boxM(0.08, 0.2, 0.2, '#ffd166', -0.04, 0, 0.62));
    g.add(safeDoor); pz.safeDoor = safeDoor;
    // faisceaux (réutilisés)
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff3030', toneMapped: false, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1), beamMat); b.visible = false; b.userData.dynamic = true; this.scene.add(b); pz.beams.push(b); }

    // ── local technique du balisage + pédales de sécurité ──
    const C = P2.cage;
    const cage = new THREE.Group(); cage.position.set(C.x, FLAT, C.z); g.add(cage);
    const CON = '#b9b4a8', CON2 = '#9a958a';
    g.add(boxM(24, 0.06, 10, '#8d8a84', C.x, FLAT + 0.03, C.z - 3.6));          // dalle de béton
    cage.add(boxM(3.4, 2.8, 0.25, CON, 0, 1.4, 1.5));                           // mur du fond
    for (const sx of [-1, 1]) cage.add(boxM(0.25, 2.8, 3.2, CON, sx * 1.575, 1.4, 0));
    for (const sx of [-1, 1]) cage.add(boxM(0.6, 2.8, 0.25, CON, sx * 1.4, 1.4, -1.5));   // piédroits
    cage.add(boxM(3.4, 0.5, 0.25, CON2, 0, 2.55, -1.5));                        // linteau
    cage.add(boxM(3.8, 0.2, 3.6, CON2, 0, 2.9, 0));                             // toit
    cage.add(boxM(0.06, 0.06, 3.0, '#ffd166', -1.7, 2.3, 0)); cage.add(boxM(0.06, 0.06, 3.0, '#ffd166', 1.7, 2.3, 0));
    const lampT = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false })); lampT.position.set(0, 3.1, -1.2); cage.add(lampT);
    // rideau métallique (monte quand les deux pédales sont enfoncées)
    const door = new THREE.Group(); door.position.set(0, 0, -1.52); cage.add(door);
    for (let y = 0.12; y < 2.3; y += 0.16) door.add(boxM(2.2, 0.13, 0.05, y % 0.32 < 0.16 ? '#8d9299' : '#7a7f86', 0, y, 0));
    door.add(boxM(2.2, 0.08, 0.08, '#ffd166', 0, 0.05, 0));
    pz.cageDoor = door;
    cage.add(boxM(0.5, 0.9, 0.5, '#33373f', 0, 0.45, 0.6));          // armoire du fusible
    cage.add(boxM(0.9, 1.4, 0.3, '#5d6470', -0.9, 0.9, 1.25));       // armoire électrique
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
    // câbles des pédales vers le local
    for (const p of P2.plates) {
      const len = Math.hypot(C.x - p.x, C.z - p.z), c = boxM(0.08, 0.05, len, '#10162b', (C.x + p.x) / 2, FLAT + 0.05, (C.z + p.z) / 2);
      c.rotation.y = Math.atan2(C.x - p.x, C.z - p.z); g.add(c);
    }
    // nouveaux emplacements des fusibles
    const P = I.points;
    P.fuseRed = W(rb.x, roofTop + 0.75, rb.z - 0.1);
    P.fuseBlue = U(fu - 0.12, fv, FLAT + 1.2);
    P.fuseYellow = W(C.x, FLAT + 1.1, C.z + 0.6);
    P.laserRoom = U(6, 9, FLAT + 1);
    P.cage = W(C.x, FLAT + 1, C.z);
    P.ladder = W(L.x + 0.6, FLAT + 1, L.z);
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
      if (p.room) { const w = this.pz2.U(p.room[0], p.room[1]); this.placeItem(it, w.x, w.z, p.r); } else this.placeItem(it, I.cx + p.x, I.cz + p.z, p.r);
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

  // ── laser : tracé du faisceau entre murs, piliers, miroirs et capteur ──
  mirrorOn(it) {
    if (!this.pz2 || !it.def.mirror || it.state !== 'ground') return -1;
    return this.pz2.sockets.findIndex((s) => Math.hypot(s.pos.x - it.pos.x, s.pos.z - it.pos.z) < 0.35);
  },
  traceLaser() {
    const pz = this.pz2, R = P2.room;
    const mirrors = [];
    for (const it of Object.values(this.items)) {
      const si = this.mirrorOn(it);
      if (si >= 0) mirrors.push({ u: pz.sockets[si].u, v: pz.sockets[si].v, r: it.rotY });
    }
    let pu = ROOM.emitter[0] + 0.3, pv = ROOM.emitter[1], du = 1, dv = 0;
    const segs = [];
    let lit = false;
    for (let n = 0; n < 6; n++) {
      // murs
      let best = du > 0 ? (R.w - pu) : du < 0 ? pu : dv > 0 ? (R.d - pv) : pv, hit = null;
      for (const [cu, cv, h] of ROOM.pillars) {
        const t = du ? (cu - h * Math.sign(du) - pu) * du : (cv - h * Math.sign(dv) - pv) * dv;
        const off = du ? Math.abs(cv - pv) : Math.abs(cu - pu);
        if (t > 0 && t < best && off < h) { best = t; hit = null; }
      }
      for (const m of mirrors) {
        const t = du ? (m.u - pu) * du : (m.v - pv) * dv, off = du ? Math.abs(m.v - pv) : Math.abs(m.u - pu);
        if (t > 0.05 && t < best && off < 0.3) { best = t; hit = m; }
      }
      const [su, sv] = ROOM.sensor;
      { const t = du ? (su - pu) * du : (sv - pv) * dv, off = du ? Math.abs(sv - pv) : Math.abs(su - pu); if (t > 0 && t <= best + 0.4 && off < 0.35) { best = t; hit = 'sensor'; } }
      segs.push([pu, pv, pu + du * best, pv + dv * best]);
      if (hit === 'sensor') { lit = true; break; }
      if (!hit) break;
      pu = hit.u; pv = hit.v;
      // réflexion sur le plan du miroir (axe x local tourné de r)
      const mx = Math.cos(hit.r), mz = -Math.sin(hit.r), dot = du * mx + dv * mz;
      const nu = 2 * dot * mx - du, nv = 2 * dot * mz - dv;
      du = Math.round(nu); dv = Math.round(nv);
      if (du === 0 && dv === 0) break;
    }
    return { segs, lit };
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
    // laser
    const R = P2.room, rc = pz.U(R.w / 2, R.d / 2);
    const nearRoom = near && Math.hypot(me.x - rc.x, me.z - rc.z) < 45;
    if (nearRoom) {
      const { segs, lit } = this.traceLaser();
      pz.beams.forEach((b, i) => {
        const s = segs[i];
        b.visible = !!s;
        if (!s) return;
        const a = pz.U(s[0], s[1], FLAT + LASER_Y), c = pz.U(s[2], s[3], FLAT + LASER_Y);
        b.position.copy(a).add(c).multiplyScalar(0.5);
        b.scale.z = Math.max(0.01, a.distanceTo(c));
        b.lookAt(c);
      });
      if (lit && !this.puzzles.laser) { this.act('puzzle', { k: 'laser', v: 1 }); this.audio.success(); this.ui.toast('Capteur activé !', 'Le coffre du poste de sécurité s\'ouvre.', 'good'); }
      pz.lit = lit;
    } else pz.beams.forEach((b) => { b.visible = false; });
    pz.sensorLamp.material.color.set(this.puzzles.laser ? '#5ef2c2' : pz.lit ? '#ffd166' : '#552222');
    pz.safe += ((this.puzzles.laser ? 1 : 0) - pz.safe) * Math.min(1, dt * 2);
    pz.safeDoor.rotation.y = -pz.safe * 1.7;
    pz.sockets.forEach((s) => { s.mesh.material.opacity = 0.35 + 0.25 * Math.sin(this.t * 3); });
    // plaques de pression
    const bodies = [me, ...this.mateList().filter((m) => !m.aboard).map((m) => m.pos)];
    let all = true;
    pz.plates.forEach((p) => {
      let on = bodies.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 0.9 && Math.abs(b.y - FLAT - 0.2) < 0.9);
      if (!on) for (const it of Object.values(this.items)) if (it.def.block && !it.def.mirror && it.state === 'ground' && Math.hypot(it.pos.x - p.x, it.pos.z - p.z) < 0.95) { on = true; break; }
      if (on !== p.on) { p.on = on; if (near) this.audio.clank(); }
      p.top.position.y = on ? 0.08 : 0.14;
      p.lamp.material.color.set(on ? '#5ef2c2' : '#ff4d4d');
      if (!on) all = false;
    });
    const wantCage = all || !this.fuseMeshes.yellow.visible ? 1 : 0;
    if (wantCage && pz.cage < 0.05 && near) this.audio.powerUp?.();
    pz.cage += (wantCage - pz.cage) * Math.min(1, dt * 3);
    pz.cageDoor.position.y = pz.cage * 2.3;
    pz.cageCol.disabled = pz.cage > 0.7;
  },

  // interactions des énigmes (dehors)
  physInteractions(add, me) {
    const pz = this.pz2;
    if (!pz) return;
    // poser un miroir porté sur un socle libre
    if (this.carrying && this.carrying.def.mirror) {
      pz.sockets.forEach((s) => {
        const busy = Object.values(this.items).some((it) => it.def.mirror && it.state === 'ground' && Math.hypot(s.pos.x - it.pos.x, s.pos.z - it.pos.z) < 0.35);
        if (!busy) add(s.pos.clone().setY(s.pos.y + 0.6), 2.2, { prio: 3, prompt: '<kbd>E</kbd> poser le miroir sur le socle', press: () => { const it = this.carrying; this.act('drop', { id: it.id, x: s.pos.x, z: s.pos.z, y: s.pos.y, r: Math.PI / 4 }); this.carrying = null; this.audio.clank(); } });
      });
    }
    if (!this.carrying) {
      for (const it of Object.values(this.items)) {
        if (this.mirrorOn(it) < 0) continue;
        add(it.mesh.position.clone().setY(it.mesh.position.y + 0.9), 2.4, {
          prio: 2,
          prompt: '<kbd>E</kbd> tourner le miroir · <kbd>R</kbd> le reprendre',
          press: () => { this.act('irot', { id: it.id, r: Math.abs(it.rotY - Math.PI / 4) < 0.2 ? -Math.PI / 4 : Math.PI / 4 }); this.audio.ratchet(); },
          alt: () => this.pickUp(it, 'hand'),
        });
      }
    }
    add(pz.U(ROOM.emitter[0] + 0.3, ROOM.emitter[1], FLAT + 1), 2.2, { prompt: '<kbd>E</kbd> examiner l\'émetteur laser', press: () => this.openNote('Émetteur laser', 'Barrière de sécurité, sur batterie.<br>Le faisceau part vers l\'est et se reflète sur les miroirs à 45°.<br>Posez les miroirs sur les socles lumineux et tournez-les (<kbd>E</kbd>) pour guider le rayon jusqu\'au capteur.', 'Poste de sécurité : guider le laser jusqu\'au capteur avec 2 miroirs (un dans la salle, un au terminal)') });
    if (this.fuseMeshes.blue.visible && !this.puzzles.laser) add(this.island2.points.fuseBlue, 2.0, { prompt: '<span class="warn">Coffre verrouillé : il s\'ouvre quand le laser touche le capteur</span>' });
    if (this.fuseMeshes.yellow.visible && pz.cage < 0.7) add(this.island2.points.cage.clone().add(new THREE.Vector3(0, 0, -1.6)), 2.6, { prompt: `<span class="warn">Porte à double commande · pédales : ${pz.plates.filter((p) => p.on).length}/2 enfoncées</span>` });
  },
};
