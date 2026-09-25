// Santé du Coucou et crashs : plus l'impact est violent, plus l'avion souffre (jauge de coque).
// Petit choc : quelques bosses. Crash : pièces éjectées, coque percée, carcasse noircie.
// On répare au FER À SOUDER, relié par un câble au poste à souder du flanc droit :
// chaque bosse, tôle ou pièce ressoudée fait remonter la jauge, et la carcasse retrouve ses couleurs.
// Épave à sec : avec les roues amphibies, elle repart de la terre ferme ; sinon, on la treuille jusqu'à l'eau.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { SLOTS, HOLES, DENTS, WELDER, WHEEL_DROP } from './planeModel.js';
import { ITEMS, PART_ORDER } from './defs.js';

const IRON_LEN = 18;
// treuil : quand l'avion coince, le câble se tend puis l'arrache d'un coup, comme un élastique
const STRAIN_T = 1.8;         // s de tension avant que ça lâche
const SNAP_DUR = 0.45;        // durée du bond
const SNAP_TRIES = [3.5, 5, 6.5, 2.5, 8];          // longueur du câble du fer (m)
const LO = 50, HI = 90;       // zone verte de la jauge de chaleur
// coque : chaque bosse, pièce manquante ou trou ouvert retire des points (le pire crash laisse ~10 à 20 %)
const HP = { dent: 5, part: 8, hole: 6 };
const PLATES = ['plateA', 'plateB', 'plateC', 'plateD'];
const SIDE_DENTS = DENTS.map((D, i) => (Math.abs(D.n[0]) > 0.5 && !D.part ? i : -1)).filter((i) => i >= 0);

// points de soudure (repère local de la carlingue) : un seul par pièce ou par tôle, au centre des fixations
function weldPoints(k) {
  const pts = rawWeldPoints(k);
  if (pts.length <= 1) return pts;
  return [pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length)];
}
function rawWeldPoints(k) {
  const add = (base, offs) => offs.map(([x, y, z]) => base.clone().add(new THREE.Vector3(x, y, z)));
  if (k === 'engineL' || k === 'engineR') return add(SLOTS[k], [[-0.5, 0.42, 0.7], [0.5, 0.42, 0.7], [-0.5, -0.38, 0.7], [0.5, -0.38, 0.7]]);
  if (k === 'wingL') return [new THREE.Vector3(-3.05, 4.1, -1.5), new THREE.Vector3(-3.05, 4.1, -0.6), new THREE.Vector3(-3.05, 4.1, 0.3), new THREE.Vector3(-3.3, 3.9, -0.6)];
  if (k === 'prop') return add(SLOTS.prop, [[0.28, 0.28, 0.15], [-0.28, 0.28, 0.15], [0, -0.34, 0.15]]);
  if (k === 'floats') return [new THREE.Vector3(-2.3, 0.55, -1.2), new THREE.Vector3(2.3, 0.55, -1.2), new THREE.Vector3(-2.3, 0.55, 2.0), new THREE.Vector3(2.3, 0.55, 2.0)];
  if (k === 'dashboard') return add(SLOTS.dashboard, [[-0.9, 0.2, 0.19], [0.9, 0.2, 0.19]]);
  if (k[0] === 'h') {
    const h = HOLES[+k[1]];
    const out = h.n.clone().multiplyScalar(0.09);
    return [[0, 0.3, -0.42], [0, 0.3, 0.42], [0, -0.3, -0.42], [0, -0.3, 0.42]].map(([x, y, z]) => h.p.clone().add(new THREE.Vector3(x, y, z)).add(out));
  }
  if (k[0] === 'd') { const D = DENTS[+k.slice(1)]; return [new THREE.Vector3(...D.p).addScaledVector(new THREE.Vector3(...D.n).normalize(), 0.08)]; }
  return [];
}

// halo lumineux (orbes de réparation, points de soudure)
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,150,.9)'); gr.addColorStop(0.6, 'rgba(255,150,60,.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

const freshWreck = () => ({ placed: {}, holes: [0, 0, 0, 0], dents: [], pos: null, stranded: false });

export const WreckMixin = {
  wreckInit() {
    this.wreck = freshWreck();
    this.weldMeshes = new THREE.Group();
    this.plane.body.add(this.weldMeshes);
    this.weldDot = new THREE.SphereGeometry(0.045, 8, 6);
    this.weldBead = new THREE.SphereGeometry(0.06, 6, 4);
    this.weldMatOn = new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false });
    this.weldMatDone = new THREE.MeshLambertMaterial({ color: '#5d646c', emissive: '#2a1a10' });
    this.weldGlowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.weldHeat = 0; this.weldCool = 0;
    this.repairFlashT = 0;
    this.iron = null;
    // étincelles
    this.sparks = [];
    const sg = new THREE.BoxGeometry(0.03, 0.03, 0.12);
    const sm = new THREE.MeshBasicMaterial({ color: '#ffd37a', toneMapped: false });
    for (let i = 0; i < 50; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.scene.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0 }); }
    this.winch = { hook: null, anchor: null, on: false };
  },
  resetWreck() {
    this.wreck = freshWreck();
    this.winch = { hook: null, anchor: null, on: false };
    this.iron = null;
    HOLES.forEach((_, i) => this.plane.setHole(i, 0));
    for (const k of PLATES) { const it = this.items[k]; if (it) { it.state = 'hidden'; it.mesh.visible = false; } }
    this.refreshWelds();
    this.refreshDamage();
  },
  wreckActive() { return this.flags.wrecked || this.wreck.stranded; },

  // ── santé de la coque (déduite des dégâts : bosses, pièces manquantes, trous ouverts) ──
  planeHp() {
    const W = this.wreck;
    let hp = 100 - HP.dent * W.dents.length - HP.hole * W.holes.filter((h) => h === 1 || h === 2).length;
    if (this.flags.wrecked) hp -= HP.part * PART_ORDER.filter((k) => !this.installed.has(k)).length;
    return Math.max(0, Math.min(100, hp));
  },
  // aspect de la carcasse : bosses visibles, couleur salie, fumée
  refreshDamage() {
    const W = this.wreck;
    this.plane.dents.forEach((m, i) => { m.visible = W.dents.includes(i) && (!m.userData.part || this.installed.has(m.userData.part)); });
    this._dmgK = 1 - this.planeHp() / 100;
  },
  updateDamageLook(dt) {
    this.repairFlashT = Math.max(0, this.repairFlashT - dt * 1.6);
    const k = this._dmgK ?? 0;
    this._dmgShow = (this._dmgShow ?? k) + (k - (this._dmgShow ?? k)) * Math.min(1, dt * 2.5);
    this.plane.damageLook(this._dmgShow, this.repairFlashT);
    // fumée : l'avion blessé fume, de plus en plus noir
    const hp = this.planeHp();
    const want = this.planeLive && hp < 60 ? (hp < 30 ? 'b' : 'g') : '';
    if (want !== this._dmgSmoke) {
      this._dmgSmoke = want;
      this.smoke.remove('dmg');
      if (want) this.smoke.add('dmg', () => this.plane.body.localToWorld(SLOTS.engineL.clone().add(new THREE.Vector3(0, 0.6, 0.8))), want === 'b' ? '#2a2626' : '#8a8580', want === 'b' ? 3 : 1.6, 2.4);
    }
  },
  repairFx(p) {
    this.repairFlashT = 1;
    if (p) this.emitSparks(p, 22, '#5ef2c2');
    this.audio.success?.();
  },

  // ── dégâts ──
  // choc au roulage : une bosse (l'hôte ou le propriétaire de l'avion décide)
  bumpPlane() {
    if (!this.ownsPlane() || this.wreckActive()) return;
    const sp = this.flight.impactSpeed || 0;
    if (sp < 3 || this.t - (this._bumpT || -9) < 1.2) return;
    const sev = sp / 7;
    this._bumpT = this.t;
    const n = 1;
    const add = this.freeDents().slice(0, n);
    if (add.length) this.act('dent', { add });
    if (this.planeHp() <= 0) this.wreckPlane('usure', 0.5);
  },
  // crash : appelé par la machine qui simule l'avion ; sev ∈ [0, 1] selon la vitesse et la vitesse verticale
  wreckPlane(reason, sev = 0.7) {
    if (this.flags.wrecked) return;
    const f = this.flight;
    let x = f.pos.x, z = f.pos.z;
    const yaw = f.yaw;
    if (heightAt(x, z) < -1.4) { const s = this.nearestShore(x, z); x = s.x; z = s.z; }
    sev = Math.max(0, Math.min(1, sev));
    // réparation courte : au pire 1 pièce, 1 trou et 2 bosses
    const nParts = sev < 0.7 ? 0 : 1;
    const nHoles = sev < 0.4 ? 0 : 1;
    const nDents = sev < 0.6 ? 1 : 2;
    const cand = ['engineL', 'engineR', 'wingL', 'prop'].filter((k) => this.installed.has(k)).sort(() => Math.random() - 0.5);
    const spot = (dmin, dmax) => {
      for (let t = 0; t < 30; t++) {
        const a = yaw + Math.PI + (Math.random() - 0.5) * 2.4, d = dmin + Math.random() * (dmax - dmin);
        const px = x + Math.sin(a) * -d, pz = z + Math.cos(a) * -d;
        if (heightAt(px, pz) > -0.5) return { x: +px.toFixed(2), z: +pz.toFixed(2) };
      }
      const s = this.nearestShore(x + (Math.random() - 0.5) * 16, z + (Math.random() - 0.5) * 16);
      return { x: +s.x.toFixed(2), z: +s.z.toFixed(2) };
    };
    const parts = cand.slice(0, nParts).map((k) => ({ k, ...spot(8, 20) }));
    // une épave a toujours au moins une chose à réparer avant de repartir
    const holeIdx = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, parts.length ? nHoles : Math.max(nHoles, 1));
    const plates = holeIdx.map((_, i) => ({ id: PLATES[i], ...spot(5, 14) }));
    const free = this.freeDents();
    const dents = [...this.wreck.dents, ...free.slice(0, nDents)];
    this.act('wreck', { x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), parts, plates, holes: holeIdx, dents, sev: +sev.toFixed(2), reason });
  },
  // bosses possibles (dans le désordre) : seulement sur les flancs, jamais sur le toit, les ailes ou les flotteurs
  freeDents() {
    return SIDE_DENTS.filter((i) => !this.wreck.dents.includes(i)).sort(() => Math.random() - 0.5);
  },
  // violence d'un impact (0 = effleurement, 1 = crash à pleine vitesse)
  impactSeverity() {
    const f = this.flight;
    return Math.max(0, Math.min(1, (f.speed - 12) / 35 + Math.max(0, -f.vy - 5) / 12 + (Math.abs(f.roll) > 0.6 ? 0.15 : 0)));
  },
  // atterrissage brutal : l'avion reste entier mais se cabosse
  hardLanding(sev) {
    const f = this.flight;
    const g = heightAt(f.pos.x, f.pos.z);
    f.pos.addScaledVector(f.forward(f.yaw, 0), -2);
    f.speed = 0; f.pitch = 0; f.roll = 0; f.vy = 0; f.autopilot = false;
    if (g > -0.6 && this.flags.wheels) { f.surface = 'ground'; f.pos.y = heightAt(f.pos.x, f.pos.z) + WHEEL_DROP; } else { f.surface = 'water'; f.pos.y = 0; }
    f.apply();
    this.act('dent', { add: this.freeDents().slice(0, 1) });
    this.audio.clank(); this.audio.splash?.();
    this.player.shake = 1;
    this.ui.toast('Atterrissage brutal', `Coque ${Math.round(this.planeHp())} %`, 'bad', 2600);
  },
  // eau libre la plus proche (pour remettre une épave à flot)
  nearestWater(x, z) {
    for (let d = 4; d < 400; d += 4) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a / 16 * Math.PI * 2) * d, pz = z + Math.sin(a / 16 * Math.PI * 2) * d;
        if (heightAt(px, pz) < -1.6 && heightAt(px + 8, pz) < -1.2 && heightAt(px - 8, pz) < -1.2 && heightAt(px, pz + 8) < -1.2 && heightAt(px, pz - 8) < -1.2) return { x: px, z: pz };
      }
    }
    return { x, z };
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
    const holes = [0, 0, 0, 0];
    for (const i of d.holes || []) holes[i] = 1;
    this.wreck = { placed: {}, holes, dents: (d.dents || []).filter((i) => SIDE_DENTS.includes(i)), pos: { x: d.x, z: d.z, yaw: d.yaw }, stranded: false };
    holes.forEach((h, i) => this.plane.setHole(i, h));
    this.refreshWelds();
    this.refreshDamage();
    this.smoke.add('wreck', () => this.plane.root.localToWorld(new THREE.Vector3(0, 3.6, 1)), '#3d3a3a', 2 + (d.sev || 0.5) * 2, 2.2);
    this.audio.explosion();
    this.ui.fade(0.7, '#fff', 60);
    setTimeout(() => this.ui.fade(0, '#fff', 900), 80);
    if (this.iron) this.iron = null;
    if (wasPilot) { this.mode = 'explore'; this.ui.el.hud.dataset.mode = 'explore'; this.ui.flight(false); this.audio.setEngine(0, 0); }
    if (aboard) {
      this.aboard = false; this.seat = null;
      const out = this.plane.root.localToWorld(new THREE.Vector3(4.2 + Math.random(), 0, 2.2));
      this.player.place(out.x, out.z, this.player.yaw + (wasPilot ? this.flight.yaw : 0));
      this.player.pos.y = Math.max(this.groundAt(out.x, out.z, 99), -1.25);
      this.hp = Math.max(15, this.hp - 10 - 30 * (d.sev ?? 0.6));
      this.player.shake = 1;
    }
    const hp = Math.round(this.planeHp());
    const light = !d.parts.length && !(d.holes || []).length;
    this.ui.toast(light ? 'Atterrissage brutal' : 'CRASH !', `Coque ${hp} % · réparez au fer à souder (flanc droit).`, 'bad', 6000);
    this.radioOnce(`crash${this.stats.days}`, light ? 'Aïe, ça a secoué ! Le poste à souder est sur le flanc droit : ressoudez les bosses avant de repartir.' : 'Je vous ai perdus sur le radar… Vous êtes vivants ? Bon. Décrochez le fer du poste à souder, sur le flanc droit. Plaquez des tôles sur les trous, ressoudez les pièces.');
    this.refreshCarnet();
    void me;
  },
  setWreckPose(x, z, yaw) {
    const g = heightAt(x, z);
    const onLand = g > -0.5;
    const wheels = onLand && this.flags.wheels;
    this.plane.root.position.set(x, onLand ? g + (wheels ? WHEEL_DROP * 0.75 : 0.35) : -0.55, z);
    this.plane.root.rotation.set(onLand ? (wheels ? 0.03 : 0.06) : 0.04, yaw, onLand ? (wheels ? 0.06 : 0.14) : 0.1, 'YXZ');
    this.flight.pos.set(x, this.plane.root.position.y, z);
    this.flight.yaw = yaw;
    // un crash en vol laissait l'avion « en l'air » : le poste à souder et l'escalier restaient introuvables
    this.flight.surface = onLand ? 'ground' : 'water';
    this.flight.vy = 0;
    if (this.wreck) this.wreck.pos = { x, z, yaw };
  },

  // ── fer à souder : décroché du poste, relié par un câble ──
  welderPoint() { return this.plane.root.localToWorld(WELDER.cable.clone()); },
  welderSpecs(add) {
    const me = this.myId();
    const box = this.plane.root.localToWorld(WELDER.box.clone());
    // toujours accessible : libre, tenu par moi, ou repris à un coéquipier (fer oublié, joueur parti…)
    if (this.iron === me) add(box, 3.2, { prio: 4, prompt: '<kbd>E</kbd> Raccrocher le fer', press: () => this.dropIron() });
    else add(box, 3.2, { prio: 4, prompt: this.iron ? '<kbd>E</kbd> Reprendre le fer à souder' : '<kbd>E</kbd> Fer à souder', press: () => this.takeIron() });
  },
  takeIron() {
    if (this.carrying) this.dropCarried();
    if (this.act('iron', { on: 1, force: 1 }) === false) return;
    if (this.inv.sel !== 'fists') { this.inv.sel = 'fists'; this.syncHeld?.(); }
    this.reloadT = 0;
    this.audio.clank();
    if (!this.said.has('ironTip')) { this.said.add('ironTip'); this.ui.toast('Fer à souder', 'Visez un point orange · clic maintenu · relâchez dans le vert.', 'good', 5000); }
  },
  dropIron() { if (this.iron === this.myId()) { this.act('iron', { on: 0 }); this.audio.clank(); } },
  holdingIron() { return this.iron === this.myId(); },
  // câble du fer : un tube qui suit la main (ou le coéquipier qui le tient)
  updateIron() {
    const holder = this.iron;
    this.plane.ironHome.visible = !holder;
    if (!holder || !this.inGame()) { if (this.ironCable) this.ironCable.visible = false; if (this.ironTool) this.ironTool.visible = false; return; }
    let end = null;
    if (holder === this.myId()) {
      if (this.aboard || this.driving || this.downed || this.mode !== 'explore' || this.carrying) { this.dropIron(); return; }
      const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw);
      const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
      end = this.camera.position.clone().addScaledVector(fw, 0.5).addScaledVector(right, 0.24).add(new THREE.Vector3(0, -0.3, 0));
      if (this.input.hit('KeyG')) { this.dropIron(); return; }
    } else { const m = this.mateList().find((q) => q.id === holder); if (m) end = m.pos.clone().add(new THREE.Vector3(0, 1.0, 0)); else if (this.isAuthority() && this.session && !this.session.players.has(holder)) { this.act('iron', { on: 0, force: 1 }); return; } }
    if (!end) { if (this.ironCable) this.ironCable.visible = false; return; }
    const start = this.welderPoint();
    const dist = start.distanceTo(end);
    if (holder === this.myId() && dist > IRON_LEN) { this.dropIron(); this.ui.toast('Câble trop court', `${IRON_LEN} m maximum.`, 'bad', 1600); return; }
    const sag = Math.max(0.3, (IRON_LEN - dist) * 0.12);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; const p = start.clone().lerp(end, t); p.y -= Math.sin(Math.PI * t) * sag; p.y = Math.max(p.y, this.groundAt(p.x, p.z, p.y + 2) + 0.04); pts.push(p); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.022, 5, false);
    if (!this.ironCable) { this.ironCable = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#1d2233' })); this.scene.add(this.ironCable); }
    else { this.ironCable.geometry.dispose(); this.ironCable.geometry = geo; }
    this.ironCable.visible = true;
    // fer tenu par un coéquipier : petit modèle au bout du câble
    if (!this.ironTool) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), new THREE.MeshLambertMaterial({ color: '#33373f' })));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.12), new THREE.MeshLambertMaterial({ color: '#ffd166' })); b.position.z = -0.16; g.add(b);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false })); tip.position.z = -0.27; g.add(tip);
      this.ironTool = g; this.scene.add(g);
    }
    this.ironTool.visible = holder !== this.myId();
    if (this.ironTool.visible) { this.ironTool.position.copy(end); this.ironTool.lookAt(end.clone().add(new THREE.Vector3(Math.sin(this.t), -0.3, Math.cos(this.t)))); }
  },

  // ── soudure ──
  pendingWelds() {
    const out = [];
    for (const [k, mask] of Object.entries(this.wreck.placed)) {
      weldPoints(k).forEach((p, i) => out.push({ k, i, p, done: !!(mask & (1 << i)) }));
    }
    for (const i of this.wreck.dents) {
      const m = this.plane.dents[i];
      if (m && m.visible) out.push({ k: `d${i}`, i: 0, p: weldPoints(`d${i}`)[0], done: false, dent: true });
    }
    return out;
  },
  refreshWelds() {
    const g = this.weldMeshes;
    while (g.children.length) g.remove(g.children[0]);
    if (!this.wreck) return;
    for (const w of this.pendingWelds()) {
      const m = new THREE.Group();
      m.position.copy(w.p);
      m.userData = { k: w.k, i: w.i, done: w.done, dent: w.dent };
      if (w.done) m.add(new THREE.Mesh(this.weldBead, this.weldMatDone));
      else {
        m.add(new THREE.Mesh(this.weldDot, this.weldMatOn));
        const s = new THREE.Sprite(this.weldGlowMat); s.scale.setScalar(w.dent ? 0.55 : 0.32); m.add(s);
        m.userData.glow = s;
      }
      g.add(m);
    }
  },
  weldComplete(k) { const n = weldPoints(k).length; return (this.wreck.placed[k] || 0) === (1 << n) - 1; },

  // appelée chaque image à pied ; renvoie vrai si le clic sert à souder
  updateWeld(dt) {
    const ui = this.ui;
    this.weldCool = Math.max(0, this.weldCool - dt);
    for (const m of this.weldMeshes.children) if (m.userData.glow) m.userData.glow.material.opacity = 0.65 + Math.sin(this.t * 6) * 0.3;
    this.updateSparks(dt);
    if (!this.holdingIron() || this.aboard || this.carrying) { ui.weld(null); this.weldHeat = 0; return false; }
    // point visé
    const eye = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best = null, bd = 0.965;
    for (const m of this.weldMeshes.children) {
      if (m.userData.done) continue;
      const wp = m.getWorldPosition(new THREE.Vector3());
      const to = wp.clone().sub(eye);
      const d = to.length();
      if (d > 3.8) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bd) { bd = dot; best = { m, wp }; }
    }
    if (!best) { ui.weld(null); if (this.weldHeat > 0) this.weldHeat = 0; ui.prompt(this.pendingWelds().some((w) => !w.done) ? '' : '<kbd>G</kbd> Raccrocher le fer'); return !!this.input.down('MouseL'); }
    const holding = this.input.down('MouseL');
    if (this.weldCool > 0) { ui.weld({ heat: 0, lo: LO, hi: HI, msg: 'Refroidissement…' }); return true; }
    if (holding) {
      // chauffe irrégulière : il faut surveiller la jauge
      this.weldHeat += dt * (48 + 22 * Math.sin(this.t * 3.1 + best.m.userData.i));
      this.emitSparks(best.wp, 3);
      this.welding = 0.2;
      this._sizzle = (this._sizzle || 0) - dt;
      if (this._sizzle <= 0) { this._sizzle = 0.12; this.audio.spark(); }
      if (this.weldHeat >= 100) {
        this.weldHeat = 0; this.weldCool = 1.2;
        this.emitSparks(best.wp, 25);
        this.audio.error();
        this.hp -= 4; this.lastHurt = this.t; this.ui.hurt(0.4); setTimeout(() => this.ui.hurt(0), 200);
        this.ui.toast('Surchauffe', '', 'bad', 1100);
      }
    } else if (this.weldHeat > 0) {
      const h = this.weldHeat;
      this.weldHeat = 0;
      if (h >= LO && h <= HI) {
        const u = best.m.userData;
        if (u.dent) this.act('dent', { fix: +u.k.slice(1) });
        else this.act('weld', { k: u.k, i: u.i });
        this.emitSparks(best.wp, 14);
        this.audio.note(1320);
      } else if (h > 12) { this.audio.error(); this.ui.toast('Trop tôt', '', 'bad', 900); }
    }
    ui.weld({ heat: this.weldHeat, lo: LO, hi: HI, msg: holding ? 'Relâchez dans le vert' : 'Clic maintenu' });
    ui.prompt('');
    return true;
  },
  emitSparks(p, n, color) {
    if (!this._sparkBase) { this._sparkBase = this.sparks[0].m.material; this._sparkMint = new THREE.MeshBasicMaterial({ color: '#5ef2c2', toneMapped: false }); }
    for (let k = 0; k < n; k++) {
      const s = this.sparks.find((q) => q.life <= 0);
      if (!s) return;
      s.life = 0.35 + Math.random() * 0.3;
      s.m.visible = true;
      s.m.material = color ? this._sparkMint : this._sparkBase;
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
    if (type === 'iron') {
      if (d.on) { if (auth && !d.force && this.iron && this.iron !== by && (!this.session || this.session.players.has(this.iron))) return false; this.iron = by; }
      else if (this.iron === by || d.force) this.iron = null;
      return true;
    }
    if (type === 'dent') {
      if (d.add) { for (const i of d.add) if (!this.wreck.dents.includes(i)) this.wreck.dents.push(i); this.audio.clank(); if (!me) this.player.shake = Math.max(this.player.shake, 0.2); }
      if (d.fix !== undefined) {
        const j = this.wreck.dents.indexOf(d.fix);
        if (j < 0) return auth ? false : true;
        this.wreck.dents.splice(j, 1);
        const m = this.plane.dents[d.fix];
        this.repairFx(m ? m.getWorldPosition(new THREE.Vector3()) : null);
        if (me) this.ui.hpGain?.(HP.dent, this.planeHp());
        this.checkWreckDone(auth);
      }
      this.refreshDamage();
      this.refreshWelds();
      this.afterChange(false);
      return true;
    }
    if (type === 'place') {
      if (this.wreck.placed[d.k] !== undefined || this.installed.has(d.k)) return auth ? false : true;
      const it = this.items[d.k];
      it.state = 'placed'; it.carrier = null; it.mesh.visible = false;
      if (this.carrying === it) this.carrying = null;
      this.plane.parts[d.k].visible = true;
      this.plane.ghosts[d.k].visible = false;
      this.wreck.placed[d.k] = 0;
      this.audio.clank();
      if (me) this.ui.toast(`${ITEMS[d.k].name} en place`, 'Soudez les points orange.', 'good', 2500);
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
        let p = null;
        if (d.k[0] === 'h') { const i = +d.k[1]; this.wreck.holes[i] = 3; this.plane.setHole(i, 3); p = this.plane.body.localToWorld(HOLES[i].p.clone()); if (me) this.ui.hpGain?.(HP.hole, this.planeHp()); }
        else {
          this.installed.add(d.k);
          this.items[d.k].state = 'installed';
          p = this.plane.body.localToWorld(SLOTS[d.k].clone());
          if (me) this.ui.hpGain?.(HP.part, this.planeHp());
          this.ui.toast(`${ITEMS[d.k].name} ressoudé`, '', 'good', 1800);
        }
        this.repairFx(p);
        this.checkWreckDone(auth);
      }
      this.refreshWelds();
      this.refreshDamage();
      this.afterChange(false);
      return true;
    }
    if (type === 'winch') return this.applyWinch(d, by);
    if (type === 'fixAll') {
      // admin : avion remis à neuf (pièces ressoudées, trous colmatés, bosses effacées)
      for (const k of PART_ORDER) {
        if (this.installed.has(k)) continue;
        const it = this.items[k];
        if (this.carrying === it) this.carrying = null;
        it.state = 'installed'; it.carrier = null; it.mesh.visible = false;
        this.installed.add(k);
        this.plane.parts[k].visible = true;
        if (this.plane.ghosts[k]) this.plane.ghosts[k].visible = false;
      }
      for (const id of PLATES) { const it = this.items[id]; if (it && it.state !== 'hidden') { if (this.carrying === it) this.carrying = null; it.state = 'hidden'; it.carrier = null; it.mesh.visible = false; } }
      this.wreck.placed = {};
      this.wreck.holes = [0, 0, 0, 0];
      HOLES.forEach((_, i) => this.plane.setHole(i, 0));
      this.wreck.dents = [];
      this.refreshWelds();
      this.refreshDamage();
      this.repairFx(this.plane.root.position.clone().add(new THREE.Vector3(0, 3, 0)));
      if (auth && this.wreckActive()) {
        const p = this.wreck.pos || { x: this.plane.root.position.x, z: this.plane.root.position.z, yaw: this.flight.yaw };
        const w = heightAt(p.x, p.z) < -0.8 || this.flags.wheels ? p : this.nearestWater(p.x, p.z);
        this.act('winch', { stow: 1 });
        this.act('refloat', { x: +w.x.toFixed(2), z: +w.z.toFixed(2), yaw: p.yaw });
      }
      this.afterChange();
      return true;
    }
    if (type === 'wreckPos') { if (!me) this.setWreckPose(d.x, d.z, d.yaw); this.wreck.stranded = !!d.st; return true; }
    if (type === 'refloat') {
      this.flags.wrecked = false;
      this.wreck.stranded = false;
      this.smoke.remove('wreck');
      this.planeLive = true; this.planeLift = 1;
      this.flight.wheels = !!this.flags.wheels;
      this.flight.reset(d.x, d.z, d.yaw);
      const ground = this.flight.surface === 'ground';
      this.ui.toast(ground ? 'Sur ses roues !' : 'Le Coucou flotte !', 'Prêt à repartir.', 'good', 3500);
      if (!ground) this.audio.splash(); else this.audio.clank();
      this.refreshDamage();
      this.afterChange();
      return true;
    }
    return null;
  },
  // l'épave est réparée quand toutes les pièces sont là et les trous colmatés (les bosses peuvent attendre)
  checkWreckDone(auth) {
    if (!auth || !this.flags.wrecked) return;
    const all = PART_ORDER.every((k) => this.installed.has(k)) && this.wreck.holes.every((h) => h === 0 || h === 3);
    if (!all) return;
    const p = this.wreck.pos || { x: this.plane.root.position.x, z: this.plane.root.position.z, yaw: this.flight.yaw };
    // sur l'eau, ou à terre avec les roues amphibies : il repart tout de suite
    if (heightAt(p.x, p.z) < -0.8 || this.flags.wheels) this.act('refloat', p);
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
      this.ui.toast('Réparé, mais à sec', 'Treuil du nez vers l\'eau (bouées près des ports) · ou montez les roues amphibies.', 'good', 5000);
      this.radioOnce(`stranded${this.stats.days}`, 'Il est entier ! Mais sans roues, il ne décollera pas des cailloux. Le treuil du nez : accrochez le câble à un arbre ou un rocher côté mer, et laissez-le tirer.');
    }
  },

  // objectifs affichés tant que l'épave n'est pas repartie
  wreckObjectives() {
    const hp = Math.round(this.planeHp());
    if (!this.wreckActive()) {
      if (this.wreck.dents.length && this.planeLive) return [{ id: 'hull', optional: true, text: `Bonus · ressouder la coque (${hp} %)`, hint: 'Fer à souder, flanc droit', done: false }];
      return [];
    }
    if (!this.flags.wrecked) return [{ id: 'wreck', text: 'Remorquer l\'avion jusqu\'à l\'eau', hint: 'Treuil du nez vers une bouée, un arbre ou un rocher côté mer · ou roues amphibies', done: false }];
    const missing = PART_ORDER.filter((k) => !this.installed.has(k));
    const list = [{ id: 'wreck', text: `Réparer le Coucou (coque ${hp} %)`, hint: 'Fer à souder : flanc droit de l\'avion', done: false }];
    list.push({ sub: true, text: 'Décrocher le fer à souder', hint: 'Poste à souder, flanc droit', done: !!this.iron });
    for (const k of missing) list.push({ sub: true, text: `Ressouder : ${ITEMS[k].name.toLowerCase()}`, hint: this.wreck.placed[k] !== undefined ? 'Soudez les points orange' : 'Éjectée autour de l\'épave', done: false });
    const open = this.wreck.holes.filter((h) => h === 1 || h === 2).length, total = this.wreck.holes.filter((h) => h).length;
    if (total) list.push({ sub: true, text: `Colmater la coque (${total - open}/${total})`, hint: 'Tôles autour de l\'épave', done: open === 0 });
    if (this.wreck.dents.length) list.push({ sub: true, text: `Bosses à ressouder : ${this.wreck.dents.length}`, hint: 'Facultatif pour repartir', done: false });
    return list;
  },
  wreckObjectivePoint() {
    const missing = PART_ORDER.filter((k) => !this.installed.has(k) && this.wreck.placed[k] === undefined && this.items[k].state === 'ground');
    if (missing.length) return this.items[missing[0]].pos;
    const plate = PLATES.find((id) => this.items[id]?.state === 'ground');
    if (plate && this.wreck.holes.includes(1)) return this.items[plate].pos;
    return this.plane.root.position;
  },

  // ── treuil à crochet : on accroche le câble à un arbre, un rocher ou un poteau, puis on actionne le treuil ──
  winchBox() { return this.plane.root.localToWorld(new THREE.Vector3(0, 1.7, -6.3)); },
  winchSpecs(add) {
    const W = this.winch;
    const box = this.winchBox();
    const me = this.myId();
    if (!W.hook) add(box, 3.2, { prio: 3, prompt: '<kbd>E</kbd> Crochet du treuil', press: () => { this.act('winch', { hook: me }); this.audio.clank(); } });
    else if (W.hook === me) {
      // points d'ancrage possibles : troncs, rochers, poteaux… devant soi
      const p = this.playerWorld();
      let best = null, bd = 3.2;
      for (const c of this.colliders) {
        if (c.disabled || c.plane) continue;
        const cx = c.type === 'circle' ? c.x : (c.minX + c.maxX) / 2, cz = c.type === 'circle' ? c.z : (c.minZ + c.maxZ) / 2;
        const d = Math.hypot(cx - p.x, cz - p.z);
        if (d < bd && (c.type === 'circle' || (c.maxX - c.minX < 3 && c.maxZ - c.minZ < 3))) { bd = d; best = { x: cx, z: cz }; }
      }
      const nStakes = this.invCount('stake');
      const stakes = nStakes > 0 && this.stakeSpot();
      if (best) {
        const pt = new THREE.Vector3(best.x, Math.max(heightAt(best.x, best.z), 0) + 0.8, best.z);
        add(pt, 3.4, { prio: 4, prompt: `<kbd>E</kbd> Accrocher${stakes ? ` · <kbd>R</kbd> pieu (${nStakes})` : ''}`, alt: stakes ? () => this.plantStake() : undefined, press: () => { this.act('winch', { hook: 'anchor', anchor: [pt.x, pt.y, pt.z] }); this.audio.clank(); this.ui.toast('Crochet accroché', 'Lancez le treuil.', 'good', 1800); } });
      }
      if (stakes) add(stakes.clone().setY(stakes.y + 0.5), 3.0, { prio: 3.5, prompt: `<kbd>E</kbd> Planter un pieu (${nStakes})`, press: () => this.plantStake(), alt: () => this.plantStake() });
      else if (!best) add(p.clone().add(new THREE.Vector3(0, 1, 0)), 1, { prio: -2, prompt: 'Rien où accrocher · <kbd>G</kbd> ranger' });
    } else if (W.hook === 'anchor') {
      add(box, 3.2, { prio: 3, prompt: W.on ? '<kbd>E</kbd> Arrêter le treuil' : '<kbd>E</kbd> Treuil', press: () => { this.act('winch', { on: !W.on }); this.audio.powerUp(); } });
      // bouton au bout du câble : on commande le treuil depuis le crochet
      const a = new THREE.Vector3(...W.anchor);
      add(a, 2.8, { prio: 4, prompt: `<kbd>E</kbd> ${W.on ? 'Arrêter' : 'Tirer'} · <kbd>R</kbd> décrocher`, press: () => { this.act('winch', { on: !W.on }); this.audio.beep(); this.audio.powerUp(); }, alt: () => this.act('winch', { hook: me, on: false }) });
    }
  },
  applyWinch(d, by) {
    const W = this.winch;
    if (d.hook !== undefined) { W.hook = d.hook; W.anchor = d.anchor || null; W.stake = d.stake ? 1 : 0; if (d.hook !== 'anchor') W.on = false; }
    if (d.on !== undefined) W.on = !!d.on && W.hook === 'anchor';
    if (d.stow) { W.hook = null; W.anchor = null; W.on = false; }
    if (!W.on) { this._snap = null; this._strain = 0; }
    void by;
    return true;
  },
  // câble dessiné comme un vrai tube, et moteur du treuil (simulé par l'hôte)
  updateWinch(dt) {
    const W = this.winch;
    // réparé mais à sec : avec les roues amphibies, plus besoin de rejoindre l'eau, il repart du sol
    if (this.wreck.stranded && !this.flags.wrecked && this.flags.wheels && this.isAuthority() && !this._unstrand) {
      const p = this.wreck.pos || { x: this.plane.root.position.x, z: this.plane.root.position.z, yaw: this.flight.yaw };
      this._unstrand = true;
      this.act('winch', { stow: 1 });
      this.act('refloat', { x: p.x, z: p.z, yaw: p.yaw });
    }
    if (!this.wreck.stranded) this._unstrand = false;
    if (!this.wreckActive() && !this.canPushPlane() && W.hook) { W.hook = null; W.on = false; W.anchor = null; }
    this.updateStakeMesh();
    let end = null;
    if (W.hook === 'anchor' && W.anchor) end = new THREE.Vector3(...W.anchor);
    else if (W.hook === this.myId()) {
      const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw);
      end = this.camera.position.clone().addScaledVector(fw, 0.6).add(new THREE.Vector3(0, -0.45, 0));
      if (this.inGame() && Math.hypot(end.x - this.winchBox().x, end.z - this.winchBox().z) > 42) { this.act('winch', { stow: 1 }); this.ui.toast('Câble trop court', '42 m maximum.', 'bad', 1600); }
      if (this.input.hit('KeyG')) this.act('winch', { stow: 1 });
    } else if (W.hook) { const m = this.mateList().find((q) => q.id === W.hook); if (m) end = m.pos.clone().add(new THREE.Vector3(0, 1.0, 0)); }
    if (!end) { if (this.winchMesh) this.winchMesh.visible = false; return; }
    const start = this.winchBox();
    const dist = start.distanceTo(end);
    const sag = W.on ? 0.05 : Math.max(0.3, (42 - dist) * 0.06);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; const p = start.clone().lerp(end, t); p.y -= Math.sin(Math.PI * t) * sag; p.y = Math.max(p.y, this.groundAt(p.x, p.z, p.y + 2) + 0.05); pts.push(p); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.035, 5, false);
    if (!this.winchMesh) { this.winchMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#c9ccd2' })); this.scene.add(this.winchMesh); }
    else { this.winchMesh.geometry.dispose(); this.winchMesh.geometry = geo; }
    this.winchMesh.visible = true;
    // avion en état de marche mais coincé : le treuil le tire aussi (simulé par son propriétaire)
    if (W.on && W.hook === 'anchor' && !this.wreckActive() && this.ownsPlane()) {
      const c = this.plane.root.position;
      const dir = new THREE.Vector2(end.x - c.x, end.z - c.z);
      const left = dir.length();
      if (left < 9) { this._snap = null; this._strain = 0; this.act('winch', { on: false }); this.ui.toast('Treuil arrêté', 'Arrivé.', '', 1600); return; }
      dir.normalize();
      let dy = Math.atan2(-dir.x, -dir.y) - this.flight.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (this.stepSnap(dt, (sx, sz, syaw) => this.nudgePlane(sx, sz, syaw, true))) return;
      if (!this.nudgePlane(dir.x * 1.3 * dt, dir.y * 1.3 * dt, dy * Math.min(1, dt * 0.7))) {
        const f = this.flight;
        this.winchStrain(dt, dir, dy, left, (d) => {
          const p = new THREE.Vector3(f.pos.x + dir.x * d, f.pos.y, f.pos.z + dir.y * d);
          return !this.planeHitTest(p, f.yaw + dy * 0.5);
        });
        return;
      }
      this._strain = Math.max(0, (this._strain || 0) - dt * 2);
      this._pullRatchet = (this._pullRatchet || 0) - dt;
      if (this._pullRatchet <= 0) { this._pullRatchet = 0.35; this.audio.ratchet(); }
      return;
    }
    if (W.on && W.hook === 'anchor' && this.isAuthority()) {
      const c = this.plane.root.position;
      const dir = new THREE.Vector2(end.x - c.x, end.z - c.z);
      const left = dir.length();
      if (left < 9) { this._snap = null; this._strain = 0; this.act('winch', { on: false }); this.ui.toast('Treuil arrêté', 'Raccrochez plus loin.', '', 1600); return; }
      dir.normalize();
      const yawT = Math.atan2(-dir.x, -dir.y);   // nez vers l'ancrage
      let dy = yawT - this.flight.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const moveWreck = (mx, mz, myaw, last) => {
        const nx = c.x + mx, nz = c.z + mz, ny = this.flight.yaw + myaw;
        this.setWreckPose(nx, nz, ny);
        this._pullSend = (this._pullSend || 0) + 1;
        if (this._pullSend > 3 || last) { this._pullSend = 0; this.act('wreckPos', { x: nx, z: nz, yaw: ny, st: this.wreck.stranded ? 1 : 0 }); }
        if (this.wreck.stranded && heightAt(nx, nz) < -0.8) { this._snap = null; this.act('winch', { stow: 1 }); this.act('refloat', { x: nx, z: nz, yaw: ny }); }
        return true;
      };
      if (this.stepSnap(dt, moveWreck)) return;
      const sp = 1.3 * dt;
      const ny = this.flight.yaw + dy * Math.min(1, dt * 0.7);
      const nx = c.x + dir.x * sp, nz = c.z + dir.y * sp;
      if (this.wreckBlocked(nx, nz, ny)) {
        const pen = this.wreckPenetration(c.x, c.z, this.flight.yaw);
        this.winchStrain(dt, dir, dy, left, (d) => this.wreckPenetration(c.x + dir.x * d, c.z + dir.y * d, this.flight.yaw + dy * 0.5) <= pen + 0.02);
        return;
      }
      this._strain = Math.max(0, (this._strain || 0) - dt * 2);
      this.setWreckPose(nx, nz, ny);
      this._pullRatchet = (this._pullRatchet || 0) - dt;
      if (this._pullRatchet <= 0) { this._pullRatchet = 0.35; this.audio.ratchet(); }
      this._pullSend = (this._pullSend || 0) + dt;
      if (this._pullSend > 0.25) { this._pullSend = 0; this.act('wreckPos', { x: nx, z: nz, yaw: ny, st: this.wreck.stranded ? 1 : 0 }); }
      if (this.wreck.stranded && heightAt(nx, nz) < -0.8) { this.act('winch', { stow: 1 }); this.act('refloat', { x: nx, z: nz, yaw: ny }); }
    }
  },
  // avion bloqué : le câble se tend, grince… puis arrache l'avion d'un bond (ok(d) : distance libre de l'autre côté)
  winchStrain(dt, dir, dy, left, ok) {
    const was = this._strain || 0;
    this._strain = was + dt;
    if (was === 0) { this.ui.toast('Le câble se tend…', 'Le treuil force.', 'bad', 1600); }
    this._creak = (this._creak || 0) - dt;
    if (this._creak <= 0) { this._creak = Math.max(0.12, 0.5 - this._strain * 0.2); this.audio.ratchet(); if (this._strain > STRAIN_T * 0.5) this.audio.clank(); }
    const near = this.plane.root.position.distanceTo(this.playerWorld()) < 25;
    if (near) this.player.shake = Math.max(this.player.shake, 0.15 + 0.25 * this._strain / STRAIN_T);
    if (this._strain < STRAIN_T) return;
    this._strain = 0;
    const max = Math.max(0.5, left - 9);
    let dist = SNAP_TRIES.find((d) => d <= max && ok(d));
    if (dist === undefined) dist = Math.min(SNAP_TRIES[0], max);
    this._snap = { t: 0, k: 0, dx: dir.x * dist, dz: dir.y * dist, dyaw: dy * 0.5 };
    this.audio.clank(); this.audio.whoosh?.(); this.audio.splash?.();
    if (near) this.player.shake = 1;
    this.ui.toast('Ça lâche !', '', 'good', 1200);
  },
  // bond de l'avion après la tension du câble (sortie rapide, puis amorti)
  stepSnap(dt, move) {
    const S = this._snap;
    if (!S) return false;
    S.t += dt;
    const u = Math.min(1, S.t / SNAP_DUR);
    const k = 1 - Math.pow(1 - u, 3);
    const dk = k - S.k;
    S.k = k;
    move(S.dx * dk, S.dz * dk, S.dyaw * dk, u >= 1);
    if (u >= 1) this._snap = null;
    return true;
  },

  // orbes de réparation : petites boules lumineuses qui flottent devant chaque endroit à réparer (visibles de loin)
  updateRepairBeacons() {
    if (!this.beacons) {
      this.beacons = new THREE.Group();
      this.scene.add(this.beacons);
      this.beaconCore = new THREE.SphereGeometry(0.09, 10, 8);
      this.beaconCoreMat = new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false });
      this.beaconHaloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    }
    const want = [];
    const me = this.playerWorld();
    const out = (p, n) => p.clone().addScaledVector(n, 0.45);
    if (this.flags.wrecked) {
      this.wreck.holes.forEach((h, i) => { if (h === 1) want.push(this.plane.body.localToWorld(out(HOLES[i].p, HOLES[i].n))); });
      for (const k of PART_ORDER) if (!this.installed.has(k) && this.wreck.placed[k] === undefined) want.push(this.plane.body.localToWorld(SLOTS[k].clone().add(new THREE.Vector3(0, 0.6, 0))));
    }
    // bosses : seulement quand on tient le fer (sinon, trop de repères)
    if (this.holdingIron()) for (const i of this.wreck.dents) { const m = this.plane.dents[i]; if (m?.visible) { const D = DENTS[i]; want.push(this.plane.body.localToWorld(out(new THREE.Vector3(...D.p), new THREE.Vector3(...D.n).normalize()))); } }
    while (this.beacons.children.length < want.length) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.beaconCore, this.beaconCoreMat));
      const s = new THREE.Sprite(this.beaconHaloMat); g.add(s); g.userData.halo = s;
      this.beacons.add(g);
    }
    this.beacons.children.forEach((g, i) => {
      g.visible = i < want.length;
      if (!g.visible) return;
      g.position.copy(want[i]).add(new THREE.Vector3(0, Math.sin(this.t * 2.2 + i) * 0.08, 0));
      // taille constante à l'écran au loin, discrète de près
      const d = g.position.distanceTo(me);
      g.userData.halo.scale.setScalar(Math.min(2.2, 0.5 + d * 0.035) * (1 + Math.sin(this.t * 4 + i) * 0.12));
    });
    // pièces manquantes : silhouette fantôme sur l'avion en permanence pendant la réparation
    if (this.flags.wrecked) for (const k of PART_ORDER) if (this.plane.ghosts[k]) this.plane.ghosts[k].visible = !this.installed.has(k) && this.wreck.placed[k] === undefined;
  },

  // collisions de la carcasse (troncs, rochers, bâtiments) : on autorise à sortir d'un obstacle, pas à s'y enfoncer
  wreckPenetration(x, z, yaw) {
    let pen = 0;
    const s = Math.sin(yaw), co = Math.cos(yaw);
    for (const lz of [-5, -2.5, 0, 2.5, 5, 7.5]) {
      const px = x + s * lz, pz = z + co * lz;
      for (const c of this.colliders) {
        if (c.disabled || c.mooring) continue;
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
      if (c.disabled || c.plane || c.mooring) continue;   // les bouées d'amarrage ne gênent pas l'avion
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

export { weldPoints, PLATES };
