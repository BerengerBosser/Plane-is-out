// Combat : mêlée, armes à projectiles, boss, siège de la centrale, ferraille, effets partagés
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt, LAYOUT, prep, flatMat } from './terrain.js';
import { createProjectiles, WEAPONS } from './weapons.js';
import { I2 } from './island2.js';

const SCRAP = { crab: 1, voile: 1, runner: 1, kingcrab: 12, warden: 20 };
const BOSS_HINT = {
  kingcrab: 'Carapace trop dure : esquivez sa charge, puis frappez pendant qu\'il est sonné',
  warden: 'Blindé dans le noir : attirez-le sous les projecteurs ou éblouissez-le aux fusées',
};

// coquillages (la monnaie d'échange de l'archipel)
function buildScrap(n) {
  const g = new THREE.Group();
  const cols = ['#ffd6c2', '#ffb3a7', '#fff4e0', '#f7c873'];
  for (let i = 0; i < 2 + Math.min(3, n); i++) {
    const sh = new THREE.Mesh(prep(new THREE.ConeGeometry(0.09, 0.2, 6).rotateX(Math.PI / 2), cols[i % cols.length]), flatMat);
    sh.position.set((Math.random() - 0.5) * 0.4, 0.06, (Math.random() - 0.5) * 0.4);
    sh.rotation.y = Math.random() * 6;
    g.add(sh);
  }
  const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: '#fff1a8', toneMapped: false }));
  bolt.position.y = 0.35;
  g.add(bolt);
  g.userData.bolt = bolt;
  g.userData.noCollide = true;
  return g;
}

export const CombatMixin = {
  combatInit() {
    this.projectiles = createProjectiles(this.scene);
    this.pings = [];
    this.scrapPiles = [];
    this.dynScrapN = 0;
  },

  // tas de ferraille fixes (dépendent de l'île 2)
  // coquillages sur les plages des deux îles (ils reviennent chaque matin)
  placeStaticScrap() {
    for (const q of this.scrapPiles) this.scene.remove(q.mesh);
    this.scrapPiles = [];
    let k = 0;
    const beach = (cx, cz, rMax, n, seed) => {
      let s = seed;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
        const a = rnd() * Math.PI * 2;
        for (let r = rMax; r > 10; r -= 1.5) {
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * (cx ? 0.62 : 1);
          const h = heightAt(x, z);
          if (h > 0.35 && h < 1.3) { this.addScrapPile(`s${k++}`, x, z, 1 + Math.floor(rnd() * 2), false); i++; break; }
          if (h > 1.3) break;
        }
      }
    };
    beach(0, 0, 230, 18, 7);
    beach(this.island2.cx, this.island2.cz, 260, 16, 11);
  },
  addScrapPile(id, x, z, n, dyn) {
    if (this.scrapPiles.some((q) => q.id === id)) return;
    const mesh = buildScrap(n);
    const y = this.groundAt(x, z, 99);
    mesh.position.set(x, Math.max(y, 0), z);
    this.scene.add(mesh);
    this.scrapPiles.push({ id, n, mesh, pos: new THREE.Vector3(x, Math.max(y, 0) + 0.3, z), taken: false, dyn });
  },
  animScrap(dt) {
    for (const s of this.scrapPiles) if (!s.taken) { s.mesh.userData.bolt.rotation.z += dt * 2; s.mesh.userData.bolt.position.y = 0.35 + Math.sin(this.t * 3 + s.pos.x) * 0.06; }
  },

  // cibles pour l'IA ennemie (hôte)
  enemyTargets() {
    // dans la cabine du Boeing (garé ou en vol), les morts ne peuvent pas vous atteindre
    const me = this.playerWorld();
    const L = [{ id: this.myId(), pos: me, active: this.mode === 'explore' && !this.aboard && !this.downed && !this.bseat && !this.inBoeing?.(me) }];
    for (const m of this.mateList()) L.push({ id: m.id, pos: m.pos, active: m.mode === 'explore' && !m.aboard && !m.downed && !m.bseat && !this.inBoeing?.(m.pos) });
    return L;
  },
  onEnemyHitPlayer(dmg, e, pid, dir) {
    const d = dir ? { x: dir.x, z: dir.y ?? dir.z, k: e.type === 'brute' ? 14 : 4 } : null;
    if (pid === this.myId()) this.hurt(dmg, e.type, d);
    else this.session?.send('hurt', { dmg, type: e.type, dir: d }, pid);
  },

  hitFeedback(e, mul) {
    if (e.type === 'crab' || e.type === 'kingcrab') this.audio.hitShell(); else this.audio.hitFlesh();
    this.player.shake = Math.max(this.player.shake, 0.35);
    if (mul < 0.5 && this.t - (this._shellT || -99) > 6) { this._shellT = this.t; this.ui.toast(e.type === 'warden' ? 'Il absorbe le coup' : 'Carapace trop dure', BOSS_HINT[e.type] || '', 'bad', 3000); }
  },
  // recherche de cible sans dégâts (invités)
  probe(origin, dir, range) {
    let best = null, bd = 1e9;
    for (const e of this.enemies.list) {
      if (e.dead || e.appear < 0.6) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z, d = Math.hypot(dx, dz);
      if (d > range + e.T.radius) continue;
      const dot = (dx * dir.x + dz * dir.z) / (d || 1);
      if (dot < 0.55 && d > 0.9 + e.T.radius) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  fireWeapon(kind) {
    const W = WEAPONS[kind];
    if (!this.invTake(kind === 'flare' ? 'a_flare' : 'a_harpoon', 1)) { this.audio.error(); this.attackCd = 0.4; this.ui.toast(kind === 'flare' ? 'Plus de fusées' : 'Plus de harpons', kind === 'flare' ? 'Comptoirs, caisses.' : 'Ramassez-les, ou comptoir.', 'bad', 1800); return; }
    this.attackCd = W.cooldown;
    this.vm.attack(kind);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.7).add(new THREE.Vector3(0, -0.12, 0));
    if (kind === 'flare') dir.y += 0.06;
    this.projectiles.fire(kind, pos, dir, 'local');
    this.tryHitFish(30, true);
    this.session?.send('shot', { k: kind, p: [pos.x, pos.y, pos.z].map((v) => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map((v) => +v.toFixed(3)) });
    if (kind === 'flare') { this.audio.whoosh(); this.audio.spark(); } else { this.audio.clank(); this.audio.whoosh(); }
    this.player.shake = Math.max(this.player.shake, kind === 'harpoon' ? 0.5 : 0.3);
  },

  updateProjectiles(dt) {
    this.animScrap(dt);
    this.projectiles.update(dt, {
      sweep: (a, b) => this.enemies.sweep(a, b),
      onHit: (kind, e, dir) => {
        const W = WEAPONS[kind];
        if (this.isAuthority()) {
          const r = this.enemies.damage(e, W.dmg, dir, kind === 'harpoon' ? 7 : 3, this.lightSources());
          if (W.stun) this.enemies.stun(e, W.stun);
          if (r) this.hitFeedback(e, r.mul);
        } else {
          this.session.send('hit', { id: e.id, dmg: W.dmg, dir: [dir.x, dir.z], knock: kind === 'harpoon' ? 7 : 3, stun: W.stun || 0 }, this.session.hostId);
          this.hitFeedback(e, 1);
        }
      },
      onBurst: (kind, p, owner) => {
        if (kind !== 'flare') return;
        const W = WEAPONS.flare;
        if (this.isAuthority()) this.enemies.stunAround(p, W.radius, W.stun);
        else if (owner === 'local') this.session.send('stun', { p: [p.x, p.y, p.z], r: W.radius, s: W.stun }, this.session.hostId);
        if (p.distanceTo(this.camera.position) < 60) this.audio.spark();
      },
    });
  },

  onKill(e) {
    this.audio.hitShell();
    if (e.type === 'crab') { this.stats.crabs++; this.radioOnce('crabkill', 'Joli coup. Ils avalent des coquillages, ces bestioles : ramassez-les, Jo les accepte comme monnaie.'); } else if (!e.T.boss) this.stats.voiles++;
    if (this.isAuthority() && SCRAP[e.type] && (!['voile', 'runner'].includes(e.type) || Math.random() < 0.3)) {
      const id = `d${this.dynScrapN++}`;
      this.fx('scrapDrop', { id, x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), n: SCRAP[e.type] });
    }
  },
  onBossDeath(e) {
    if (e.type === 'kingcrab') this.act('flag', { kingDead: true });
    if (e.type === 'warden') this.act('flag', { wardenDead: true });
    this.fx('bossDead', { type: e.type });
  },
  onSiegeHit(d) {
    if (!this.isAuthority()) return;
    const before = this.siege.genHp;
    this.siege.genHp = Math.max(0, this.siege.genHp - d);
    if (before > 0 && this.siege.genHp <= 0) this.fx('genDown');
    else this.fx('genHit');
    this.dirtyWorld = true;
  },

  // effets : produits par l'hôte, joués partout
  fx(type, data = {}) {
    if (this.session && !this.session.isHost) return;
    this.session?.send('fx', { type, data });
    this.applyFx(type, data);
  },
  applyFx(type, data) {
    const near = (x, z, r) => Math.hypot(this.playerWorld().x - x, this.playerWorld().z - z) < r;
    switch (type) {
      case 'voiles': this.audio.groan(); this.radioOnce('voiles', 'Les morts sortent de terre… Visez la tête, restez groupés. La lumière les ralentit et les brûle un peu, les fusées les éblouissent.'); break;
      case 'bossWake':
        this.audio.siren();
        if (data.type === 'kingcrab') { this.ui.toast('Le Crabe-Roi se réveille !', BOSS_HINT.kingcrab, 'bad', 7000); this.radioOnce('king', 'Qu\'est-ce que c\'est que ce bruit ? … Un crabe de cette taille ? Ne restez pas en face quand il charge !'); }
        break;
      case 'bossHalf': this.ui.toast('Il appelle à l\'aide !', 'Des crabes sortent du sable.', 'bad'); break;
      case 'bossTele': this.audio.hiss(); break;
      case 'bossStun': this.audio.clank(); this.ui.toast('Sonné !', 'Frappez maintenant : sa carapace est ouverte.', 'good', 1800); break;
      case 'summon': this.audio.hiss(); break;
      case 'slam': this.audio.explosion(); if (this.bossNear('warden', 18)) this.player.shake = 1; break;
      case 'bossDead':
        this.audio.success();
        if (data.type === 'kingcrab') { this.ui.toast('Le Crabe-Roi est vaincu !', 'Dans sa crique, un râtelier de pêche apparaît : fusil-harpon.', 'good', 8000); this.radioOnce('kingdead', 'Vous l\'avez eu ! Il gardait un vieux fusil-harpon dans sa crique. Allez le chercher.'); }
        else { this.ui.toast('Le Colosse s\'effondre', 'Les zombies autour de la centrale hésitent.', 'good', 8000); this.radioOnce('warddead', 'Le Colosse… à terre ? Je n\'aurais jamais cru ça possible. Tenez jusqu\'à 21 h !'); }
        break;
      case 'scrapDrop': this.addScrapPile(data.id, data.x, data.z, data.n, true); break;
      case 'bloat': {
        const p = new THREE.Vector3(...data.p);
        this.gore.gas(p); this.gore.blood(p.clone().setY(p.y + 1), null, true, true);
        if (p.distanceTo(this.camera.position) < 80) this.audio.bloat();
        const me = this.playerWorld();
        if (this.mode === 'explore' && !this.aboard && me.distanceTo(p) < 3.8) this.hurt(22, 'bloater', { x: me.x - p.x, z: me.z - p.z, k: 10 });
        if (this.isAuthority()) for (const e of this.enemies.list) if (!e.dead && e.pos.distanceTo(p) < 3.5 && e.type !== 'bloater') this.enemies.damage(e, 60, { x: e.pos.x - p.x, z: e.pos.z - p.z }, 8, []);
        break;
      }
      case 'scream': if (Math.hypot(this.playerWorld().x - data.p[0], this.playerWorld().z - data.p[1]) < 90) { this.audio.scream(); this.player.shake = Math.max(this.player.shake, 0.3); if (!this.said.has('scream')) { this.said.add('scream'); this.ui.toast('Un Hurleur !', 'Il appelle les autres. Abattez-le en priorité.', 'bad', 4000); } } break;
      case 'storm':
        this.audio.siren();
        this.ui.toast('Tempête sur Saint-Escale', 'Pas de décollage avant 21 h. Défendez la centrale.', 'bad', 6000);
        this.radioOnce('storm', 'La tempête est là. Personne ne décolle avant 21 h. Sans courant, pas de projecteurs, et sans projecteurs, les morts vous submergent : postez-vous à la centrale, à l\'ouest du terminal, et gardez le générateur en vie jusqu\'à ce que le vent tombe.');
        break;
      case 'siege': this.ui.toast('Ils arrivent !', 'Défendez le générateur de la centrale jusqu\'à 21 h.', 'bad', 6000); this.audio.siren(); break;
      case 'wave': this.ui.toast(`Vague ${data.n}/3`, data.n === 3 ? 'Quelque chose d\'énorme sort de terre…' : 'Les zombies convergent vers la centrale.', 'bad', 5000); this.audio.hiss(); break;
      case 'genHit': if (near(this.island2.points.generator.x, this.island2.points.generator.z, 40)) this.audio.hitShell(); break;
      case 'genDown': this.audio.explosion(); this.island2.setPower(false); this.ui.toast('Générateur en panne !', 'Réparez-le à la clé (E).', 'bad', 4000); break;
      case 'genUp': this.island2.setPower(true); this.audio.powerUp(); this.ui.toast('Générateur relancé', 'Les projecteurs se rallument.', 'good'); break;
      case 'stormOver':
        this.audio.success();
        this.ui.toast('21:00 · la tempête passe', 'Décollez depuis la piste !', 'good', 5000);
        this.radioOnce('stormover', 'La tempête s\'éloigne ! Tout le monde à bord, et décollez depuis la piste. Cap sur Hélios : cette fois, le réservoir est plein.');
        break;
      case 'ended': break;
      default: if (!this.applyFx4?.(type, data)) { this.applyNightFx?.(type, data); this.applyWreckFx?.(type, data); } break;
    }
  },
  bossNear(type, r) { return this.enemies.list.some((e) => e.type === type && !e.dead && e.pos.distanceTo(this.playerWorld()) < r); },

  // ── siège de la centrale (hôte) ──
  updateSiege() {
    const f = this.flags, S = this.siege, h = ((this.hour % 24) + 24) % 24;
    const N = this.playerCount();
    if (!f.storm && f.radioDone && f.wheels && f.refueled) {
      this.act('flag', { storm: true });
      // déjà tard (ou en pleine nuit) : la tempête est passée pendant que vous travailliez
      if (h >= 21 || h < 7) { this.act('flag', { stormOver: true }); this.fx('stormOver'); } else this.fx('storm');
    }
    if (!f.storm || f.stormOver) return;
    if (!S.active && h >= 18.9 && h < 21) { S.active = true; S.wave = 0; S.genHp = 100; this.fx('siege'); this.dirtyWorld = true; }
    if (!S.active) return;
    const G = this.island2.points.generator;
    const waves = [19.05, 19.6, 20.2];
    if (S.wave < 3 && h >= waves[S.wave]) {
      S.wave++;
      const n = 3 + S.wave + 2 * (N - 1);
      this.enemies.spawnAround('voile', G.x, G.z, n, 28, 42, { siege: true });
      if (S.wave >= 2) this.enemies.spawnAround('runner', G.x, G.z, 1 + N, 30, 40, { siege: true });
      if (S.wave === 3 && !f.wardenDead) { this.enemies.setHpScale(1 + 0.6 * (N - 1)); this.enemies.spawnAround('warden', G.x, G.z, 1, 34, 40, { siege: true }); }
      this.fx('wave', { n: S.wave });
      this.dirtyWorld = true;
    }
    if (S.genHp <= 0 && this.island2.power) this.island2.setPower(false);
    if (S.genHp >= 60 && !this.island2.power && f.power) this.fx('genUp');
    if (h >= 21 || h < 6) {
      S.active = false;
      this.act('flag', { stormOver: true });
      this.fx('stormOver');
      if (!this.island2.power && f.power) this.fx('genUp');
      this.dirtyWorld = true;
    }
  },

  updateBossHud() {
    const me = this.playerWorld();
    const b = this.enemies.list.find((e) => e.T.boss && !e.dead && e.state !== 'sleep' && e.pos.distanceTo(me) < 90);
    this.ui.boss(b ? { name: b.T.boss, hp: b.hp / b.maxHp, hint: BOSS_HINT[b.type] } : null);
    const lbl = document.querySelector('#genBar span');
    const c4 = this.c4, near4 = this.island4 && this.nearIsland(me) === 4;
    if (this.siege.active) { lbl.textContent = 'Générateur'; this.ui.gen({ hp: this.siege.genHp, info: `Tenez jusqu'à 21:00 · il est ${this.clock()} · vague ${this.siege.wave}/3` }); }
    else if (c4?.deconOn && near4) { lbl.textContent = 'Décontamination'; this.ui.gen({ hp: c4.decon / 75 * 100, info: 'Restez près du sas : sans personne, le cycle se met en pause' }); }
    else if (c4?.synthLeft > 0 && near4) { lbl.textContent = 'Synthèse'; this.ui.gen({ hp: c4.synthLeft / (this.playerCount() > 1 ? 100 : 170) * 100, info: `${['A', 'B', 'C'].filter((k) => this.flags[`synth${k}`]).length}/3 consoles · ${Math.ceil(c4.synthLeft)} s` }); }
    else this.ui.gen(null);
  },
};
