// Secrets de la partie appliqués au monde (plaque du phare, symboles peints…) et cadenas à molettes de l'île 1.
//  · cabanon du gardien : cadenas à 3 chiffres = les trois derniers chiffres de l'année du phare (tirée au sort) ;
//  · coffre du canot : 3 molettes à symboles, dans l'ordre des repères de Jo (symboles tirés au sort).
// Les molettes sont partagées par l'équipage (état « dl:… » dans les énigmes du monde).
import { textTexture } from './terrain.js';
import { symbolTex } from './fun.js';
import { makeSecrets, SYMBOLS } from './secrets.js';
import { buildDialLock } from './devices.js';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const LocksMixin = {
  // tire les secrets de la graine et met à jour les indices déjà construits
  applySecrets(seed) {
    const S = this.secrets = makeSecrets(seed);
    const pl = this.island?.plaque;
    if (pl) {
      pl.material.map?.dispose();
      pl.material.map = textTexture(['PHARE DE LA POINTE', 'mis en service', `en ${S.year}`], '#2f3a40', '#e9dcb6', 256, 160);
      pl.material.needsUpdate = true;
    }
    (this.fun?.symbols || []).forEach((s, i) => {
      s.sym = S.symbols[i];
      if (!s.mesh) return;
      s.mesh.material.map?.dispose();
      s.mesh.material.map = symbolTex(`${s.n} ${s.sym}`, s.bg);
      s.mesh.material.needsUpdate = true;
    });
    if (this.locks) { this.locks.cabin.set([0, 0, 0], true); this.locks.chest.set([0, 0, 0], true); }
    return S;
  },

  // ── cadenas de l'île 1 (construits une fois : l'île 1 ne change pas) ──
  buildLocks() {
    if (this.locks) return;
    const cabin = buildDialLock({ glyphs: DIGITS });
    cabin.group.position.set(1.0, 1.3, 0.17);
    cabin.group.rotation.set(-0.3, 0, 0, 'YXZ');    // incliné vers les yeux
    this.island.cabin.doorPivot.add(cabin.group);
    this.island.cabin.lock.visible = false;
    const chest = buildDialLock({ glyphs: SYMBOLS, bg: '#fff4e0', body: '#5d6470' });
    chest.group.position.set(0, 0.34, -0.36);
    chest.group.rotation.set(-0.55, Math.PI, 0, 'YXZ');   // le coffre est bas : cadran tourné vers le ciel
    this.fun.survival.group.add(chest.group);
    this.locks = { cabin, chest };
    const spec = (k, lock, glyphs, solved, onOpen) => ({
      tag: 'locks', obj: lock.group, range: 2.3,
      active: () => !solved() && this.mode === 'explore',
      prompt: (i) => `Molette ${i + 1} : <b>${glyphs[lock.wheels[i].v]}</b> · <kbd>E</kbd>/<kbd>R</kbd> ou molette de la souris : tourner`,
      press: (i) => this.turnDial(k, lock, i, 1, glyphs, onOpen),
      alt: (i) => this.turnDial(k, lock, i, -1, glyphs, onOpen),
      wheel: (i, dir) => this.turnDial(k, lock, i, dir, glyphs, onOpen),
    });
    this.addDevice(spec('cabin', cabin, DIGITS, () => this.flags.doorOpen, () => {
      this.act('door');
      this.audio.success();
      this.ui.toast('Cadenas ouvert', 'La porte du cabanon grince.', 'good');
    }));
    this.addDevice(spec('chest', chest, SYMBOLS, () => this.flags.chest, () => {
      this.act('flag', { chest: true });
      this.act('scrap', { n: 3 });
      this.audio.success();
      this.ui.toast('Clac !', 'Le coffre de survie s\'ouvre.', 'good');
      setTimeout(() => this.takeFromChest(), 500);
    }));
  },
  dialValue(k) { const v = this.puzzles?.[`dl:${k}`]; return Array.isArray(v) ? v : [0, 0, 0]; },
  turnDial(k, lock, i, dir, glyphs, onOpen) {
    const v = this.dialValue(k).slice();
    v[i] = (((v[i] || 0) + dir) % glyphs.length + glyphs.length) % glyphs.length;
    this.act('puzzle', { k: `dl:${k}`, v });
    lock.set(v);
    this.audio.ratchet();
    const want = k === 'cabin' ? this.secrets.cabinCode.split('').map(Number) : this.secrets.symbols.map((s) => SYMBOLS.indexOf(s));
    if (v.every((x, j) => x === want[j])) setTimeout(onOpen, 250);
  },
  updateLocks(dt) {
    const L = this.locks; if (!L) return;
    L.cabin.set(this.dialValue('cabin'));
    L.chest.set(this.dialValue('chest'));
    L.cabin.update(dt); L.chest.update(dt);
    // cadenas ouvert : il pend, anse levée ; le coffre ouvert garde ses molettes
    L.cabin.group.visible = !this.flags.doorOpen || this.doorAnim < 0.3;
  },
};
