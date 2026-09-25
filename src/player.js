// Contrôles clavier/souris et déplacement du joueur à pied
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt } from './terrain.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // appuis de cette image
    this.mdx = 0; this.mdy = 0;
    this.locked = false;
    this.dragMode = false;       // repli si le verrouillage de la souris est refusé
    this.dragging = false;
    this.enabled = true;
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (['Tab', 'Space', 'F1', 'F2', 'F3', 'F4', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragMode && this.dragging)) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      if (e.button === 0) { this.pressed.add('Mouse0'); this.keys.add('MouseL'); }
      if (e.button === 2) { this.pressed.add('Mouse2'); this.keys.add('MouseR'); }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.locked) this.pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp'); }, { passive: true });
    addEventListener('mouseup', (e) => { this.dragging = false; if (e.button === 0) this.keys.delete('MouseL'); if (e.button === 2) this.keys.delete('MouseR'); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
    // un refus isolé (clic trop rapide après Échap, page sans focus…) n'est pas définitif :
    // on ne passe en mode « glisser » qu'après plusieurs refus consécutifs suivant un vrai clic
    this.lockFails = 0;
    document.addEventListener('pointerlockerror', () => this.lockFailed());
  }
  lockFailed() {
    this.lockFails++;
    if (this.lockFails >= 3) this.dragMode = true;
    this.onLockFail?.();
  }
  lock() {
    if (this.locked) return;
    if (this.dragMode) { this.onLockChange?.(true, true); return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.then) p.then(() => { this.lockFails = 0; }, () => this.lockFailed());
    } catch { this.lockFailed(); }
  }
  // déverrouillage voulu par le jeu (menu, fin de mission…) : ne doit pas ouvrir la pause
  unlock() { if (document.pointerLockElement) { this.expectUnlock = true; document.exitPointerLock(); } }
  get active() { return this.locked || this.dragMode; }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; }
}

const WORLD_ENV = {
  height: (x, z) => heightAt(x, z),
  canGo: (x, z) => heightAt(x, z) > CFG.player.maxWadeDepth,
  frame: null,
};

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.velY = 0;
    this.onGround = true;
    this.bob = 0;
    this.sens = 1;       // multiplicateur de sensibilité (réglages)
    this.shake = 0;      // secousse de caméra (coups reçus)
    this.crouch = 0;     // 0 debout … 1 accroupi (lissé)
  }
  height() { return 1.75 - 0.75 * this.crouch; }
  place(x, z, yaw = 0) {
    this.pos.set(x, heightAt(x, z), z);
    this.yaw = yaw; this.pitch = 0; this.velY = 0;
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  // env : { height(x, z, y), canGo(x, z, y), frame: Object3D|null (repère local, ex. l'avion) }
  update(dt, input, colliders, mods, env = WORLD_ENV) {
    const P = CFG.player;
    // regard
    this.yaw -= input.mdx * P.mouseSensitivity * this.sens;
    this.pitch -= input.mdy * P.mouseSensitivity * this.sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // déplacement souhaité
    let f = 0, s = 0;
    if (mods.canMove) {
      if (input.down('KeyW', 'ArrowUp')) f += 1;
      if (input.down('KeyS', 'ArrowDown')) f -= 1;
      if (input.down('KeyD', 'ArrowRight')) s += 1;
      if (input.down('KeyA', 'ArrowLeft')) s -= 1;
    }
    // accroupi (C ou Ctrl) : plus lent, plus bas ; on reste accroupi tant qu'un plafond bas est au-dessus
    let wantCrouch = mods.canMove && input.down('KeyC') && !env.frame;
    if (!wantCrouch && this.crouch > 0.3 && this.headBlocked(colliders)) wantCrouch = true;
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    const sprint = input.down('ShiftLeft', 'ShiftRight') && mods.canSprint && f > 0 && this.crouch < 0.3;
    let speed = (sprint ? P.sprintSpeed : P.walkSpeed) * mods.speedMul * (1 - 0.5 * this.crouch);
    if (env.frame) speed *= 0.55; // on marche doucement dans la cabine
    const here = env.height(this.pos.x, this.pos.z, this.pos.y);
    if (here < -0.05) speed *= P.shallowWaterSlow;

    const fw = this.forward();
    const rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const wish = fw.multiplyScalar(f).add(rt.multiplyScalar(s));
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);

    // échelle : avancer = monter, reculer = descendre, Espace = lâcher
    const lad = env.ladder?.(this.pos.x, this.pos.z, this.pos.y);
    if (lad && !this.offLadder) {
      const fwd = this.forward(), facing = fwd.x * lad.dir.x + fwd.z * lad.dir.z;
      const climb = f !== 0 ? f * (facing < -0.2 ? -1 : 1) : 0;
      if (this.onLadder || climb > 0 || (climb < 0 && this.pos.y > lad.y0 + 0.5)) {
        this.onLadder = true;
        this.pos.y += climb * 2.6 * dt;
        this.pos.x += (lad.x - this.pos.x) * Math.min(1, dt * 8); this.pos.z += (lad.z - this.pos.z) * Math.min(1, dt * 8);
        this.velY = 0; this.onGround = true;
        if (this.pos.y >= lad.y1 - 0.05) {
          if (lad.onTop) {
            // échelle d'un véhicule/avion : en haut, on entre (sinon on reste accroché)
            if (lad.onTop()) { this.onLadder = false; return { moving: false, sprint: false, ladder: true }; }
            this.pos.y = lad.y1 - 0.4;
          } else { this.pos.copy(lad.top); this.onLadder = false; }
        }
        const gnd = env.height(this.pos.x, this.pos.z, this.pos.y);
        if (this.pos.y <= gnd) { this.pos.y = gnd; this.onLadder = false; }
        if (input.hit('Space')) { this.onLadder = false; this.offLadder = 0.4; }
        this.bob += climb ? dt * 6 : 0;
        this.applyCamera(dt, false, env.frame);
        return { moving: climb !== 0, sprint: false, ladder: true };
      }
    } else this.onLadder = false;
    if (this.offLadder) this.offLadder = Math.max(0, this.offLadder - dt) || false;

    // zones interdites (eau profonde, murs de la cabine) : on bloque chaque axe séparément
    const nx = this.pos.x + wish.x;
    if (env.canGo(nx, this.pos.z, this.pos.y)) this.pos.x = nx;
    const nz = this.pos.z + wish.z;
    if (env.canGo(this.pos.x, nz, this.pos.y)) this.pos.z = nz;

    this.resolve(colliders);

    // vertical
    const ground = env.height(this.pos.x, this.pos.z, this.pos.y);
    if (this.onGround && input.hit('Space') && mods.canJump && this.crouch < 0.5) { this.velY = P.jumpSpeed * (env.frame ? 0.6 : 1); this.onGround = false; }
    this.velY -= P.gravity * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= ground || (this.onGround && this.pos.y - ground < 0.45 && this.velY <= 0)) {
      if (!this.onGround && this.velY < 0) this.landSpeed = -this.velY;   // vitesse d'impact (dégâts de chute)
      this.pos.y = ground; this.velY = 0; this.onGround = true;
    } else this.onGround = false;

    const moving = wish.lengthSq() > 0 && this.onGround;
    this.bob += moving ? dt * (sprint ? 11 : 7.5) : 0;
    this.applyCamera(dt, moving, env.frame);
    return { moving, sprint };
  }

  // place la caméra (monde ou repère local de l'avion)
  applyCamera(dt, moving, frame, eyeOverride) {
    const P = CFG.player;
    const bobY = moving ? Math.sin(this.bob) * 0.04 : 0;
    const eye = eyeOverride ?? (P.eyeHeight - 0.72 * this.crouch);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.12;
    const local = new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + eye + bobY + (Math.random() - 0.5) * sh, this.pos.z);
    const rot = new THREE.Euler(this.pitch, this.yaw, (Math.random() - 0.5) * sh * 0.5 + Math.sin(this.bob * 0.5) * (moving ? 0.004 : 0), 'YXZ');
    if (frame) {
      frame.updateMatrixWorld(true);
      this.camera.position.copy(frame.localToWorld(local));
      this.camera.quaternion.copy(frame.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromEuler(rot));
    } else {
      local.y = Math.max(local.y, 0.35);
      this.camera.position.copy(local);
      this.camera.quaternion.setFromEuler(rot);
    }
  }

  // un obstacle juste au-dessus de la tête empêche de se relever
  headBlocked(colliders) {
    const r = (this.radius ?? CFG.player.radius) * 0.8, y = this.pos.y;
    for (const c of colliders) {
      if (c.disabled || c.bottom === undefined || c.type === 'circle') continue;
      if (c.bottom < y + 1.0 || c.bottom > y + 1.8) continue;
      if (this.pos.x > c.minX - r && this.pos.x < c.maxX + r && this.pos.z > c.minZ - r && this.pos.z < c.maxZ + r) return true;
    }
    return false;
  }

  resolve(colliders) {
    const r = this.radius ?? CFG.player.radius;
    for (const c of colliders) {
      if (c.disabled) continue;
      if ((c.minY !== undefined && this.pos.y < c.minY) || (c.maxY !== undefined && this.pos.y > c.maxY)) continue;
      if (c.bottom !== undefined && this.pos.y + this.height() < c.bottom) continue; // on passe dessous
      if (c.type === 'circle') {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-4) { this.pos.x = c.x + (dx / d) * m; this.pos.z = c.z + (dz / d) * m; }
      } else {
        const cx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
        const dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-4) { this.pos.x = cx + (dx / d) * r; this.pos.z = cz + (dz / d) * r; }
          else {
            // centre dans la boîte : sortie par le côté le plus proche
            const opts = [[c.minX - r - this.pos.x, 0], [c.maxX + r - this.pos.x, 0], [0, c.minZ - r - this.pos.z], [0, c.maxZ + r - this.pos.z]];
            opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            this.pos.x += opts[0][0]; this.pos.z += opts[0][1];
          }
        }
      }
    }
  }
}
