// Panneau d'administration (menu Pause → Admin) : remplace les anciennes touches F1 à F4.
// En multijoueur, seul l'hôte y a accès ; ce qui touche au monde passe par lui.
import * as THREE from 'three';
import { CFG } from './config.js';
import { GUNS } from './arsenal.js';
import { GEAR, makeItem } from './gear.js';
import { WX_KINDS, WX_ICON, WX_LABEL } from './weather.js';
import { FLOOR_B } from './boeing.js';
import { FLAT3, I3 } from './island3.js';
import { FUSE_SOLUTION } from './defs.js';

const $ = (id) => document.getElementById(id);
const SPEEDS = [1, 2, 4, 8];
const CH_DONE = ['', 'Coucou réparé, caisse à bord : décollez !', 'Saint-Escale bouclée : décollez de la piste !', 'Boeing prêt sur le taxiway : aux commandes !', 'Caisse dans l\'Institut : réglez le synthétiseur !'];

export const AdminMixin = {
  adminInit() {
    $('btnAdmin').addEventListener('click', () => this.openAdmin());
    $('adminClose').addEventListener('click', () => this.closeAdmin());
    $('adminBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-adm]');
      if (!b) return;
      this.adminDo(b.dataset.adm);
      this.audio.beep?.();
      this.renderAdmin();
    });
  },
  canAdmin() { return !this.session || this.session.isHost; },
  // le bouton n'apparaît dans la pause que pour l'hôte (ou en solo)
  refreshPauseAdmin() { $('btnAdmin').hidden = !this.canAdmin(); },
  openAdmin() {
    if (!this.canAdmin()) { this.ui.toast('Admin', 'Réservé à l\'hôte de la partie.', 'bad', 2200); return; }
    this.ui.show('pause', false);
    this.ui.show('adminSheet', true);
    this.renderAdmin();
  },
  closeAdmin() { this.ui.show('adminSheet', false); this.ui.show('pause', true); },
  renderAdmin() {
    const on = (v) => (v ? ' on' : '');
    const B = (id, ic, t, sub = '', state = '') => `<button type="button" class="tile${state}" data-adm="${id}"><i>${ic}</i><span>${t}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
    const ch = this.chapter();
    $('adminBody').innerHTML = `
      <h3>Temps <small>il est ${this.clock()}</small></h3>
      <div class="admGrid">
        ${B('dawn', '☀', 'Passer la nuit', 'aller au matin, 7 h')}
        ${B('hour', '⏩', '+1 heure')}
        ${B('dusk', '🌆', 'Tombée de la nuit', '18 h 30')}
        ${B('fast', '⏱', 'Temps ×10', this.fast ? 'activé' : 'désactivé', on(this.fast))}
      </div>
      <h3>Météo <small>${WX_LABEL[this.weather.kind]}</small></h3>
      <div class="admGrid">
        ${WX_KINDS.map((k) => B(`wx_${k}`, WX_ICON[k], WX_LABEL[k], '', on(this.weather.kind === k))).join('')}
      </div>
      <h3>Progression <small>chapitre ${ch}</small></h3>
      <div class="admGrid">
        ${B('repair', '🔧', 'Réparer le Coucou', this.wreckActive() ? 'épave remise à flot' : `coque ${Math.round(this.planeHp())} %`)}
        ${B('ch2', '🛬', 'Chapitre 2', 'posé à Saint-Escale', ch >= 2 ? ' off' : '')}
        ${B('ch3', '🔥', 'Chapitre 3', 'posé à Port-Cendre', ch >= 3 ? ' off' : '')}
        ${B('ch4', '✈', 'Chapitre 4', ch >= 4 ? 'reposer le Boeing à Hélios' : 'Boeing posé à Hélios')}
        ${B('finish', '🏁', `Finir le chapitre ${ch}`, this.flags.cured ? 'aventure terminée' : 'tous les défis, sauf le départ', this.flags.cured ? ' off' : '')}
      </div>
      <h3>Joueur</h3>
      <div class="admGrid">
        ${B('arms', '🔫', 'Toutes les armes', 'et munitions pleines')}
        ${B('shells', '🐚', '+50 coquillages')}
        ${B('heal', '❤️', 'Soigner', 'santé, endurance, bandages')}
        ${B('god', '🛡', 'Invincible', this.godMode ? 'activé' : 'désactivé', on(this.godMode))}
        ${B('speed', '👟', `Vitesse ×${this.adminSpeed || 1}`, 'à pied et à la nage · ×1 ×2 ×4 ×8', on((this.adminSpeed || 1) > 1))}
      </div>
      <h3>Zombies et partie</h3>
      <div class="admGrid">
        ${B('horde', '🧟', 'Horde', 'tout près de vous')}
        ${B('clear', '💀', 'Tuer tous les zombies')}
        ${B('ff', '🤜', 'Tir ami', this.flags.noFF ? 'désactivé' : 'activé', on(!this.flags.noFF))}
        ${B('debug', '📟', 'Infos de débogage', this.ui.el.debug.classList.contains('hidden') ? 'masquées' : 'affichées', on(!this.ui.el.debug.classList.contains('hidden')))}
      </div>`;
  },
  adminDo(k) {
    if (!this.canAdmin()) return;
    const toast = (t, s = '') => this.ui.toast(`Admin · ${t}`, s, 'good', 2200);
    switch (k) {
      case 'dawn': this.newDayLocal(); this.enemies.list.filter((e) => !e.T.boss && e.type !== 'crab').forEach((e) => this.enemies.damage(e, 9999, null, 0, [])); toast('Nouveau jour', `Jour ${this.stats.days}`); break;
      case 'hour': this.hour = (this.hour + 1) % 24; toast('+1 heure', this.clock()); break;
      case 'dusk': this.hour = CFG.time.alarmHour - 0.02; this.flags.alarm = false; toast('18 h 30', 'La nuit arrive.'); break;
      case 'fast': this.fast = !this.fast; toast('Temps', this.fast ? 'accéléré ×10' : 'normal'); break;
      case 'wx_clear': case 'wx_cloudy': case 'wx_rain': case 'wx_storm': this.setWeather(k.slice(3)); this.wxLeft = 3; toast('Météo', WX_LABEL[k.slice(3)]); break;
      case 'repair': this.debugRepairAll(); break;
      case 'ch2': this.adminChapter(2); break;
      case 'ch3': this.adminChapter(3); break;
      case 'ch4': this.adminChapter4(); break;
      case 'finish': if (!this.flags.cured) this.adminFinish(); break;
      case 'arms': {
        // équipement militaire complet (grands sacs pour tout ranger), armes et munitions
        const wearKit = { hat: 'c_helmet', top: 'c_miljacket', vest: 'c_tacvest', back: 'c_milpack', bottom: 'c_milpants' };
        for (const [p, k] of Object.entries(wearKit)) if (!this.inv.cl[p] || GEAR[this.inv.cl[p].k].base || p === 'back') { const old = this.inv.cl[p]; this.inv.cl[p] = makeItem(k); if (old?.c?.length) old.c.forEach((o) => this.invPut(o)); }
        for (const key of ['shotgun', 'pistol', 'lantern', 'talkie', 'wrench', 'diable', 'flare', 'harpoon', 'rod', 'machete', 'bat', 'axe', 'rifle', 'revolver', 'smg', 'sniper', 'katana', 'sledge', 'launcher']) { if (!this.hasItem(key)) this.giveItem(key, 1, GUNS[key] ? { mag: GUNS[key].mag } : {}, { silent: true }); }
        for (const [k2, n] of [['a_buck', 24], ['a_p9', 60], ['a_r556', 60], ['a_flare', 6], ['a_harpoon', 4], ['a_357', 18], ['a_762', 20], ['a_grenade', 6], ['bandage', 5], ['stake', 3], ['medkit', 1]]) this.giveItem(k2, n, {}, { toSlot: false, silent: true });
        this.syncHeld();
        toast('Arsenal complet', 'Tenue militaire, armes et munitions.'); break;
      }
      case 'shells': this.act('shop', { cost: -50 }); toast('+50 coquillages', `${this.scrap} 🐚`); break;
      case 'heal': this.hp = CFG.player.health; this.stamina = CFG.player.stamina; this.tox = 0; if (this.invCount('bandage') < 3) this.giveItem('bandage', 3, {}, { toSlot: false, silent: true }); if (this.downed) { this.downed = false; this.ui.downed(false); } toast('Soigné'); break;
      case 'god': this.godMode = !this.godMode; toast('Invincible', this.godMode ? 'activé' : 'désactivé'); break;
      case 'speed': this.adminSpeed = SPEEDS[(SPEEDS.indexOf(this.adminSpeed || 1) + 1) % SPEEDS.length]; toast('Vitesse de déplacement', `×${this.adminSpeed}`); break;
      case 'horde': {
        const p = this.playerWorld();
        for (const t of ['voile', 'voile', 'runner', 'crawler', 'bloater', 'screamer', 'brute', 'mega']) this.enemies.spawnAround(t, p.x, p.z, 1, 14, 22);
        toast('Horde', '8 zombies (dont un méga-zombie) à une vingtaine de mètres.'); break;
      }
      case 'clear': this.enemies.list.filter((e) => e.type !== 'crab' && !e.dead).forEach((e) => this.enemies.damage(e, 99999, null, 0, [])); toast('Zombies éliminés'); break;
      case 'ff': this.act('flag', { noFF: !this.flags.noFF }); toast('Tir ami', this.flags.noFF ? 'désactivé' : 'activé'); break;
      case 'debug': this.ui.show('debug', this.ui.el.debug.classList.contains('hidden')); break;
      default: break;
    }
  },

  // ── téléportation de tout l'équipage : l'hôte décide, chaque machine place son joueur ──
  // d.bp : cabine du Boeing (pose fournie : l'état du monde peut arriver après) ; d.p : [x, z, yaw, y?]
  applyAdminFx(type, d) {
    if (type !== 'admWarp') return false;
    this.adminFreePlayer();
    const k = this.mpIndex(), P = this.player;
    if (d.bp) {
      const c = this.c3;
      c.fly = 0; c.bp = { x: d.bp[0], z: d.bp[1], yaw: d.bp[2], y: d.bp[3] };
      this.poseBoeing();
      const p = this.boeingLocal(new THREE.Vector3(0, FLOOR_B, (d.row ?? 14) + k * 1.1));
      P.place(p.x, p.z, c.bp.yaw); P.pos.y = p.y;
    } else {
      const [x0, z0, yaw, y] = d.p, x = x0 + Math.cos(yaw) * k * 1.2, z = z0 - Math.sin(yaw) * k * 1.2;
      P.place(x, z, yaw);
      P.pos.y = y ?? Math.max(this.groundAt(x, z, 5), CFG.swim.level);
    }
    P.pitch = 0; P.velY = 0; P.onGround = true;
    return true;
  },
  // on lâche tout : véhicule, siège, charge, commandes
  adminFreePlayer() {
    if (this.driving) this.exitVehicle(true);
    if (this.riding) this.exitPassenger(true);
    if (this.carrying) this.dropCarried();
    if (this.nozzle === this.myId()) this.act('nozzle', { on: false });
    this.stopFishing?.(); this.zgReset?.();
    if (this.bseat) { this.bseat = null; this.camera.fov = this.baseFov || 72; this.camera.updateProjectionMatrix(); }
    if (this.mode === 'flight') { this.mode = 'explore'; this.canvas.style.filter = ''; }
    this.ui.el.hud.dataset.mode = 'explore';
    this.ui.flight(false);
    this.aboard = false; this.seat = null; this.lying = false; this.hoist = null; this.chute = false; this.fallVel = null;
    this.player.onLadder = false; this.player.radius = undefined;
    if (this.downed) { this.downed = false; this.hp = Math.max(this.hp, 45); this.ui.downed(false); }
    this.ui.prompt(''); this.ui.carry(''); this.ui.hold(0);
  },
  // le Coucou est posé d'autorité, personne aux commandes
  adminStopCoucou() {
    this.planeLive = true; this.planeLift = 1;
    this.flight.throttle = 0;
    this.act('pilot', { on: false });
    this.pilotId = null;
    this.audio.setEngine(0, 0);
  },
  warpToCoucou() {
    const out = this.plane.root.localToWorld(new THREE.Vector3(4.2, 0, 2.2));
    this.fx('admWarp', { p: [+out.x.toFixed(2), +out.z.toFixed(2), +this.flight.yaw.toFixed(3)] });
  },
  warpToBoeing(row = 14) {
    const b = this.c3.bp;
    this.fx('admWarp', { bp: [b.x, b.z, b.yaw, b.y ?? FLAT3], row });
  },

  // ── finir le chapitre en cours : tous les défis, sauf le départ (décollage, synthèse finale) ──
  adminFinish() {
    const ch = this.chapter();
    if (ch === 1) this.adminFinish1();
    else if (ch === 2) this.adminFinish2();
    else if (ch === 3) this.adminFinish3();
    else this.adminFinish4();
    this.dirtyWorld = true;
    this.save();
    this.refreshCarnet();
    this.ui.toast(`Admin · chapitre ${ch} terminé`, CH_DONE[ch], 'good', 4000);
  },
  adminFinish1() {
    this.debugRepairAll();
    this.adminStopCoucou();
    this.warpToCoucou();
  },
  adminFinish2() {
    const I = this.island2, f = this.flags;
    ['landed2', 'power', 'hangar', 'storm', 'stormover'].forEach((k) => this.said.add(k));
    this.adminStopCoucou();
    if (this.wreckActive()) this.debugRepairAll();
    this.act('flag', { discovered: true, landed2: true, radioDone: true });
    // fusibles en place : courant rétabli
    const sol = this.secrets?.fuses || FUSE_SOLUTION;
    this.fuseSlots.forEach((s, i) => { s.fuse = sol[s.key]; I.setFuse(i, s.fuse); });
    for (const m of Object.values(this.fuseMeshes)) m.visible = false;
    this.fuses = new Set();
    this.puzzles.pipes = true;
    if (!f.hangarOpen) this.act('hangar');
    if (!f.wheels && this.items.wheels) this.act('install', { k: 'wheels', silent: true });
    // tempête passée, générateur en marche
    const S = this.siege;
    S.active = false; S.genHp = 100; S.wave = 3; S.left = 0;
    this.enemies.dismiss(I.points.generator, 150, (e) => e.siege);
    this.act('flag', { power: true, refueled: true, storm: true, stormOver: true, jamStorm: false, doorJam: false });
    I.setPower(true);
    if (this.weather.kind === 'storm') this.setWeather('clear');
    this.parkAt(2);
    this.flight.fuel = this.flight.tankMax;
    this.warpToCoucou();
  },
  adminFinish3() {
    const I = this.island3, c = this.c3;
    ['c3start', 'c3fire', 'c3land', 'c3out', 'c3bat'].forEach((k) => this.said.add(k));
    // Coucou posé et éteint, caisse sortie
    if (this.mode === 'flight' || !this.flags.landed3) { this.adminStopCoucou(); this.parkAt(3); }
    if (this.crateLoaded) { this.crateLoaded = false; this.plane.crateAboard.visible = false; }
    c.fire = 0; c.bfuel = 100; c.hitched = 0;
    this.act('flag', { fire3: true, landed3: true, fireOut: true, baysOpen: true });
    // Boeing : batterie, plein, caisse en soute, repoussé sur le taxiway, nez vers la piste
    if (!this.flags.boeingBattery) this.act('battery', {});
    if (!this.flags.boeingCrate) this.act('boeingCrate', {});
    this.act('flag', { boeingBattery: true, boeingFuel: true, boeingCrate: true, boeingOut: true });
    c.fly = 0;
    c.bp = { x: I.cx + I3.boeing.x, z: I.cz + 80, yaw: 0, y: FLAT3 };
    this.poseBoeing();
    this.warpToBoeing(4);
  },
  adminFinish4() {
    const P = this.island4.points;
    if (!this.flags.landed4 || this.c3.fly) this.adminChapter4();
    const c = this.c4;
    ['c4crate', 'c4bridge', 'c4gate', 'c4pad', 'c4decon'].forEach((k) => this.said.add(k));
    c.crank = [1, 1]; c.deconOn = 0; c.decon = 0; c.synthLeft = 0;
    this.act('flag', { slide: true, crateOut: true, bridge4: true, gate4: true, crateAtLab: true, decon4: true });
    this.act('labCrate', {});
    this.enemies.dismiss(P.pad, 120, (e) => e.siege);
    this.fx('admWarp', { p: [P.labIn.x, P.labIn.z - 2, 0, P.labIn.y] });   // face aux consoles
  },
  // saut de chapitre : l'avion réparé est posé à l'arrivée, l'équipage à côté
  adminChapter(n) {
    if (this.chapter() === 1) this.debugRepairAll();
    ['hello', 'watch', 'repaired', 'takeoff', 'discovered'].forEach((k) => this.said.add(k));
    this.planeLive = true; this.planeLift = 1;
    const flags = n === 2 ? { tookOff: true, discovered: true } : { tookOff: true, discovered: true, landed2: true, power: true, refueled: true, tookOff2: true, fire3: true };
    this.act('flag', flags);
    this.adminStopCoucou();
    if (n === 3 && !this.flags.wheels && this.items.wheels) this.act('install', { k: 'wheels', silent: true });
    this.parkAt(n);
    this.warpToCoucou();
    this.save();
    this.ui.toast(`Admin · chapitre ${n}`, n === 2 ? 'Saint-Escale : rétablissez le courant.' : 'Port-Cendre : le moteur brûle !', 'good', 3500);
    this.refreshCarnet();
  },
};
