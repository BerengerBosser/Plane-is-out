// Pêche (esprit How to Fish) : lancer, attendre la touche, ferrer, mouliner sans casser la ligne,
// puis ACHEVER le poisson qui frétille au sol (un coup en plein saut rapporte double).
// La pêche se revend en coquillages au comptoir, ou se grille au feu pour se soigner.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { CFG } from './config.js';

export const FISH = {
  sardine: { name: 'Sardine', value: 2, str: 0.6, w: 30, col: '#9fb8c8', size: 0.28 },
  maquereau: { name: 'Maquereau', value: 4, str: 0.9, w: 24, col: '#4f8a9a', size: 0.38 },
  dorade: { name: 'Dorade', value: 7, str: 1.2, w: 16, col: '#d8c070', size: 0.42, deep: 1 },
  merou: { name: 'Mérou', value: 12, str: 1.6, w: 8, col: '#8a5a3a', size: 0.62, deep: 2 },
  thon: { name: 'Thon', value: 20, str: 2.2, w: 4, col: '#3a4f8a', size: 0.95, deep: 3 },
  lanterne: { name: 'Poisson-lanterne', value: 30, str: 1.8, w: 0, col: '#7df9ff', size: 0.5, night: 1 },
  botte: { name: 'Vieille botte', value: 0, str: 0.3, w: 6, col: '#4a3d33', size: 0.35, junk: 1 },
};

function buildFish(def) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: def.col, flatShading: true, emissive: def.night ? '#1a8a9a' : '#000' });
  if (def.junk) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.14), mat).translateY(0.15));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), mat).translateZ(-0.08).translateY(0.05));
  } else {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
    body.scale.set(0.35, 0.55, 1);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 4), mat);
    tail.rotation.x = Math.PI / 2; tail.position.z = 0.62;
    g.add(tail);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#111' }));
    eye.position.set(0.14, 0.08, -0.3); g.add(eye);
    const eye2 = eye.clone(); eye2.position.x = -0.14; g.add(eye2);
  }
  g.scale.setScalar(def.size * 1.3);
  return g;
}

export const FishingMixin = {
  fishingInit() {
    this.fish = {};
    this.fishState = null;           // null | 'cast' | 'wait' | 'bite' | 'reel'
    this.bobber = new THREE.Group();
    const bm = new THREE.MeshLambertMaterial({ color: '#ff5a4d' }), wm = new THREE.MeshLambertMaterial({ color: '#fff4e0' });
    this.bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), bm));
    this.bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wm));
    this.bobber.visible = false;
    this.scene.add(this.bobber);
    this.fishLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.8 }));
    this.fishLine.visible = false;
    this.scene.add(this.fishLine);
    this.flops = [];                 // poissons qui frétillent au sol
    // interface : tension et progression
    const hud = document.createElement('div');
    hud.id = 'fishHud';
    hud.className = 'hidden';
    hud.innerHTML = '<b id="fishName">Ça mord !</b><div class="fbar"><i id="fishTension"></i><span>tension</span></div><div class="fbar prog"><i id="fishProg"></i><span>moulinet</span></div><small id="fishTip"></small>';
    document.getElementById('hud').appendChild(hud);
  },
  resetFishing() {
    this.fish = {};
    this.stopFishing();
    for (const f of this.flops) this.scene.remove(f.mesh);
    this.flops = [];
  },
  fishCount() { return Object.values(this.fish).reduce((a, b) => a + b, 0); },
  fishValue() { return Object.entries(this.fish).reduce((a, [k, n]) => a + FISH[k].value * n, 0); },

  stopFishing() {
    this.fishState = null;
    this.bobber.visible = false;
    this.fishLine.visible = false;
    document.getElementById('fishHud')?.classList.add('hidden');
  },
  rodTip() {
    const fw = new THREE.Vector3(); this.camera.getWorldDirection(fw);
    const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
    return this.camera.position.clone().addScaledVector(fw, 1.6).addScaledVector(right, 0.35).add(new THREE.Vector3(0, 0.55, 0));
  },
  pickFish(depth) {
    const night = this.isNight();
    const pool = Object.entries(FISH).map(([k, d]) => {
      let w = d.w;
      if (d.deep) w *= depth > 2 + d.deep * 2 ? 1.6 : 0.4;
      if (d.night) w = night ? 6 : 0;
      return [k, w];
    });
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
    return 'sardine';
  },

  // appelée chaque image à pied ; renvoie vrai si le clic sert à la pêche
  updateFishing(dt) {
    this.updateFlops(dt);
    const hud = document.getElementById('fishHud');
    if (this.slot !== 6 || !this.own.rod || this.aboard || this.carrying || this.mode !== 'explore') {
      if (this.fishState) { this.stopFishing(); }
      return false;
    }
    const inp = this.input;
    const tip = this.rodTip();
    if (this.fishState) { this.fishLine.visible = true; this.setCable(this.fishLine, tip, this.bobber.position); }
    // lancer
    if (!this.fishState) {
      if (!inp.hit('Mouse0')) return true;
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      // portée selon l'inclinaison (8 à 26 m) ; si l'on vise la plage, le bouchon file jusqu'à la première eau assez profonde
      let dist = 8 + Math.max(0, Math.min(1, dir.y + 0.5)) * 18;
      const me0 = this.playerWorld();
      let p = me0.clone().addScaledVector(flat, dist);
      for (let d = dist; d <= 30 && (heightAt(p.x, p.z) > -0.4 || this.onAnyPlatform(p.x, p.z)); d += 1) { dist = d; p = me0.clone().addScaledVector(flat, d); }
      if (heightAt(p.x, p.z) > -0.4 || this.onAnyPlatform(p.x, p.z)) { this.audio.error(); this.ui.toast('Visez l\'eau', 'Lancez depuis la plage, un ponton ou un rocher, vers l\'eau.', 'bad', 1800); return true; }
      this.fishState = 'cast';
      this.castT = 0;
      this.castFrom = tip.clone(); this.castTo = new THREE.Vector3(p.x, 0.05, p.z);
      this.bobber.visible = true;
      this.audio.whoosh();
      return true;
    }
    if (this.fishState === 'cast') {
      this.castT += dt / 0.7;
      const k = Math.min(1, this.castT);
      this.bobber.position.lerpVectors(this.castFrom, this.castTo, k);
      this.bobber.position.y += Math.sin(k * Math.PI) * 3;
      if (k >= 1) { this.fishState = 'wait'; this.biteT = 2.5 + Math.random() * 6.5; this.audio.splash(); }
      return true;
    }
    // récupérer la ligne à tout moment (clic pendant l'attente)
    if (this.fishState === 'wait') {
      this.biteT -= dt;
      this.bobber.position.y = 0.05 + Math.sin(this.t * 2.2) * 0.03;
      if (inp.hit('Mouse0')) { this.stopFishing(); this.ui.prompt(''); return true; }
      if (this.biteT <= 0) {
        this.fishState = 'bite'; this.biteWin = 1.1;
        this.fishKind = this.pickFish(-heightAt(this.bobber.position.x, this.bobber.position.z));
        this.audio.splash(); this.audio.note(660);
      }
      this.ui.prompt('En attente d\'une touche… <kbd>Clic</kbd> relever la ligne');
      return true;
    }
    if (this.fishState === 'bite') {
      this.biteWin -= dt;
      this.bobber.position.y = -0.18 + Math.sin(this.t * 30) * 0.05;
      this.ui.prompt('<b>ÇA MORD !</b> <kbd>Clic</kbd> pour ferrer');
      if (inp.hit('Mouse0')) {
        this.fishState = 'reel';
        this.tension = 20; this.reelProg = 0; this.surgeT = 1 + Math.random() * 2; this.surge = 0;
        hud.classList.remove('hidden');
        document.getElementById('fishName').textContent = 'Un poisson se débat !';
        this.audio.success();
      } else if (this.biteWin <= 0) {
        this.fishState = 'wait'; this.biteT = 2 + Math.random() * 5;
        this.ui.toast('Trop tard', 'Le poisson a filé avec l\'appât. Attendez la prochaine touche.', 'bad', 1500);
      }
      return true;
    }
    if (this.fishState === 'reel') {
      const F = FISH[this.fishKind];
      const holding = inp.down('MouseL');
      const helped = this.mateList().some((m) => m.fishHelp && m.pos.distanceTo(this.playerWorld()) < 3.5);
      this.surgeT -= dt;
      if (this.surgeT <= 0) { this.surge = this.surge ? 0 : 1; this.surgeT = this.surge ? 0.6 + Math.random() * 0.8 : 1.2 + Math.random() * 2; }
      const rise = (holding ? 22 + 30 * F.str * (this.surge ? 1.8 : 0.6) : -35) * (helped ? 0.6 : 1);
      this.tension = Math.max(0, this.tension + rise * dt);
      if (holding) this.reelProg = Math.min(100, this.reelProg + dt * (24 / (0.6 + F.str * 0.5)) * (this.surge ? 0.4 : 1));
      else this.reelProg = Math.max(0, this.reelProg - dt * 4 * F.str);
      // le bouchon revient vers le pêcheur
      const me = this.playerWorld();
      const k = this.reelProg / 100;
      this.bobber.position.set(this.castTo.x + (me.x - this.castTo.x) * k * 0.8, -0.1 + Math.sin(this.t * 18) * 0.06 * (1 + this.surge), this.castTo.z + (me.z - this.castTo.z) * k * 0.8);
      document.getElementById('fishTension').style.width = `${Math.min(100, this.tension)}%`;
      document.getElementById('fishTension').classList.toggle('hot', this.tension > 75);
      document.getElementById('fishProg').style.width = `${this.reelProg}%`;
      document.getElementById('fishTip').textContent = this.surge ? 'Il tire fort : relâchez !' : holding ? 'Moulinez…' : 'Clic maintenu pour mouliner';
      if (this.surge && Math.random() < dt * 8) this.audio.ratchet();
      this.ui.prompt('');
      if (this.tension >= 100) {
        this.stopFishing();
        this.audio.error();
        this.ui.toast('La ligne a cassé !', 'Relâchez quand le poisson tire (jauge rouge).', 'bad', 3000);
      } else if (this.reelProg >= 100) {
        this.stopFishing();
        this.landFish(this.fishKind);
      }
      return true;
    }
    return true;
  },

  // le poisson atterrit près du pêcheur et frétille : il faut l'achever
  landFish(kind) {
    const F = FISH[kind];
    const me = this.playerWorld();
    const yaw = this.playerYawWorld();
    let x = me.x - Math.sin(yaw) * 1.6, z = me.z - Math.cos(yaw) * 1.6;
    if (this.groundAt(x, z, me.y + 1) < -0.3) { x = me.x + (Math.random() - 0.5); z = me.z + (Math.random() - 0.5); }
    const mesh = buildFish(F);
    mesh.position.set(x, this.groundAt(x, z, me.y + 1) + 0.2, z);
    this.scene.add(mesh);
    this.audio.splash();
    if (F.junk) {
      this.ui.toast('Une vieille botte…', 'Ça ne se vend pas. Mais ça fait rire l\'équipage.', '', 2500);
      setTimeout(() => this.scene.remove(mesh), 4000);
      return;
    }
    this.flops.push({ kind, mesh, x, z, t: 0, vy: 3, y: 0, life: 12 });
    this.ui.toast(`${F.name} !`, 'Il frétille : achevez-le (poing, clé ou tir). En plein saut, il vaut double !', 'good', 3500);
  },
  updateFlops(dt) {
    for (let i = this.flops.length - 1; i >= 0; i--) {
      const f = this.flops[i];
      f.t += dt; f.life -= dt;
      f.vy -= 14 * dt; f.y += f.vy * dt;
      if (f.y <= 0) { f.y = 0; f.vy = 3 + Math.random() * 3; f.x += (Math.random() - 0.5) * 0.6; f.z += (Math.random() - 0.5) * 0.6; }
      const g = this.groundAt(f.x, f.z, 99);
      f.mesh.position.set(f.x, Math.max(g, 0) + 0.15 + f.y, f.z);
      f.mesh.rotation.set(Math.sin(f.t * 17) * 0.8, f.t * 3, Math.PI / 2 + Math.sin(f.t * 11) * 0.5);
      if (f.life <= 0 || g < -0.6) {
        this.scene.remove(f.mesh); this.flops.splice(i, 1);
        this.ui.toast('Il s\'est échappé !', 'Il a rejoint l\'eau en frétillant.', 'bad', 2000);
        this.audio.splash();
      }
    }
  },
  // coup porté (mêlée : range courte ; tir : rayon) — renvoie vrai si un poisson est achevé
  tryHitFish(range, ray) {
    if (!this.flops.length) return false;
    const eye = this.camera.position, dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    for (let i = 0; i < this.flops.length; i++) {
      const f = this.flops[i];
      const to = f.mesh.position.clone().sub(eye);
      const d = to.length();
      if (d > range) continue;
      if (to.normalize().dot(dir) < (ray ? 0.985 : 0.75)) continue;
      const trick = f.y > 0.4;
      this.scene.remove(f.mesh); this.flops.splice(i, 1);
      const n = trick ? 2 : 1;
      this.fish[f.kind] = (this.fish[f.kind] || 0) + n;
      this.audio.hitFlesh();
      this.ui.toast(trick ? 'Coup de maître !' : `${FISH[f.kind].name} dans la bourriche`, trick ? 'Achevé en plein saut : il compte double.' : `${this.fishCount()} poissons · ${this.fishValue()} 🐚 au comptoir`, 'good', 2500);
      this.progress();
      return true;
    }
    return false;
  },

  // vente et grillade
  sellFish() {
    const v = this.fishValue(), n = this.fishCount();
    if (!n) return false;
    this.fish = {};
    this.act('scrap', { n: v });
    this.audio.success();
    this.ui.toast('Pêche vendue', `${n} poissons · +${v} 🐚`, 'good');
    return true;
  },
  grillFish() {
    const k = Object.keys(this.fish).filter((q) => this.fish[q] > 0).sort((a, b) => FISH[a].value - FISH[b].value)[0];
    if (!k) { this.ui.toast('Rien à griller', 'Pêchez d\'abord quelque chose (canne à pêche, touche 7).', 'bad'); return; }
    this.fish[k]--;
    this.hp = Math.min(CFG.player.health, this.hp + 40);
    this.stamina = CFG.player.stamina;
    this.audio.powerUp();
    this.ui.toast(`${FISH[k].name} grillé(e)`, '+40 santé. Ça sent bon le feu de bois.', 'good');
  },
};
