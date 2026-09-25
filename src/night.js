// La nuit : de 19 h à l'aube, les zombies sortent de terre.
// Le seul abri où l'on peut dormir (et sauter la nuit) : l'avion, à flot, porte fonctionnelle.
// Le verrou de la porte cargo se grippe parfois (et toujours pendant la tempête de Saint-Escale) :
// l'équipage doit alors se battre, ou réparer le verrou à la clé (maintenir E) pendant que les autres couvrent.
import * as THREE from 'three';
import { CFG } from './config.js';
import { brumeFactor } from './sky.js';
import { PLANE_POINTS, FLOOR } from './planeModel.js';

export const LOCK_REPAIR_SECONDS = 18;

export const NightMixin = {
  nightF() { return brumeFactor(((this.hour % 24) + 24) % 24); },
  // progression de la nuit : 0 à 19 h, 1 à minuit et jusqu'à l'aube
  nightDepth() {
    const h = ((this.hour % 24) + 24) % 24;
    if (h >= 19) return Math.min(1, (h - 19) / 5);
    if (h < 7) return 1;
    return 0;
  },
  isNight() { return this.nightF() > 0.5; },

  // appelé à chaque image (remplace l'ancienne toxicité) : renvoie vrai si l'on est dehors en pleine nuit
  updateNightExposure() {
    this.tox = 0;
    const out = this.isNight() && !this.aboard && this.mode !== 'flight';
    // vignette sombre discrète la nuit, dehors
    this.ui.veil(out ? 0.18 : 0);
    if (this.canvas.style.filter) this.canvas.style.filter = '';
    return out;
  },

  // l'avion peut-il servir de dortoir ?
  planeAfloatNow() { return this.planeLive && this.flight.surface === 'water' && !this.flight.airborne; },

  // événements de nuit décidés par l'hôte
  updateNightEvents() {
    const h = ((this.hour % 24) + 24) % 24;
    const f = this.flags;
    // tempête de Saint-Escale : la foudre grille le verrou jusqu'à 21 h (mission de défense)
    if (f.storm && !f.stormOver && h >= 18.9 && h < 21 && !f.jamStorm) {
      this.act('flag', { doorJam: true, jamStorm: true });
      this.fx('doorJam', { storm: 1 });
    }
    if (f.jamStorm && f.stormOver) { f.jamStorm = false; this.act('flag', { jamStorm: false, doorJam: false }); this.fx('doorFree'); }
    // tirage du soir : à partir du 2e jour, 35 % de chances que le verrou se grippe
    const day = this.stats.days;
    if (h >= 17 && h < 18 && this.jamRolledDay !== day) {
      this.jamRolledDay = day;
      const firstDay = day <= 1 && !f.tookOff;
      if (!firstDay && !f.doorJam && Math.random() < 0.35 && this.planeLive) {
        this.act('flag', { doorJam: true });
        this.fx('doorJam', {});
      }
    }
    // chaque matin, la mer ramène des coquillages sur les plages
    if (h >= 7 && h < 8 && this.shellDay !== day) {
      this.shellDay = day;
      for (const q of this.scrapPiles) if (!q.dyn && q.taken) { q.taken = false; q.mesh.visible = true; }
      this.dirtyWorld = true;
    }
    // le matin, l'humidité s'évapore : le verrou se débloque tout seul
    if (f.doorJam && !f.jamStorm && h >= 7 && h < 8) { this.act('flag', { doorJam: false }); this.fx('doorFree'); }
  },

  // réparation du verrou (maintenir E à la porte, clé à molette)
  lockSpec() {
    const f = this.flags;
    if (f.jamStorm) return { prompt: '<span class="warn">Verrou grillé par la foudre : impossible avant la fin de la tempête (21 h)</span>' };
    if (!this.own.wrench) return { prompt: '<span class="warn">Porte bloquée : il faut une clé à molette pour dégripper le verrou</span>' };
    const pct = Math.round((this.lockProg || 0) / LOCK_REPAIR_SECONDS * 100);
    return {
      prio: 4,
      prompt: `<kbd>E</kbd> maintenir : dégripper le verrou (${pct} %)${this.session ? ' · faites-vous couvrir !' : ''}`,
      hold: {
        tick: (dt, before) => {
          if (Math.floor(before / 0.35) !== Math.floor(this.holdT / 0.35)) { this.audio.ratchet(); if (Math.random() < 0.4) this.audio.clank(); }
          this.lockProg = Math.min(LOCK_REPAIR_SECONDS, (this.lockProg || 0) + dt * (1 + 0.5 * this.mateList().filter((m) => m.pos.distanceTo(this.playerWorld()) < 3).length));
          this._lockSend = (this._lockSend || 0) + dt;
          if (this._lockSend > 0.5) { this._lockSend = 0; this.act('lockProg', { v: this.lockProg }); }
          if (this.lockProg >= LOCK_REPAIR_SECONDS) { this.lockProg = 0; this.act('flag', { doorJam: false }); this.act('lockProg', { v: 0 }); this.audio.success(); this.ui.toast('Verrou réparé', 'La porte cargo s\'ouvre à nouveau.', 'good'); }
        },
      },
    };
  },
  doorPointOut() { return this.plane.root.localToWorld(PLANE_POINTS.doorOut.clone()); },
  doorPointIn() { return this.plane.root.localToWorld(new THREE.Vector3(1.2, FLOOR + 1, 2.2)); },

  applyNightFx(type, data) {
    if (type === 'doorJam') {
      this.audio.error(); this.audio.clank();
      if (data.storm) {
        if (this.aboard && !this.flight.airborne) { this.seat = null; this.lying = false; this.leavePlane(true); }
        this.ui.toast('La foudre a grillé le verrou !', 'Impossible de se réfugier dans l\'avion avant 21 h. Tenez la centrale.', 'bad', 8000);
        this.radioOnce('jamstorm', 'La foudre est tombée sur l\'avion ! Le verrou de la porte cargo est grillé : pas d\'abri cette nuit. Défendez la centrale, ses projecteurs vous protègent.');
      } else {
        this.ui.toast('Le verrou de la porte est grippé !', 'Pas d\'abri tant qu\'il n\'est pas dégrippé à la clé (maintenir E à la porte). Il se débloque au matin.', 'bad', 8000);
        this.radioOnce(`jam${this.stats.days}`, 'Ce vieux verrou… Il s\'est grippé avec l\'humidité. Dégrippez-le à la clé avant la nuit, ou préparez-vous à vous battre jusqu\'à l\'aube.');
      }
    } else if (type === 'doorFree') this.ui.toast('Porte cargo débloquée', 'On peut à nouveau se réfugier dans l\'avion.', 'good');
  },
};

export { CFG };
