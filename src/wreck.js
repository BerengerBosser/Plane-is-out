// Crash du Coucou en cours de partie : l'avion heurte arbres, bâtiments ou relief,
// ses pièces s'éparpillent, la coque est percée. On rapporte les pièces, on plaque des tôles
// sur les trous, puis on SOUDE chaque point au chalumeau (mini-jeu : relâcher dans la zone verte).
// Si l'épave est coincée à terre, on la tire à la corde jusqu'à l'eau.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { SLOTS, HOLES } from './planeModel.js';
import { ITEMS, PART_ORDER } from './defs.js';

// points de soudure (repère local de la carlingue)
function weldPoints(k) {
  const add = (base, offs) => offs.map(([x, y, z]) => base.clone().add(new THREE.Vector3(x, y, z)));
  if (k === 'engineL' || k === 'engineR') return add(SLOTS[k], [[-0.5, 0.42, 0.7], [0.5, 0.42, 0.7], [-0.5, -0.38, 0.7], [0.5, -0.38, 0.7]]);
  if (k === 'wingL') return [new THREE.Vector3(-3.05, 4.1, -1.5), new THREE.Vector3(-3.05, 4.1, -0.6), new THREE.Vector3(-3.05, 4.1, 0.3), new THREE.Vector3(-3.3, 3.9, -0.6)];
  if (k === 'prop') return add(SLOTS.prop, [[0.28, 0.28, 0.15], [-0.28, 0.28, 0.15], [0, -0.34, 0.15]]);
  if (k[0] === 'h') {
    const h = HOLES[+k[1]];
    const out = h.n.clone().multiplyScalar(0.09);
    return [[0, 0.3, -0.42], [0, 0.3, 0.42], [0, -0.3, -0.42], [0, -0.3, 0.42]].map(([x, y, z]) => h.p.clone().add(new THREE.Vector3(x, y, z)).add(out));
  }
  return [];
}
const LO = 58, HI = 86;       // zone verte de la jauge de chaleur

export const WreckMixin = {
  wreckInit() {
    this.wreck = { placed: {}, holes: [0, 0], pos: null, stranded: false };
    this.weldMeshes = new THREE.Group();
    this.plane.body.add(this.weldMeshes);
    this.weldRing = new THREE.TorusGeometry(0.11, 0.03, 6, 14);
    this.weldBead = new THREE.SphereGeometry(0.07, 6, 4);
    this.weldMatOn = new THREE.MeshBasicMaterial({ color: '#ff9a3d', toneMapped: false });
    this.weldMatDone = new THREE.MeshLambertMaterial({ color: '#5d646c', emissive: '#2a1a10' });
    this.weldHeat = 0; this.weldCool = 0;
    // étincelles
    this.sparks = [];
    const sg = new THREE.BoxGeometry(0.03, 0.03, 0.12);
    const sm = new THREE.MeshBasicMaterial({ color: '#ffd37a', toneMapped: false });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.scene.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0 }); }
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#e0c38a' }));
    this.rope.visible = false;
    this.scene.add(this.rope);
  },
  resetWreck() {
    this.wreck = { placed: {}, holes: [0, 0], pos: null, stranded: false };
    this.plane.setHole(0, 0); this.plane.setHole(1, 0);
    for (const k of ['plateA', 'plateB', 'plateC']) { const it = this.items[k]; it.state = 'hidden'; it.mesh.visible = false; }
    this.refreshWelds();
  },
  wreckActive() { return this.flags.wrecked || this.wreck.stranded; },

  // ── crash : appelé par la machine qui simule l'avion ──
  wreckPlane(reason) {
    if (this.flags.wrecked) return;
    const f = this.flight;
    let x = f.pos.x, z = f.pos.z;
    const yaw = f.yaw;
    if (heightAt(x, z) < -1.4) { const s = this.nearestShore(x, z); x = s.x; z = s.z; }
    const cand = ['engineL', 'engineR', 'wingL', 'prop'].filter((k) => this.installed.has(k)).sort(() => Math.random() - 0.5);
    const n = Math.min(cand.length, 2 + (Math.random() < 0.5 ? 1 : 0));
    const spot = (dmin, dmax) => {
      for (let t = 0; t < 30; t++) {
        const a = yaw + Math.PI + (Math.random() - 0.5) * 2.4, d = dmin + Math.random() * (dmax - dmin);
        const px = x + Math.sin(a) * -d, pz = z + Math.cos(a) * -d;
        if (heightAt(px, pz) > -0.5) return { x: +px.toFixed(2), z: +pz.toFixed(2) };
      }
      const s = this.nearestShore(x + (Math.random() - 0.5) * 16, z + (Math.random() - 0.5) * 16);
      return { x: +s.x.toFixed(2), z: +s.z.toFixed(2) };
    };
    const parts = cand.slice(0, n).map((k) => ({ k, ...spot(8, 20) }));
    const plates = ['plateA', 'plateB', 'plateC'].map((id) => ({ id, ...spot(5, 14) }));
    this.act('wreck', { x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), parts, plates, reason });
  },
  // rivage le plus proche (vers le centre de l'île la plus proche)
  nearestShore(x, z) {
    const c = Math.hypot(x - this.island2.cx, z - this.island2.cz) < Math.hypot(x, z) ? { x: this.island2.cx, z: this.island2.cz } : { x: 0, z: 0 };
    const dx = c.x - x, dz = c.z - z, L = Math.hypot(dx, dz) || 1;
    for (let d = 0; d < L; d += 2) {
      const px = x + dx / L * d, pz = z + dz / L * d;
      if (heightAt(px, pz) > -0.9) return { x: px, z: pz };
    }
    return { x: c.x, z: c.z };
  },

  applyWreck(d, me) {
    const wasPilot = this.mode === 'flight';
    const aboard = this.aboard || wasPilot;
    this.flags.wrecked = true;
    this.planeLive = false;
    this.pilotId = null;
    this.nozzle = null;
    const f = this.flight;
    f.speed = 0; f.throttle = 0; f.autopilot = false;
    this.setWreckPose(d.x, d.z, d.yaw);
    const from = this.plane.root.position.clone().add(new THREE.Vector3(0, 3, 0));
    for (const p of d.parts) {
      this.installed.delete(p.k);
      this.plane.parts[p.k].visible = false;
      this.launch(p.k, this.plane.body.localToWorld(SLOTS[p.k].clone()), p, 1.4, 5);
    }
    if (d.parts.some((p) => p.k === 'engineL') && this.installed.has('prop')) {
      // sans moteur, l'hélice gauche tombe aussi
      this.installed.delete('prop'); this.plane.parts.prop.visible = false;
      const s = { x: d.x + 6, z: d.z + 4 };
      this.launch('prop', this.plane.body.localToWorld(SLOTS.prop.clone()), heightAt(s.x, s.z) > -0.5 ? s : this.nearestShore(s.x, s.z), 1.2, 6);
    }
    for (const p of d.plates) this.launch(p.id, from, p, 1.1, 4);
    this.wreck = { placed: {}, holes: [1, 1], pos: { x: d.x, z: d.z, yaw: d.yaw }, stranded: false };
    this.plane.setHole(0, 1); this.plane.setHole(1, 1);
    this.refreshWelds();
    this.smoke.add('wreck', () => this.plane.root.localToWorld(new THREE.Vector3(0, 3.6, 1)), '#3d3a3a', 3, 2.2);
    this.audio.explosion();
    this.ui.fade(0.7, '#fff', 60);
    setTimeout(() => this.ui.fade(0, '#fff', 900), 80);
    if (wasPilot) { this.mode = 'explore'; this.ui.el.hud.dataset.mode = 'explore'; this.ui.flight(false); this.audio.setEngine(0, 0); }
    if (aboard) {
      this.aboard = false; this.seat = null;
      const out = this.plane.root.localToWorld(new THREE.Vector3(4.2 + Math.random(), 0, 2.2));
      this.player.place(out.x, out.z, this.player.yaw + (wasPilot ? this.flight.yaw : 0));
      this.player.pos.y = Math.max(this.groundAt(out.x, out.z, 99), -1.25);
      this.hp = Math.max(15, this.hp - 25);
      this.player.shake = 1;
    }
    this.ui.toast('CRASH !', 'Le Coucou est en morceaux. Ramassez les pièces et les tôles, prenez le chalumeau à la porte cargo, et ressoudez tout.', 'bad', 9000);
    this.radioOnce(`crash${this.stats.days}`, 'Je vous ai perdus sur le radar… Vous êtes vivants ? Bon. Il y a un chalumeau dans la caisse à outils de la porte cargo. Plaquez des tôles sur les trous, ressoudez les pièces, et si l\'épave est coincée, tirez-la à la corde jusqu\'à l\'eau.');
    this.refreshCarnet();
    void me;
  },
  setWreckPose(x, z, yaw) {
    const g = heightAt(x, z);
    const onLand = g > -0.5;
    this.plane.root.position.set(x, onLand ? g + 0.35 : -0.55, z);
    this.plane.root.rotation.set(onLand ? 0.06 : 0.04, yaw, onLand ? 0.14 : 0.1, 'YXZ');
    this.flight.pos.set(x, this.plane.root.position.y, z);
    this.flight.yaw = yaw;
    if (this.wreck) this.wreck.pos = { x, z, yaw };
  },

  // ── soudure ──
  pendingWelds() {
    const out = [];
    for (const [k, mask] of Object.entries(this.wreck.placed)) {
      weldPoints(k).forEach((p, i) => out.push({ k, i, p, done: !!(mask & (1 << i)) }));
    }
    return out;
  },
  refreshWelds() {
    const g = this.weldMeshes;
    while (g.children.length) g.remove(g.children[0]);
    if (!this.wreck) return;
    for (const w of this.pendingWelds()) {
      const m = new THREE.Mesh(w.done ? this.weldBead : this.weldRing, w.done ? this.weldMatDone : this.weldMatOn);
      m.position.copy(w.p);
      m.userData = { k: w.k, i: w.i, done: w.done };
      g.add(m);
    }
  },
  weldComplete(k) { const n = weldPoints(k).length; return (this.wreck.placed[k] || 0) === (1 << n) - 1; },

  // appelée chaque image à pied ; renvoie vrai si le clic sert à souder
  updateWeld(dt) {
    const ui = this.ui;
    this.weldCool = Math.max(0, this.weldCool - dt);
    for (const m of this.weldMeshes.children) if (!m.userData.done) { m.lookAt(this.camera.position); m.scale.setScalar(1 + Math.sin(this.t * 6) * 0.15); }
    this.updateSparks(dt);
    if (!this.wreckActive() || this.aboard || this.carrying || this.slot !== 1 || !this.own.wrench) { ui.weld(null); this.weldHeat = 0; return false; }
    // point visé
    const eye = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best = null, bd = 0.97;
    for (const m of this.weldMeshes.children) {
      if (m.userData.done) continue;
      const wp = m.getWorldPosition(new THREE.Vector3());
      const to = wp.clone().sub(eye);
      const d = to.length();
      if (d > 3.6) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bd) { bd = dot; best = { m, wp }; }
    }
    if (!best) { ui.weld(null); if (this.weldHeat > 0) this.weldHeat = 0; return false; }
    if (!this.own.torch) { ui.weld(null); ui.prompt('<span class="warn">Il faut le chalumeau (caisse à outils de la porte cargo)</span>'); return true; }
    const holding = this.input.down('MouseL');
    if (this.weldCool > 0) { ui.weld({ heat: 0, lo: LO, hi: HI, msg: 'Refroidissement…' }); return true; }
    if (holding) {
      // chauffe irrégulière : il faut surveiller la jauge
      this.weldHeat += dt * (48 + 22 * Math.sin(this.t * 3.1 + best.m.userData.i));
      this.emitSparks(best.wp, 3);
      this._sizzle = (this._sizzle || 0) - dt;
      if (this._sizzle <= 0) { this._sizzle = 0.12; this.audio.spark(); }
      if (this.weldHeat >= 100) {
        this.weldHeat = 0; this.weldCool = 1.2;
        this.emitSparks(best.wp, 25);
        this.audio.error();
        this.hp -= 4; this.lastHurt = this.t; this.ui.hurt(0.4); setTimeout(() => this.ui.hurt(0), 200);
        this.ui.toast('Surchauffe !', 'Relâchez dans la zone verte.', 'bad', 1500);
      }
    } else if (this.weldHeat > 0) {
      const h = this.weldHeat;
      this.weldHeat = 0;
      if (h >= LO && h <= HI) {
        this.act('weld', { k: best.m.userData.k, i: best.m.userData.i });
        this.emitSparks(best.wp, 14);
        this.audio.note(1320);
      } else if (h > 12) { this.audio.error(); this.ui.toast('Soudure ratée', 'Trop tôt : maintenez jusqu\'à la zone verte.', 'bad', 1300); }
    }
    ui.weld({ heat: this.weldHeat, lo: LO, hi: HI, msg: holding ? 'Relâchez dans le vert' : 'Clic maintenu : souder' });
    ui.prompt('');
    return true;
  },
  emitSparks(p, n) {
    for (let k = 0; k < n; k++) {
      const s = this.sparks.find((q) => q.life <= 0);
      if (!s) return;
      s.life = 0.35 + Math.random() * 0.3;
      s.m.visible = true;
      s.m.position.copy(p);
      s.v.set((Math.random() - 0.5) * 4, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 4);
    }
  },
  updateSparks(dt) {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.lookAt(s.m.position.clone().add(s.v));
      if (s.life <= 0) s.m.visible = false;
    }
  },

  // ── actions partagées (appelées depuis world.applyAct) ──
  applyWreckAct(type, d, by, auth) {
    const me = by === this.myId();
    if (type === 'wreck') { this.applyWreck(d, me); return true; }
    if (type === 'place') {
      if (this.wreck.placed[d.k] !== undefined || this.installed.has(d.k)) return auth ? false : true;
      const it = this.items[d.k];
      it.state = 'placed'; it.carrier = null; it.mesh.visible = false;
      if (this.carrying === it) this.carrying = null;
      this.plane.parts[d.k].visible = true;
      this.plane.ghosts[d.k].visible = false;
      this.wreck.placed[d.k] = 0;
      this.audio.clank();
      if (me) this.ui.toast(`${ITEMS[d.k].name} en place`, 'Soudez maintenant chaque point orange : outil 2, clic maintenu, relâchez dans le vert.', 'good', 6000);
      this.refreshWelds();
      this.afterChange();
      return true;
    }
    if (type === 'plate') {
      const i = d.i;
      if (this.wreck.holes[i] !== 1) return auth ? false : true;
      const it = this.items[d.id];
      it.state = 'placed'; it.carrier = null; it.mesh.visible = false;
      if (this.carrying === it) this.carrying = null;
      this.wreck.holes[i] = 2;
      this.plane.setHole(i, 2);
      this.wreck.placed[`h${i}`] = 0;
      this.audio.clank();
      this.refreshWelds();
      this.afterChange();
      return true;
    }
    if (type === 'weld') {
      if (this.wreck.placed[d.k] === undefined) return true;
      this.wreck.placed[d.k] |= 1 << d.i;
      if (!me) this.audio.spark();
      if (this.weldComplete(d.k)) {
        delete this.wreck.placed[d.k];
        if (d.k[0] === 'h') { const i = +d.k[1]; this.wreck.holes[i] = 3; this.plane.setHole(i, 3); this.ui.toast('Trou colmaté', 'La tôle tient.', 'good'); }
        else {
          this.installed.add(d.k);
          this.items[d.k].state = 'installed';
          this.ui.toast(`${ITEMS[d.k].name} ressoudé`, '', 'good');
        }
        this.audio.success();
        this.checkWreckDone(auth);
      }
      this.refreshWelds();
      this.afterChange(false);
      return true;
    }
    if (type === 'wreckPos') { if (!me) this.setWreckPose(d.x, d.z, d.yaw); this.wreck.stranded = !!d.st; return true; }
    if (type === 'refloat') {
      this.flags.wrecked = false;
      this.wreck.stranded = false;
      this.smoke.remove('wreck');
      this.planeLive = true; this.planeLift = 1;
      this.flight.reset(d.x, d.z, d.yaw);
      this.ui.toast('Le Coucou flotte !', 'Il est prêt à repartir.', 'good', 5000);
      this.audio.splash();
      this.afterChange();
      return true;
    }
    return null;
  },
  checkWreckDone(auth) {
    if (!auth) return;
    const all = PART_ORDER.every((k) => this.installed.has(k)) && this.wreck.holes.every((h) => h === 0 || h === 3);
    if (!all) return;
    const p = this.wreck.pos || { x: this.plane.root.position.x, z: this.plane.root.position.z, yaw: this.flight.yaw };
    if (heightAt(p.x, p.z) < -0.8) this.act('refloat', p);
    else {
      this.flags.wrecked = false;
      this.wreck.stranded = true;
      this.act('flag', { wrecked: false });
      this.act('wreckPos', { ...p, st: 1 });
      this.fx('stranded');
    }
  },
  applyWreckFx(type) {
    if (type === 'stranded') {
      this.ui.toast('Réparé… mais à sec', 'Tirez l\'avion jusqu\'à l\'eau : maintenez E à la corde, sous la queue.', 'good', 8000);
      this.radioOnce(`stranded${this.stats.days}`, 'Il est entier ! Mais il ne décollera pas des cailloux. Attrapez la corde sous la queue et tirez-le jusqu\'à l\'eau. À plusieurs, ça ira plus vite.');
    }
  },

  // objectifs affichés tant que l'épave n'est pas repartie
  wreckObjectives() {
    if (!this.wreckActive()) return [];
    if (!this.flags.wrecked) return [{ id: 'wreck', text: 'Tirer l\'avion jusqu\'à l\'eau', hint: 'Maintenez E à la corde sous la queue, en reculant. À plusieurs, c\'est plus rapide.', done: false }];
    const missing = PART_ORDER.filter((k) => !this.installed.has(k));
    const list = [{ id: 'wreck', text: 'Réparer l\'épave du Coucou', hint: 'Rapportez les pièces, plaquez les tôles, puis soudez chaque point orange au chalumeau', done: false }];
    list.push({ sub: true, text: 'Prendre le chalumeau', hint: 'Caisse à outils, à la porte cargo', done: !!this.own.torch });
    for (const k of missing) list.push({ sub: true, text: `Ressouder : ${ITEMS[k].name.toLowerCase()}`, hint: this.wreck.placed[k] !== undefined ? 'En place : soudez les points orange' : 'Éjectée autour de l\'épave', done: false });
    const holesLeft = this.wreck.holes.filter((h) => h === 1 || h === 2).length;
    list.push({ sub: true, text: `Colmater la coque (${2 - holesLeft}/2 tôles soudées)`, hint: 'Tôles éparpillées autour de l\'épave', done: holesLeft === 0 });
    return list;
  },
  wreckObjectivePoint() {
    const missing = PART_ORDER.filter((k) => !this.installed.has(k) && this.wreck.placed[k] === undefined && this.items[k].state === 'ground');
    if (missing.length) return this.items[missing[0]].pos;
    const plate = ['plateA', 'plateB', 'plateC'].find((id) => this.items[id].state === 'ground');
    if (plate && this.wreck.holes.includes(1)) return this.items[plate].pos;
    return this.plane.root.position;
  },

  // ── remorquage à la corde ──
  ropePoint() { return this.plane.root.localToWorld(new THREE.Vector3(0, 1.4, 9.6)); },
  pullSpec() {
    const helpers = this.mateList().filter((m) => m.pos.distanceTo(this.ropePoint()) < 4).length;
    return {
      prio: 3,
      prompt: `<kbd>E</kbd> maintenir : tirer l'avion vers vous${helpers ? ` (${helpers + 1} à la corde)` : ' · reculez en tirant'}`,
      show: () => { this.rope.visible = true; this.setCable(this.rope, this.ropePoint(), this.playerWorld().add(new THREE.Vector3(0, 1.1, 0))); },
      hold: { tick: (dt) => this.pullWreck(dt, helpers) },
    };
  },
  pullWreck(dt, helpers) {
    const root = this.plane.root;
    const me = this.playerWorld();
    const c = root.position;
    const dir = new THREE.Vector2(me.x - c.x, me.z - c.z);
    if (dir.length() < 7) return;          // trop près : reculez
    dir.normalize();
    const sp = 0.9 * (1 + 0.7 * helpers) * dt;
    const yawT = Math.atan2(dir.x, dir.y);   // queue tournée vers le tireur
    let dy = yawT - this.flight.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const ny = this.flight.yaw + dy * Math.min(1, dt * 0.6);
    const nx = c.x + dir.x * sp, nz = c.z + dir.y * sp;
    if (this.wreckBlocked(nx, nz, ny)) {
      if (this.t - (this._blockT || -9) > 3) { this._blockT = this.t; this.ui.toast('Ça coince', 'La carcasse bute contre un obstacle : tirez dans une autre direction.', 'bad', 2200); this.audio.clank(); }
      return;
    }
    this.setWreckPose(nx, nz, ny);
    this._pullRatchet = (this._pullRatchet || 0) - dt;
    if (this._pullRatchet <= 0) { this._pullRatchet = 0.5; this.audio.ratchet(); }
    this._pullSend = (this._pullSend || 0) + dt;
    if (this._pullSend > 0.25) { this._pullSend = 0; this.act('wreckPos', { x: nx, z: nz, yaw: ny, st: this.wreck.stranded ? 1 : 0 }); }
    if (this.wreck.stranded && heightAt(nx, nz) < -0.8) this.act('refloat', { x: nx, z: nz, yaw: ny });
  },
  // collisions de la carcasse (troncs, rochers, bâtiments) : on autorise à sortir d'un obstacle, pas à s'y enfoncer
  wreckPenetration(x, z, yaw) {
    let pen = 0;
    const s = Math.sin(yaw), co = Math.cos(yaw);
    for (const lz of [-5, -2.5, 0, 2.5, 5, 7.5]) {
      const px = x + s * lz, pz = z + co * lz;
      for (const c of this.colliders) {
        if (c.disabled) continue;
        if (c.type === 'circle') { const d = Math.hypot(px - c.x, pz - c.z); const m = c.r + 1.3; if (d < m) pen += m - d; }
        else { const cx = Math.max(c.minX, Math.min(px, c.maxX)), cz = Math.max(c.minZ, Math.min(pz, c.maxZ)); const d = Math.hypot(px - cx, pz - cz); if (d < 1.3) pen += 1.3 - d; }
      }
    }
    return pen;
  },
  wreckBlocked(nx, nz, ny) {
    const c = this.plane.root.position;
    return this.wreckPenetration(nx, nz, ny) > this.wreckPenetration(c.x, c.z, this.flight.yaw) + 0.02;
  },

  // collisions en vol / au roulage (arbres, bâtiments, rochers)
  planeHitTest(pos, yaw) {
    const ground = heightAt(pos.x, pos.z);
    if (pos.y - Math.max(ground, 0) > 22) return false;
    const s = Math.sin(yaw), co = Math.cos(yaw);
    // points du fuselage (bas) et des ailes (hautes : elles passent au-dessus des petits obstacles)
    const pts = [[0, -6, 0.3], [0, -2, 0.3], [0, 3, 0.3], [0, 8, 0.8], [-5.5, -0.6, 3.8], [5.5, -0.6, 3.8], [-3, -0.6, 3.6], [3, -0.6, 3.6]]
      .map(([lx, lz, h]) => ({ x: pos.x + lx * co + lz * s, z: pos.z - lx * s + lz * co, h }));
    for (const c of this.colliders) {
      if (c.disabled || c.plane) continue;
      const top = c.top ?? (c.type === 'circle' ? heightAt(c.x, c.z) + Math.max(2, c.r * 2) : Math.max(heightAt(c.minX, c.minZ), 0) + 6);
      if (pos.y > top + 0.5) continue;
      for (const p of pts) {
        if (pos.y + p.h > top) continue;
        if (c.type === 'circle') { if (Math.hypot(p.x - c.x, p.z - c.z) < (c.tree ? c.r * 3.4 : c.r) + 0.9) return true; }
        else if (p.x > c.minX - 0.9 && p.x < c.maxX + 0.9 && p.z > c.minZ - 0.9 && p.z < c.maxZ + 0.9) return true;
      }
    }
    return false;
  },
};

export { weldPoints };
