// Vol arcade du Coucou : sur l'eau, sur roues (piste), en l'air ; carburant et pilote automatique
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt, slopeAt } from './terrain.js';
import { clamp } from './noise.js';
import { WHEEL_DROP, FLOOR } from './planeModel.js';

export class Flight {
  // opts.cfg : réglages propres (sinon CFG.flight) ; opts.wheelDrop : hauteur des roues sous l'origine
  constructor(plane, camera, opts = {}) {
    this.plane = plane;
    this.camera = camera;
    this.cfg = opts.cfg || null;
    this.wheelDrop = opts.wheelDrop ?? WHEEL_DROP;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.throttle = 0; this.vy = 0;
    this.surface = 'water';   // 'water' | 'ground' | 'air'
    this.stick = { x: 0, y: 0 };
    this.cockpitView = false;
    this.camPos = new THREE.Vector3();
    this.bobT = 0;
    this.invert = false;
    this.fuel = 100;
    this.tankMax = 100;
    this.powerMul = 1;
    this.noTakeoff = false;
    this.gustT = 0;
    this.wheels = false;
    this.autopilot = false;
    this.ap = { alt: 60, yaw: 0 };
  }

  get onWater() { return this.surface === 'water'; }
  get airborne() { return this.surface === 'air'; }

  // pose l'avion à l'arrêt ; sur l'eau ou sur le sol selon le terrain
  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.throttle = 0; this.vy = 0;
    this.autopilot = false;
    const g = heightAt(x, z);
    this.surface = this.wheels && g > -0.45 ? 'ground' : 'water';
    if (this.surface === 'ground') this.pos.y = g + this.wheelDrop;
    this.stick.x = this.stick.y = 0;
    this.apply();
    this.snapCamera();
  }

  forward(yaw = this.yaw, pitch = this.pitch) {
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  apply() {
    const r = this.plane.root;
    r.position.copy(this.pos);
    r.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }

  // controls : le joueur est aux commandes (sinon, seul le pilote automatique agit)
  update(dt, input, controls = true) {
    const F = this.cfg || CFG.flight;
    const prev = this.pos.clone();
    const events = [];
    let rudder = 0, sx = 0, sy = 0;

    if (controls) {
      const up = input.down('KeyW'), down = input.down('KeyS');
      this.throttle = clamp(this.throttle + ((up ? 1 : 0) - (down ? 1 : 0)) * 0.6 * dt, 0, 1);
      rudder = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
      const kPitch = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
      const kRoll = (input.down('ArrowRight') ? 1 : 0) - (input.down('ArrowLeft') ? 1 : 0);
      const inv = this.invert ? -1 : 1;
      this.stick.x = clamp(this.stick.x + input.mdx * 0.006, -1, 1);
      this.stick.y = clamp(this.stick.y - input.mdy * 0.006 * inv, -1, 1);
      this.stick.x *= Math.exp(-2.5 * dt);
      this.stick.y *= Math.exp(-2.5 * dt);
      sx = clamp(this.stick.x + kRoll, -1, 1);
      sy = clamp(this.stick.y + kPitch * inv, -1, 1);
      if (input.hit('KeyC')) this.cockpitView = !this.cockpitView;
      if (input.hit('KeyP') && this.airborne) {
        this.autopilot = !this.autopilot;
        this.ap.alt = Math.max(this.pos.y, 50); this.ap.yaw = this.yaw;
        events.push(this.autopilot ? 'ap_on' : 'ap_off');
      }
      if (Math.abs(sx) > 0.3 || Math.abs(sy) > 0.3) {
        if (this.autopilot) { this.autopilot = false; events.push('ap_off'); }
      }
    }
    if (this.autopilot && this.airborne) {
      // tient le cap et l'altitude
      const dAlt = this.ap.alt - this.pos.y;
      const wantPitch = clamp(dAlt * 0.02, -0.25, 0.25);
      sy = clamp((wantPitch - this.pitch) * 3, -1, 1);
      let dy = this.ap.yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const wantRoll = clamp(-dy * 1.5, -0.4, 0.4);
      sx = clamp((this.roll - wantRoll) * 2, -1, 1);
      this.throttle += (0.72 - this.throttle) * Math.min(1, dt);
    }

    // carburant
    if (this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - (0.03 + this.throttle * F.fuelPerSecond) * dt);
      if (this.fuel <= 0) events.push('fuel_out');
    }
    // un avion cabossé tire moins fort (hpMul : 0,55 à 1 selon la coque)
    const thrust = this.fuel > 0 ? this.throttle * F.maxThrust * this.powerMul * (this.hpMul ?? 1) : 0;

    if (this.surface !== 'air') {
      const onGround = this.surface === 'ground';
      const drag = (onGround ? F.groundDrag ?? 0.012 : F.waterDrag) * this.speed * this.speed + (this.speed > 0.05 ? (onGround ? 0.6 : F.waterFriction) : 0);
      // frein des roues amphibies (Espace) : seulement au sol
      this.braking = controls && onGround && this.wheels && input.down('Space');
      this.speed = Math.max(0, this.speed + (thrust * (this.braking ? 0.2 : 1) - drag - (this.braking ? 9 : 0)) * dt);
      this.yaw += rudder * (0.3 + 0.4 * Math.min(this.speed / 6, 1)) * dt + (-sx) * 0.25 * dt;
      this.roll *= Math.exp(-4 * dt);
      const fw = this.forward(this.yaw, 0);
      const nx = this.pos.x + fw.x * this.speed * dt, nz = this.pos.z + fw.z * this.speed * dt;
      const gAhead = heightAt(nx, nz);
      if (!onGround) {
        if (gAhead > -0.45) {
          if (this.wheels) { this.surface = 'ground'; events.push('on_ground'); }
          else { if (this.speed > 4) events.push('beach'); this.speed = 0; }
        }
        if (this.surface === 'water') {
          this.pos.x = nx; this.pos.z = nz;
          this.bobT += dt;
          this.pos.y = Math.sin(this.bobT * 1.7) * 0.05;
          this.pitch += (Math.min(0.07, this.speed / 220) - this.pitch) * Math.min(1, dt * 3);
        }
      }
      if (this.surface === 'ground') {
        const s = slopeAt(nx, nz);
        if (gAhead < -0.45) { this.surface = 'water'; this.pos.x = nx; this.pos.z = nz; events.push('on_water'); }
        else if (s.s > 0.32) { if (this.speed > 3) events.push('rough'); this.speed = 0; }
        else { this.pos.x = nx; this.pos.z = nz; }
        if (this.surface === 'ground') {
          this.pos.y = heightAt(this.pos.x, this.pos.z) + this.wheelDrop;
          // assiette selon la pente
          const ahead = heightAt(this.pos.x + fw.x * 2, this.pos.z + fw.z * 2);
          const back = heightAt(this.pos.x - fw.x * 2, this.pos.z - fw.z * 2);
          const want = Math.atan2(ahead - back, 4) + Math.min(0.05, this.speed / 300);
          this.pitch += (want - this.pitch) * Math.min(1, dt * 5);
        }
      }
      this.gustT -= dt;
      if (this.noTakeoff && this.speed >= F.takeoffSpeed * 0.8) {
        // tempête : les rafales plaquent l'avion au sol
        this.speed = F.takeoffSpeed * 0.75;
        this.yaw += (Math.random() - 0.5) * 0.4 * dt;
        if (this.gustT <= 0) { this.gustT = 4; events.push('gusts'); }
      }
      if (this.speed >= F.takeoffSpeed && sy > 0.15 && !this.noTakeoff) {
        this.surface = 'air';
        this.pitch = 0.12;
        this.pos.y += 0.3;
        events.push('takeoff');
      }
    } else {
      const eff = clamp(this.speed / (F.effSpeed ?? 22), 0.25, 1);
      this.pitch = clamp(this.pitch + sy * F.pitchRate * eff * dt, -F.maxPitch, F.maxPitch);
      this.roll = clamp(this.roll - sx * F.rollRate * dt, -F.maxRoll, F.maxRoll);
      if (Math.abs(sx) < 0.05) this.roll *= Math.exp(-0.9 * dt);
      // orage : turbulences (secousses de roulis et de tangage)
      if (this.turb > 0.05) {
        this.roll = clamp(this.roll + (Math.random() - 0.5) * this.turb * 1.6 * dt + Math.sin(performance.now() * 0.0021) * this.turb * 0.25 * dt, -F.maxRoll, F.maxRoll);
        this.pitch = clamp(this.pitch + (Math.random() - 0.5) * this.turb * 0.9 * dt, -F.maxPitch, F.maxPitch);
      }
      this.yaw += Math.sin(this.roll) * F.bankTurn * Math.min(1, this.speed / 20) * dt + rudder * F.rudderRate * dt;
      if (Math.abs(sy) < 0.05 && !this.autopilot) this.pitch *= Math.exp(-0.35 * dt);
      const grav = 9.8 * Math.sin(this.pitch) * (this.pitch > 0 ? 1.25 : 0.9);
      const acc = thrust - F.airDrag * this.speed * this.speed - grav;
      this.speed = Math.max(3, this.speed + acc * dt);
      let sink = 0;
      if (this.speed < F.stallSpeed) {
        sink = (F.stallSpeed - this.speed) * 1.5;
        this.pitch -= (F.stallSpeed - this.speed) * 0.06 * dt;
      }
      const fw = this.forward();
      this.pos.addScaledVector(fw, this.speed * dt);
      this.pos.y -= sink * dt;
      this.vy = fw.y * this.speed - sink;

      const g = heightAt(this.pos.x, this.pos.z);
      const gentle = Math.abs(this.roll) < 0.4 && this.pitch > -0.25 && this.pitch < 0.4 && this.vy > -(F.sinkMax ?? 7.5) && this.speed < (F.gentleMax ?? 42);
      if (g > -0.6) {
        const bottom = this.wheels ? g + this.wheelDrop : g + 0.8;
        if (this.pos.y < bottom) {
          if (this.wheels && gentle && slopeAt(this.pos.x, this.pos.z).s < 0.12) {
            this.surface = 'ground'; this.pos.y = bottom; this.roll = 0; this.autopilot = false;
            this.speed = Math.min(this.speed, F.landClamp ?? 18);
            events.push('landed_ground');
          } else events.push('crash');
        }
      } else if (this.pos.y <= 0) {
        if (gentle) {
          this.surface = 'water'; this.pos.y = 0; this.pitch = 0.05; this.roll = 0; this.autopilot = false;
          this.speed = Math.min(this.speed, 16);
          events.push('landed');
        } else events.push('crash');
      }
      if (this.pos.y > 400) this.pos.y = 400;
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > F.worldLimit) {
        const toC = Math.atan2(this.pos.x, this.pos.z);
        let diff = toC - this.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.yaw += clamp(diff, -1, 1) * 0.6 * dt;
        events.push('limit');
      }
    }

    this.apply();
    const spin = (thrust > 0 ? this.throttle * 40 + 4 : 0) * dt;
    this.plane.spinners.forEach((s) => { s.rotation.z += spin; });
    // obstacles (arbres, bâtiments, rochers) : choc léger au roulage, crash en vol ou à pleine vitesse
    if (this.hitTest && this.speed > 0.5 && this.hitTest(this.pos, this.yaw)) {
      this.impactSpeed = this.speed;
      if (this.surface !== 'air' && this.speed < 7) { this.pos.copy(prev); this.speed = 0; events.push('bump'); }
      else events.push('crash');
    }
    return events;
  }

  snapCamera() { this.updateCamera(1, true); }

  // caméra de poursuite, ou vue depuis le siège pilote
  updateCamera(dt, snap = false) {
    const cam = this.camera;
    if (this.cockpitView) {
      const p = new THREE.Vector3(-0.62, FLOOR + 1.25, -3.45);
      this.plane.root.updateWorldMatrix(true, false);
      this.plane.root.localToWorld(p);
      cam.position.copy(p);
      cam.quaternion.copy(this.plane.root.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)));
      return;
    }
    const flatFw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const want = this.pos.clone().addScaledVector(flatFw, -26).add(new THREE.Vector3(0, 9 - Math.sin(this.pitch) * 8, 0));
    const minY = Math.max(heightAt(want.x, want.z), 0) + 1.5;
    if (want.y < minY) want.y = minY;
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-4 * dt));
    cam.position.copy(this.camPos);
    // les murs (hangars, terminal) rapprochent la caméra au lieu d'être traversés
    this.camClip?.(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), cam.position, dt);
    const look =this.pos.clone().addScaledVector(this.forward(), 10).add(new THREE.Vector3(0, 3.2, 0));
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
  }
}
