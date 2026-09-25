// Panneau d'administration (menu Pause → Admin) : remplace les anciennes touches F1 à F4.
// En multijoueur, seul l'hôte y a accès ; ce qui touche au monde passe par lui.
import * as THREE from 'three';
import { CFG } from './config.js';
import { GUNS } from './arsenal.js';
import { GEAR, makeItem } from './gear.js';
import { WX_KINDS, WX_ICON, WX_LABEL } from './weather.js';

const $ = (id) => document.getElementById(id);

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
      </div>
      <h3>Joueur</h3>
      <div class="admGrid">
        ${B('arms', '🔫', 'Toutes les armes', 'et munitions pleines')}
        ${B('shells', '🐚', '+50 coquillages')}
        ${B('heal', '❤️', 'Soigner', 'santé, endurance, bandages')}
        ${B('god', '🛡', 'Invincible', this.godMode ? 'activé' : 'désactivé', on(this.godMode))}
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
      case 'arms': {
        // équipement militaire complet (grands sacs pour tout ranger), armes et munitions
        const wearKit = { hat: 'c_helmet', top: 'c_miljacket', vest: 'c_tacvest', back: 'c_milpack', bottom: 'c_milpants' };
        for (const [p, k] of Object.entries(wearKit)) if (!this.inv.cl[p] || GEAR[this.inv.cl[p].k].base || p === 'back') { const old = this.inv.cl[p]; this.inv.cl[p] = makeItem(k); if (old?.c?.length) old.c.forEach((o) => this.invPut(o)); }
        for (const key of ['shotgun', 'pistol', 'lantern', 'talkie', 'wrench', 'diable', 'flare', 'harpoon', 'rod', 'machete', 'bat', 'axe', 'rifle']) { if (!this.hasItem(key)) this.giveItem(key, 1, GUNS[key] ? { mag: GUNS[key].mag } : {}, { silent: true }); }
        for (const [k2, n] of [['a_buck', 24], ['a_p9', 60], ['a_r556', 60], ['a_flare', 6], ['a_harpoon', 4], ['bandage', 5], ['stake', 3], ['medkit', 1]]) this.giveItem(k2, n, {}, { toSlot: false, silent: true });
        this.syncHeld();
        toast('Arsenal complet', 'Tenue militaire, armes et munitions.'); break;
      }
      case 'shells': this.act('shop', { cost: -50 }); toast('+50 coquillages', `${this.scrap} 🐚`); break;
      case 'heal': this.hp = CFG.player.health; this.stamina = CFG.player.stamina; this.tox = 0; if (this.invCount('bandage') < 3) this.giveItem('bandage', 3, {}, { toSlot: false, silent: true }); if (this.downed) { this.downed = false; this.ui.downed(false); } toast('Soigné'); break;
      case 'god': this.godMode = !this.godMode; toast('Invincible', this.godMode ? 'activé' : 'désactivé'); break;
      case 'horde': {
        const p = this.playerWorld();
        for (const t of ['voile', 'voile', 'runner', 'crawler', 'bloater', 'screamer', 'brute']) this.enemies.spawnAround(t, p.x, p.z, 1, 14, 22);
        toast('Horde', '7 zombies à une vingtaine de mètres.'); break;
      }
      case 'clear': this.enemies.list.filter((e) => e.type !== 'crab' && !e.dead).forEach((e) => this.enemies.damage(e, 99999, null, 0, [])); toast('Zombies éliminés'); break;
      case 'ff': this.act('flag', { noFF: !this.flags.noFF }); toast('Tir ami', this.flags.noFF ? 'désactivé' : 'activé'); break;
      case 'debug': this.ui.show('debug', this.ui.el.debug.classList.contains('hidden')); break;
      default: break;
    }
  },
  // saut de chapitre : l'avion réparé est posé à l'arrivée, l'équipage à côté
  adminChapter(n) {
    if (this.chapter() === 1) this.debugRepairAll();
    ['hello', 'watch', 'repaired', 'takeoff', 'discovered'].forEach((k) => this.said.add(k));
    this.planeLive = true; this.planeLift = 1;
    const flags = n === 2 ? { tookOff: true, discovered: true } : { tookOff: true, discovered: true, landed2: true, power: true, refueled: true, tookOff2: true, fire3: true };
    this.act('flag', flags);
    if (this.mode === 'flight') { this.mode = 'explore'; this.ui.el.hud.dataset.mode = 'explore'; }
    this.act('pilot', { on: false });
    if (n === 3 && !this.flags.wheels && this.items.wheels) this.act('install', { k: 'wheels', silent: true });
    this.parkAt(n);
    const yaw = this.flight.yaw;
    this.aboard = false; this.seat = null;
    const out = this.plane.root.localToWorld(new THREE.Vector3(4.2, 0, 2.2));
    const land = out;
    this.player.place(land.x, land.z, yaw);
    this.player.pos.y = Math.max(this.groundAt(land.x, land.z, 5), CFG.swim.level);
    this.save();
    this.ui.toast(`Admin · chapitre ${n}`, n === 2 ? 'Saint-Escale : rétablissez le courant.' : 'Port-Cendre : le moteur brûle !', 'good', 3500);
    this.refreshCarnet();
  },
};
