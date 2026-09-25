// Pousser l'avion à la main quand il est coincé (plage, rocher, ponton), et pieux d'ancrage pour le treuil.
// Le déplacement est appliqué par le « propriétaire » de l'avion (pilote, sinon hôte) : les autres lui envoient leurs poussées.
import * as THREE from 'three';
import { heightAt, slopeAt, prep, flatMat } from './terrain.js';
import { WHEEL_DROP } from './planeModel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function buildStake() {
  const g = new THREE.Group();
  const m = (geo, col, y) => { const o = new THREE.Mesh(prep(geo, col), flatMat); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  m(new THREE.CylinderGeometry(0.06, 0.02, 0.9, 6), '#8a6a4a', 0.2);
  m(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), '#8d9299', 0.62);
  const ring = new THREE.Mesh(prep(new THREE.TorusGeometry(0.1, 0.02, 5, 10), '#ffd166'), flatMat); ring.position.y = 0.72; g.add(ring);
  return g;
}

// bouée d'amarrage : poteau planté dans l'eau, flotteur rouge et blanc, anneau pour le crochet du treuil
function buildMooring() {
  const g = new THREE.Group();
  const m = (geo, col, y) => { const o = new THREE.Mesh(prep(geo, col), flatMat); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  m(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 6), '#6f5038', -0.5);
  m(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10), '#e8483b', 0.05);
  m(new THREE.CylinderGeometry(0.43, 0.43, 0.2, 10), '#f3efe6', 0.32);
  m(new THREE.CylinderGeometry(0.42, 0.3, 0.25, 10), '#e8483b', 0.54);
  const ring = new THREE.Mesh(prep(new THREE.TorusGeometry(0.16, 0.035, 5, 12), '#ffd166'), flatMat);
  ring.position.y = 1.2; ring.rotation.x = Math.PI / 2; g.add(ring);
  return g;
}

export const PlanePushMixin = {
  // bouées d'amarrage dans l'eau autour des ports (points d'ancrage du treuil), bien espacées pour ne pas gêner l'avion
  // ports : [{ x, z }] en coordonnées monde ; key : île (reconstruite avec la graine)
  placeMoorings(key, ports) {
    this.moorings = this.moorings || {};
    const old = this.moorings[key];
    if (old) { this.scene.remove(old.group); old.cols.forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); }); }
    const group = new THREE.Group(), cols = [], spots = [];
    const all = Object.values(this.moorings).filter((q) => q !== old).flatMap((q) => q.spots);
    const deep = (x, z) => heightAt(x, z) < -2.2 && [[6, 0], [-6, 0], [0, 6], [0, -6]].every(([a, b]) => heightAt(x + a, z + b) < -1.6);
    for (const P of ports) {
      let n = 0;
      for (const r of [24, 32, 40, 50, 60]) {
        for (let k = 0; k < 24 && n < 5; k++) {
          const a = k / 24 * Math.PI * 2 + r * 0.1;
          const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
          if (!deep(x, z)) continue;
          if (spots.concat(all).some((s) => Math.hypot(s.x - x, s.z - z) < 22)) continue;
          if (ports.some((q) => Math.hypot(q.x - x, q.z - z) < 18)) continue;
          const b = buildMooring(); b.position.set(x, 0, z); group.add(b);
          const c = { type: 'circle', x, z, r: 0.45, mooring: true };
          cols.push(c); this.colliders.push(c); spots.push({ x, z }); n++;
        }
      }
    }
    this.scene.add(group);
    this.moorings[key] = { group, cols, spots };
  },
  // l'avion est-il accessible à la poussée (au sol ou à l'eau, personne ne le fait rouler vite) ?
  canPushPlane() {
    return this.planeLive && !this.flight.airborne && !this.wreckActive() && !(this.pilotId && this.flight.speed > 1.2);
  },
  pushSpecs(add, me) {
    if (!this.canPushPlane() || this.carrying || this.nozzle === this.myId() || this.player.onLadder) return;
    const root = this.plane.root;
    const loc = root.worldToLocal(me.clone());
    // enveloppe approximative : fuselage + flotteurs
    const cx = clamp(loc.x, -2.8, 2.8), cz = clamp(loc.z, -6.2, 8.4);
    if (Math.hypot(loc.x - cx, loc.z - cz) > 1.7) return;
    const fw = this.player.forward();
    const toC = new THREE.Vector3(root.position.x - me.x, 0, root.position.z - me.z).normalize();
    if (fw.dot(toC) < 0.2) return;
    add(me.clone().addScaledVector(fw, 1.2).setY(me.y + 1.1), 2.6, {
      prio: -0.5,
      prompt: '<kbd>E</kbd> Pousser',
      hold: { tick: (dt) => this.pushPlane(dt, fw, me) },
    });
  },
  pushPlane(dt, fw, me) {
    const helpers = this.mateList().filter((m) => m.pushing && m.pos.distanceTo(me) < 12).length;
    const sp = 0.85 * (1 + 0.6 * helpers) * (this.swimming() ? 0.6 : 1);
    const d = new THREE.Vector3(fw.x, 0, fw.z).normalize().multiplyScalar(sp * dt);
    // pousser loin du centre fait pivoter l'avion
    const c = this.plane.root.position;
    const ox = me.x - c.x, oz = me.z - c.z;
    const dyaw = clamp((oz * d.x - ox * d.z) * 0.035, -0.02, 0.02);
    this.pushingT = 0.3;
    this.stamina = Math.max(0, this.stamina - 6 * dt);
    this._pushSnd = (this._pushSnd || 0) - dt;
    if (this._pushSnd <= 0) { this._pushSnd = 0.9; this.swimming() || heightAt(c.x, c.z) < -0.3 ? this.audio.splash?.() : this.audio.clank?.(); }
    if (this.ownsPlane()) {
      if (!this.nudgePlane(d.x, d.z, dyaw) && (!this._pushBlockT || this.t - this._pushBlockT > 3)) {
        this._pushBlockT = this.t;
        this.ui.toast('Ça ne bouge pas', this.flight.wheels ? 'Terrain trop pentu.' : 'Sans roues : vers l\'eau.', 'bad', 1800);
      }
    } else {
      this._pushAcc = this._pushAcc || [0, 0, 0];
      this._pushAcc[0] += d.x; this._pushAcc[1] += d.z; this._pushAcc[2] += dyaw;
      this._pushSend = (this._pushSend || 0) + dt;
      if (this._pushSend > 0.12) {
        this._pushSend = 0;
        const s = this.session, own = this.pilotId && s.players.has(this.pilotId) ? this.pilotId : s.hostId;
        s.send('ppush', { d: this._pushAcc.map((v) => +v.toFixed(3)) }, own);
        this._pushAcc = [0, 0, 0];
      }
    }
  },
  // déplacement contrôlé (poussée à la main, treuil) : pas à travers les obstacles, pas sur le sable sans roues
  // force : arrachement du treuil (on passe malgré le sable, la pente ou l'obstacle)
  nudgePlane(dx, dz, dyaw = 0, force = false) {
    const f = this.flight;
    if (f.airborne) return false;
    const nx = f.pos.x + dx, nz = f.pos.z + dz, ny = f.yaw + dyaw;
    const g0 = heightAt(f.pos.x, f.pos.z), g1 = heightAt(nx, nz);
    if (g1 > -0.45 && !force) {
      if (!f.wheels && g1 > g0 + 0.005) return false;
      if (f.wheels && slopeAt(nx, nz).s > 0.32) return false;
    }
    const hitNow = this.planeHitTest(f.pos, f.yaw);
    if (!force && !hitNow && this.planeHitTest(new THREE.Vector3(nx, f.pos.y, nz), ny)) return false;
    f.pos.x = nx; f.pos.z = nz; f.yaw = ny; f.speed = 0;
    if (f.wheels && g1 > -0.45) { f.surface = 'ground'; f.pos.y = g1 + WHEEL_DROP; } else if (g1 <= -0.45 && f.surface !== 'water') { f.surface = 'water'; f.pos.y = 0; }
    f.apply();
    return true;
  },
  onPlanePush(d) {
    if (!this.ownsPlane() || !this.canPushPlane() || !Array.isArray(d?.d)) return;
    const [x, z, y] = d.d.map((v) => clamp(+v || 0, -0.4, 0.4));
    this.nudgePlane(x, z, clamp(y, -0.05, 0.05));
  },

  // ── pieux d'ancrage ──
  // point devant soi, au sol (terre ferme seulement)
  stakeSpot() {
    const p = this.playerWorld(), f = this.player.forward();
    const x = p.x + f.x * 1.3, z = p.z + f.z * 1.3, g = heightAt(x, z);
    if (g < -0.3 || this.swimming()) return null;
    return new THREE.Vector3(x, g, z);
  },
  plantStake() {
    const s = this.stakeSpot();
    if (!s) { this.audio.error(); this.ui.toast('Pas dans l\'eau', '', 'bad', 1400); return; }
    if (!this.invTake('stake', 1)) { this.audio.error(); return; }
    this.act('winch', { hook: 'anchor', anchor: [s.x, s.y + 0.7, s.z], stake: 1 });
    this.audio.clank();
    this.ui.toast('Pieu planté', 'Lancez le treuil.', 'good', 2200);
  },
  // un pieu visible là où le crochet est accroché dessus
  updateStakeMesh() {
    const W = this.winch;
    const show = W.hook === 'anchor' && W.anchor && W.stake;
    if (show && !this.stakeMesh) { this.stakeMesh = buildStake(); this.scene.add(this.stakeMesh); }
    if (this.stakeMesh) {
      this.stakeMesh.visible = !!show;
      if (show) this.stakeMesh.position.set(W.anchor[0], W.anchor[1] - 0.7, W.anchor[2]);
    }
  },
};
