// Effets de combat : gerbes de sang, flaques au sol, traçantes, éclairs de bouche, nuages de gaz, poussière d'impact
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export function createGoreFx(scene) {
  // ── particules (gouttes) ──
  const N = 220;
  const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const mats = { blood: new THREE.MeshLambertMaterial({ color: '#8a0f0f' }), goo: new THREE.MeshLambertMaterial({ color: '#5a8a2a' }), dust: new THREE.MeshLambertMaterial({ color: '#b8a888' }), spark: new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }) };
  const parts = [];
  const im = {};
  for (const k of Object.keys(mats)) { im[k] = new THREE.InstancedMesh(geo, mats[k], N); im[k].count = 0; im[k].frustumCulled = false; scene.add(im[k]); }
  // ── flaques (décals posés au sol) ──
  const decals = [];
  const decalGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  const decalMat = { blood: new THREE.MeshBasicMaterial({ color: '#5a0a0a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), goo: new THREE.MeshBasicMaterial({ color: '#3f6a1f', transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }) };
  // ── traçantes et éclairs ──
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe8a8', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  const flashGeo = new THREE.SphereGeometry(0.16, 6, 4);
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false, transparent: true, opacity: 0.95 });
  const flashLights = [0, 1].map(() => { const l = new THREE.PointLight('#ffc070', 0, 14, 1.6); scene.add(l); return { l, t: 0 }; });
  // ── nuages de gaz (Gonflés) ──
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#8fd45a', transparent: true, opacity: 0.35, depthWrite: false });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

  function spray(kind, p, dir, n = 14, force = 4) {
    for (let i = 0; i < n; i++) {
      if (parts.length > N * 3) parts.shift();
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.2, (Math.random() - 0.5) * 2).multiplyScalar(force * 0.5);
      if (dir) v.addScaledVector(dir, force * (0.4 + Math.random() * 0.6));
      parts.push({ kind, p: p.clone(), v, t: 0, life: 0.6 + Math.random() * 0.6, s: 0.6 + Math.random() * 1.2 });
    }
  }
  function decal(kind, x, z, r) {
    const y = Math.max(heightAt(x, z), 0) + 0.03;
    const m = new THREE.Mesh(decalGeo, decalMat[kind].clone());
    m.position.set(x, y, z); m.scale.setScalar(r * (0.7 + Math.random() * 0.5)); m.rotation.y = Math.random() * 6;
    scene.add(m);
    decals.push({ m, t: 0 });
    if (decals.length > 40) { const o = decals.shift(); scene.remove(o.m); o.m.material.dispose(); }
  }

  return {
    // coup reçu par un zombie (ou un crabe) : gerbe, et parfois une tache au sol
    blood(p, dir, big = false, goo = false) {
      const k = goo ? 'goo' : 'blood';
      spray(k, p, dir, big ? 26 : 12, big ? 5 : 3.5);
      if (big || Math.random() < 0.5) decal(k, p.x + (dir?.x || 0) * 0.8, p.z + (dir?.z || 0) * 0.8, big ? 1.1 : 0.55);
    },
    pool(p, goo = false) { decal(goo ? 'goo' : 'blood', p.x, p.z, 1.3); },
    impact(p) { spray('dust', p, null, 6, 2); spray('spark', p, null, 3, 3); },
    // traçante de la bouche de l'arme au point d'impact
    tracer(a, b) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.z = Math.max(0.01, a.distanceTo(b));
      m.lookAt(b);
      scene.add(m);
      tracers.push({ m, t: 0, life: 0.07 });
    },
    muzzle(p) {
      const m = new THREE.Mesh(flashGeo, flashMat.clone());
      m.position.copy(p); m.scale.setScalar(0.8 + Math.random() * 0.6);
      scene.add(m);
      tracers.push({ m, t: 0, life: 0.05 });
      const L = flashLights.reduce((a, b) => (a.t < b.t ? a : b));
      L.l.position.copy(p); L.l.intensity = 9; L.t = 0.06;
    },
    gas(p, r = 3.6, life = 6) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat.clone());
      m.position.copy(p).setY(p.y + 0.8); m.scale.setScalar(0.3);
      scene.add(m);
      clouds.push({ m, t: 0, life, r, p: p.clone() });
    },
    gasAt(p) { return clouds.some((c) => c.t < c.life && Math.hypot(c.p.x - p.x, c.p.z - p.z) < c.r); },
    clear() { [...decals, ...tracers, ...clouds].forEach((o) => scene.remove(o.m)); decals.length = 0; tracers.length = 0; clouds.length = 0; parts.length = 0; },
    update(dt) {
      const counts = { blood: 0, goo: 0, dust: 0, spark: 0 };
      for (let i = parts.length - 1; i >= 0; i--) {
        const s = parts[i];
        s.t += dt;
        s.v.y -= 14 * dt;
        s.p.addScaledVector(s.v, dt);
        const g = heightAt(s.p.x, s.p.z);
        if (s.p.y < g + 0.04) { s.p.y = g + 0.04; s.v.set(0, 0, 0); }
        if (s.t > s.life) { parts.splice(i, 1); continue; }
        const n = counts[s.kind];
        if (n >= N) continue;
        q.identity(); sc.setScalar(s.s * (1 - s.t / s.life * 0.5));
        m4.compose(s.p, q, sc);
        im[s.kind].setMatrixAt(n, m4);
        counts[s.kind] = n + 1;
      }
      for (const k of Object.keys(im)) { im[k].count = counts[k]; im[k].instanceMatrix.needsUpdate = true; }
      for (let i = decals.length - 1; i >= 0; i--) {
        const d = decals[i]; d.t += dt;
        if (d.t > 50) d.m.material.opacity = Math.max(0, 0.8 - (d.t - 50) / 10);
        if (d.t > 60) { scene.remove(d.m); d.m.material.dispose(); decals.splice(i, 1); }
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i]; t.t += dt;
        t.m.material.opacity = Math.max(0, 1 - t.t / t.life);
        if (t.t > t.life) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); }
      }
      for (const L of flashLights) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; }
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i]; c.t += dt;
        const k = Math.min(1, c.t * 3);
        c.m.scale.setScalar(c.r * (0.4 + 0.6 * k) * (1 + Math.sin(c.t * 3) * 0.04));
        c.m.material.opacity = 0.38 * Math.min(1, (c.life - c.t) / 1.5);
        if (c.t > c.life) { scene.remove(c.m); clouds.splice(i, 1); }
      }
    },
  };
}
