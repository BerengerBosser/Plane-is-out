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
    // île 4 : sa position dépend de celle de Port-Cendre
    this.buildIsland4();
  },
  // fumerolles et panache du volcan
  c3Smokes() {
    const I = this.island3; if (!I) return;
    I.points.vents.slice(0, 3).forEach((p, i) => this.smoke.add(`vent${i}`, () => p, '#d8d4cc', 1.2, 3.5));
    this.smoke.add('crater', () => I.points.crater, '#6a6260', 3, 1.4);
  },
  defaultC3() {
    const I = this.island3;
    return { fire: 100, truckFuel: 0, bfuel: 0, bp: { x: I.cx + I3.boeing.x, z: I.cz + I3.boeing.z, yaw: I3.boeing.yaw, y: FLAT3 }, hitched: 0, fly: 0 };
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
  chapter3State() { const c = this.c3; return c ? { f: +c.fire.toFixed(1), tf: Math.round(c.truckFuel), bf: Math.round(c.bfuel), bp: [+c.bp.x.toFixed(2), +c.bp.z.toFixed(2), +c.bp.yaw.toFixed(3), +(c.bp.y ?? FLAT3).toFixed(2)], h: c.hitched || 0, fly: c.fly || 0 } : null; },
  // load : reprise d'une sauvegarde (personne n'est aux commandes)
  applyChapter3State(s, full, load) {
    const c = this.c3; if (!c || !s) return;
    c.fire = s.f; c.truckFuel = s.tf; c.bfuel = s.bf; c.hitched = s.h || 0;
    if (this.flags.baysOpen && !this.island3.baysOpen) this.island3.openBays(full);
    const wasFly = c.fly;
    c.fly = load ? 0 : s.fly || 0;
    if (load && this.flags.ended && !this.flags.cured) this.flags.ended = false;   // fin de l'ancienne démo : l'aventure continue
    const towing = this.driving && this.driving.def.tug && c.hitched === this.myId();
    const piloting = c.fly && c.fly === this.myId();
    if (!towing && !piloting && s.bp) { c.bp = { x: s.bp[0], z: s.bp[1], yaw: s.bp[2], y: s.bp[3] ?? FLAT3 }; if (!c.fly) this.poseBoeing(); }
    if (wasFly && !c.fly) this.poseBoeing();
  },
  applyChapter3Act(type, d, by, auth) {
    const c = this.c3; if (!c) return null;
    switch (type) {
      case 'douse': { if (this.flags.fireOut) return true; c.fire = Math.max(0, c.fire - d.n); if (c.fire <= 0 && this.isAuthority()) this.act('flag', { fireOut: true }); this.dirtyWorld = true; return true; }
      case 'tfuel': { c.truckFuel = clamp(d.v, 0, 100); this.dirtyWorld = true; return true; }
      case 'bfuel': { c.bfuel = clamp(d.v, 0, 100); c.truckFuel = clamp(d.t ?? c.truckFuel, 0, 100); if (c.bfuel >= 100 && !this.flags.boeingFuel && this.isAuthority()) this.act('flag', { boeingFuel: true }); this.dirtyWorld = true; return true; }
      case 'hitch': {
        if (d.on) { if (auth && c.hitched && c.hitched !== by) return false; c.hitched = by; }
        else { c.hitched = 0; if (d.bp) { c.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2], y: FLAT3 }; this.poseBoeing(); } }
        this.dirtyWorld = true; return true;
      }
      case 'bpos': { if (by !== this.myId()) { c.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2], y: FLAT3 }; this.poseBoeing(); } if (this.isAuthority() && !this.flags.boeingOut && this.boeingOutZone()) this.act('flag', { boeingOut: true }); this.dirtyWorld = true; return true; }
      case 'unloadCrate': {
        if (!this.crateLoaded) return auth ? false : true;
        this.crateLoaded = false; this.plane.crateAboard.visible = false;
        this.placeItem(this.items.crate, d.x, d.z, d.r || 0);
        this.afterChange(); return true;
      }
      case 'boeingCrate': { const it = this.items.crate; it.state = 'installed'; it.onVehicle = null; it.mesh.visible = false; for (const v of Object.values(this.vehicles)) if (v.cargo === 'crate') v.cargo = null; this.flags.crateOut = false; this.flags.crateAtLab = false; if (this.isAuthority()) this.act('flag', { boeingCrate: true }); this.afterChange(); return true; }
      case 'battery': { const it = this.items.battery; it.state = 'installed'; it.mesh.visible = false; if (this.carrying === it) this.carrying = null; if (this.isAuthority()) this.act('flag', { boeingBattery: true }); return true; }
      default: return null;
    }
  },

  // ── avion de ligne : pose, colliders, porte ──
  poseBoeing() {
    const b = this.boeing, c = this.c3; if (!b || !c || c.fly) return;
    b.root.position.set(c.bp.x, c.bp.y ?? FLAT3, c.bp.z);
    b.root.rotation.set(0, c.bp.yaw, 0);
    b.root.updateMatrixWorld(true);
    this.boeingDirty = true;
  },
  boeingLocal(v) { this.boeing.root.updateMatrixWorld(true); return this.boeing.root.localToWorld(v.clone()); },
  boeingOutZone() { const I = this.island3; return this.c3.bp.z - I.cz < 101; },
  stairsDocked() {
    const v = this.vehicles.stairs3; if (!v || !this.boeing || this.c3?.fly) return false;
    const land = this.vehicleWorld(v, new THREE.Vector3(0.25, 4.4, -3.2)), door = this.boeingLocal(BOEING.door);
    return Math.hypot(land.x - door.x, land.z - door.z) < 1.9 && Math.abs(v.speed) < 0.5 && Math.abs(land.y - door.y) < 1.5;
  },
  // dans la cabine (repère de l'avion, qu'il soit garé ou en vol)
  inBoeing(p = this.playerWorld()) {
    if (!this.boeing) return false;
    this.boeing.root.updateMatrixWorld(true);
    const l = this.boeing.root.worldToLocal(p.clone()), B = BOEING.cabin;
    return l.y > FLOOR_B - 0.6 && l.y < FLOOR_B + 4 && l.x > B.minX - 0.4 && l.x < B.maxX + 0.4 && l.z > B.minZ && l.z < B.maxZ;
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
    // le Boeing voyage : visible dès qu'il est à portée de vue
    b.root.visible = this.chapter() >= 3 ? b.root.position.distanceTo(this.camera.position) < 2200 : I.group.visible;
    if (I.group.visible) { I.setNight(this.brumeNow || 0); I.update(this.t, dt); }
    // porte, toboggan, soute, colliders (garé) ou rien (en vol)
    this.updateBoeingState(dt);
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
    if (tug && tug.def.tug && c.hitched === this.myId() && !c.fly) {
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
    if (this.inBoeing(me) && !this.c3.fly) {
      const ck = this.boeingLocal(BOEING.cockpit).add(new THREE.Vector3(0, 1.2, 0));
      const missing = [!f.boeingBattery && 'batterie', !f.boeingFuel && 'kérosène', !f.boeingCrate && !f.bAir && 'caisse en soute', !f.boeingOut && 'repoussage'].filter(Boolean);
      add(ck, 2.4, missing.length ? { prompt: `<span class="warn">Pas prêt : ${missing.join(', ')}</span>` } : { prio: 5, prompt: `<kbd>E</kbd> prendre les commandes${f.bAir ? '' : ' et décoller vers Hélios'}`, press: () => this.requestBoeingFly() });
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
  // prendre les commandes : tout l'équipage doit être à bord (il sera assis pour le vol)
  requestBoeingFly() {
    if (this.c3.fly) return;
    const out = this.mateList().filter((m) => !m.downed && !this.inBoeing(m.pos));
    if (out.length) { this.audio.error(); this.ui.toast('Pas tout le monde à bord', `Il manque : ${out.map((m) => m.name).join(', ')}. On ne laisse personne derrière.`, 'bad', 4000); return; }
    if (this.act('bfly', { on: 1 }) === false) { this.ui.toast('Siège occupé', 'Quelqu\'un pilote déjà.', 'bad', 1800); return; }
    if (!this.said.has('bpilotTip')) { this.said.add('bpilotTip'); this.ui.toast('Aux commandes du HX-404', 'Roulez jusqu\'à la piste (<kbd>Z</kbd> gaz, <kbd>Q</kbd>/<kbd>D</kbd> palonnier), puis plein gaz et tirez sur le manche à 115 km/h.', 'good', 8000); }
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
    else if (k === 'boeingGo') { /* ancienne cinématique de fin : on pilote désormais le Boeing */ }
    else if (k === 'hangarOpen') this.hangarFxT = 5.2;
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
      { id: 'board', text: 'Embarquer tout l\'équipage et décoller : vous pilotez !', hint: 'Camion-escalier contre la porte avant gauche, puis le poste de pilotage (tout le monde à bord)', done: f.bAir },
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
