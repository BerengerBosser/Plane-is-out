// Petits plaisirs de l'île 1 : canards à collectionner, hamac, poste radio, trésor, bouteille à la mer
import * as THREE from 'three';
import { heightAt, LAYOUT, prep, flatMat } from './terrain.js';

function m(geo, col) { const o = new THREE.Mesh(prep(geo, col), flatMat); o.castShadow = true; return o; }

export function buildDuck() {
  const g = new THREE.Group();
  g.add(m(new THREE.SphereGeometry(0.22, 8, 6).scale(1.2, 0.85, 1), '#ffd166'));
  const head = m(new THREE.SphereGeometry(0.14, 8, 6), '#ffd166');
  head.position.set(0, 0.2, -0.16);
  g.add(head);
  const beak = m(new THREE.ConeGeometry(0.06, 0.14, 6).rotateX(-Math.PI / 2), '#ff8a3d');
  beak.position.set(0, 0.18, -0.32);
  g.add(beak);
  const tail = m(new THREE.ConeGeometry(0.08, 0.16, 5).rotateX(Math.PI / 2 + 0.6), '#ffd166');
  tail.position.set(0, 0.1, 0.26);
  g.add(tail);
  for (const sx of [-0.06, 0.06]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: '#111' }));
    e.position.set(sx, 0.25, -0.27);
    g.add(e);
  }
  return g;
}

// canards : position monde (y calculé au sol ou flottant)
export function duckSpots1() {
  const d = LAYOUT.dock;
  return [
    { id: 'd1', x: d.x + Math.cos(d.a) * 9 + 2, z: d.z + Math.sin(d.a) * 9, float: true, hint: 'au bout du ponton' },
    { id: 'd2', x: LAYOUT.cabane.x + 4.2, z: LAYOUT.cabane.z - 1.4, dy: 0.8, hint: 'sur le tas de bois du cabanon' },
    { id: 'd3', x: 12, z: -76, hint: 'au sommet de la colline' },
    { id: 'd4', x: LAYOUT.lighthouse.x + 3.2, z: LAYOUT.lighthouse.z + 0.5, hint: 'au pied du phare' },
    { id: 'd5', x: LAYOUT.beach.x + 20.5, z: LAYOUT.beach.z - 5.8, dy: 1.55, hint: 'sur les caisses de fret' },
  ];
}

export function createFun(scene) {
  const out = { props: [] };
  const b = LAYOUT.beach;

  // hamac entre deux poteaux, à l'ouest du feu
  const hx = b.x - 22, hz = b.z - 3, hh = heightAt(hx, hz);
  const hammock = new THREE.Group();
  hammock.position.set(hx, hh, hz);
  hammock.rotation.y = 0.3;
  for (const sx of [-1.8, 1.8]) {
    const p = m(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), '#8a6a4a');
    p.position.set(sx, 1.1, 0);
    hammock.add(p);
  }
  const sling = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.7, 1.6, 0), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(1.7, 1.6, 0));
  const tube = new THREE.Mesh(prep(new THREE.TubeGeometry(curve, 12, 0.42, 6, false).scale(1, 1, 1).rotateX(0), '#ff6b5b'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  tube.scale.set(1, 1, 0.5);
  sling.add(tube);
  hammock.add(sling);
  scene.add(hammock);
  out.hammock = { group: hammock, sling, pos: new THREE.Vector3(hx, hh + 0.8, hz) };

  // poste radio près du feu
  const f = LAYOUT.campfire;
  const bx = f.x - 2.2, bz = f.z + 1.4;
  const boom = new THREE.Group();
  boom.position.set(bx, heightAt(bx, bz), bz);
  boom.rotation.y = 0.6;
  boom.add(m(new THREE.BoxGeometry(0.7, 0.36, 0.22), '#1f8a8a').translateY(0.18));
  for (const sx of [-0.2, 0.2]) {
    const sp = m(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).rotateX(Math.PI / 2), '#10162b');
    sp.position.set(sx, 0.18, -0.12);
    boom.add(sp);
  }
  const handle = m(new THREE.BoxGeometry(0.5, 0.04, 0.04), '#33373f');
  handle.position.y = 0.42;
  boom.add(handle);
  const ant = m(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), '#8d9299');
  ant.position.set(0.28, 0.6, 0);
  ant.rotation.z = -0.4;
  boom.add(ant);
  scene.add(boom);
  out.boombox = { group: boom, pos: new THREE.Vector3(bx, boom.position.y + 0.3, bz) };

  // trésor : croix peinte sur la plage nord, près d'un rocher peint
  const tx = 34, tz = -131;
  let tpos = { x: tx, z: tz };
  for (let i = 0; i < 80 && heightAt(tpos.x, tpos.z) > 1.4; i++) { tpos.z -= 0.5; }
  for (let i = 0; i < 80 && heightAt(tpos.x, tpos.z) < 0.4; i++) { tpos.z += 0.5; }
  const th = heightAt(tpos.x, tpos.z);
  const xmark = new THREE.Group();
  xmark.position.set(tpos.x, th + 0.03, tpos.z);
  for (const a of [0.78, -0.78]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.28), new THREE.MeshLambertMaterial({ color: '#d23c3c' }));
    s.rotation.y = a;
    xmark.add(s);
  }
  scene.add(xmark);
  const rock = m(new THREE.DodecahedronGeometry(1.1, 0), '#9a9d95');
  rock.position.set(tpos.x + 3, th + 0.5, tpos.z - 1);
  scene.add(rock);
  const paint = new THREE.Mesh(new THREE.CircleGeometry(0.35, 8), new THREE.MeshBasicMaterial({ color: '#d23c3c' }));
  paint.position.set(tpos.x + 2.1, th + 0.8, tpos.z - 0.6);
  paint.rotation.y = -1.1;
  scene.add(paint);
  const chest = new THREE.Group();
  chest.add(m(new THREE.BoxGeometry(0.9, 0.5, 0.6), '#8a5a3a').translateY(0.25));
  const lid = new THREE.Group();
  lid.position.set(0, 0.5, 0.3);
  lid.add(m(new THREE.BoxGeometry(0.92, 0.18, 0.62), '#6d4b37').translateZ(-0.3).translateY(0.09));
  chest.add(lid);
  chest.add(m(new THREE.BoxGeometry(0.94, 0.08, 0.1), '#ffd166').translateY(0.35));
  chest.position.set(tpos.x, th - 0.6, tpos.z);
  chest.visible = false;
  scene.add(chest);
  out.treasure = { mark: xmark, chest, lid, pos: new THREE.Vector3(tpos.x, th, tpos.z) };

  // bouteille à la mer, plage est
  const ba = 0.15;
  let br = 120;
  for (; br < 240 && heightAt(Math.cos(ba) * br, Math.sin(ba) * br) > 0.5; br += 0.5);
  const btx = Math.cos(ba) * (br - 2), btz = Math.sin(ba) * (br - 2);
  const bottle = new THREE.Group();
  bottle.position.set(btx, heightAt(btx, btz) + 0.08, btz);
  bottle.rotation.set(0, 0.4, Math.PI / 2 - 0.2);
  const bmat = new THREE.MeshLambertMaterial({ color: '#5fae7a', transparent: true, opacity: 0.75 });
  bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), bmat));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.14, 8), bmat);
  neck.position.y = 0.21;
  bottle.add(neck);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), new THREE.MeshLambertMaterial({ color: '#f4ecd6' }));
  bottle.add(paper);
  scene.add(bottle);
  out.bottle = { group: bottle, pos: bottle.position.clone() };

  // panneau « Ne pas nourrir les crabes »
  const sx0 = b.x + 11, sz0 = b.z - 10, sh = heightAt(sx0, sz0);
  const sg = new THREE.Group();
  sg.position.set(sx0, sh, sz0);
  sg.rotation.y = 2.6;
  sg.add(m(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), '#8a6a4a').translateY(0.8));
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff4e0'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#d23c3c'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#10162b'; g.textAlign = 'center';
  g.font = 'bold 30px "Bricolage Grotesque", sans-serif'; g.fillText('NE PAS NOURRIR', 128, 55);
  g.font = 'bold 30px "Bricolage Grotesque", sans-serif'; g.fillText('LES CRABES', 128, 92);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  plate.position.y = 1.55;
  sg.add(plate);
  scene.add(sg);

  // ── énigme du canot : trois symboles peints + coffre de survie sur le ponton ──
  const glyph = (txt, bg = '#d23c3c') => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g2 = cv.getContext('2d');
    g2.fillStyle = bg; g2.beginPath(); g2.arc(64, 64, 60, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#fff4e0'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.font = 'bold 30px "Bricolage Grotesque", sans-serif';
    g2.fillText(txt.split(' ')[0], 64, 30);
    g2.font = 'bold 62px "Segoe UI Symbol", "Noto Sans Symbols", sans-serif';
    g2.fillText(txt.split(' ')[1], 64, 80);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshLambertMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  };
  out.symbols = [];
  // 1 · ⚓ sur le phare, près de la porte
  {
    const lh = LAYOUT.lighthouse, lhh = heightAt(lh.x, lh.z);
    const toC = Math.atan2(-lh.x, -lh.z);
    const p = new THREE.Vector3(-0.95, 1.7, 2.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), toC).add(new THREE.Vector3(lh.x, lhh, lh.z));
    const g2 = glyph('1 ⚓'); g2.position.copy(p); g2.rotation.y = toC + 0.2; scene.add(g2);
    out.symbols.push({ n: 1, sym: '⚓', pos: p, where: 'sur le phare' });
  }
  // 2 · ★ sur l'arche des ruines de la colline
  {
    const R0 = LAYOUT.ruins, rh = heightAt(R0.x, R0.z);
    const p = new THREE.Vector3(0, 3.6, -0.47).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4).add(new THREE.Vector3(R0.x, rh - 0.2, R0.z));
    const g2 = glyph('2 ★', '#1f8a8a'); g2.position.copy(p); g2.rotation.y = 0.4 + Math.PI; scene.add(g2);
    out.symbols.push({ n: 2, sym: '★', pos: p, where: 'sur l\'arche des ruines' });
  }
  // 3 · ♥ à l'intérieur du cabanon, mur du fond
  {
    const cb = LAYOUT.cabane, ch = heightAt(cb.x, cb.z);
    const p = new THREE.Vector3(cb.x + 1.2, ch + 1.5, cb.z - 2.0);
    const g2 = glyph('3 ♥', '#7a4dff'); g2.position.copy(p); scene.add(g2);
    out.symbols.push({ n: 3, sym: '♥', pos: p, where: 'dans le cabanon' });
  }
  // coffre de survie au bout du ponton
  {
    const d = LAYOUT.dock;
    const ry = -d.a - Math.PI / 2;
    const p = new THREE.Vector3(0.55, 0.81, -13.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(d.x, 0, d.z));
    const chest2 = new THREE.Group();
    chest2.position.copy(p);
    chest2.rotation.y = ry;
    chest2.add(m(new THREE.BoxGeometry(0.9, 0.5, 0.6), '#ff8a3d').translateY(0.25));
    const lid2 = new THREE.Group();
    lid2.position.set(0, 0.5, 0.3);
    lid2.add(m(new THREE.BoxGeometry(0.92, 0.12, 0.62), '#ff6b5b').translateZ(-0.3).translateY(0.06));
    chest2.add(lid2);
    chest2.add(m(new THREE.BoxGeometry(0.5, 0.18, 0.04), '#33373f').translateY(0.3).translateZ(-0.31));
    scene.add(chest2);
    out.survival = { group: chest2, lid: lid2, pos: p.clone().add(new THREE.Vector3(0, 0.4, 0)) };
  }
  // râtelier du Crabe-Roi (récompense, caché tant que le boss est vivant)
  {
    const K = LAYOUT.cove, kh = heightAt(K.x, K.z);
    const rack = new THREE.Group();
    rack.position.set(K.x, kh, K.z);
    rack.add(m(new THREE.BoxGeometry(1.6, 1.3, 0.2), '#8a6a4a').translateY(0.65));
    const gun = new THREE.Group();
    gun.add(m(new THREE.BoxGeometry(0.1, 0.1, 1.2), '#b98b5e'));
    gun.add(m(new THREE.BoxGeometry(0.03, 0.03, 0.9), '#c9ccd2').translateY(0.08).translateZ(-0.4));
    gun.rotation.set(0, Math.PI / 2, 0.3);
    gun.position.set(0, 0.9, -0.2);
    rack.add(gun);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    rack.add(glow);
    rack.visible = false;
    scene.add(rack);
    out.harpoonRack = { group: rack, glow, pos: new THREE.Vector3(K.x, kh + 1, K.z - 0.4) };
  }

  return out;
}
