// Ennemis : crabes mutés (plages, le jour) et zombies (sortent de terre la nuit), boss Crabe-Roi et Colosse
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { CFG } from './config.js';

function lam(col) { return new THREE.MeshLambertMaterial({ color: col, flatShading: true }); }

function buildCrab() {
  const g = new THREE.Group();
  const shell = lam('#d0553a'), dark = lam('#8f2f22'), eye = new THREE.MeshBasicMaterial({ color: '#111' });
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), shell);
  body.scale.set(1.25, 0.5, 0.95);
  body.position.y = 0.32;
  g.add(body);
  const spikes = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
  spikes.position.set(0, 0.52, 0);
  g.add(spikes);
  const legs = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), dark);
    leg.geometry.translate(sx * 0.2, 0, 0);
    leg.position.set(sx * 0.3, 0.26, -0.15 + i * 0.16);
    leg.rotation.z = sx * -0.5;
    g.add(leg);
    legs.push(leg);
  }
  const claws = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.28, 0.34, -0.3);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), shell);
    a.position.z = -0.12;
    arm.add(a);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shell);
    top.position.set(0, 0.04, -0.34);
    arm.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.18), dark);
    bot.position.set(0, -0.04, -0.32);
    arm.add(bot);
    arm.userData.top = top;
    g.add(arm);
    claws.push(arm);
  }
  for (const sx of [-0.1, 0.1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), dark);
    stalk.position.set(sx, 0.5, -0.24);
    g.add(stalk);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eye);
    e.position.set(sx, 0.58, -0.24);
    g.add(e);
  }
  g.scale.setScalar(1.25);
  g.userData = { legs, claws, mats: [shell, dark] };
  return g;
}

// Zombie low poly : peau verdâtre, vêtements déchirés, bras tendus, yeux jaunes
const SHIRTS = ['#5d6f8a', '#8a5d5d', '#6f7d4a', '#7a6a8f', '#9a7a4f', '#4f7a7a'];
let zN = 0;
function buildZombie(variant = 'walker') {
  const g = new THREE.Group();
  const k = zN++;
  const skin = lam(['#7fa37a', '#8fae84', '#6f9470'][k % 3]);
  const shirt = lam(SHIRTS[k % SHIRTS.length]);
  const pants = lam(['#3b4150', '#4a3d33', '#2f3a48'][k % 3]);
  const dark = lam('#2a2a2a');
  const blood = lam('#7a1f1f');
  const eyeM = new THREE.MeshBasicMaterial({ color: variant === 'brute' || variant === 'screamer' ? '#ff4d2e' : variant === 'bloater' ? '#b6ff4d' : '#ffe14d', toneMapped: false });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
  const body = new THREE.Group();
  g.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);
  const legs = [];
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    leg.position.x = sx;
    leg.add(box(0.17, 0.88, 0.19, pants, 0, -0.44, 0));
    leg.add(box(0.19, 0.1, 0.3, dark, 0, -0.88, -0.05));
    hips.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  torso.rotation.x = 0.28;          // voûté
  hips.add(torso);
  torso.add(box(0.5, 0.64, 0.28, shirt, 0, 0.34, 0));
  torso.add(box(0.2, 0.18, 0.02, skin, 0.1, 0.22, -0.145));     // chemise déchirée
  torso.add(box(0.12, 0.1, 0.02, blood, -0.12, 0.44, -0.145));
  const headG = new THREE.Group();
  headG.position.set(0, 0.74, -0.04);
  torso.add(headG);
  headG.add(box(0.28, 0.3, 0.28, skin, 0, 0.15, 0));
  headG.add(box(0.3, 0.08, 0.3, pants, 0, 0.32, 0.02));           // cheveux
  headG.add(box(0.16, 0.05, 0.02, dark, 0, 0.04, -0.145));        // bouche
  const eyes = [];
  for (const sx of [-0.07, 0.07]) { const e = box(0.06, 0.04, 0.02, eyeM, sx, 0.18, -0.15); headG.add(e); eyes.push(e); }
  const arms = [];
  for (const sx of [-0.32, 0.32]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 0.6, 0);
    arm.add(box(0.14, 0.34, 0.15, shirt, 0, -0.17, 0));
    arm.add(box(0.12, 0.34, 0.13, skin, 0, -0.5, 0));
    arm.add(box(0.13, 0.12, 0.14, skin, 0, -0.72, 0));
    arm.rotation.x = -1.35;           // bras tendus
    torso.add(arm);
    arms.push(arm);
  }
  if (variant === 'crawler') {
    // rampant : plus de jambes, il se traîne sur les bras
    legs.forEach((l) => { l.children[0].scale.y = 0.35; l.children[0].position.y = -0.15; l.children[1].visible = false; });
    headG.add(box(0.1, 0.06, 0.02, blood, 0.05, 0.02, -0.146));
  }
  if (variant === 'bloater') {
    const gut = lam('#9aac5a'), boil = lam('#c9d46a');
    const belly = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 1), gut);
    belly.scale.set(1.15, 1.05, 1.1); belly.position.set(0, 0.34, -0.08); torso.add(belly);
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.02, 6, 4), boil); const a = i * 0.9; b.position.set(Math.cos(a) * 0.42, 0.3 + Math.sin(a * 1.7) * 0.25, -0.2 + Math.sin(a) * 0.3); torso.add(b); }
    headG.scale.setScalar(0.85);
  }
  if (variant === 'screamer') {
    headG.add(box(0.14, 0.14, 0.03, lam('#3a0808'), 0, 0.04, -0.146));          // bouche béante
    arms.forEach((a) => { a.children[1].scale.y = 1.5; a.children[1].position.y = -0.6; a.children[2].position.y = -0.92; });
    torso.scale.set(0.8, 1.1, 0.8);
  }
  if (variant === 'brute') {
    const plate = lam('#5d646c');
    torso.add(box(0.62, 0.3, 0.36, plate, 0, 0.5, 0));             // plaques de tôle rivetées
    headG.add(box(0.34, 0.12, 0.34, plate, 0, 0.3, 0));
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 5), dark); h.position.set(sx * 0.12, 0.42, 0); h.rotation.z = -sx * 0.4; headG.add(h); }
  }
  g.userData = { zombie: true, variant, arms, legs, eyes, body, headG, torso, hips, mats: [skin, shirt, pants], walk: Math.random() * 6 };
  return g;
}

// variantes géantes (boss)
function buildKingCrab() {
  const g = buildCrab();
  g.scale.setScalar(3.1);
  const barn = new THREE.MeshLambertMaterial({ color: '#e9e4d8', flatShading: true });
  const moss = new THREE.MeshLambertMaterial({ color: '#4f7a56', flatShading: true });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.05 + (i % 3) * 0.02, 0.12, 5), i % 2 ? barn : moss);
    const a = (i / 9) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.28, 0.5 + (i % 2) * 0.04, Math.sin(a) * 0.2);
    g.add(b);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 4, 8), new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false }));
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.62;
  g.add(crown);
  return g;
}
function buildWarden() {
  const g = buildZombie('brute');
  g.scale.setScalar(2.4);
  return g;
}

// h : hauteur (tir à la tête au-dessus de 82 %), wind : préparation du coup (on peut esquiver), goo : sang vert
const TYPES = {
  crab: { code: 0, name: 'Crabe muté', hp: 30, speed: 3.3, aggro: 7, reach: 1.35, dmg: 7, cd: 1.1, radius: 0.55, h: 0.6, goo: true, build: buildCrab },
  voile: { code: 1, name: 'Rôdeur', hp: 60, speed: 2.4, aggro: 45, reach: 1.6, dmg: 12, cd: 1.3, radius: 0.4, h: 1.85, wind: 0.42, build: () => buildZombie() },
  kingcrab: { code: 2, name: 'Crabe-Roi', hp: 520, speed: 2.7, aggro: 16, reach: 3.6, dmg: 22, cd: 1.5, radius: 2.0, h: 1.8, goo: true, build: buildKingCrab, boss: 'Le Crabe-Roi' },
  warden: { code: 3, name: 'Colosse', hp: 1400, speed: 2.1, aggro: 80, reach: 3.6, dmg: 26, cd: 1.6, radius: 1.1, h: 4.4, build: buildWarden, boss: 'Le Colosse' },
  runner: { code: 4, name: 'Coureur', hp: 38, speed: 5.4, aggro: 60, reach: 1.5, dmg: 9, cd: 0.9, radius: 0.38, h: 1.65, wind: 0.22, build: () => { const v = buildZombie('runner'); v.scale.setScalar(0.9); return v; } },
  crawler: { code: 5, name: 'Rampant', hp: 32, speed: 2.7, aggro: 40, reach: 1.3, dmg: 10, cd: 1.0, radius: 0.42, h: 0.7, wind: 0.3, build: () => buildZombie('crawler') },
  bloater: { code: 6, name: 'Gonflé', hp: 95, speed: 1.6, aggro: 40, reach: 1.7, dmg: 14, cd: 1.6, radius: 0.62, h: 1.95, wind: 0.6, build: () => { const v = buildZombie('bloater'); v.scale.setScalar(1.1); return v; } },
  screamer: { code: 7, name: 'Hurleur', hp: 48, speed: 3.2, aggro: 55, reach: 1.5, dmg: 8, cd: 1.2, radius: 0.38, h: 1.95, wind: 0.3, build: () => buildZombie('screamer') },
  brute: { code: 8, name: 'Cogneur', hp: 260, speed: 2.25, aggro: 55, reach: 2.1, dmg: 27, cd: 1.7, radius: 0.62, h: 2.4, wind: 0.65, armor: 0.45, build: () => { const v = buildZombie('brute'); v.scale.setScalar(1.3); return v; } },
};
const BY_CODE = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v.code, k]));
const ZOMBIES = new Set(['voile', 'runner', 'warden', 'crawler', 'bloater', 'screamer', 'brute']);
const isVoile = (type) => ZOMBIES.has(type);
export { TYPES as ENEMY_TYPES };

// composition des hordes : plus variées au fil de la nuit, des jours et des chapitres
function pickZombie(ctx) {
  const d = ctx.depth ?? 0, lvl = (ctx.day ?? 1) + (ctx.chapter ?? 1) - 2;
  const r = Math.random();
  const table = [
    ['brute', lvl >= 1 && d > 0.45 ? 0.05 + 0.02 * lvl : 0],
    ['screamer', d > 0.35 && lvl >= 1 ? 0.06 : 0],
    ['bloater', lvl >= 1 ? 0.09 : 0.03],
    ['crawler', 0.12],
    ['runner', 0.12 + 0.15 * d],
  ];
  let acc = 0;
  for (const [t, p] of table) { acc += p; if (r < acc) return t; }
  return 'voile';
}

export function createEnemies(scene, colliders, hooks) {
  const list = [];
  let spawnT = 0, nextId = 1;
  const tmp = new THREE.Vector3();
  let hpScale = 1;

  function add(type, x, z, opts = {}) {
    const T = TYPES[type];
    const mesh = T.build();
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(mesh);
    const e = {
      id: opts.id ?? nextId++, type, T, mesh, pos: new THREE.Vector3(x, heightAt(x, z), z), home: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector2(), hp: T.hp * (T.boss ? hpScale : 1), maxHp: T.hp * (T.boss ? hpScale : 1), cd: 0, flash: 0, stagger: 0, dead: false, deadT: 0,
      wander: new THREE.Vector2(x, z), wanderT: 0, yaw: Math.random() * 6.28, t: Math.random() * 10, appear: isVoile(type) ? 0 : 1,
      state: T.boss ? (type === 'kingcrab' ? 'sleep' : 'chase') : 'chase', stT: 0, chargeCd: 4, summonT: 10, stun: 0, half: false,
      siege: !!opts.siege, target: new THREE.Vector3(x, 0, z), attackT: 0, moving: false,
      indoor: !!opts.indoor, dormant: !!opts.indoor, dayz: !!opts.dayz,
    };
    if (opts.indoor) e.appear = 1;
    list.push(e);
    return e;
  }
  function remove(e) { scene.remove(e.mesh); const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); }
  function inLight(x, z, lights, pad = 0) {
    for (const L of lights) if (Math.hypot(x - L.p.x, z - L.p.z) < L.r + pad) return L;
    return null;
  }
  function collide(e) {
    const r = e.T.radius;
    for (const c of colliders) {
      if (c.disabled) continue;
      if (c.type === 'circle') {
        const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-4) { e.pos.x = c.x + dx / d * m; e.pos.z = c.z + dz / d * m; }
      } else {
        const cx = Math.max(c.minX, Math.min(e.pos.x, c.maxX)), cz = Math.max(c.minZ, Math.min(e.pos.z, c.maxZ));
        const dx = e.pos.x - cx, dz = e.pos.z - cz, d = Math.hypot(dx, dz);
        if (d < r && d > 1e-4) { e.pos.x = cx + dx / d * r; e.pos.z = cz + dz / d * r; }
      }
    }
    for (const o of list) {
      if (o === e || o.dead) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = r + o.T.radius;
      if (d < m && d > 1e-4) { e.pos.x += dx / d * (m - d) * 0.5; e.pos.z += dz / d * (m - d) * 0.5; }
    }
  }
  function setFlash(e, v, col) {
    for (const m of e.mesh.userData.mats) {
      if (!m.userData.base) m.userData.base = m.emissive.clone();
      if (v) m.emissive.set(col || '#e61a0d'); else m.emissive.copy(m.userData.base);
    }
  }
  // multiplicateur de dégâts (carapace, lumière)
  function dmgMul(e, lights, head) {
    if (e.type === 'brute') return head ? 1.3 : e.T.armor;
    if (e.type === 'kingcrab') return e.state === 'stun' ? 2.5 : e.state === 'sleep' ? 1 : 0.35;
    if (e.type === 'warden') return inLight(e.pos.x, e.pos.z, lights || []) ? 1 : 0.15;
    return 1;
  }
  function damage(e, dmg, dir, knock, lights, opts = {}) {
    if (!e || e.dead) return null;
    const mul = dmgMul(e, lights, opts.head);
    e.hp -= dmg * mul;
    e.flash = 0.15;
    if (!e.T.boss) e.stagger = Math.max(e.stagger, (opts.stun ?? 0.35) * (e.type === 'brute' ? 0.4 : 1));
    if (e.state === 'tele' && !e.T.boss && (opts.stun ?? 0.35) >= 0.3) { e.state = 'chase'; e.cd = e.T.cd * 0.6; }   // coup interrompu
    if (e.state === 'sleep' && e.type !== 'kingcrab') e.state = 'chase';
    e.dormant = false;
    if (dir) {
      const len = Math.hypot(dir.x, dir.z) || 1;
      const k = e.T.boss ? knock * 0.15 : knock;
      e.vel.set(dir.x / len * k, dir.z / len * k);
    }
    if (e.type === 'kingcrab' && e.state === 'sleep') { e.state = 'chase'; hooks.onBossWake?.(e); }
    if (e.hp <= 0) kill(e);
    return { e, mul };
  }
  function kill(e) {
    if (e.dead) return;
    e.dead = true; e.deadT = 0;
    hooks.onKill?.(e);
    hooks.onDeathFx?.(e);
    if (e.type === 'bloater') hooks.onBloat?.(e);
    if (e.T.boss) hooks.onBossDeath?.(e);
  }

  // animation (commune à l'hôte et aux miroirs)
  function animate(e, dt) {
    const m = e.mesh, u = m.userData;
    m.position.set(e.pos.x, e.pos.y, e.pos.z);
    m.rotation.set(0, e.yaw, 0);
    const moving = e.moving;
    if (e.type === 'crab' || e.type === 'kingcrab') {
      const sp = e.type === 'kingcrab' ? (e.state === 'charge' ? 30 : 9) : 18;
      u.legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(e.t * sp + k) * 0.5 : 0; });
      const raised = e.state === 'tele' ? 1.1 : e.attackT > 0 ? 0.6 : Math.max(0, Math.sin(e.t * 4)) * 0.25;
      u.claws.forEach((c, k) => { c.userData.top.rotation.x = -raised; c.rotation.y = (k ? -1 : 1) * 0.3; c.rotation.x = e.state === 'tele' ? -0.6 : 0; });
      if (e.type === 'kingcrab') {
        if (e.state === 'sleep') m.position.y -= 0.9;
        if (e.state === 'stun') m.rotation.z = Math.sin(e.t * 20) * 0.06;
      }
    } else {
      // zombie : démarche traînante, bras tendus, sort de terre en apparaissant
      u.walk += dt * (moving ? (e.type === 'runner' || e.lunge > 0 ? 11 : e.type === 'bloater' ? 3.5 : 5.5) : 0);
      const sw = moving ? Math.sin(u.walk) : 0;
      u.legs[0].rotation.x = sw * 0.6; u.legs[1].rotation.x = -sw * 0.6;
      const reach = e.state === 'tele' ? -2.4 : e.attackT > 0 ? -1.9 : -1.35 + Math.sin(e.t * 2.2) * 0.12;
      u.arms.forEach((a, k) => { a.rotation.x = reach + (k ? 1 : -1) * sw * 0.18; a.rotation.z = (k ? -1 : 1) * 0.08; });
      u.headG.rotation.z = Math.sin(e.t * 1.1 + e.id) * 0.25;
      u.torso.rotation.x = 0.28 + (moving ? 0.1 : 0) + (e.attackT > 0 ? 0.25 : 0) + (e.state === 'tele' ? -0.2 : 0);
      u.body.rotation.z = sw * 0.08;
      if (u.variant === 'crawler') {
        // se traîne : corps à plat, bras qui tirent à tour de rôle
        u.hips.position.y = 0.32; u.torso.rotation.x = 1.35;
        u.arms.forEach((a, k) => { a.rotation.x = -1.1 + Math.sin(u.walk + k * Math.PI) * 0.7; });
        u.legs.forEach((l) => { l.rotation.x = -1.3; });
        u.headG.rotation.x = -1.0;
      }
      if (u.variant === 'screamer' && e.scream > 0) { u.headG.rotation.x = -0.6; u.arms.forEach((a, k) => { a.rotation.x = -2.6; a.rotation.z = (k ? -1 : 1) * 0.6; }); }
      if (e.state === 'sleep') { u.torso.rotation.x = 0.7; u.arms.forEach((a) => { a.rotation.x = -0.2; }); u.headG.rotation.x = 0.5; }
      m.position.y += (e.appear - 1) * 1.9;         // émerge du sol
      u.eyes.forEach((ey) => { ey.visible = Math.sin(e.t * 0.7 + e.pos.x) > -0.97; });
    }
    if (e.attackT > 0) e.attackT -= dt;
    e.flash = Math.max(0, e.flash - dt);
    const col = e.state === 'stun' ? '#ffd166' : e.state === 'tele' ? '#ff3d1a' : e.vuln ? '#7a4dff' : null;
    setFlash(e, e.flash > 0 || col, e.flash > 0 ? null : col);
  }
  function deathAnim(e, dt) {
    const m = e.mesh;
    e.deadT += dt;
    if (e.type === 'crab' || e.type === 'kingcrab') { m.rotation.z = Math.min(Math.PI, e.deadT * 6); m.position.y = e.pos.y + (e.type === 'kingcrab' ? 1.2 : 0.3); }
    else { m.rotation.x = -Math.min(Math.PI / 2, e.deadT * 4); m.position.y = e.pos.y + (e.deadT > 4 ? -(e.deadT - 4) * 0.8 : 0.15); }
    return e.deadT > (e.type === 'crab' ? 6 : e.type === 'kingcrab' ? 10 : 5.2);
  }

  return {
    list,
    TYPES,
    setHpScale(v) { hpScale = v; },
    add,
    spawnCrabs(points) { points.forEach((p) => add('crab', p.x, p.z)); },
    spawnAround(type, cx, cz, n, rMin, rMax, opts) {
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 16; tries++) {
          const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
          const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
          if (heightAt(x, z) < 0.2) continue;
          add(type, x, z, opts);
          break;
        }
      }
    },
    clearVoiles() { list.filter((e) => isVoile(e.type)).forEach(remove); },
    clearAll() { list.slice().forEach(remove); },
    aliveCount(type) { return list.filter((e) => e.type === type && !e.dead).length; },
    byId(id) { return list.find((e) => e.id === id); },
    bosses() { return list.filter((e) => e.T.boss && !e.dead && e.state !== 'sleep'); },
    stun(e, s) { if (!e || e.dead) return; if (e.type === 'kingcrab' && e.state !== 'sleep') { e.state = 'stun'; e.stT = s; } else if (!e.T.boss) e.stagger = Math.max(e.stagger, s); },
    stunAround(p, r, s) { for (const e of list) if (!e.dead && e.pos.distanceTo(p) < r + e.T.radius) this.stun(e, s); },
    damage,

    // coup en cône (poings, clé) : renvoie { e, mul } ou null
    hit(origin, dir, range, dmg, knock, lights) {
      let best = null, bd = 1e9;
      for (const e of list) {
        if (e.dead || e.appear < 0.6) continue;
        tmp.set(e.pos.x - origin.x, 0, e.pos.z - origin.z);
        const d = tmp.length();
        if (d > range + e.T.radius) continue;
        tmp.normalize();
        const dot = tmp.x * dir.x + tmp.z * dir.z;
        if (dot < 0.55 && d > 0.9 + e.T.radius) continue;
        if (d < bd) { bd = d; best = e; }
      }
      return best ? damage(best, dmg, dir, knock, lights) : null;
    },
    // tir instantané : premier ennemi traversé par le rayon (cylindre vertical) → { e, t, head, point }
    raycast(o, d, maxT) {
      let best = null;
      const dxz = Math.hypot(d.x, d.z);
      for (const e of list) {
        if (e.dead || e.appear < 0.6) continue;
        const r = e.T.radius * (e.T.boss ? 1 : 0.95) + 0.08, h = e.T.h * (e.type === 'warden' ? 1 : 1);
        const cx = e.pos.x, cz = e.pos.z, y0 = e.pos.y, y1 = e.pos.y + h;
        let t;
        if (dxz < 0.15) { t = (y0 + h * 0.5 - o.y) / (d.y || -1); if (t < 0 || Math.hypot(o.x + d.x * t - cx, o.z + d.z * t - cz) > r) continue; }
        else {
          const t0 = ((cx - o.x) * d.x + (cz - o.z) * d.z) / (dxz * dxz);
          const px = o.x + d.x * t0 - cx, pz = o.z + d.z * t0 - cz, dist = Math.hypot(px, pz);
          if (dist > r || t0 < 0) continue;
          t = Math.max(0, t0 - Math.sqrt(r * r - dist * dist) / dxz);
          let y = o.y + d.y * t;
          if (y < y0 || y > y1) { const ty = t0; y = o.y + d.y * ty; if (y < y0 || y > y1) continue; t = ty; }
        }
        if (t > maxT || (best && t >= best.t)) continue;
        const py = o.y + d.y * t;
        best = { e, t, head: (py - y0) / h > (e.type === 'crawler' ? 0.55 : 0.82), point: new THREE.Vector3(o.x + d.x * t, py, o.z + d.z * t) };
      }
      return best;
    },
    // bruit (coup de feu, cri) : les zombies à portée viennent voir
    noise(p, radius) {
      for (const e of list) {
        if (e.dead || !isVoile(e.type) || e.T.boss) continue;
        if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < radius) { e.lure = new THREE.Vector2(p.x, p.z); e.lureT = 12; e.dormant = false; if (e.state === 'sleep') e.state = 'chase'; }
      }
    },
    // cible touchée par un projectile entre p0 et p1
    sweep(p0, p1, pad = 0.2) {
      let best = null, bt = 2;
      const seg = new THREE.Vector3().subVectors(p1, p0);
      const L2 = seg.lengthSq() || 1e-6;
      for (const e of list) {
        if (e.dead || e.appear < 0.6) continue;
        const h = e.type === 'kingcrab' ? 1.2 : e.type === 'warden' ? 2.4 : e.type === 'crab' ? 0.4 : 1.2;
        const c = new THREE.Vector3(e.pos.x, e.pos.y + h, e.pos.z);
        const t = Math.max(0, Math.min(1, tmp.subVectors(c, p0).dot(seg) / L2));
        const q = p0.clone().addScaledVector(seg, t);
        const rad = e.T.radius + pad + (e.T.boss ? h * 0.5 : 0.35);
        if (q.distanceTo(c) < rad && t < bt) { bt = t; best = e; }
      }
      return best;
    },

    // ── instantané compact (hôte → invités) ──
    snapshot() {
      return list.map((e) => [e.id, e.T.code, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), +e.yaw.toFixed(2), +(Math.max(0, e.hp) / e.maxHp).toFixed(2),
        (e.dead ? 1 : 0) | (e.attackT > 0 ? 2 : 0) | (e.state === 'stun' ? 4 : 0) | (e.state === 'tele' ? 8 : 0) | (e.moving ? 16 : 0) | (e.state === 'sleep' ? 32 : 0) | (e.vuln ? 64 : 0) | (e.state === 'charge' ? 128 : 0) | (e.scream > 0 ? 512 : 0),
        +e.appear.toFixed(2)]);
    },
    applySnapshot(arr) {
      const seen = new Set();
      for (const [id, code, x, z, yaw, hpf, fl, ap] of arr) {
        seen.add(id);
        let e = list.find((q) => q.id === id);
        if (!e) { e = add(BY_CODE[code], x, z, { id }); e.pos.set(x, heightAt(x, z), z); e.yaw = yaw; }
        e.target.set(x, 0, z);
        e.tyaw = yaw;
        e.hp = hpf * e.maxHp;
        const wasDead = e.dead;
        e.dead = !!(fl & 1);
        if (e.dead && !wasDead) { e.deadT = 0; hooks.onDeathFx?.(e); }
        e.scream = fl & 512 ? 0.5 : 0;
        if (fl & 2 && e.attackT <= 0) e.attackT = 0.3;
        e.state = fl & 32 ? 'sleep' : fl & 4 ? 'stun' : fl & 8 ? 'tele' : fl & 128 ? 'charge' : 'chase';
        e.moving = !!(fl & 16);
        e.vuln = !!(fl & 64);
        e.appear = ap;
      }
      for (const e of list.slice()) if (!seen.has(e.id)) { if (!e.dead) { e.dead = true; e.deadT = 0; } e.gone = true; }
    },
    // invités : interpolation et animation seulement
    updateMirror(dt) {
      for (const e of list.slice()) {
        e.t += dt;
        if (e.dead) { if (deathAnim(e, dt) || (e.gone && e.deadT > 3)) remove(e); continue; }
        const k = Math.min(1, dt * 10);
        e.pos.x += (e.target.x - e.pos.x) * k;
        e.pos.z += (e.target.z - e.pos.z) * k;
        e.pos.y = heightAt(e.pos.x, e.pos.z);
        let dy = (e.tyaw ?? e.yaw) - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        e.yaw += dy * k;
        animate(e, dt);
      }
    },

    // ── simulation (hôte ou solo) ──
    update(dt, ctx) {
      // ctx : { players: [{id, pos, active}], night (0..1), depth (0..1, progression de la nuit), lights, maxVoiles, siege: {pos, active} | null }
      const active = ctx.players.filter((p) => p.active);
      const nearestPlayer = (x, z) => {
        let best = null, bd = 1e9;
        for (const p of active) { const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < bd) { bd = d; best = p; } }
        return best ? { p: best, d: bd } : null;
      };
      // un groupe de zombies sort de terre autour d'un joueur, hors des zones éclairées
      const spawnGroup = (room, extra, dMin, dMax, opts) => {
        const P = active[Math.floor(Math.random() * active.length)].pos;
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2, d = dMin + Math.random() * (dMax - dMin);
          const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
          if (heightAt(x, z) < 0.2 || inLight(x, z, ctx.lights, 4)) continue;
          const n = Math.min(room, 1 + (Math.random() < extra ? 1 + Math.floor(Math.random() * 2) : 0));
          for (let k = 0; k < n; k++) {
            const ox = (Math.random() - 0.5) * 3, oz = (Math.random() - 0.5) * 3;
            if (heightAt(x + ox, z + oz) < 0.2) continue;
            add(pickZombie(ctx), x + ox, z + oz, opts);
          }
          hooks.onSpawn?.('voile');
          return;
        }
      };
      // les dormants des bâtiments et les errants de jour ne comptent pas dans la horde de la nuit
      const roaming = (dayz) => list.filter((e) => isVoile(e.type) && !e.dead && !e.siege && !e.indoor && !!e.dayz === dayz).length;
      // les zombies sortent de terre la nuit, de plus en plus nombreux
      if (ctx.night > 0.6 && active.length) {
        spawnT -= dt;
        const count = roaming(false);
        const cap = Math.round(ctx.maxVoiles * (ctx.hordeMul ?? 1) * (0.5 + 0.5 * (ctx.depth ?? 1)));
        if (spawnT <= 0 && count < cap) {
          spawnT = (6 - 3 * (ctx.depth ?? 0) + Math.random() * 3) / Math.max(1, active.length * 0.7) / (ctx.hordeMul ?? 1);
          spawnGroup(cap - count, 0.35 + 0.3 * (ctx.depth ?? 0), 20, 32);
        }
      } else if (ctx.dayCap && active.length) {
        // certaines îles (Port-Cendre) sont infestées même en plein jour
        spawnT -= dt;
        const count = roaming(true);
        if (spawnT <= 0 && count < ctx.dayCap) {
          spawnT = (5 + Math.random() * 4) / Math.max(1, active.length * 0.7);
          spawnGroup(ctx.dayCap - count, 0.4, 24, 40, { dayz: true });
        }
      }

      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.t += dt;
        if (e.dead) { if (deathAnim(e, dt)) remove(e); continue; }
        if (isVoile(e.type)) {
          if (ctx.night < 0.3 && !e.siege && !e.indoor && !e.dayz) { kill(e); continue; }   // l'aube les consume (sauf à l'abri des bâtiments)
          // les errants de jour laissés loin derrière retournent sous terre
          if (e.dayz) { const np = nearestPlayer(e.pos.x, e.pos.z); if (!np || np.d > 90) { remove(e); continue; } }
          e.appear = Math.min(1, e.appear + dt * 0.7);
          if (e.appear < 1) { e.moving = false; animate(e, dt); continue; }
        }
        const np = nearestPlayer(e.pos.x, e.pos.z);
        let tx = null, tz = null, dist = 1e9, targetId = null;
        if (np) { tx = np.p.pos.x; tz = np.p.pos.z; dist = np.d; targetId = np.p.id; }
        // siège : le générateur attire les Voilés quand personne n'est à côté
        const siegeGoal = ctx.siege && ctx.siege.active && (e.siege || e.type === 'warden') && dist > 12;
        if (siegeGoal) { tx = ctx.siege.pos.x; tz = ctx.siege.pos.z; dist = Math.hypot(tx - e.pos.x, tz - e.pos.z); targetId = 'siege'; }
        const toP = new THREE.Vector2((tx ?? e.pos.x) - e.pos.x, (tz ?? e.pos.z) - e.pos.z);
        let want = new THREE.Vector2();
        let speed = e.T.speed;
        e.vuln = e.type === 'warden' && !!inLight(e.pos.x, e.pos.z, ctx.lights);

        if (e.type === 'crab') {
          const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
          if (np && dist < e.T.aggro && fromHome < 24) want.copy(toP).normalize();
          else {
            e.wanderT -= dt;
            if (e.wanderT <= 0) { e.wanderT = 2 + Math.random() * 3; const a = Math.random() * 6.28; e.wander.set(e.home.x + Math.cos(a) * 5, e.home.z + Math.sin(a) * 5); }
            want.set(e.wander.x - e.pos.x, e.wander.y - e.pos.z);
            if (want.length() > 0.4) want.normalize().multiplyScalar(0.4); else want.set(0, 0);
          }
        } else if (e.type === 'kingcrab') {
          e.stT -= dt;
          if (e.state === 'sleep') {
            if (np && dist < e.T.aggro) { e.state = 'chase'; hooks.onBossWake?.(e); }
          } else if (e.state === 'stun') {
            if (e.stT <= 0) { e.state = 'chase'; e.chargeCd = 5 + Math.random() * 3; }
          } else if (e.state === 'tele') {
            if (np) { const a = Math.atan2(-toP.x, -toP.y); let dy = a - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 4); }
            if (e.stT <= 0) { e.state = 'charge'; e.stT = 1.7; e.chargeDir = new THREE.Vector2(-Math.sin(e.yaw), -Math.cos(e.yaw)); e.hitSet = new Set(); }
          } else if (e.state === 'charge') {
            want.copy(e.chargeDir); speed = 15;
            for (const p of active) {
              if (!e.hitSet.has(p.id) && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < e.T.radius + 0.9) { e.hitSet.add(p.id); hooks.onPlayerHit?.(30, e, p.id, e.chargeDir); }
            }
            const ahead = heightAt(e.pos.x + e.chargeDir.x * 2.5, e.pos.z + e.chargeDir.y * 2.5);
            if (e.stT <= 0 || ahead < -0.6 || e.blocked) { e.state = 'stun'; e.stT = 3.2; e.blocked = false; hooks.onBossStun?.(e); }
          } else {
            const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
            if (!np || fromHome > 45) { want.set(e.home.x - e.pos.x, e.home.z - e.pos.z); if (want.length() > 1) want.normalize(); else { want.set(0, 0); if (!np) { e.state = 'sleep'; e.hp = e.maxHp; } } }
            else {
              want.copy(toP).normalize();
              if (dist < e.T.reach * 0.8) want.set(0, 0);
              e.chargeCd -= dt;
              if (e.chargeCd <= 0 && dist > 5 && dist < 26) { e.state = 'tele'; e.stT = 1.1; want.set(0, 0); hooks.onBossTele?.(e); }
            }
            if (!e.half && e.hp < e.maxHp * 0.5) { e.half = true; hooks.onBossHalf?.(e); this.spawnAround('crab', e.pos.x, e.pos.z, 3, 4, 8); }
          }
        } else {
          // Voilés, coureurs et Veilleur
          const L = inLight(e.pos.x, e.pos.z, ctx.lights);
          if (e.type === 'warden') {
            e.summonT -= dt;
            if (e.summonT <= 0) { e.summonT = 14; this.spawnAround('voile', e.pos.x, e.pos.z, 2, 4, 7, { siege: true }); hooks.onBossSummon?.(e); }
            if (e.state === 'tele') {
              e.stT -= dt;
              if (e.stT <= 0) {
                e.state = 'chase'; e.cd = e.T.cd * 1.5;
                for (const p of active) if (Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < 4.8) hooks.onPlayerHit?.(28, e, p.id, null);
                if (ctx.siege?.active && Math.hypot(ctx.siege.pos.x - e.pos.x, ctx.siege.pos.z - e.pos.z) < 5) hooks.onSiegeHit?.(25);
                hooks.onSlam?.(e);
              }
            } else if (tx !== null) {
              want.copy(toP).normalize();
              if (dist < e.T.reach * 0.9) { want.set(0, 0); if (e.cd <= 0) { e.state = 'tele'; e.stT = 1.0; } }
            }
            if (!e.half && e.hp < e.maxHp * 0.5) { e.half = true; hooks.onBossHalf?.(e); }
          } else {
            // ── zombies ordinaires : repérage, leurre sonore, coups annoncés, contournement ──
            e.lureT = Math.max(0, (e.lureT || 0) - dt);
            e.scream = Math.max(0, (e.scream || 0) - dt);
            if (e.dormant) {
              if (np && dist < 9) { e.dormant = false; hooks.onWake?.(e); } else e.state = 'sleep';
            }
            if (!e.dormant) {
              if (e.state === 'sleep') e.state = 'chase';
              if (e.state === 'tele') {
                e.stT -= dt;
                if (e.stT <= 0) {
                  e.state = 'chase'; e.cd = e.T.cd; e.attackT = 0.3;
                  if (np && np.d < e.T.reach + 0.55) hooks.onPlayerHit?.(e.T.dmg, e, np.p.id, e.type === 'brute' ? toP.clone().normalize() : null);
                }
              } else {
                const chase = tx !== null && (dist < e.T.aggro || e.siege || targetId === 'siege');
                let gx = 0, gz = 0;
                if (chase) { gx = toP.x; gz = toP.y; }
                else if (e.lureT > 0 && e.lure) { gx = e.lure.x - e.pos.x; gz = e.lure.y - e.pos.z; if (Math.hypot(gx, gz) < 2) e.lureT = 0; }
                else {
                  e.wanderT -= dt;
                  if (e.wanderT <= 0) { e.wanderT = 3 + Math.random() * 4; const a = Math.random() * 6.28; e.wander.set(e.home.x + Math.cos(a) * 8, e.home.z + Math.sin(a) * 8); }
                  gx = e.wander.x - e.pos.x; gz = e.wander.y - e.pos.z;
                  if (Math.hypot(gx, gz) < 0.6) { gx = 0; gz = 0; }
                  speed *= 0.35;
                }
                if (e.type === 'screamer' && chase) {
                  const l = Math.hypot(gx, gz) || 1;
                  if (dist < 7) { gx = -gx; gz = -gz; } else if (dist < 13) { const px = -gz / l, pz = gx / l; gx = px; gz = pz; }
                  e.screamCd = (e.screamCd ?? 5) - dt;
                  if (e.screamCd <= 0 && dist < 32) { e.screamCd = 11; e.scream = 1.4; hooks.onScream?.(e); }
                  if (e.scream > 0) { gx = 0; gz = 0; }
                }
                if (gx || gz) want.set(gx, gz).normalize();
                const L = inLight(e.pos.x, e.pos.z, ctx.lights);
                if (L) { speed *= 0.55; e.hp -= 3 * dt; e.flash = Math.max(e.flash, 0.03); if (e.hp <= 0) { kill(e); continue; } }
                if (e.type === 'runner') {
                  e.lungeCd = (e.lungeCd || 0) - dt;
                  if (chase && dist < 4.8 && dist > 1.6 && e.lungeCd <= 0) { e.lunge = 0.42; e.lungeCd = 3.2; }
                }
                if (e.lunge > 0) { e.lunge -= dt; speed *= 2.3; }
                if (chase && targetId !== 'siege' && dist < e.T.reach * 0.8 && e.type !== 'screamer') want.set(0, 0);
                if (targetId === 'siege' && dist < 2.8) want.set(0, 0);
                // coup annoncé : bras levés, on a le temps d'esquiver ou d'interrompre
                if (chase && targetId !== 'siege' && np && np.d < e.T.reach && e.cd <= 0 && e.stagger <= 0 && e.type !== 'screamer') { e.state = 'tele'; e.stT = e.T.wind || 0.4; want.set(0, 0); }
                // contournement d'obstacle
                e.avoidT = Math.max(0, (e.avoidT || 0) - dt);
                if (e.avoidT > 0 && want.lengthSq() > 0) { const a = e.avoidSide * 1.15, c = Math.cos(a), sn = Math.sin(a); want.set(want.x * c - want.y * sn, want.x * sn + want.y * c); }
                e.leash = e.indoor && !chase;
              }
            }
          }
        }

        if (e.stagger > 0) { e.stagger -= dt; want.set(0, 0); }
        if (e.type === 'kingcrab' && e.state === 'stun') want.set(0, 0);
        const sx0 = e.pos.x, sz0 = e.pos.z;
        const nx = e.pos.x + (want.x * speed + e.vel.x) * dt;
        const nz = e.pos.z + (want.y * speed + e.vel.y) * dt;
        if (heightAt(nx, nz) > -0.9) { e.pos.x = nx; e.pos.z = nz; } else if (e.state === 'charge') e.blocked = true;
        e.vel.multiplyScalar(Math.exp(-6 * dt));
        const bx = e.pos.x, bz = e.pos.z;
        collide(e);
        if (e.state === 'charge' && Math.hypot(e.pos.x - bx, e.pos.z - bz) > 0.2) e.blocked = true;
        // bloqué contre un obstacle : on tente un pas de côté
        if (isVoile(e.type) && want.lengthSq() > 0.01 && !e.T.boss) {
          const want2 = speed * dt;
          const prog = (e.pos.x - sx0) * want.x + (e.pos.z - sz0) * want.y;
          if (prog < want2 * 0.3) { e.stuckT = (e.stuckT || 0) + dt; if (e.stuckT > 0.5 && !(e.avoidT > 0)) { e.avoidT = 1.1; e.avoidSide = Math.random() < 0.5 ? -1 : 1; e.stuckT = 0; } } else e.stuckT = 0;
        }
        e.pos.y = heightAt(e.pos.x, e.pos.z);

        // attaque au contact
        e.cd -= dt;
        const canHit = e.state !== 'sleep' && e.state !== 'stun' && e.state !== 'tele' && e.state !== 'charge' && e.stagger <= 0 && e.cd <= 0;
        if (canHit && e.type !== 'warden') {
          if (targetId === 'siege' && dist < 3) { e.cd = e.T.cd; e.attackT = 0.3; hooks.onSiegeHit?.(e.T.dmg * 0.5); }
          else if (!isVoile(e.type) && np && np.d < e.T.reach + (e.T.boss ? 0.6 : 0)) {
            const pl = np.p;
            e.cd = e.T.cd; e.attackT = 0.35; hooks.onPlayerHit?.(e.T.dmg, e, pl.id, null);
          }
        }

        const faceTarget = isVoile(e.type) && tx !== null && dist < 6;
        if ((want.lengthSq() > 0.01 || faceTarget) && e.state !== 'charge') {
          const face = ((e.type === 'crab' || e.type === 'kingcrab') && dist < e.T.aggro && tx !== null) || faceTarget ? Math.atan2(-toP.x, -toP.y) : Math.atan2(-want.x, -want.y);
          let dy = face - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          e.yaw += dy * Math.min(1, dt * (e.T.boss ? 3 : 8));
        }
        e.moving = want.lengthSq() > 0.01;
        animate(e, dt);
      }
    },
  };
}
