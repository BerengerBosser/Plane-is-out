// Chapitre 3 — Port-Cendre. En approche, le moteur droit du Coucou surchauffe et prend feu :
// il faut se poser, éteindre l'incendie (camion de pompiers ou extincteurs), puis remettre en état le vol HX-404
// (batterie, kérosène, caisse Hélios en soute, repoussage) et décoller vers Hélios.
import * as THREE from 'three';
import { createIsland3, FLAT3, I3 } from './island3.js';
import { buildBoeing, boeingColliders, boeingPlatform, BOEING, FLOOR_B } from './boeing.js';
import { setIsland3 } from './terrain.js';
import { SLOTS, PLANE_POINTS } from './planeModel.js';
import { clamp } from './terrain.js';

const FIRE_RATE = { natural: 0.3, truck: 22, ext: 7 };

export const Chapter3Mixin = {
  // ── construction (à chaque nouvelle graine d'île 2) ──
  buildIsland3() {
    if (this.island3) {
      this.island3.dispose();
      this.island3.colliders.forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); });
      if (this.boeing) this.scene.remove(this.boeing.root);
    }
    const I = this.island3 = createIsland3(this.scene, this.seed, this.island2);
    setIsland3({ cx: I.cx, cz: I.cz, R2: I.R2, height: I.height });
    this.colliders.push(...I.colliders);
    this.platforms.push(...I.platforms);
    const W = (x, z) => ({ x: I.cx + x, z: I.cz + z });
    for (const [id, p] of Object.entries(I3.vehicles)) { const w = W(p.x, p.z); this.addVehicle(`${id}3`, id, w.x, w.z, p.yaw); }
    this.boeing = buildBoeing();
    this.scene.add(this.boeing.root);
    this.c3 = this.defaultC3();
    this.poseBoeing();
    this.c3Smokes();
  },
  // fumerolles et panache du volcan
  c3Smokes() {
    const I = this.island3; if (!I) return;
    I.points.vents.slice(0, 3).forEach((p, i) => this.smoke.add(`vent${i}`, () => p, '#d8d4cc', 1.2, 3.5));
    this.smoke.add('crater', () => I.points.crater, '#6a6260', 3, 1.4);
  },
  defaultC3() {
    const I = this.island3;
    return { fire: 100, truckFuel: 0, bfuel: 0, bp: { x: I.cx + I3.boeing.x, z: I.cz + I3.boeing.z, yaw: I3.boeing.yaw }, hitched: 0, cine: 0 };
  },
  ensureC3Items() {
    const I = this.island3;
    for (const [id, p] of Object.entries(I3.items)) {
      const it = this.items[id];
      if (!it || it.state !== 'hidden') continue;
      if (p.tower) { const t = I.points.towerTop; this.placeItem(it, t.x, t.z, 0.5); } else this.placeItem(it, I.cx + p.x, I.cz + p.z, 0.3);
    }
  },

  // ── état partagé ──
  chapter3State() { const c = this.c3; return c ? { f: +c.fire.toFixed(1), tf: Math.round(c.truckFuel), bf: Math.round(c.bfuel), bp: [+c.bp.x.toFixed(2), +c.bp.z.toFixed(2), +c.bp.yaw.toFixed(3)], h: c.hitched || 0 } : null; },
  applyChapter3State(s, full) {
    const c = this.c3; if (!c || !s) return;
    c.fire = s.f; c.truckFuel = s.tf; c.bfuel = s.bf; c.hitched = s.h || 0;
    if (this.flags.baysOpen && !this.island3.baysOpen) this.island3.openBays(full);
    const towing = this.driving && this.driving.def.tug && c.hitched === this.myId();
    if (!towing && s.bp) { c.bp = { x: s.bp[0], z: s.bp[1], yaw: s.bp[2] }; this.poseBoeing(); }
    void full;
  },
  applyChapter3Act(type, d, by, auth) {
    const c = this.c3; if (!c) return null;
    switch (type) {
      case 'douse': { if (this.flags.fireOut) return true; c.fire = Math.max(0, c.fire - d.n); if (c.fire <= 0 && this.isAuthority()) this.act('flag', { fireOut: true }); this.dirtyWorld = true; return true; }
      case 'tfuel': { c.truckFuel = clamp(d.v, 0, 100); this.dirtyWorld = true; return true; }
      case 'bfuel': { c.bfuel = clamp(d.v, 0, 100); c.truckFuel = clamp(d.t ?? c.truckFuel, 0, 100); if (c.bfuel >= 100 && !this.flags.boeingFuel && this.isAuthority()) this.act('flag', { boeingFuel: true }); this.dirtyWorld = true; return true; }
      case 'hitch': {
        if (d.on) { if (auth && c.hitched && c.hitched !== by) return false; c.hitched = by; }
        else { c.hitched = 0; if (d.bp) { c.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2] }; this.poseBoeing(); } }
        this.dirtyWorld = true; return true;
      }
      case 'bpos': { if (by !== this.myId()) { c.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2] }; this.poseBoeing(); } if (this.isAuthority() && !this.flags.boeingOut && this.boeingOutZone()) this.act('flag', { boeingOut: true }); this.dirtyWorld = true; return true; }
      case 'unloadCrate': {
        if (!this.crateLoaded) return auth ? false : true;
        this.crateLoaded = false; this.plane.crateAboard.visible = false;
        this.placeItem(this.items.crate, d.x, d.z, d.r || 0);
        this.afterChange(); return true;
      }
      case 'boeingCrate': { const it = this.items.crate; it.state = 'installed'; it.onVehicle = null; it.mesh.visible = false; for (const v of Object.values(this.vehicles)) if (v.cargo === 'crate') v.cargo = null; if (this.isAuthority()) this.act('flag', { boeingCrate: true }); return true; }
      case 'battery': { const it = this.items.battery; it.state = 'installed'; it.mesh.visible = false; if (this.carrying === it) this.carrying = null; if (this.isAuthority()) this.act('flag', { boeingBattery: true }); return true; }
      default: return null;
    }
  },

  // ── avion de ligne : pose, colliders, porte ──
  poseBoeing() {
    const b = this.boeing, c = this.c3; if (!b || !c) return;
    const y = FLAT3;
    b.root.position.set(c.bp.x, y, c.bp.z);
    b.root.rotation.set(0, c.bp.yaw, 0);
    b.root.updateMatrixWorld(true);
    this.boeingDirty = true;
  },
  boeingLocal(v) { this.boeing.root.updateMatrixWorld(true); return this.boeing.root.localToWorld(v.clone()); },
  boeingOutZone() { const I = this.island3; return this.c3.bp.z - I.cz < 101; },
  stairsDocked() {
    const v = this.vehicles.stairs3; if (!v || !this.boeing) return false;
    const land = this.vehicleWorld(v, new THREE.Vector3(0.25, 4.4, -3.2)), door = this.boeingLocal(BOEING.door);
    return Math.hypot(land.x - door.x, land.z - door.z) < 1.9 && Math.abs(v.speed) < 0.5;
  },
  inBoeing(p = this.playerWorld()) {
    if (!this.boeing) return false;
    const c = this.c3, dx = p.x - c.bp.x, dz = p.z - c.bp.z, cs = Math.cos(c.bp.yaw), sn = Math.sin(c.bp.yaw);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, B = BOEING.cabin;
    return p.y > FLAT3 + FLOOR_B - 0.6 && lx > B.minX - 0.4 && lx < B.maxX + 0.4 && lz > B.minZ && lz < B.maxZ;
  },

  // ouverture du hangar 2 : klaxon, poussière, sol qui tremble
  updateHangarFx(dt) {
    if (!(this.hangarFxT > 0)) return;
    const I = this.island2;
    this.hangarFxT -= dt;
    const pts = I.hangarDoorPts;
    if (!this.smoke.emitters.has('hdust0')) pts.forEach((p, i) => this.smoke.add(`hdust${i}`, () => p, '#d8c8a8', 6, 1.2));
    const d = Math.min(...pts.map((p) => p.distanceTo(this.playerWorld())));
    if (d < 40) { this.player.shake = Math.max(this.player.shake, 0.35 * (1 - d / 40)); }
    this._hornT = (this._hornT || 0) - dt;
    if (this._hornT <= 0 && d < 90) { this._hornT = 0.9; this.audio.door(); this.audio.beep(); }
    if (this.hangarFxT <= 0) pts.forEach((_, i) => this.smoke.remove(`hdust${i}`));
  },

  // ── chaque image ──
  updateChapter3(dt) {
    this.updateHangarFx(dt);
    const I = this.island3; if (!I || !this.c3) return;
    const c = this.c3, b = this.boeing, f = this.flags;
    const me = this.playerWorld();
    const near = Math.hypot(me.x - I.cx, me.z - I.cz) < 700 || this.mode === 'flight' && Math.hypot(this.flight.pos.x - I.cx, this.flight.pos.z - I.cz) < 900;
    I.group.visible = near || this.chapter() === 3;
    b.root.visible = I.group.visible;
    I.setNight(this.brumeNow || 0);
    I.update(this.t, dt);
    // porte avant : ouverte quand l'escalier est accosté
    const docked = this.stairsDocked();
    b.doorPivot.rotation.y += ((docked ? -1.7 : 0) - b.doorPivot.rotation.y) * Math.min(1, dt * 3);
    b.cargoPivot.rotation.z += ((f.boeingFuel || this.vehicles.fork3?.cargo === 'crate' ? 0.9 : 0) - b.cargoPivot.rotation.z) * Math.min(1, dt * 2);
    b.strobe.visible = f.boeingBattery && Math.sin(this.t * 6) > 0.6;
    b.cabinLight.intensity = f.boeingBattery ? 8 : 2;
    if (docked !== this._docked || this.boeingDirty) {
      this._docked = docked; this.boeingDirty = false;
      this.boeingCols = boeingColliders({ x: c.bp.x, z: c.bp.z, y: FLAT3, yaw: c.bp.yaw }, { door: docked });
      const plat = boeingPlatform({ x: c.bp.x, z: c.bp.z, y: FLAT3, yaw: c.bp.yaw });
      this.platforms = this.platforms.filter((p) => !p.boeing).concat([plat]);
    }
    // incendie du Coucou
    this.updateCoucouFire(dt);
    // extincteur porté : clic maintenu
    if (this.carrying?.id === 'extinguisher' && this.input.down('MouseL') && this.mode === 'explore' && !this.ui.modalOpen()) {
      const o = this.camera.position.clone().add(new THREE.Vector3(0, -0.35, 0));
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.emitSpray(o.addScaledVector(dir, 0.6), dir, 10, dt);
      this.onSpray(o, dir, 8, FIRE_RATE.ext / FIRE_RATE.truck, dt);
    }
    // repoussage : l'avion suit le tracteur comme une remorque
    const tug = this.driving;
    if (tug && tug.def.tug && c.hitched === this.myId()) {
      const H = this.vehicleWorld(tug, tug.model.hitch);
      const yaw = c.bp.yaw, WB = BOEING.wheelbase;
      const M = new THREE.Vector3(c.bp.x + Math.sin(yaw) * WB, 0, c.bp.z + Math.cos(yaw) * WB);   // train principal (derrière le nez)
      const dir = new THREE.Vector3(H.x - M.x, 0, H.z - M.z); const L = dir.length(); if (L > 0.01) dir.divideScalar(L);
      // pas plus près du terminal que la place de parking
      const I3z = this.island3.cz + I3.boeing.z + 1;
      if (H.z > I3z) { tug.speed = Math.min(tug.speed, 0); }
      c.bp.x = H.x; c.bp.z = Math.min(H.z, I3z); c.bp.yaw = Math.atan2(-dir.x, -dir.z);
      this.poseBoeing();
      this._bpSend = (this._bpSend || 0) + dt;
      if (this._bpSend > 0.25) { this._bpSend = 0; this.act('bpos', { bp: [+c.bp.x.toFixed(2), +c.bp.z.toFixed(2), +c.bp.yaw.toFixed(3)] }); }
    }
    // arrivée à Port-Cendre (à pied)
    if (this.chapter() === 3 && !f.landed3 && this.mode === 'explore' && !this.aboard && this.nearIsland() === 3 && this.groundAt(me.x, me.z, me.y) > 0.2) this.act('flag', { landed3: true });
  },

  // moteur en feu : flammes, fumée, chaleur ; le feu baisse seul (lentement) ou sous l'eau
  updateCoucouFire(dt) {
    const f = this.flags, c = this.c3;
    const burning = f.fire3 && !f.fireOut;
    if (!this.fireFx) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false, transparent: true, opacity: 0.9 });
      const mat2 = new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.35 + i * 0.05, 1.6 + i * 0.3, 6), i % 2 ? mat2 : mat); m.position.set((i - 2) * 0.25, 0.8, (i % 2) * 0.3 - 0.15); g.add(m); }
      const light = new THREE.PointLight('#ff8a2a', 0, 18, 1.4); light.position.y = 1.5; g.add(light);
      g.userData.light = light;
      this.plane.body.add(g);
      g.position.copy(SLOTS.engineR).add(new THREE.Vector3(0, 0.6, 0.4));
      this.fireFx = g;
    }
    const g = this.fireFx;
    g.visible = burning;
    if (!burning) { this.smoke.remove('c3fire'); return; }
    const k = Math.max(0.25, c.fire / 100);
    g.children.forEach((m, i) => { if (m.isMesh) { m.scale.set(k, k * (0.8 + 0.4 * Math.sin(this.t * (9 + i) + i)), k); } });
    g.userData.light.intensity = 12 * k + Math.sin(this.t * 17) * 2;
    if (!this.smoke.emitters.has('c3fire')) this.smoke.add('c3fire', () => this.plane.body.localToWorld(SLOTS.engineR.clone().add(new THREE.Vector3(0, 1.4, 0.4))), '#262222', 2.8, 3.2);
    // le feu faiblit tout seul une fois au sol (l'hôte décide)
    if (this.isAuthority() && f.landed3 && this.flight.surface !== 'air') {
      this._fireAcc = (this._fireAcc || 0) + dt * FIRE_RATE.natural;
      if (this._fireAcc > 1) { this.act('douse', { n: this._fireAcc }); this._fireAcc = 0; }
    }
    // chaleur : on se brûle à moins de 4,5 m
    if (this.mode === 'explore' && !this.aboard) {
      const p = this.plane.body.localToWorld(SLOTS.engineR.clone());
      const d = p.distanceTo(this.playerWorld());
      if (d < 4.5 && this.hurt) { this._heatT = (this._heatT || 0) + dt; if (this._heatT > 0.5) { this._heatT = 0; this.hurt(6 * k, 'le feu'); } }
    }
  },
  // un jet d'eau (camion ou extincteur) touche-t-il le moteur en feu ?
  onSpray(o, dir, range, power, dt) {
    const f = this.flags;
    if (!f.fire3 || f.fireOut || !this.plane) return;
    const p = this.plane.body.localToWorld(SLOTS.engineR.clone().add(new THREE.Vector3(0, 0.6, 0)));
    const to = p.clone().sub(o); const d = to.length();
    if (d > range) return;
    to.divideScalar(d);
    // la gerbe retombe : on tolère un cône large et une visée un peu haute
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize(), flatTo = new THREE.Vector3(to.x, 0, to.z).normalize();
    if (flat.dot(flatTo) < 0.9) return;
    this._douse = (this._douse || 0) + FIRE_RATE.truck * power * dt;
    if (this._douse > 2) { this.act('douse', { n: this._douse }); this._douse = 0; }
    if (!this._steamT || this.t - this._steamT > 0.3) { this._steamT = this.t; this.smoke.puff?.(p, '#f0f0f0'); }
  },

  // capacités spéciales des véhicules de l'île 3 (appelé par vehicleAbility)
  vehicleAbility3(v, dt) {
    const c = this.c3, inp = this.input;
    if (!c) return;
    this.vehiclePrompt = ''; this.vehicleHold = 0;
    if (v.def.fuel) {
      const I = this.island3, g = I.points.gantry;
      const atGantry = Math.hypot(v.x - g.x, v.z - g.z) < 5.5;
      const fp = this.boeingLocal(BOEING.fuel);
      const atWing = Math.hypot(v.x - fp.x, v.z - fp.z) < 7;
      if (atGantry) {
        this.vehiclePrompt = c.truckFuel >= 100 ? 'Citerne pleine' : '<kbd>Espace</kbd> maintenu : remplir la citerne';
        if (inp.down('Space') && c.truckFuel < 100) { c.truckFuel = Math.min(100, c.truckFuel + dt * 22); this.vehicleHold = c.truckFuel / 100; this.throttleSend('tfuel', { v: c.truckFuel }, dt); if (Math.random() < dt * 4) this.audio.ratchet(); }
      } else if (atWing && !this.flags.boeingFuel) {
        this.vehiclePrompt = c.truckFuel > 0 ? `<kbd>Espace</kbd> maintenu : remplir le Boeing (${Math.round(c.bfuel)} %)` : '<span class="warn">Citerne vide : remplissez-la sous le portique du dépôt</span>';
        if (inp.down('Space') && c.truckFuel > 0) {
          const n = Math.min(c.truckFuel, dt * 18);
          c.truckFuel -= n * 0.5; c.bfuel = Math.min(100, c.bfuel + n);
          this.vehicleHold = c.bfuel / 100;
          this.throttleSend('bfuel', { v: c.bfuel, t: c.truckFuel }, dt);
          if (c.bfuel >= 100) this.act('bfuel', { v: 100, t: c.truckFuel });
        }
      } else this.vehiclePrompt = `Citerne ${Math.round(c.truckFuel)} %`;
      v.model.gauge.scale.x = Math.max(0.05, c.truckFuel / 100);
    }
    if (v.def.tug) {
      const H = this.vehicleWorld(v, v.model.hitch), N = this.boeingLocal(BOEING.nose);
      const d = Math.hypot(H.x - N.x, H.z - N.z);
      if (c.hitched === this.myId()) {
        this.vehiclePrompt = this.boeingOutZone() ? '<kbd>Espace</kbd> dételer : l\'avion est sur le taxiway !' : 'Avancez (<kbd>Z</kbd>) : poussez l\'avion jusqu\'aux hachures rouges · <kbd>Espace</kbd> dételer';
        if (inp.hit('Space')) { this.act('hitch', { on: 0, bp: [c.bp.x, c.bp.z, c.bp.yaw] }); if (this.boeingOutZone()) this.act('flag', { boeingOut: true }); v.hitched = false; }
      } else if (d < 3.2) {
        this.vehiclePrompt = '<kbd>Espace</kbd> atteler la roue avant du Boeing';
        if (inp.hit('Space')) { if (this.act('hitch', { on: 1 }) !== false) { v.hitched = true; this.audio.clank(); this.ui.toast('Attelé', 'Reculez doucement : l\'avion suit.', 'good'); } }
      } else if (d < 25) this.vehiclePrompt = `Approchez la barre de la roue avant (${d.toFixed(1)} m)`;
    }
    if (v.def.stairs) this.vehiclePrompt = this.stairsDocked() ? '<b>Escalier accosté !</b> Descendez et montez à bord.' : (() => { const land = this.vehicleWorld(v, new THREE.Vector3(0.25, 0, -3.2)), door = this.boeingLocal(BOEING.door); const dd = Math.hypot(land.x - door.x, land.z - door.z); return dd < 30 ? `Porte avant gauche : ${dd.toFixed(1)} m` : ''; })();
    if (v.def.forks && v.cargo === 'crate') {
      const cg = this.boeingLocal(BOEING.cargo), tip = this.vehicleWorld(v, new THREE.Vector3(0, 0.3 + v.fork, -1.9));
      const dd = Math.hypot(tip.x - cg.x, tip.z - cg.z);
      if (dd < 12) this.vehiclePrompt = dd < 2.8 ? (tip.y > cg.y - 0.6 ? '<kbd>Espace</kbd> pousser la caisse dans la soute' : `Montez les fourches (<kbd>R</kbd>) : encore ${(cg.y - 0.6 - tip.y).toFixed(1)} m`) : `Porte de soute : ${dd.toFixed(1)} m`;
    }
    if (v.def.forks && !this.vehiclePrompt) this.vehiclePrompt = this.forkHint(v);   // palette / caisse : quoi faire
    if (v.def.spray && this.flags.fire3 && !this.flags.fireOut) this.vehiclePrompt = `Incendie : ${Math.round(c.fire)} % · <kbd>Clic</kbd> maintenu, visez le moteur`;
  },
  throttleSend(type, d, dt) { this._ts = (this._ts || 0) + dt; if (this._ts > 0.4) { this._ts = 0; this.act(type, d); } },
  // les fourches posent la caisse : dans la soute si l'on est devant la porte, assez haut
  onForkDrop(it, tip) {
    if (!it || it.id !== 'crate' || !this.boeing) return;
    const cg = this.boeingLocal(BOEING.cargo);
    if (Math.hypot(tip.x - cg.x, tip.z - cg.z) < 2.8 && tip.y > cg.y - 0.6) { this.act('boeingCrate', {}); this.audio.success(); }
  },
  extraVehicleCols() { return this.boeingCols || []; },

  // ── interactions à pied ──
  c3Interactions(add, me) {
    const I = this.island3, f = this.flags, P = I.points;
    if (!I || Math.hypot(me.x - I.cx, me.z - I.cz) > 420) return;
    add(P.shop, 3.2, { prompt: '<kbd>E</kbd> boutique hors taxes · comptoir d\'échange', press: () => this.openShop(3) });
    if (!I.baysOpen) add(P.fireBtn, 2.4, { prio: 2, prompt: '<kbd>E</kbd> ouvrir les rideaux de la caserne', press: () => this.act('flag', { baysOpen: true }) });
    // décharger la caisse du Coucou (après l'incendie)
    if (this.crateLoaded && this.chapter() === 3) {
      const door = this.plane.root.localToWorld(PLANE_POINTS.doorOut.clone());
      if (!f.fireOut) add(door, 3.2, { prompt: '<span class="warn">Trop chaud : éteignez d\'abord l\'incendie</span>' });
      else {
        const out = this.plane.root.localToWorld(PLANE_POINTS.doorOut.clone().add(new THREE.Vector3(2.4, 0, 0)));
        const dry = this.groundAt(out.x, out.z, 99) > 0.3;
        add(door, 3.2, dry ? { prio: 3, prompt: '<kbd>E</kbd> maintenir : décharger la caisse Hélios', hold: { seconds: 1.5, done: () => this.act('unloadCrate', { x: out.x, z: out.z, r: this.flight.yaw }) } } : { prompt: '<span class="warn">Sur l\'eau : amenez le Coucou au sec (rampe à l\'est de la piste)</span>' });
      }
    }
    if (!this.boeing) return;
    // batterie sous le nez
    const hatch = this.boeingLocal(BOEING.hatch);
    if (!f.boeingBattery && !this.inBoeing(me)) add(hatch, 2.8, this.carrying?.id === 'battery' ? { prio: 4, prompt: '<kbd>E</kbd> installer la batterie dans la trappe avionique', press: () => { this.act('battery', {}); this.audio.success(); } } : { prompt: 'Trappe avionique : <span class="warn">batterie de démarrage manquante</span> (tour de contrôle)' });
    // cockpit et cabine
    if (this.inBoeing(me)) {
      const ck = this.boeingLocal(BOEING.cockpit).add(new THREE.Vector3(0, 0.8, 0));
      const missing = [!f.boeingBattery && 'batterie', !f.boeingFuel && 'kérosène', !f.boeingCrate && 'caisse en soute', !f.boeingOut && 'repoussage'].filter(Boolean);
      add(ck, 2.2, missing.length ? { prompt: `<span class="warn">Pas prêt : ${missing.join(', ')}</span>` } : { prio: 5, prompt: '<kbd>E</kbd> démarrer les réacteurs et décoller vers Hélios', press: () => this.requestBoeingGo() });
      if (this.isNightish()) add(this.boeingLocal(new THREE.Vector3(0, FLOOR_B + 0.8, 14)), 20, { prompt: '<kbd>E</kbd> s\'installer dans un siège et dormir jusqu\'au matin', press: () => this.requestBoeingSleep() });
    }
  },
  requestBoeingSleep() {
    const out = this.mateList().filter((m) => !m.downed && !this.inBoeing(m.pos));
    if (out.length) { this.ui.toast('Pas encore', `Tout l'équipage doit être dans l'avion (${out.map((m) => m.name).join(', ')} dehors).`, 'bad'); return; }
    if (this.session && !this.session.isHost) { this.session.send('sleepReq', { boeing: 1 }, this.session.hostId); return; }
    this.doSleep();
    this.session?.send('sleep', {});
  },
  requestBoeingGo() {
    this.act('flag', { boeingGo: true });
  },

  // effets des drapeaux du chapitre 3 (sur toutes les machines)
  onFlag3(k, me, by) {
    const ui = this.ui;
    if (k === 'tookOff2') { this.audio.success(); ui.toast('Cap sur Hélios', 'Chapitre 3 : le réservoir est plein, droit vers l\'est.', 'good', 8000); this.radioOnce('c3start', `Vous êtes en l'air ! Cap ${this.bearingTo(this.flight.pos.x, this.flight.pos.z, this.island3.cx, this.island3.cz)}°, droit vers l'est. À mi-chemin, vous survolerez Port-Cendre, l'île au volcan. Ensuite, c'est moi. Surveillez vos moteurs : ils ont beaucoup souffert.`); }
    else if (k === 'fire3') { this.audio.siren(); ui.toast('Moteur droit en feu !', 'Posez-vous à Port-Cendre, vite.', 'bad', 6000); this.radioOnce('c3fire', 'Votre moteur droit fume… c\'est celui qu\'on a remonté sur la plage ! Il ne tiendra pas jusqu\'ici. Posez-vous tout de suite à Port-Cendre, juste sous vous : sur la piste ou sur l\'eau. Il y a une caserne de pompiers à l\'ouest du tarmac.'); }
    else if (k === 'landed3') this.radioOnce('c3land', 'Sortez de là ! Le feu gagne : la caserne est à l\'ouest du tarmac. Camion de pompiers, ou extincteurs si vous êtes à pied.');
    else if (k === 'fireOut') { this.audio.success(); ui.toast('Incendie éteint', 'Le moteur droit est fondu : le Coucou ne revolera pas.', 'good', 7000); this.radioOnce('c3out', 'Le feu est éteint… mais le moteur est fichu. Écoutez : sur le tarmac, le vol HX-404 est resté à sa porte pendant l\'évacuation. S\'il repart, il vous emmène jusqu\'à Hélios. Déchargez la caisse et remettez-le en état.'); }
    else if (k === 'baysOpen') { this.island3.openBays(); this.audio.powerUp?.(); }
    else if (k === 'boeingBattery') { ui.toast('Batterie installée', 'Les feux du Boeing s\'allument.', 'good'); this.radioOnce('c3bat', 'Le tableau de bord s\'allume ! Il lui faut encore du kérosène, la caisse en soute, et sortir de sa porte.'); }
    else if (k === 'boeingFuel') { this.audio.success(); ui.toast('Plein du Boeing', 'Réservoirs à 100 %.', 'good'); }
    else if (k === 'boeingCrate') ui.toast('Caisse Hélios en soute', me ? 'Délicatement… parfait.' : `${this.nameOf(by)} a chargé la caisse.`, 'good');
    else if (k === 'boeingOut') { ui.toast('Repoussage terminé', 'L\'avion est sur le taxiway.', 'good'); }
    else if (k === 'boeingGo') this.startCine3();
    else if (k === 'hangarOpen') this.hangarFxT = 5.2;
  },

  // ── décollage du Boeing (cinématique) ──
  startCine3() {
    if (this.cine3) return;
    if (this.driving) this.exitVehicle(true);
    this.input.unlock();
    const I = this.island3, c = this.c3, Y = FLAT3;
    const N = new THREE.Vector3(c.bp.x, Y, c.bp.z);
    const L = (x, z) => new THREE.Vector3(I.cx + x, Y, I.cz + z);
    const tz = I3.taxi.z, rz = I3.runway.z, rx0 = I3.runway.x0 + 20;
    const taxi = new THREE.CatmullRomCurve3([N, L(N.x - I.cx + 12, Math.max(tz + 14, N.z - I.cz - 18)), L(N.x - I.cx - 10, tz), L(rx0 + 40, tz), L(rx0 + 5, (tz + rz) / 2), L(rx0 + 20, rz), L(rx0 + 60, rz)]);
    this.cine3 = { t: 0, taxi, taxiLen: taxi.getLength(), roll0: L(rx0 + 60, rz), phase: 0, cam: 0 };
    this.cinematic = true;
    this.ui.show('hud', false);
    this.ui.letterbox?.(true);
    this.audio.setEngine(0.5, 0.2);
    this.ui.radio('Ici Marthe… Je vous vois sur le radar de Port-Cendre. Plein gaz, et ne me faites pas peur.', () => this.audio.radio());
  },
  updateCine3(dt) {
    const s = this.cine3, b = this.boeing, cam = this.camera;
    s.t += dt;
    let pos, tan, pitch = 0;
    const TAXI = 16, ROLL = 10, CLIMB = 12;
    if (s.t < TAXI) {
      const u = s.t / TAXI, e = u * u * (3 - 2 * u);
      pos = s.taxi.getPointAt(e); tan = s.taxi.getTangentAt(e);
      this.audio.setEngine(0.45, 0.25);
    } else if (s.t < TAXI + ROLL) {
      const u = (s.t - TAXI) / ROLL;
      pos = s.roll0.clone().add(new THREE.Vector3(1, 0, 0).multiplyScalar(260 * u * u));
      tan = new THREE.Vector3(1, 0, 0);
      pitch = u > 0.85 ? (u - 0.85) * 1.2 : 0;
      this.audio.setEngine(1, 0.9);
    } else {
      const u = Math.min(1, (s.t - TAXI - ROLL) / CLIMB);
      pos = s.roll0.clone().add(new THREE.Vector3(260 + 520 * u, 160 * u * u + 30 * u, 0));
      tan = new THREE.Vector3(1, 0.3, 0);
      pitch = 0.18;
      this.audio.setEngine(1, 1);
    }
    b.root.position.copy(pos);
    b.root.rotation.set(0, Math.atan2(-tan.x, -tan.z), 0, 'YXZ');
    b.root.rotateX(pitch);
    b.engines.forEach((e) => { e.material.opacity = s.t > TAXI ? 0.8 : 0.3; });
    b.strobe.visible = Math.sin(this.t * 8) > 0.5;
    this.trailsB.update(dt, b.root, { active: s.t > TAXI + ROLL * 0.9 });
    // caméra de cinéma : trois plans
    const shot = s.t < TAXI ? 0 : s.t < TAXI + ROLL ? 1 : 2;
    const fw = new THREE.Vector3(-Math.sin(b.root.rotation.y), 0, -Math.cos(b.root.rotation.y));
    if (shot === 0) cam.position.copy(pos).add(new THREE.Vector3(-fw.z * 45 + fw.x * 20, 14, fw.x * 45 + fw.z * 20));
    else if (shot === 1) cam.position.set(s.roll0.x + 170, FLAT3 + 3, s.roll0.z + 60);
    else cam.position.copy(pos).add(new THREE.Vector3(-110, 25, 70));
    cam.lookAt(pos.clone().add(new THREE.Vector3(0, 4, 0)));
    if (s.t > TAXI + ROLL + CLIMB && !s.done) {
      s.done = true;
      this.cinematic = false;
      this.ui.letterbox?.(false);
      if (this.isAuthority()) this.act('flag', { ended: true });
      else this.showEnd();
    }
  },

  // ── objectifs du chapitre 3 ──
  objectives3() {
    const f = this.flags;
    const unloaded = !this.crateLoaded || f.boeingCrate;
    return [
      { id: 'fly3', text: 'Voler vers Hélios, droit vers l\'est', hint: 'Suivez l\'écho du radar. Surveillez les moteurs', done: f.fire3 },
      { id: 'land3', text: 'Se poser à Port-Cendre (moteur en feu !)', hint: 'Sur la piste (roues) ou sur l\'eau près de la rampe, à l\'est', done: f.landed3 },
      { id: 'fire3', text: `Éteindre l'incendie du Coucou${f.fire3 && !f.fireOut ? ` (${Math.round(this.c3?.fire ?? 100)} %)` : ''}`, hint: 'Caserne à l\'ouest du tarmac : bouton des rideaux, camion de pompiers (clic : lance à eau) ou extincteurs', done: f.fireOut },
      { id: 'unload', text: 'Décharger la caisse Hélios du Coucou', hint: 'À la porte cargo, au sec (si le Coucou est sur l\'eau : rampe à l\'est de la piste)', done: unloaded },
      { id: 'battery', text: 'Installer une batterie de démarrage dans le Boeing', hint: 'Au sommet de la tour de contrôle. Escalier effondré : chariot élévateur (dépôt de fret) et une caisse pour faire un pont', done: f.boeingBattery },
      { id: 'bfuel', text: `Faire le plein du Boeing (${Math.round(this.c3?.bfuel || 0)} %)`, hint: 'Camion-citerne : remplissez-le sous le portique du dépôt de kérosène, puis garez-vous sous l\'aile droite', done: f.boeingFuel },
      { id: 'bcrate', text: 'Charger la caisse Hélios en soute', hint: 'Chariot élévateur : déposer la palette à l\'écart (Espace), saisir la caisse fourches nues (Espace), fourches à ~2,5 m, porte de soute arrière', done: f.boeingCrate },
      { id: 'push', text: 'Repousser le Boeing jusqu\'au taxiway', hint: 'Tracteur de repoussage près du terminal : atteler la roue avant (face à l\'avion), puis avancer jusqu\'aux hachures rouges', done: f.boeingOut },
      { id: 'board', text: 'Monter à bord et décoller vers Hélios', hint: 'Camion-escalier contre la porte avant gauche, puis le cockpit', done: f.ended },
    ];
  },
  objectivePoint3(id) {
    const I = this.island3, P = I.points, f = this.flags;
    switch (id) {
      case 'fly3': return new THREE.Vector3(this.island3.cx, 0, this.island3.cz);
      case 'land3': return P.park;
      case 'fire3': return I.baysOpen || f.baysOpen ? this.plane.root.position : P.fireBtn;
      case 'unload': return this.plane.root.position;
      case 'battery': return this.items.battery.state === 'ground' ? this.items.battery.pos : this.boeingLocal(BOEING.hatch);
      case 'bfuel': return (this.c3.truckFuel < 30 ? P.gantry : this.boeingLocal(BOEING.fuel));
      case 'bcrate': return this.items.crate.state === 'ground' ? this.items.crate.pos : this.boeingLocal(BOEING.cargo);
      case 'push': return this.vehicles.tug3 ? new THREE.Vector3(this.vehicles.tug3.x, 0, this.vehicles.tug3.z) : P.apron;
      case 'board': return this.boeingLocal(BOEING.door);
      default: return null;
    }
  },
};
