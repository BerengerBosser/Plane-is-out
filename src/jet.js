// Le Faucon : avion de chasse monoplace, débloqué une fois l'aventure finie (Hélios sauvée).
// Il attend sur le tarmac de Soleil-Levant ; les anciennes sauvegardes terminées l'ont aussi (drapeau « cured »).
// Même moteur de vol que le Coucou et le Boeing (flight.js), réglé nerveux, avec postcombustion.
// Le pilote simule le vol et le publie dans sa présence ; l'hôte arbitre qui est aux commandes.
import * as THREE from 'three';
import { Flight } from './flight.js';
import { prep, flatMat, heightAt } from './terrain.js';
import { clamp } from './noise.js';
import { I4 } from './island4.js';
import { mergeByMaterial } from './vehicles.js';

const JCFG = { maxThrust: 40, airDrag: 0.0016, groundDrag: 0.004, waterDrag: 0.05, waterFriction: 1, takeoffSpeed: 40, stallSpeed: 26, pitchRate: 1.3, rollRate: 2.4, rudderRate: 0.45, bankTurn: 1.15, maxPitch: 0.95, maxRoll: 1.35, worldLimit: 9000, fuelPerSecond: 0, gentleMax: 80, sinkMax: 11, landClamp: 40, effSpeed: 45 };
const BOOST = 1.7;                                   // postcombustion (Maj)
const PARK = { x: I4.runway.x1 - 22, z: I4.runway.z, yaw: Math.PI / 2 };   // bout est de la piste d'Hélios, dans l'axe (nez vers l'ouest)
const NO_INPUT = { down: () => false, hit: () => false, mdx: 0, mdy: 0 };
const COCKPIT = new THREE.Vector3(0, 2.75, -3.1);

// ── modèle (avant = -z, origine au sol sous le train) ──
const GREY = '#7d8894', DARK = '#3a4048', RED = '#ff6b5b';
function part(geo, col, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(prep(geo, col), flatMat); m.position.set(x, y, z); m.castShadow = true; return m; }
// aile plate dessinée dans le plan (x, z), épaisseur t vers le bas
function slab(pts, t, col, y) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).rotateX(Math.PI / 2);
  return part(g, col, 0, y, 0);
}
// dérive dessinée dans le plan (z, y)
function fin(pts, t, col, x = 0, y = 0) {
  const s = new THREE.Shape(pts.map(([z, h]) => new THREE.Vector2(z, h)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(t / 2, 0, 0);
  return part(g, col, x, y, 0);
}
function buildJet() {
  const g = new THREE.Group();
  const Y = 1.9;
  g.add(part(new THREE.CylinderGeometry(0.72, 0.85, 9.5, 10).rotateX(Math.PI / 2), GREY, 0, Y, 0.6));
  g.add(part(new THREE.ConeGeometry(0.72, 3.6, 10).rotateX(-Math.PI / 2), GREY, 0, Y, -5.95));
  g.add(part(new THREE.ConeGeometry(0.2, 0.7, 6).rotateX(-Math.PI / 2), DARK, 0, Y, -8.0));        // pointe radar
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(0.55, 0.8, 3.2), DARK, s * 0.95, Y - 0.2, -0.6));             // entrées d'air
    g.add(slab([[s * 0.7, -2.2], [s * 4.8, 2.4], [s * 4.8, 3.3], [s * 0.7, 3.8]], 0.14, GREY, Y - 0.05));   // aile delta
    g.add(slab([[s * 0.6, 4.1], [s * 2.3, 5.5], [s * 2.3, 6.0], [s * 0.6, 6.0]], 0.1, GREY, Y + 0.05));      // empennage
    g.add(part(new THREE.BoxGeometry(0.12, 0.12, 1.4), RED, s * 4.7, Y - 0.1, 2.8));               // saumons rouges
    const mis = part(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6).rotateX(Math.PI / 2), '#f2f2ee', s * 3.2, Y - 0.35, 1.6);
    g.add(mis, part(new THREE.ConeGeometry(0.1, 0.35, 6).rotateX(-Math.PI / 2), RED, s * 3.2, Y - 0.35, 0.33));
  }
  g.add(fin([[3.2, 0], [5.9, 0], [6.2, 2.7], [5.3, 2.7]], 0.14, GREY, 0, Y + 0.55));
  g.add(part(new THREE.BoxGeometry(0.16, 0.5, 0.9), RED, 0, Y + 2.9, 5.75));                      // bande rouge de la dérive
  g.add(part(new THREE.CylinderGeometry(0.62, 0.55, 0.9, 10).rotateX(Math.PI / 2), DARK, 0, Y, 5.8));   // tuyère
  // verrière
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshLambertMaterial({ color: '#7fb8d0', transparent: true, opacity: 0.45, depthWrite: false }));
  glass.scale.set(0.95, 0.75, 2.6); glass.position.set(0, Y + 0.6, -3.0); g.add(glass);
  g.add(part(new THREE.BoxGeometry(0.5, 0.5, 0.5), DARK, 0, Y + 0.35, -2.9));                    // siège éjectable
  // train d'atterrissage
  for (const [x, z] of [[0, -4.2], [-1.3, 1.4], [1.3, 1.4]]) {
    g.add(part(new THREE.BoxGeometry(0.14, Y - 0.35, 0.14), DARK, x, (Y - 0.35) / 2 + 0.35, z));
    g.add(part(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10).rotateZ(Math.PI / 2), '#1e1e22', x, 0.35, z));
  }
  // flamme de la postcombustion (taille selon les gaz)
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 10).rotateX(Math.PI / 2).translate(0, 0, 1.5), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
  flame.position.set(0, Y, 6.2);
  g.add(flame);
  mergeByMaterial(g, (o) => o === flame);
  return { root: g, flame };
}

export const JetMixin = {
  jetSetup() {
    const I = this.island4; if (!I) return;
    if (!this.jet) {
      const m = buildJet();
      this.scene.add(m.root);
      // caméra factice : reset() recale la caméra du moteur de vol, la nôtre est gérée dans updateJetPilot
      const f = new Flight({ root: m.root, spinners: [] }, new THREE.PerspectiveCamera(), { cfg: JCFG, wheelDrop: 0 });
      f.wheels = true;
      f.hitTest = () => this.jetHitTest();
      this.jet = { m, f, pilot: 0, park: null, cam: new THREE.Vector3(), mirror: null };
    }
    this.jet.park = this.jetHome();
    this.jet.pilot = 0;
    this.jetting = false;
    this.jetPose();
  },
  jetHome() { const I = this.island4; return { x: I.cx + PARK.x, z: I.cz + PARK.z, yaw: PARK.yaw }; },
  // débloqué en finissant l'aventure : les sauvegardes déjà terminées l'ont d'office
  jetUnlocked() { return !!this.flags?.cured; },
  // garé : posé au sol à sa place
  jetPose() {
    const J = this.jet; if (!J) return;
    const P = J.park, f = J.f;
    f.reset(P.x, P.z, P.yaw);
    if (f.surface !== 'ground') { f.surface = 'ground'; f.pos.y = Math.max(heightAt(P.x, P.z), 0); }
    f.apply();
    J.m.flame.scale.setScalar(0.001);
  },

  // ── réseau et sauvegarde ──
  jetState() { const J = this.jet; return J ? { p: J.pilot || 0, k: [+J.park.x.toFixed(2), +J.park.z.toFixed(2), +J.park.yaw.toFixed(3)] } : null; },
  applyJetState(s, load) {
    const J = this.jet; if (!J || !s) return;
    if (this.jetting) return;   // c'est nous qui volons : notre simulation fait foi
    J.pilot = load ? 0 : s.p || 0;
    if (s.k) J.park = { x: s.k[0], z: s.k[1], yaw: s.k[2] };
    if (!J.pilot) this.jetPose();
  },
  applyJetAct(type, d, by, auth) {
    if (type !== 'jet') return null;
    const J = this.jet; if (!J) return false;
    const alive = (id) => !this.session || this.session.players.has(id) || id === this.session.me;
    if (d.on) {
      if (auth && (!this.jetUnlocked() || (J.pilot && J.pilot !== by && alive(J.pilot)))) return false;
      J.pilot = by;
    } else {
      if (auth && J.pilot && J.pilot !== by && alive(J.pilot)) return false;
      J.pilot = 0; J.mirror = null;
      if (d.k) J.park = { x: d.k[0], z: d.k[1], yaw: d.k[2] };
      if (by !== this.myId()) this.jetPose();
    }
    this.dirtyWorld = true;
    return true;
  },
  jetPresence() {
    const f = this.jet?.f;
    return this.jetting && f ? [f.pos.x, f.pos.y, f.pos.z, f.yaw, f.pitch, f.roll, f.speed, f.throttle * (this._jetBoost ? 2 : 1)].map((v) => +v.toFixed(3)) : 0;
  },
  applyJetPresence(a, who) { const J = this.jet; if (!J || this.jetting) return; J.pilot = who; J.mirror = a; },
  jetPilotLost(id) {
    const J = this.jet;
    if (!this.session?.isHost || !J || J.pilot !== id) return;
    const f = J.f, ok = f.surface === 'ground';
    this.act('jet', { on: 0, k: ok ? [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2), +f.yaw.toFixed(3)] : null });
    if (!ok) { J.park = this.jetHome(); this.jetPose(); }
  },

  // ── à pied : monter à bord ──
  jetInteractions(add, me) {
    const J = this.jet;
    if (!J || !this.jetUnlocked() || this.jetting) return;
    const f = J.f;
    if (Math.hypot(f.pos.x - me.x, f.pos.z - me.z) > 14) return;
    const side = J.m.root.localToWorld(new THREE.Vector3(-1.8, 0, -3.0));
    side.y = this.groundAt(side.x, side.z, 99) + 1.2;
    if (J.pilot && J.pilot !== this.myId()) { add(side, 4, { prompt: `<span class="warn">Le Faucon : ${this.nameOf(J.pilot)} est aux commandes</span>` }); return; }
    add(side, 4, { prio: 3, prompt: '<kbd>E</kbd> monter dans le Faucon (avion de chasse)', press: () => this.enterJet() });
  },
  enterJet() {
    if (this.carrying) this.dropCarried();
    if (this.act('jet', { on: 1 }) === false) { this.audio.error(); this.ui.toast('Occupé', 'Quelqu\'un pilote déjà le Faucon.', 'bad', 1800); return; }
    const J = this.jet, f = J.f;
    this.jetting = true;
    this.jetPose();
    f.fuel = 100; f.cockpitView = false; f.powerMul = 1;
    J.cam.copy(J.m.root.localToWorld(new THREE.Vector3(0, 6, 22)));
    this.aboard = false; this.seat = null; this.lying = false;
    this.ui.el.hud.dataset.mode = 'flight';
    this.ui.prompt(''); this.ui.carry(''); this.ui.hold(0);
    this.audio.clank();
    this.flashKeys();
    if (!this.said.has('jetTip')) { this.said.add('jetTip'); this.ui.toast('Aux commandes du Faucon', 'Plein gaz (<kbd>Z</kbd>), <kbd>Maj</kbd> postcombustion, tirez sur le manche à 145 km/h. À l\'arrêt au sol, <kbd>E</kbd> pour descendre.', 'good', 8000); }
  },
  exitJet() {
    const J = this.jet, f = J.f;
    this.jetting = false;
    J.park = { x: f.pos.x, z: f.pos.z, yaw: f.yaw };
    this.act('jet', { on: 0, k: [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2), +f.yaw.toFixed(3)] });
    this.jetPose();
    // on descend à gauche du cockpit
    const side = J.m.root.localToWorld(new THREE.Vector3(-2.4, 0, -3.0));
    this.player.place(side.x, side.z, f.yaw);
    this.player.pos.y = this.groundAt(side.x, side.z, 99);
    this.player.pitch = 0; this.player.velY = 0; this.player.onGround = true;
    this.ui.el.hud.dataset.mode = 'explore';
    this.ui.flight(false);
    this.audio.setEngine(0, 0);
    this.camera.fov = this.baseFov || 72; this.camera.updateProjectionMatrix();
    this.audio.clank();
  },
  // bâtiments d'Hélios (le relief et l'eau sont gérés par le moteur de vol)
  jetHitTest() {
    const I = this.island4, r = this.jet.m.root;
    if (!I || Math.hypot(r.position.x - I.cx, r.position.z - I.cz) > 650) return false;
    if (!this._jpts) this._jpts = [[0, 1.9, -7.5], [0, 1.9, 6], [-4.6, 1.9, 2.8], [4.6, 1.9, 2.8], [0, 4.5, 5.8]].map((a) => new THREE.Vector3(...a));
    r.updateWorldMatrix(true, false);
    for (const v of this._jpts) {
      const p = v.clone().applyMatrix4(r.matrixWorld);
      for (const b of I.bld) if (p.y < b.top && p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) return true;
    }
    return false;
  },
  // crash, amerrissage : le Faucon est remis en état sur le tarmac d'Hélios
  jetCrash(why) {
    const J = this.jet;
    if ((this._jCrashT || 0) > this.t) return;
    this._jCrashT = this.t + 2;
    this.ui.fade(1, '#000', 120); setTimeout(() => this.ui.fade(0, '#000', 900), 450);
    this.audio.thud(); this.player.shake = 1;
    J.park = this.jetHome();
    this.jetPose();
    J.f.fuel = 100;
    this.ui.toast(why === 'water' ? 'Dans l\'eau !' : 'Éjection !', 'Le Faucon est remis en état au bout de la piste de Soleil-Levant.', 'bad', 4500);
  },

  // ── chaque image ──
  updateJet(dt) {
    const J = this.jet; if (!J) return;
    const on = this.jetUnlocked();
    J.m.root.visible = on;
    if (!on) return;
    if (!this.said.has('jetUnlocked') && this.mode === 'explore' && !this.cinematic) {
      this.said.add('jetUnlocked');
      this.ui.toast('Avion de chasse débloqué !', 'Le Faucon vous attend au bout est de la piste de Soleil-Levant, à Hélios.', 'good', 8000);
    }
    // piloté par un coéquipier : on suit sa présence
    if (!this.jetting && J.pilot && J.mirror) {
      const f = J.f, [x, y, z, yaw, pitch, roll, speed, thr] = J.mirror;
      const k = Math.min(1, dt * 10), p = new THREE.Vector3(x, y, z);
      if (f.pos.distanceTo(p) > 60) f.pos.copy(p); else f.pos.lerp(p, k);
      const ang = (q, t) => q + Math.atan2(Math.sin(t - q), Math.cos(t - q)) * k;
      f.yaw = ang(f.yaw, yaw); f.pitch = ang(f.pitch, pitch); f.roll = ang(f.roll, roll);
      f.speed = speed; f.throttle = Math.min(1, thr);
      f.apply();
      this.jetFlame(thr > 1 ? thr / 2 : thr, thr > 1);
    }
  },
  jetFlame(thr, boost) {
    const fl = this.jet.m.flame;
    const s = thr < 0.05 ? 0.001 : 0.35 + thr * 0.6 + (boost ? 0.7 : 0);
    fl.scale.set(boost ? 1.15 : 0.8, boost ? 1.15 : 0.8, s * (0.9 + Math.random() * 0.2));
    fl.material.color.set(boost ? '#9fd4ff' : '#ffb35a');
  },
  // aux commandes (appelé depuis l'exploration, à la place de la marche)
  updateJetPilot(dt, blocked) {
    const J = this.jet, f = J.f, inp = blocked ? NO_INPUT : this.input, ui = this.ui, r = J.m.root;
    ui.el.hud.dataset.mode = 'flight';
    const boost = !blocked && inp.down('ShiftLeft', 'ShiftRight') && f.throttle > 0.6;
    this._jetBoost = boost;
    f.powerMul = boost ? BOOST : 1;
    const ev = f.update(dt, inp, !blocked);
    for (const e of ev) {
      if (e === 'takeoff') this.audio.whoosh();
      else if (e === 'landed_ground') { ui.toast('Toucher !', 'Freinez : <kbd>Espace</kbd>. À l\'arrêt, <kbd>E</kbd> pour descendre.', 'good', 3000); this.audio.thud(); }
      else if (e === 'landed' || e === 'on_water') { this.jetCrash('water'); return; }
      else if (e === 'crash') { this.jetCrash(); return; }
      else if (e === 'bump') this.audio.clank();
    }
    if (f.surface === 'water') { this.jetCrash('water'); return; }
    this.jetFlame(f.throttle, boost);
    this.audio.setEngine(0.5 + f.throttle * 0.5 + (boost ? 0.3 : 0), f.throttle * 0.9 + Math.min(f.speed / 120, 1) * 0.4);
    this.audio.setWind(clamp(f.speed / 120, 0.04, 0.3), 0.8);
    // le joueur « est » dans le cockpit (portée de la voix, cible des zombies, carte)
    r.updateWorldMatrix(true, false);
    this.player.pos.copy(COCKPIT).applyMatrix4(r.matrixWorld);
    this.player.yaw = f.yaw;
    if (!blocked && inp.hit('KeyE')) {
      if (f.airborne) { ui.toast('En plein vol', 'Posez-vous et arrêtez-vous pour descendre.', 'bad', 2000); this.audio.error(); }
      else if (f.speed > 1.5) { ui.toast('Trop vite', 'Freinez (<kbd>Espace</kbd>) jusqu\'à l\'arrêt.', 'bad', 1800); this.audio.error(); }
      else { this.exitJet(); return; }
    }
    // caméra : poursuite ou cockpit (C)
    const cam = this.camera;
    if (f.cockpitView) {
      cam.position.copy(COCKPIT).applyMatrix4(r.matrixWorld);
      cam.quaternion.copy(r.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, 0, 0)));
    } else {
      const tgt = r.localToWorld(new THREE.Vector3(0, 2.5, 0));
      const flat = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      const want = tgt.clone().addScaledVector(flat, -20 - Math.min(f.speed, 120) * 0.05).add(new THREE.Vector3(0, 5 - Math.sin(f.pitch) * 12, 0));
      want.y = Math.max(want.y, Math.max(heightAt(want.x, want.z), 0) + 1.5);
      if (J.cam.distanceTo(want) > 150) J.cam.copy(want); else J.cam.lerp(want, 1 - Math.exp(-5 * dt));
      cam.position.copy(J.cam);
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt.addScaledVector(f.forward(), 25));
    }
    // champ de vision : plus large en postcombustion
    const want = (this.baseFov || 72) + (boost ? 10 : 0) + Math.min(f.speed / 120, 1) * 6;
    if (Math.abs(cam.fov - want) > 0.05) { cam.fov += (want - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    const g = Math.max(heightAt(f.pos.x, f.pos.z), 0);
    const state = f.airborne ? (f.speed < JCFG.stallSpeed ? 'Décrochage ! Piquez du nez' : boost ? 'Postcombustion' : f.autopilot ? 'Pilote automatique' : 'En vol · Faucon')
      : f.braking ? 'Freinage' : f.speed >= JCFG.takeoffSpeed ? 'Vitesse de décollage : tirez !' : 'Au sol · roulage';
    ui.flight(true, { speed: f.speed, alt: f.airborne ? f.pos.y - g : 0, throttle: f.throttle, fuel: f.fuel, state, hull: 100 });
    ui.compass(this.flags.compass, f.yaw);
    this.tipKeys('jet', document.getElementById('optHints').checked ? '<kbd>Z</kbd>/<kbd>S</kbd> gaz · <kbd>Maj</kbd> postcombustion · <kbd>Q</kbd>/<kbd>D</kbd> palonnier · <kbd>Espace</kbd> frein au sol<br>Souris ou flèches : manche · <kbd>C</kbd> vue cockpit · <kbd>P</kbd> pilote auto<br><kbd>E</kbd> à l\'arrêt : descendre' : '');
    if (f.fuel < 5) f.fuel = 100;   // réservoir généreux : le Faucon n'est pas là pour tomber en panne
  },
};
