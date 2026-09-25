// Interactions : prompts contextuels, énigmes, portage, pompe à carburant, comptoir
import * as THREE from 'three';
import { AMMO_MAX } from './arsenal.js';
import { CFG } from './config.js';
import { heightAt, LAYOUT } from './terrain.js';
import { SLOTS, PLANE_POINTS, SEATS, FLOOR, HOLES } from './planeModel.js';
import { GEAR } from './gear.js';
import { FLAT } from './island2.js';
import { ITEMS, TOOL_NAMES, SYMBOLS, SYMBOL_CODE } from './defs.js';
import { WEAPONS } from './weapons.js';

export const FUEL_CAP = new THREE.Vector3(1.5, 3.25, -0.6);   // bouchon du réservoir (aile droite)
const HOSE_LEN = 26;

// circuit hydraulique aléatoire mais toujours soluble
function makePipes(seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const W = 6, H = 4, src = Math.floor(rnd() * H), dst = Math.floor(rnd() * H);
  const cells = Array.from({ length: H }, () => Array(W).fill(0));
  // marche aléatoire sans recroisement de (0,src) à (W-1,dst)
  const seen = new Set();
  const path = [];
  const dfs = (x, y) => {
    seen.add(`${x},${y}`); path.push([x, y]);
    if (x === W - 1 && y === dst) return true;
    const dirs = [[1, 0], [0, 1], [0, -1], [-1, 0]].sort(() => rnd() - 0.5);
    dirs.sort((a, b) => (b[0] - a[0]) * (rnd() < 0.55 ? 1 : 0));
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(`${nx},${ny}`)) continue;
      if (dfs(nx, ny)) return true;
    }
    path.pop();
    return false;
  };
  dfs(0, src);
  const bit = (dx, dy) => (dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1);
  path.forEach(([x, y], i) => {
    let m = 0;
    if (i === 0) m |= 8; else { const [px, py] = path[i - 1]; m |= bit(px - x, py - y); }
    if (i === path.length - 1) m |= 2; else { const [nx, ny] = path[i + 1]; m |= bit(nx - x, ny - y); }
    cells[y][x] = m;
  });
  const shapes = [5, 3, 7, 3, 5]; // droit, coude, té
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!cells[y][x]) cells[y][x] = shapes[Math.floor(rnd() * shapes.length)];
  const rot = (m) => ((m << 1) | (m >> 3)) & 15;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) cells[y][x] = rot(cells[y][x]); }
  return { W, H, src, dst, cells };
}

// catalogue du comptoir
const SHOP = [
  { id: 'rod', icon: '🎣', name: 'Canne à pêche', desc: 'Pêchez, achevez, revendez', cost: 3, personal: true, give: ['rod', 1] },
  { id: 'talkie', icon: '📻', name: 'Talkie-walkie', desc: 'Parler à tout l\'équipage', cost: 5, personal: true, give: ['talkie', 1] },
  { id: 'flares', icon: '🎆', name: '6 fusées', desc: 'Pistolet de détresse', cost: 3, personal: true, give: ['a_flare', 6], gun: 'flare' },
  { id: 'harps', icon: '🔱', name: '4 harpons', desc: 'Fusil-harpon', cost: 4, personal: true, give: ['a_harpoon', 4], gun: 'harpoon' },
  { id: 'p9', icon: '🔫', name: '24 balles de 9 mm', desc: 'Pistolet', cost: 4, personal: true, give: ['a_p9', 24], gun: 'pistol' },
  { id: 'buck', icon: '💥', name: '12 cartouches', desc: 'Fusil à pompe', cost: 5, personal: true, give: ['a_buck', 12], gun: 'shotgun' },
  { id: 'r556', icon: '🎯', name: '48 balles de 5,56', desc: 'Carabine', cost: 7, personal: true, give: ['a_r556', 48], gun: 'rifle' },
  { id: 'chute', icon: '🪂', name: 'Parachute', desc: 'Sauter de l\'avion en vol', cost: 6, personal: true, give: ['parachute', 1], min: 2 },
  { id: 'bandage', icon: '🩹', name: '3 bandages', desc: '+45 santé chacun (H)', cost: 2, personal: true, give: ['bandage', 3] },
  { id: 'stakes', icon: '📍', name: '3 pieux d\'ancrage', desc: 'Ancrage du treuil', cost: 2, personal: true, give: ['stake', 3] },
  { id: 'mask', icon: '🦺', name: 'Gilet renforcé', desc: '−30 % de dégâts · poches 2×2', cost: 6, personal: true, give: ['c_armorvest', 1] },
  { id: 'satchel', icon: '👜', name: 'Sacoche', desc: 'Sac · poches 3×3', cost: 4, personal: true, give: ['c_satchel', 1] },
  { id: 'backpack', icon: '🎒', name: 'Sac à dos', desc: 'Sac · poches 4×4', cost: 10, personal: true, give: ['c_backpack', 1], min: 2 },
  { id: 'medkit', icon: '❤️', name: 'Repas chaud', desc: 'Santé au maximum, tout de suite', cost: 2, personal: true },
  { id: 'lamps', icon: '💡', name: 'Guirlande de cabine', desc: 'Le Coucou éclaire plus loin : les zombies y ralentissent', cost: 5, up: true },
  { id: 'rug', icon: '🪴', name: 'Tapis et plantes', desc: 'Cabine cosy : on y récupère deux fois plus vite', cost: 4, up: true },
  { id: 'stove', icon: '🔥', name: 'Petit poêle', desc: 'Recharge la lanterne et soigne à bord', cost: 8, up: true },
  { id: 'tank', icon: '🛢', name: 'Réservoir auxiliaire', desc: 'Capacité de carburant 140 %', cost: 12, up: true },
  { id: 'engine', icon: '🔧', name: 'Moteurs gonflés', desc: '+25 % de puissance et de vitesse', cost: 15, up: true },
];

export const InteractMixin = {
  handleInteractions(dt) {
    const inp = this.input, ui = this.ui;
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    const eye = this.camera.position;
    const me = this.playerWorld();
    const root = this.plane.root;
    const L = (v) => root.localToWorld(v.clone());
    const cands = [];
    const add = (pt, range, spec) => {
      const to = pt.clone().sub(eye);
      const d = to.length();
      const flat = Math.hypot(pt.x - me.x, pt.z - me.z);
      if (flat > range || Math.abs(pt.y - me.y) > 4) return;
      const dot = d > 0.01 ? to.normalize().dot(look) : 1;
      if (dot < 0.6 && flat > 1.2) return;
      cands.push({ ...spec, score: flat * (1.6 - dot) - (spec.prio || 0) });
    };

    if (this.seat || this.lying) {
      ui.prompt('');
      if (inp.hit('KeyE')) this.standUp();
      return;
    }

    if (this.aboard) this.cabinInteractions(add, L);
    else this.worldInteractions(add, L, me);
    this.mateInteractions(add, me);

    cands.sort((a, b) => a.score - b.score);
    const c = cands[0];
    let prompt = c ? c.prompt : '';
    let holding = false;
    this.cable.visible = false;
    if (c) {
      if (c.alt && inp.hit('KeyR')) c.alt();
      else if (c.press && inp.hit('KeyE')) c.press();
      else if (c.hold && inp.down('KeyE')) {
        holding = true;
        const before = this.holdT;
        this.holdT += dt;
        if (c.hold.tick) c.hold.tick(dt, before);
        if (c.hold.seconds) ui.hold(this.holdT / c.hold.seconds);
        if (c.hold.seconds && this.holdT >= c.hold.seconds) { this.holdT = 0; c.hold.done(); }
      }
      c.show?.();
    }
    if (this.mode !== 'explore') return;
    if (!holding) { this.holdT = 0; ui.hold(0); }
    for (const k of Object.keys(this.plane.ghosts)) {
      if (!(c && c.kind === 'install' && this.carrying && this.carrying.id === k)) this.plane.ghosts[k].visible = false;
    }
    if (this.carrying) {
      const it = this.carrying;
      const near = Math.hypot(root.position.x - me.x, root.position.z - me.z) < 30;
      if (near && this.plane.ghosts[it.id] && !(it.id === 'prop' && !this.installed.has('engineL'))) this.plane.ghosts[it.id].visible = true;
      const help = this.carryHelp();
      const sub = (this.carryMode === 'diable' ? 'sur le diable · rapide' : it.def.weight >= 3 ? 'à bout de bras · très lent' : it.def.weight === 2 ? 'à bout de bras · lent' : '') + (help ? ` · aidé par ${help}` : '');
      ui.carry(it.def.name, sub);
      if (!prompt) prompt = '<kbd>G</kbd> Lâcher';
      if (inp.hit('KeyG')) this.dropCarried();
    } else if (this.nozzle === this.myId()) {
      ui.carry('Pistolet de la pompe', 'aile droite');
      if (!prompt) prompt = '<kbd>G</kbd> Raccrocher';
      if (inp.hit('KeyG')) this.act('nozzle', { on: false });
    } else ui.carry('');
    ui.prompt(prompt);
  },

  // un coéquipier proche aide à porter : vitesse ×2,6
  carryHelp() {
    if (!this.carrying || this.carrying.def.weight < 3 || this.carryMode === 'diable') return null;
    const p = this.playerWorld();
    for (const m of this.mateList()) if (!m.downed && !m.aboard && !m.carry && m.pos.distanceTo(p) < 3.2) return m.name;
    return null;
  },

  mateInteractions(add, me) {
    this.helpingFish = false;
    for (const m of this.mateList()) {
      if (m.fishing && !this.aboard) {
        add(m.pos.clone().setY(me.y + 0.5), 3.2, { prio: 2, prompt: `<kbd>E</kbd> Aider ${m.name}`, hold: { tick: () => { this.helpingFish = true; } } });
      }
      if (!m.downed) continue;
      if (m.aboard !== this.aboard) continue;
      add(m.pos.clone().setY(me.y + 0.5), 2.4, {
        prio: 3,
        prompt: `<kbd>E</kbd> Relever ${m.name}`,
        hold: { seconds: 2.5, tick: (dt, b) => { if (Math.floor(b / 0.6) !== Math.floor(this.holdT / 0.6)) this.audio.beep(); }, done: () => { this.session.send('revive', { by: this.session.name }, m.id); this.ui.toast(`${m.name} est debout`, 'Beau travail d\'équipe.', 'good'); } },
      });
    }
  },

  seatTaken(id) { return this.mateList().some((m) => m.seat === id) || (id === 'pilot' && this.pilotId && this.pilotId !== this.myId()); },

  // interactions à l'intérieur de l'avion
  cabinInteractions(add, L) {
    for (const s of SEATS) {
      const pt = L(new THREE.Vector3(s.x, FLOOR + 0.7, s.z));
      if (this.seatTaken(s.id)) { add(pt, 1.4, { prompt: '<span class="warn">Occupé</span>' }); continue; }
      if (s.pilot) {
        add(pt, 1.6, {
          prompt: this.planeReady() ? '<kbd>E</kbd> Piloter' : this.wreckActive() ? `<span class="warn">${this.flags.wrecked ? 'Épave à réparer' : 'À sec : treuil vers l\'eau'}</span>` : `<span class="warn">Pas prêt</span> · ${this.installed.size}/6 pièces${this.crateLoaded ? '' : ', caisse'}`,
          press: () => { if (this.planeReady()) this.takeControls(); else this.sit(s); },
        });
      } else if (s.bunk) {
        const waitStorm = this.flags.radioDone && this.flags.wheels && this.flags.refueled && !this.flags.stormOver && this.hour < 18.4 && this.hour > 6;
        add(pt, 1.7, {
          prompt: waitStorm ? '<kbd>E</kbd> Attendre la tempête' : this.isNightish() ? (this.planeAfloatNow() ? '<kbd>E</kbd> Dormir' : '<span class="warn">Dormir : sur l\'eau seulement</span>') : '<kbd>E</kbd> S\'allonger',
          press: () => (waitStorm ? this.requestSleep(18.5) : this.isNightish() ? this.requestSleep() : this.sit(s)),
        });
      } else add(pt, 1.4, { prompt: '<kbd>E</kbd> S\'asseoir', press: () => this.sit(s) });
    }
    const doorPt = L(new THREE.Vector3(1.2, FLOOR + 1, 2.2));
    if (this.flags.doorJam) add(doorPt, 1.8, this.lockSpec());
    else if (this.flight.airborne) add(doorPt, 1.6, { prio: 1, prompt: `<kbd>E</kbd> Sauter${this.chuteReady() ? '' : ' <span class="warn">(sans parachute)</span>'}`, press: () => this.jumpOut() });
    // coffre du Coucou (partagé par l'équipage) : inventaire de l'avion et équipement installé
    add(L(new THREE.Vector3(-0.8, FLOOR + 0.5, 4.55)), 1.8, { prio: 1, prompt: '<kbd>E</kbd> Coffre du Coucou', press: () => { this.openInventory('plane'); this.audio.clank(); } });
    if (this.crateLoaded) {
      add(L(new THREE.Vector3(0.62, FLOOR + 0.8, 4.05)), 1.8, {
        prompt: '<kbd>E</kbd> Étiquette de la caisse',
        press: () => this.openNote('Étiquette de la caisse', 'LABORATOIRE HÉLIOS — FRAGILE<br>Ne pas ouvrir. Garder au frais et au sec.<br><br>En cas de problème : fréquence d\'urgence <b>127.35</b>', 'Caisse Hélios : fréquence d\'urgence 127.35'),
      });
    }
    if (!this.flags.reserveUsed) {
      add(L(new THREE.Vector3(1.0, FLOOR + 0.4, 3.0)), 1.6, { prompt: `<kbd>E</kbd> Bidon de secours (+${CFG.flight.reserveFuel} %)`, press: () => this.act('reserve') });
    }
    if (this.upgrades.has('stove')) {
      add(L(new THREE.Vector3(-1.0, FLOOR + 0.7, 1.85)), 1.6, {
        prompt: '<kbd>E</kbd> Poêle',
        press: () => { this.hp = CFG.player.health; this.oil = 100; this.audio.powerUp(); this.ui.toast('Au chaud', 'Santé et lanterne au max.', 'good', 1600); },
      });
    }
    if (this.carrying && this.carrying.id === 'dashboard') this.installCandidate(add, 'dashboard');
    add(L(new THREE.Vector3(-1.3, FLOOR + 1.35, 0.9)), 1.6, { prompt: '<kbd>E</kbd> Carte', press: () => { this.input.unlock(); this.toggleMap(true); } });
  },

  // interactions dehors
  worldInteractions(add, L, me) {
    const doorOut = L(PLANE_POINTS.doorOut);
    if (this.flags.doorJam) add(doorOut, 3.0, this.lockSpec());
    // poste à souder (flanc droit) : toujours accessible, pour ressouder bosses, tôles et pièces
    if (!this.flight.airborne || this.wreckActive()) this.welderSpecs(add);
    // treuil
    if (!this.crateLoaded) {
      const winchPt = L(PLANE_POINTS.winch);
      const crate = this.items.crate;
      if (crate.state === 'ground') {
        const d = Math.hypot(crate.pos.x - winchPt.x, crate.pos.z - winchPt.z);
        add(winchPt, 3.2, d > CFG.winch.range
          ? { prompt: `<span class="warn">Caisse trop loin (${Math.round(d)}/${CFG.winch.range} m)</span>` }
          : {
            prompt: `<kbd>E</kbd> Treuiller la caisse (${Math.round(d)} m)`,
            show: () => { this.cable.visible = true; this.setCable(this.cable, winchPt, crate.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0))); },
            hold: {
              tick: (dt, before) => {
                if (Math.floor(before / 0.12) !== Math.floor(this.holdT / 0.12)) this.audio.ratchet();
                const dir = new THREE.Vector2(winchPt.x - crate.pos.x, winchPt.z - crate.pos.z);
                const step = Math.min(dir.length(), CFG.winch.pullSpeed * dt * (1 + 0.5 * this.mateList().filter((m) => m.pos.distanceTo(winchPt) < 4).length));
                dir.normalize().multiplyScalar(step);
                crate.pos.x += dir.x; crate.pos.z += dir.y;
                this.poseGround(crate);
                this._winchSend = (this._winchSend || 0) + dt;
                if (this._winchSend > 0.25) { this._winchSend = 0; this.act('itemPos', { id: 'crate', x: crate.pos.x, z: crate.pos.z }); }
                if (Math.hypot(crate.pos.x - winchPt.x, crate.pos.z - winchPt.z) < 2.6) this.act('crate');
              },
            },
          });
      }
    }
    if (this.carrying && this.plane.ghosts[this.carrying.id]) this.installCandidate(add, this.carrying.id);
    // avion coincé : on le pousse, ou on le treuille vers un arbre / un pieu
    if (!this.wreckActive() && this.canPushPlane()) { this.pushSpecs(add, me); this.winchSpecs(add); }
    // épave : tôles sur les trous, treuil
    if (this.wreckActive()) {
      if (this.carrying && this.carrying.def.plate) {
        this.wreck.holes.forEach((h, i) => {
          if (h !== 1) return;
          const hp = this.plane.body.localToWorld(HOLES[i].p.clone());
          add(hp, 3.2, { prio: 3, prompt: '<kbd>E</kbd> Plaquer la tôle', hold: { seconds: 0.8, done: () => this.act('plate', { i, id: this.carrying.id }) } });
        });
      }
      this.winchSpecs(add);
    }
    this.groundInteractions(add, me);

    // pistolet de la pompe tenu en main : le brancher sur l'avion
    if (this.nozzle === this.myId()) {
      add(L(FUEL_CAP), 3.4, { prio: 5, prompt: '<kbd>E</kbd> Brancher', press: () => { this.act('nozzle', { on: true, plane: true }); this.audio.clank(); this.ui.toast('Pistolet branché', 'Allez à la pompe.', 'good', 1800); } });
    }

    if (!this.carrying && this.nozzle !== this.myId()) {
      for (const it of Object.values(this.items)) {
        if (it.state !== 'ground') continue;
        if (it.def.mirror && this.mirrorOn(it) >= 0) continue;   // miroir sur son socle : voir physInteractions
        if (it.onVehicle) continue;
        const wgt = it.def.weight;
        if (wgt === 4) { add(it.mesh.position.clone(), 3.6, { prompt: `<span class="warn">${it.def.name} : trop lourd</span> · treuil` }); continue; }
        if (wgt >= 2 && this.heldKey() === 'diable') add(it.mesh.position.clone(), 3.6, { prompt: `<kbd>E</kbd> Diable : ${it.def.name}`, press: () => this.pickUp(it, 'diable') });
        else {
          const slow = wgt === 3 ? ' <span class="warn">(très lent)</span>' : wgt === 2 ? ' (lent)' : '';
          add(it.mesh.position.clone(), wgt >= 3 ? 3.6 : CFG.player.interactDistance, { prompt: `<kbd>E</kbd> Porter : ${it.def.name}${slow}`, press: () => this.pickUp(it, 'hand') });
        }
      }
      for (const [k, t] of Object.entries(this.tools)) {
        if (!this.lootTaken[`tool:${k}`] && t.mesh.visible) add(t.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 2.6, { prompt: `<kbd>E</kbd> ${GEAR[k].name}`, press: () => this.takeTool(k) });
      }
    }
    for (const d of this.duckSpots) {
      if (this.ducks.has(d.id)) continue;
      add(this.duckMeshes[d.id].position.clone(), 2.4, { prompt: '<kbd>E</kbd> Canard en plastique', press: () => this.act('duck', { id: d.id }) });
    }
    // ferraille au sol
    for (const s of this.scrapPiles || []) {
      if (s.taken) continue;
      add(s.pos, 2.4, { prompt: `<kbd>E</kbd> Coquillages +${s.n} 🐚`, press: () => this.takeScrap(s) });
    }

    this.vehicleInteractions(add, me);
    this.lootInteractions(add, me);
    this.c3Interactions(add, me);
    this.c4Interactions(add, me);
    // ── île 1 ──
    const cab = this.island.cabin;
    if (!this.flags.doorOpen) {
      add(cab.pos.clone().add(new THREE.Vector3(-0.15, 1.5, 0)), 2.4, { prompt: '<kbd>E</kbd> Lire le mot', press: () => this.openNote('Mot sur la porte', 'Code du cabanon = les trois derniers chiffres de l\'année du phare.<br>— le gardien', 'Mot du gardien : « Code du cabanon = les trois derniers chiffres de l\'année du phare. »') });
      add(cab.pos.clone().add(new THREE.Vector3(0.45, 1.05, 0)), 2.4, { prompt: '<kbd>E</kbd> Cadenas', press: () => this.openCabinLock() });
    }
    add(this.island.plaquePos, 2.6, { prompt: '<kbd>E</kbd> Lire la plaque', press: () => this.openNote('Plaque du phare', 'PHARE DE LA POINTE<br>mis en service en 1874', 'Plaque du phare : « mis en service en 1874 »') });
    const F = this.fun;
    add(F.hammock.pos, 2.6, { prompt: '<kbd>E</kbd> Hamac', press: () => this.lieDown() });
    add(F.boombox.pos, 2.4, { prompt: this.music ? '<kbd>E</kbd> Couper la musique' : '<kbd>E</kbd> Poste radio', press: () => this.toggleMusic() });
    if (!this.flags.treasure) {
      add(F.treasure.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 2.2, {
        prompt: '<kbd>E</kbd> Creuser',
        hold: { seconds: 3.5, tick: (dt, before) => { if (Math.floor(before / 0.5) !== Math.floor(this.holdT / 0.5)) this.audio.dig(); }, done: () => { this.act('flag', { treasure: true }); this.act('scrap', { n: 4 }); } },
      });
    }
    if (!this.flags.bottle) add(F.bottle.pos, 2.2, { prompt: '<kbd>E</kbd> Bouteille', press: () => this.readBottle() });
    // symboles peints (énigme du coffre)
    for (const s of F.symbols) {
      add(s.pos, 3.2, {
        prompt: `<kbd>E</kbd> Symbole peint${this.symbols.has(s.n) ? ' (noté)' : ''}`,
        press: () => {
          this.act('sym', { n: s.n });
          this.openNote('Symbole peint', `<span style="font-size:64px">${s.sym}</span><br>Un petit <b>${s.n}</b> est gravé dessous, ${s.where}.`, `Symbole n° ${s.n} : ${s.sym} (${s.where})`);
        },
      });
    }
    add(F.survival.pos, 2.6, this.flags.chest
      ? { prompt: '<kbd>E</kbd> Coffre du canot', press: () => this.takeFromChest() }
      : { prompt: '<kbd>E</kbd> Coffre du canot (cadenas)', press: () => this.openSymbolLock() });
    if (this.flags.kingDead) add(F.harpoonRack.pos, 2.8, { prompt: `<kbd>E</kbd> ${this.lootTaken.harpoonGun ? 'Harpons' : 'Fusil-harpon'}`, press: () => this.takeHarpoon() });
    // griller un poisson au feu de camp
    if (this.fishCount()) add(this.island.fire.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 3.2, { prompt: '<kbd>E</kbd> Griller un poisson', press: () => this.grillFish() });
    // comptoir de l'île 1 (camp abandonné)
    add(new THREE.Vector3(LAYOUT.camp.x + 2.2, heightAt(LAYOUT.camp.x + 2.2, LAYOUT.camp.z + 1.5) + 0.9, LAYOUT.camp.z + 1.5), 2.8, { prompt: '<kbd>E</kbd> Troc de Jo', press: () => this.openShop(1) });

    // ── île 2 ──
    const I = this.island2, P = I.points;
    if (Math.hypot(me.x - I.cx, me.z - I.cz) < 320) {
      for (const [k, m] of Object.entries(this.fuseMeshes)) {
        if (!m.visible) continue;
        if (k === 'blue' && !this.puzzles.laser) continue;
        if (k === 'yellow' && (this.pz2?.cage || 0) < 0.7) continue;
        const where = { red: 'Fusible rouge', blue: 'Fusible bleu', yellow: 'Fusible jaune' }[k];
        add(this.fuseSpots[k], 2.4, { prio: 2, prompt: `<kbd>E</kbd> ${where}`, press: () => this.act('fuse', { k }) });
      }
      this.physInteractions(add, me);
      add(P.fusePanel, 2.6, { prompt: '<kbd>E</kbd> Tableau électrique', press: () => this.openFusePanel() });
      add(P.poster, 2.8, { prompt: '<kbd>E</kbd> Affiche', press: () => this.openNote('Consignes électriques', 'La centrale (à l\'ouest du terminal) a trois circuits, chacun son fusible :<br>☀ Éclairage : fusible <b>ROUGE</b> — rechange sur le toit du terminal, près des projecteurs<br>⚓ Ponton et pompe : fusible <b>BLEU</b> — rechange au coffre du poste de sécurité<br>✈ Balisage de piste : fusible <b>JAUNE</b> — rechange dans le local technique, en bout de piste', 'Affiche du terminal : ☀ rouge (toit) · ⚓ bleu (poste de sécurité) · ✈ jaune (local de bout de piste)') });
      const inCab = me.y > FLAT + 10;
      if (!inCab) add(P.lift, 2.4, { prompt: I.power ? '<kbd>E</kbd> Ascenseur' : '<span class="warn">Pas de courant</span>', press: () => { if (I.power) this.useLift(true); else this.audio.error(); } });
      if (inCab) {
        add(P.liftTop, 2.2, { prompt: '<kbd>E</kbd> Descendre', press: () => this.useLift(false) });
        add(P.console, 2.4, { prompt: '<kbd>E</kbd> Radio de la tour', press: () => this.openRadio() });
      }
      add(P.hangarPad, 2.4, { prompt: this.flags.hangarOpen ? 'Hangar ouvert' : '<kbd>E</kbd> Clavier du hangar', press: () => { if (!this.flags.hangarOpen) this.openHangarPad(); } });
      add(P.shed, 2.6, { prompt: '<kbd>E</kbd> Consigne', press: () => this.openNote('Consigne du dépôt', 'La cuve alimente la pompe du ponton.<br>Après un long arrêt : <b>purger le circuit</b> depuis le panneau de la pompe,<br>puis <b>doser la pression</b> : trop fort, la sécurité saute.', 'Dépôt : purger le circuit au panneau de la pompe, puis doser la pression') });
      add(P.vending, 2.2, { prompt: '<kbd>E</kbd> Sodas', press: () => this.soda() });
      // pompe : pistolet et panneau
      if (this.nozzle === null && !this.flags.refueled || this.nozzle === null && this.flight.fuel < this.flight.tankMax - 1) {
        add(P.pump.clone().add(new THREE.Vector3(0, 0.3, 0)), 2.6, { prio: 1, prompt: '<kbd>E</kbd> Pistolet de la pompe', press: () => { this.act('nozzle', { on: true }); this.audio.clank(); } });
      }
      if (this.nozzle === 'plane') add(P.pump.clone().add(new THREE.Vector3(0, 0.9, 0)), 2.8, { prio: 2, ...this.pumpSpec() });
      if (this.nozzle === 'plane') add(L(FUEL_CAP), 3.0, { prompt: '<kbd>E</kbd> Débrancher', press: () => { this.act('nozzle', { on: true }); } });
      // armes et comptoir
      add(P.flareBox, 2.6, { prompt: '<kbd>E</kbd> Caisse de fusées', press: () => this.takeFlares() });
      add(P.harpRack, 2.6, { prompt: '<kbd>E</kbd> Râtelier de pêche', press: () => this.takeHarpoon() });
      add(P.bar, 3.4, { prompt: '<kbd>E</kbd> Bar de l\'Escale', press: () => this.openShop(2) });
      if (this.siege.active || this.siege.genHp < 100) {
        const hp = Math.round(this.siege.genHp);
        add(P.generator, 3.0, hp >= 100 ? { prompt: 'Générateur : en marche' } : this.hasItem('wrench')
          ? { prio: 2, prompt: `<kbd>E</kbd> Réparer (${hp} %)`, hold: { tick: (dt, b) => { if (Math.floor(b / 0.3) !== Math.floor(this.holdT / 0.3)) this.audio.clank(); this.repairGen(dt); } } }
          : { prompt: `<span class="warn">Générateur ${hp} % · clé à molette</span>` });
      }
    }
  },

  installCandidate(add, k) {
    const slot = this.plane.body.localToWorld(SLOTS[k].clone());
    const me = this.playerWorld();
    const dist = Math.hypot(slot.x - me.x, slot.z - me.z);
    if (dist > CFG.carry.installDistance && !(k === 'dashboard' && this.aboard)) return;
    if (k === 'prop' && !this.installed.has('engineL')) { add(slot, 99, { prompt: '<span class="warn">Moteur gauche d\'abord</span>', kind: 'install' }); return; }
    if (this.wreckActive() && k !== 'wheels') {
      // après un crash : on positionne la pièce, puis on la soude point par point (les roues se montent normalement)
      add(slot.clone().setY(me.y + 1), 99, {
        kind: 'install',
        prompt: `<kbd>E</kbd> Positionner : ${this.carrying.def.name}`,
        show: () => { this.plane.ghosts[k].visible = true; },
        hold: { seconds: 1.0, done: () => this.act('place', { k, id: k }) },
      });
      return;
    }
    const helpers = this.mateList().filter((m) => m.pos.distanceTo(me) < 4 && !m.aboard).length;
    const dur = (this.hasItem('wrench') ? CFG.carry.repairSecondsWrench : CFG.carry.repairSeconds) / (1 + helpers * 0.6);
    add(slot.clone().setY(me.y + 1), 99, {
      kind: 'install',
      prompt: `<kbd>E</kbd> Fixer : ${this.carrying.def.name}${this.hasItem('wrench') ? '' : ' <span class="warn">(sans clé)</span>'}${helpers ? ` · ${helpers + 1} mécanos` : ''}`,
      show: () => { this.plane.ghosts[k].visible = true; },
      hold: {
        seconds: dur,
        tick: (dt, before) => { if (Math.floor(before / 0.3) !== Math.floor(this.holdT / 0.3)) this.audio.clank(); },
        done: () => this.act('install', { k, id: k }),
      },
    });
  },

  valvesOk() { return Object.entries(CFG.island2.valves).every(([k, v]) => this.valves[k] === v); },
  pumpSpec() {
    const I = this.island2;
    if (!I.power) return { prompt: '<span class="warn">Pompe : pas de courant</span>' };
    return { prompt: `<kbd>E</kbd> Pompe (${Math.round(this.flight.fuel)} %)`, press: () => this.openPump() };
  },

  // ── tuyau de la pompe : un vrai tube qui suit le porteur ──
  updateHose() {
    const P = this.island2.points;
    const holder = this.nozzle;
    if (!holder || !this.inGame()) { if (this.hoseMesh) this.hoseMesh.visible = false; this.island2.setNozzle?.(true); return; }
    let end = null;
    if (holder === 'plane') end = this.plane.root.localToWorld(FUEL_CAP.clone());
    else if (holder === this.myId()) {
      const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw);
      const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
      end = this.camera.position.clone().addScaledVector(fw, 0.55).addScaledVector(right, 0.28).add(new THREE.Vector3(0, -0.38, 0));
    } else { const m = this.mateList().find((q) => q.id === holder); if (m) end = m.pos.clone().add(new THREE.Vector3(0, 1.0, 0)); }
    if (!end) { if (this.hoseMesh) this.hoseMesh.visible = false; return; }
    const start = P.pump.clone().add(new THREE.Vector3(0, 0.9, 0));
    const dist = start.distanceTo(end);
    if (dist > HOSE_LEN && this.isAuthority() && holder !== 'plane') { this.act('nozzle', { on: false }); this.ui.toast('Le tuyau est trop court', 'Le pistolet vous échappe des mains et retourne à la pompe.', 'bad'); return; }
    if (dist > HOSE_LEN + 6 && holder === 'plane' && this.ownsPlane()) { this.act('nozzle', { on: false }); this.ui.toast('Tuyau arraché !', 'L\'avion s\'est éloigné de la pompe.', 'bad'); return; }
    const sag = Math.max(0.4, (HOSE_LEN - dist) * 0.18);
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const p = start.clone().lerp(end, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      p.y = Math.max(p.y, this.groundAt(p.x, p.z, p.y + 2) + 0.06);
      pts.push(p);
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 6, false);
    if (!this.hoseMesh) {
      this.hoseMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#1d2233' }));
      this.hoseMesh.castShadow = true;
      this.scene.add(this.hoseMesh);
      this.hoseNozzle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.32), new THREE.MeshLambertMaterial({ color: '#ffd166' }));
      this.scene.add(this.hoseNozzle);
    } else { this.hoseMesh.geometry.dispose(); this.hoseMesh.geometry = geo; }
    this.hoseMesh.visible = true;
    this.hoseNozzle.visible = holder !== this.myId();
    this.hoseNozzle.position.copy(end);
    this.island2.setNozzle?.(false);
  },

  // ── actions simples ──
  sit(s) { this.seat = s; this.player.pos.set(s.x, FLOOR, s.z); this.player.yaw = s.yaw; this.player.pitch = 0; this.audio.drop(); },
  standUp() {
    if (this.seat) { const s = this.seat; this.seat = null; this.player.pos.set(s.x + (s.x < 0 ? 0.55 : -0.55), FLOOR, s.z); if (s.bunk) this.player.pos.set(-0.2, FLOOR, s.z); }
    else { this.lying = false; this.player.place(this.fun.hammock.pos.x + 1.2, this.fun.hammock.pos.z + 1.2, this.player.yaw); }
  },
  isNightish() { const h = ((this.hour % 24) + 24) % 24; return h >= 18 || h < 6.5; },
  // dormir : en équipe, tout le monde doit être à bord
  requestSleep(until) {
    if (!until && !this.planeAfloatNow()) { this.audio.error(); this.ui.toast('Impossible de dormir ici', 'L\'avion doit être sur l\'eau.', 'bad', 3000); return; }
    const out = this.mateList().filter((m) => !m.aboard && !m.downed);
    if (out.length) { this.ui.toast('Pas encore', `Tout l'équipage doit être à bord (${out.map((m) => m.name).join(', ')} dehors).`, 'bad'); return; }
    if (this.session && !this.session.isHost) { this.session.send('sleepReq', { until }, this.session.hostId); return; }
    this.doSleep(until);
    this.session?.send('sleep', { until });
  },
  doSleep(until) {
    this.ui.fade(1, '#000', 700);
    this.input.unlock();
    setTimeout(() => {
      if (this.isAuthority()) {
        if (until) this.hour = until;
        else { this.hour = CFG.time.restartHour + 0.2; this.stats.days++; this.enemies.clearVoiles(); }
      }
      this.flags.alarm = until ? this.flags.alarm : false; this.flags.h16 = !!until; this.flags.h18 = false;
      this.hp = CFG.player.health; this.stamina = CFG.player.stamina; this.tox = 0;
      this.ui.fade(0, '#000', 1400);
      this.input.lock();
      this.ui.toast(until ? 'Repos' : 'Bien dormi', until ? 'Le vent se lève. La tempête arrive.' : `Il est ${this.clock()}. Le soleil a renvoyé les zombies sous terre.`, until ? 'bad' : 'good');
      if (!until) this.radioOnce('slept', 'Bonne nuit dans la carlingue ? Sur l\'eau, les zombies ne vous atteignent pas : ils ne savent pas nager.');
      this.save();
    }, 900);
  },
  lieDown() {
    this.lying = true;
    this.player.pos.copy(this.fun.hammock.pos);
    this.player.pitch = 0.5;
    this.radioOnce('hammock', 'Une sieste ? Vraiment ? … Bon, cinq minutes. Mais pas une de plus.');
  },
  toggleMusic() {
    this.act('music', { on: !this.music });
    this.audio.beep();
    if (this.music) this.radioOnce('music', 'C\'est vous qui passez cette musique ? On l\'entend jusqu\'au labo. Enfin, presque.');
  },
  readBottle() {
    this.act('flag', { bottle: true });
    this.audio.pickup();
    this.openNote('Message dans une bouteille', 'Si tu lis ça, j\'ai caché mes affaires sous la croix rouge,<br>sur la plage au nord, là où la colline regarde la mer.<br>Il y a un rocher peint juste à côté.<br>Et mon coffre de survie, au bout du ponton : trois symboles,<br>dans l\'ordre de mes trois repères. Le premier veille la nuit.<br>— Jo, ancien gardien du phare', 'Bouteille : trésor sous la croix rouge (plage nord). Coffre du ponton : 3 symboles, « le premier veille la nuit »');
  },
  soda() {
    if (this.t - this.sodaT < 30) { this.ui.toast('Distributeur', 'Il reprend son souffle. Vous aussi.', 'bad', 1800); return; }
    this.sodaT = this.t;
    this.stamina = CFG.player.stamina;
    this.hp = Math.min(CFG.player.health, this.hp + 15);
    this.audio.clank();
    this.ui.toast('Soda tiède', 'Goût « Tropical 1987 ». Souffle au maximum.', 'good');
  },
  useLift(up) {
    if (up && !this.puzzles.lift) {
      // première utilisation : le séquenceur de sécurité de l'ascenseur
      this.openModalCommon();
      const notes = [523, 659, 784, 988];
      this.ui.simon({
        title: 'Ascenseur · séquenceur de sécurité',
        onPad: (i) => this.audio.note(notes[i]),
        onFail: () => this.audio.error(),
        onSolve: () => { this.act('puzzle', { k: 'lift', v: 1 }); this.audio.powerUp(); this.closeModal(true); this.useLift(true); },
      }, () => this.input.lock());
      return;
    }
    const P = this.island2.points;
    this.audio.door();
    this.ui.fade(1, '#000', 300);
    setTimeout(() => {
      if (up) this.player.pos.copy(P.liftTop);
      else this.player.pos.set(P.lift.x, FLAT, P.lift.z - 1.2);
      this.player.velY = 0;
      this.ui.fade(0, '#000', 500);
    }, 350);
  },
  toggleValve(k) {
    this.act('valve', { k, v: !this.valves[k] });
    this.audio.ratchet(); this.audio.clank();
    if (k === 'A' && this.valves[k]) this.ui.toast('Vanne A ouverte', 'Ça coule par terre… c\'est la vidange !', 'bad');
  },
  takeScrap(s) {
    s.taken = true;
    s.mesh.visible = false;
    this.act('scrapTake', { sid: s.id, n: s.n });
    this.audio.pickup();
    this.ui.toast(`+${s.n} 🐚`, `Bourse de l'équipage : ${this.scrap} coquillages.`, 'good', 1800);
  },

  // ── armes ──
  takeFromChest() {
    const W = WEAPONS.flare;
    if (!this.lootTaken.flareGun) {
      this.lootTaken.flareGun = 'got';
      this.giveEquip('flare', { ammo: W.start, silent: true });
      this.audio.success();
      this.ui.toast('Pistolet de détresse', this.keyHint('flare'), 'good', 3000);
      this.radioOnce('flare', 'Un pistolet de détresse ! Une fusée éblouit les zombies et éclaire une vingtaine de secondes. Gardez-en pour la nuit.');
    } else if (!this.lootUsed('chestFlares')) { this.markLoot('chestFlares'); this.giveItem('a_flare', 6, {}, { toSlot: false }); this.audio.pickup(); this.ui.toast('Fusées', '+6', 'good', 1400); }
    else this.ui.toast('Coffre vide', 'Revient demain.', '', 1400);
    this.refreshCarnet();
  },
  takeFlares() {
    if (this.t - (this.refillT.flare || -99) < 45 && this.hasItem('flare')) { this.ui.toast('Caisse vide', 'Revenez plus tard.', 'bad', 1400); return; }
    this.refillT.flare = this.t;
    if (!this.hasItem('flare')) this.giveEquip('flare', { silent: true });
    this.giveItem('a_flare', 6, {}, { toSlot: false, silent: true });
    this.audio.pickup();
    this.ui.toast('Fusées', '+6', 'good', 1400);
  },
  takeHarpoon() {
    const W = WEAPONS.harpoon;
    if (!this.lootTaken.harpoonGun) {
      this.lootTaken.harpoonGun = 'got';
      this.giveEquip('harpoon', { ammo: 4, silent: true });
      this.audio.success();
      this.ui.toast('Fusil-harpon', this.keyHint('harpoon'), 'good', 3000);
      this.radioOnce('harp', 'Un fusil-harpon. Visez bien : chaque harpon compte. Ils se ramassent en passant dessus.');
    } else {
      if (this.t - (this.refillT.harp || -99) < 45) { this.ui.toast('Râtelier vide', 'Revenez plus tard.', 'bad', 1400); return; }
      this.refillT.harp = this.t;
      this.giveItem('a_harpoon', 4, {}, { toSlot: false }); this.audio.pickup(); this.ui.toast('Harpons', '+4', 'good', 1400);
    }
    void W;
  },
  repairGen(dt) {
    const hp = Math.min(100, this.siege.genHp + 12 * dt);
    this.siege.genHp = hp;
    this._genSend = (this._genSend || 0) + dt;
    if (this._genSend > 0.3 || hp >= 100) { this._genSend = 0; this.act('gen', { hp }); }
  },

  // ── fenêtres ──
  openModalCommon() { this.input.unlock(); this.ui.prompt(''); },
  closeModal(silent) { if (this.ui.modalOpen()) { this.modalClosedT = performance.now(); this.ui.closeModal(); } if (!silent && this.mode === 'explore') this.input.lock(); },
  openNote(title, html, note) {
    this.openModalCommon();
    this.ui.note(title, html, () => this.input.lock());
    if (note) this.addNote(note);
  },
  addNote(n) { if (!this.notes.includes(n)) this.act('note', { text: n }); },
  openCabinLock() {
    this.openModalCommon();
    this.ui.keypad('Cadenas du cabanon', 3, (code) => {
      if (code !== CFG.code) { this.audio.error(); return false; }
      this.act('door');
      this.audio.success();
      setTimeout(() => this.closeModal(), 400);
      this.ui.toast('Cadenas ouvert', 'La porte du cabanon grince.', 'good');
      return true;
    }, () => this.input.lock());
  },
  openSymbolLock() {
    this.openModalCommon();
    this.ui.symbolLock(SYMBOLS, (vals) => {
      if (vals.join('') !== SYMBOL_CODE.join('')) { this.audio.error(); return false; }
      this.act('flag', { chest: true });
      this.act('scrap', { n: 3 });
      setTimeout(() => { this.closeModal(); this.takeFromChest(); }, 700);
      return true;
    }, () => this.input.lock());
  },
  openHangarPad() {
    this.openModalCommon();
    this.ui.keypad('Hangar 2 · accès', 3, (code) => {
      if (code !== CFG.island2.hangarCode) { this.audio.error(); return false; }
      if (!this.island2.power) { this.audio.error(); this.ui.toast('Code accepté', 'Mais le moteur de la porte ne répond pas : pas de courant.', 'bad'); return false; }
      this.act('hangar');
      this.audio.success();
      setTimeout(() => this.closeModal(), 400);
      return true;
    }, () => this.input.lock());
  },
  openFusePanel() {
    this.openModalCommon();
    const owned = [...this.fuses, ...this.fuseSlots.map((s) => s.fuse).filter(Boolean)];
    const slots = this.fuseSlots.map((s) => ({ ...s }));
    this.ui.fusePanel(slots, owned, (sl) => {
      this.audio.clank();
      const full = sl.every((s) => s.fuse);
      const ok = sl.every((s) => s.fuse === { sun: 'red', anchor: 'blue', plane: 'yellow' }[s.key]);
      this.act('fslots', { slots: sl.map((s) => s.fuse) });
      if (full && ok) setTimeout(() => this.closeModal(), 700);
      else if (full) {
        this.audio.spark();
        this.hp -= 8; this.lastHurt = this.t; this.ui.hurt(0.6); setTimeout(() => this.ui.hurt(0), 250);
        this.ui.toast('Court-circuit !', 'Voir l\'affiche du terminal.', 'bad', 3000);
      }
    }, () => this.input.lock());
  },
  openRadio() {
    if (!this.island2.power) { this.ui.toast('Radio éteinte', 'Pas de courant.', 'bad'); return; }
    this.openModalCommon();
    this.ui.radioTuner((f) => {
      if (f !== CFG.island2.radioFreq) { this.audio.error(); this.ui.toast('Grésillements', 'Personne sur cette fréquence.', 'bad', 1800); return false; }
      this.act('flag', { radioDone: true });
      this.audio.success();
      setTimeout(() => this.closeModal(), 600);
      this.ui.radio(`Enfin une liaison claire ! Écoutez : la météo de la tour annonce une tempête ce soir. La mer sera trop forte pour décoller sur l'eau : il vous faudra la piste, donc les roues amphibies du hangar 2. Le code : ${CFG.island2.hangarCode}. Ma sœur était contrôleuse ici, c'était son code.`, () => this.audio.radio());
      this.ui.radio('Faites le plein au ponton, montez les roues, et tenez jusqu\'à 21 h, quand le vent tombe. Et prenez les talkies de la tour : vous vous entendrez partout sur l\'île.', () => this.audio.radio());
      this.addNote(`Radio : code du hangar 2 = ${CFG.island2.hangarCode}`);
      return true;
    }, () => this.input.lock());
  },
  // pompe : purge du circuit (énigme) puis pompage (jauge de pression)
  openPump() {
    this.openModalCommon();
    if (!this.puzzles.pipes) {
      if (!this.pipePz) this.pipePz = makePipes(this.seed ^ 0x5eed);
      this.ui.onTick = () => this.audio.ratchet();
      this.ui.pipePuzzle(this.pipePz, () => {
        this.act('puzzle', { k: 'pipes', v: 1 });
        this.audio.powerUp();
        this.ui.toast('Circuit purgé', 'La pompe a de la pression. À vous de doser.', 'good');
        this.closeModal(true);
        setTimeout(() => this.openPump(), 250);
      }, () => this.input.lock());
      return;
    }
    let acc = 0;
    this.ui.pumpPanel({
      getFuel: () => this.flight.fuel,
      max: this.flight.tankMax,
      onFlow: (dt) => {
        this.flight.fuel = Math.min(this.flight.tankMax, this.flight.fuel + 9 * dt);
        acc += dt;
        if (acc > 0.35) { acc = 0; this.audio.pour(); if (!this.ownsPlane()) this.act('fuel', { v: this.flight.fuel }); }
      },
      onBurst: () => { this.audio.spark(); },
      onFull: () => {
        if (!this.ownsPlane()) this.act('fuel', { v: this.flight.fuel });
        if (!this.flags.refueled) this.act('flag', { refueled: true });
        setTimeout(() => this.closeModal(), 900);
      },
    }, () => this.input.lock());
  },
  openShop(where) {
    this.openModalCommon();
    // à Port-Cendre et à Hélios, le Coucou ne vole plus : pas d'améliorations pour lui
    const items = () => SHOP.filter((s) => (where >= 2 || !['tank', 'engine'].includes(s.id)) && (!s.min || where >= s.min) && !(where >= 3 && s.up)).map((s) => ({
      ...s,
      owned: s.up ? this.upgrades.has(s.id) : false,
    }));
    const withSell = () => [{ id: 'sell', icon: '🐟', name: 'Vendre ma pêche', desc: this.fishCount() ? `${this.fishCount()} poissons dans la bourriche` : 'Bourriche vide', gain: this.fishValue(), sell: true }, ...items()];
    this.ui.shop({
      title: ['', 'Caisse de troc de Jo', 'Bar de l\'Escale · comptoir', 'Boutique hors taxes · Port-Cendre', 'Relais Soleil-Levant · Hélios'][where] || 'Comptoir',
      sub: ['', '« Laisse de la ferraille, prends ce qu\'il te faut. » — Jo', 'Le patron est parti, mais le troc continue.', 'Évacuée en une nuit. Les étagères, elles, sont restées.', '« Servez-vous, laissez des coquillages. Bon courage. » — le gérant'][where] || '',
      items: withSell,
      getScrap: () => this.scrap,
      onBuy: (id) => {
        if (id === 'sell') return this.sellFish();
        const s = SHOP.find((q) => q.id === id);
        if (this.scrap < s.cost) { this.audio.error(); return false; }
        if (s.gun && !this.hasItem(s.gun)) { this.audio.error(); this.ui.toast('Pas d\'arme', 'Il faut l\'arme d\'abord.', 'bad', 1600); return false; }
        this.act('shop', { cost: s.cost, up: s.up ? s.id : null });
        // les achats vont dans l'inventaire (au sol s'il n'y a plus de place)
        if (s.give) { this.giveItem(s.give[0], s.give[1], {}, { toSlot: !GEAR[s.give[0]].cat.match(/ammo|misc/) }); this.ui.toast(s.name, GEAR[s.give[0]].wear ? 'Enfilez-le dans l\'inventaire (<kbd>I</kbd>).' : '', 'good', 2000); }
        if (s.id === 'medkit') this.hp = CFG.player.health;
        if (s.id === 'rod') this.selectKey('rod');
        if (s.up) this.ui.toast(s.name, 'Installé dans le Coucou.', 'good', 2000);
        this.audio.success();
        return true;
      },
    }, () => this.input.lock());
  },

  // ── à bord ──
  // local : position dans le repère de l'avion (on garde exactement le même point : pas de téléportation)
  boardPlane(local) {
    if (this.flags.doorJam) { this.audio.error(); this.ui.toast('Porte bloquée', '', 'bad', 1400); return; }
    if (this.carrying && this.carrying.def.weight >= 2) { this.audio.error(); return; }
    if (this.nozzle === this.myId()) this.act('nozzle', { on: false });
    if (this.iron === this.myId()) this.dropIron();
    this.aboard = true;
    this.lying = false;
    if (local) { this.player.pos.set(local.x, FLOOR, local.z); this.player.yaw -= this.plane.root.rotation.y; }
    else { this.player.pos.set(PLANE_POINTS.doorIn.x, FLOOR, PLANE_POINTS.doorIn.z); this.player.yaw = Math.PI / 2 + 0.3; this.player.pitch = 0; }
    this.player.velY = 0;
    this.fallVel = null;
    this.radioOnce('aboard', this.planeReady() ? 'Vous êtes à bord. Le siège pilote est tout à l\'avant, à gauche.' : 'Home sweet home. Enfin, sweet… Il reste du travail avant qu\'il vole.');
  },
  // sortie forcée (foudre sur le verrou…) : on se retrouve sur le palier, devant la porte
  leavePlane(force) {
    if (this.flags.doorJam && !force) { this.audio.error(); return; }
    if (this.flight.airborne) return;
    this.seat = null;
    this.player.pos.set(1.8, FLOOR, 2.2);
    this.exitPlane();
  },
  takeControls() {
    if (this.seatTaken('pilot')) { this.ui.toast('Siège occupé', '', 'bad', 1400); return; }
    this.act('pilot', { on: true });
    this.seat = null;
    this.mode = 'flight';
    this.planeLive = true;
    for (const k of Object.keys(this.plane.ghosts)) this.plane.ghosts[k].visible = false;
    this.ui.el.hud.dataset.mode = 'flight';
    this.ui.prompt(''); this.ui.carry(''); this.ui.hold(0); this.ui.veil(0);
    this.canvas.style.filter = '';
    this.flight.snapCamera();
    if (!this.said.has('controls')) {
      this.said.add('controls');
      this.ui.toast('Aux commandes', '<kbd>Z</kbd> gaz · 54 km/h : tirez le manche · <kbd>P</kbd> pilote auto', '', 6000);
    }
  },
  leaveControls() {
    const f = this.flight;
    if (f.airborne && !f.autopilot) { this.ui.toast('Pas de pilote', 'Pilote automatique : <kbd>P</kbd>', 'bad', 1800); this.audio.error(); return; }
    if (!f.airborne && f.speed > 3) { this.ui.toast('Trop vite', '', 'bad', 1200); return; }
    if (!f.airborne) f.throttle = 0;
    this.act('pilot', { on: false });
    this.mode = 'explore';
    this.aboard = true;
    this.ui.el.hud.dataset.mode = 'explore';
    this.player.pos.set(-0.05, FLOOR, -3.0);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    this.ui.flight(false);
    if (f.airborne) this.ui.toast('Pilote automatique', 'Cap et altitude tenus.', '', 2500);
  },

  // ── portage ──
  // outils de départ (clé, diable, lanterne) : chaque joueur prend son exemplaire
  takeTool(k) {
    this.lootTaken[`tool:${k}`] = 'got';
    this.placeTools();
    this.act('tool', { k });
    this.giveEquip(k, { silent: true });
    this.audio.pickup();
    this.ui.toast(GEAR[k].name, this.keyHint(k), 'good', 2600);
    if (k === 'diable') this.radioOnce('diable', 'Le diable de secours ! Prenez-le en main : les pièces lourdes rouleront bien plus vite qu\'à bout de bras.');
    else if (k === 'wrench') this.radioOnce('wrench', 'Une clé à molette : les réparations iront bien plus vite. Et c\'est une arme correcte, si les crabes du coin vous cherchent.');
    else this.radioOnce('lantern', 'Une lanterne de gardien. Les zombies détestent la lumière : elle les ralentit. Remplissez-la au feu de camp.');
  },
  setCable(line, a, b) {
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  },
  pickUp(it, mode) {
    if (this.act('pick', { id: it.id, mode }) === false) { this.ui.toast('Déjà pris', '', 'bad', 1200); return; }
    if (mode === 'hand') this.selectEq('fists');
    this.audio.pickup();
    if (mode === 'hand' && it.def.weight === 3 && !this.said.has('heavy')) {
      this.radioOnce('heavy', this.hasItem('diable') ? 'Vous allez vous tuer le dos. Posez ça (G), prenez le diable en main et rechargez.' : this.session ? 'Ça pèse une tonne… Demandez à un coéquipier de marcher à côté de vous : à deux, ça va bien plus vite.' : 'Ça pèse une tonne… Le diable de secours est quelque part près des débris, sur la plage.');
    }
  },
  dropCarried() {
    const it = this.carrying;
    if (!it) return;
    const pw = this.playerWorld();
    const yawW = this.playerYawWorld();
    const fw = new THREE.Vector3(-Math.sin(yawW), 0, -Math.cos(yawW));
    const d = this.carryMode === 'diable' ? 2.4 : 1.4;
    let x = pw.x + fw.x * d, z = pw.z + fw.z * d;
    if (this.aboard) { x = pw.x; z = pw.z; }
    if (heightAt(x, z) < -1.2 && !this.onAnyPlatform(x, z)) { x = pw.x; z = pw.z; }
    this.act('drop', { id: it.id, x, z, y: pw.y, r: yawW + (it.def.carryYaw || 0) });
    this.carrying = null;
    this.audio.drop();
  },
};

export { ITEMS, makePipes };
