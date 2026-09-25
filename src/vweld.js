// Postes à souder fixes (un par île) : on décroche le fer (relié par un câble), puis on soude la carrosserie
// d'un véhicule abîmé ou en panne. Même geste que sur le Coucou : clic maintenu, relâcher dans le vert.
import * as THREE from 'three';
import { prep, flatMat, heightAt, LAYOUT, textTexture } from './terrain.js';

const VW_LEN = 22;           // longueur du câble (m)
const LO = 50, HI = 90;      // zone verte de la jauge de chaleur
const GAIN = 20;             // % de carrosserie par soudure réussie

function box(w, h, d, col, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); m.position.set(x, y, z); m.castShadow = true; return m; }
function cyl(r, h, col, x, y, z) { const m = new THREE.Mesh(prep(new THREE.CylinderGeometry(r, r, h, 8), col), flatMat); m.position.set(x, y, z); m.castShadow = true; return m; }

// chariot de soudure : poste jaune, bouteilles de gaz, panneau visible de loin, fer accroché
function buildStation() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.12, 0.75, '#3d434d', 0, 0.2, 0));
  for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) { const w = cyl(0.12, 0.08, '#1e1e22', x, 0.12, z); w.rotation.z = Math.PI / 2; g.add(w); }
  g.add(box(0.7, 0.6, 0.55, '#ffb020', -0.2, 0.56, 0));
  g.add(box(0.5, 0.22, 0.02, '#10162b', -0.2, 0.64, -0.28));
  g.add(box(0.08, 0.08, 0.03, '#ff6b5b', -0.35, 0.44, -0.28), box(0.08, 0.08, 0.03, '#5ef2c2', -0.2, 0.44, -0.28));
  g.add(cyl(0.12, 1.1, '#c9352b', 0.36, 0.81, -0.14), cyl(0.12, 1.0, '#2f6a8a', 0.36, 0.76, 0.16));
  g.add(cyl(0.05, 0.08, '#8d9299', 0.36, 1.4, -0.14), cyl(0.05, 0.08, '#8d9299', 0.36, 1.3, 0.16));
  // panneau
  g.add(box(0.07, 2.4, 0.07, '#8d9299', -0.55, 1.2, 0.3));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshLambertMaterial({ map: textTexture(['🔧 SOUDURE'], '#ffb020', '#10162b', 512, 180), side: THREE.DoubleSide }));
  sign.position.set(-0.55, 2.2, 0.3); g.add(sign);
  // fer accroché au poste (masqué quand quelqu'un l'a en main)
  const home = new THREE.Group();
  home.add(box(0.05, 0.05, 0.2, '#33373f', 0, 0, 0.02), box(0.045, 0.045, 0.12, '#ffd166', 0, 0, -0.14), box(0.02, 0.02, 0.1, '#b87333', 0, 0, -0.25));
  home.position.set(-0.2, 0.92, -0.05); home.rotation.x = -0.3;
  g.add(home);
  g.traverse((o) => { if (o.isMesh) o.userData.dynamic = true; });
  return { root: g, home };
}

export const VWeldMixin = {
  // à appeler une fois les îles construites
  buildVWeldStations() {
    for (const s of this.vwStations || []) { this.scene.remove(s.mesh); const i = this.colliders.indexOf(s.col); if (i >= 0) this.colliders.splice(i, 1); }
    this.vwStations = [];
    this.vweld = null;
    const cb = LAYOUT.cabane;
    const spots = [{ island: 1, x: cb.x + 6, z: cb.z + 3, yaw: 0.4 }];
    if (this.island2) spots.push({ island: 2, x: this.island2.cx + 6.5, z: this.island2.cz + 49.5, yaw: Math.PI / 2 });   // à côté de la borne du kart
    if (this.island3) spots.push({ island: 3, x: this.island3.cx - 40, z: this.island3.cz + 88, yaw: 0 });                // devant le dépôt (chariot élévateur)
    if (this.island4) spots.push({ island: 4, x: this.island4.cx + 23.5, z: this.island4.cz + 108, yaw: -Math.PI / 2 });  // contre le hangar de fret
    for (const s of spots) {
      const { root, home } = buildStation();
      const y = heightAt(s.x, s.z);
      root.position.set(s.x, y, s.z); root.rotation.y = s.yaw;
      this.scene.add(root);
      const col = { type: 'circle', x: s.x, z: s.z, r: 0.7 };
      this.colliders.push(col);
      this.vwStations.push({ ...s, y, mesh: root, home, col, anchor: new THREE.Vector3(s.x, y + 0.9, s.z) });
    }
    this._colGrid = null;   // la grille des colliders est reconstruite à la prochaine requête
  },

  vweldInteractions(add, me) {
    for (const s of this.vwStations || []) {
      if (Math.hypot(s.x - me.x, s.z - me.z) > 6) continue;
      if (this.vweld === s) { add(s.anchor, 3, { prio: 3, prompt: '<kbd>E</kbd> Raccrocher le fer', press: () => this.dropVWeld() }); continue; }
      const n = Object.values(this.vehicles || {}).filter((v) => v.hp < 100 && Math.hypot(v.x - s.x, v.z - s.z) < VW_LEN + v.def.len / 2).length;
      add(s.anchor, 3, { prio: 3, prompt: `<kbd>E</kbd> Poste à souder · réparer un véhicule${n ? ` (${n} abîmé${n > 1 ? 's' : ''} à portée)` : ''}`, press: () => this.takeVWeld(s) });
    }
  },
  takeVWeld(s) {
    if (this.carrying) this.dropCarried();
    if (this.iron === this.myId()) this.dropIron();
    this.vweld = s;
    s.home.visible = false;
    this.inv.sel = 'fists';
    this.syncHeld?.();
    this.reloadT = 0; this.vwHeat = 0;
    this.audio.clank();
    if (!this.said.has('vweldTip')) { this.said.add('vweldTip'); this.ui.toast('Poste à souder', `Visez la carrosserie d'un véhicule abîmé · clic maintenu · relâchez dans le vert. Câble de ${VW_LEN} m : amenez le véhicule jusqu'ici (en panne, il roule encore au pas).`, 'good', 7000); }
  },
  dropVWeld() {
    const s = this.vweld;
    if (!s) return;
    this.vweld = null;
    s.home.visible = true;
    this.vwHeat = 0;
    this.syncHeld?.();
    this.ui.weld(null);
    if (this.vwCable) this.vwCable.visible = false;
    this.audio.clank();
  },

  // chaque image : câble entre le poste et la main, décrochage automatique
  updateVWeldCable() {
    const s = this.vweld;
    if (!s) { if (this.vwCable) this.vwCable.visible = false; return; }
    if (!this.inGame() || this.aboard || this.driving || this.riding || this.downed || this.mode !== 'explore' || this.carrying) { this.dropVWeld(); return; }
    if (this.input.hit('KeyG')) { this.dropVWeld(); return; }
    const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw);
    const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
    const end = this.camera.position.clone().addScaledVector(fw, 0.5).addScaledVector(right, 0.24).add(new THREE.Vector3(0, -0.3, 0));
    const start = s.anchor, dist = start.distanceTo(end);
    if (dist > VW_LEN) { this.dropVWeld(); this.ui.toast('Câble trop court', `${VW_LEN} m maximum : rapprochez le véhicule du poste.`, 'bad', 2200); return; }
    const sag = Math.max(0.3, (VW_LEN - dist) * 0.1);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; const p = start.clone().lerp(end, t); p.y -= Math.sin(Math.PI * t) * sag; p.y = Math.max(p.y, this.groundAt(p.x, p.z, p.y + 2) + 0.04); pts.push(p); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.022, 5, false);
    if (!this.vwCable) { this.vwCable = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#1d2233' })); this.scene.add(this.vwCable); }
    else { this.vwCable.geometry.dispose(); this.vwCable.geometry = geo; }
    this.vwCable.visible = true;
  },

  // à pied, fer du poste en main : renvoie vrai si le clic sert à souder
  updateVehicleWeld(dt) {
    const s = this.vweld, ui = this.ui;
    if (!s) return false;
    this.vwCool = Math.max(0, (this.vwCool || 0) - dt);
    // carrosserie visée : on avance le long du regard et on teste la boîte de chaque véhicule
    const eye = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const inv = new THREE.Matrix4(), q = new THREE.Vector3();
    let hit = null;
    for (const v of Object.values(this.vehicles || {})) {
      if (Math.hypot(v.x - eye.x, v.z - eye.z) > v.def.len / 2 + 5) continue;
      const r = v.model.root; r.updateMatrix(); inv.copy(r.matrix).invert();
      for (let t = 0.3; t < 4.2; t += 0.08) {
        q.copy(eye).addScaledVector(dir, t).applyMatrix4(inv);
        if (Math.abs(q.x) < v.def.wid / 2 + 0.15 && Math.abs(q.z) < v.def.len / 2 + 0.15 && q.y > 0.1 && q.y < v.def.h) {
          if (!hit || t < hit.t) hit = { v, t, p: eye.clone().addScaledVector(dir, t) };
          break;
        }
      }
    }
    if (!hit || hit.v.hp >= 100) {
      ui.weld(null); this.vwHeat = 0;
      ui.prompt(hit ? `${hit.v.def.name} : en parfait état · <kbd>G</kbd> raccrocher le fer` : 'Visez la carrosserie d\'un véhicule abîmé · <kbd>G</kbd> raccrocher le fer');
      return !!this.input.down('MouseL');
    }
    const v = hit.v;
    const holding = this.input.down('MouseL');
    if (this.vwCool > 0) { ui.weld({ heat: 0, lo: LO, hi: HI, msg: 'Refroidissement…' }); return true; }
    if (holding) {
      // chauffe irrégulière : il faut surveiller la jauge
      this.vwHeat = (this.vwHeat || 0) + dt * (48 + 22 * Math.sin(this.t * 3.1));
      this.emitSparks(hit.p, 3);
      this.welding = 0.2;
      this._vwSizzle = (this._vwSizzle || 0) - dt;
      if (this._vwSizzle <= 0) { this._vwSizzle = 0.12; this.audio.spark(); }
      if (this.vwHeat >= 100) {
        this.vwHeat = 0; this.vwCool = 1.2;
        this.emitSparks(hit.p, 25);
        this.audio.error();
        this.hp -= 4; this.lastHurt = this.t; ui.hurt(0.4); setTimeout(() => ui.hurt(0), 200);
        ui.toast('Surchauffe', '', 'bad', 1100);
      }
    } else if (this.vwHeat > 0) {
      const h = this.vwHeat;
      this.vwHeat = 0;
      if (h >= LO && h <= HI) {
        const hp = Math.min(100, v.hp + GAIN * (this.hasItem('wrench') ? 1.25 : 1));
        this.act('vhp', { v: v.id, hp: +hp.toFixed(1) });
        this.emitSparks(hit.p, 14, true);
        this.audio.note(1320);
        if (hp >= 100) { this.audio.success(); ui.toast(`${v.def.name} réparé`, 'Carrosserie à 100 %.', 'good', 2500); }
      } else if (h > 12) { this.audio.error(); ui.toast('Trop tôt', '', 'bad', 900); }
    }
    ui.weld({ heat: this.vwHeat, lo: LO, hi: HI, msg: holding ? 'Relâchez dans le vert' : 'Clic maintenu' });
    ui.prompt(`${v.def.name} : état ${Math.round(v.hp)} %${v.hp <= 0 ? ' (en panne)' : ''}`);
    return true;
  },

  // pour la carte
  vweldSpots() { return (this.vwStations || []).map((s) => ({ island: s.island, x: s.x, z: s.z })); },
};
