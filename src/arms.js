// Armes et équipement en main : une seule chose à la fois (poings, outils, talkie, armes blanches, armes à feu).
// Tir instantané avec traçantes, recul, rechargement, tir à la tête ; sang et flaques ; coups entre joueurs.
import * as THREE from 'three';
import { EQUIP, EQ, MELEE, GUNS, AMMO_NAMES } from './arsenal.js';
import { GEAR } from './gear.js';
import { heightAt } from './terrain.js';
import { createGoreFx } from './gorefx.js';

const tmpV = new THREE.Vector3();
// munitions de chaque arme (objets d'inventaire)
const AMMO_ITEM = { pistol: 'a_p9', shotgun: 'a_buck', rifle: 'a_r556', flare: 'a_flare', harpoon: 'a_harpoon', revolver: 'a_357', smg: 'a_p9', sniper: 'a_762', launcher: 'a_grenade' };

export const ArmsMixin = {
  armsInit() {
    this.gore = createGoreFx(this.scene);
    this.resetArms();
  },
  resetArms() {
    this.reloadT = 0;
    this.recoilP = 0;
    this.spreadK = 0;
    this.gunCd = 0;
  },

  // ── ce qu'on a en main ──
  held() { return EQUIP[EQ[this.heldKey()]] || EQUIP[0]; },
  // où trouver un objet : « touche 3 » s'il est équipé, sinon l'inventaire
  keyHint(key) { const i = ['primary', 'secondary', 'u1', 'u2', 'u3', 'u4'].findIndex((s) => this.inv.eq[s]?.k === key); return i >= 0 ? `Touche <kbd>${i + 1}</kbd>` : 'Inventaire <kbd>A</kbd>'; },
  // nouvel objet (arme, outil) : rangé dans son emplacement s'il est libre, puis pris en main
  giveEquip(key, { ammo = 0, silent = false } = {}) {
    const G = GUNS[key];
    const had = this.hasItem(key);
    if (!had) this.giveItem(key, 1, G ? { mag: G.mag } : {}, { silent });
    if (ammo && AMMO_ITEM[key]) this.giveItem(AMMO_ITEM[key], ammo, {}, { toSlot: false, silent });
    if (!this.carrying && !had) this.selectKey(key);
    this.flashKeys?.();
    if (!silent) {
      const d = GEAR[key];
      this.ui.toast(d.name, had ? 'Munitions' : this.keyHint(key), 'good', 2600);
      this.audio.pickup();
    }
  },
  // compatibilité : prendre en main par identifiant d'équipement
  equipSlot(id) { const E = EQUIP[id]; if (!E) return; if (E.key === 'fists') this.selectEq('fists'); else this.selectKey(E.key); },
  useBandage() { this.useHeal('bandage'); },
  ammoFor(key) { return AMMO_ITEM[key]; },

  // ── clic : selon ce qu'on a en main ──
  handleAttack(dt) {
    this.attackCd -= dt;
    this.gunCd -= dt;
    this.updateGunState(dt);
    if (this.carrying || this.nozzle === this.myId() || this.iron === this.myId()) return;
    const E = this.held();
    if (E.kind === 'gun') { this.gunTrigger(E.key); return; }
    if (!this.input.hit('Mouse0') || this.attackCd > 0) return;
    if (E.kind === 'proj') { this.fireWeapon(E.key); return; }
    if (E.kind === 'use') { this.useHeal(E.key); this.attackCd = 0.5; return; }
    if (E.kind !== 'melee') return;
    const C = MELEE[E.key];
    if (this.tryHitFish(C.range + 0.8)) { this.vm.attack(E.key); this.attackCd = C.cd; return; }
    this.attackCd = C.cd;
    this.vm.attack(E.key);
    this.audio.whoosh();
    this.attackFlag = 0.3;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    setTimeout(() => {
      if (this.mode !== 'explore') return;
      const origin = this.player.pos.clone();
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      // un coéquipier devant soi ?
      if (this.hitMate(origin, flat, C.range, C.dmg, C.knock)) return;
      // la masse balaye tout l'arc ; les autres armes frappent l'ennemi le plus proche
      const targets = C.cleave ? this.probeAll(origin, flat, C.range) : [this.probe(origin, flat, C.range)].filter(Boolean);
      if (!targets.length) return;
      if (C.cleave) { this.player.shake = Math.max(this.player.shake, 0.5); this.audio.thud?.(); }
      for (const e of targets) {
        this.dealDamage(e, C.dmg, flat, C.knock, { stun: C.stun });
        this.ui.hitmark?.(e.dead || e.hp <= 0);
        const hp = new THREE.Vector3(e.pos.x, e.pos.y + e.T.h * 0.7, e.pos.z);
        this.gore.blood(hp, flat, !!C.blade || !!C.cleave, !!e.T.goo);
        this.session?.send('gore', { p: [hp.x, hp.y, hp.z].map((v) => +v.toFixed(2)), d: [flat.x, flat.z].map((v) => +v.toFixed(2)), b: C.blade || C.cleave ? 1 : 0, g: e.T.goo ? 1 : 0 });
      }
    }, E.key === 'fists' ? 90 : 150);
  },
  // dégâts à un ennemi : l'hôte applique, l'invité envoie
  dealDamage(e, dmg, dir, knock, opts = {}) {
    if (this.isAuthority()) {
      const r = this.enemies.damage(e, dmg, dir, knock, this.lightSources(), opts);
      if (r) this.hitFeedback(e, r.mul);
    } else {
      this.session.send('hit', { id: e.id, dmg, dir: [dir.x, dir.z], knock, stun: 0, st: opts.stun ?? 0.35, head: opts.head ? 1 : 0 }, this.session.hostId);
      this.hitFeedback(e, e.type === 'kingcrab' && e.state !== 'stun' ? 0.35 : 1);
      e.flash = 0.15;
    }
  },

  // ── coups entre joueurs (paramètre de la partie) ──
  hitMate(origin, dir, range, dmg, knock) {
    if (!this.session || this.flags?.noFF) return false;
    for (const m of this.mateList()) {
      if (m.downed || m.aboard || m.mode !== 'explore') continue;
      const dx = m.pos.x - origin.x, dz = m.pos.z - origin.z, d = Math.hypot(dx, dz);
      if (d > range + 0.4) continue;
      if ((dx * dir.x + dz * dir.z) / (d || 1) < 0.6) continue;
      this.session.send('pvp', { dmg, d: [dir.x, dir.z], k: knock, by: this.profile.name }, m.id);
      this.audio.hitFlesh();
      const hp = m.pos.clone().setY(m.pos.y + 1.3);
      this.gore.blood(hp, dir, false);
      return true;
    }
    return false;
  },
  onPvp(d) {
    if (this.mode !== 'explore' || this.downed) return;
    this.hurt(d.dmg, 'player', { x: d.d[0], z: d.d[1], k: d.k });
    this.gore.blood(this.playerWorld().setY(this.playerWorld().y + 1.2), new THREE.Vector3(d.d[0], 0, d.d[1]), false);
    if (!this._pvpTold || this.t - this._pvpTold > 8) { this._pvpTold = this.t; this.ui.toast(`${d.by || 'Un coéquipier'} vous a frappé`, 'Les coups entre joueurs se règlent dans les paramètres de la partie.', 'bad', 2500); }
  },

  // ── armes à feu ──
  gunTrigger(key) {
    const G = GUNS[key];
    const it = this.heldItem();
    if (!it) return;
    if (it.mag === undefined) it.mag = 0;
    const inp = this.input;
    if (inp.hit('KeyR') && !this.altAvailable) this.startReload(key);
    const want = G.auto ? inp.down('MouseL') : inp.hit('Mouse0');
    if (!want || this.gunCd > 0 || this.reloadT > 0 && !(G.perShell && it.mag > 0)) return;
    if (it.mag <= 0) {
      if (this.invCount(AMMO_ITEM[key]) > 0) this.startReload(key);
      else { this.audio.error(); this.gunCd = 0.3; if (!this._dryT || this.t - this._dryT > 3) { this._dryT = this.t; this.ui.toast('Chargeur vide', `Plus de ${AMMO_NAMES[G.ammo]}.`, 'bad', 1800); } }
      return;
    }
    this.reloadT = 0;
    it.mag--;
    this.gunCd = G.cd;
    this.fireGun(key, G);
  },
  startReload(key) {
    const G = GUNS[key], it = this.heldItem();
    if (!it || this.reloadT > 0 || (it.mag || 0) >= G.mag || this.invCount(AMMO_ITEM[key]) <= 0) return;
    this.reloadT = G.reload;
    this.reloadKey = key;
    this.vm.reload?.(key, G.reload);
    this.audio.ratchet();
  },
  updateGunState(dt) {
    this.recoilP = Math.max(0, this.recoilP - dt * 0.9);
    this.spreadK = Math.max(0, this.spreadK - dt * 2.2);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      const key = this.reloadKey, G = GUNS[key], it = this.heldItem();
      if (this.held().key !== key || !it) { this.reloadT = 0; return; }
      if (this.reloadT <= 0) {
        if (G.perShell) {
          if (this.invTake(AMMO_ITEM[key], 1)) { it.mag = (it.mag || 0) + 1; this.audio.clank(); }
          if (it.mag < G.mag && this.invCount(AMMO_ITEM[key]) > 0) { this.reloadT = G.reload; this.vm.reload?.(key, G.reload); }
        } else {
          const n = this.invTake(AMMO_ITEM[key], G.mag - (it.mag || 0));
          it.mag = (it.mag || 0) + n; this.audio.clank(); this.audio.ratchet();
        }
      }
    }
  },
  fireGun(key, G) {
    const cam = this.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const o = cam.position.clone();
    const muzzle = o.clone().addScaledVector(dir, 0.9).add(new THREE.Vector3(0, -0.14, 0));
    this.gore.muzzle(muzzle);
    this.vm.attack(key);
    this.audio.gun?.(G.snd);
    this.attackFlag = 0.2;
    // recul : la visée remonte, la dispersion grandit (on tire mieux accroupi et à l'arrêt)
    const still = !this.moving ? 0.6 : 1, crouch = this.player.crouch > 0.5 ? 0.6 : 1;
    const spread = (G.spread + this.spreadK * 0.03) * still * crouch;
    this.player.pitch = Math.min(1.4, this.player.pitch + G.kick * (0.7 + Math.random() * 0.6));
    this.player.yaw += (Math.random() - 0.5) * G.kick * 0.4;
    this.spreadK = Math.min(1, this.spreadK + (G.auto ? 0.25 : 0.5));
    this.player.shake = Math.max(this.player.shake, key === 'shotgun' || key === 'sniper' ? 0.45 : key === 'revolver' ? 0.3 : 0.18);
    const hits = new Map();
    const net = [];
    for (let k = 0; k < G.pellets; k++) {
      const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread)).normalize();
      const block = this.rayBlock(o, d, G.range);
      // balle perforante : on continue derrière chaque ennemi touché (dégâts réduits à chaque traversée)
      const pierced = new Set();
      let r = this.enemies.raycast(o, d, block), fall = 1;
      const m = this.mateRay(o, d, Math.min(block, r ? r.t : 1e9));
      let end;
      if (m) {
        end = m.point;
        if (!this.flags?.noFF) { const cur = hits.get(`m:${m.mate.id}`) || { mate: m.mate, dmg: 0, dir: d }; cur.dmg += G.dmg * (m.head ? 1.8 : 1); hits.set(`m:${m.mate.id}`, cur); }
        this.gore.blood(end, d, false);
      } else if (r) {
        while (r) {
          end = r.point;
          const cur = hits.get(r.e.id) || { e: r.e, dmg: 0, head: false, dir: d };
          cur.dmg += G.dmg * fall * (r.head ? (r.e.T.boss ? 1.3 : 2.2) : 1); cur.head = cur.head || r.head;
          hits.set(r.e.id, cur);
          this.gore.blood(end, d, r.head || !!G.pierce, !!r.e.T.goo);
          pierced.add(r.e);
          if (!G.pierce || pierced.size >= G.pierce) break;
          fall *= 0.75;
          r = this.enemies.raycast(o, d, block, pierced);
        }
      } else {
        end = o.clone().addScaledVector(d, block);
        if (block < G.range) this.gore.impact(end);
      }
      this.gore.tracer(muzzle, end);
      net.push([end.x, end.y, end.z].map((v) => +v.toFixed(1)).concat(pierced.size && !m ? [1] : []));
    }
    for (const h of hits.values()) {
      if (h.mate) { this.session?.send('pvp', { dmg: Math.round(h.dmg), d: [h.dir.x, h.dir.z], k: 3, by: this.profile.name }, h.mate.id); continue; }
      const heavy = key === 'shotgun' || key === 'sniper' || key === 'revolver';
      this.dealDamage(h.e, h.dmg, new THREE.Vector3(h.dir.x, 0, h.dir.z).normalize(), heavy ? 6 : 2, { head: h.head, stun: heavy ? 0.5 : 0.2 });
      this.ui.hitmark?.(h.e.dead || h.e.hp <= 0);
    }
    // le bruit attire les morts
    if (this.isAuthority()) this.enemies.noise(o, G.noise); else this.session?.send('noise', { p: [o.x, o.z], r: G.noise }, this.session.hostId);
    this.session?.send('gun', { k: key, m: [muzzle.x, muzzle.y, muzzle.z].map((v) => +v.toFixed(2)), e: net });
    this.tryHitFish(30, true);
  },
  // tir d'un coéquipier : traçantes, éclair, bruit, sang (visuel seulement)
  onRemoteGun(d, from) {
    const m = new THREE.Vector3(...d.m);
    this.gore.muzzle(m);
    for (const e of d.e || []) { const p = new THREE.Vector3(e[0], e[1], e[2]); this.gore.tracer(m, p); if (e[3]) this.gore.blood(p, p.clone().sub(m).normalize(), false); else this.gore.impact(p); }
    const dist = m.distanceTo(this.camera.position);
    if (dist < 160) this.audio.gun?.(GUNS[d.k]?.snd || 'pistol', Math.max(0.15, 1 - dist / 160));
    void from;
  },
  // obstacle sur la ligne de tir (terrain, murs, troncs) : distance
  rayBlock(o, d, maxT) {
    let best = maxT;
    // relief (pas de 1,5 m)
    for (let t = 1; t < best; t += 1.5) { const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t; if (y < heightAt(x, z)) { best = t; break; } }
    // colliders (murs en boîtes, troncs en cylindres) dans la tranche de hauteur
    const cols = this.colliders.concat(this.boeingCols || []);
    for (const c of cols) {
      if (c.disabled) continue;
      const bottom = c.bottom ?? (c.minY !== undefined ? c.minY + 1.75 : -50), top = c.top ?? (c.maxY !== undefined ? c.maxY + 0.3 : 60);
      let t = null;
      if (c.type === 'circle') {
        const fx = o.x - c.x, fz = o.z - c.z, a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), cc = fx * fx + fz * fz - c.r * c.r;
        const disc = b * b - 4 * a * cc;
        if (disc < 0 || a < 1e-6) continue;
        t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0) continue;
      } else {
        let t0 = 0, t1 = best;
        for (const [oo, dd, lo, hi] of [[o.x, d.x, c.minX, c.maxX], [o.z, d.z, c.minZ, c.maxZ]]) {
          if (Math.abs(dd) < 1e-6) { if (oo < lo || oo > hi) { t0 = 1; t1 = 0; } continue; }
          let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        }
        if (t0 > t1 || t0 <= 0.05) continue;
        t = t0;
      }
      if (t === null || t >= best) continue;
      const y = o.y + d.y * t;
      if (y < bottom || y > top) continue;
      best = t;
    }
    return best;
  },
  mateRay(o, d, maxT) {
    if (!this.session) return null;
    let best = null;
    for (const m of this.mateList()) {
      if (m.downed || m.aboard || m.mode !== 'explore') continue;
      const dxz = Math.hypot(d.x, d.z); if (dxz < 0.1) continue;
      const t0 = ((m.pos.x - o.x) * d.x + (m.pos.z - o.z) * d.z) / (dxz * dxz);
      if (t0 < 0 || t0 > maxT) continue;
      const px = o.x + d.x * t0 - m.pos.x, pz = o.z + d.z * t0 - m.pos.z;
      if (Math.hypot(px, pz) > 0.42) continue;
      const y = o.y + d.y * t0;
      if (y < m.pos.y || y > m.pos.y + 1.9) continue;
      if (!best || t0 < best.t) best = { mate: m, t: t0, head: y > m.pos.y + 1.5, point: new THREE.Vector3(o.x + d.x * t0, y, o.z + d.z * t0) };
    }
    return best;
  },
  // état d'arme publié pour la barre du bas
  gunHud() {
    const E = this.held();
    if (E.kind === 'gun') return `${this.heldItem()?.mag ?? 0} / ${this.invCount(AMMO_ITEM[E.key])}${this.reloadT > 0 ? ' · recharge…' : ''}`;
    if (E.key === 'flare') return `${this.invCount('a_flare')} fusées`;
    if (E.key === 'harpoon') return `${this.invCount('a_harpoon')} harpons`;
    if (E.key === 'launcher') return `${this.invCount('a_grenade')} grenades`;
    return '';
  },
  vmHeld() { return this.held().key; },
  // position d'impact visible sur le réticule
  crosshairSpread() { const E = this.held(); return E.kind === 'gun' ? (GUNS[E.key].spread + this.spreadK * 0.03) * (this.moving ? 1 : 0.6) : 0; },
  tmpV,
};
