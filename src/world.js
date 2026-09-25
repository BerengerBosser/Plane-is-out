// État du monde partagé : actions (act), application, instantané complet
// En solo, les actions s'appliquent directement. En multijoueur, l'hôte valide et rediffuse ;
// l'invité prédit localement puis se recale sur l'instantané périodique de l'hôte.
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt } from './terrain.js';
import { PART_ORDER, ITEMS, ITEM_STATES, FUSE_SOLUTION, FUSE_SLOTS } from './defs.js';

const LOCAL_FLAGS = ['alarm', 'h16', 'h18'];

export const WorldMixin = {
  isAuthority() { return !this.session || this.session.isHost; },
  playerCount() { return this.session ? this.session.count() : 1; },
  myId() { return this.session ? this.session.me : 'solo'; },

  // ── point d'entrée unique pour modifier le monde ──
  act(type, d = {}) {
    const s = this.session;
    if (!s) return this.applyAct(type, d, 'solo', true);
    if (s.isHost) {
      const ok = this.applyAct(type, d, s.me, true);
      if (ok !== false) s.send('acted', { type, d, by: s.me });
      return ok;
    }
    this.mySeq = (this.mySeq || 0) + 1;
    const ok = this.applyAct(type, d, s.me, true);
    s.send('act', { type, d, seq: this.mySeq }, s.hostId);
    return ok;
  },
  // l'hôte reçoit une action d'un invité
  onGuestAct(m, from) {
    if (!this.session?.isHost) return;
    const ok = this.applyAct(m.type, m.d, from, false);
    this.acks = this.acks || {};
    this.acks[from] = m.seq;
    if (ok === false) { this.session.send('reject', { type: m.type, seq: m.seq }, from); this.sendWorld(from); return; }
    this.session.send('acted', { type: m.type, d: m.d, by: from, seq: m.seq });
  },
  onActed(m) {
    if (this.session?.isHost) return;
    if (m.by === this.session.me) { this.ackSeq = Math.max(this.ackSeq || 0, m.seq || 0); return; }
    this.applyAct(m.type, m.d, m.by, false);
  },

  // applique une action ; renvoie false si elle est refusée (validation de l'hôte)
  applyAct(type, d, by, mine) {
    const me = by === this.myId();
    const auth = this.isAuthority();
    const it = d.id ? this.items[d.id] : null;
    switch (type) {
      case 'pick': {
        if (!it) return false;
        if (auth && (it.state !== 'ground' || (it.carrier && it.carrier !== by))) return false;
        it.state = 'carried'; it.carrier = by; it.sliding = false; it.mode = d.mode;
        this.smoke.remove(it.id);
        if (me) { this.carrying = it; this.carryMode = it.def.weight >= 2 ? d.mode : 'hand'; }
        else it.mesh.visible = true;
        return true;
      }
      case 'drop': {
        if (!it) return false;
        if (auth && it.carrier && it.carrier !== by) return false;
        if (me && this.carrying === it) this.carrying = null;
        this.placeItem(it, d.x, d.z, d.r);
        it.pos.y = this.groundAt(d.x, d.z, d.y + 0.5);
        this.poseGround(it);
        it.sliding = true; it.vel.set(0, 0);
        if (!me) this.audio.drop();
        return true;
      }
      case 'itemPos': {
        if (!it || it.state !== 'ground') return true;
        it.pos.x = d.x; it.pos.z = d.z;
        this.poseGround(it);
        return true;
      }
      case 'install': {
        const k = d.k;
        if (k === 'wheels') {
          if (this.flags.wheels) return auth ? false : true;
          this.flags.wheels = true;
          this.flight.wheels = true;
          const w = this.items.wheels;
          w.state = 'installed'; w.carrier = null; w.mesh.visible = false;
          if (this.carrying === w) this.carrying = null;
          this.plane.parts.wheels.visible = true;
          this.plane.ghosts.wheels.visible = false;
          this.audio.success();
          this.ui.toast('Roues amphibies montées', 'Il roule sur la terre ferme.', 'good', 3500);
          this.afterChange();
          return true;
        }
        if (this.installed.has(k)) return auth ? false : true;
        if (auth && k === 'prop' && !this.installed.has('engineL')) return false;
        this.installed.add(k);
        const p = this.items[k];
        p.state = 'installed'; p.carrier = null; p.mesh.visible = false;
        if (this.carrying === p) this.carrying = null;
        this.smoke.remove(k);
        this.plane.parts[k].visible = true;
        this.plane.ghosts[k].visible = false;
        if (this.installed.size === 6) this.smoke.remove('wreck');
        if (!d.silent) {
          this.audio.success();
          this.repairFx?.(this.plane.body.localToWorld(this.plane.parts[k].position.clone()));
          if (this.installed.size === 6) {
            this.ui.toast('Le Coucou est réparé !', this.crateLoaded ? 'Montez à bord.' : 'Reste la caisse Hélios.', 'good');
            this.radioOnce('repaired', 'Le Coucou est entier ? C\'est incroyable. Chargez la caisse et décollez, cap sur Hélios !');
          } else this.ui.toast(`${ITEMS[k].name} fixé${me ? '' : ` par ${this.nameOf(by)}`}`, `${this.installed.size}/6 pièces`, 'good', 2200);
          if (k === 'floats') this.ui.toast('Il flotte à nouveau', '', 'good', 2000);
        }
        this.afterChange();
        return true;
      }
      case 'crate': {
        if (this.crateLoaded) return auth ? false : true;
        const c = this.items.crate;
        c.state = 'loaded'; c.mesh.visible = false; c.carrier = null;
        this.crateLoaded = true;
        this.plane.crateAboard.visible = true;
        this.cable.visible = false;
        if (!d.silent) { this.audio.success(); this.ui.toast('Caisse Hélios à bord', this.installed.size === 6 ? 'Tout est prêt.' : '', 'good', 2500); }
        this.afterChange();
        return true;
      }
      case 'tool': this.flags[d.k] = true; this.afterChange(); return true;
      case 'door': {
        if (this.flags.doorOpen) return true;
        this.flags.doorOpen = true;
        this.island.cabin.doorCollider.disabled = true;
        this.doorAnim = 0;
        this.audio.door();
        if (!me) this.ui.toast('Cabanon ouvert', `${this.nameOf(by)} a trouvé le code.`, 'good');
        this.afterChange();
        return true;
      }
      case 'duck': {
        if (this.ducks.has(d.id)) return auth ? false : true;
        this.ducks.add(d.id);
        this.duckMeshes[d.id].visible = false;
        this.audio.squeak();
        const n = this.ducks.size, N = this.duckSpots.length;
        this.ui.toast(`Canard ${n}/${N}`, me ? (n === N ? 'Collection complète ! Vous êtes officiellement très sérieux.' : 'Coin coin.') : `Trouvé par ${this.nameOf(by)}.`, 'good');
        if (n === 1) this.radioOnce('duck', 'C\'est… un canard en plastique ? On raconte que le gardien du phare en cachait partout sur l\'archipel.');
        if (n === N) this.radioOnce('ducks', 'Tous les canards ! Je ne sais pas si c\'est admirable ou inquiétant.');
        this.afterChange(false);
        return true;
      }
      case 'fuse': {
        if (this.fuses.has(d.k) || this.fuseSlots.some((s) => s.fuse === d.k)) return auth ? false : true;
        this.fuses.add(d.k);
        this.fuseMeshes[d.k].visible = false;
        this.audio.pickup();
        const n = this.fuses.size + this.fuseSlots.filter((s) => s.fuse).length;
        this.ui.toast(`Fusible ${{ red: 'rouge', blue: 'bleu', yellow: 'jaune' }[d.k]}`, `${n}/3 fusibles${me ? '' : ` · trouvé par ${this.nameOf(by)}`}.`, 'good');
        this.afterChange();
        return true;
      }
      case 'fslots': {
        const all = new Set([...this.fuses, ...this.fuseSlots.map((s) => s.fuse).filter(Boolean)]);
        d.slots.forEach((f, i) => { this.fuseSlots[i].fuse = f && all.has(f) ? f : null; this.island2.setFuse(i, this.fuseSlots[i].fuse); });
        this.fuses = new Set([...all].filter((f) => !this.fuseSlots.some((s) => s.fuse === f)));
        const ok = this.fuseSlots.every((s) => s.fuse === FUSE_SOLUTION[s.key]);
        if (ok && !this.flags.power) {
          this.flags.power = true;
          this.island2.setPower(true);
          this.audio.powerUp();
          this.ui.toast('Courant rétabli !', 'Le balisage de la piste s\'allume, l\'ascenseur de la tour ronronne.', 'good', 6000);
          this.radioOnce('power', 'Le courant revient, la pompe du ponton aussi ! La radio du Coucou grésille trop : montez à la tour, son émetteur porte jusqu\'au labo. Appelez-moi sur la fréquence écrite sur la caisse, la tour a aussi la météo.');
        }
        this.afterChange();
        return true;
      }
      case 'valve': {
        this.valves[d.k] = d.v;
        this.island2.setValve(d.k, d.v);
        if (!me) { this.audio.ratchet(); }
        this.afterChange(false);
        return true;
      }
      case 'hangar': {
        if (this.flags.hangarOpen) return true;
        this.flags.hangarOpen = true;
        this.island2.openHangar();
        this.audio.door();
        this.ui.toast('Hangar ouvert', 'Les portes coulissent lentement.', 'good');
        this.radioOnce('hangar', 'Les roues amphibies sont au fond du hangar. Montez-les sur les flotteurs, et l\'avion pourra rouler sur la piste.');
        this.afterChange();
        return true;
      }
      case 'flag': {
        for (const [k, v] of Object.entries(d)) {
          if (LOCAL_FLAGS.includes(k)) continue;
          const was = this.flags[k];
          this.flags[k] = v;
          if (!was && v) this.onFlag(k, me, by);
        }
        this.afterChange();
        return true;
      }
      case 'note': {
        d.text = String(d.text || '').replace(/[<>]/g, '').slice(0, 200);
        if (!this.notes.includes(d.text)) {
          this.notes.push(d.text);
          this.ui.toast(me ? 'Noté dans le carnet' : `Carnet · ${this.nameOf(by)}`, d.text, 'good');
          this.audio.beep();
          this.progress();
        }
        return true;
      }
      case 'music': this.music = !!d.on; this.audio.setMusic(this.music, 1); return true;
      case 'sym': {
        if (this.symbols.has(d.n)) return true;
        this.symbols.add(d.n);
        this.afterChange(false);
        return true;
      }
      case 'reserve': {
        if (this.flags.reserveUsed) return auth ? false : true;
        this.flags.reserveUsed = true;
        this.jerrycan.visible = false;
        if (this.ownsPlane()) this.flight.fuel = Math.min(this.flight.tankMax, this.flight.fuel + CFG.flight.reserveFuel);
        this.audio.pour();
        this.ui.toast('Carburant', `Bidon de secours vidé (+${CFG.flight.reserveFuel} %).`, 'good');
        this.afterChange(false);
        return true;
      }
      case 'fuel': { if (this.ownsPlane()) this.flight.fuel = Math.min(this.flight.tankMax, Math.max(this.flight.fuel, d.v)); return true; }
      case 'pilot': {
        if (d.on) {
          if (auth && this.pilotId && this.pilotId !== by && this.session?.players.has(this.pilotId)) return false;
          this.pilotId = by;
        } else if (this.pilotId === by) this.pilotId = null;
        return true;
      }
      case 'nozzle': {
        // pistolet de la pompe : qui le tient (null = raccroché, 'plane' = branché sur l'avion)
        if (auth && d.on && this.nozzle && this.nozzle !== by && this.nozzle !== 'plane' && this.session?.players.has(this.nozzle)) return false;
        this.nozzle = d.on ? (d.plane ? 'plane' : by) : null;
        return true;
      }
      case 'lockProg': { this.lockProg = d.v; return true; }
      case 'gen': { this.siege.genHp = Math.min(100, d.hp); return true; }
      case 'shop': {
        // achat au comptoir : pièces communes à l'équipage
        if (auth && this.scrap < d.cost) return false;
        this.scrap -= d.cost;
        if (d.up) this.upgrades.add(d.up);
        this.applyUpgrades();
        this.afterChange(false);
        return true;
      }
      case 'lever': {
        // deux leviers à tirer presque ensemble : l'hôte chronomètre à la réception
        const now = performance.now();
        this.leverT = this.leverT || {};
        this.leverTimers = this.leverTimers || {};
        this.leverT[d.k] = now;
        this.island2.setLever(d.k, true);
        if (!me) this.audio.clank();
        const win = this.playerCount() > 1 ? 2500 : 8000;
        clearTimeout(this.leverTimers[d.k]);
        this.leverTimers[d.k] = setTimeout(() => this.island2.setLever(d.k, false), win);
        if (auth && !this.flags.hangarOpen && this.flags.hangarCode) {
          const o = d.k === 'L' ? 'R' : 'L';
          if (this.leverT[o] && now - this.leverT[o] < win) setTimeout(() => this.act('hangar'), 0);
        }
        return true;
      }
      case 'scrap': { this.scrap += d.n; this.afterChange(false); return true; }
      case 'scrapTake': {
        const pile = (this.scrapPiles || []).find((q) => q.id === d.sid);
        if (pile && pile.taken && auth && !me) return false;
        if (pile) { pile.taken = true; pile.mesh.visible = false; }
        this.scrap += d.n;
        this.afterChange(false);
        return true;
      }
      case 'puzzle': { this.puzzles[d.k] = d.v; this.afterChange(false); return true; }
      case 'irot': { if (!it || it.state !== 'ground') return false; it.rotY = d.r; this.poseGround(it); return true; }
      case 'newday': { this.newDayLocal(); return true; }
      default: {
        const ir = this.applyInvAct?.(type, d, by, auth);
        if (ir !== null && ir !== undefined) return ir;
        const vr = this.applyVehicleAct?.(type, d, by, auth);
        if (vr !== null && vr !== undefined) return vr;
        const r3 = this.applyChapter3Act?.(type, d, by, auth);
        if (r3 !== null && r3 !== undefined) return r3;
        const r4 = this.applyChapter4Act?.(type, d, by, auth);
        if (r4 !== null && r4 !== undefined) return r4;
        const r = this.applyWreckAct?.(type, d, by, auth);
        return r === null || r === undefined ? true : r;
      }
    }
  },

  nameOf(id) {
    if (!this.session) return 'Vous';
    if (id === this.session.me) return 'vous';
    return this.session.players.get(id)?.name || 'un coéquipier';
  },

  afterChange(progress = true) {
    if (progress) this.progress();
    this.refreshCarnet();
    if (this.isAuthority()) this.dirtyWorld = true;
  },

  // effets d'un drapeau qui passe à vrai (sur toutes les machines)
  onFlag(k, me, by) {
    const F = this.fun;
    if (k === 'treasure') {
      this.flags.compass = true;
      F.treasure.mark.visible = false;
      F.treasure.chest.visible = true;
      this.audio.success();
      this.ui.toast('Trésor !', me ? 'Une vieille boussole de pilote. Elle s\'affiche en haut de l\'écran.' : `${this.nameOf(by)} a déterré une boussole : tout l'équipage en profite.`, 'good', 6000);
      this.radioOnce('treasure', 'Une boussole ? Parfait. Avec elle et le radar, vous ne vous perdrez plus.');
    } else if (k === 'bottle') F.bottle.group.visible = false;
    else if (k === 'chest') { this.audio.success(); if (!me) this.ui.toast('Coffre du canot ouvert', `${this.nameOf(by)} a trouvé la combinaison. Servez-vous : pistolets de détresse !`, 'good'); }
    else if (k === 'kingDead') { F.harpoonRack.group.visible = true; this.applyUpgrades(); }
    else if (k === 'wardenDead') this.applyUpgrades();
    if (k === 'radioDone' && !this.hasItem('talkie')) {
      this.giveItem('talkie', 1, {}, { silent: true });
      setTimeout(() => this.ui.toast('Talkie-walkie', 'B : parler à tout l\'équipage.', 'good', 3500), 2500);
    }
    if (k === 'radioDone' && !me) {
      this.ui.radio(`Enfin une liaison claire ! Tempête ce soir : il vous faudra la piste, donc les roues amphibies du hangar 2. Le code : ${CFG.island2.hangarCode}. Ma sœur était contrôleuse ici, c'était son code.`, () => this.audio.radio());
    } else if (k === 'ended') this.showEnd();
    else if (k === 'refueled') { this.audio.success(); this.ui.toast('Plein fait !', 'Réservoir à 100 %.', 'good'); }
    this.onFlag3?.(k, me, by);
    this.onFlag4?.(k, me, by);
  },

  // ── instantané complet (sauvegarde, synchro réseau) ──
  worldState() {
    const items = {};
    for (const [id, it] of Object.entries(this.items)) {
      let st = it.state, p = it.pos;
      if (st === 'flying') st = 'ground';
      if (st === 'carried' && it.carrier === this.myId()) p = this.playerWorld();
      items[id] = [ITEM_STATES.indexOf(st), +p.x.toFixed(2), +p.z.toFixed(2), +it.rotY.toFixed(2), it.carrier || 0, it.mode === 'diable' ? 1 : 0];
    }
    const flags = {};
    for (const [k, v] of Object.entries(this.flags)) if (v && !LOCAL_FLAGS.includes(k)) flags[k] = 1;
    return {
      seed: this.seed, hour: +this.hour.toFixed(4), installed: [...this.installed], crate: this.crateLoaded ? 1 : 0, flags, items,
      ducks: [...this.ducks], fuses: [...this.fuses], fslots: this.fuseSlots.map((s) => s.fuse), valves: this.valves,
      sym: [...this.symbols], music: this.music ? 1 : 0, siege: [this.siege.active ? 1 : 0, Math.round(this.siege.genHp), this.siege.wave],
      stats: [this.stats.crabs, this.stats.voiles, this.stats.days], live: this.planeLive ? 1 : 0, pilot: this.pilotId || 0,
      nozzle: this.nozzle || 0, iron: this.iron || 0, wr: this.wreck, wi: this.winch, scrap: this.scrap, ...this.invWorldState(), sp: (this.scrapPiles || []).filter((q) => q.taken && !q.dyn).map((q) => q.id), ups: [...this.upgrades], pz: this.puzzles, intro: this.mode === 'intro' ? 1 : 0, vh: this.vehicleState(), c3: this.chapter3State?.(), c4: this.c4State?.(),
    };
  },

  applyWorld(w, opts = {}) {
    if (!w) return;
    const full = !!opts.full;
    const me = this.myId();
    if (w.seed !== undefined && w.seed !== this.seed) this.buildIsland2(w.seed);
    if (full || !this.isAuthority()) this.hour = w.hour;
    // pièces installées
    const inst = new Set(w.installed || []);
    for (const k of PART_ORDER) {
      if (inst.has(k) && !this.installed.has(k)) { this.installed.add(k); this.smoke.remove(k); }
      if (!inst.has(k) && this.installed.has(k)) this.installed.delete(k);
      this.plane.parts[k].visible = this.installed.has(k);
    }
    if (this.installed.size === 6) this.smoke.remove('wreck');
    this.crateLoaded = !!w.crate;
    this.plane.crateAboard.visible = this.crateLoaded;
    // drapeaux
    const was = { ...this.flags };
    for (const k of Object.keys(this.flags)) if (!LOCAL_FLAGS.includes(k)) this.flags[k] = !!(w.flags || {})[k];
    for (const k of Object.keys(this.flags)) if (!was[k] && this.flags[k] && !full && k !== 'ended') this.onFlag(k, false, null);
    if (full && this.flags.treasure) this.flags.compass = true;
    // objets
    for (const [id, a] of Object.entries(w.items || {})) {
      const it = this.items[id];
      if (!it) continue;
      const [si, x, z, r, carrier, dia] = a;
      const st = ITEM_STATES[si];
      if (st === 'carried') {
        if (carrier === me) {
          if (this.carrying !== it) { it.state = 'ground'; this.placeItem(it, x, z, r); } // porteur fantôme : on repose l'objet
          continue;
        }
        if (this.carrying === it) this.carrying = null;
        it.state = 'carried'; it.carrier = carrier; it.mode = dia ? 'diable' : 'hand'; it.mesh.visible = true;
        this.smoke.remove(id);
      } else if (st === 'ground') {
        if (this.carrying === it) this.carrying = null;
        if (it.state !== 'ground' || Math.hypot(it.pos.x - x, it.pos.z - z) > 0.3 || full) this.placeItem(it, x, z, r);
        it.carrier = null;
      } else {
        if (this.carrying === it) this.carrying = null;
        it.state = st; it.carrier = null; it.mesh.visible = false;
        this.smoke.remove(id);
      }
    }
    // île 1
    if (this.flags.doorOpen) { this.island.cabin.doorCollider.disabled = true; if (full) { this.island.cabin.doorPivot.rotation.y = -1.75; this.doorAnim = 1; } else if (!was.doorOpen) this.doorAnim = 0; }
    const F = this.fun;
    if (this.flags.treasure) { F.treasure.mark.visible = false; F.treasure.chest.visible = true; if (full) { F.treasure.chest.position.y = F.treasure.pos.y; F.treasure.lid.rotation.x = -1.6; } }
    F.bottle.group.visible = !this.flags.bottle;
    F.harpoonRack.group.visible = this.flags.kingDead;
    if (full && this.flags.chest) F.survival.lid.rotation.x = -1.7;
    this.ducks = new Set(w.ducks || []);
    this.symbols = new Set(w.sym || []);
    if (!!w.music !== this.music) { this.music = !!w.music; this.audio.setMusic(this.music, 1); }
    // île 2
    this.fuses = new Set(w.fuses || []);
    (w.fslots || []).forEach((f, i) => { this.fuseSlots[i].fuse = f; this.island2.setFuse(i, f); });
    if (this.flags.power !== this.island2.power) this.island2.setPower(this.flags.power);
    for (const [k, v] of Object.entries(w.valves || {})) if (this.valves[k] !== v) { this.valves[k] = v; this.island2.setValve(k, v); }
    if (this.flags.hangarOpen && !was.hangarOpen) { if (full) this.island2.setHangarOpen(); else this.island2.openHangar(); }
    if (full && this.flags.hangarOpen) this.island2.setHangarOpen();
    this.flight.wheels = this.flags.wheels;
    this.plane.parts.wheels.visible = this.flags.wheels;
    this.jerrycan.visible = !this.flags.reserveUsed;
    if (w.siege) { this.siege.active = !!w.siege[0]; this.siege.genHp = w.siege[1]; this.siege.wave = w.siege[2]; }
    if (w.stats) { this.stats.crabs = w.stats[0]; this.stats.voiles = w.stats[1]; this.stats.days = w.stats[2]; }
    this.pilotId = w.pilot || null;
    this.nozzle = w.nozzle || null;
    this.iron = w.iron || null;
    this.scrap = w.scrap ?? this.scrap;
    if (w.wi) this.winch = { ...w.wi };
    if (w.wr) {
      this.wreck = JSON.parse(JSON.stringify(w.wr));
      // anciennes sauvegardes : deux trous seulement, pas de bosses
      while (this.wreck.holes.length < 4) this.wreck.holes.push(0);
      this.wreck.dents = this.wreck.dents || [];
      this.wreck.holes.forEach((h, i) => this.plane.setHole(i, h));
      for (const k of Object.keys(this.wreck.placed)) if (this.plane.parts[k]) this.plane.parts[k].visible = true;
      if ((this.flags.wrecked || this.wreck.stranded) && this.wreck.pos) { this.planeLive = false; this.setWreckPose(this.wreck.pos.x, this.wreck.pos.z, this.wreck.pos.yaw); }
      this.refreshWelds();
      this.refreshDamage();
    }
    // anciennes versions : roues amphibies « soudées » sur une épave (comptées comme une pièce) → roues montées
    if (this.installed.has('wheels') || (this.wreck.placed && 'wheels' in this.wreck.placed)) {
      this.installed.delete('wheels');
      delete this.wreck.placed.wheels;
      this.flags.wheels = true; this.flight.wheels = true;
      this.plane.parts.wheels.visible = true;
      if (this.items.wheels) { this.items.wheels.state = 'installed'; this.items.wheels.mesh.visible = false; }
      this.refreshWelds();
    }
    this.applyInvWorld(w);
    const spt = new Set(w.sp || []);
    for (const q of this.scrapPiles || []) if (!q.dyn) { q.taken = spt.has(q.id); q.mesh.visible = !q.taken; }
    this.upgrades = new Set(w.ups || []);
    this.puzzles = { ...(w.pz || {}) };
    this.applyVehicleState(w.vh, full);
    if (w.c3) this.applyChapter3State?.(w.c3, full, !!opts.load);
    if (w.c4) this.applyC4State?.(w.c4);
    this.applyUpgrades();
    // avion
    if (w.live && !this.planeLive) {
      this.planeLive = true; this.planeLift = 1;
      if (full || !this.flight.pos.lengthSq()) this.parkAt(this.flags.landed3 ? 3 : this.flags.tookOff ? 2 : 1);
    }
    if (!w.live && !this.planeLive && this.mode !== 'intro' && this.mode !== 'menu' && this.installed.size < 6 && !this.installed.has('floats')) this.setWreck();
    this.placeTools();
    this.refreshCarnet();
  },

  // l'hôte envoie l'instantané (à tous, ou à un joueur)
  sendWorld(to) {
    if (!this.session?.isHost) return;
    const w = this.worldState();
    w.ack = this.acks || {};
    this.session.send('world', w, to);
    if (to) this.session.send('notes', { notes: this.notes }, to);
  },
  onWorld(w) {
    if (this.session?.isHost) return;
    const myAck = (w.ack || {})[this.session.me] || 0;
    if (myAck < (this.mySeq || 0) && !this.forceWorld) return; // mes actions ne sont pas encore traitées
    this.forceWorld = false;
    this.applyWorld(w, { full: !this.gotWorld });
    this.gotWorld = true;
    if (this.lateSpawn) { this.lateSpawn = false; this.spawnNearHost(); }
  },

  newDayLocal() {
    this.flags.alarm = false; this.flags.h16 = false; this.flags.h18 = false;
    this.tox = 0;
    if (this.isAuthority()) { this.hour = CFG.time.restartHour + 0.2; this.stats.days++; this.enemies.clearVoiles(); }
  },

  // améliorations achetées au comptoir
  applyUpgrades() {
    const u = this.upgrades || new Set();
    this.flight.tankMax = u.has('tank') ? 140 : 100;
    this.flight.powerMul = u.has('engine') ? 1.25 : 1;
    this.plane.setUpgrade?.('stove', u.has('stove'));
    this.plane.setUpgrade?.('lamps', u.has('lamps'));
    this.plane.setUpgrade?.('rug', u.has('rug'));
    this.plane.setUpgrade?.('tank', u.has('tank'));
    this.plane.setUpgrade?.('engine', u.has('engine'));
    this.plane.setUpgrade?.('trophyKing', this.flags.kingDead);
    this.plane.setUpgrade?.('trophyWarden', this.flags.wardenDead);
  },

  // position monde d'un point du ponton/avion etc. (utilitaire)
  groundPoint(x, z) { return new THREE.Vector3(x, heightAt(x, z), z); },
  FUSE_SLOTS,
};
