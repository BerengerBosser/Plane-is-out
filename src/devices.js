// Dispositifs 3D : on vise au centre de l'écran la pièce exacte (touche, molette, volant, bouton…).
// Pas de fenêtre d'énigme : tout se manipule dans le monde.
//  · E : appuyer / tourner d'un cran · R : cran inverse · molette de la souris : cran par cran
//  · E maintenu + souris : saisir (volant de vanne, bouton de réglage, miroir) pour un réglage fin ; Maj : encore plus fin
// Un dispositif : { tag, obj, range, active(), prompt(part), press(part), alt(part), wheel(part, dir), grab: { move(dx, dy, part, dt, fine), end(part), prompt(part) }, hover(part, on) }
// Les pièces visables portent userData.part (n'importe quelle valeur) : c'est ce que reçoivent les fonctions.
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';

const CENTER = new THREE.Vector2(0, 0);
const _p = new THREE.Vector3();

// ── textures de glyphes (chiffres, symboles) ──
const glyphCache = new Map();
export function glyphTex(txt, bg = '#e9dcb6', fg = '#10162b', sz = 64) {
  const key = `${txt}|${bg}|${fg}|${sz}`;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, sz, sz);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(sz * (txt.length > 1 ? 0.42 : 0.7))}px "Segoe UI Symbol", "Noto Sans Symbols", "Bricolage Grotesque", sans-serif`;
  g.fillText(txt, sz / 2, sz / 2 + sz * 0.04);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  glyphCache.set(key, t);
  return t;
}
// petit écran à cristaux liquides redessiné à la demande
export function makeLcd(w, h, cw = 256, ch = 96) {
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  let last = '';
  return {
    mesh, cv, g: cv.getContext('2d'),
    // draw(fn) : ne redessine que si la clé change
    draw(key, fn) { if (key === last) return; last = key; fn(this.g, cw, ch); tex.needsUpdate = true; },
  };
}
function box(w, h, d, col, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat); o.position.set(x, y, z); o.castShadow = true; return o; }

// ── cadenas à molettes (chiffres ou symboles) : face avant = +z local, molettes côte à côte le long de x ──
export function buildDialLock({ glyphs, n = 3, r = 0.075, width = 0.07, gap = 0.095, bg = '#e9dcb6', fg = '#10162b', body = '#c9a64a' }) {
  const g = new THREE.Group();
  const N = glyphs.length, face = 2 * r * Math.tan(Math.PI / N) * 0.98;
  const W = (n - 1) * gap + width + 0.08;
  g.add(box(W, r * 2 + 0.07, r * 1.6, body, 0, 0, -r * 0.35));
  // anse du cadenas
  const shackle = new THREE.Mesh(prep(new THREE.TorusGeometry(W * 0.3, 0.016, 6, 14, Math.PI), '#b8bec6'), flatMat);
  shackle.position.set(0, r + 0.035, -r * 0.35); g.add(shackle);
  const wheels = [];
  for (let i = 0; i < n; i++) {
    const w = new THREE.Group();
    w.position.set((i - (n - 1) / 2) * gap, 0, 0.012);
    const faces = [];
    for (let k = 0; k < N; k++) {
      const piv = new THREE.Group();
      piv.rotation.x = -k * 2 * Math.PI / N;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(width, face), new THREE.MeshLambertMaterial({ map: glyphTex(glyphs[k], bg, fg) }));
      q.position.z = r;
      piv.add(q);
      w.add(piv);
      faces.push(q.material);
    }
    // cylindre de fond (tranches) : on ne voit pas à travers
    const core = new THREE.Mesh(prep(new THREE.CylinderGeometry(r * 0.97, r * 0.97, width * 0.98, N).rotateZ(Math.PI / 2), '#8a7a50'), flatMat);
    w.add(core);
    w.traverse((o) => { o.userData.part = i; });
    g.add(w);
    wheels.push({ g: w, v: 0, cur: 0, faces });
  }
  // repère : la ligne de lecture
  g.add(box(W, 0.008, 0.01, '#ff6b5b', 0, face / 2 + 0.006, r + 0.004));
  g.add(box(W, 0.008, 0.01, '#ff6b5b', 0, -face / 2 - 0.006, r + 0.004));
  return {
    group: g, wheels, N,
    set(vals, snap) { vals.forEach((v, i) => { const w = wheels[i]; if (!w) return; w.v = ((v % N) + N) % N; if (snap) w.cur = w.v; }); },
    // animation : les molettes tournent vers leur cran (par le plus court chemin)
    update(dt) {
      for (const w of wheels) {
        let d = w.v - w.cur; d -= Math.round(d / N) * N;
        w.cur += d * Math.min(1, dt * 14);
        w.g.rotation.x = w.cur * 2 * Math.PI / N;
        // la face lue (entre les deux traits rouges) est claire, les autres dans l'ombre : pas d'erreur de lecture
        w.faces.forEach((m, k) => { let e = Math.abs(k - w.cur) % N; e = Math.min(e, N - e); m.color.setScalar(Math.max(0.35, 1 - e * 0.65)); });
      }
    },
  };
}

// ── clavier à code : écran en haut, 12 touches (1-9, C, 0, OK). Face avant = +z local ──
export function buildKeypad({ title = 'CODE', len = 3, color = '#33373f' } = {}) {
  const g = new THREE.Group();
  g.add(box(0.44, 0.7, 0.06, color, 0, 0, -0.03));
  const lcd = makeLcd(0.36, 0.13, 256, 92);
  lcd.mesh.position.set(0, 0.24, 0.002); g.add(lcd.mesh);
  const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  const keys = labels.map((l, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const bg = l === 'OK' ? '#5ef2c2' : l === 'C' ? '#ff6b5b' : '#e9e4d8';
    const mat = new THREE.MeshLambertMaterial({ map: glyphTex(l, bg, '#10162b') });
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.085, 0.03), mat);
    k.position.set((col - 1) * 0.12, 0.08 - row * 0.105, 0.012);
    k.userData.part = l; k.userData.z0 = 0.012;
    g.add(k);
    return k;
  });
  const S = { entry: '', msg: '', msgT: 0, power: true };
  const api = {
    group: g, keys, lcd, state: S, len,
    // appui sur une touche : renvoie le code complet quand on valide (OK), sinon null
    key(l) {
      const k = keys.find((q) => q.userData.part === l); if (k) k.position.z = k.userData.z0 - 0.012;
      if (l === 'C') { S.entry = ''; S.msg = ''; return null; }
      if (l === 'OK') { const e = S.entry; S.entry = ''; return e; }
      if (S.entry.length < len) S.entry += l;
      S.msg = '';
      return null;
    },
    flash(msg, ms = 1.4) { S.msg = msg; S.msgT = ms; },
    hover(l) { keys.forEach((k) => k.material.emissive?.set(k.userData.part === l ? '#333322' : '#000000')); },
    update(dt) {
      keys.forEach((k) => { k.position.z += (k.userData.z0 - k.position.z) * Math.min(1, dt * 12); });
      if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) S.msg = ''; }
      const txt = !S.power ? '' : S.msg || (S.entry.padEnd(len, '_').split('').join(' '));
      lcd.draw(`${S.power}|${txt}`, (c, w, h) => {
        c.fillStyle = S.power ? '#0d2a24' : '#0a0c10'; c.fillRect(0, 0, w, h);
        if (!S.power) return;
        c.fillStyle = '#5ef2c2'; c.font = 'bold 20px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillText(title, 10, 6);
        c.font = `bold ${S.msg ? 34 : 44}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = S.msg === 'REFUSÉ' || S.msg === 'ERREUR' ? '#ff6b5b' : '#5ef2c2';
        c.fillText(txt, w / 2, h * 0.64);
      });
    },
  };
  return api;
}

export const DevicesMixin = {
  devicesInit() {
    this.devices = [];
    this.deviceProviders = [];
    this._ray = new THREE.Raycaster();
    this.grab = null;
  },
  addDevice(spec) { this.devices.push(spec); return spec; },
  removeDevices(tag) { this.devices = this.devices.filter((d) => d.tag !== tag); if (this.grab?.dev.tag === tag) this.grab = null; },

  // pièce visée au centre de l'écran (la plus proche)
  pickDevice() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const list = this.devices.concat(...this.deviceProviders.map((f) => f() || []));
    let best = null;
    for (const d of list) {
      if (!d.obj || (d.active && !d.active())) continue;
      d.obj.getWorldPosition(_p);
      const range = d.range || 2.4;
      if (_p.distanceToSquared(cam.position) > (range + 1.5) ** 2) continue;
      let vis = true;
      for (let o = d.obj; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis) continue;
      this._ray.setFromCamera(CENTER, cam);
      this._ray.far = range;
      const hits = this._ray.intersectObject(d.obj, true);
      for (const h of hits) {
        let o = h.object;
        while (o && o.userData.part === undefined && o !== d.obj) o = o.parent;
        const part = o ? o.userData.part : undefined;
        if (part === undefined) continue;
        if (!best || h.distance < best.dist) best = { dev: d, part, dist: h.distance };
        break;
      }
    }
    return best;
  },

  // candidat d'interaction pour le dispositif visé (prioritaire sur le reste)
  deviceCandidate() {
    const hit = this.pickDevice();
    if (this._hovDev && (!hit || hit.dev !== this._hovDev.dev || hit.part !== this._hovDev.part)) { this._hovDev.dev.hover?.(this._hovDev.part, false); this._hovDev = null; }
    if (!hit) { this.devWheel = false; return null; }
    const { dev, part } = hit;
    if (!this._hovDev) { dev.hover?.(part, true); this._hovDev = hit; }
    this.devWheel = !!dev.wheel;
    return {
      score: -1e6,
      prompt: dev.prompt ? dev.prompt(part) : '',
      press: dev.press ? () => dev.press(part) : dev.grab ? () => this.startGrab(dev, part) : null,
      alt: dev.alt ? () => dev.alt(part) : null,
      wheel: dev.wheel ? (dir) => dev.wheel(part, dir) : null,
      grabDev: dev.grab && dev.press ? () => this.startGrab(dev, part) : null,
    };
  },
  startGrab(dev, part) {
    if (this.grab) return;
    this.grab = { dev, part, t: 0 };
    dev.grab.start?.(part);
  },
  // appelé avant le déplacement : la souris tourne la pièce saisie au lieu de la caméra
  updateGrab(dt, blocked) {
    const G = this.grab; if (!G) return false;
    const inp = this.input, d = G.dev;
    G.t += dt;
    const far = d.obj && d.obj.getWorldPosition(_p).distanceTo(this.camera.position) > (d.range || 2.4) + 1.2;
    if (blocked || !inp.down('KeyE') || (d.active && !d.active()) || far || this.mode !== 'explore') {
      d.grab.end?.(G.part);
      this.grab = null;
      return false;
    }
    const fine = inp.down('ShiftLeft', 'ShiftRight');
    d.grab.move(inp.mdx, inp.mdy, G.part, dt, fine);
    if (d.wheel && (inp.hit('WheelUp') || inp.hit('WheelDown'))) d.wheel(G.part, inp.hit('WheelUp') ? 1 : -1);
    inp.mdx = 0; inp.mdy = 0;
    this.ui.prompt(d.grab.prompt ? d.grab.prompt(G.part) : '');
    return true;
  },
};
