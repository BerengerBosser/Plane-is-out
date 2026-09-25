// Armes à distance : pistolet de détresse (fusées éclairantes), fusil-harpon et lance-grenades
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export const WEAPONS = {
  flare: { name: 'Pistolet de détresse', speed: 34, gravity: 9, dmg: 15, max: 12, start: 6, cooldown: 1.0, stun: 3, radius: 6, light: 9, lightTime: 20 },
  harpoon: { name: 'Fusil-harpon', speed: 62, gravity: 2.5, dmg: 60, max: 8, start: 5, cooldown: 1.3 },
  // grenade : explose au contact (ennemi ou sol) ; dégâts dégressifs jusqu'au bord du souffle
  launcher: { name: 'Lance-grenades', speed: 36, gravity: 12, dmg: 140, max: 12, cooldown: 1.2, blast: 5.5, explode: true },
};

export function createProjectiles(scene) {
  const shots = [];
  const flares = [];
  const stuck = []; // harpons plantés (à ramasser)
  const flareMat = new THREE.MeshBasicMaterial({ color: '#ff5a3d', toneMapped: false, fog: false });
  const flareGlow = new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false, fog: false });
  const harpMat = new THREE.MeshLambertMaterial({ color: '#c9ccd2', flatShading: true });
  const harpTip = new THREE.MeshLambertMaterial({ color: '#ff6b5b', flatShading: true });
  const grenMat = new THREE.MeshLambertMaterial({ color: '#4a5a32', flatShading: true });
  const grenCap = new THREE.MeshLambertMaterial({ color: '#d8a53a', flatShading: true });

  function harpoonMesh() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5).rotateX(Math.PI / 2), harpMat);
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5).rotateX(-Math.PI / 2), harpTip);
    tip.position.z = -0.75;
    g.add(tip);
    return g;
  }

  // lumières réservées d'avance : le nombre de lumières de la scène ne change jamais (pas de recompilation)
  const pool = [0, 1, 2].map(() => { const l = new THREE.PointLight('#ff7a4a', 0, 24, 1.3); scene.add(l); return { l, used: false }; });
  function burst(p, cfg) {
    const g = new THREE.Group();
    g.position.copy(p);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), flareMat));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), flareGlow);
    g.add(glow);
    scene.add(g);
    let slot = pool.find((q) => !q.used);
    if (!slot) { const old = flares.shift(); scene.remove(old.g); if (old.slot) { old.slot.used = false; old.slot.l.intensity = 0; } slot = pool.find((q) => !q.used); }
    slot.used = true;
    slot.l.position.copy(p).add(new THREE.Vector3(0, 0.8, 0));
    slot.l.distance = cfg.light * 2.6;
    flares.push({ g, glow, light: slot.l, slot, t: 0, life: cfg.lightTime, r: cfg.light });
  }

  return {
    // tire un projectile ; owner = 'local' (inflige les dégâts) ou 'remote' (visuel seulement)
    fire(kind, pos, dir, owner = 'local') {
      const cfg = WEAPONS[kind];
      let mesh;
      if (kind === 'flare') {
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), flareMat));
        mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), flareGlow));
      } else if (kind === 'launcher') {
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8).rotateX(Math.PI / 2), grenMat));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), grenCap);
        cap.position.z = -0.07; mesh.add(cap);
      } else mesh = harpoonMesh();
      mesh.position.copy(pos);
      scene.add(mesh);
      shots.push({ kind, cfg, pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(cfg.speed), life: 3, mesh, owner });
    },
    // lumières des fusées (pour la Brume et les Voilés)
    lights() { return flares.map((f) => ({ p: f.g.position, r: f.r * Math.min(1, (f.life - f.t) / 3) })); },
    stuck,
    // ramasse les harpons proches (renvoie le nombre)
    collect(p) {
      let n = 0;
      for (let i = stuck.length - 1; i >= 0; i--) {
        if (stuck[i].mesh.position.distanceTo(p) < 2.2) { scene.remove(stuck[i].mesh); stuck.splice(i, 1); n++; }
      }
      return n;
    },
    clear() {
      [...shots, ...stuck].forEach((s) => scene.remove(s.mesh));
      flares.forEach((f) => { scene.remove(f.g); f.slot.used = false; f.light.intensity = 0; });
      shots.length = 0; stuck.length = 0; flares.length = 0;
    },
    // hooks : { sweep(p0, p1) → ennemi | null, onHit(kind, e, dir), onBurst(kind, p, owner) }
    update(dt, hooks) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        const p0 = s.pos.clone();
        s.vel.y -= s.cfg.gravity * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.life -= dt;
        s.mesh.position.copy(s.pos);
        if (s.kind === 'harpoon' || s.kind === 'launcher') s.mesh.lookAt(s.pos.clone().add(s.vel));
        let done = false;
        const e = hooks.sweep(p0, s.pos);
        if (e) {
          if (s.owner === 'local' && !s.cfg.explode) hooks.onHit(s.kind, e, s.vel.clone().setY(0));
          done = true;
          if (s.kind === 'flare') { burst(s.pos, s.cfg); hooks.onBurst?.(s.kind, s.pos.clone(), s.owner); }
          if (s.cfg.explode) hooks.onBurst?.(s.kind, s.pos.clone(), s.owner);
        } else if (s.pos.y <= Math.max(heightAt(s.pos.x, s.pos.z), -0.2) || s.life <= 0) {
          done = true;
          if (s.kind === 'flare') { s.pos.y = Math.max(heightAt(s.pos.x, s.pos.z), 0) + 0.2; burst(s.pos, s.cfg); hooks.onBurst?.(s.kind, s.pos.clone(), s.owner); }
          else if (s.cfg.explode) { s.pos.y = Math.max(heightAt(s.pos.x, s.pos.z), s.pos.y, -0.2) + 0.1; hooks.onBurst?.(s.kind, s.pos.clone(), s.owner); }
          else if (s.owner === 'local' && heightAt(s.pos.x, s.pos.z) > -0.3) {
            // le harpon reste planté : on peut le récupérer
            const m = harpoonMesh();
            m.position.copy(s.pos);
            m.lookAt(s.pos.clone().add(s.vel));
            scene.add(m);
            stuck.push({ mesh: m, t: 0 });
          }
        }
        if (done) { scene.remove(s.mesh); shots.splice(i, 1); }
      }
      for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i];
        f.t += dt;
        const k = Math.max(0, Math.min(1, (f.life - f.t) / 3));
        f.light.intensity = (12 + Math.sin(f.t * 23) * 3) * k;
        f.glow.scale.setScalar((1 + Math.sin(f.t * 17) * 0.15) * (0.4 + k * 0.6));
        if (f.t >= f.life) { scene.remove(f.g); f.slot.used = false; f.light.intensity = 0; flares.splice(i, 1); }
      }
      for (let i = stuck.length - 1; i >= 0; i--) {
        stuck[i].t += dt;
        if (stuck[i].t > 60) { scene.remove(stuck[i].mesh); stuck.splice(i, 1); }
      }
    },
  };
}
