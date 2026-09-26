// Apesanteur et chute « poupée de chiffon » dans les cabines en vol (Coucou et Boeing).
// On calcule la gravité ressentie dans le repère de l'avion : g apparente = g − accélération de l'avion.
// Un piqué franc (ressource négative) la fait tomber sous 0 : qui n'est pas assis décolle du plancher,
// flotte, se cogne au plafond… puis retombe quand l'avion se redresse, et s'étale au sol un moment.
// Les sièges ont une ceinture : assis, rien ne bouge.
import * as THREE from 'three';
import { clamp } from './noise.js';
import { FLOOR } from './planeModel.js';
import { FLOOR_B } from './boeing.js';

const G = 9.8;
const _q = new THREE.Quaternion();

// suivi de l'accélération d'un avion (vitesse analytique : cap, assiette et vitesse du moteur de vol)
class GTrack {
  constructor() { this.v = new THREE.Vector3(); this.a = new THREE.Vector3(); this.local = new THREE.Vector3(0, -G, 0); this.ok = false; this.low = 0; }
  update(dt, f, root) {
    if (dt <= 0) return;
    const v = f.airborne ? f.forward().multiplyScalar(f.speed) : new THREE.Vector3();
    if (!this.ok || v.distanceTo(this.v) > 60) { this.v.copy(v); this.a.set(0, 0, 0); this.ok = true; }
    const a = v.clone().sub(this.v).divideScalar(dt);
    this.v.copy(v);
    this.a.lerp(a, 1 - Math.exp(-dt / 0.12));
    // gravité apparente, exprimée dans le repère de l'avion
    root.getWorldQuaternion(_q).invert();
    this.local.set(-this.a.x, -G - this.a.y, -this.a.z).applyQuaternion(_q);
  }
  // part de la pesanteur qui plaque au plancher (1 = normal, 0 = apesanteur, < 0 : vers le plafond)
  get down() { return -this.local.y / G; }
}

export const ZeroGMixin = {
  cabinKind(kind) {
    return kind === 'boeing'
      ? { f: this.bf, root: this.boeing.root, ceil: FLOOR_B + 2.45 }
      : { f: this.flight, root: this.plane.root, ceil: FLOOR + 2.05 };
  },
  // déplacement dans une cabine : marche normale, ou apesanteur / chute selon la gravité ressentie
  cabinMove(dt, kind, cols, mods, env) {
    const K = this.cabinKind(kind), P = this.player, inp = this.input;
    const tr = (this._gTrack ||= {})[kind] ||= new GTrack();
    tr.update(dt, K.f, K.root);
    const Z = this.zg || (this.zg = { mode: 'walk', low: 0, vel: new THREE.Vector3(), roll: 0, rollV: 0, t: 0, impact: 0, kind });
    if (Z.kind !== kind) { Z.kind = kind; Z.mode = 'walk'; }
    const down = tr.down, air = K.f.airborne && K.f.speed > 8;
    Z.low = air && down < 0.3 ? Z.low + dt : 0;
    if (Z.mode !== 'float' && Z.low > 0.15) {
      Z.mode = 'float'; Z.t = 0; Z.vel.set(0, Math.max(0, P.velY), 0);
      P.onGround = false;
      if (!this.said.has('zeroG')) { this.said.add('zeroG'); this.ui.toast('Apesanteur !', 'Le piqué vous arrache du plancher. Asseyez-vous (ceinture) pour ne pas être ballotté.', 'bad', 4000); }
      this.audio.whoosh?.();
    }
    if (Z.mode === 'float') return this.zgFloat(dt, K, tr, cols, mods, env);
    if (Z.mode === 'rag') return this.zgRag(dt, K, env);
    P.roll = (P.roll || 0) * Math.exp(-6 * dt);
    return P.update(dt, inp, cols, mods, env);
  },
  // flotter : le corps suit la gravité apparente (repère de la cabine), on se cogne aux parois
  zgFloat(dt, K, tr, cols, mods, env) {
    const P = this.player, Z = this.zg, inp = this.input;
    Z.t += dt;
    // regard libre
    P.yaw -= inp.mdx * 0.0022 * P.sens; P.pitch = clamp(P.pitch - inp.mdy * 0.0022 * P.sens, -1.45, 1.45);
    const g = tr.local;
    Z.vel.addScaledVector(g, dt);
    // on peut se repousser un peu (bras, jambes contre les parois)
    if (mods.canMove) {
      const f = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      const fw = P.forward(), rt = new THREE.Vector3(-fw.z, 0, fw.x);
      Z.vel.addScaledVector(fw, f * 2.2 * dt).addScaledVector(rt, s * 2.2 * dt);
    }
    Z.vel.multiplyScalar(Math.exp(-0.35 * dt));
    const floor = env.height(P.pos.x, P.pos.z), top = K.ceil - 1.1;
    const ox = P.pos.x, oz = P.pos.z;
    const nx = P.pos.x + Z.vel.x * dt, nz = P.pos.z + Z.vel.z * dt;
    if (env.canGo(nx, P.pos.z)) P.pos.x = nx; else Z.vel.x *= -0.35;
    if (env.canGo(P.pos.x, nz)) P.pos.z = nz; else Z.vel.z *= -0.35;
    const r0 = P.radius; P.radius = 0.28; P.resolve(cols); P.radius = r0;
    if (!env.canGo(P.pos.x, P.pos.z)) { P.pos.x = ox; P.pos.z = oz; Z.vel.x *= -0.3; Z.vel.z *= -0.3; }   // jamais à travers la carlingue
    P.pos.y += Z.vel.y * dt;
    // plafond : on s'y cogne
    if (P.pos.y > top) { P.pos.y = top; if (Z.vel.y > 1.5) { P.shake = Math.max(P.shake, 0.5); this.audio.thud?.(); Z.rollV += (Math.random() - 0.5) * 3; } Z.vel.y = -Math.abs(Z.vel.y) * 0.3; }
    // retour au plancher
    let landed = false;
    if (P.pos.y <= floor) {
      P.pos.y = floor;
      const impact = -Z.vel.y;
      Z.vel.y = 0;
      if (tr.down > 0.5) landed = impact;
    }
    // la caméra tourne lentement sur elle-même
    Z.rollV += (Math.random() - 0.5) * 1.2 * dt - Z.roll * 0.4 * dt;
    Z.rollV *= Math.exp(-0.6 * dt);
    Z.roll = clamp(Z.roll + Z.rollV * dt, -1.1, 1.1);
    P.roll = Z.roll;
    P.velY = 0;
    P.applyCamera(dt, false, K.root, 0.95 + 0.25 * Math.cos(Z.roll));
    if (landed !== false) {
      if (landed > 1.2 || Z.t > 0.6) this.zgFall(landed);
      else { Z.mode = 'walk'; P.onGround = true; }
    }
    // l'avion s'est posé (ou remis en approche) : on retombe sur ses pieds
    if (!K.f.airborne) { Z.mode = 'walk'; P.pos.y = floor; P.onGround = true; }
    return { moving: false, sprint: false };
  },
  // on s'étale sur le plancher (poupée de chiffon)
  zgFall(impact) {
    const Z = this.zg, P = this.player;
    Z.mode = 'rag'; Z.t = 0; Z.impact = impact;
    Z.dur = clamp(1.8 + impact * 0.35, 1.8, 3.6);
    Z.side = Math.random() < 0.5 ? -1 : 1;
    Z.startRoll = P.roll || 0;
    P.shake = Math.max(P.shake, 0.9);
    this.audio.thud?.(); this.audio.hurt?.();
    const dmg = Math.min(18, Math.max(0, (impact - 1.5) * 4));
    if (dmg > 0) this.hurt?.(dmg, 'la chute dans la cabine');
    if (!this.said.has('ragdoll')) { this.said.add('ragdoll'); this.ui.toast('Aïe !', 'Vous vous étalez sur le plancher. <kbd>Espace</kbd> pour vous relever.', 'bad', 3500); }
  },
  zgRag(dt, K, env) {
    const P = this.player, Z = this.zg, inp = this.input;
    Z.t += dt;
    P.pos.y = env.height(P.pos.x, P.pos.z);
    P.yaw -= inp.mdx * 0.0022 * P.sens * 0.3;
    const getUp = Z.t > Z.dur || (Z.t > 1.0 && inp.hit('Space'));
    if (getUp && !Z.up) Z.up = Z.t;
    const k = Z.up ? clamp((Z.t - Z.up) / 0.6, 0, 1) : 0;
    // chute : la tête tape, rebondit, reste de côté ; puis on se relève
    const fall = clamp(Z.t / 0.25, 0, 1);
    const wobble = Math.exp(-Z.t * 3) * Math.sin(Z.t * 18) * 0.12;
    const lieRoll = Z.side * (1.25 + wobble), lieEye = 0.28 + Math.abs(wobble) * 0.3;
    const roll = Z.startRoll + (lieRoll - Z.startRoll) * fall;
    P.roll = roll * (1 - k);
    P.pitch += ((-0.15) - P.pitch) * Math.min(1, dt * 4) * (1 - k);
    const eye = (1.65 + (lieEye - 1.65) * fall) * (1 - k) + 1.65 * k;
    P.applyCamera(dt, false, K.root, eye);
    if (k >= 1) { Z.mode = 'walk'; Z.up = 0; P.roll = 0; P.onGround = true; P.velY = 0; }
    return { moving: false, sprint: false };
  },
  // état publié aux coéquipiers : 0 debout, 1 en apesanteur, 2 étalé
  zgState() { const Z = this.zg; return !Z || !(this.aboard || this.bseat?.walk) ? 0 : Z.mode === 'float' ? 1 : Z.mode === 'rag' ? 2 : 0; },
  // hors cabine (assis, sorti, posé) : on remet tout à plat
  zgReset() { if (this.zg) { this.zg.mode = 'walk'; this.zg.low = 0; this.zg.up = 0; } this.player.roll = 0; },
};
