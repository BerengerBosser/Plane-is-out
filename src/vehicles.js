// Véhicules de piste : kart à bagages électrique (île 2), et sur Port-Cendre (île 3) le camion de pompiers,
// le camion-escalier, le camion-citerne, le chariot élévateur et le tracteur de repoussage.
// Le conducteur simule son véhicule et le publie dans sa présence ; à la descente, l'état est validé par l'hôte.
// Les zombies abîment la carrosserie des véhicules occupés ; à 0 % le véhicule est en panne (il roule au pas)
// et se répare au fer d'un poste à souder (un par île, voir vweld.js).
import * as THREE from 'three';
import { prep, flatMat, heightAt, textTexture } from './terrain.js';
import { clamp } from './terrain.js';
import { buildAvatar } from './avatars.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeColGrid } from './colgrid.js';

function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r, h, col, seg = 10) { const m = new THREE.Mesh(prep(new THREE.CylinderGeometry(r, r, h, seg), col), flatMat); m.castShadow = true; return m; }
function wheel(r, w, x, y, z) { const m = cyl(r, w, '#1e1e22', 10); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); const hub = cyl(r * 0.45, w + 0.02, '#8d9299', 6); hub.rotation.z = Math.PI / 2; hub.position.set(x, y, z); return [m, hub]; }
function addWheels(g, pts, r, w) { const out = []; for (const [x, z] of pts) { const [a, b] = wheel(r, w, x, r, z); g.add(a, b); out.push(a, b); } return out; }
function plate(text, bg, fg, w, h) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTexture([text], bg, fg, 512, 128) })); return m; }
function beacon(col = '#ffb020') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 8), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); return m; }

// ── modèles (avant = -z, siège conducteur) ──
function buildKart(col = '#ffd166') {
  const g = new THREE.Group();
  g.add(box(1.5, 0.35, 2.9, '#33373f', 0, 0.45, 0));
  g.add(box(1.5, 0.55, 1.0, col, 0, 0.85, -0.95));          // capot avant
  g.add(box(0.4, 0.3, 0.5, '#10162b', -0.3, 1.2, -0.7));       // colonne de direction
  gauges(g, -0.3, 1.24, -0.44, ['#5ef2c2']);                   // jauge de batterie
  const sw = new THREE.Mesh(prep(new THREE.TorusGeometry(0.2, 0.03, 4, 12), '#10162b'), flatMat); sw.position.set(-0.3, 1.35, -0.55); sw.rotation.x = -1.0; g.add(sw);
  g.add(box(1.3, 0.18, 0.6, '#1f8a8a', 0, 0.9, -0.05));      // banquette deux places
  g.add(box(1.3, 0.6, 0.12, '#1f8a8a', 0, 1.2, 0.22));
  // montants et toit assez hauts pour que la tête (et le chapeau) passent dessous
  for (const x of [-0.7, 0.7]) g.add(box(0.07, 1.95, 0.07, '#8d9299', x, 1.62, -0.4), box(0.07, 1.95, 0.07, '#8d9299', x, 1.62, 0.3));
  g.add(box(1.6, 0.08, 0.9, col, 0, 2.6, -0.05));           // toit
  g.add(box(1.5, 0.12, 1.3, '#6b6f78', 0, 0.68, 0.95));      // plateau de charge
  for (const x of [-0.72, 0.72]) g.add(box(0.06, 0.3, 1.3, '#8d9299', x, 0.88, 0.95));
  g.add(box(1.5, 0.3, 0.06, '#8d9299', 0, 0.88, 1.6));
  const wh = addWheels(g, [[-0.78, -0.95], [0.78, -0.95], [-0.78, 1.0], [0.78, 1.0]], 0.28, 0.2);
  const lamp = beacon(); lamp.position.set(0, 2.7, -0.05); g.add(lamp);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#fff4c0', toneMapped: false })); fr.position.set(0, 0.9, -1.46); g.add(fr);
  const p = plate('KART 07', col, '#10162b', 0.8, 0.2); p.position.set(0, 0.7, -1.46); p.rotation.y = Math.PI; g.add(p);
  return { root: g, wheels: wh, lamp, cargo: new THREE.Vector3(0, 0.75, 0.95) };
}
export function buildCharger() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.12, 0.8, '#6b6f78', 0, 0.06, 0));
  g.add(box(0.5, 1.6, 0.35, '#1f8a8a', 0, 0.9, 0));
  g.add(box(0.52, 0.12, 0.37, '#ffd166', 0, 1.75, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false }));
  scr.position.set(0, 1.25, -0.18); scr.rotation.y = Math.PI; g.add(scr);
  const bolt = plate('⚡ BORNE', '#10162b', '#ffd166', 0.46, 0.14); bolt.position.set(0, 1.55, -0.18); bolt.rotation.y = Math.PI; g.add(bolt);
  const cable = new THREE.Mesh(prep(new THREE.TorusGeometry(0.22, 0.03, 4, 10, Math.PI * 1.5), '#10162b'), flatMat); cable.position.set(0.27, 0.8, 0); cable.rotation.y = Math.PI / 2; g.add(cable);
  g.userData.screen = scr;
  return g;
}
// ── habitacle : vitres transparentes, tableau de bord, volant, sièges (vue à la première personne dégagée) ──
const glassMat = new THREE.MeshLambertMaterial({ color: '#b8dcef', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const glowMats = {};
const glowMat = (c) => glowMats[c] || (glowMats[c] = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));   // partagé : fusionnable
function glass(g, w, h, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); m.position.set(x, y, z); m.rotation.y = ry; m.userData.noCollide = true; g.add(m); return m; }
function steering(g, x, y, z, r = 0.19, tilt = -1.05) {
  const w = new THREE.Mesh(prep(new THREE.TorusGeometry(r, 0.028, 5, 16), '#15181d'), flatMat); w.position.set(x, y, z); w.rotation.x = tilt; g.add(w);
  const hub = box(0.1, 0.1, 0.05, '#2b2f36', x, y, z); hub.rotation.x = tilt; g.add(hub);
  for (const a of [0, Math.PI * 0.75, -Math.PI * 0.75]) { const s = box(0.03, r, 0.02, '#15181d', x, y, z); s.rotation.set(tilt, 0, a, 'XYZ'); s.translateY(r / 2); g.add(s); }
  const col = cyl(0.04, 0.45, '#2b2f36', 6); col.position.set(x, y - 0.12, z - 0.2); col.rotation.x = tilt + Math.PI / 2 - 0.2; g.add(col);
}
function gauges(g, x, y, z, cols = ['#5ef2c2', '#ffd166']) {
  cols.forEach((c, i) => {
    const bez = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), glowMat('#10141a')); bez.position.set(x + (i - (cols.length - 1) / 2) * 0.19, y, z); g.add(bez);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), glowMat(c)); face.position.set(bez.position.x, y, z + 0.004); face.scale.setScalar(0.92); g.add(face);
    const nd = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.05), glowMat('#10141a')); nd.position.set(bez.position.x + 0.012, y + 0.012, z + 0.008); nd.rotation.z = -0.7 + i; g.add(nd);
  });
}
function bucket(g, x, y, z, col) {
  g.add(box(0.52, 0.12, 0.5, '#2b2f36', x, y - 0.1, z + 0.02));      // assise
  g.add(box(0.5, 0.05, 0.46, col, x, y - 0.02, z + 0.02));
  const back = box(0.52, 0.72, 0.1, '#2b2f36', x, y + 0.32, z + 0.3); back.rotation.x = -0.12; g.add(back);
  g.add(box(0.3, 0.16, 0.08, '#2b2f36', x, y + 0.78, z + 0.35));      // appui-tête
}
// cabine creuse : bas de caisse, montants, toit, vitres ; `seats` = x des deux sièges (repère du véhicule)
function cab(g, col, w, z, h = 1.6, { x = 0, y0 = 1.0, seatY = 1.2, seatZ = z - 0.2, seats = [-0.55, 0.55], trim = '#1f8a8a' } = {}) {
  const D = 1.9, zf = z - D / 2, zb = z + D / 2, low = h * 0.45, t = 0.07, yTop = y0 + h, gh = h - low - t;
  g.add(box(w, 0.08, D, '#23262c', x, y0 + 0.04, z));                           // plancher
  g.add(box(w + 0.04, t, D + 0.08, col, x, yTop - t / 2, z));                   // toit
  g.add(box(w - 0.1, 0.03, D - 0.1, '#d9d5cc', x, yTop - t - 0.015, z));        // ciel de toit clair
  g.add(box(w, h, t, col, x, y0 + h / 2, zb - t / 2));                          // cloison arrière
  glass(g, w * 0.5, gh * 0.55, x, y0 + low + gh * 0.5, zb - t - 0.005);           // lunette arrière
  g.add(box(w, low, 0.1, col, x, y0 + low / 2, zf + 0.05));                     // face avant
  g.add(box(w * 0.42, low * 0.55, 0.04, '#23262c', x, y0 + low * 0.4, zf - 0.01));  // calandre
  for (const s of [-1, 1]) {
    const sx = x + s * (w / 2 - t / 2);
    g.add(box(t, low, D, col, sx, y0 + low / 2, z));                            // portière (bas)
    g.add(box(0.02, 0.04, 0.3, '#8d9299', sx + s * 0.04, y0 + low * 0.75, z + 0.35));   // poignée
    g.add(box(t, gh, 0.09, col, sx, y0 + low + gh / 2, zf + 0.07));             // montant A
    g.add(box(t, gh, 0.22, col, sx, y0 + low + gh / 2, zb - 0.12));             // montant B
    glass(g, D - 0.36, gh, sx, y0 + low + gh / 2, z - 0.03, Math.PI / 2);         // vitre latérale
    g.add(box(0.06, 0.24, 0.16, '#15181d', sx + s * 0.24, y0 + low + 0.22, zf + 0.2));   // rétroviseur
    g.add(box(0.2, 0.03, 0.03, '#15181d', sx + s * 0.12, y0 + low + 0.12, zf + 0.2));
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.04), glowMat('#fff4c0')); hl.position.set(x + s * (w / 2 - 0.3), y0 + low * 0.35, zf - 0.02); g.add(hl);
  }
  glass(g, w - 2 * t, gh, x, y0 + low + gh / 2, zf + 0.06);                    // pare-brise
  // tableau de bord
  const dy = y0 + low, dz = zf + 0.36;
  g.add(box(w - 2 * t, 0.26, 0.5, '#30353d', x, dy - 0.1, dz));
  g.add(box(w - 2 * t, 0.04, 0.56, '#1b1e23', x, dy + 0.04, dz - 0.02));
  g.add(box(0.36, 0.2, 0.04, '#1b1e23', x, dy - 0.08, dz + 0.26));             // console centrale
  const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.08), glowMat('#1f8a8a')); radio.position.set(x, dy - 0.05, dz + 0.285); g.add(radio);
  g.add(box(0.26, 0.04, 0.04, trim, x, dy - 0.15, dz + 0.285));
  const drv = seats[0];
  const hood = box(0.5, 0.1, 0.16, '#1b1e23', drv, dy + 0.06, dz + 0.16); g.add(hood);   // visière du combiné
  gauges(g, drv, dy - 0.03, dz + 0.255);
  steering(g, drv, dy + 0.02, seatZ - 0.52);
  // sièges et levier de vitesse
  for (const sx of seats) bucket(g, sx, seatY + 0.04, seatZ, trim);
  const mid = (seats[0] + seats[1]) / 2;
  g.add(box(0.2, 0.3, 0.7, '#23262c', mid, y0 + 0.2, seatZ - 0.05));
  const lever = cyl(0.02, 0.26, '#15181d', 5); lever.position.set(mid, y0 + 0.45, seatZ - 0.3); lever.rotation.x = -0.3; g.add(lever);
  const knob = new THREE.Mesh(prep(new THREE.SphereGeometry(0.045, 6, 4), '#15181d'), flatMat); knob.position.set(mid, y0 + 0.58, seatZ - 0.34); g.add(knob);
}
function buildFireTruck() {
  const g = new THREE.Group(), red = '#d8322a';
  g.add(box(2.4, 0.5, 7.4, '#33373f', 0, 0.75, 0));
  cab(g, red, 2.4, -2.6, 1.7, { seatZ: -2.8, trim: '#b52820' });
  g.add(box(2.4, 1.8, 4.6, red, 0, 1.9, 1.2));
  for (let z = -0.6; z < 3.4; z += 0.9) for (const x of [-1.21, 1.21]) g.add(box(0.02, 1.2, 0.8, '#b52820', x, 1.9, z));
  for (const s of [-1, 1]) g.add(box(0.04, 0.18, 7.2, '#f4f1ea', s * 1.22, 1.3, 0));   // bandes blanches (côtés seulement : la cabine reste dégagée)
  g.add(box(2.2, 0.1, 4.2, '#8d9299', 0, 2.85, 1.2));         // toit
  const turret = new THREE.Group(); turret.position.set(0, 3.05, 0.2); g.add(turret);
  turret.add(cyl(0.25, 0.3, '#8d9299', 8));
  const gun = cyl(0.09, 1.4, '#c9cfd6', 8); gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.15, -0.6); turret.add(gun);
  const ladder = new THREE.Group(); ladder.position.set(0, 3.0, 2.2); g.add(ladder);
  for (const x of [-0.35, 0.35]) ladder.add(box(0.08, 0.08, 3.6, '#c9cfd6', x, 0, -0.4));
  for (let z = -2; z < 1.4; z += 0.4) ladder.add(box(0.7, 0.05, 0.05, '#c9cfd6', 0, 0, z));
  const wh = addWheels(g, [[-1.1, -2.6], [1.1, -2.6], [-1.1, 1.6], [1.1, 1.6], [-1.1, 2.8], [1.1, 2.8]], 0.5, 0.35);
  const lamp = beacon('#3d7bff'); lamp.position.set(-0.6, 2.72, -2.6); g.add(lamp);
  const lamp2 = beacon('#ff3030'); lamp2.position.set(0.6, 2.72, -2.6); g.add(lamp2);
  const p = plate('POMPIERS', red, '#fff4e0', 1.2, 0.27); p.position.set(0, 1.62, -3.565); p.rotation.y = Math.PI; g.add(p);   // sous le pare-brise
  for (const s of [-1, 1]) { const q = plate('PORT-CENDRE · SDIS', red, '#fff4e0', 3, 0.4); q.position.set(s * 1.22, 2.4, 1.2); q.rotation.y = s * Math.PI / 2; g.add(q); }
  return { root: g, wheels: wh, lamp, lamp2, turret, nozzle: new THREE.Vector3(0, 3.2, -0.7) };
}
function buildStairTruck() {
  const g = new THREE.Group(), col = '#f2f2ee';
  g.add(box(2.2, 0.45, 7.0, '#33373f', 0, 0.7, 0));
  // cabine basse à l'avant, sous l'escalier (deux places)
  cab(g, '#1f8a8a', 2.2, -1.9, 1.45, { y0: 0.95, seatY: 1.1, seatZ: -1.8, trim: '#ffd166' });
  // escalier : monte de l'arrière (au ras du sol) vers le palier avant
  const st = new THREE.Group(); g.add(st);
  const N = 15, z0 = 3.5, z1 = -2.6, y0 = 0.35, y1 = 4.4;
  for (let i = 0; i < N; i++) { const k = (i + 0.5) / N; st.add(box(1.3, 0.08, 0.36, '#8d9299', 0.25, y0 + (y1 - y0) * (i + 1) / N - 0.04, z0 + (z1 - z0) * k)); }
  st.add(box(1.4, 0.12, 1.2, '#8d9299', 0.25, y1 - 0.06, -3.2));
  const len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z0 - z1);
  for (const x of [-0.47, 0.97]) {
    const s = box(0.08, 0.3, len, col, x, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2); s.rotation.x = ang; st.add(s);
    const r = box(0.06, 0.06, len, '#ffd166', x, (y0 + y1) / 2 + 0.9, (z0 + z1) / 2); r.rotation.x = ang; st.add(r);
    st.add(box(0.06, 1.0, 1.2, '#ffd166', x, y1 + 0.45, -3.2));
    for (let i = 0; i <= N; i += 3) st.add(box(0.05, 1.0, 0.05, col, x, y0 + (y1 - y0) * i / N + 0.5, z0 + (z1 - z0) * i / N));
  }
  st.add(box(0.2, y1 - 0.9, 0.2, '#6b6f78', 0.7, (y1 + 0.9) / 2 - 0.1, -3.2));
  const wh = addWheels(g, [[-1.0, -2.3], [1.0, -2.3], [-1.0, 2.3], [1.0, 2.3]], 0.45, 0.3);
  const lamp = beacon(); lamp.position.set(-0.55, 2.55, -1.9); g.add(lamp);
  return { root: g, wheels: wh, lamp, stairs: { N, z0, z1, y0, y1, x: 0.25 } };
}
function buildFuelTruck() {
  const g = new THREE.Group();
  g.add(box(2.3, 0.45, 7.6, '#33373f', 0, 0.72, 0));
  cab(g, '#ffd166', 2.3, -2.7, 1.5, { seatZ: -2.8, trim: '#e0a93a' });
  const tank = new THREE.Mesh(prep(new THREE.CylinderGeometry(1.1, 1.1, 5.0, 14), '#e9e4d8'), flatMat);
  tank.rotation.x = Math.PI / 2; tank.position.set(0, 2.1, 1.1); tank.castShadow = true; g.add(tank);
  for (const z of [-1.0, 1.1, 3.2]) { const r = new THREE.Mesh(prep(new THREE.CylinderGeometry(1.13, 1.13, 0.16, 14), '#ff6b5b'), flatMat); r.rotation.x = Math.PI / 2; r.position.set(0, 2.1, z); g.add(r); }
  g.add(box(0.6, 0.6, 0.5, '#5d6470', 1.3, 1.2, 2.6));        // enrouleur
  const reel = new THREE.Mesh(prep(new THREE.TorusGeometry(0.25, 0.08, 5, 12), '#10162b'), flatMat); reel.position.set(1.62, 1.2, 2.6); reel.rotation.y = Math.PI / 2; g.add(reel);
  for (const s of [-1, 1]) { const q = plate('JET A-1 · INFLAMMABLE', '#e9e4d8', '#c82020', 3, 0.35); q.position.set(s * 1.13, 2.1, 1.1); q.rotation.y = s * Math.PI / 2; g.add(q); }
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false }));
  gauge.position.set(1.61, 1.55, 2.6); gauge.rotation.y = Math.PI / 2; g.add(gauge);
  const wh = addWheels(g, [[-1.05, -2.6], [1.05, -2.6], [-1.05, 1.8], [1.05, 1.8], [-1.05, 3.0], [1.05, 3.0]], 0.48, 0.34);
  const lamp = beacon(); lamp.position.set(0, 2.62, -2.7); g.add(lamp);
  return { root: g, wheels: wh, lamp, gauge };
}
function buildForklift() {
  const g = new THREE.Group(), col = '#ffb020';
  g.add(box(1.4, 0.7, 2.4, col, 0, 0.7, 0.3));
  g.add(box(1.4, 0.8, 0.7, '#33373f', 0, 0.8, 1.35));         // contrepoids
  g.add(box(0.8, 0.15, 0.7, '#10162b', 0, 1.15, 0.5));
  g.add(box(0.8, 0.6, 0.12, '#10162b', 0, 1.45, 0.82));
  // pupitre, cadrans, volant et leviers des fourches
  g.add(box(0.7, 0.4, 0.22, '#30353d', 0, 1.25, -0.3));
  gauges(g, 0, 1.33, -0.185);
  steering(g, 0, 1.62, -0.05, 0.17, -0.8);
  for (const x of [0.3, 0.4]) { const l = cyl(0.018, 0.3, '#15181d', 5); l.position.set(x, 1.58, -0.28); l.rotation.x = -0.25; g.add(l); }
  for (const [x, z] of [[-0.62, -0.65], [0.62, -0.65], [-0.62, 1.1], [0.62, 1.1]]) g.add(box(0.07, 1.6, 0.07, '#33373f', x, 1.85, z));
  g.add(box(1.4, 0.08, 1.9, '#33373f', 0, 2.68, 0.22));
  for (const x of [-0.5, 0.5]) g.add(box(0.12, 3.4, 0.14, '#5d6470', x, 1.7, -1.0));   // mât
  const carriage = new THREE.Group(); carriage.position.set(0, 0.25, -1.12); g.add(carriage);
  carriage.add(box(1.2, 0.8, 0.1, '#33373f', 0, 0.4, 0));
  for (const x of [-0.35, 0.35]) carriage.add(box(0.14, 0.07, 1.3, '#8d9299', x, 0.04, -0.65));
  // palette posée sur les dents : on peut monter dessus (et se faire hisser) ; à déposer pour saisir une caisse
  const pallet = buildPallet(); pallet.position.set(0, 0.075, -0.7); carriage.add(pallet);
  const wh = addWheels(g, [[-0.66, -0.55], [0.66, -0.55], [-0.6, 1.2], [0.6, 1.2]], 0.34, 0.25);
  const lamp = beacon(); lamp.position.set(0, 2.8, 0.22); g.add(lamp);
  return { root: g, wheels: wh, lamp, carriage, pallet };
}
// palette 1,2 × 1,2 m, origine au sol au centre, dessus à PALLET_H
const PALLET_H = 0.13;
function buildPallet() {
  const p = new THREE.Group();
  for (const x of [-0.5, 0, 0.5]) p.add(box(0.14, 0.08, 1.2, '#8a6a3c', x, 0.04, 0));
  for (const z of [-0.48, -0.24, 0, 0.24, 0.48]) p.add(box(1.2, 0.05, 0.16, '#b08850', 0, 0.105, z));
  return p;
}
function buildTug() {
  const g = new THREE.Group(), col = '#5ef2c2';
  g.add(box(2.6, 0.9, 4.4, col, 0, 0.85, 0));
  g.add(box(2.7, 0.3, 4.5, '#33373f', 0, 0.35, 0));
  // poste de conduite ouvert : deux sièges, pupitre, volant, arceau de sécurité
  g.add(box(2.0, 0.05, 1.6, '#23262c', 0.3, 1.32, 1.0));                  // tapis de sol
  bucket(g, 0, 1.49, 1.0, '#1f8a8a');
  bucket(g, 0.85, 1.49, 1.1, '#1f8a8a');
  g.add(box(1.5, 0.42, 0.28, '#30353d', 0.3, 1.52, 0.3));                 // pupitre
  g.add(box(1.5, 0.04, 0.34, '#1b1e23', 0.3, 1.74, 0.3));
  gauges(g, -0.05, 1.56, 0.445);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), glowMat('#1f8a8a')); scr.position.set(0.55, 1.56, 0.445); g.add(scr);
  steering(g, 0, 1.78, 0.52, 0.2, -0.75);
  for (const x of [-0.55, 1.35]) g.add(box(0.08, 1.3, 0.08, '#ffd166', x, 1.95, 1.62));
  g.add(box(1.98, 0.08, 0.08, '#ffd166', 0.4, 2.6, 1.62));
  const bar = new THREE.Group(); bar.position.set(0, 0.6, -2.3); g.add(bar);
  bar.add(box(0.14, 0.14, 1.6, '#ffd166', 0, 0, -0.8));
  bar.add(box(0.4, 0.2, 0.2, '#10162b', 0, 0, -1.6));
  const wh = addWheels(g, [[-1.15, -1.4], [1.15, -1.4], [-1.15, 1.4], [1.15, 1.4]], 0.45, 0.35);
  const lamp = beacon(); lamp.position.set(0.4, 2.72, 1.62); g.add(lamp);
  const p = plate('PUSHBACK', '#10162b', col, 1.6, 0.3); p.position.set(0, 1.0, -2.21); p.rotation.y = Math.PI; g.add(p);
  return { root: g, wheels: wh, lamp, bar, hitch: new THREE.Vector3(0, 0.6, -3.9) };
}

// fusionne les pièces fixes d'un groupe par matériau : un appel de dessin (et d'ombre) par matériau
// au lieu d'un par pièce. `skip(o)` : pièces à garder à part (roues, gyrophares, tourelle, fourches…)
export function mergeByMaterial(root, skip = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (skip(p)) return;
    const keys = ['position', 'normal', 'color'].filter((k) => o.geometry.attributes[k]);
    if (o.material.map) keys.push('uv');
    const id = `${o.material.uuid}|${keys.join()}`;
    if (!groups.has(id)) groups.set(id, { mat: o.material, keys, list: [] });
    groups.get(id).list.push(o);
  });
  for (const { mat, keys, list } of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
      return g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    list.forEach((o) => o.parent.remove(o));
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = list.some((o) => o.castShadow); m.receiveShadow = list.some((o) => o.receiveShadow);
    m.userData.noCollide = list.every((o) => o.userData.noCollide);
    root.add(m);
  }
}
function mergeModel(model) {
  const keep = new Set([model.lamp, model.lamp2, model.turret, model.carriage, model.gauge, ...model.wheels.filter((_, i) => i % 2 === 0)].filter(Boolean));
  mergeByMaterial(model.root, (o) => keep.has(o));
  if (model.turret) mergeByMaterial(model.turret);
  if (model.carriage) mergeByMaterial(model.carriage, (o) => o === model.pallet);
  if (model.pallet) mergeByMaterial(model.pallet);
  return model;
}

export const VTYPES = {
  kart: { name: 'Kart à bagages', build: buildKart, max: 9, accel: 7, turn: 1.9, len: 3.0, wid: 1.6, h: 2.65, seat: [-0.3, 1.0, -0.05], pass: [0.33, 1.0, -0.05], eye: 0.86, cam: 6, battery: true, cargo: true, drain: 0.12 },
  fire: { name: 'Camion de pompiers', build: buildFireTruck, max: 11, accel: 4, turn: 1.1, len: 7.4, wid: 2.4, h: 2.9, seat: [-0.55, 1.2, -2.8], pass: [0.55, 1.2, -2.8], eye: 0.95, cam: 11, spray: true },
  stairs: { name: 'Camion-escalier', build: buildStairTruck, max: 7, accel: 3.5, turn: 1.0, len: 7.2, wid: 2.2, h: 5.4, seat: [-0.55, 1.1, -1.8], pass: [0.55, 1.1, -1.8], eye: 0.95, cam: 11, stairs: true },
  fuel: { name: 'Camion-citerne', build: buildFuelTruck, max: 10, accel: 3.5, turn: 1.0, len: 7.6, wid: 2.3, h: 3.2, seat: [-0.55, 1.2, -2.8], pass: [0.55, 1.2, -2.8], eye: 0.95, cam: 11, fuel: true },
  fork: { name: 'Chariot élévateur', build: buildForklift, max: 6, accel: 4, turn: 1.8, len: 3.0, wid: 1.5, h: 2.8, seat: [0, 1.25, 0.5], eye: 0.95, cam: 7, forks: true },
  tug: { name: 'Tracteur de repoussage', build: buildTug, max: 5, accel: 2.5, turn: 1.1, len: 4.5, wid: 2.7, h: 2.2, seat: [0, 1.45, 1.0], pass: [0.85, 1.45, 1.1], eye: 0.95, cam: 10, tug: true },
};

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export const VehicleMixin = {
  vehiclesInit() {
    this.vehicles = {};
    this.vehicleCols = [];
    this.vehiclePlats = [];
    this.driving = null;
    this.vcam = { yaw: 0, pitch: 0.22, first: false };
    this.sprayFx = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.75, toneMapped: false });
    const geo = new THREE.SphereGeometry(0.18, 5, 4);
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; this.scene.add(m); this.sprayFx.push({ m, v: new THREE.Vector3(), t: 0 }); }
  },
  // crée (ou recrée) un véhicule à sa place de départ
  addVehicle(id, type, x, z, yaw, extra = {}) {
    const old = this.vehicles[id];
    if (old) { this.scene.remove(old.model.root); if (old.palletMesh) this.scene.remove(old.palletMesh); }
    const def = VTYPES[type];
    const model = mergeModel(def.build());
    this.scene.add(model.root);
    const v = { id, type, def, model, home: { x, z, yaw }, x, z, yaw, y: heightAt(x, z), pitch: 0, speed: 0, drv: null, bat: 100, hp: 100, cargo: null, fork: 0, spray: false, t: { x, z, yaw }, wheelA: 0, ...extra };
    this.vehicles[id] = v;
    // chariot élévateur : palette détachable (sur les fourches, ou posée au sol)
    if (def.forks) { v.palletMesh = buildPallet(); mergeByMaterial(v.palletMesh); v.palletMesh.visible = false; this.scene.add(v.palletMesh); this.setPallet(v, 1); }
    this.poseVehicle(v);
    return v;
  },
  resetVehicles() {
    if (this.driving) this.exitVehicle(true);
    if (this.riding) this.exitPassenger(true);
    for (const v of Object.values(this.vehicles)) {
      Object.assign(v, { x: v.home.x, z: v.home.z, yaw: v.home.yaw, speed: 0, drv: null, pas: null, bat: 100, hp: 100, cargo: null, fork: 0, spray: false, hitched: false, vlat: 0, roll: 0, pdyn: 0 });
      v.t = { x: v.x, z: v.z, yaw: v.yaw };
      if (v.def.forks) this.setPallet(v, 1);
      this.poseVehicle(v);
    }
  },
  // palette du chariot : on = sur les fourches ; sinon posée en at = { x, z, yaw, y }
  setPallet(v, on, at = null) {
    v.pallet = on ? 1 : 0;
    v.palletAt = on ? null : at;
    v.model.pallet.visible = !!on;
    v.palletMesh.visible = !on && !!at;
    if (!on && at) { v.palletMesh.position.set(at.x, at.y, at.z); v.palletMesh.rotation.set(0, at.yaw, 0); }
  },
  // ce qui se trouve devant les fourches : un objet à saisir, ou la palette posée
  forkTarget(v) {
    const tip = this.vehicleWorld(v, new THREE.Vector3(0, 0.3 + v.fork, -1.9));
    let item = null, bd = 1.8;
    for (const it of Object.values(this.items)) {
      if (it.state !== 'ground' || it.onVehicle) continue;
      const dd = Math.hypot(it.pos.x - tip.x, it.pos.z - tip.z);
      if (dd < bd) { bd = dd; item = it; }
    }
    const itemOk = item && Math.abs(item.pos.y - (tip.y - 0.3)) < 1.2;
    const P = v.palletAt;
    const palletNear = !v.pallet && P && Math.hypot(P.x - tip.x, P.z - tip.z) < 1.4;
    const palletOk = palletNear && Math.abs(P.y - (tip.y - 0.3)) < 0.6;
    return { tip, item, itemOk, palletNear, palletOk };
  },
  // consigne contextuelle affichée pendant la conduite du chariot
  forkHint(v) {
    const T = this.forkTarget(v);
    if (v.cargo) return `${this.items[v.cargo]?.def.name || 'Charge'} sur les fourches · <kbd>Espace</kbd> la poser`;
    if (v.pallet) {
      if (T.item) return `<span class="warn">Palette sur les fourches</span> : reculez et déposez-la à l'écart (<kbd>Espace</kbd>) pour saisir ${T.item.def.name}`;
      return '<kbd>Espace</kbd> déposer la palette (pour saisir une caisse) · on peut monter dessus et se faire hisser';
    }
    if (T.item) return T.itemOk ? `<kbd>Espace</kbd> saisir : ${T.item.def.name}` : `${T.item.def.name} : ${T.item.pos.y > T.tip.y - 0.3 ? 'montez' : 'baissez'} les fourches (<kbd>${T.item.pos.y > T.tip.y - 0.3 ? 'R' : 'F'}</kbd>)`;
    if (T.palletNear) return T.palletOk ? '<kbd>Espace</kbd> reprendre la palette' : 'Palette : baissez les fourches (<kbd>F</kbd>)';
    const d = v.palletAt ? Math.hypot(v.palletAt.x - v.x, v.palletAt.z - v.z) : 0;
    return `Fourches libres : approchez-les d'une caisse${v.palletAt ? ` · palette posée à ${Math.round(d)} m` : ''}`;
  },
  poseVehicle(v) {
    const d = v.def, fw = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    // on ignore ses propres marches (sinon le camion-escalier se hisse sur lui-même à chaque image)
    const hf = this.groundAt(v.x + fw.x * d.len * 0.4, v.z + fw.z * d.len * 0.4, v.y + 1.2, v);
    const hb = this.groundAt(v.x - fw.x * d.len * 0.4, v.z - fw.z * d.len * 0.4, v.y + 1.2, v);
    v.y = Math.max(-0.4, (hf + hb) / 2);
    v.pitch = Math.atan2(hf - hb, d.len * 0.8);
    const r = v.model.root;
    r.position.set(v.x, v.y, v.z);
    r.rotation.set(v.pitch + (v.pdyn || 0), v.yaw, v.roll || 0, 'YXZ');
    for (let i = 0; i < v.model.wheels.length; i += 2) v.model.wheels[i].rotation.x = v.wheelA;
    if (v.model.carriage) v.model.carriage.position.y = 0.25 + v.fork;
  },
  // le modèle est posé directement dans la scène : sa matrice monde = sa matrice locale (pas besoin de parcourir ses enfants)
  vehicleWorld(v, local) { const r = v.model.root; r.updateMatrix(); r.matrixWorld.copy(r.matrix); return local.clone().applyMatrix4(r.matrixWorld); },

  // colliders à moins de R (en x/z) d'un point, pris dans plusieurs listes : évite de tester (et de recopier)
  // les milliers de boîtes de tout l'archipel à chaque image
  nearCols(x, z, R, ...lists) {
    const out = [];
    for (let L of lists) {
      if (!L) continue;
      // la grande liste de l'archipel passe par sa grille
      if (L === this.colliders) { this._colGrid = this._colGrid?.list === L ? this._colGrid : Object.assign(makeColGrid(L), { list: L }); L = this._colGrid.query(x, z, R); }
      for (const c of L) {
        if (!c) continue;
        if (c.type === 'circle') { if (Math.abs(c.x - x) > R + c.r || Math.abs(c.z - z) > R + c.r) continue; }
        else if (c.minX !== undefined && (c.maxX < x - R || c.minX > x + R || c.maxZ < z - R || c.minZ > z + R)) continue;
        out.push(c);
      }
    }
    return out;
  },
  planeNear(x, z, R) { const p = this.plane.root.position; return Math.abs(p.x - x) < R && Math.abs(p.z - z) < R; },

  // ── chaque image : miroirs, colliders, cargaisons, recharge ──
  updateVehicles(dt) {
    const cols = [], plats = [];
    const me = this.myId();
    for (const v of Object.values(this.vehicles)) {
      if (v !== this.driving) {
        // véhicule conduit par un coéquipier : on suit sa présence
        const k = Math.min(1, dt * 10);
        const dx = v.t.x - v.x, dz = v.t.z - v.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.001 || Math.abs(v.t.yaw - v.yaw) > 0.001) {
          v.wheelA += Math.hypot(dx, dz) * k / 0.4;
          v.x += dx * k; v.z += dz * k;
          let dy = v.t.yaw - v.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
          v.yaw += dy * k;
          this.poseVehicle(v);
        }
        if (v.t.fork !== undefined) { v.fork += (v.t.fork - v.fork) * k; if (v.model.carriage) v.model.carriage.position.y = 0.25 + v.fork; }
      }
      // carrosserie abîmée : fumée grise, noire quand le véhicule est en panne
      const smoke = v.hp <= 0 ? 'dead' : v.hp < 50 ? 'hurt' : null;
      if (smoke !== v._smoke || (smoke && !this.smoke.emitters.has(`veh_${v.id}`))) {
        v._smoke = smoke;
        this.smoke.remove(`veh_${v.id}`);
        if (smoke) this.smoke.add(`veh_${v.id}`, () => this.vehicleWorld(v, new THREE.Vector3(0, v.def.h * 0.55, -v.def.len * 0.3)), smoke === 'dead' ? '#2a2724' : '#9a9690', smoke === 'dead' ? 5 : 2.5, 1.6);
      }
      // lumière tournante quand quelqu'un conduit
      if (v.model.lamp) v.model.lamp.visible = !!v.drv && Math.sin(this.t * 8 + v.x) > -0.2;
      if (v.model.lamp2) v.model.lamp2.visible = !!v.drv && Math.sin(this.t * 8 + v.x) < 0.2;
      // cargaison posée sur le plateau / les fourches
      if (v.cargo) {
        const it = this.items[v.cargo];
        if (it && it.onVehicle === v.id) {
          const base = v.def.forks ? new THREE.Vector3(0, (v.pallet ? 0.46 : 0.33) + v.fork, -1.75) : v.model.cargo;   // sur la palette ou à même les dents
          const p = this.vehicleWorld(v, base);
          it.pos.set(p.x, p.y, p.z);
          it.mesh.position.set(p.x, p.y + it.rest, p.z);
          it.mesh.rotation.set(it.def.tilt || 0, v.yaw, 0, 'YXZ');
        }
      }
      // colliders : deux ou trois cercles le long du véhicule (sauf celui qu'on conduit)
      if (v !== this.driving) {
        const d = v.def, fw = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)), r = d.wid / 2;
        const n = d.len > 5 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * (d.len - d.wid);
          if (d.stairs && o <= 0) continue;   // camion-escalier : seul l'avant (cabine) bloque, on monte par l'arrière
          cols.push({ type: 'circle', x: v.x + fw.x * o, z: v.z + fw.z * o, r, minY: v.y - 1.7, maxY: v.y + (d.stairs ? 2.4 : d.h - 0.35), veh: v.id });
        }
      }
      // marches du camion-escalier (plateformes orientées qui suivent le camion)
      if (v.def.stairs) {
        const S = v.model.stairs;
        for (let i = 0; i < S.N; i++) {
          const zc = S.z0 + (S.z1 - S.z0) * (i + 0.5) / S.N, hz = Math.abs(S.z1 - S.z0) / S.N / 2 + 0.02;
          plats.push({ obb: true, x: v.x, z: v.z, r: v.yaw, minX: S.x - 0.7, maxX: S.x + 0.7, minZ: zc - hz, maxZ: zc + hz, top: v.y + S.y0 + (S.y1 - S.y0) * (i + 1) / S.N, veh: v.id });
        }
        plats.push({ obb: true, x: v.x, z: v.z, r: v.yaw, minX: S.x - 0.7, maxX: S.x + 0.7, minZ: -3.8, maxZ: -2.6, top: v.y + S.y1, veh: v.id, landing: true });
        // rampes (collision) le long de l'escalier
        for (const sx of [S.x - 0.8, S.x + 0.8]) {
          const a = this.vehicleWorld(v, new THREE.Vector3(sx, 0, S.z0)), b = this.vehicleWorld(v, new THREE.Vector3(sx, 0, -3.8));
          for (let k = 0; k <= 8; k++) { const u = k / 8; cols.push({ type: 'circle', x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, r: 0.1, minY: v.y - 0.5 + u * 3.5, maxY: v.y + S.y1 + 1, veh: v.id }); }
        }
      }
      // palette du chariot élévateur : sur les fourches, plateforme qui suit leur hauteur ; sinon posée au sol
      if (v.def.forks && v.pallet && !v.cargo) {
        plats.push({ obb: true, x: v.x, z: v.z, r: v.yaw, minX: -0.62, maxX: 0.62, minZ: -2.44, maxZ: -1.2, top: v.y + 0.455 + v.fork, veh: v.id, pallet: true });
      } else if (v.def.forks && v.palletAt) {
        const P = v.palletAt;
        plats.push({ obb: true, x: P.x, z: P.z, r: P.yaw, minX: -0.62, maxX: 0.62, minZ: -0.62, maxZ: 0.62, top: P.y + PALLET_H, veh: v.id, pallet: true });
      }
      // borne de recharge
      if (v.def.battery && v.charger) {
        const d = Math.hypot(v.x - v.charger.x, v.z - v.charger.z);
        v.charging = d < 3.4 && Math.abs(v.speed) < 0.5;
        if (v.charging && (v === this.driving || (!v.drv && this.isAuthority()))) v.bat = Math.min(100, v.bat + dt * 14);
        if (v.chargerMesh) v.chargerMesh.userData.screen.material.color.set(v.charging ? (Math.sin(this.t * 6) > 0 ? '#5ef2c2' : '#1f8a8a') : v.bat < 20 ? '#ff6b5b' : '#5ef2c2');
      }
    }
    this.vehicleCols = cols;
    this.vehiclePlats = plats;
    this.updateSprayFx(dt);
  },

  // ── interactions à pied ──
  vehicleInteractions(add, me) {
    for (const v of Object.values(this.vehicles)) {
      const d = Math.hypot(v.x - me.x, v.z - me.z);
      if (d > v.def.len / 2 + 3) continue;
      const seat = this.vehicleWorld(v, V3(v.def.seat));
      const taken = v.drv && v.drv !== this.myId() && this.session?.players.has(v.drv);
      const state = v.hp <= 0 ? ' · <span class="warn">en panne</span>' : v.hp < 100 ? ` · état ${Math.round(v.hp)} %` : '';
      if (!this.carrying) add(seat.clone().setY(Math.max(seat.y, me.y + 0.6)), v.def.len / 2 + 1.2, taken ? { prompt: `<span class="warn">${v.def.name} : quelqu'un conduit</span>` } : { prio: 1, prompt: `<kbd>E</kbd> conduire : ${v.def.name}${v.def.battery ? ` (batterie ${Math.round(v.bat)} %)` : ''}${state}`, press: () => this.enterVehicle(v) });
      // place passager (côté droit)
      if (v.def.pass && !this.carrying) {
        const ps = this.vehicleWorld(v, V3(v.def.pass));
        const ptaken = v.pas && v.pas !== this.myId() && (!this.session || this.session.players.has(v.pas));
        if (!ptaken && !(v.def.cargo && v.cargo && false)) add(ps.clone().setY(Math.max(ps.y, me.y + 0.6)), v.def.len / 2 + 1.0, { prio: 0.8, prompt: `<kbd>E</kbd> monter en passager : ${v.def.name}`, press: () => this.enterPassenger(v) });
      }
      // kart : poser / reprendre une cargaison
      if (v.def.cargo) {
        const bed = this.vehicleWorld(v, v.model.cargo);
        if (this.carrying && !v.cargo && this.carrying.def.weight <= 3) add(bed, 3.0, { prio: 3, prompt: `<kbd>E</kbd> poser sur le kart : ${this.carrying.def.name}`, press: () => { this.act('vload', { v: v.id, id: this.carrying.id }); this.carrying = null; this.audio.drop(); } });
        if (!this.carrying && v.cargo) add(bed, 3.0, { prio: 2, prompt: `<kbd>E</kbd> reprendre sur le kart : ${this.items[v.cargo]?.def.name || ''}`, press: () => this.act('vunload', { v: v.id }) });
      }
    }
  },

  enterVehicle(v) {
    if (this.act('vdrive', { v: v.id, on: 1 }) === false) { this.ui.toast('Occupé', 'Quelqu\'un conduit déjà.', 'bad', 1800); return; }
    this.driving = v;
    this.vcam.yaw = 0; this.vcam.pitch = 0.22;
    this.audio.clank();
    const hints = { kart: 'Garez-le près de la borne pour recharger. Posez une pièce sur le plateau (à pied, <kbd>E</kbd>).', fire: '<kbd>Clic</kbd> maintenu : lance à eau (visez avec la souris).', stairs: 'Reculez l\'escalier contre la porte de l\'avion, puis montez à pied.', fuel: '<kbd>Espace</kbd> maintenu : remplir la citerne au dépôt, ou le Boeing sous l\'aile.', fork: 'Une palette est posée sur les fourches : montez dessus pour vous faire hisser. Pour saisir une caisse, déposez d\'abord la palette à l\'écart (<kbd>Espace</kbd>), puis approchez les fourches nues de la caisse (<kbd>Espace</kbd>). <kbd>R</kbd>/<kbd>F</kbd> monter/baisser.', tug: '<kbd>Espace</kbd> atteler / dételer la roue avant du Boeing.' };
    if (!this.said.has(`veh_${v.type}`)) { this.said.add(`veh_${v.type}`); this.ui.toast(v.def.name, hints[v.type] || '', 'good', 6000); }
  },
  enterPassenger(v) {
    if (this.act('vpass', { v: v.id, on: 1 }) === false) { this.ui.toast('Occupé', 'La place passager est prise.', 'bad', 1800); return; }
    this.riding = v;
    this.vcam.yaw = 0; this.vcam.pitch = 0.22; this.vcam.first = true;
    this.player.pitch = 0; this.player.yaw = v.yaw;
    this.audio.clank();
    if (!this.said.has('passenger')) { this.said.add('passenger'); this.ui.toast('Passager', 'Clic : tirer · <kbd>C</kbd> vue · <kbd>E</kbd> descendre', 'good', 3500); }
  },
  exitPassenger(silent) {
    const v = this.riding;
    if (!v) return;
    this.riding = null;
    this.act('vpass', { v: v.id, on: 0 });
    const side = this.vehicleWorld(v, new THREE.Vector3(v.def.wid / 2 + 0.9, 0, v.def.pass[2]));
    let x = side.x, z = side.z;
    if (heightAt(x, z) < -1.2) { const o = this.vehicleWorld(v, new THREE.Vector3(-(v.def.wid / 2 + 0.9), 0, v.def.pass[2])); x = o.x; z = o.z; }
    const yaw = this.player.yaw;
    this.player.place(x, z, yaw);
    this.player.pos.y = this.groundAt(x, z, v.y + 1);
    if (!silent) this.audio.clank();
  },
  // passager : on suit le véhicule, regard libre, on peut tirer
  updateRiding(dt, blocked) {
    const v = this.riding, d = v.def, inp = this.input, P = this.player;
    if (!blocked) {
      P.yaw -= inp.mdx * 0.0022 * P.sens;
      P.pitch = clamp(P.pitch - inp.mdy * 0.0022 * P.sens, -1.3, 1.2);
      if (inp.hit('KeyC')) this.vcam.first = !this.vcam.first;
    }
    // le véhicule tourne : le regard tourne avec lui
    if (this._rideYaw !== undefined) { let dy = v.yaw - this._rideYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy; }
    this._rideYaw = v.yaw;
    const seat = this.vehicleWorld(v, V3(d.pass));
    P.pos.copy(seat).setY(v.y);
    const cam = this.camera;
    if (this.vcam.first) {
      cam.position.copy(this.vehicleWorld(v, V3(d.pass).add(new THREE.Vector3(0, d.eye, 0.04))));
      cam.quaternion.setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    } else {
      const tgt = new THREE.Vector3(v.x, v.y + d.h * 0.7, v.z), dist = d.cam, pitch = clamp(0.25 - P.pitch * 0.6, -0.3, 1.0);
      cam.position.set(tgt.x + Math.sin(P.yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(P.yaw) * Math.cos(pitch) * dist);
      cam.position.y = Math.max(cam.position.y, this.groundAt(cam.position.x, cam.position.z, 99) + 0.6);
      this.camClip('veh', tgt, cam.position, dt, { ignoreVeh: v.id, cols: this.nearCols(v.x, v.z, dist + 3, this.colliders, this.blockCols, this.vehicleCols) });
      cam.lookAt(tgt);
    }
    this.moving = false;
    this.ui.carry(`Passager · ${d.name}`, `${Math.round(Math.abs(v.speed || (v.t ? 0 : 0)) * 3.6)} km/h`);
    if (inp.hit('KeyE') && !blocked) { this.exitPassenger(); inp.pressed.delete('KeyE'); }
  },
  // son propre personnage, visible en vue extérieure (conduite, passager)
  updateSelfAvatar(dt) {
    const v = this.driving || this.riding;
    const show = v && !this.vcam.first && this.mode === 'explore';
    if (show && (!this.selfAv || this.selfAv.ci !== (this.profile.char || 0) || this.selfAv.sig !== this.wearSig())) {
      if (this.selfAv) this.scene.remove(this.selfAv.root);
      this.selfAv = buildAvatar(this.profile.name, this.profile.color, 0, this.profile.char || 0, this.wearSig());
      this.selfAv.root.traverse((o) => { if (o.isSprite) o.visible = false; });
      this.scene.add(this.selfAv.root);
    }
    if (!this.selfAv) return;
    this.selfAv.root.visible = !!show;
    if (!show) return;
    const sp = this.vehicleWorld(v, V3(this.driving ? v.def.seat : v.def.pass));
    this.selfAv.root.position.copy(sp).setY(sp.y - 0.36);
    this.selfAv.root.rotation.set(0, v.yaw + (v.def.reverseSeat && this.driving ? Math.PI : 0), 0);
    this.selfAv.animate(dt, { seat: true, armed: !this.driving, slot: this.driving ? 0 : this.slot, attack: this.attackCd > 0.2 ? 1 : 0, mouth: this.voice?.level || 0 });
  },
  exitVehicle(silent) {
    const v = this.driving;
    if (!v) return;
    this.driving = null;
    v.speed = 0; v.vlat = 0; v.roll = 0; v.pdyn = 0;
    this.audio.setEngine(0, 0);
    this.camera.fov = this.baseFov || 72; this.camera.updateProjectionMatrix();
    this.act('vdrive', { v: v.id, on: 0, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(3), bat: Math.round(v.bat), fork: +v.fork.toFixed(2) });
    // on descend côté conducteur
    const side = this.vehicleWorld(v, new THREE.Vector3(-(v.def.wid / 2 + 0.9), 0, v.def.seat[2]));
    let x = side.x, z = side.z;
    if (heightAt(x, z) < -1.2) { const o = this.vehicleWorld(v, new THREE.Vector3(v.def.wid / 2 + 0.9, 0, v.def.seat[2])); x = o.x; z = o.z; }
    this.player.place(x, z, v.yaw);
    this.player.pos.y = this.groundAt(x, z, v.y + 1);
    if (!silent) this.audio.clank();
  },

  // ── conduite ──
  updateDriving(dt, blocked) {
    const v = this.driving, d = v.def, inp = this.input, ui = this.ui;
    const P = this.player;
    let thr = 0, steer = 0;
    if (!blocked) {
      if (inp.down('KeyW', 'ArrowUp')) thr += 1;
      if (inp.down('KeyS', 'ArrowDown')) thr -= 1;
      if (inp.down('KeyA', 'ArrowLeft')) steer += 1;
      if (inp.down('KeyD', 'ArrowRight')) steer -= 1;
      this.vcam.yaw -= inp.mdx * 0.0022 * P.sens;
      this.vcam.pitch = clamp(this.vcam.pitch + inp.mdy * 0.0022 * P.sens, -0.5, 1.0);
      if (inp.hit('KeyC')) this.vcam.first = !this.vcam.first;
    }
    if (d.reverseSeat) { thr = -thr; }
    const dead = d.battery && v.bat <= 0;
    const broken = v.hp <= 0;
    const max = dead || broken ? (broken ? 1.8 : 1.2) : d.max * (v.hp < 35 ? 0.75 : 1);
    const hand = !blocked && inp.down('Space') && !d.fuel && !d.forks && !d.tug;
    // direction progressive (plus douce à haute vitesse)
    v.steer = (v.steer || 0) + (steer - (v.steer || 0)) * Math.min(1, dt * (steer ? 5 : 8));
    const sp0 = v.speed;
    if (thr !== 0 && Math.sign(thr) !== Math.sign(v.speed) && Math.abs(v.speed) > 0.3) v.speed += thr * d.accel * 2.4 * dt;   // freinage
    else if (thr !== 0) v.speed += thr * d.accel * (1 - 0.55 * Math.min(1, Math.abs(v.speed) / max)) * dt;
    else v.speed *= Math.exp(-0.9 * dt);   // roue libre
    if (hand) v.speed *= Math.exp(-1.4 * dt);
    v.speed = clamp(v.speed, -max * 0.45, max);
    if (v.hitched) v.speed = clamp(v.speed, -2.2, 2.2);
    const turnF = clamp(Math.abs(v.speed) / 3, 0, 1) * (1 - 0.35 * clamp((Math.abs(v.speed) - max * 0.5) / max, 0, 1));
    const yawRate = v.steer * d.turn * turnF * Math.sign(v.speed || 1) * (hand ? 1.45 : 1);
    v.yaw += yawRate * dt;
    // glisse latérale : l'inertie pousse vers l'extérieur du virage, l'adhérence la ramène (frein à main = dérapage)
    const grip = (hand ? 1.1 : 5) * (d.len > 5 ? 0.85 : 1);
    v.vlat = ((v.vlat || 0) + yawRate * v.speed * (hand ? 0.9 : 0.45) * dt) * Math.exp(-grip * dt);
    if (hand && Math.abs(v.vlat) > 1.5 && Math.abs(v.speed) > 4) { this._skid = (this._skid || 0) - dt; if (this._skid <= 0) { this._skid = 0.25; this.audio.splash?.(); } }
    // carrosserie : roulis dans les virages, cabrage à l'accélération
    v.roll = (v.roll || 0) + (clamp(-yawRate * v.speed * 0.03, -0.1, 0.1) - (v.roll || 0)) * Math.min(1, dt * 6);
    v.pdyn = (v.pdyn || 0) + (clamp((v.speed - sp0) / Math.max(dt, 1e-3) * 0.006, -0.05, 0.05) - (v.pdyn || 0)) * Math.min(1, dt * 5);
    const fw = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)), rt = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    let nx = v.x + (fw.x * v.speed + rt.x * v.vlat) * dt, nz = v.z + (fw.z * v.speed + rt.z * v.vlat) * dt;
    // moteur
    const rev = Math.min(1, Math.abs(v.speed) / d.max);
    this.audio.setEngine(0.18 + rev * 0.3 + Math.abs(thr) * 0.08, 0.12 + rev * 0.55 + (thr ? 0.08 : 0));
    // champ de vision : un peu plus large avec la vitesse
    const baseFov = this.baseFov || 72;
    const fov = baseFov + rev * 9;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }
    // eau profonde : on s'arrête au bord
    const probe = Math.sign(v.speed || 1) * d.len * 0.5;
    if (heightAt(nx + fw.x * probe, nz + fw.z * probe) < -0.7 && !this.onAnyPlatform(nx + fw.x * probe, nz + fw.z * probe)) { nx = v.x; nz = v.z; v.speed = 0; }
    // collisions : cercles le long du véhicule
    const reach = d.len + Math.abs(v.speed) * dt + 2;
    const cols = this.nearCols(nx, nz, reach, this.colliders, this.blockCols, this.vehicleCols, this.planeNear(nx, nz, reach + 12) ? this.planeColliders() : null, this.extraVehicleCols?.(v));
    const r = d.wid / 2, n = d.len > 5 ? 3 : 2;
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const o = (i / (n - 1) - 0.5) * (d.len - d.wid);
        let cx = nx + fw.x * o, cz = nz + fw.z * o;
        for (const c of cols) {
          // ses propres colliders (rampes du camion-escalier) : sinon il se repousse lui-même à chaque image
          if (c.disabled || c.veh === v.id || c.item?.onVehicle === v.id) continue;
          if ((c.minY !== undefined && v.y + d.h < c.minY + 1.7 - 0.2) || (c.maxY !== undefined && v.y + 0.5 > c.maxY + 0.3)) continue;
          if (c.type === 'circle') {
            const dx = cx - c.x, dz = cz - c.z, dd = Math.hypot(dx, dz), m = c.r + r;
            if (dd < m && dd > 1e-4) { const push = m - dd; nx += dx / dd * push; nz += dz / dd * push; cx += dx / dd * push; cz += dz / dd * push; hit = true; }
          } else {
            const qx = Math.max(c.minX, Math.min(cx, c.maxX)), qz = Math.max(c.minZ, Math.min(cz, c.maxZ));
            const dx = cx - qx, dz = cz - qz, dd = Math.hypot(dx, dz);
            if (dd < r && dd > 1e-4) { const push = r - dd; nx += dx / dd * push; nz += dz / dd * push; cx += dx / dd * push; cz += dz / dd * push; hit = true; }
          }
        }
      }
    }
    if (hit && Math.abs(v.speed) > 2.5) { this.audio.clank(); P.shake = Math.min(1, P.shake + 0.4); }
    if (hit) { v.speed *= Math.exp(-6 * dt); v.vlat *= Math.exp(-8 * dt); }
    const moved = Math.hypot(nx - v.x, nz - v.z);
    v.x = nx; v.z = nz;
    v.wheelA -= moved / 0.4 * Math.sign(v.speed || 1);
    if (d.battery) v.bat = Math.max(0, v.bat - moved * d.drain);
    // fourches
    if (d.forks && !blocked) {
      if (inp.down('KeyR')) v.fork = Math.min(3.1, v.fork + dt * 1.1);
      if (inp.down('KeyF')) v.fork = Math.max(0, v.fork - dt * 1.1);
    }
    this.poseVehicle(v);
    this.vehicleRam(v, fw, rt);
    // position du joueur = siège (portée de la voix, zombies…)
    const seat = this.vehicleWorld(v, V3(d.seat));
    P.pos.copy(seat).setY(v.y);
    this.moving = Math.abs(v.speed) > 0.5;
    // capacités
    v.spray = false;
    if (!blocked) this.vehicleAbility(v, dt);
    // caméra
    const cam = this.camera;
    if (this.vcam.first) {
      const eye = this.vehicleWorld(v, V3(d.seat).add(new THREE.Vector3(0, d.eye, 0.04)));
      cam.position.copy(eye);
      cam.quaternion.copy(v.model.root.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.vcam.pitch + 0.2, (d.reverseSeat ? Math.PI : 0) + this.vcam.yaw, 0, 'YXZ')));
    } else {
      if (Math.abs(v.speed) > 1 && !inp.mdx) this.vcam.yaw *= Math.exp(-1.2 * dt);
      const a = v.yaw + this.vcam.yaw + (d.reverseSeat ? Math.PI : 0), dist = d.cam;
      const tgt = new THREE.Vector3(v.x, v.y + d.h * 0.7, v.z);
      cam.position.set(tgt.x + Math.sin(a) * Math.cos(this.vcam.pitch) * dist, tgt.y + Math.sin(this.vcam.pitch) * dist, tgt.z + Math.cos(a) * Math.cos(this.vcam.pitch) * dist);
      cam.position.y = Math.max(cam.position.y, this.groundAt(cam.position.x, cam.position.z, 99) + 0.6);
      this.camClip('veh', tgt, cam.position, dt, { ignoreVeh: v.id, cols: this.nearCols(v.x, v.z, dist + 3, this.colliders, this.blockCols, this.vehicleCols) });
      cam.lookAt(tgt);
    }
    P.yaw = v.yaw + this.vcam.yaw + (d.reverseSeat ? Math.PI : 0);
    // HUD
    const bat = d.battery ? ` · batterie ${Math.round(v.bat)} %${v.charging ? ' ⚡ en charge' : dead ? ' · <span class="warn">vide : borne de recharge !</span>' : ''}` : '';
    const body = broken ? ' · <span class="warn">en panne : roulez au pas jusqu\'à un poste à souder</span>' : v.hp < 100 ? ` · état ${Math.round(v.hp)} %` : '';
    ui.carry(d.name, `${Math.round(Math.abs(v.speed) * 3.6)} km/h${bat}${body}${d.forks ? ` · fourches ${v.fork.toFixed(1)} m · ${v.cargo ? 'chargé' : v.pallet ? 'palette dessus' : 'fourches nues'}` : ''}`);
    this.tipKeys(`veh:${v.type}`, `<kbd>Z</kbd>/<kbd>S</kbd> avancer/freiner · <kbd>Q</kbd>/<kbd>D</kbd> tourner${!d.fuel && !d.forks && !d.tug ? ' · <kbd>Espace</kbd> frein à main' : ''}<br><kbd>C</kbd> vue · <kbd>E</kbd> descendre${this.vehicleKeys(v)}`);
    if (inp.hit('KeyE') && !blocked) { this.exitVehicle(); inp.pressed.delete('KeyE'); }
  },
  // écraser les zombies : dégâts selon la vitesse et le poids du véhicule, projection vers l'avant/le côté
  vehicleRam(v, fw, rt) {
    const d = v.def, sp = Math.abs(v.speed);
    if (sp < 2.2) return;
    const heavy = d.len > 5 ? 1.7 : 1;
    this._ramT = this._ramT || new Map();
    const now = this.t;
    for (const e of this.enemies.list) {
      if (e.dead || e.hp <= 0) continue;
      if ((this._ramT.get(e.id) || -9) > now - 0.7) continue;
      const dx = e.pos.x - v.x, dz = e.pos.z - v.z;
      if (Math.abs(dx) > d.len && Math.abs(dz) > d.len) continue;
      if (Math.abs(e.pos.y - v.y) > 2.5) continue;
      const rad = e.T.radius || 0.5;
      const along = dx * fw.x + dz * fw.z, side = dx * rt.x + dz * rt.z;
      if (Math.abs(along) > d.len / 2 + rad || Math.abs(side) > d.wid / 2 + rad) continue;
      this._ramT.set(e.id, now);
      const dmg = Math.round((sp - 1.5) * 9 * heavy);
      const s = Math.sign(v.speed) || 1;
      const dir = new THREE.Vector3(fw.x * s + rt.x * Math.sign(side) * 0.6, 0, fw.z * s + rt.z * Math.sign(side) * 0.6).normalize();
      this.dealDamage(e, dmg, dir, 5 + sp * 0.8 * heavy, { stun: 0.8 });
      this.ui.hitmark?.(e.dead || e.hp <= 0);
      const hp = new THREE.Vector3(e.pos.x, e.pos.y + e.T.h * 0.5, e.pos.z);
      this.gore?.blood(hp, dir, false, !!e.T.goo);
      this.session?.send('gore', { p: [hp.x, hp.y, hp.z].map((q) => +q.toFixed(2)), d: [dir.x, dir.z].map((q) => +q.toFixed(2)), b: 0, g: e.T.goo ? 1 : 0 });
      this.audio.hitFlesh(); this.audio.thud();
      this.player.shake = Math.min(1, (this.player.shake || 0) + 0.25);
      // les gros morceaux (boss, cogneurs) arrêtent presque le véhicule ; les autres le ralentissent à peine
      const big = e.T.boss || (e.T.hp >= 200 && heavy < 1.5);
      v.speed *= big ? 0.25 : 0.9;
      this.damageVehicle(v, e.T.boss || e.T.elite ? 10 : e.T.hp >= 200 ? 5 : 1.5, true);
    }
  },
  vehicleKeys(v) {
    const d = v.def;
    if (d.spray) return '<br><kbd>Clic</kbd> maintenu : lance à eau';
    if (d.forks) return '<br><kbd>R</kbd>/<kbd>F</kbd> monter/baisser les fourches<br><kbd>Espace</kbd> déposer/reprendre la palette · saisir/poser une caisse (fourches nues)';
    if (d.fuel) return '<br><kbd>Espace</kbd> maintenu : pomper';
    if (d.tug) return '<br><kbd>Espace</kbd> atteler/dételer';
    if (d.stairs) return '<br>Reculez contre la porte de l\'avion';
    return '';
  },
  // capacités propres à chaque véhicule (le reste est géré par le chapitre 3)
  vehicleAbility(v, dt) {
    const d = v.def, inp = this.input;
    if (d.spray && inp.down('MouseL')) {
      v.spray = true;
      const o = this.vehicleWorld(v, v.model.nozzle);
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir); dir.y = Math.max(dir.y + 0.18, -0.2); dir.normalize();
      v.model.turret.rotation.y = Math.atan2(-dir.x, -dir.z) - v.yaw;
      this.emitSpray(o, dir, 26, dt);
      this.onSpray?.(o, dir, 30, 1, dt);
    }
    if (d.forks && inp.hit('Space')) {
      const T = this.forkTarget(v), tip = T.tip;
      if (v.cargo) {
        const it = this.items[v.cargo];
        this.act('vunload', { v: v.id, drop: [tip.x, tip.z, tip.y] });
        this.onForkDrop?.(it, tip);
      } else if (v.pallet) {
        // déposer la palette là où elle est (au sol, ou sur ce qui se trouve dessous), à l'écart des caisses
        const c = this.vehicleWorld(v, new THREE.Vector3(0, 0, -1.82));
        const blocked = Object.values(this.items).some((it) => it.state === 'ground' && !it.onVehicle && Math.hypot(it.pos.x - c.x, it.pos.z - c.z) < 1.3);
        if (blocked) { this.audio.error?.(); this.ui.toast('Pas de place', 'Reculez : déposez la palette à l\'écart de la caisse, puis revenez la saisir avec les fourches nues.', 'bad', 2600); }
        else { this.act('vpallet', { v: v.id, on: 0, x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +v.yaw.toFixed(3), y: +this.groundAt(c.x, c.z, v.y + 0.5 + v.fork, v).toFixed(2) }); }
      } else if (T.item && T.itemOk) { this.act('vload', { v: v.id, id: T.item.id }); this.audio.clank(); }
      else if (T.palletOk) this.act('vpallet', { v: v.id, on: 1 });
      else this.ui.toast('Rien sur les fourches', T.item || T.palletNear ? 'Mauvaise hauteur : ajustez les fourches (R/F).' : 'Approchez les fourches d\'une caisse ou de la palette.', 'bad', 2000);
    }
    this.vehicleAbility3?.(v, dt);
  },

  // gerbe d'eau (particules)
  emitSpray(o, dir, speed, dt) {
    this._sprayAcc = (this._sprayAcc || 0) + dt * 60;
    while (this._sprayAcc > 1) {
      this._sprayAcc -= 1;
      const p = this.sprayFx.find((q) => !q.m.visible);
      if (!p) break;
      p.m.visible = true; p.t = 0;
      p.m.position.copy(o);
      p.v.copy(dir).multiplyScalar(speed * (0.9 + Math.random() * 0.2)).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
    }
    if (!this._sprayAudio || this.t - this._sprayAudio > 0.25) { this._sprayAudio = this.t; this.audio.splash?.(); }
  },
  updateSprayFx(dt) {
    for (const p of this.sprayFx) {
      if (!p.m.visible) continue;
      p.t += dt;
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(1 + p.t * 3);
      if (p.t > 1.4 || p.m.position.y < heightAt(p.m.position.x, p.m.position.z)) p.m.visible = false;
    }
  },

  // ── réseau et sauvegarde ──
  vehicleState() {
    const o = {};
    for (const v of Object.values(this.vehicles)) {
      const P = v.palletAt, pal = !v.def.forks ? 0 : v.pallet || !P ? 1 : [P.x, P.z, P.yaw, P.y];
      o[v.id] = [+v.x.toFixed(2), +v.z.toFixed(2), +v.yaw.toFixed(3), v.drv || 0, Math.round(v.bat), v.cargo || 0, +v.fork.toFixed(2), v.hitched ? 1 : 0, pal, Math.round(v.hp)];
    }
    return o;
  },
  applyVehicleState(s, full) {
    for (const [id, a] of Object.entries(s || {})) {
      const v = this.vehicles[id];
      if (!v || v === this.driving) continue;
      const [x, z, yaw, drv, bat, cargo, fork, hitched, pal, hp] = a;
      v.drv = drv || null; v.bat = bat; v.hitched = !!hitched; v.hp = hp ?? 100;
      if (!v.drv || full) { v.t = { x, z, yaw, fork }; if (full) { v.x = x; v.z = z; v.yaw = yaw; v.fork = fork; this.poseVehicle(v); } }
      this.setCargo(v, cargo || null);
      if (v.def.forks && pal) this.setPallet(v, !Array.isArray(pal), Array.isArray(pal) ? { x: pal[0], z: pal[1], yaw: pal[2], y: pal[3] } : null);
    }
  },
  setCargo(v, id) {
    if (v.cargo && v.cargo !== id) { const o = this.items[v.cargo]; if (o && o.onVehicle === v.id) o.onVehicle = null; }
    v.cargo = id;
    if (id) { const it = this.items[id]; if (it) { it.onVehicle = v.id; it.state = 'ground'; it.carrier = null; it.mesh.visible = true; if (this.carrying === it) this.carrying = null; } }
  },
  // coups encaissés par un véhicule (appelé chez celui qui est à bord) : l'état est partagé avec l'équipage
  damageVehicle(v, dmg, quiet) {
    const before = v.hp ?? 100;
    if (before <= 0) return;
    const hp = Math.max(0, before - dmg * (v.def.len > 5 ? 0.5 : 1));   // les camions encaissent deux fois mieux
    this.act('vhp', { v: v.id, hp: +hp.toFixed(1) });
    if (quiet) return;
    this.audio.clank(); this.audio.thud();
    this.player.shake = Math.max(this.player.shake, 0.4);
    if (hp <= 0) { this.audio.explosion(); this.ui.toast(`${v.def.name} en panne !`, 'Il ne roule plus qu\'au pas, et ne vous protège plus. Réparez-le au fer d\'un poste à souder (🔧 sur la carte).', 'bad', 6000); }
    else if (before >= 50 && hp < 50) this.ui.toast(`${v.def.name} endommagé`, `État ${Math.round(hp)} % · un poste à souder le remettra à neuf.`, 'bad', 3500);
  },
  applyVehicleAct(type, d, by, auth) {
    const v = d.v && this.vehicles[d.v];
    if (!v) return null;
    const me = by === this.myId();
    switch (type) {
      case 'vhp': {
        const was = v.hp;
        v.hp = Math.max(0, Math.min(100, +d.hp || 0));
        if (was > 0 && v.hp <= 0 && !me && Math.hypot(v.x - this.playerWorld().x, v.z - this.playerWorld().z) < 60) this.audio.explosion();
        this.dirtyWorld = true;
        return true;
      }
      case 'vdrive': {
        if (d.on) {
          if (auth && v.drv && v.drv !== by && (!this.session || this.session.players.has(v.drv))) return false;
          v.drv = by;
        } else {
          if (v.drv && v.drv !== by) return auth ? false : true;
          v.drv = null;
          v.t = { x: d.x, z: d.z, yaw: d.yaw, fork: d.fork };
          if (me) { v.x = d.x; v.z = d.z; v.yaw = d.yaw; }
          v.bat = d.bat ?? v.bat; v.fork = d.fork ?? v.fork;
        }
        this.dirtyWorld = true;
        return true;
      }
      case 'vpass': {
        if (d.on) {
          if (auth && v.pas && v.pas !== by && (!this.session || this.session.players.has(v.pas))) return false;
          v.pas = by;
        } else if (!v.pas || v.pas === by) v.pas = null;
        return true;
      }
      case 'vload': {
        const it = this.items[d.id];
        if (!it || v.cargo || (v.def.forks && v.pallet)) return auth ? false : true;   // chariot : palette à déposer d'abord
        this.setCargo(v, d.id);
        if (me) this.audio.drop();
        this.dirtyWorld = true;
        return true;
      }
      case 'vpallet': {
        if (!v.def.forks) return auth ? false : true;
        if (d.on) {
          if (v.pallet) return true;
          if (v.cargo) return auth ? false : true;
          this.setPallet(v, 1);
        } else {
          if (!v.pallet || v.cargo) return auth ? false : true;
          this.setPallet(v, 0, { x: d.x, z: d.z, yaw: d.yaw, y: d.y });
        }
        if (me) this.audio.clank();
        this.dirtyWorld = true;
        return true;
      }
      case 'vunload': {
        const it = v.cargo && this.items[v.cargo];
        if (!it) return auth ? false : true;
        it.onVehicle = null; v.cargo = null;
        if (d.drop) {
          this.placeItem(it, d.drop[0], d.drop[1], v.yaw);
          it.pos.y = this.groundAt(d.drop[0], d.drop[1], d.drop[2] + 0.5, it);
          this.poseGround(it);
        } else {
          it.state = 'carried'; it.carrier = by; it.mode = 'hand';
          if (me) { this.carrying = it; this.carryMode = 'hand'; }
        }
        this.dirtyWorld = true;
        return true;
      }
      default: return null;
    }
  },
  // présence : véhicule conduit
  vehiclePresence() {
    const v = this.driving;
    return v ? [v.id, +v.x.toFixed(2), +v.z.toFixed(2), +v.yaw.toFixed(3), +v.speed.toFixed(1), +v.fork.toFixed(2), v.spray ? 1 : 0] : 0;
  },
  applyVehiclePresence(a, who) {
    if (!a) return;
    const v = this.vehicles[a[0]];
    if (!v || v === this.driving) return;
    v.drv = who;
    v.t = { x: a[1], z: a[2], yaw: a[3], fork: a[5] };
    v.speed = a[4] || 0;
    if (a[6] && v.def.spray) {
      const o = this.vehicleWorld(v, v.model.nozzle), dir = new THREE.Vector3(-Math.sin(v.yaw), 0.25, -Math.cos(v.yaw)).normalize();
      this.emitSpray(o, dir, 26, 1 / 15);
    }
  },
};
