// Butin. Deux familles :
// 1. Armes et fournitures placées là où elles ont du sens (machette de Jo, fusil du gardien, pistolet du coffre…) :
//    chaque joueur prend son exemplaire une fois ; caisses de munitions et trousses de secours reviennent chaque matin.
// 2. Conteneurs à fouiller (valises, casiers, caisses) : contenu tiré au sort avec la graine de la partie, PARTAGÉ
//    par l'équipage. C'est là qu'on trouve vêtements et sacs (plus ou moins rares) qui donnent des poches.
import * as THREE from 'three';
import { prep, flatMat, textTexture, heightAt, LAYOUT } from './terrain.js';
import { GUNS, AMMO_NAMES } from './arsenal.js';
import { GEAR } from './gear.js';
import { FLAT } from './island2.js';
import { FLAT3, I3 } from './island3.js';
import { P2 } from './puzzles3d.js';

function box(w, h, d, col, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); m.position.set(x, y, z); m.castShadow = true; return m; }
function label(t, bg, fg, w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTexture([t], bg, fg, 256, 90) })); }

function model(kind) {
  const g = new THREE.Group();
  if (kind === 'machete') { g.add(box(0.5, 0.35, 0.5, '#6d4b37', 0, 0.17, 0)); const b = box(0.02, 0.1, 0.62, '#c9ccd2', 0, 0.55, 0); b.rotation.x = 1.2; g.add(b); g.add(box(0.05, 0.05, 0.16, '#3a2a1e', 0, 0.78, 0.26)); }
  else if (kind === 'shotgun' || kind === 'rifle') { g.add(box(0.1, 0.06, 1.0, kind === 'rifle' ? '#3a4a3a' : '#2b2f36', 0, 0, 0)); g.add(box(0.1, 0.12, 0.35, kind === 'rifle' ? '#3a4a3a' : '#7a5536', 0, -0.03, 0.45)); g.add(box(0.5, 0.06, 0.06, '#6d4b37', 0, 0.12, -0.2)); g.add(box(0.5, 0.06, 0.06, '#6d4b37', 0, 0.12, 0.3)); g.rotation.set(0, Math.PI / 2, 0.15); }
  else if (kind === 'pistol') { g.add(box(0.6, 1.4, 0.4, '#5d6470', 0, 0.7, 0)); g.add(box(0.56, 1.3, 0.04, '#3d434d', 0, 0.72, -0.21)); g.add(box(0.06, 0.1, 0.24, '#2b2f36', 0, 1.0, -0.26)); g.add(box(0.05, 0.14, 0.06, '#2b2f36', 0, 0.92, -0.2)); const l = label('ARMURERIE', '#10162b', '#ffd166', 0.5, 0.14); l.position.set(0, 1.3, -0.235); l.rotation.y = Math.PI; g.add(l); }
  else if (kind === 'handgun') { g.add(box(0.05, 0.05, 0.2, '#2b2f36', 0, 0.03, 0)); g.add(box(0.05, 0.12, 0.05, '#3d434d', 0, 0.03, 0.08)); g.children[1].rotation.x = 1.3; g.rotation.y = 0.5; }
  else if (kind === 'bat') { const b = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.06, 0.03, 0.85, 7), '#b98b5e'), flatMat); b.rotation.z = 1.2; b.position.y = 0.2; g.add(b); for (let i = 0; i < 4; i++) g.add(box(0.012, 0.1, 0.012, '#8d9299', 0.2 + i * 0.05, 0.3, 0)); }
  else if (kind === 'axe') { g.add(box(0.9, 1.5, 0.12, '#f4efe4', 0, 1.25, 0.02)); g.add(box(0.8, 1.4, 0.04, '#c9352b', 0, 1.25, -0.06)); g.add(box(0.07, 1.1, 0.07, '#b98b5e', 0, 1.2, -0.12)); g.add(box(0.42, 0.3, 0.06, '#d8dde3', 0.12, 1.65, -0.13)); const l = label('HACHE D\'INCENDIE', '#c9352b', '#fff4e0', 0.8, 0.18); l.position.set(0, 2.1, -0.02); l.rotation.y = Math.PI; g.add(l); }
  else if (kind === 'ammo') { g.add(box(0.6, 0.35, 0.4, '#4a5a3a', 0, 0.17, 0)); g.add(box(0.62, 0.06, 0.42, '#3a4a2a', 0, 0.36, 0)); const l = label('MUNITIONS', '#4a5a3a', '#ffd166', 0.5, 0.12); l.position.set(0, 0.2, -0.205); l.rotation.y = Math.PI; g.add(l); }
  else if (kind === 'medkit') { g.add(box(0.45, 0.3, 0.2, '#f4f1ea', 0, 0.15, 0)); g.add(box(0.2, 0.06, 0.21, '#d8322a', 0, 0.16, 0)); g.add(box(0.06, 0.2, 0.21, '#d8322a', 0, 0.16, 0)); }
  // conteneurs à fouiller
  else if (kind === 'case') { const c = ['#c84a3a', '#2f6a8a', '#3a3f48', '#d8a53a'][Math.floor(Math.random() * 4)]; g.add(box(0.75, 0.5, 0.26, c, 0, 0.25, 0)); g.add(box(0.77, 0.04, 0.28, '#1d2233', 0, 0.3, 0)); g.add(box(0.2, 0.05, 0.05, '#1d2233', 0, 0.53, 0)); g.rotation.z = 0; g.children.forEach((m) => { m.position.y -= 0.12; }); g.rotation.x = -Math.PI / 2 * 0.98; g.position.y = 0.13; }
  else if (kind === 'locker') { g.add(box(0.62, 1.85, 0.5, '#6d7a86', 0, 0.925, 0)); g.add(box(0.02, 1.7, 0.02, '#3a424a', 0, 0.95, -0.26)); for (const y of [1.55, 1.45]) g.add(box(0.4, 0.03, 0.02, '#3a424a', 0, y, -0.26)); g.add(box(0.04, 0.12, 0.04, '#ffd166', 0.2, 1.0, -0.27)); }
  else if (kind === 'crate') { g.add(box(0.9, 0.6, 0.7, '#9a6b45', 0, 0.3, 0)); for (const x of [-0.42, 0.42]) g.add(box(0.06, 0.62, 0.72, '#6d4b37', x, 0.3, 0)); g.add(box(0.92, 0.06, 0.72, '#6d4b37', 0, 0.3, 0)); }
  else if (kind === 'military') { g.add(box(1.0, 0.5, 0.55, '#4a5a32', 0, 0.25, 0)); g.add(box(1.02, 0.06, 0.57, '#3a4a26', 0, 0.5, 0)); for (const x of [-0.45, 0.45]) g.add(box(0.08, 0.12, 0.2, '#2a2f22', x, 0.4, -0.3)); const l = label('POLICE', '#4a5a32', '#fff4e0', 0.45, 0.13); l.position.set(0, 0.28, -0.28); l.rotation.y = Math.PI; g.add(l); }
  else if (kind === 'bag') { const b = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 8).rotateZ(Math.PI / 2), '#8a5a3a'), flatMat); b.position.y = 0.28; b.castShadow = true; g.add(b); g.add(box(0.5, 0.05, 0.08, '#3a2a1e', 0, 0.55, 0)); }
  g.traverse((o) => { if (o.isMesh) o.userData.dynamic = true; });
  return g;
}
const CONT_NAMES = { case: 'Valise', locker: 'Casier', crate: 'Caisse', military: 'Caisse de la police', bag: 'Sac' };

export const LootMixin = {
  // à appeler après la construction des îles 2 et 3
  buildLoot() {
    (this.loot || []).forEach((l) => l.parent.remove(l.mesh));
    (this.lootCols || []).forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); });
    this.loot = [];
    this.lootCols = [];
    this.lootDefs = {};
    const I2g = this.island2, I3g = this.island3;
    const add = (id, kind, x, y, z, ry, give, parent = this.scene) => {
      const mesh = model(kind); mesh.position.set(x, y + (mesh.position.y || 0), z); mesh.rotation.y += ry; parent.add(mesh);
      this.loot.push({ id, kind, mesh, parent, give, pos: new THREE.Vector3(x, y + 0.5, z) });
    };
    // conteneur à fouiller : table de butin, tirages, objets garantis, taille de la grille
    const box3 = (id, kind, x, y, z, ry, opts) => {
      add(id, kind, x, y, z, ry, { cont: true, needs: opts.needs });
      this.lootDefs[id] = { name: opts.name || CONT_NAMES[kind], table: opts.table, rolls: opts.rolls || [1, 2], guaranteed: opts.guaranteed || [], grid: opts.grid || [4, 3], daily: !!opts.daily };
      if (kind === 'locker' || kind === 'crate' || kind === 'military') { const c = { type: 'circle', x, z, r: kind === 'locker' ? 0.35 : 0.45 }; this.colliders.push(c); this.lootCols.push(c); }
    };
    const cb = LAYOUT.cabane, cp = LAYOUT.camp, lh = LAYOUT.lighthouse, bc = LAYOUT.beach, ru = LAYOUT.ruins;
    const h1 = (x, z) => heightAt(x, z);
    // ── île 1 ──
    add('machete', 'machete', cp.x - 2.5, h1(cp.x - 2.5, cp.z - 1.5), cp.z - 1.5, 0.4, { weapon: 'machete' });
    add('shotgun', 'shotgun', cb.x + 2.35, h1(cb.x, cb.z) + 1.35, cb.z + 0.4, -Math.PI / 2, { weapon: 'shotgun', ammo: 12, needs: 'doorOpen' });
    add('med1', 'medkit', cb.x - 1.6, h1(cb.x, cb.z) + 0.75, cb.z - 1.6, 0, { bandage: 2 });
    box3('jo_bag', 'bag', cp.x + 1.4, h1(cp.x + 1.4, cp.z + 2.6), cp.z + 2.6, 0.5, { name: 'Sac de Jo', table: 'crate', rolls: [1, 2], guaranteed: ['c_satchel'], grid: [5, 3] });
    box3('keeper', 'locker', cb.x - 1.9, h1(cb.x, cb.z) + 0.02, cb.z + 1.5, Math.PI / 2, { name: 'Armoire du gardien', table: 'locker', rolls: [2, 3], guaranteed: ['c_raincoat'], grid: [4, 4], needs: 'doorOpen' });
    { const x = bc.x + 9, z = bc.z - 3; box3('beach_case', 'case', x, h1(x, z), z, 0.8, { name: 'Valise échouée', table: 'suitcase', rolls: [2, 3], grid: [4, 3] }); }
    { const x = ru.x + 2.2, z = ru.z + 1.4; box3('ruins', 'crate', x, h1(x, z), z, 0.3, { name: 'Caisse des ruines', table: 'crate', rolls: [2, 3], grid: [4, 3] }); }
    { const x = lh.x + 3.2, z = lh.z + 2.4; box3('lighthouse', 'crate', x, h1(x, z), z, -0.4, { name: 'Coffre du phare', table: 'locker', rolls: [2, 2], grid: [4, 3] }); }
    // ── île 2 (coordonnées locales) ──
    const w2 = (x, y, z) => new THREE.Vector3(I2g.cx + x, y, I2g.cz + z);
    const R = P2.room;
    // pistolet de service rangé dans le coffre du poste (qui s'ouvre avec le laser, comme le fusible bleu)
    { const p = w2(R.x - R.w / 2 + 11.65, FLAT + 0.8, R.z - R.d / 2 + 2.95); add('pistol', 'handgun', p.x, p.y, p.z, 0, { weapon: 'pistol', ammo: 24, needs: () => this.puzzles.laser, locked: 'Le coffre est verrouillé (laser)' }); }
    { const p = w2(I2.bar.x + 1.2, 0, I2.bar.z + 0.4); add('bat', 'bat', p.x, heightAt(p.x, p.z) + 1.05, p.z, 0, { weapon: 'bat' }); }
    { const p = w2(R.x + 3, FLAT + 0.1, R.z + R.d / 2 - 1.2); add('ammo2', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
    { const p = w2(I2.terminal.x + 14, FLAT, I2.terminal.z + 4.6); add('ammo2b', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
    { const p = w2(I2.terminal.x - 6, FLAT, I2.terminal.z + 5); add('med2', 'medkit', p.x, p.y + 0.02, p.z, 0, { bandage: 2 }); }
    { const p = w2(I2.terminal.x + 12, FLAT, I2.terminal.z - 2); box3('i2_lost', 'locker', p.x, p.y, p.z, 0, { name: 'Objets trouvés', table: 'suitcase', rolls: [1, 2], guaranteed: ['c_backpack'], grid: [5, 4] }); }
    { const p = w2(-3, FLAT, 24.5); box3('i2_case1', 'case', p.x, p.y, p.z, 0.3, { name: 'Valise', table: 'suitcase', rolls: [2, 3] }); }
    { const p = w2(11, FLAT, 25.2); box3('i2_case2', 'case', p.x, p.y, p.z, -0.5, { name: 'Valise', table: 'suitcase', rolls: [1, 3] }); }
    { const p = w2(I2.tower.x + 3.4, FLAT, I2.tower.z - 4.6); box3('i2_tower', 'locker', p.x, p.y, p.z, 0, { name: 'Vestiaire des contrôleurs', table: 'cockpit', rolls: [1, 2], guaranteed: ['parachute'], grid: [4, 4] }); }
    { const H = I2.hangar, p = w2(H.x + 8, FLAT, H.z + 7); box3('i2_hangar', 'crate', p.x, p.y, p.z, 0.2, { name: 'Caisse à outils', table: 'crate', rolls: [2, 3], guaranteed: ['stake'], grid: [4, 3], needs: 'hangarOpen' }); }
    { const p = w2(R.x - R.w / 2 + 11.3, FLAT, R.z - R.d / 2 + 9.3); box3('i2_security', 'locker', p.x, p.y, p.z, Math.PI, { name: 'Vestiaire de la sécurité', table: 'locker', rolls: [1, 2], guaranteed: [['c_armorvest', 'c_cargo']], grid: [4, 4] }); }
    { const A = I2.airliner, x = I2g.cx + A.x - 7, z = I2g.cz + A.z + 4; box3('i2_wreck', 'case', x, heightAt(x, z), z, 1.1, { name: 'Soute de l\'épave', table: 'suitcase', rolls: [3, 4], guaranteed: [['c_pilot', 'c_hiking']], grid: [6, 4] }); }
    // ── île 3 ──
    const w3 = (x, y, z) => new THREE.Vector3(I3g.cx + x, y, I3g.cz + z);
    const F = I3.fire, T = I3.terminal, D = I3.depot;
    { const p = w3(F.x - F.w / 2 + 6, FLAT3, F.z + F.d / 2 - 0.35); add('axe', 'axe', p.x, p.y, p.z, 0, { weapon: 'axe' }); }
    { const p = w3(F.x - F.w / 2 + 8, FLAT3, F.z + F.d / 2 - 0.6); add('med3', 'medkit', p.x, p.y + 0.02, p.z, 0, { bandage: 3 }); }
    { const p = w3(T.x - T.w / 2 + 4, FLAT3 + 0.1, T.z + 6); add('rifle', 'pistol', p.x, p.y, p.z, Math.PI / 2, { weapon: 'rifle', ammo: 48 }); }
    { const p = w3(T.x - T.w / 2 + 6, FLAT3, T.z + 7); add('ammo3', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
    { const p = w3(F.x + 4, FLAT3, F.z + 5); add('ammo3b', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
    { const p = w3(F.x - F.w / 2 + 11, FLAT3, F.z + F.d / 2 - 0.6); box3('i3_fire', 'locker', p.x, p.y, p.z, Math.PI, { name: 'Casiers des pompiers', table: 'locker', rolls: [1, 2], guaranteed: ['c_firehat'], grid: [4, 4] }); }
    { const p = w3(T.x - T.w / 2 + 5.5, FLAT3, T.z + 3); box3('i3_police', 'military', p.x, p.y, p.z, Math.PI / 2, { name: 'Caisse de la police', table: 'military', rolls: [2, 3], guaranteed: [['c_tacvest', 'c_milpack']], grid: [6, 4] }); }
    { const p = w3(T.x + 12, FLAT3, T.z - 5); box3('i3_case1', 'case', p.x, p.y, p.z, 0.4, { name: 'Valise', table: 'suitcase', rolls: [2, 3] }); }
    { const p = w3(T.x + 21, FLAT3, T.z - 3); box3('i3_case2', 'case', p.x, p.y, p.z, -0.3, { name: 'Valise', table: 'suitcase', rolls: [2, 3] }); }
    { const p = w3(D.x + 6, FLAT3, D.z + 4); box3('i3_depot', 'crate', p.x, p.y, p.z, 0.1, { name: 'Caisse de fret', table: 'crate', rolls: [2, 3] }); }
    { const p = w3(30, FLAT3, 139); box3('i3_crew', 'case', p.x, p.y, p.z, 0.9, { name: 'Bagage de l\'équipage', table: 'cockpit', rolls: [2, 3], guaranteed: ['parachute'] }); }
    // ── île 4 (Hélios) ──
    const I4g = this.island4;
    if (I4g) {
      const w4 = (x, z) => new THREE.Vector3(I4g.cx + x, FLAT4, I4g.cz + z);
      const T4 = I4.terminal, F4 = I4.fret;
      { const p = w4(T4.x - 16, T4.z + 4); add('med4', 'medkit', p.x, p.y + 0.02, p.z, 0, { bandage: 3 }); }
      { const p = w4(T4.x - 8, T4.z + 4.5); add('ammo4', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
      { const p = w4(T4.x + 4, T4.z + 4); box3('i4_case1', 'case', p.x, p.y, p.z, 0.5, { name: 'Valise abandonnée', table: 'suitcase', rolls: [2, 3] }); }
      { const p = w4(T4.x - 20, T4.z - 4.5); box3('i4_lost', 'locker', p.x, p.y, p.z, 0, { name: 'Objets trouvés', table: 'suitcase', rolls: [2, 3], grid: [5, 4] }); }
      { const p = w4(F4.x + 9, F4.z - 4); box3('i4_fret', 'crate', p.x, p.y, p.z, 0.2, { name: 'Caisse de fret', table: 'crate', rolls: [2, 3], guaranteed: ['stake'] }); }
      { const p = w4(26, -9); box3('i4_police', 'military', p.x, p.y, p.z, 0, { name: 'Caisse du barrage', table: 'military', rolls: [2, 3], guaranteed: [['c_tacvest', 'c_milpack']], grid: [6, 4] }); }
      { const p = w4(28.8, -4); add('med4b', 'medkit', p.x, p.y + 0.02, p.z, 0, { bandage: 3 }); }
      { const p = w4(-8, -44); add('ammo4b', 'ammo', p.x, p.y, p.z, 0, { ammo: true }); }
      { const p = w4(-47, 19); box3('i4_bus', 'bag', p.x, p.y, p.z, 0.4, { name: 'Sac oublié', table: 'suitcase', rolls: [1, 3] }); }
    }
    // bureau de la police aux frontières (panneau)
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), new THREE.MeshLambertMaterial({ map: textTexture(['POLICE AUX FRONTIÈRES'], '#1d3a6a', '#fff4e0', 512, 100) }));
    sg.position.copy(w3(T.x - T.w / 2 + 4, FLAT3 + 3, T.z + 6)).add(new THREE.Vector3(0.8, 0, 0)); sg.rotation.y = Math.PI / 2; this.scene.add(sg);
    this.loot.push({ id: 'pafSign', mesh: sg, parent: this.scene, decor: true });
    this.lootTaken = this.lootTaken || {};
  },
  lootInteractions(add, me) {
    for (const l of this.loot || []) {
      if (l.decor || l.pos.distanceTo(me) > 6) continue;
      const g = l.give;
      if (g.needs && !(typeof g.needs === 'function' ? g.needs() : this.flags[g.needs])) continue;
      if (g.cont) {
        const C = this.lootC?.[l.id];
        const empty = C && !C.length;
        add(l.pos, 2.4, { prio: 1.5, prompt: `<kbd>E</kbd> Fouiller · ${this.lootDefs[l.id].name}${empty ? ' <span class="warn">(vide)</span>' : ''}`, press: () => { this.openInventory(`loot:${l.id}`); this.audio.clank(); } });
      } else if (g.weapon) {
        const G = GUNS[g.weapon], got = !!this.lootTaken[l.id];
        if (got && !G) continue;
        add(l.pos, 2.6, { prio: 2, prompt: got ? `<kbd>E</kbd> Munitions · ${AMMO_NAMES[G.ammo]}` : `<kbd>E</kbd> ${GEAR[g.weapon].name}`, press: () => {
          if (got) {
            const key = `${l.id}:a`;
            if (this.lootUsed(key)) { this.ui.toast('Vide', 'Revient demain.', 'bad', 1400); return; }
            const n = Math.round(G.mag * 1.5);
            this.giveItem(this.ammoFor(g.weapon), n, {}, { toSlot: false });
            this.markLoot(key); this.audio.pickup(); this.ui.toast('Munitions', `+${n}`, 'good', 1400);
            return;
          }
          this.lootTaken[l.id] = 'got';
          this.giveEquip(g.weapon, { ammo: g.ammo || 0 });
          this.lootHint(g.weapon);
        } });
      } else if (g.ammo) {
        add(l.pos, 2.4, { prompt: this.lootUsed(l.id) ? 'Munitions : vide' : '<kbd>E</kbd> Munitions', press: () => this.takeAmmoCrate(l) });
      } else if (g.bandage) {
        add(l.pos, 2.2, { prompt: this.lootUsed(l.id) ? 'Trousse : vide' : `<kbd>E</kbd> Trousse (+${g.bandage} bandages)`, press: () => { if (this.lootUsed(l.id)) return; this.giveItem('bandage', g.bandage, {}, { toSlot: false }); this.markLoot(l.id); this.audio.pickup(); this.ui.toast('Bandages', `+${g.bandage} · touche <kbd>H</kbd>`, 'good', 1600); } });
      }
    }
  },
  // caisses : une fois par jour et par joueur
  lootUsed(id) { return this.lootTaken?.[id] === this.stats.days; },
  markLoot(id) { this.lootTaken[id] = this.stats.days; },
  takeAmmoCrate(l) {
    if (this.lootUsed(l.id)) { this.audio.error(); return; }
    const guns = ['pistol', 'shotgun', 'rifle', 'flare'].filter((k) => this.hasItem(k));
    if (!guns.length) { this.ui.toast('Munitions', 'Aucune arme pour elles.', 'bad', 1600); return; }
    const got = [];
    for (const k of guns) { const n = k === 'flare' ? 3 : Math.round(GUNS[k].mag * 1.5); this.giveItem(this.ammoFor(k), n, {}, { toSlot: false, silent: true }); got.push(`+${n} ${GEAR[this.ammoFor(k)].name.toLowerCase()}`); }
    this.markLoot(l.id); this.audio.pickup();
    this.ui.toast('Munitions', got.join(' · '), 'good', 2000);
  },
  lootHint(key) {
    const t = {
      machete: 'La machette de Jo. Tranchante, rapide : clic pour frapper.',
      shotgun: 'Le fusil du gardien. Dévastateur de près, 6 cartouches, rechargez avec R.',
      pistol: 'Pistolet de service. Visez la tête : les zombies tombent deux fois plus vite. R pour recharger.',
      bat: 'Une batte cloutée. Elle repousse loin et assomme.',
      axe: 'La hache des pompiers. Lente mais redoutable.',
      rifle: 'Carabine automatique : maintenez le clic. Le bruit attire les morts de loin.',
    }[key];
    if (t) this.radioOnce(`weapon_${key}`, t);
  },
  // morts endormis dans les bâtiments (îles 2 et 3) : renouvelés chaque jour, ils se réveillent au bruit ou si on s'approche
  updateIndoorZombies() {
    if (!this.isAuthority() || this.chapter() < 2 || !this.interiors) return;
    const key = `${this.stats.days}:${this.chapter()}`;
    if (this._indoorKey === key) return;
    this._indoorKey = key;
    const ch = this.chapter();
    if (this.enemies.list.filter((e) => e.indoor && !e.dead).length > 10) return;
    const isl = ch === 2 ? this.island2 : ch === 3 ? this.island3 : this.island4;
    if (!isl) return;
    const boxes = this.interiors.filter((b) => b.minY === undefined && b.kind === 'hall' && Math.hypot((b.minX + b.maxX) / 2 - isl.cx, (b.minZ + b.maxZ) / 2 - isl.cz) < 500);
    const pool = ['voile', 'voile', 'crawler', 'voile', 'bloater', 'runner'];
    let n = 0;
    for (const b of boxes) {
      const count = 2 + Math.floor(Math.random() * 2) + (this.stats.days > 2 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const x = b.minX + 2 + Math.random() * Math.max(0.1, b.maxX - b.minX - 4), z = b.minZ + 2 + Math.random() * Math.max(0.1, b.maxZ - b.minZ - 4);
        this.enemies.add(pool[(n++) % pool.length], x, z, { indoor: true });
      }
    }
  },
  updateLoot() {
    // le pistolet reste caché tant que le coffre est fermé ; chaque joueur voit son exemplaire tant qu'il ne l'a pas pris
    const pl = this.loot?.find((l) => l.id === 'pistol'); if (pl) pl.mesh.visible = !!this.puzzles?.laser && !this.lootTaken[pl.id];
    for (const l of this.loot || []) if (!l.decor && l.give.weapon && !GUNS[l.give.weapon] && l.id !== 'pistol' && l.id !== 'axe') l.mesh.visible = !this.lootTaken[l.id];
  },
};
import { I2 } from './island2.js';
import { FLAT4, I4 } from './island4.js';
