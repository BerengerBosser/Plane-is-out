// Combat : mêlée, armes à projectiles, boss, siège de la centrale, ferraille, effets partagés
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt, LAYOUT, prep, flatMat } from './terrain.js';
import { createProjectiles, WEAPONS } from './weapons.js';
import { I2 } from './island2.js';

const SCRAP = { crab: 1, voile: 1, runner: 1, kingcrab: 12, warden: 20, mega: 8 };
const BOSS_HINT = {
  kingcrab: 'Carapace trop dure : esquivez sa charge, puis frappez pendant qu\'il est sonné',
  warden: 'Blindé dans le noir : attirez-le sous les projecteurs ou éblouissez-le aux fusées',
  mega: 'Visez la tête · reculez quand il lève les bras : son coup frappe tout autour de lui',
};
// munitions et messages des armes à projectiles
const PROJ_AMMO = {
  flare: ['a_flare', 'Plus de fusées', 'Comptoirs, caisses.'],
  harpoon: ['a_harpoon', 'Plus de harpons', 'Ramassez-les, ou comptoir.'],
  launcher: ['a_grenade', 'Plus de grenades', 'Caisses militaires, comptoirs.'],
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
    const d = dir ? { x: dir.x, z: dir.y ?? dir.z, k: e.type === 'mega' ? 20 : e.type === 'brute' ? 14 : 4 } : null;
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

  // toutes les cibles dans l'arc devant soi (masse)
  probeAll(origin, dir, range) {
    const out = [];
    for (const e of this.enemies.list) {
      if (e.dead || e.appear < 0.6) continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z, d = Math.hypot(dx, dz);
      if (d > range + e.T.radius) continue;
      if ((dx * dir.x + dz * dir.z) / (d || 1) < 0.35 && d > 0.9 + e.T.radius) continue;
      out.push(e);
    }
    return out;
  },

  fireWeapon(kind) {
    const W = WEAPONS[kind], A = PROJ_AMMO[kind];
    if (!this.invTake(A[0], 1)) { this.audio.error(); this.attackCd = 0.4; this.ui.toast(A[1], A[2], 'bad', 1800); return; }
    this.attackCd = W.cooldown;
    this.vm.attack(kind);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.7).add(new THREE.Vector3(0, -0.12, 0));
    if (kind === 'flare' || kind === 'launcher') dir.y += 0.06;
    this.projectiles.fire(kind, pos, dir, 'local');
    this.tryHitFish(30, true);
    this.session?.send('shot', { k: kind, p: [pos.x, pos.y, pos.z].map((v) => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map((v) => +v.toFixed(3)) });
    if (kind === 'flare') { this.audio.whoosh(); this.audio.spark(); } else if (kind === 'launcher') { this.audio.gun?.('launcher'); this.audio.whoosh(); } else { this.audio.clank(); this.audio.whoosh(); }
    this.player.shake = Math.max(this.player.shake, kind === 'flare' ? 0.3 : 0.5);
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
        if (kind === 'launcher') { this.explode(p, owner === 'local'); return; }
        if (kind !== 'flare') return;
        const W = WEAPONS.flare;
        if (this.isAuthority()) this.enemies.stunAround(p, W.radius, W.stun);
        else if (owner === 'local') this.session.send('stun', { p: [p.x, p.y, p.z], r: W.radius, s: W.stun }, this.session.hostId);
        if (p.distanceTo(this.camera.position) < 60) this.audio.spark();
      },
    });
  },

  // explosion de grenade : visuel et son partout ; dégâts calculés par le tireur (hôte : direct, invité : messages « hit »)
  explode(p, mine) {
    const W = WEAPONS.launcher;
    this.gore.explosion?.(p, W.blast);
    if (p.distanceTo(this.camera.position) < 200) this.audio.explosion();
    const me = this.playerWorld();
    const dme = Math.hypot(me.x - p.x, me.z - p.z);
    if (dme < 14) this.player.shake = Math.max(this.player.shake, 1.2 * (1 - dme / 14));
    // souffle sur soi-même (chacun le calcule pour lui)
    if (dme < W.blast * 0.7 && Math.abs(me.y - p.y) < 3) this.hurt(Math.round(45 * (1 - dme / (W.blast * 0.7))) + 8, 'explosion', { x: me.x - p.x, z: me.z - p.z, k: 10 });
    if (!mine) return;
    for (const e of this.enemies.list) {
      if (e.dead || e.appear < 0.3) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.T.radius * 0.5;
      if (d > W.blast || Math.abs(e.pos.y - p.y) > 4) continue;
      const k = Math.max(0.25, 1 - Math.max(0, d) / W.blast);
      const dir = new THREE.Vector3(e.pos.x - p.x, 0, e.pos.z - p.z).normalize();
      this.dealDamage(e, Math.round(W.dmg * k), dir, 12 * k, { stun: 0.9 * k });
      this.gore.blood(new THREE.Vector3(e.pos.x, e.pos.y + e.T.h * 0.5, e.pos.z), dir, true, !!e.T.goo);
      this.ui.hitmark?.(e.dead || e.hp <= 0);
    }
    if (this.isAuthority()) this.enemies.noise(p, 70); else this.session?.send('noise', { p: [p.x, p.z], r: 70 }, this.session.hostId);
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
      case 'megaSlam': {
        const p = new THREE.Vector3(...data.p);
        const d = p.distanceTo(this.playerWorld());
        this.gore.dirt(p, 2.6);
        if (d < 60) this.audio.thud();
        if (d < 22) this.player.shake = Math.max(this.player.shake, 1.1 * (1 - d / 22));
        break;
      }
      case 'megaRoar': if (Math.hypot(this.playerWorld().x - data.p[0], this.playerWorld().z - data.p[1]) < 60) { this.audio.groan(); this.audio.thud(); if (!this.said.has('mega')) { this.said.add('mega'); this.ui.toast('Méga-zombie !', 'Il bondit sur les fuyards. Visez la tête, reculez quand il lève les bras.', 'bad', 4500); } } break;
      case 'scream': if (Math.hypot(this.playerWorld().x - data.p[0], this.playerWorld().z - data.p[1]) < 90) { this.audio.scream(); this.player.shake = Math.max(this.player.shake, 0.3); if (!this.said.has('scream')) { this.said.add('scream'); this.ui.toast('Un Hurleur !', 'Il appelle les autres. Abattez-le en priorité.', 'bad', 4000); } } break;
      case 'storm':
        this.audio.siren();
        this.ui.toast('Tempête sur Saint-Escale', 'Pas de décollage avant 21 h. Défendez la centrale.', 'bad', 6000);
        this.radioOnce('storm', 'La tempête est là. Personne ne décolle avant 21 h. Sans courant, pas de projecteurs, et sans projecteurs, les morts vous submergent : postez-vous à la centrale, à l\'ouest du terminal, et gardez le générateur en vie jusqu\'à ce que le vent tombe.');
        break;
      case 'siege': this.ui.toast('Ils arrivent !', 'Défendez le générateur de la centrale jusqu\'à 21 h.', 'bad', 6000); this.audio.siren(); break;
      case 'wave': this.ui.toast(`Vague ${data.n}/3`, data.n === 3 ? 'Quelque chose d\'énorme sort de terre…' : data.n === 2 ? 'Un méga-zombie approche !' : 'Les zombies convergent vers la centrale.', 'bad', 5000); this.audio.hiss(); break;
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
      const n = 6 + 2 * S.wave + 3 * (N - 1);
      this.enemies.spawnAround('voile', G.x, G.z, n, 22, 38, { siege: true });
      this.enemies.spawnAround('crawler', G.x, G.z, 1 + S.wave, 20, 34, { siege: true });
      if (S.wave >= 2) this.enemies.spawnAround('runner', G.x, G.z, 2 + N, 26, 38, { siege: true });
      if (S.wave >= 2) this.enemies.spawnAround('mega', G.x, G.z, S.wave === 3 ? Math.ceil(N / 2) : 1, 26, 36, { siege: true });
      if (S.wave === 3 && !f.wardenDead) { this.enemies.setHpScale(1 + 0.6 * (N - 1)); this.enemies.spawnAround('warden', G.x, G.z, 1, 34, 40, { siege: true }); }
      this.fx('wave', { n: S.wave });
      this.dirtyWorld = true;
    }
    if (S.genHp <= 0 && this.island2.power) this.island2.setPower(false);
    if (S.genHp >= 60 && !this.island2.power && f.power) this.fx('genUp');
    if (h >= 21 || h < 6) {
      S.active = false;
      this.enemies.dismiss(G, 120, (e) => e.siege);
      this.act('flag', { stormOver: true });
      this.fx('stormOver');
      if (!this.island2.power && f.power) this.fx('genUp');
      this.dirtyWorld = true;
    }
  },

  // zone à tenir active (centrale de Saint-Escale, sas de décontamination d'Hélios) : { pos, wave }
  activeHoldZone() {
    if (this.siege.active) return { pos: this.island2.points.generator, wave: this.siege.wave };
    if (this.c4?.deconOn && this.island4) return { pos: this.island4.points.pad, wave: this._deconWave || 0 };
    return null;
  },
  // hôte : tant qu'on tient une zone, les morts sortent de terre en continu tout autour (en plus des vagues)
  updateHoldTrickle(dt) {
    if (!this.isAuthority()) return;
    const Z = this.activeHoldZone();
    if (!Z) { this._holdT = 3; return; }
    this._holdT = (this._holdT ?? 3) - dt;
    if (this._holdT > 0) return;
    const C = CFG.combat, N = this.playerCount();
    this._holdT = C.holdEvery * (0.7 + Math.random() * 0.6) / (1 + 0.25 * (N - 1));
    const alive = this.enemies.list.filter((e) => e.siege && !e.dead && Math.hypot(e.pos.x - Z.pos.x, e.pos.z - Z.pos.z) < 90).length;
    const want = C.holdMin + C.holdPerPlayer * (N - 1) + 2 * Z.wave;
    if (alive >= want) return;
    const pool = ['voile', 'voile', 'voile', 'runner', 'crawler', ...(Z.wave >= 2 ? ['runner', 'bloater'] : []), ...(Z.wave >= 3 ? ['brute', 'screamer'] : [])];
    const n = Math.min(want - alive, 2 + Math.floor(Math.random() * 3));
    for (let k = 0; k < n; k++) this.enemies.spawnAround(pool[Math.floor(Math.random() * pool.length)], Z.pos.x, Z.pos.z, 1, 18, 30, { siege: true });
    // à partir de la 3e vague, un méga-zombie peut rejoindre la mêlée
    const megas = this.enemies.list.filter((e) => e.type === 'mega' && !e.dead).length;
    if (Z.wave >= 3 && megas < Math.ceil(N / 2) && Math.random() < C.holdMegaChance) this.enemies.spawnAround('mega', Z.pos.x, Z.pos.z, 1, 24, 34, { siege: true });
  },

  updateBossHud() {
    const me = this.playerWorld();
    const b = this.enemies.list.find((e) => e.T.boss && !e.dead && e.state !== 'sleep' && e.pos.distanceTo(me) < 90)
      || this.enemies.list.find((e) => e.T.elite && !e.dead && e.appear >= 1 && e.pos.distanceTo(me) < 45);
    this.ui.boss(b ? { name: b.T.boss || b.T.name, hp: b.hp / b.maxHp, hint: BOSS_HINT[b.type] } : null);
    const lbl = document.querySelector('#genBar span');
    const c4 = this.c4, near4 = this.island4 && this.nearIsland(me) === 4;
    if (this.siege.active) { lbl.textContent = 'Générateur'; this.ui.gen({ hp: this.siege.genHp, info: `Tenez jusqu'à 21:00 · il est ${this.clock()} · vague ${this.siege.wave}/3` }); }
    else if (c4?.deconOn && near4) { lbl.textContent = 'Décontamination'; this.ui.gen({ hp: c4.decon / 75 * 100, info: 'Restez près du sas : sans personne, le cycle se met en pause' }); }
    else if (c4?.synthLeft > 0 && near4) { lbl.textContent = 'Synthèse'; this.ui.gen({ hp: c4.synthLeft / (this.playerCount() > 1 ? 100 : 170) * 100, info: `${['A', 'B', 'C'].filter((k) => this.flags[`synth${k}`]).length}/3 consoles · ${Math.ceil(c4.synthLeft)} s` }); }
    else this.ui.gen(null);
  },
};
