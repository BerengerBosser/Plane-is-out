// Décor : herbes qui ondulent, fleurs, buissons, oyats, bois flotté, rochers, ponton, barils, mouettes
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, slopeAt, LAYOUT, prep, flatMat, pathDist, textTexture, signBoard } from './terrain.js';
import { rng, fbm } from './noise.js';

const R = 185;

// Matériau végétal : ondulation au vent dans le vertex shader
function swayMaterial(uTime, amount = 0.12) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;
       transformed.x += sin(uTime * 1.8 + ph) * ${amount.toFixed(3)} * position.y;
       transformed.z += cos(uTime * 1.3 + ph) * ${(amount * 0.6).toFixed(3)} * position.y;`,
    );
  };
  return m;
}

function scatter(count, tries, seed, test) {
  const r = rng(seed), out = [];
  for (let i = 0; i < tries && out.length < count; i++) {
    const x = (r() - 0.5) * 2 * R, z = (r() - 0.5) * 2 * R;
    const h = heightAt(x, z);
    const o = test(x, z, h, r);
    if (o) out.push({ x, z, h, s: o.s ?? 1, ry: r() * 6.28, tint: o.tint ?? 1 });
  }
  return out;
}

function instance(scene, geo, mat, list, { shadow = false, squash = 1, yOff = 0 } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.ry);
    s.set(t.s, t.s * squash, t.s);
    p.set(t.x, t.h + yOff * t.s, t.z);
    m4.compose(p, q, s);
    im.setMatrixAt(i, m4);
    c.setScalar(t.tint);
    im.setColorAt(i, c);
  });
  im.castShadow = shadow;
  im.receiveShadow = true;
  scene.add(im);
  return im;
}

export function buildDecor(scene, island) {
  const uTime = { value: 0 };
  const colliders = island.colliders;
  const clear = island.isClear;

  // touffe d'herbe : trois brins
  const blade = (h, col, a) => prep(new THREE.ConeGeometry(0.06, h, 3).translate(0, h / 2, 0).rotateZ(a), col);
  const tuft = mergeGeometries([blade(0.55, '#6fa257', 0.2), blade(0.45, '#7db462', -0.25).rotateY(1.2), blade(0.5, '#679a50', 0.1).rotateY(2.3)]);
  const grass = scatter(4200, 30000, 11, (x, z, h, r) => {
    if (h < 1.9 || h > 30 || slopeAt(x, z).s > 0.65 || pathDist(x, z) < 1.8) return null;
    if (fbm(x * 0.04 + 5, z * 0.04) < 0.38) return null;
    return { s: 0.7 + r() * 0.8, tint: 0.85 + r() * 0.3 };
  });
  const dens = [];
  dens.push(instance(scene, tuft, swayMaterial(uTime, 0.14), grass));

  // oyats sur les dunes
  const dune = mergeGeometries([blade(0.9, '#c9c07a', 0.15), blade(0.75, '#b8b36c', -0.2).rotateY(1.4), blade(0.8, '#d4c98a', 0.3).rotateY(2.6)]);
  const oyats = scatter(700, 20000, 23, (x, z, h, r) => (h > 0.9 && h < 3 && clear(x, z) ? { s: 0.7 + r() * 0.7, tint: 0.9 + r() * 0.2 } : null));
  dens.push(instance(scene, dune, swayMaterial(uTime, 0.2), oyats));

  // fleurs
  const flowerGeo = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 3).translate(0, 0.17, 0), '#5f8f47'),
    prep(new THREE.IcosahedronGeometry(0.08, 0).translate(0, 0.38, 0), '#ffffff'),
  ]);
  const petals = ['#f4f0e6', '#f5d04b', '#e88fb0', '#b69ae6', '#f08a5d'];
  const flowers = scatter(900, 20000, 31, (x, z, h, r) => {
    if (h < 2.2 || slopeAt(x, z).s > 0.5 || pathDist(x, z) < 1.5) return null;
    if (fbm(x * 0.06 - 3, z * 0.06 + 8) < 0.55) return null;
    return { s: 0.8 + r() * 0.6 };
  });
  const fm = instance(scene, flowerGeo, swayMaterial(uTime, 0.2), flowers);
  dens.push(fm);
  const fc = new THREE.Color();
  flowers.forEach((f, i) => { fc.set(petals[i % petals.length]); fm.setColorAt(i, fc); });

  // buissons
  const bushGeo = mergeGeometries([
    prep(new THREE.IcosahedronGeometry(0.8, 0).translate(0, 0.5, 0), '#5d8f4c'),
    prep(new THREE.IcosahedronGeometry(0.6, 0).translate(0.55, 0.4, 0.2), '#6a9c56'),
    prep(new THREE.IcosahedronGeometry(0.55, 0).translate(-0.5, 0.35, -0.15), '#557f45'),
  ]);
  const bushes = scatter(220, 12000, 47, (x, z, h, r) => (h > 2 && h < 28 && slopeAt(x, z).s < 0.6 && clear(x, z) && pathDist(x, z) > 2.5 ? { s: 0.7 + r() * 0.8, tint: 0.85 + r() * 0.3 } : null));
  instance(scene, bushGeo, flatMat, bushes, { shadow: true, squash: 0.8 });

  // bois flotté sur le sable
  const logGeo = prep(new THREE.CylinderGeometry(0.14, 0.2, 2.4, 6).rotateZ(Math.PI / 2).translate(0, 0.14, 0), '#a8998a');
  const logs = scatter(30, 8000, 53, (x, z, h, r) => (h > 0.2 && h < 1.4 && clear(x, z) ? { s: 0.6 + r() * 0.8 } : null));
  instance(scene, logGeo, flatMat, logs, { shadow: true });

  // rochers du rivage
  const rockGeo = prep(new THREE.DodecahedronGeometry(1, 0), '#8e928c');
  const coast = scatter(60, 20000, 61, (x, z, h, r) => (h > -1.6 && h < 0.4 && clear(x, z) ? { s: 0.8 + r() * 1.8, tint: 0.8 + r() * 0.25 } : null));
  instance(scene, rockGeo, flatMat, coast, { shadow: true, squash: 0.7 });
  coast.forEach((c) => { if (c.s > 1 && c.h > -1.4) colliders.push({ type: 'circle', x: c.x, z: c.z, r: c.s * 0.9 }); });

  // barils et caisses de fret près de l'épave
  const barrelGeo = (col) => mergeGeometries([
    prep(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10).translate(0, 0.55, 0), col),
    prep(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10).translate(0, 0.25, 0), '#3b3f45'),
    prep(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10).translate(0, 0.85, 0), '#3b3f45'),
  ]);
  const b = LAYOUT.beach;
  [[-14, 4, '#c8553d'], [-12.8, 5, '#3f6f9a'], [15, -3, '#c8553d'], [19, 2, '#e0b33f']].forEach(([dx, dz, col], i) => {
    const m = new THREE.Mesh(barrelGeo(col), flatMat);
    const x = b.x + dx, z = b.z + dz;
    m.position.set(x, heightAt(x, z) - 0.05, z);
    if (i === 3) { m.rotation.z = Math.PI / 2; m.position.y += 0.4; }
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    colliders.push({ type: 'circle', x, z, r: 0.5 });
  });
  const crateGeo = prep(new THREE.BoxGeometry(1, 1, 1), '#b98b5e');
  [[20, -6, 0.3], [21.2, -5.4, 0.9], [20.5, -5.8, 0.1]].forEach(([dx, dz, ry], i) => {
    const m = new THREE.Mesh(crateGeo, flatMat);
    const x = b.x + dx, z = b.z + dz;
    m.position.set(x, heightAt(x, z) + 0.5 + (i === 2 ? 1 : 0), z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (i < 2) colliders.push({ type: 'circle', x, z, r: 0.65 });
  });

  // ponton et barque échouée
  const d = LAYOUT.dock;
  const dock = new THREE.Group();
  dock.position.set(d.x, 0, d.z);
  dock.rotation.y = -d.a - Math.PI / 2;
  const plank = prep(new THREE.BoxGeometry(2.2, 0.12, 0.34), '#9b7452');
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Mesh(plank, flatMat);
    p.position.set((i % 2) * 0.03, 0.75, -i * 0.38);
    p.rotation.y = ((i * 7) % 5 - 2) * 0.01;
    dock.add(p);
  }
  const post = prep(new THREE.CylinderGeometry(0.11, 0.13, 3.2, 6), '#6f5038');
  for (let i = 0; i < 6; i++) for (const sx of [-1.05, 1.05]) {
    const p = new THREE.Mesh(post, flatMat);
    p.position.set(sx, -0.6, -i * 3);
    dock.add(p);
  }
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.9, 0.5, 3.6, 6, 1, true).rotateX(Math.PI / 2).scale(1, 0.5, 1), '#3f6f9a'), flatMat);
  boat.add(hull);
  const seat = new THREE.Mesh(prep(new THREE.BoxGeometry(1.4, 0.08, 0.3), '#b98b5e'), flatMat);
  seat.position.y = 0.1;
  boat.add(seat);
  boat.position.set(2.1, 0.15, -9);
  boat.rotation.set(0.05, 0.3, 0.25);
  dock.add(boat);
  dock.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(dock);
  // collisions du ponton : plateforme orientée + pieux + barque
  const dockPlatform = { obb: true, x: d.x, z: d.z, r: -d.a - Math.PI / 2, minX: -1.12, maxX: 1.12, minZ: -15.3, maxZ: 0.3, top: 0.81 };
  const dockW = (lx, lz) => { const r = dockPlatform.r; return { x: d.x + lx * Math.cos(r) + lz * Math.sin(r), z: d.z - lx * Math.sin(r) + lz * Math.cos(r) }; };
  for (let i = 0; i < 6; i++) for (const sx of [-1.05, 1.05]) { const w = dockW(sx, -i * 3); colliders.push({ type: 'circle', x: w.x, z: w.z, r: 0.14 }); }
  { const w = dockW(2.1, -9); colliders.push({ type: 'circle', x: w.x, z: w.z, r: 0.9, maxY: 1.2 }); }

  // ── sous-bois : fougères, champignons, souches, troncs couchés ──
  const fern = mergeGeometries([0, 1, 2, 3, 4].map((k) => prep(new THREE.ConeGeometry(0.18, 1.1, 3).translate(0, 0.5, 0).rotateZ(0.9).rotateY((k / 5) * Math.PI * 2), k % 2 ? '#4f8a4f' : '#5c9a58')));
  const ferns = scatter(700, 30000, 71, (x, z, h, r) => {
    if (h < 3 || h > 28 || slopeAt(x, z).s > 0.6 || pathDist(x, z) < 2 || !clear(x, z)) return null;
    if (fbm(x * 0.02 + 11, z * 0.02 - 4) < 0.5) return null;
    return { s: 0.8 + r() * 0.8, tint: 0.85 + r() * 0.3 };
  });
  dens.push(instance(scene, fern, swayMaterial(uTime, 0.08), ferns));
  const mush = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 6).translate(0, 0.11, 0), '#f4ecd6'),
    prep(new THREE.SphereGeometry(0.16, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2, 0), '#d23c3c'),
    prep(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 6).translate(0.16, 0.07, 0.05), '#f4ecd6'),
    prep(new THREE.SphereGeometry(0.1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.16, 0.13, 0.05), '#e0a458'),
  ]);
  const mushrooms = scatter(160, 20000, 83, (x, z, h, r) => (h > 3 && slopeAt(x, z).s < 0.5 && fbm(x * 0.02 + 11, z * 0.02 - 4) > 0.55 && clear(x, z) ? { s: 0.8 + r() * 1.2 } : null));
  dens.push(instance(scene, mush, flatMat, mushrooms));
  const stump = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 7).translate(0, 0.3, 0), '#7a5a3f'),
    prep(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 7).translate(0, 0.61, 0), '#d9b98a'),
  ]);
  const stumps = scatter(60, 15000, 91, (x, z, h, r) => (h > 2.5 && slopeAt(x, z).s < 0.5 && clear(x, z) && pathDist(x, z) > 2 ? { s: 0.8 + r() * 0.8 } : null));
  instance(scene, stump, flatMat, stumps, { shadow: true });
  stumps.forEach((t) => colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.4 * t.s }));
  const fallen = prep(new THREE.CylinderGeometry(0.28, 0.38, 6, 7).rotateZ(Math.PI / 2).translate(0, 0.3, 0), '#6f5038');
  const logs2 = scatter(28, 15000, 97, (x, z, h, r) => (h > 3 && slopeAt(x, z).s < 0.35 && clear(x, z) && pathDist(x, z) > 4 ? { s: 0.8 + r() * 0.5 } : null));
  instance(scene, fallen, flatMat, logs2, { shadow: true });

  // ── panneau indicateur au carrefour ──
  const junction = { x: -30, z: 25 };
  const signPost = new THREE.Group();
  signPost.position.set(junction.x + 2.5, heightAt(junction.x + 2.5, junction.z), junction.z);
  signPost.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6).translate(0, 1.3, 0), '#8a6a4a'), flatMat));
  // flèches fixées sur le côté du poteau (le poteau ne coupe plus le texte), lisibles des deux faces
  [['PHARE', -0.9], ['PLAGE', 0.6], ['COLLINE', 2.2]].forEach(([t, ry], i) => {
    const arm = new THREE.Group();
    arm.position.y = 2.2 - i * 0.4;
    arm.rotation.y = ry;
    const plank = new THREE.Mesh(prep(new THREE.BoxGeometry(1.25, 0.32, 0.05).translate(0.74, 0, 0), '#8a6a4a'), flatMat);
    arm.add(plank);
    const tip = new THREE.Mesh(prep(new THREE.CylinderGeometry(0, 0.2, 0.22, 3).rotateZ(-Math.PI / 2).translate(1.47, 0, 0), '#8a6a4a'), flatMat);
    arm.add(tip);
    const mat = new THREE.MeshLambertMaterial({ map: textTexture([t], '#d8b27a', '#2c2346', 512, 128) });
    for (const side of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.27), mat);
      pl.position.set(0.74, 0, side * 0.028);
      if (side < 0) pl.rotation.y = Math.PI;
      arm.add(pl);
    }
    signPost.add(arm);
  });
  scene.add(signPost);
  colliders.push({ type: 'circle', x: signPost.position.x, z: signPost.position.z, r: 0.2 });

  // ── ruines sur la colline (arche et murets) ──
  const R0 = LAYOUT.ruins, rh = heightAt(R0.x, R0.z);
  const ruins = new THREE.Group();
  ruins.position.set(R0.x, rh - 0.2, R0.z);
  ruins.rotation.y = 0.4;
  const stone = (w, h, d, x, y, z, col = '#a9a494') => { const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; ruins.add(m); return m; };
  stone(0.8, 3.4, 0.8, -1.6, 1.7, 0); stone(0.8, 3.4, 0.8, 1.6, 1.7, 0); stone(4.0, 0.8, 0.9, 0, 3.6, 0);
  stone(4.5, 1.2, 0.6, -4.2, 0.6, 1.5, '#9a9585'); stone(0.6, 0.9, 3.5, 4.3, 0.45, -1.2, '#9a9585');
  const brk = stone(1.4, 0.5, 0.9, 2.5, 0.25, 2.6, '#8e897a'); brk.rotation.set(0.2, 0.7, 0.1);
  scene.add(ruins);
  ruins.updateMatrixWorld(true);
  [[-1.6, 0], [1.6, 0], [-4.2, 1.5], [4.3, -1.2]].forEach(([x, z]) => { const w = new THREE.Vector3(x, 0, z).applyMatrix4(ruins.matrixWorld); colliders.push({ type: 'circle', x: w.x, z: w.z, r: 0.9 }); });

  // ── campement abandonné ──
  const C0 = LAYOUT.camp, ch = heightAt(C0.x, C0.z);
  const camp = new THREE.Group();
  camp.position.set(C0.x, ch, C0.z);
  const tent = new THREE.Mesh(prep(new THREE.ConeGeometry(1.6, 1.9, 4).rotateY(Math.PI / 4).scale(1, 1, 1.4).translate(0, 0.95, 0), '#e0a458'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  tent.castShadow = true;
  camp.add(tent);
  const pit = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 8), '#555a55'), flatMat);
  pit.position.set(2.6, 0.07, 1.2);
  camp.add(pit);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(prep(new THREE.BoxGeometry(0.6, 0.45, 0.45), i === 1 ? '#1f8a8a' : '#b98b5e'), flatMat); c.position.set(-2 + i * 0.3, 0.22 + (i === 2 ? 0.45 : 0), 1.8 - i * 0.2); c.rotation.y = i * 0.5; c.castShadow = true; camp.add(c); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), new THREE.MeshLambertMaterial({ color: '#ff6b5b' }));
  lamp.position.set(1.4, 0.15, -0.8);
  camp.add(lamp);
  scene.add(camp);
  colliders.push({ type: 'circle', x: C0.x, z: C0.z, r: 1.4 });

  // ── crique du Crabe-Roi : cercle de rochers, os, coquillages ──
  const K = LAYOUT.cove;
  const cove = new THREE.Group();
  const kr = rng(123);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, d = 17 + kr() * 4;
    const x = K.x + Math.cos(a) * d, z = K.z + Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < -0.8) continue;
    const s = 1.2 + kr() * 1.6;
    const rk = new THREE.Mesh(prep(new THREE.DodecahedronGeometry(s, 0), '#7f837c'), flatMat);
    rk.position.set(x, h + s * 0.3, z);
    rk.scale.y = 0.8;
    rk.castShadow = rk.receiveShadow = true;
    cove.add(rk);
    colliders.push({ type: 'circle', x, z, r: s * 0.85 });
  }
  const bone = prep(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5).rotateZ(Math.PI / 2), '#f1e8d2');
  for (let i = 0; i < 10; i++) {
    const x = K.x + (kr() - 0.5) * 18, z = K.z + (kr() - 0.5) * 18;
    const b = new THREE.Mesh(bone, flatMat);
    b.position.set(x, heightAt(x, z) + 0.08, z);
    b.rotation.y = kr() * 6;
    cove.add(b);
    const sh = new THREE.Mesh(prep(new THREE.ConeGeometry(0.25, 0.3, 6).rotateX(Math.PI / 2), kr() < 0.5 ? '#f7c6c0' : '#fff4e0'), flatMat);
    sh.position.set(x + 1, heightAt(x + 1, z) + 0.1, z + 0.5);
    cove.add(sh);
  }
  // panneau d'avertissement
  const toC = Math.atan2(-K.x, -K.z);
  const wx = K.x + Math.sin(toC) * -12 * -1, wz = K.z + Math.cos(toC) * 12;
  const warn = new THREE.Group();
  warn.position.set(wx, heightAt(wx, wz), wz);
  warn.rotation.y = toC + Math.PI;
  warn.add(signBoard(['CRIQUE DU ROI', 'passez votre chemin'], { bg: '#d23c3c', fg: '#fff4e0', w: 1.5, h: 0.72, cw: 512, ch: 240, y: 1.6, wood: '#8a6a4a' }));
  cove.add(warn);
  scene.add(cove);

  // ── épave d'un chalutier sur la plage est ──
  let wbr = 100; const ba = 0.35;
  for (; wbr < 240 && heightAt(Math.cos(ba) * wbr, Math.sin(ba) * wbr) > 0.3; wbr += 0.5);
  const wreck = new THREE.Group();
  wreck.position.set(Math.cos(ba) * (wbr - 1), -0.2, Math.sin(ba) * (wbr - 1));
  wreck.rotation.set(0.1, ba + 0.6, 0.35);
  const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const hull2 = new THREE.Mesh(prep(new THREE.CylinderGeometry(2.2, 1.2, 9, 8, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), '#3f6f9a'), hullMat);
  hull2.position.y = 1.2;
  wreck.add(hull2);
  const cab = new THREE.Mesh(prep(new THREE.BoxGeometry(2, 1.8, 2.4), '#e9e4d8'), flatMat);
  cab.position.set(0, 2.2, 1.2);
  wreck.add(cab);
  const mast = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.1, 0.12, 5, 6), '#6f5038'), flatMat);
  mast.position.set(0, 3.5, -1.5);
  mast.rotation.z = 0.4;
  wreck.add(mast);
  wreck.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(wreck);
  colliders.push({ type: 'circle', x: wreck.position.x, z: wreck.position.z, r: 2.4 });
  // casiers à homards
  for (let i = 0; i < 4; i++) {
    const x = wreck.position.x - 6 + i * 1.3, z = wreck.position.z - 4 + (i % 2);
    const h = heightAt(x, z);
    if (h < 0) continue;
    const c = new THREE.Mesh(prep(new THREE.BoxGeometry(0.8, 0.5, 0.6), '#c9a25c'), flatMat);
    c.position.set(x, h + 0.25, z);
    c.rotation.y = i;
    scene.add(c);
  }

  // mouettes
  const birds = [];
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.25, 1.1, 0.05, 0.05], 3));
  wingGeo.computeVertexNormals();
  const birdMat = new THREE.MeshLambertMaterial({ color: '#f2f2ee', side: THREE.DoubleSide });
  const br = rng(77);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4).rotateX(-Math.PI / 2), birdMat);
    g.add(body);
    const wl = new THREE.Mesh(wingGeo, birdMat), wr = new THREE.Mesh(wingGeo, birdMat);
    wr.scale.x = -1;
    g.add(wl, wr);
    g.userData = { wl, wr, r: 60 + br() * 120, h: 28 + br() * 30, sp: 0.08 + br() * 0.08, ph: br() * 6.28, cx: (br() - 0.5) * 80, cz: (br() - 0.5) * 80 };
    g.scale.setScalar(1.4);
    scene.add(g);
    birds.push(g);
  }


  // ── lanternes le long des sentiers (s'allument au crépuscule) ──
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: '#ffe0a0', emissive: '#ffb347', emissiveIntensity: 0 });
  const lampPostGeo = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6).translate(0, 1.1, 0), '#5a4330'),
    prep(new THREE.BoxGeometry(0.5, 0.06, 0.06).translate(0.22, 2.15, 0), '#5a4330'),
  ]);
  const lampHeadGeo = new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(0.42, 1.95, 0);
  const lampSpots = [];
  for (const P of [LAYOUT.path, LAYOUT.path2]) {
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      for (let d = 6; d < L - 3; d += 16) {
        const side = (lampSpots.length % 2 ? 1 : -1) * 1.9;
        const x = x0 + (x1 - x0) * (d / L) + nx * side, z = z0 + (z1 - z0) * (d / L) + nz * side;
        if (heightAt(x, z) < 0.6) continue;
        lampSpots.push({ x, z, ry: Math.atan2(-nx * side, -nz * side) + Math.PI / 2 });
      }
    }
  }
  const lampPosts = new THREE.InstancedMesh(lampPostGeo, flatMat, lampSpots.length);
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    lampSpots.forEach((o, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.ry);
      m4.compose(new THREE.Vector3(o.x, heightAt(o.x, o.z) - 0.05, o.z), q, one);
      lampPosts.setMatrixAt(i, m4); lampHeads.setMatrixAt(i, m4);
      colliders.push({ type: 'circle', x: o.x, z: o.z, r: 0.14 });
    });
  }
  lampPosts.castShadow = true;
  scene.add(lampPosts, lampHeads);

  // ── coin du feu : bancs en rondins, corde à linge, bâche ──
  const F0 = LAYOUT.campfire;
  const campG = new THREE.Group();
  campG.position.set(F0.x, heightAt(F0.x, F0.z), F0.z);
  for (const [dx, dz, ry] of [[-2.6, 0.4, 1.4], [0.5, -2.7, 0.1], [2.4, 1.4, -1.1]]) {
    const log = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.25, 0.28, 2.0, 7).rotateZ(Math.PI / 2), '#7a5536'), flatMat);
    log.position.set(dx, 0.25, dz); log.rotation.y = ry;
    campG.add(log);
    colliders.push({ type: 'circle', x: F0.x + dx, z: F0.z + dz, r: 0.5, maxY: campG.position.y + 0.5 });
  }
  const lineA = new THREE.Vector3(-4.5, 0, -3.5), lineB = new THREE.Vector3(-0.5, 0, -5.5);
  for (const pnt of [lineA, lineB]) campG.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 5).translate(0, 0.95, 0), '#6f5038'), flatMat).translateX(pnt.x).translateZ(pnt.z));
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, lineA.distanceTo(lineB), 4), new THREE.MeshLambertMaterial({ color: '#e9e4d8' }));
  rope.position.set((lineA.x + lineB.x) / 2, 1.8, (lineA.z + lineB.z) / 2);
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lineB.clone().sub(lineA).normalize());   // la corde relie vraiment les deux poteaux
  campG.add(rope);
  const clothCols = ['#ff6b5b', '#ffd166', '#5ef2c2', '#b8a4ff', '#fff4e0'];
  const clothes = [];
  for (let k = 0; k < 5; k++) {
    const u = (k + 0.6) / 5.6;
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6).translate(0, -0.3, 0), new THREE.MeshLambertMaterial({ color: clothCols[k], side: THREE.DoubleSide }));
    c.position.set(lineA.x + (lineB.x - lineA.x) * u, 1.78, lineA.z + (lineB.z - lineA.z) * u);
    c.rotation.y = Math.atan2(lineB.x - lineA.x, lineB.z - lineA.z) + Math.PI / 2;
    c.userData.ph = k;
    campG.add(c); clothes.push(c);
  }
  const tarp = new THREE.Mesh(prep(new THREE.BoxGeometry(3.2, 0.04, 2.4), '#1f8a8a'), flatMat);
  tarp.position.set(4.4, 1.9, 2.6); tarp.rotation.z = 0.25;
  campG.add(tarp);
  for (const [dx, dz] of [[2.9, 1.5], [2.9, 3.7]]) campG.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5).translate(0, 1.15, 0), '#6f5038'), flatMat).translateX(dx).translateZ(dz));
  for (const [dx, dz, c] of [[5.0, 2.1, '#b98b5e'], [5.2, 3.1, '#8a6a4a'], [4.4, 2.7, '#ff6b5b']]) campG.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.7, 0.55, 0.55), c), flatMat).translateX(dx).translateY(0.27).translateZ(dz));
  colliders.push({ type: 'box', minX: F0.x + 4.0, maxX: F0.x + 5.6, minZ: F0.z + 1.7, maxZ: F0.z + 3.5 });
  campG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(campG);

  // ── lucioles (le soir) ──
  const ffN = 90, ffPos = new Float32Array(ffN * 3), ffBase = [];
  const fr = rng(4242);
  for (let i = 0; i < ffN; i++) {
    let x = 0, z = 0;
    for (let t = 0; t < 20; t++) { x = (fr() - 0.5) * 300; z = (fr() - 0.5) * 300; if (heightAt(x, z) > 2) break; }
    ffBase.push([x, heightAt(x, z) + 0.8 + fr() * 1.6, z, fr() * 6.28]);
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: '#e8ff8a', size: 0.22, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);
  dens.forEach((im) => { im.userData.full = im.count; });
  return {
    platforms: [dockPlatform],
    setDensity(v) { dens.forEach((im) => { im.count = Math.floor(im.userData.full * v); im.visible = im.count > 0; }); },
    update(t, hour) {
      uTime.value = t;
      const dusk = hour > 18.2 || hour < 6.6 ? 1 : hour > 17.6 ? (hour - 17.6) / 0.6 : 0;
      lampHeadMat.emissiveIntensity = dusk * (1.6 + Math.sin(t * 9) * 0.08);
      fireflies.material.opacity = dusk * 0.95;
      if (dusk > 0) {
        for (let i = 0; i < ffN; i++) {
          const [x, y, z, ph] = ffBase[i];
          ffPos[i * 3] = x + Math.sin(t * 0.5 + ph) * 1.5; ffPos[i * 3 + 1] = y + Math.sin(t * 1.3 + ph * 2) * 0.4; ffPos[i * 3 + 2] = z + Math.cos(t * 0.4 + ph) * 1.5;
        }
        ffGeo.attributes.position.needsUpdate = true;
      }
      for (const c of clothes) c.rotation.x = Math.sin(t * 2.2 + c.userData.ph) * 0.18;
      const day = hour > 6.8 && hour < 18.9;
      for (const g of birds) {
        const u = g.userData;
        g.visible = day;
        if (!day) continue;
        const a = u.ph + t * u.sp;
        g.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.4 + u.ph) * 3, u.cz + Math.sin(a) * u.r);
        g.rotation.set(0, -a + Math.PI, 0.35);
        const f = Math.sin(t * 7 + u.ph) * 0.5;
        u.wl.rotation.z = f; u.wr.rotation.z = -f;
      }
    },
  };
}
