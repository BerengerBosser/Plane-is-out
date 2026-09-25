// Chapitre 4 — Hélios. On pilote le vol HX-404 de Port-Cendre jusqu'à Hélios (l'équipage est assis à bord),
// puis on livre la caisse au laboratoire de Marthe à travers la ville :
//  1. se poser à l'aéroport Soleil-Levant, déployer le toboggan, sortir la caisse de la soute (à plusieurs, c'est plus rapide) ;
//  2. baisser le pont-levis du canal : deux manivelles à tourner ensemble (en solo : l'une après l'autre, par petits bouts) ;
//  3. ouvrir le barrage sanitaire : le clavier affiche des symboles, le code est sur le panneau de la gare routière ;
//  4. amener la caisse au chariot élévateur jusqu'au sas de l'Institut, puis tenir pendant la décontamination (la sirène réveille la ville) ;
//  5. régler les trois consoles du synthétiseur dans le temps imparti (une chacun, à plusieurs).
import * as THREE from 'three';
import { Flight } from './flight.js';
import { createIsland4, I4, FLAT4 } from './island4.js';
import { setIsland4, heightAt } from './terrain.js';
import { BOEING, BSEATS, FLOOR_B, FLOOR_C, animateBoeing, boeingColliders, boeingPlatform } from './boeing.js';
import { buildDuck } from './fun.js';
import { FLAT3, I3 } from './island3.js';
import { makePipes } from './interact.js';
import { buildAvatar } from './avatars.js';
import { CFG } from './config.js';
import { clamp } from './noise.js';

// réglages de vol du long-courrier (le Coucou garde les siens)
const BCFG = { maxThrust: 16, airDrag: 0.0032, groundDrag: 0.006, waterDrag: 0.03, waterFriction: 1, takeoffSpeed: 32, stallSpeed: 24, pitchRate: 0.6, rollRate: 0.95, rudderRate: 0.25, bankTurn: 0.6, maxPitch: 0.45, maxRoll: 0.85, worldLimit: 9000, fuelPerSecond: 0.01, gentleMax: 55, sinkMax: 9, landClamp: 36, effSpeed: 40 };
const SURF = ['water', 'ground', 'air'];
const DECON_TIME = 75;
const DECON_WAVES = [1, 16, 32, 48, 62];
const NO_INPUT = { down: () => false, hit: () => false, mdx: 0, mdy: 0 };

export const Chapter4Mixin = {
  // ── construction (après l'île 3 : sa position en dépend) ──
  buildIsland4() {
    if (this.island4) {
      this.island4.dispose();
      this.island4.colliders.forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); });
    }
    const I = this.island4 = createIsland4(this.scene, this.seed, this.island3);
    setIsland4({ cx: I.cx, cz: I.cz, R2: I.R2, height: I.height });
    this.colliders.push(...I.colliders);
    this.platforms.push(...I.platforms);
    this.ladders = (this.ladders || []).filter((l) => !l.i4).concat(I.ladders);
    for (const [id, p] of Object.entries(I4.vehicles)) this.addVehicle(`${id}4`, id, I.cx + p.x, I.cz + p.z, p.yaw);
    // canards d'Hélios
    for (const d of I.points.ducks) {
      if (this.duckSpots.some((q) => q.id === d.id)) continue;
      this.duckSpots.push(d);
      const mk = this.duckMeshes[d.id] || (() => { const q = buildDuck(); q.visible = false; this.scene.add(q); return q; })();
      this.duckMeshes[d.id] = mk;
    }
    // Marthe, derrière la vitre de la salle blanche
    if (this.marthe) this.scene.remove(this.marthe.root);
    this.marthe = buildAvatar('Marthe', '#5ef2c2', 0, 1, '');
    this.marthe.root.position.copy(I.marthePos);
    this.marthe.root.rotation.y = Math.PI;
    this.scene.add(this.marthe.root);
    // vol du Boeing : même modèle que le Coucou, réglé pour un long-courrier ; pivot sur le train principal
    const f = this.bf = new Flight({ root: this.boeing.root, spinners: [] }, this.camera, { cfg: BCFG, wheelDrop: 0 });
    f.wheels = true; f.fuel = 100; f.tankMax = 100;
    f.apply = function apply() {
      const r = this.plane.root;
      r.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
      r.position.copy(this.pos).sub(BOEING.pivot.clone().applyEuler(r.rotation));
      r.updateMatrixWorld(true);
    };
    f.hitTest = () => this.bHitTest();
    this.bcam = new THREE.Vector3();
    this.c4 = this.defaultC4();
  },
  defaultC4() { return { crank: [0, 0], deconOn: 0, decon: 0, synthLeft: 0 }; },
  resetC4() {
    this.c4 = this.defaultC4();
    this.bseat = null;
    const I = this.island4; if (!I) return;
    I.setBridge(0, true); I.setGate(false, true); I.setLabDoor(false, true); I.setDecon(0); I.setSynth(0, false); I.setCrateIn(false);
    ['A', 'B', 'C'].forEach((k) => I.setConsole(k, false));
    this.platforms = this.platforms.filter((p) => p !== I.bridgePlat);
  },
  island4Interiors() {
    const I = this.island4; if (!I) return [];
    const A = (x, z, w, d, maxY, kind) => ({ minX: I.cx + x - w / 2, maxX: I.cx + x + w / 2, minZ: I.cz + z - d / 2, maxZ: I.cz + z + d / 2, maxY, kind });
    const T = I4.terminal, F = I4.fret, L = I4.lab;
    return [A(T.x, T.z, T.w, T.d, FLAT4 + T.h, 'hall'), A(F.x, F.z, F.w, F.d, FLAT4 + F.h, 'hall'), A(0, (L.z0 + L.z1) / 2, L.x1 - L.x0, L.z1 - L.z0, FLAT4 + L.h, 'room')];
  },

  // ── état partagé ──
  c4State() { const c = this.c4; return c ? { k: c.crank.map((v) => +v.toFixed(3)), on: c.deconOn, d: +c.decon.toFixed(1), sl: +c.synthLeft.toFixed(1) } : null; },
  applyC4State(s) {
    const c = this.c4; if (!c || !s) return;
    const mine = this._crankMine;
    c.crank = (s.k || [0, 0]).map((v, i) => (i === mine && this.t - (this._crankT || -9) < 1 ? Math.max(v, c.crank[i]) : v));
    c.deconOn = s.on || 0; c.decon = s.d || 0; c.synthLeft = s.sl || 0;
  },
  applyChapter4Act(type, d, by, auth) {
    const c = this.c4, c3 = this.c3, f = this.flags;
    if (!c || !c3) return null;
    const me = by === this.myId();
    switch (type) {
      case 'bfly': {
        if (d.take) { c3.fly = by; if (me) { if (this.bseat) this.bseat.pilot = true; else this.enterBSeat(true); this.bseat.i = 0; this.ui.toast('Vous prenez les commandes', 'Le pilote a quitté l\'équipage.', 'bad', 4000); } this.dirtyWorld = true; return true; }
        if (d.on) {
          if (auth && c3.fly && c3.fly !== by && (!this.session || this.session.players.has(c3.fly) || c3.fly === this.session.me)) return false;
          c3.fly = by;
          this.boeingCols = []; this.platforms = this.platforms.filter((p) => !p.boeing);
          if (me) { this.enterBSeat(true); this.bfStartFromParked(); }
          else this.enterBSeat(false);
          this.audio.setEngine(0.3, 0.2);
        } else {
          if (c3.fly && c3.fly !== by && auth) return false;
          c3.fly = 0;
          if (d.bp) c3.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2], y: d.bp[3] ?? FLAT3 };
          this.poseBoeing();
          if (this.bseat) this.leaveBSeat();
          this.audio.setEngine(0, 0);
        }
        this.dirtyWorld = true;
        return true;
      }
      case 'bunload': {
        if (!f.boeingCrate || f.crateOut) return auth ? false : true;
        f.crateOut = true;
        const it = this.items.crate;
        this.placeItem(it, d.x, d.z, d.r || 0);
        this.crateSafe = { x: d.x, z: d.z };
        this.audio.success();
        this.ui.toast('Caisse Hélios au sol', me ? 'Il faut un chariot élévateur : hangar de fret.' : `${this.nameOf(by)} a vidé la soute.`, 'good');
        this.radioOnce('c4crate', 'La caisse est sortie ! Un chariot élévateur vous attend au hangar de fret, à l\'est de l\'aérogare. Le labo est de l\'autre côté du canal : le pont du Soleil est levé. Deux manivelles, de part et d\'autre de la chaussée : tournez-les ensemble, sinon le tablier se met de travers.');
        this.afterChange();
        return true;
      }
      case 'crank': {
        if (f.bridge4) return true;
        c.crank[d.i] = clamp(Math.max(c.crank[d.i], d.v), 0, 1);
        if (auth && c.crank[0] >= 1 && c.crank[1] >= 1 && !f.bridge4) setTimeout(() => this.act('flag', { bridge4: true }), 0);
        this.dirtyWorld = true;
        return true;
      }
      case 'decon': {
        if (!f.crateAtLab || f.decon4 || c.deconOn) return auth ? false : true;
        c.deconOn = 1; c.decon = 0; this._deconWave = 0;
        this.audio.siren();
        this.ui.toast('Décontamination lancée', 'La sirène réveille le quartier : tenez la place !', 'bad', 6000);
        this.radioOnce('c4decon', 'Le cycle démarre… et la sirène aussi. Tout le quartier va l\'entendre. Restez près du sas : s\'il n\'y a plus personne pour surveiller, le cycle se met en pause.');
        this.dirtyWorld = true;
        return true;
      }
      case 'labCrate': {
        const it = this.items.crate;
        if (this.carrying === it) this.carrying = null;
        for (const v of Object.values(this.vehicles)) if (v.cargo === 'crate') { v.cargo = null; it.onVehicle = null; }
        it.state = 'installed'; it.carrier = null; it.mesh.visible = false;
        this.flags.labCrate = true;
        this.afterChange();
        return true;
      }
      case 'synth': {
        const k = `synth${d.k}`;
        if (f[k] || !f.decon4) return auth ? false : true;
        f[k] = true;
        if (!c.synthLeft) c.synthLeft = this.playerCount() > 1 ? 100 : 170;
        this.audio.powerUp();
        const n = ['A', 'B', 'C'].filter((q) => f[`synth${q}`]).length;
        this.ui.toast(`Console ${d.k} réglée`, `${n}/3${me ? '' : ` · par ${this.nameOf(by)}`}${n < 3 ? ` · il reste ${Math.round(c.synthLeft)} s` : ''}`, 'good');
        if (auth && n === 3) setTimeout(() => this.act('flag', { cured: true, ended: true }), 0);
        this.afterChange();
        return true;
      }
      case 'synthReset': {
        f.synthA = false; f.synthB = false; f.synthC = false; c.synthLeft = 0;
        this.synthTries = (this.synthTries || 0) + 1;
        this.audio.error();
        this.ui.toast('Synthèse ratée', 'Les trois réglages doivent être faits dans le temps imparti. On recommence !', 'bad', 5000);
        this.afterChange();
        return true;
      }
      default: return null;
    }
  },

  // ── à bord pendant le vol ──
  enterBSeat(pilot) {
    if (this.driving) this.exitVehicle(true);
    if (this.riding) this.exitPassenger(true);
    if (this.carrying) this.dropCarried();
    if (this.nozzle === this.myId()) this.act('nozzle', { on: false });
    this.stopFishing?.();
    if (this.downed) { this.downed = false; this.hp = Math.max(this.hp, 45); this.ui.downed(false); }
    this.seat = null; this.lying = false; this.aboard = false; this.hoist = null; this.chute = false; this.fallVel = null;
    const i = pilot ? 0 : 1 + (this.mpIndex() % (BSEATS.length - 1));
    this.bseat = { i, pilot, view: pilot ? 'chase' : 'seat' };
    const s = BSEATS[i];
    this.player.pos.set(s.x, s.y, s.z); this.player.yaw = 0; this.player.pitch = 0; this.player.velY = 0;
    this.ui.el.hud.dataset.mode = 'flight';
    this.ui.prompt(''); this.ui.carry(''); this.ui.hold(0);
    this.flashKeys();
    if (!pilot) this.ui.toast('Embarquement', 'Attachez vos ceintures. <kbd>C</kbd> : changer de vue.', 'good', 3500);
  },
  leaveBSeat() {
    const S = this.bseat; if (!S) return;
    const s = BSEATS[S.i];
    this.bseat = null;
    this.poseBoeing();
    const front = S.i < 2;
    const w = this.boeingLocal(front ? new THREE.Vector3(s.x * 0.4, FLOOR_C, -0.95) : new THREE.Vector3(0, FLOOR_B, s.z + 0.6));
    this.player.pos.copy(w);
    this.player.pos.y = (this.c3.bp.y ?? FLAT3) + (front ? FLOOR_C : FLOOR_B);
    this.player.yaw = this.c3.bp.yaw; this.player.pitch = 0; this.player.velY = 0; this.player.onGround = true;
    this.ui.el.hud.dataset.mode = 'explore';
    this.ui.flight(false);
    this.camera.fov = +document.getElementById('optFov').value || 72; this.camera.updateProjectionMatrix();
  },
  // le pilote prend l'avion là où il est garé
  bfStartFromParked() {
    const f = this.bf, piv = this.boeingLocal(BOEING.pivot);
    f.fuel = 100; f.wheels = true;
    f.reset(piv.x, piv.z, this.c3.bp.yaw);
    f.surface = 'ground';
    f.pos.y = heightAt(piv.x, piv.z);
    f.cockpitView = false;
    f.apply();
    this.bcam.copy(this.boeingLocal(new THREE.Vector3(0, 22, 90)));
  },
  // collisions en vol ou au roulage : immeubles d'Hélios (ailes, nez, dérive, moteurs)
  bHitTest() {
    const I = this.island4, r = this.boeing.root;
    if (!I || Math.hypot(r.position.x - I.cx, r.position.z - I.cz) > 650) return false;
    if (!this._bpts) this._bpts = [[0, 4, -6], [0, 4, 10], [0, 4, 30], [0, 6, 50], [-26, 5, 33], [26, 5, 33], [-10.5, 1.2, 19], [10.5, 1.2, 19], [0, 15, 52]].map((a) => new THREE.Vector3(...a));
    const pts = this._bpts.map((v) => r.localToWorld(v.clone()));
    for (const b of I.bld) for (const p of pts) if (p.y < b.top && p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) return true;
    return false;
  },
  // crash évité : l'avion est replacé (approche d'Hélios, ou piste de Port-Cendre)
  bCrash(why) {
    if ((this._bCrashT || 0) > this.t) return;
    this._bCrashT = this.t + 2;
    const f = this.bf, I4w = this.island4, I3w = this.island3;
    const d4 = Math.hypot(f.pos.x - I4w.cx, f.pos.z - I4w.cz), d3 = Math.hypot(f.pos.x - I3w.cx, f.pos.z - I3w.cz);
    this.ui.fade(1, '#000', 120); setTimeout(() => this.ui.fade(0, '#000', 900), 450);
    this.audio.thud(); this.player.shake = 1;
    if (d4 < d3) {
      const side = f.pos.x - I4w.cx > 0 ? 1 : -1, RW = I4.runway;
      f.reset(I4w.cx + side * (RW.x1 + 750), I4w.cz + RW.z, side * Math.PI / 2);
      f.surface = 'air'; f.pos.y = 85; f.speed = 46; f.throttle = 0.4; f.pitch = 0; f.roll = 0;
      this.ui.toast('Remise des gaz !', 'L\'avion est replacé en approche, dans l\'axe de la piste.', 'bad', 5000);
      this.ui.radio(why === 'water' ? 'Pas dans l\'eau ! On oublie ça. Reprenez l\'approche : piste est-ouest, au sud du canal.' : 'Trop brutal ! On respire… et on recommence l\'approche. Doucement sur le manche, gaz réduits.', () => this.audio.radio());
    } else {
      const R3 = I3.runway;
      f.reset(I3w.cx + R3.x0 + 25, I3w.cz + R3.z, -Math.PI / 2);
      f.surface = 'ground'; f.pos.y = heightAt(f.pos.x, f.pos.z);
      this.ui.toast('Retour en bout de piste', 'Port-Cendre : on recommence le décollage.', 'bad', 4500);
    }
    f.apply();
  },

  // ── image par image, assis dans le Boeing ──
  updateBSeat(dt, blocked) {
    const inp = this.input, ui = this.ui, f = this.bf, S = this.bseat, b = this.boeing, r = b.root;
    const pilot = S.pilot && this.c3.fly === this.myId();
    ui.show('carnet', inp.down('Tab') && !this.chatting);
    ui.el.hud.dataset.mode = 'flight';
    ui.veil(0);
    if (pilot) {
      const ev = f.update(dt, blocked ? NO_INPUT : inp, !blocked);
      for (const e of ev) {
        if (e === 'takeoff') {
          this.audio.whoosh();
          if (!this.flags.bAir) this.act('flag', { bAir: true });
        } else if (e === 'landed_ground') { ui.toast('Toucher !', 'Freinez : <kbd>Espace</kbd>. À l\'arrêt, <kbd>E</kbd> pour couper les réacteurs.', 'good', 4000); this.audio.thud(); }
        else if (e === 'landed' || e === 'on_water') { this.bCrash('water'); return; }
        else if (e === 'crash') { this.bCrash(); return; }
        else if (e === 'bump') { this.audio.clank(); ui.toast('Choc', 'Un bâtiment ! Reculez l\'avion (rudder) et contournez.', 'bad', 1800); }
        else if (e === 'ap_on') ui.toast('Pilote automatique', 'Cap et altitude tenus. <kbd>P</kbd> pour reprendre la main.', 'good', 2500);
      }
      if (f.surface === 'water') { this.bCrash('water'); return; }
      const I = this.island4;
      if (!this.flags.landed4 && f.surface === 'ground' && f.speed < 2 && Math.hypot(f.pos.x - I.cx, f.pos.z - I.cz) < 450) this.act('flag', { landed4: true });
      this.audio.setEngine(0.4 + f.throttle * 0.6, f.throttle * 0.8 + Math.min(f.speed / 70, 1) * 0.3);
      this.audio.setWind(clamp(f.speed / 70, 0.04, 0.22), 0.8);
      if (inp.hit('KeyE') && !blocked) {
        if (f.airborne) { ui.toast('En plein vol', 'Posez-vous d\'abord, puis arrêtez l\'avion.', 'bad', 2000); this.audio.error(); }
        else if (f.speed > 1.5) { ui.toast('Trop vite', 'Freinez (<kbd>Espace</kbd>) jusqu\'à l\'arrêt.', 'bad', 1800); this.audio.error(); }
        else {
          const p = r.position;
          this.act('bfly', { on: 0, bp: [+p.x.toFixed(2), +p.z.toFixed(2), +f.yaw.toFixed(3), +heightAt(p.x, p.z).toFixed(2)] });
          return;
        }
      }
      // caméra : poursuite (loin derrière, l'avion fait 55 m) ou poste de pilotage vitré
      if (f.cockpitView) {
        this.camera.position.copy(r.localToWorld(new THREE.Vector3(-0.55, FLOOR_C + 1.28, -2.15)));
        this.camera.quaternion.copy(r.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)));
      } else {
        const tgt = r.localToWorld(new THREE.Vector3(0, 6, 22));
        const flat = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
        const want = tgt.clone().addScaledVector(flat, -64).add(new THREE.Vector3(0, 17 - Math.sin(f.pitch) * 30, 0));
        want.y = Math.max(want.y, Math.max(heightAt(want.x, want.z), 0) + 3);
        if (this.bcam.distanceTo(want) > 200) this.bcam.copy(want); else this.bcam.lerp(want, 1 - Math.exp(-3.5 * dt));
        this.camera.position.copy(this.bcam);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(tgt.addScaledVector(f.forward(), 30));
      }
      this.tipKeys('bpilot', document.getElementById('optHints').checked ? '<kbd>Z</kbd>/<kbd>S</kbd> gaz · <kbd>Q</kbd>/<kbd>D</kbd> palonnier · <kbd>Espace</kbd> frein au sol<br>Souris ou flèches : manche (tirer à 115 km/h pour décoller)<br><kbd>C</kbd> vue cockpit · <kbd>P</kbd> pilote auto · <kbd>E</kbd> à l\'arrêt : couper les réacteurs' : '');
    } else {
      // passager : regard libre, vue du siège, du poste ou de l'extérieur
      if (!blocked) {
        this.player.yaw -= inp.mdx * CFG.player.mouseSensitivity * this.player.sens;
        this.player.pitch = clamp(this.player.pitch - inp.mdy * CFG.player.mouseSensitivity * this.player.sens, -1.2, 1.2);
        if (inp.hit('KeyC')) { S.view = S.view === 'seat' ? 'cockpit' : S.view === 'cockpit' ? 'outside' : 'seat'; this.flashKeys(); }
        if (inp.hit('KeyE')) ui.toast('Restez assis', 'Le pilote coupe les réacteurs à l\'arrêt : vous pourrez alors vous lever.', '', 2200);
      }
      const s = BSEATS[S.i];
      if (S.view === 'seat') { this.player.pos.set(s.x, s.y, s.z); this.player.applyCamera(dt, false, r, S.i < 2 ? 1.28 : 1.2); }
      else if (S.view === 'cockpit') {
        this.camera.position.copy(r.localToWorld(new THREE.Vector3(0, FLOOR_C + 1.55, -0.6)));
        this.camera.quaternion.copy(r.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.player.pitch - 0.1, this.player.yaw, 0, 'YXZ')));
      } else {
        const tgt = r.localToWorld(new THREE.Vector3(0, 6, 22)), a = this.player.yaw + this.bf.yaw, pt = clamp(0.25 - this.player.pitch * 0.6, -0.2, 1.2);
        this.camera.position.set(tgt.x + Math.sin(a) * Math.cos(pt) * 70, tgt.y + Math.sin(pt) * 70, tgt.z + Math.cos(a) * Math.cos(pt) * 70);
        this.camera.position.y = Math.max(this.camera.position.y, Math.max(heightAt(this.camera.position.x, this.camera.position.z), 0) + 2);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(tgt);
      }
      this.player.pos.set(s.x, s.y, s.z);
      this.tipKeys(`bpax:${S.view}`, `Souris : regarder · <kbd>C</kbd> vue (${S.view === 'seat' ? 'siège' : S.view === 'cockpit' ? 'poste de pilotage' : 'extérieur'}) · <kbd>Tab</kbd> carnet`);
      this.audio.setEngine(0.3 + f.throttle * 0.4, f.throttle * 0.6);
    }
    // cadrans
    const I = this.island4, dist = Math.hypot(f.pos.x - I.cx, f.pos.z - I.cz);
    let state = f.airborne ? (f.speed < BCFG.stallSpeed ? 'Décrochage ! Piquez du nez' : f.autopilot ? 'Pilote automatique' : 'En vol · HX-404') : f.braking ? 'Freinage' : f.speed >= BCFG.takeoffSpeed ? 'Vitesse de décollage : tirez !' : 'Au sol · roulage';
    if (f.airborne && dist < 1300) state = `Approche d'Hélios · ${Math.round(dist)} m`;
    ui.flight(true, { speed: f.speed, alt: f.surface === 'ground' ? 0 : f.pos.y - Math.max(heightAt(f.pos.x, f.pos.z), 0), throttle: f.throttle, fuel: f.fuel, state, hull: 100 });
    ui.compass(this.flags.compass, f.yaw);
    if (f.airborne && dist < 1500) this.radioOnce('c4approach', 'Je vous vois ! Enfin, je vois votre feu clignotant. La piste de Soleil-Levant est au sud de l\'île, orientée est-ouest. Réduisez les gaz, alignez-vous, descendez doucement : moins de 190 km/h au toucher. Et évitez la Tour Hélios, s\'il vous plaît.');
    this.trailsB.update(dt, r, { active: f.airborne && f.speed > 45 });
  },
  // Boeing simulé par un autre joueur : on suit sa présence
  updateBoeingMirror(dt) {
    const s = this.session, c3 = this.c3;
    if (!s || !c3?.fly || c3.fly === s.me || !this.bf) return;
    const a = s.players.get(c3.fly)?.s?.bf;
    if (!a) return;
    const f = this.bf, [x, y, z, yaw, pitch, roll, speed, thr, surf] = a;
    const k = Math.min(1, dt * 10), p = new THREE.Vector3(x, y, z);
    if (f.pos.distanceTo(p) > 40) f.pos.copy(p); else f.pos.lerp(p, k);
    const ang = (q, t) => q + Math.atan2(Math.sin(t - q), Math.cos(t - q)) * k;
    f.yaw = ang(f.yaw, yaw); f.pitch = ang(f.pitch, pitch); f.roll = ang(f.roll, roll);
    f.speed = speed; f.throttle = thr; f.surface = SURF[surf] || 'ground';
    f.apply();
  },
  bPresence() {
    const f = this.bf;
    return this.c3?.fly === this.myId() && this.bseat ? [f.pos.x, f.pos.y, f.pos.z, f.yaw, f.pitch, f.roll, f.speed, f.throttle].map((v) => +v.toFixed(3)).concat([SURF.indexOf(f.surface)]) : 0;
  },
  // le pilote a quitté la partie en plein vol : l'hôte reprend les commandes
  bPilotLost(id) {
    if (!this.session?.isHost || this.c3?.fly !== id) return;
    this.act('bfly', { take: 1 });
  },
  // position de sauvegarde : dans la cabine, à la dernière place de parking
  bSavePos() {
    const c = this.c3, co = Math.cos(c.bp.yaw), sn = Math.sin(c.bp.yaw);
    return { x: c.bp.x + 14 * sn, z: c.bp.z + 14 * co, y: (c.bp.y ?? FLAT3) + FLOOR_B, yaw: c.bp.yaw };
  },

  // ── Boeing garé : porte, toboggan, soute, colliders ──
  updateBoeingState(dt) {
    const b = this.boeing, c = this.c3, f = this.flags;
    const flying = !!c.fly;
    const docked = !flying && this.stairsDocked();
    const slideOpen = !flying && !!f.slide;
    const doorOpen = docked || slideOpen;
    b.doorPivot.rotation.y += ((doorOpen ? -1.7 : 0) - b.doorPivot.rotation.y) * Math.min(1, dt * 3);
    b.slide.visible = slideOpen && b.doorPivot.rotation.y < -1.2;
    const cargoOpen = !flying && (f.boeingFuel && !f.bAir || this.vehicles.fork3?.cargo === 'crate' || this._unloadT > this.t);
    b.cargoPivot.rotation.z += ((cargoOpen ? 0.9 : 0) - b.cargoPivot.rotation.z) * Math.min(1, dt * 2);
    b.strobe.visible = (f.boeingBattery || flying) && Math.sin(this.t * 6) > 0.6;
    b.cabinLight.intensity = flying ? 6 : f.boeingBattery ? 8 : 2;
    b.engines.forEach((e) => { e.material.opacity = flying ? 0.25 + this.bf.throttle * 0.6 : 0; });
    if (flying) {
      if (this.boeingCols?.length) { this.boeingCols = []; this.platforms = this.platforms.filter((p) => !p.boeing); }
      this._bKey = null;
    } else {
      const key = `${doorOpen}|${slideOpen}`;
      if (key !== this._bKey || this.boeingDirty) {
        this._bKey = key; this.boeingDirty = false;
        const pose = { x: c.bp.x, z: c.bp.z, y: c.bp.y ?? FLAT3, yaw: c.bp.yaw };
        this.boeingCols = boeingColliders(pose, { door: doorOpen });
        this.platforms = this.platforms.filter((p) => !p.boeing).concat(boeingPlatform(pose, { slide: slideOpen }));
      }
    }
    // écrans, manches et hublots : seulement quand quelqu'un regarde
    const inside = !!this.bseat || this.inBoeing();
    if (inside || flying) {
      const I = this.island4, p = this.bf.pos;
      const tgt = Math.atan2(I.cx - p.x, -(I.cz - p.z)) * 180 / Math.PI;
      animateBoeing(b, {
        night: this.brumeNow || 0, visible: inside, power: f.boeingBattery, roll: this.bf.roll, pitch: this.bf.pitch, throttle: flying ? this.bf.throttle : 0,
        speed: flying ? this.bf.speed : 0, alt: flying && this.bf.airborne ? this.bf.pos.y : 0, heading: ((((-this.bf.yaw) * 180 / Math.PI) % 360) + 360) % 360,
        target: (tgt + 360) % 360, dist: Math.hypot(I.cx - p.x, I.cz - p.z), onGround: !this.bf.airborne, dest: 'HÉLIOS',
      }, dt);
    }
  },

  // ── image par image (toutes les machines) ──
  updateChapter4(dt) {
    const I = this.island4; if (!I || !this.c4) return;
    const f = this.flags, c = this.c4, me = this.playerWorld();
    const near = Math.hypot(me.x - I.cx, me.z - I.cz) < 1600 || (this.bf && Math.hypot(this.bf.pos.x - I.cx, this.bf.pos.z - I.cz) < 1600);
    I.group.visible = near || this.chapter() === 4;
    // sièges du vol : tout le monde est à bord pendant que le Boeing vole
    if (this.c3?.fly && !this.bseat && this.mode === 'explore' && (!this.session || this.gotWorld || this.isAuthority())) this.enterBSeat(this.c3.fly === this.myId());
    else if (!this.c3?.fly && this.bseat) this.leaveBSeat();
    if (!I.group.visible) return;
    I.setNight(this.brumeNow || 0);
    I.update(this.t, dt);
    I.setBridge(f.bridge4 ? 1 : Math.min(c.crank[0], c.crank[1]));
    I.setCranks(f.bridge4 ? 1 : c.crank[0], f.bridge4 ? 1 : c.crank[1]);
    // le pont baissé devient une chaussée (piétons et véhicules)
    const has = this.platforms.includes(I.bridgePlat);
    if (I.bridgeDown && !has) this.platforms.push(I.bridgePlat);
    else if (!I.bridgeDown && has) this.platforms = this.platforms.filter((p) => p !== I.bridgePlat);
    I.setGate(!!f.gate4);
    I.setLabDoor(!!f.decon4);
    I.setDecon(c.deconOn ? 1 : 0);
    const n = ['A', 'B', 'C'].filter((k) => f[`synth${k}`]).length;
    I.setSynth(n, !!f.cured);
    ['A', 'B', 'C'].forEach((k) => I.setConsole(k, !!f[`synth${k}`]));
    I.setCrateIn(!!f.labCrate);
    // Marthe
    const md = this.marthe.root.position.distanceTo(this.camera.position);
    if (md < 90) { this.marthe.near(md); this.marthe.animate(dt, { wave: md < 25 && !f.cured ? Math.sin(this.t * 0.5) > 0.3 : !!f.cured, moving: false }); }
    // brume de décontamination
    if (c.deconOn && !this._deconFx) { this._deconFx = true; I.nozzles.forEach((q, i) => this.smoke.add(`decon${i}`, () => q.p, '#b8ffe0', 5, 1.2)); }
    else if (!c.deconOn && this._deconFx) { this._deconFx = false; I.nozzles.forEach((_, i) => this.smoke.remove(`decon${i}`)); }
    // toboggan : on glisse vers le bas (sauf en remontant)
    if (this.mode === 'explore' && !this.aboard && !this.bseat && !this.driving && !this.riding && !this.c3.fly && f.slide) {
      const P = this.player.pos;
      const sl = this.platforms.find((p) => p.slide && this.onPlatform(p, P.x, P.z) && Math.abs(P.y - p.top) < 0.35);
      if (sl) {
        const yaw = this.c3.bp.yaw, down = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
        const up = this.input.down('KeyW') && this.player.forward().dot(down) < -0.3;
        if (!up) { P.addScaledVector(down, 6 * dt); if (!this.said.has('slideWhee')) { this.said.add('slideWhee'); this.ui.toast('Wiiiii !', 'Pour remonter : face à l\'avion, <kbd>Z</kbd>.', 'good', 2500); } }
      }
    }
    if (this.isAuthority()) this.updateChapter4Host(dt);
  },
  // décisions de l'hôte : caisse au sas, repêchage, cycle de décontamination, minuterie de la synthèse
  updateChapter4Host(dt) {
    const I = this.island4, f = this.flags, c = this.c4, it = this.items.crate;
    if (it.state === 'ground' && !it.onVehicle && f.crateOut && !f.labCrate) {
      if (Math.hypot(it.pos.x - I.cx, it.pos.z - I.cz) < 450) {
        if (it.pos.y > 0.2) this.crateSafe = { x: it.pos.x, z: it.pos.z };
        else if (it.pos.y < -0.6 && this.crateSafe) { this.act('drop', { id: 'crate', x: this.crateSafe.x, z: this.crateSafe.z, y: FLAT4, r: 0 }); this.fx('crateFished'); }
      }
      const pd = I.points.pad;
      if (!f.crateAtLab && Math.hypot(it.pos.x - pd.x, it.pos.z - pd.z) < 4.6) this.act('flag', { crateAtLab: true });
    }
    if (c.deconOn) {
      const pd = I.points.pad;
      const watch = this.enemyTargets().some((p) => p.active && Math.hypot(p.pos.x - pd.x, p.pos.z - pd.z) < 30);
      if (watch) c.decon += dt;
      this._deconSend = (this._deconSend || 0) + dt;
      if (this._deconSend > 1) { this._deconSend = 0; this.dirtyWorld = true; }
      const N = this.playerCount();
      while ((this._deconWave || 0) < DECON_WAVES.length && c.decon >= DECON_WAVES[this._deconWave]) {
        const w = ++this._deconWave;
        this.enemies.setHpScale(1 + 0.6 * (N - 1));
        this.enemies.spawnAround('voile', pd.x, pd.z, 2 + w + N, 26, 40, { siege: true });
        if (w >= 2) this.enemies.spawnAround('runner', pd.x, pd.z, 1 + Math.floor(N / 2), 30, 42, { siege: true });
        if (w === 3) this.enemies.spawnAround('screamer', pd.x, pd.z, 1, 32, 40, { siege: true });
        if (w === 4) this.enemies.spawnAround('bloater', pd.x, pd.z, 1 + Math.floor(N / 2), 30, 40, { siege: true });
        if (w === 5) this.enemies.spawnAround('brute', pd.x, pd.z, 1, 34, 42, { siege: true });
        this.fx('deconWave', { n: w });
      }
      if (c.decon >= DECON_TIME) {
        c.deconOn = 0; c.decon = DECON_TIME;
        for (const e of this.enemies.list) if (!e.dead && e.siege && Math.hypot(e.pos.x - pd.x, e.pos.z - pd.z) < 90) this.enemies.damage(e, 99999, null, 0, []);
        this.act('flag', { decon4: true });
        this.act('labCrate', {});
        this.dirtyWorld = true;
      }
    }
    if (c.synthLeft > 0 && !f.cured) {
      c.synthLeft -= dt;
      this._synthSend = (this._synthSend || 0) + dt;
      if (this._synthSend > 1) { this._synthSend = 0; this.dirtyWorld = true; }
      if (c.synthLeft <= 0) { c.synthLeft = 0; this.act('synthReset', {}); }
    }
  },
  // défaite collective ou nouvelle journée : le cycle en cours est perdu
  c4Retry() {
    const c = this.c4; if (!c) return;
    if (c.deconOn) { c.deconOn = 0; c.decon = 0; this._deconWave = 0; }
    if (c.synthLeft) { c.synthLeft = 0; this.flags.synthA = this.flags.synthB = this.flags.synthC = false; }
    this.dirtyWorld = true;
  },
  makeNoise(p, r) {
    if (this.isAuthority()) this.enemies.noise(p, r);
    else this.session?.send('noise', { p: [+p.x.toFixed(1), +p.z.toFixed(1)], r });
  },

  // ── interactions à pied ──
  c4Interactions(add, me) {
    const f = this.flags, c = this.c4, c3 = this.c3;
    if (!c || !c3 || !this.boeing) return;
    // Boeing garé : toboggan (dedans), soute (dehors, à Hélios)
    if (!c3.fly) {
      if (this.inBoeing(me) && !f.slide) add(this.boeingLocal(new THREE.Vector3(-2.1, FLOOR_B + 1.2, 3.6)), 2.4, { prio: 3, prompt: '<kbd>E</kbd> déclencher le toboggan d\'évacuation', press: () => { this.act('flag', { slide: true }); this.audio.whoosh(); this.audio.splash(); } });
      if (f.boeingCrate && !f.crateOut && !this.inBoeing(me) && this.nearIsland(this.boeing.root.position) === 4) {
        const cg = this.boeingLocal(BOEING.cargo), out = this.boeingLocal(new THREE.Vector3(6.2, 0, 33));
        const dry = heightAt(out.x, out.z) > 0.3;
        const helpers = this.mateList().filter((m) => !m.downed && m.pos.distanceTo(me) < 5).length;
        add(cg, 4, dry ? {
          prio: 3,
          prompt: `<kbd>E</kbd> maintenu : sortir la caisse de la soute${helpers ? ` · ${helpers + 1} bras` : ' (plus rapide à plusieurs)'}`,
          hold: { seconds: 4 / (1 + 0.7 * helpers), tick: (dt, bf) => { this._unloadT = this.t + 0.5; if (Math.floor(bf / 0.3) !== Math.floor(this.holdT / 0.3)) this.audio.ratchet(); }, done: () => this.act('bunload', { x: +out.x.toFixed(2), z: +out.z.toFixed(2), r: +c3.bp.yaw.toFixed(2) }) },
        } : { prompt: '<span class="warn">Soute au-dessus de l\'eau : garez l\'avion ailleurs</span>' });
      }
    }
    const I = this.island4, P = I.points;
    if (Math.hypot(me.x - I.cx, me.z - I.cz) > 460) return;
    add(P.shop, 3.2, { prompt: '<kbd>E</kbd> Relais Soleil-Levant · comptoir d\'échange', press: () => this.openShop(4) });
    // pont-levis : deux manivelles
    if (!f.bridge4) P.cranks.forEach((cp, i) => {
      const L = ['A', 'B'][i], o = 1 - i;
      const helpers = this.mateList().filter((m) => !m.downed && m.pos.distanceTo(cp) < 2.5).length;
      add(cp, 2.4, {
        prio: 2,
        prompt: `<kbd>E</kbd> maintenu : manivelle ${L} (${Math.round(c.crank[i] * 100)} %) · ${['A', 'B'][o]} : ${Math.round(c.crank[o] * 100)} %`,
        hold: {
          tick: (dt, before) => {
            if (c.crank[i] >= 1) return;
            if (c.crank[i] - c.crank[o] > 0.2) {
              if (!this._jamT || this.t - this._jamT > 2.5) { this._jamT = this.t; this.audio.error(); this.ui.toast('Le tablier se met de travers !', `Il faut tourner la manivelle ${['A', 'B'][o]} aussi.`, 'bad', 2400); }
              return;
            }
            c.crank[i] = Math.min(1, c.crank[i] + dt * 0.1 * (1 + 0.5 * helpers));
            this._crankMine = i; this._crankT = this.t;
            if (Math.floor(before / 0.25) !== Math.floor(this.holdT / 0.25)) this.audio.ratchet();
            this._crankSend = (this._crankSend || 0) + dt;
            if (this._crankSend > 0.3 || c.crank[i] >= 1) { this._crankSend = 0; this.act('crank', { i, v: +c.crank[i].toFixed(3) }); }
            this._crankNoise = (this._crankNoise || 0) + dt;
            if (this._crankNoise > 1.5) { this._crankNoise = 0; this.makeNoise(cp, 55); this.audio.clank(); }
          },
        },
      });
    });
    add(P.board, 4.5, { prompt: '<kbd>E</kbd> lire le panneau des départs', press: () => this.readBusBoard() });
    if (!f.gate4) add(P.booth, 2.6, { prio: 2, prompt: '<kbd>E</kbd> clavier du barrage sanitaire', press: () => this.openGateKeypad() });
    // sas et décontamination
    if (!f.decon4) {
      add(P.padConsole, 2.6, c.deconOn ? { prompt: `Décontamination : ${Math.round(c.decon / DECON_TIME * 100)} %` } : f.crateAtLab ? { prio: 3, prompt: '<kbd>E</kbd> lancer le cycle de décontamination', press: () => this.act('decon', { on: 1 }) } : { prompt: '<span class="warn">Déposez d\'abord la caisse sur le sas (chariot élévateur)</span>' });
      add(P.labDoor, 3.2, { prompt: '<span class="warn">Sas verrouillé : cycle de décontamination requis</span>' });
    }
    // synthétiseur : trois consoles
    if (f.decon4 && !f.cured) for (const cs of P.consoles) {
      const done = f[`synth${cs.k}`];
      add(cs.p, 2.2, done ? { prompt: `Console ${cs.k} · ${cs.name} : réglée ✔` } : { prio: 3, prompt: `<kbd>E</kbd> console ${cs.k} · ${cs.name}`, press: () => this.openSynth(cs.k) });
    }
    if (f.decon4) add(P.glass, 3.5, { prompt: '<kbd>E</kbd> parler à Marthe', press: () => this.talkMarthe() });
  },
  readBusBoard() {
    const Z = this.island4.puzzle;
    const L = [['⚓', 'PORT'], ['☀', 'SOLEIL'], ['★', 'ÉTOILE'], ['♣', 'TRÈFLE'], ['♥', 'CŒUR'], ['✈', 'AÉROPORT']];
    this.openNote('Gare routière · derniers départs', L.map(([s, n], i) => `<span style="font-size:22px">${s}</span> ligne ${n} · <b>quai ${Z.quais[i]}</b>`).join('<br>'), `Gare routière : ${L.map(([s], i) => `${s}=${Z.quais[i]}`).join(' ')}`);
  },
  openGateKeypad() {
    const Z = this.island4.puzzle;
    this.openModalCommon();
    this.ui.keypad(`Barrage · ${Z.syms.join('  ')}`, 4, (code) => {
      if (code !== Z.code) { this.audio.error(); this.ui.toast('Code refusé', 'Les agents recopiaient les quais des lignes de bus affichées ici.', 'bad', 2600); return false; }
      this.act('flag', { gate4: true });
      this.audio.success();
      setTimeout(() => this.closeModal(), 400);
      return true;
    }, () => this.input.lock());
    this.addNote(`Barrage sanitaire : code = quais des lignes ${Z.syms.join(' ')} (panneau de la gare routière)`);
  },
  openSynth(k) {
    const done = () => { this.act('synth', { k }); this.closeModal(); };
    this.openModalCommon();
    if (k === 'A') {
      const notes = [392, 523, 659, 784];
      this.ui.simon({ title: 'Console A · séquenceur ARN', rounds: [3, 4, 5], onPad: (i) => this.audio.note(notes[i]), onFail: () => this.audio.error(), onSolve: done }, () => this.input.lock());
    } else if (k === 'B') {
      const pz = makePipes((this.seed ^ 0x5171) + (this.synthTries || 0) * 7919);
      this.ui.onTick = () => this.audio.ratchet();
      this.ui.pipePuzzle(pz, done, () => this.input.lock(), { title: 'Console B · circuit de refroidissement', src: 'AZOTE<b>❄</b>', dst: 'CUVE<b>⚗</b>' });
    } else {
      let prog = 0, fin = false;
      this.ui.pumpPanel({
        title: 'Console C · centrifugeuse', label: 'Séparation', unit: '%', fullText: 'SÉPARATION TERMINÉE',
        getFuel: () => prog, max: 100,
        onFlow: (dt) => { prog = Math.min(100, prog + 11 * dt); if (Math.random() < dt * 3) this.audio.ratchet(); },
        onBurst: () => this.audio.spark(),
        onFull: () => { if (!fin) { fin = true; setTimeout(done, 600); } },
      }, () => this.input.lock());
    }
  },
  talkMarthe() {
    const f = this.flags;
    const lines = f.cured
      ? ['La fièvre tombe déjà… Je sens mes mains. Merci. Vraiment.', 'Demain, le Boeing repart avec les premières doses. Vous pilotez ?', 'Allez voir le coucher de soleil depuis la Tour Hélios. Vous l\'avez mérité.']
      : ['Les trois consoles ! A, B et C. Vite, avant que le mélange ne tourne.', 'Ne vous inquiétez pas pour moi. Enfin… un peu, quand même.', 'La console B, c\'est de la tuyauterie. La C, c\'est une question de doigté. La A… de mémoire.'];
    const t = lines[(this._martheLine = ((this._martheLine ?? -1) + 1) % lines.length)];
    this.marthe.say(t);
    this.ui.radio(t, () => this.audio.radio());
  },

  // ── effets des drapeaux (toutes les machines) ──
  onFlag4(k, me, by) {
    const ui = this.ui;
    if (k === 'bAir') {
      this.audio.success();
      ui.toast('Le HX-404 décolle !', 'Chapitre 4 : cap sur Hélios.', 'good', 7000);
      this.radioOnce('c4air', `Il vole ! Vous pilotez un long-courrier, rien que ça. Cap ${this.bearingTo(this.bf.pos.x, this.bf.pos.z, this.island4.cx, this.island4.cz)}°, l'écho violet sur votre écran de navigation. Hélios est à deux minutes… *tousse* Pardon. Le labo est un peu froid.`);
    } else if (k === 'landed4') {
      this.audio.success();
      ui.subtitle('<big>Hélios</big>Aéroport Soleil-Levant · la ville-lumière s\'est éteinte');
      setTimeout(() => ui.subtitle(''), 5000);
      this.radioOnce('c4land', 'Posés ! … Écoutez-moi bien. Hélios est tombée il y a deux jours. L\'Institut s\'est verrouillé en quarantaine automatique, avec moi dedans. Déclenchez le toboggan à la porte avant, puis sortez la caisse de la soute, à l\'arrière droit de l\'avion.');
    } else if (k === 'slide') ui.toast('Toboggan déployé', me ? 'Glissez ! Pour remonter, marchez face à l\'avion.' : `${this.nameOf(by)} a déclenché le toboggan.`, 'good', 3500);
    else if (k === 'bridge4') {
      this.audio.success(); this.audio.powerUp();
      ui.toast('Le pont du Soleil est baissé', 'Véhicules et piétons peuvent traverser le canal.', 'good', 5000);
      this.radioOnce('c4bridge', 'Le pont est en place ! Au bout de l\'avenue, il y a le barrage sanitaire. Son code change chaque semaine : les agents recopiaient les quais des lignes de bus affichées sur leur clavier, c\'est la gare routière, juste à côté. Oui, c\'est idiot. C\'est pour ça que ça marchait.');
    } else if (k === 'gate4') {
      this.audio.door(); this.audio.success();
      ui.toast('Barrage ouvert', 'Remontez l\'avenue du Zénith jusqu\'à la place du Soleil.', 'good', 5000);
      this.radioOnce('c4gate', 'Le barrage s\'ouvre ! Remontez l\'avenue du Zénith jusqu\'à la place du Soleil. Posez la caisse sur le sas, devant l\'Institut. Et restez groupés : la ville est pleine de… de gens qui ne sont plus des gens.');
    } else if (k === 'crateAtLab') {
      ui.toast('Caisse sur le sas', 'Lancez le cycle au pupitre, à droite du sas.', 'good', 5000);
      this.radioOnce('c4pad', 'Parfait. Le pupitre est à droite du sas. Le cycle dure un peu plus d\'une minute… et il n\'est pas discret.');
    } else if (k === 'decon4') {
      this.audio.success(); this.audio.door();
      ui.toast('Sas ouvert !', 'La caisse est entrée dans l\'Institut. Rejoignez Marthe.', 'good', 6000);
      this.radioOnce('c4open', 'Entrez… Ne vous approchez pas de la vitre. J\'ai été mordue hier soir, en fermant le sas. Je tiens encore. Le synthétiseur a trois consoles : A, B, C. Réglez-les vite, une chacun si vous êtes plusieurs : le mélange ne tient pas longtemps.');
    } else if (k === 'cured') {
      this.audio.success();
      this.radioOnce('c4cured', 'La première dose… elle est pour moi. … … Ça marche. Ça marche ! La fièvre tombe. Demain, les doses partent pour tout l\'archipel. Vous avez sauvé Hélios. Vous nous avez tous sauvés.');
    }
  },
  applyFx4(type, data) {
    if (type === 'deconWave') { this.ui.toast(`Vague ${data.n}/${DECON_WAVES.length}`, data.n === 5 ? 'Un cogneur arrive !' : 'Ils convergent vers le sas.', 'bad', 3500); this.audio.hiss(); return true; }
    if (type === 'crateFished') { this.ui.toast('Caisse repêchée', 'Elle flottait : on l\'a remise sur la terre ferme.', '', 3000); return true; }
    return false;
  },

  // ── objectifs du chapitre 4 ──
  objectives4() {
    const f = this.flags, c = this.c4 || this.defaultC4();
    const synthN = ['A', 'B', 'C'].filter((k) => f[`synth${k}`]).length;
    return [
      { id: 'fly4', text: 'Piloter le Boeing jusqu\'à Hélios', hint: 'Suivez le cap sur l\'écran de navigation · piste est-ouest au sud de l\'île, moins de 190 km/h au toucher', done: f.landed4 },
      { id: 'slide4', text: 'Déclencher le toboggan et descendre', hint: 'Porte avant gauche, à l\'intérieur', done: f.slide },
      { id: 'unload4', text: 'Sortir la caisse Hélios de la soute', hint: 'Porte de soute, à l\'arrière droit (E maintenu, plus rapide à plusieurs)', done: f.crateOut || f.labCrate },
      { id: 'bridge4', text: `Baisser le pont-levis (${Math.round(Math.min(c.crank[0], c.crank[1]) * 100)} %)`, hint: 'Deux manivelles, A et B : les tourner ensemble (en solo : chacune un peu, à tour de rôle). Le grincement attire les morts', done: f.bridge4 },
      { id: 'gate4', text: 'Ouvrir le barrage sanitaire', hint: 'Clavier de la guérite · les quais des lignes de bus (panneau de la gare routière)', done: f.gate4 },
      { id: 'pad4', text: 'Amener la caisse au sas de l\'Institut', hint: 'Chariot élévateur (hangar de fret) · déposez la caisse sur le sas, place du Soleil', done: f.crateAtLab },
      { id: 'decon4', text: `Tenir pendant la décontamination${c.deconOn ? ` (${Math.round(c.decon / DECON_TIME * 100)} %)` : ''}`, hint: 'Pupitre à droite du sas · restez près du sas', done: f.decon4 },
      { id: 'synth4', text: `Régler le synthétiseur (${synthN}/3)`, hint: c.synthLeft ? `Il reste ${Math.round(c.synthLeft)} s` : 'Trois consoles, dans le temps imparti', done: f.cured },
      { id: 'duck4', optional: true, text: 'Bonus · les canards d\'Hélios', hint: 'Fontaine, gare routière', done: this.ducks.has('d9') && this.ducks.has('d10') },
    ];
  },
  objectivePoint4(id) {
    const I = this.island4, P = I.points, f = this.flags, c = this.c4;
    switch (id) {
      case 'fly4': return new THREE.Vector3(I.cx, 0, I.cz + I4.runway.z);
      case 'slide4': return this.boeingLocal(BOEING.door);
      case 'unload4': return this.boeingLocal(BOEING.cargo);
      case 'bridge4': return c.crank[0] <= c.crank[1] ? P.cranks[0] : P.cranks[1];
      case 'gate4': return P.booth;
      case 'pad4': return this.items.crate.state === 'ground' && !f.crateAtLab && !this.items.crate.onVehicle && Math.hypot(this.items.crate.pos.x - P.pad.x, this.items.crate.pos.z - P.pad.z) > 30 ? (Object.values(this.vehicles).some((v) => v.cargo === 'crate') ? P.pad : this.items.crate.pos) : P.pad;
      case 'decon4': return P.padConsole;
      case 'synth4': return P.synth;
      default: return null;
    }
  },

  // ── admin : directement posé à Hélios ──
  adminChapter4() {
    if (this.chapter() === 1) this.debugRepairAll();
    ['hello', 'watch', 'repaired', 'takeoff', 'discovered', 'c3start', 'c3fire', 'c3land', 'c3out', 'c4air'].forEach((k) => this.said.add(k));
    this.act('flag', { tookOff: true, discovered: true, landed2: true, power: true, refueled: true, tookOff2: true, fire3: true, landed3: true, fireOut: true, baysOpen: true, boeingBattery: true, boeingFuel: true, boeingOut: true, wheels: true });
    this.planeLive = true; this.planeLift = 1;
    if (this.mode === 'flight') { this.mode = 'explore'; this.ui.el.hud.dataset.mode = 'explore'; }
    this.act('pilot', { on: false });
    this.parkAt(3);
    if (this.crateLoaded) { this.crateLoaded = false; this.plane.crateAboard.visible = false; }
    const it = this.items.crate; it.state = 'installed'; it.carrier = null; it.mesh.visible = false; if (this.carrying === it) this.carrying = null;
    this.act('flag', { boeingCrate: true, bAir: true, landed4: true });
    const I = this.island4;
    this.c3.fly = 0;
    this.c3.bp = { x: I.cx - 120, z: I.cz + I4.runway.z, yaw: -Math.PI / 2, y: FLAT4 };
    this.poseBoeing();
    this.bseat = null; this.aboard = false; this.seat = null;
    const out = this.boeingLocal(new THREE.Vector3(-9, 0, 12));
    this.player.place(out.x, out.z, this.c3.bp.yaw);
    this.dirtyWorld = true;
    this.save();
    this.ui.toast('Admin · chapitre 4', 'Hélios : le Boeing est posé, la caisse est en soute.', 'good', 3500);
    this.refreshCarnet();
  },
};
