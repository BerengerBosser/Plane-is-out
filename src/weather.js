// Météo : ciel couvert, nuages d'orage, pluie, éclairs et tonnerre.
// L'hôte tire la météo au sort (clear, cloudy, rain, storm) ; les invités suivent. Les éclairs sont cosmétiques (tirés localement).
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt } from './terrain.js';
import { rng } from './noise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WX_KINDS = ['clear', 'cloudy', 'rain', 'storm'];
// cible de chaque temps : couverture nuageuse, pluie, orage (éclairs, rafales)
const TARGET = {
  clear: { over: 0, rain: 0, storm: 0 },
  cloudy: { over: 0.55, rain: 0, storm: 0 },
  rain: { over: 0.8, rain: 0.6, storm: 0 },
  storm: { over: 1, rain: 1, storm: 1 },
};
export const WX_LABEL = { clear: 'Beau temps', cloudy: 'Nuageux', rain: 'Pluie', storm: 'Orage' };
export const WX_ICON = { clear: '☀', cloudy: '☁', rain: '🌧', storm: '⛈' };

const DROPS = 2600, BOX = 34, TOP = 22;

export function createWeather(scene, audio) {
  const cur = { over: 0, rain: 0, storm: 0 };
  let kind = 'clear';
  let flash = 0, flashQ = [], boltT = 0, nextStrike = 4;

  // ── pluie : segments qui tombent dans une boîte centrée sur la caméra ──
  const pos = new Float32Array(DROPS * 6);
  const seed = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i++) { seed[i * 3] = (Math.random() * 2 - 1) * BOX; seed[i * 3 + 1] = Math.random() * TOP * 2; seed[i * 3 + 2] = (Math.random() * 2 - 1) * BOX; }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: '#b9c6d6', transparent: true, opacity: 0.5, fog: false, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  // ── nuages d'orage : plafond bas qui suit la caméra ──
  // Chaque amas est un seul maillage de boules bosselées, ombré à la facette (ventre sombre, sommet éclairé) ;
  // la teinte suit l'heure et les éclairs (shade), et chaque amas s'efface au bord de la zone au lieu de sauter.
  // Sous le plafond, une couche de lambeaux plus sombres file avec les rafales quand l'orage gronde.
  const storm = new THREE.Group();
  const r = rng(911);
  const bump = (x, y, z) => Math.sin(x * 0.21 + y * 0.13) * Math.sin(z * 0.17 - x * 0.07) + 0.5 * Math.sin(y * 0.31 + z * 0.23);
  function cloudGeo(n, radA, radB, flat, spread) {
    const parts = [], mid = Math.floor(n / 2);
    for (let k = 0; k < n; k++) {
      const rad = (k === mid ? radB : radA) + r() * radA * 0.5;
      const g = new THREE.IcosahedronGeometry(rad, 1);
      const p = g.attributes.position;
      // bosses : déplacement fonction de la position (les sommets partagés restent soudés)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
        const s = 1 + 0.16 * bump(x + k * 7, y, z);
        p.setXYZ(i, x / l * rad * s, y / l * rad * s, z / l * rad * s);
      }
      g.scale(1, flat * (k === mid ? 1.25 : 1), 1);
      g.translate((k - n / 2) * spread + r() * spread * 0.35, (k === mid ? rad * 0.25 : 0) + r() * 6, r() * spread - spread / 2);
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    // une nuance par facette : dessous sombre, dessus clair, un peu de bruit
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    geo.computeBoundingBox();
    const y0 = geo.boundingBox.min.y, hy = Math.max(1, geo.boundingBox.max.y - y0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      nrm.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const h = ((a.y + b.y + c.y) / 3 - y0) / hy;
      const v = THREE.MathUtils.clamp(0.56 + 0.24 * nrm.y + 0.26 * h + 0.07 * (nrm.x * 0.6 - nrm.z * 0.4) + (r() - 0.5) * 0.06, 0.3, 1.1);
      for (let j = 0; j < 3; j++) col.set([v, v, v * 1.03], (i + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  function addLayer(count, opts) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
      const m = new THREE.Mesh(cloudGeo(opts.n + Math.floor(r() * 4), opts.radA, opts.radB, opts.flat, opts.spread), mat);
      m.position.set((r() * 2 - 1) * 750, opts.y + r() * opts.dy, (r() * 2 - 1) * 750);
      m.rotation.y = r() * 6;
      m.userData = { wx: m.position.x, wz: m.position.z, low: opts.low, speed: 0.7 + r() * 0.6 };
      storm.add(m);
    }
  }
  addLayer(44, { n: 5, radA: 22, radB: 40, flat: 0.5, spread: 30, y: 150, dy: 70, low: false });
  addLayer(18, { n: 3, radA: 11, radB: 18, flat: 0.38, spread: 20, y: 78, dy: 36, low: true });
  storm.visible = false;
  scene.add(storm);
  const tint = new THREE.Color(), tintLow = new THREE.Color();
  const C_CLOUDY = new THREE.Color('#c9ced6'), C_STORM = new THREE.Color('#7b838e'), C_FLASH = new THREE.Color('#e4eaff'), haze = new THREE.Color();

  // ── éclair : ligne brisée en fines poutres lumineuses ──
  const boltMat = new THREE.MeshBasicMaterial({ color: '#eef3ff', fog: false, transparent: true, opacity: 1, depthWrite: false });
  const boltGroup = new THREE.Group();
  scene.add(boltGroup);
  const boltLight = new THREE.PointLight('#cfdcff', 0, 260, 1.2);
  scene.add(boltLight);
  const seg = new THREE.BoxGeometry(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  function beam(a, b, w) {
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Mesh(seg, boltMat);
    m.scale.set(w, len, w);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    boltGroup.add(m);
  }
  function zigzag(from, to, n, jit, w, branches) {
    const pts = [from.clone()];
    for (let i = 1; i < n; i++) {
      const p = from.clone().lerp(to, i / n);
      p.x += (Math.random() * 2 - 1) * jit; p.z += (Math.random() * 2 - 1) * jit;
      pts.push(p);
    }
    pts.push(to.clone());
    for (let i = 0; i < pts.length - 1; i++) {
      beam(pts[i], pts[i + 1], w);
      if (branches && Math.random() < 0.3 && i > 1) {
        const end = pts[i].clone().add(new THREE.Vector3((Math.random() * 2 - 1) * 30, -15 - Math.random() * 25, (Math.random() * 2 - 1) * 30));
        zigzag(pts[i], end, 4, jit * 0.6, w * 0.5, false);
      }
    }
  }

  // foudre : frappe un point (optionnel) près de la caméra ; `hit` = on vise un objet précis (l'avion)
  function strike(camPos, target = null, hit = false) {
    let to;
    if (target) to = target.clone();
    else {
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 420;
      const x = camPos.x + Math.cos(a) * d, z = camPos.z + Math.sin(a) * d;
      to = new THREE.Vector3(x, Math.max(0, heightAt(x, z)), z);
    }
    const from = to.clone().add(new THREE.Vector3((Math.random() * 2 - 1) * 40, Math.max(90, 230 - to.y), (Math.random() * 2 - 1) * 40));
    boltGroup.clear();
    zigzag(from, to, 12, hit ? 7 : 12, hit ? 1.1 : 1.6, true);
    boltGroup.visible = true;
    boltMat.opacity = 1;
    boltT = 0.32;
    boltLight.position.copy(to).add(new THREE.Vector3(0, 6, 0));
    boltLight.intensity = hit ? 400 : 150;
    const dist = to.distanceTo(camPos);
    const near = Math.max(0, 1 - dist / 500);
    // deux ou trois pulsations rapides
    flashQ = [[0, 0.6 + near * 0.6], [0.07, 0.15], [0.12, 0.45 + near * 0.5], [0.2, 0]];
    audio.thunder?.(Math.min(3.2, dist / 340), near);
    return { to, dist };
  }

  // avance d'un pas (dt réel) ; `cam` = position de la caméra, `indoor` = masque la pluie
  function update(dt, cam, indoor = false, autoStrikes = true) {
    const T = TARGET[kind];
    const k = 1 - Math.exp(-dt / 12);
    cur.over += (T.over - cur.over) * k;
    cur.rain += (T.rain - cur.rain) * k;
    cur.storm += (T.storm - cur.storm) * k;

    // pluie
    const n = Math.floor(DROPS * cur.rain);
    rain.visible = n > 20 && !indoor;
    if (rain.visible) {
      const fall = 26, wind = 3 + cur.storm * 7, len = 0.9 + cur.storm * 0.5;
      for (let i = 0; i < n; i++) {
        let y = seed[i * 3 + 1] - dt * fall;
        if (y < 0) y += TOP * 2;
        seed[i * 3 + 1] = y;
        // enroulement : les gouttes restent dans la boîte même si la caméra se déplace
        const bx = ((seed[i * 3] - cam.x) % (BOX * 2) + BOX * 3) % (BOX * 2) - BOX;
        const bz = ((seed[i * 3 + 2] - cam.z) % (BOX * 2) + BOX * 3) % (BOX * 2) - BOX;
        const x = cam.x + bx, z = cam.z + bz, yy = cam.y - TOP + y;
        const o = i * 6;
        pos[o] = x; pos[o + 1] = yy; pos[o + 2] = z;
        pos[o + 3] = x - wind * 0.05; pos[o + 4] = yy + len; pos[o + 5] = z;
      }
      rainGeo.setDrawRange(0, n * 2);
      rainGeo.attributes.position.needsUpdate = true;
      rainMat.opacity = 0.35 + cur.rain * 0.25;
    }

    // nuages d'orage
    storm.visible = cur.over > 0.05;
    if (storm.visible) {
      // ancrés dans le monde (ils dérivent avec le vent), repliés dans un carré de 1500 m autour de la caméra
      storm.position.set(cam.x, 0, cam.z);
      const wrap = (v) => ((v % 1500) + 2250) % 1500 - 750;
      const base = Math.min(0.97, cur.over * 1.1);
      for (const c of storm.children) {
        const u = c.userData;
        u.wx += dt * (u.low ? 10 + cur.storm * 16 : 4 + cur.storm * 8) * u.speed;
        c.position.x = wrap(u.wx - cam.x);
        c.position.z = wrap(u.wz - cam.z);
        // fondu au bord du carré (l'amas repasse de l'autre côté sans qu'on le voie)
        const fade = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(c.position.x), Math.abs(c.position.z)), 560, 740);
        c.material.opacity = (u.low ? base * THREE.MathUtils.smoothstep(cur.storm, 0.25, 0.8) * 0.9 : base) * fade;
        c.visible = c.material.opacity > 0.01;
      }
    }

    // éclairs spontanés pendant l'orage
    if (autoStrikes && cur.storm > 0.6) {
      nextStrike -= dt;
      if (nextStrike <= 0) { nextStrike = 5 + Math.random() * 12; strike(cam); }
    }
    // flash
    if (flashQ.length) {
      for (const q of flashQ) q[0] -= dt;
      while (flashQ.length && flashQ[0][0] <= 0) flash = flashQ.shift()[1];
    } else flash = Math.max(0, flash - dt * 3);
    if (boltT > 0) {
      boltT -= dt;
      boltMat.opacity = Math.max(0, boltT / 0.32) * (0.6 + Math.random() * 0.4);
      boltLight.intensity *= Math.exp(-dt * 12);
      if (boltT <= 0) { boltGroup.visible = false; boltLight.intensity = 0; }
    }
    audio.setRain?.(indoor ? cur.rain * 0.35 : cur.rain, cur.storm);
    return { over: cur.over, rain: cur.rain, storm: cur.storm, flash };
  }

  // teinte des nuages d'orage selon le ciel du moment (s : couleurs de sky.update) et l'éclair en cours
  function shade(s) {
    if (!storm.visible || !s) return;
    const lum = 0.12 + s.amb * 0.95;
    tint.copy(C_CLOUDY).lerp(C_STORM, cur.storm).lerp(s.hor, 0.12).multiplyScalar(lum).lerp(C_FLASH, flash * 0.75);
    tintLow.copy(tint).multiplyScalar(0.8).lerp(C_FLASH, flash * 0.5);
    // perspective aérienne : les amas lointains se fondent dans la couleur de l'horizon
    haze.copy(s.hor).lerp(C_FLASH, flash * 0.5);
    for (const c of storm.children) {
      const far = THREE.MathUtils.smoothstep(Math.hypot(c.position.x, c.position.z), 220, 720) * 0.6;
      c.material.color.copy(c.userData.low ? tintLow : tint).lerp(haze, far);
    }
  }

  return {
    update,
    shade,
    strike,
    get kind() { return kind; },
    get state() { return cur; },
    // change de temps ; `now` = sans transition
    set(k, now = false) {
      if (!TARGET[k]) return;
      kind = k;
      if (now) { Object.assign(cur, TARGET[k]); flash = 0; flashQ = []; }
      if (k === 'storm') nextStrike = Math.min(nextStrike, 3);
    },
  };
}

// durée d'un temps, en heures de jeu [min, max], et poids du tirage
const DURATION = { clear: [2, 5], cloudy: [1.5, 4], rain: [1, 2.5], storm: [0.8, 1.8] };
const WEIGHT = { clear: 0.45, cloudy: 0.3, rain: 0.17, storm: 0.08 };
const NEWS = {
  cloudy: ['Le ciel se couvre', 'De gros nuages gris arrivent de la mer.'],
  rain: ['Il se met à pleuvoir', 'Une averse tombe sur l\'archipel.'],
  storm: ['Orage !', 'Éclairs et rafales : évitez de voler là-dedans.'],
  clear: ['Éclaircie', 'Le soleil revient.'],
};

export const WeatherMixin = {
  // change le temps (hôte ou solo ; les invités suivent la présence de l'hôte)
  setWeather(k, now = false) {
    const W = this.weather;
    if (W.kind === k) return;
    const prev = W.kind;
    W.set(k, now);
    if (now || !this.inGame() || !NEWS[k]) return;
    if (k === 'clear' && prev === 'cloudy') return;
    if (k === 'cloudy' && prev !== 'clear') return;
    this.ui.toast(NEWS[k][0], NEWS[k][1], k === 'storm' ? 'bad' : '', 4500);
  },
  // tirage au sort du prochain temps
  rollWeather() {
    let x = Math.random() * Object.values(WEIGHT).reduce((a, b) => a + b, 0), k = 'clear';
    for (const [kk, w] of Object.entries(WEIGHT)) { x -= w; if (x <= 0) { k = kk; break; } }
    const [a, b] = DURATION[k];
    this.wxLeft = a + Math.random() * (b - a);
    this.setWeather(k);
  },
  // réveil sur la plage après le crash : grand beau temps pendant quelques heures
  weatherWakeUp() {
    this.weather.set('clear', true);
    this.wxLeft = 3 + Math.random() * 2;
  },

  // chaque image : décide du temps et anime pluie, nuages et éclairs ; renvoie l'état pour le ciel
  updateWeather(dt) {
    const W = this.weather;
    if (this.mode === 'menu') { if (W.kind !== 'clear') W.set('clear', true); }
    else if (this.mode !== 'intro' && this.inGame()) {
      if (this.isAuthority()) {
        const f = this.flags;
        // tempête de Saint-Escale : orage imposé jusqu'à 21 h
        if (f.storm && !f.stormOver) { if (W.kind !== 'storm') this.setWeather('storm'); this.wxLeft = Math.max(this.wxLeft, 1); }
        else {
          this.wxLeft -= (dt / this.secondsPerHour()) * (this.fast ? CFG.time.debugFastForward : 1);
          if (this.wxLeft <= 0) this.rollWeather();
        }
      } else if (this.hostWx !== undefined && WX_KINDS[this.hostWx] && WX_KINDS[this.hostWx] !== W.kind) this.setWeather(WX_KINDS[this.hostWx]);
    }
    const indoor = (this.mode === 'explore' && this.aboard) || (this.mode === 'flight' && this.flight.cockpitView) || (this.bseat && (this.bseat.view === 'seat' || this.bf?.cockpitView));
    const res = W.update(dt, this.camera.position, indoor);
    this.flight.turb = this.mode === 'flight' && this.flight.airborne ? res.storm : 0;
    // la foudre qui tombe près du joueur fait trembler l'écran
    if (res.flash > 0.9 && this.player && this.mode === 'explore') this.player.shake = Math.max(this.player.shake || 0, 0.2);
    return res;
  },
};
