// Studio son : l'outil de réglage de tous les sons du jeu (page /studio du serveur de jeu).
// - Sons : source (synthé / fichiers / muet), variantes, découpe et fondus à la souris sur la forme d'onde,
//   calibrage (gain par fichier, normalisation au pic ou à la sonie, suppression des silences),
//   volume, hauteur, variation aléatoire, envoi réverb, simulateur pour les boucles (vent, pluie, moteur…) ;
// - Console : un fader et un vumètre par famille de sons, muet / solo, limiteur général ;
// - Réverb : préréglages, durée, pré-délai, tonalité, réflexions, et envoi de chaque son ;
// - Ambiances : playlists « Détente », « Dramatique », « En vol », « Menu », « Poste radio », avec fondus enchaînés.
// Tout s'entend en direct ici ET dans le jeu ouvert dans le même navigateur ; « Enregistrer » écrit sounds/config.json.
import { SOUNDS, SOUND_BY_ID, CATS, CAT_BY_ID, MOODS, REVERB_PRESETS, AUDIO_EXT, defaultConfig, defaultSound, defaultFile, normalizeConfig, dbToGain, gainToDb } from './sounds.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PREF_KEY = 'plane-is-out-studio';
const fmtDb = (v) => (v <= -119 ? '−∞' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`);
const fmtSec = (s) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`);
const fmtT = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return m ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(r < 10 ? 3 : 2)} s`; };
const fmtSize = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);
const pathUrl = (name) => name.split('/').map(encodeURIComponent).join('/');
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } })();
const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* rien */ } };

// ── analyse d'un tampon : pic, sonie (RMS), bornes hors silence ──
const ANA = new WeakMap();
function analyze(buf, start = 0, end = 0) {
  const key = `${start}|${end}`, hit = ANA.get(buf);
  if (hit?.key === key) return hit.res;
  const res = analyzeRaw(buf, start, end);
  ANA.set(buf, { key, res });
  return res;
}
function analyzeRaw(buf, start, end) {
  const sr = buf.sampleRate, a = Math.floor(start * sr), b = end > start ? Math.min(buf.length, Math.floor(end * sr)) : buf.length;
  const step = b - a > 4e6 ? 4 : 1;
  let peak = 0, sum = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = a; i < b; i++) { const x = Math.abs(d[i]); if (x > peak) peak = x; }
    for (let i = a; i < b; i += step) { sum += d[i] * d[i]; n++; }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
function silenceBounds(buf, thrDb = -50) {
  const thr = dbToGain(thrDb), sr = buf.sampleRate;
  let first = buf.length, last = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) { first = Math.min(first, i); break; }
    for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > thr) { last = Math.max(last, i); break; }
  }
  if (first >= last) return null;
  return { start: Math.max(0, first / sr - 0.004), end: Math.min(buf.duration, last / sr + 0.03) };
}

// ── forme d'onde interactive (découpe, fondus, zoom, tête de lecture) ──
const PEAKS = new WeakMap();
function peaksOf(buf) {
  let P = PEAKS.get(buf);
  if (P) return P;
  const B = 256, n = Math.ceil(buf.length / B), mn = new Float32Array(n), mx = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < n; k++) {
      let lo = mn[k], hi = mx[k];
      for (let i = k * B, e = Math.min(d.length, i + B); i < e; i++) { const x = d[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
      mn[k] = lo; mx[k] = hi;
    }
  }
  P = { B, mn, mx };
  PEAKS.set(buf, P);
  return P;
}
function createWave() {
  const cv = document.createElement('canvas');
  cv.className = 'wv';
  const W = { cv, buf: null, entry: null, fades: null, editable: false, gain: 1, v0: 0, v1: 1, pos: null, hover: null, label: '', note: '', onChange: null, onSeek: null };
  let drag = null;
  const dur = () => (W.buf ? W.buf.duration : 1);
  const bounds = () => {
    const e = W.entry, D = dur();
    if (!e) return { start: 0, end: D };
    const start = clamp(e.start || 0, 0, D);
    return { start, end: e.end > start ? Math.min(e.end, D) : D };
  };
  const X = (t) => ((t - W.v0) / (W.v1 - W.v0)) * cv.clientWidth;
  const T = (px) => W.v0 + (px / cv.clientWidth) * (W.v1 - W.v0);
  function clampView() {
    const D = dur(), span = clamp(W.v1 - W.v0, Math.min(D, 0.004), D);
    W.v0 = clamp(W.v0, 0, D - span); W.v1 = W.v0 + span;
  }
  W.set = (buf, entry, { editable = true, fades = null, gain = 1, label = '', note = '' } = {}) => {
    if (buf !== W.buf) { W.buf = buf; W.v0 = 0; W.v1 = buf ? buf.duration : 1; }
    Object.assign(W, { entry, editable: editable && !!entry, fades, gain, label, note });
    W.draw();
  };
  W.zoomAll = () => { W.v0 = 0; W.v1 = dur(); W.draw(); };
  W.zoomSel = () => { const { start, end } = bounds(), pad = (end - start) * 0.08; W.v0 = start - pad; W.v1 = end + pad; clampView(); W.draw(); };
  function range(t0, t1) {
    const b = W.buf, sr = b.sampleRate;
    let s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(b.length, Math.ceil(t1 * sr));
    if (s1 <= s0) s1 = Math.min(b.length, s0 + 1);
    let lo = 0, hi = 0;
    if (s1 - s0 >= 256) {
      const P = peaksOf(b);
      for (let k = Math.floor(s0 / P.B), e = Math.ceil(s1 / P.B); k < e && k < P.mn.length; k++) { if (P.mn[k] < lo) lo = P.mn[k]; if (P.mx[k] > hi) hi = P.mx[k]; }
    } else {
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = s0; i < s1; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; } }
    }
    return [lo, hi];
  }
  W.draw = () => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const RH = 18, H = h - RH, mid = H / 2, amp = mid - 6;
    c.fillStyle = '#0b1022'; c.fillRect(0, 0, w, H);
    c.fillStyle = '#10162b'; c.fillRect(0, H, w, RH);
    c.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
    if (!W.buf) {
      c.fillStyle = '#6b7399'; c.textAlign = 'center'; c.fillText(W.note || 'Aucun son à afficher', w / 2, mid + 4); c.textAlign = 'left';
      return;
    }
    const { start, end } = bounds();
    if (W.editable) { c.fillStyle = 'rgba(255,209,102,.07)'; c.fillRect(X(start), 0, X(end) - X(start), H); }
    // onde (gain du fichier appliqué : ce qui dépasse 0 dBFS est marqué en rouge)
    const D = dur();
    for (let px = 0; px < w; px++) {
      const t0 = T(px), t1 = T(px + 1);
      if (t1 < 0 || t0 > D) continue;
      let [lo, hi] = range(t0, t1);
      lo *= W.gain; hi *= W.gain;
      const tm = (t0 + t1) / 2, inside = !W.editable || (tm >= start && tm <= end);
      c.fillStyle = inside ? '#5ef2c2' : '#2c3766';
      const y1 = mid - Math.min(1, hi) * amp, y2 = mid - Math.max(-1, lo) * amp;
      c.fillRect(px, y1, 1, Math.max(1, y2 - y1));
      if (hi > 1 || lo < -1) { c.fillStyle = '#ff5a5a'; c.fillRect(px, 0, 1, 4); c.fillRect(px, H - 4, 1, 4); }
    }
    c.fillStyle = 'rgba(255,244,224,.12)'; c.fillRect(0, mid, w, 1);
    // enveloppe des fondus
    if (W.editable && W.fades) {
      const fi = Math.min(W.fades.in, (end - start) / 2), fo = Math.min(W.fades.out, (end - start) / 2);
      const top = 6, bot = H - 6;
      c.beginPath(); c.moveTo(X(start), bot); c.lineTo(X(start + fi), top); c.lineTo(X(end - fo), top); c.lineTo(X(end), bot);
      c.strokeStyle = '#ff6b5b'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = 'rgba(11,16,34,.55)';
      c.beginPath(); c.moveTo(X(start), 0); c.lineTo(X(start), bot); c.lineTo(X(start + fi), top); c.lineTo(X(start + fi), 0); c.fill();
      c.beginPath(); c.moveTo(X(end - fo), 0); c.lineTo(X(end - fo), top); c.lineTo(X(end), bot); c.lineTo(X(end), 0); c.fill();
      for (const t of [start + fi, end - fo]) { c.beginPath(); c.arc(X(t), top, 5, 0, Math.PI * 2); c.fillStyle = '#ff6b5b'; c.fill(); c.strokeStyle = '#10162b'; c.lineWidth = 2; c.stroke(); }
    }
    // poignées de découpe
    if (W.editable) {
      for (const [t, dir] of [[start, 1], [end, -1]]) {
        const x = Math.round(X(t)) + 0.5;
        c.fillStyle = '#ffd166'; c.fillRect(x - 1, 0, 2, H);
        c.beginPath(); c.moveTo(x, H - 16); c.lineTo(x + 10 * dir, H - 8); c.lineTo(x, H); c.fill();
      }
    }
    // règle
    const span = W.v1 - W.v0, steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    const st = steps.find((s) => (s / span) * w > 70) || 300;
    c.fillStyle = '#8a92b8'; c.strokeStyle = '#34407a';
    for (let k = Math.ceil(W.v0 / st); k * st <= W.v1; k++) {
      const t = k * st, x = Math.round(X(t)) + 0.5;
      c.fillRect(x, H, 1, 5);
      const lbl = st < 0.1 ? `${Math.round(t * 1000)} ms` : t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${st < 1 ? t.toFixed(1) : Math.round(t)} s`;
      c.fillText(lbl, x + 3, H + 14);
    }
    // tête de lecture, survol
    if (W.pos != null) { const x = X(W.pos); c.fillStyle = '#ff6b5b'; c.fillRect(x - 1, 0, 2, H); }
    if (W.hover != null && !drag) {
      const x = X(W.hover);
      c.fillStyle = 'rgba(255,244,224,.35)'; c.fillRect(x, 0, 1, H);
      const lbl = fmtT(W.hover), tw = c.measureText(lbl).width;
      c.fillStyle = 'rgba(16,22,43,.9)'; c.fillRect(Math.min(x + 4, w - tw - 10), 4, tw + 8, 17);
      c.fillStyle = '#fff4e0'; c.fillText(lbl, Math.min(x + 8, w - tw - 6), 16);
    }
    if (W.label) { const tw = c.measureText(W.label).width; c.fillStyle = 'rgba(16,22,43,.85)'; c.fillRect(6, H - 24, tw + 12, 18); c.fillStyle = '#b8a4ff'; c.fillText(W.label, 12, H - 11); }
  };
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function hit(px, py) {
    if (!W.editable) return null;
    const { start, end } = bounds();
    if (W.fades && py < 22) {
      const fi = Math.min(W.fades.in, (end - start) / 2), fo = Math.min(W.fades.out, (end - start) / 2);
      if (Math.abs(px - X(start + fi)) < 9) return 'fadeIn';
      if (Math.abs(px - X(end - fo)) < 9) return 'fadeOut';
    }
    if (Math.abs(px - X(start)) < 7) return 'start';
    if (Math.abs(px - X(end)) < 7) return 'end';
    return null;
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!W.buf || e.button !== 0) return;
    const [px, py] = local(e);
    const h = hit(px, py);
    drag = h ? { k: h } : { k: 'sel', t: clamp(T(px), 0, dur()), px, moved: false };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!W.buf) return;
    const [px, py] = local(e), t = clamp(T(px), 0, dur());
    W.hover = t;
    if (!drag) { const h = hit(px, py); cv.style.cursor = h === 'start' || h === 'end' || h?.startsWith?.('fade') ? 'ew-resize' : W.editable ? 'text' : 'pointer'; W.draw(); return; }
    const { start, end } = bounds(), en = W.entry;
    if (drag.k === 'start') en.start = +clamp(t, 0, end - 0.005).toFixed(4);
    else if (drag.k === 'end') { const v = clamp(t, start + 0.005, dur()); en.end = v >= dur() - 0.0008 ? 0 : +v.toFixed(4); }
    else if (drag.k === 'fadeIn') W.fades.in = +clamp(t - start, 0, (end - start) / 2).toFixed(3);
    else if (drag.k === 'fadeOut') W.fades.out = +clamp(end - t, 0, (end - start) / 2).toFixed(3);
    else if (drag.k === 'sel') {
      if (Math.abs(px - drag.px) > 4) drag.moved = true;
      if (drag.moved && W.editable) {
        const a = Math.min(drag.t, t), b = Math.max(drag.t, t);
        en.start = +a.toFixed(4); en.end = b >= dur() - 0.0008 ? 0 : +b.toFixed(4);
      }
    }
    if (drag.k !== 'sel' || drag.moved) W.onChange?.(false);
    W.draw();
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.k === 'sel' && !d.moved) W.onSeek?.(d.t);
    else if (d.k !== 'sel' || W.editable) W.onChange?.(true);
    try { cv.releasePointerCapture(e.pointerId); } catch { /* rien */ }
    W.draw();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { W.hover = null; W.draw(); });
  cv.addEventListener('dblclick', () => W.zoomAll());
  cv.addEventListener('wheel', (e) => {
    if (!W.buf) return;
    e.preventDefault();
    const [px] = local(e), span = W.v1 - W.v0;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = ((e.deltaX || e.deltaY) / cv.clientWidth) * span;
      W.v0 += d; W.v1 += d;
    } else {
      const t = T(px), ns = clamp(span * Math.pow(1.0018, e.deltaY), Math.min(dur(), 0.004), dur());
      W.v0 = t - (t - W.v0) * (ns / span); W.v1 = W.v0 + ns;
    }
    clampView(); W.draw();
  }, { passive: false });
  new ResizeObserver(() => W.draw()).observe(cv);
  return W;
}

const SKELETON = `
<header class="top">
  <div class="brand"><i>🎚</i><b>Studio son</b><small>Plane is out</small></div>
  <nav class="views">
    <button data-view="sound">Sons</button><button data-view="mixer">Console</button><button data-view="reverb">Réverb</button><button data-view="music">Ambiances</button>
  </nav>
  <div class="st"><span class="pill srv"></span><span class="pill game"></span></div>
  <div class="acts">
    <button class="ib" data-a="undo" title="Annuler (Ctrl+Z)">↶</button><button class="ib" data-a="redo" title="Rétablir (Ctrl+Y)">↷</button>
    <button class="btn" data-a="refresh" title="Recharger les fichiers et la config, ici et dans le jeu ouvert (F9)">⟳ Actualiser <kbd>F9</kbd></button>
    <button class="btn primary save" data-a="save">💾 Enregistrer <kbd>Ctrl S</kbd></button>
    <details class="more"><summary class="ib" title="Plus d'actions">⋯</summary><div class="menu">
      <button data-a="openGame">🎮 Ouvrir le jeu (même navigateur : réglages en direct)</button>
      <button data-a="export">⬇ Exporter la config (JSON)</button>
      <button data-a="import">📂 Importer une config</button>
      <button data-a="resetAll" class="danger">↺ Tout réinitialiser (synthé partout)</button>
    </div></details>
  </div>
</header>
<div class="banner" hidden></div>
<aside class="left">
  <input type="search" class="search" placeholder="Rechercher un son…   /" aria-label="Rechercher un son">
  <div class="heard" hidden><small>🎮 Entendu dans le jeu</small><div></div></div>
  <div class="sList"></div>
  <div class="sum"></div>
</aside>
<main class="sMain"></main>
<aside class="right">
  <header><b>Bibliothèque</b><small class="lCount"></small><button class="ib" data-a="refresh" title="Actualiser (F9)">⟳</button></header>
  <label class="drop" data-drop="lib"><input type="file" class="upIn" multiple accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus,.webm" hidden><b>＋ Importer des sons</b><small>Déposez des mp3 / wav ici, ou cliquez</small></label>
  <input type="search" class="lSearch" placeholder="Filtrer les fichiers…" aria-label="Filtrer les fichiers">
  <ul class="lList"></ul>
  <footer class="lHelp">Glissez un fichier sur un son (liste de gauche), sur la zone des variantes ou sur une ambiance. Dossier : <code>sounds/</code></footer>
</aside>
<footer class="keys"><span><kbd>Espace</kbd> écouter / arrêter</span><span><kbd>A</kbd> synthé d'origine</span><span><kbd>↑</kbd><kbd>↓</kbd> son suivant</span><span><kbd>Échap</kbd> tout arrêter</span><span><kbd>F9</kbd> actualiser</span><span><kbd>Ctrl</kbd>+<kbd>S</kbd> enregistrer</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> annuler</span><span>Onde : glisser = découper · clic = écouter d'ici · molette = zoom · Maj+molette = défiler · double-clic = tout voir</span></footer>
<div class="dropOverlay" hidden><div><b>Déposez pour importer</b><small>dans le dossier sounds/</small></div></div>
<div class="toasts"></div>
<input type="file" class="impCfg" accept=".json,application/json" hidden>
<div class="picker" hidden><input type="search" placeholder="Choisir un fichier…"><ul></ul></div>`;

export function mountStudio(root, audio) {
  root.classList.add('studio');
  root.innerHTML = SKELETON;
  const q = (s) => root.querySelector(s);
  const el = { main: q('.sMain'), list: q('.sList'), lib: q('.lList'), search: q('.search'), lSearch: q('.lSearch'), banner: q('.banner'), heard: q('.heard'), picker: q('.picker') };
  const S = {
    cfg: audio.config, saved: '', last: '', undo: [], redo: [],
    files: [], server: false, edit: false,
    view: ['sound', 'mixer', 'reverb', 'music'].includes(pref.view) ? pref.view : 'sound',
    sel: SOUND_BY_ID[pref.sel] ? pref.sel : SOUNDS[0].id, fileIdx: 0, track: null,
    voice: null, libVoice: null, sim: {}, simOn: new Set(), moodPreview: null, gameForce: null,
    game: null, heard: [], synthBufs: {}, peakHold: {}, sliders: new Map(),
  };
  const wave = createWave();

  // ── utilitaires ──
  function toast(title, sub = '', kind = 'good', ms = 2600) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    q('.toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
  const snap = () => JSON.stringify(S.cfg);
  const dirty = () => snap() !== S.saved;
  const missing = (name) => S.server && !S.files.some((f) => f.name === name);
  let liveT = 0;
  function live() {
    audio.apply();
    clearTimeout(liveT);
    liveT = setTimeout(() => audio.broadcast({ t: 'cfg', cfg: S.cfg }), 40);
    updateDirty();
  }
  function commit() {
    const now = snap();
    if (now === S.last) return;
    S.undo.push(S.last); if (S.undo.length > 150) S.undo.shift();
    S.redo = []; S.last = now;
    updateDirty();
  }
  function change(fn, { render = true } = {}) { fn(); live(); commit(); if (render) renderAll(); }
  function restore(json) {
    S.cfg = normalizeConfig(JSON.parse(json));
    S.last = json;
    audio.setConfig(S.cfg);
    live(); renderAll();
  }
  function updateDirty() {
    const d = dirty();
    q('.save').classList.toggle('dirty', d);
    q('[data-a=undo]').disabled = !S.undo.length;
    q('[data-a=redo]').disabled = !S.redo.length;
    document.title = `${d ? '● ' : ''}Studio son · Plane is out`;
  }
  function usage() {
    const u = new Map();
    const add = (n, w) => { if (!u.has(n)) u.set(n, []); u.get(n).push(w); };
    for (const s of SOUNDS) S.cfg.sounds[s.id].files.forEach((f) => add(f.name, s.name));
    for (const m of MOODS) S.cfg.music.moods[m.id].files.forEach((f) => add(f.name, `♪ ${m.name}`));
    return u;
  }

  // ── serveur : liste des fichiers, enregistrement, import ──
  async function loadList() {
    try {
      const r = await fetch('sounds/_list', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      S.files = j.files || []; S.edit = !!j.edit; S.server = true;
    } catch { S.files = []; S.edit = false; S.server = false; }
    renderStatus();
  }
  async function save() {
    if (!S.server || !S.edit) {
      exportCfg();
      toast('Enregistrement impossible ici', S.server ? 'Serveur en lecture seule : la config a été téléchargée, placez-la dans sounds/config.json.' : 'Pas de serveur : la config a été téléchargée (sounds/config.json).', 'bad', 5000);
      return;
    }
    try {
      const r = await fetch('sounds/config.json', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(S.cfg, null, 1) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `erreur ${r.status}`);
      S.saved = snap(); updateDirty();
      toast('Enregistré', 'sounds/config.json · le jeu l\'utilise dès maintenant');
    } catch (e) { toast('Échec de l\'enregistrement', e.message, 'bad', 5000); }
  }
  function exportCfg() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S.cfg, null, 1)], { type: 'application/json' }));
    a.download = 'config.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const cleanName = (n) => n.normalize('NFC').replace(/[^\w\-. ()àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ]/g, '_').replace(/^\.+/, '');
  async function upload(fileList, folder = '') {
    const list = [...fileList].filter((f) => AUDIO_EXT.test(f.name));
    if (!list.length) { toast('Aucun fichier audio', 'Formats : mp3, wav, ogg, m4a, flac, opus, webm.', 'bad'); return []; }
    if (!S.edit) { toast('Import impossible', S.server ? 'Serveur en lecture seule (import réservé à la machine du serveur). Copiez les fichiers dans sounds/ puis F9.' : 'Lancez le serveur (npm start) et ouvrez http://localhost:8080/studio.', 'bad', 6000); return []; }
    const names = [];
    for (const f of list) {
      const name = (folder ? `${folder}/` : '') + cleanName(f.name);
      try {
        const r = await fetch(`sounds/${pathUrl(name)}`, { method: 'PUT', body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `erreur ${r.status}`);
        names.push(name);
      } catch (e) { toast(`Échec : ${f.name}`, e.message, 'bad', 5000); }
    }
    if (names.length) {
      toast(`${names.length} fichier${names.length > 1 ? 's' : ''} importé${names.length > 1 ? 's' : ''}`, names.join(', '));
      await refresh({ quiet: true });
    }
    return names;
  }
  // actualiser : liste des fichiers + fichiers rechargés, ici et dans le jeu ; la config vient du disque si rien n'est en cours
  async function refresh({ remote = false, quiet = false } = {}) {
    const keep = dirty();
    await loadList();
    const r = await audio.refresh({ config: keep ? S.cfg : null });
    S.cfg = audio.config;
    if (!keep) { S.saved = S.last = snap(); }
    S.synthBufs = {};
    if (!remote) audio.broadcast({ t: 'refresh', cfg: keep ? S.cfg : null });
    // F9 venu du jeu : il relit le disque ; on lui renvoie nos réglages en cours juste après
    else if (keep) setTimeout(() => audio.broadcast({ t: 'cfg', cfg: S.cfg }), 500);
    renderAll();
    if (!quiet) toast(remote ? 'Sons actualisés depuis le jeu' : 'Sons actualisés', `${S.files.length} fichier${S.files.length > 1 ? 's' : ''} dans sounds/${r.errors.length ? ` · ${r.errors.length} illisible(s) : ${r.errors.join(', ')}` : ''}${keep ? ' · vos réglages non enregistrés sont gardés' : ''}`, r.errors.length ? 'bad' : 'good', r.errors.length ? 6000 : 2600);
  }

  // ── rendu ──
  function renderStatus() {
    const srv = q('.pill.srv');
    srv.className = `pill srv ${S.server ? (S.edit ? 'ok' : 'warn') : 'bad'}`;
    srv.textContent = S.server ? (S.edit ? '● Serveur local · écriture' : '● Serveur · lecture seule') : '● Pas de serveur';
    srv.title = S.server ? (S.edit ? 'Enregistrer écrit sounds/config.json, l\'import copie dans sounds/' : 'Le serveur n\'accepte l\'écriture que depuis sa propre machine (ou SOUND_EDIT=1)') : 'Lancez « npm start » puis ouvrez http://localhost:8080/studio';
    el.banner.hidden = S.server;
    if (!S.server) el.banner.innerHTML = '⚠ Serveur introuvable : lancez <code>npm start</code> puis ouvrez <b>http://localhost:8080/studio</b>. Les sons de synthèse restent jouables, la config peut être exportée.';
  }
  function renderGame() {
    const g = q('.pill.game'), on = S.game && performance.now() - S.game.seen < 5000;
    g.className = `pill game ${on ? 'ok' : ''}`;
    const mood = on && S.game.mood ? MOODS.find((m) => m.id === S.game.mood) : null;
    g.textContent = on ? `🎮 Jeu connecté${mood ? ` · ${mood.icon} ${mood.name}` : ''}` : '🎮 Jeu non ouvert';
    g.title = on ? `Réglages appliqués en direct au jeu.${S.game.track ? ` Musique : ${S.game.track}` : ''}` : 'Ouvrez le jeu dans ce navigateur (menu ⋯) : chaque réglage s\'y entend en direct.';
  }
  function renderList() {
    const f = el.search.value.trim().toLowerCase();
    let html = '';
    for (const c of CATS) {
      const items = SOUNDS.filter((s) => s.cat === c.id && (!f || `${s.name} ${s.id} ${s.desc}`.toLowerCase().includes(f)));
      if (!items.length) continue;
      html += `<div class="grp"><h4>${c.icon} ${esc(c.name)}</h4>${items.map((s) => {
        const sc = S.cfg.sounds[s.id], n = sc.files.length, bad = sc.files.some((x) => missing(x.name));
        const sub = sc.src === 'file' ? (n ? `${n} fichier${n > 1 ? 's' : ''}` : 'aucun fichier') : sc.src === 'off' ? 'muet' : s.kind === 'loop' ? 'boucle · synthé' : 'synthé';
        return `<div class="snd${s.id === S.sel ? ' on' : ''}${bad ? ' bad' : ''}" data-id="${s.id}" data-drop="sound:${s.id}" tabindex="-1"><i class="dot ${sc.src}${sc.src === 'file' && !n ? ' empty' : ''}"></i><span>${esc(s.name)}</span><small>${sub}</small><button class="pl${S.simOn.has(s.id) ? ' on' : ''}" data-play="${s.id}" title="${s.kind === 'loop' ? 'Lancer / arrêter la boucle' : 'Écouter (comme dans le jeu)'}">${S.simOn.has(s.id) ? '■' : '▶'}</button></div>`;
      }).join('')}</div>`;
    }
    el.list.innerHTML = html || '<p class="empty">Aucun son ne correspond.</p>';
    const nf = SOUNDS.filter((s) => S.cfg.sounds[s.id].src === 'file' && S.cfg.sounds[s.id].files.length).length;
    q('.sum').innerHTML = `<b>${nf}</b>/${SOUNDS.length} sons joués par des fichiers · <b>${MOODS.reduce((n, m) => n + S.cfg.music.moods[m.id].files.length, 0)}</b> musiques`;
  }
  function renderLib() {
    const f = el.lSearch.value.trim().toLowerCase(), u = usage();
    q('.lCount').textContent = S.server ? `${S.files.length}` : '';
    const rows = S.files.filter((x) => !f || x.name.toLowerCase().includes(f));
    el.lib.innerHTML = !S.server ? '<li class="empty">Serveur non connecté.</li>' : rows.length ? rows.map((x) => {
      const i = x.name.lastIndexOf('/'), used = u.get(x.name);
      return `<li draggable="true" data-name="${esc(x.name)}" title="${esc(x.name)}${used ? `\nUtilisé par : ${used.join(', ')}` : '\nNon utilisé'}"><button class="lp" data-lplay="${esc(x.name)}">${S.libVoice?.name === x.name ? '■' : '▶'}</button><span class="nm">${i >= 0 ? `<em>${esc(x.name.slice(0, i + 1))}</em>` : ''}${esc(x.name.slice(i + 1))}</span><small>${fmtSize(x.size)}</small>${used ? `<b class="use">${used.length}</b>` : '<b class="use none">—</b>'}</li>`;
    }).join('') : `<li class="empty">${S.files.length ? 'Aucun fichier ne correspond.' : 'Dossier sounds/ vide : déposez vos mp3 / wav au-dessus.'}</li>`;
  }
  function renderHeard() {
    el.heard.hidden = !S.heard.length;
    el.heard.querySelector('div').innerHTML = S.heard.map((id) => `<button data-id="${id}">${esc(SOUND_BY_ID[id]?.name || id)}</button>`).join('');
  }
  function renderViews() {
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
    root.dataset.view = S.view;
  }
  function renderAll() { renderViews(); renderList(); renderLib(); renderView(); updateDirty(); renderStatus(); renderGame(); }

  // curseurs : [clé, libellé, min, max, pas, lire, écrire, format, défaut, info]
  function sl(k, label, min, max, step, get, set, fmt, def, info = '') {
    S.sliders.set(k, { get, set, fmt, def });
    const v = get();
    return `<label class="sl" data-k="${k}" title="${esc(info)}${info ? '\n' : ''}Double-clic : valeur par défaut"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmt(v)}</output></label>`;
  }
  function renderView() {
    S.sliders.clear();
    const v = S.view;
    el.main.innerHTML = v === 'mixer' ? viewMixer() : v === 'reverb' ? viewReverb() : v === 'music' ? viewMusic() : viewSound();
    const slot = el.main.querySelector('.wslot');
    if (slot) { slot.appendChild(wave.cv); updateWave(); }
    if (v === 'reverb') drawIR();
  }

  // ── vue « Sons » ──
  const curSound = () => [SOUND_BY_ID[S.sel], S.cfg.sounds[S.sel]];
  function viewSound() {
    const [def, sc] = curSound(), cat = CAT_BY_ID[def.cat], loop = def.kind === 'loop';
    if (S.fileIdx >= sc.files.length) S.fileIdx = Math.max(0, sc.files.length - 1);
    const f = sc.files[S.fileIdx];
    const pm = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)} ½t`;
    const sim = S.sim[def.id] || (S.sim[def.id] = def.id === 'engine' ? [0.8, 0.5] : def.id === 'wind' ? [0.16, 0.5] : [0.8, 0]);
    const simLbl = { wind: ['Force du vent', 'Brillance (vitesse)'], rain: ['Pluie'], gust: ['Tempête'], engine: ['Gaz', 'Régime'], static: ['Parasites', 'Clarté du signal'] }[def.id] || ['Niveau', 'Réglage'];
    return `
    <div class="head">
      <div class="ttl">
        <div class="chips"><span class="chip">${cat.icon} ${esc(cat.name)}</span><span class="chip mono">${def.id}</span><span class="chip">${loop ? '∞ Boucle continue' : 'Ponctuel'}</span></div>
        <h1>${esc(def.name)}</h1><p>${esc(def.desc)}</p>
      </div>
      <div class="tr">
        ${loop ? `<button class="bigplay${S.simOn.has(def.id) ? ' on' : ''}" data-a="sim" title="Lancer / arrêter la boucle (Espace)">${S.simOn.has(def.id) ? '■' : '▶'}</button>`
          : `<button class="bigplay" data-a="play" title="Écouter (Espace)">▶</button><button class="ghost" data-a="rand" title="Comme dans le jeu : variante au hasard, variation de hauteur">🎲 Au hasard</button>`}
        <button class="ghost" data-a="synth" title="Écouter le synthé d'origine (A)">🎛 Synthé d'origine</button>
      </div>
    </div>
    <div class="seg">${[['synth', '🎛 Synthé'], ['file', '📁 Fichiers'], ['off', '🔇 Muet']].map(([m, t]) => `<button data-src="${m}" class="${sc.src === m ? 'on' : ''}">${t}</button>`).join('')}
      <span class="segNote">${sc.src === 'file' ? (sc.files.length ? 'Le jeu joue vos fichiers.' : 'Aucun fichier : le synthé joue en attendant.') : sc.src === 'off' ? 'Ce son n\'est plus joué dans le jeu.' : 'Son généré par le jeu (aucun fichier).'}</span></div>
    <div class="variants" data-drop="variants">
      ${sc.files.map((x, i) => `<div class="var${i === S.fileIdx ? ' on' : ''}${missing(x.name) ? ' miss' : ''}" data-var="${i}" title="${esc(x.name)}${missing(x.name) ? ' — introuvable dans sounds/' : ''}"><b>${i + 1}</b><span>${esc(x.name)}</span><button data-rm="${i}" title="Retirer">✕</button></div>`).join('')}
      <button class="var add" data-a="addFile">＋ ${sc.files.length ? 'Variante' : 'Ajouter un fichier'}</button>
      <span class="hint">${sc.files.length > 1 ? `${sc.files.length} variantes, tirées au hasard (jamais deux fois la même d'affilée)` : sc.files.length ? (loop ? 'La boucle joue la zone découpée en continu' : 'Ajoutez des variantes pour éviter la répétition') : 'Glissez un fichier ici depuis la bibliothèque, ou déposez un mp3 / wav de votre ordinateur'}</span>
    </div>
    <div class="waveBox">
      <div class="wtools"><b class="wname"></b><span class="grow"></span>
        ${f ? `<button data-a="zoomAll" title="Tout voir (double-clic sur l'onde)">⤢ Tout</button><button data-a="zoomSel">🔍 Sélection</button>
        <button data-a="trimSil" title="Place début et fin sur le premier et le dernier son audible">✂ Couper les silences</button><button data-a="resetTrim">↔ Fichier entier</button>` : ''}</div>
      <div class="wslot"></div>
      <div class="wstats">${f ? `<label>Début <input type="number" data-f="start" min="0" step="1"> ms</label><label>Fin <input type="number" data-f="end" min="0" step="1"> ms</label><span>Durée <b class="wdur">–</b></span><span>Pic <b class="wpk">–</b></span><span>Sonie <b class="wrms">–</b></span>` : '<span class="muted">Le synthé est affiché à titre indicatif : ajoutez un fichier pour découper et calibrer.</span>'}</div>
    </div>
    ${f ? `<div class="cal"><h3>Calibrage du fichier ${S.fileIdx + 1}</h3>
      ${sl('fgain', 'Gain du fichier', -30, 30, 0.1, () => f.gain, (x) => { f.gain = x; }, fmtDb, 0, 'Égalise ce fichier avec les autres variantes, avant le volume du son.')}
      <div class="calBtns"><button data-a="normPeak" title="Monte ou baisse le fichier pour que son pic atteigne −1 dBFS">Normaliser le pic (−1 dB)</button>
      <button data-a="normRms" title="Même sonie perçue que les autres sons calibrés">Normaliser la sonie (−18 dB)</button>
      ${sc.files.length > 1 ? '<button data-a="normAll" title="Toutes les variantes à la même sonie">Égaliser les variantes</button>' : ''}</div></div>` : ''}
    <div class="params"><h3>Réglages du son</h3><div class="grid2">
      ${sl('vol', 'Volume', -40, 12, 0.5, () => sc.vol, (x) => { sc.vol = x; }, fmtDb, 0, 'Volume du son dans le mixage.')}
      ${sl('send', 'Réverb (envoi)', 0, 1, 0.01, () => sc.send, (x) => { sc.send = x; }, (x) => `${Math.round(x * 100)} %`, CAT_BY_ID[def.cat].send, 'Part du son envoyée dans la réverb (onglet Réverb pour régler la salle).')}
      ${sl('pitch', 'Hauteur', -24, 24, 0.5, () => sc.pitch, (x) => { sc.pitch = x; }, pm, 0, 'En demi-tons (accélère ou ralentit aussi le fichier).')}
      ${loop ? '' : sl('rand', 'Variation aléatoire', 0, 6, 0.1, () => sc.rand, (x) => { sc.rand = x; }, (x) => `± ${x.toFixed(1)} ½t`, 0, 'Chaque lecture change un peu de hauteur : moins de répétition.')}
      ${loop ? '' : sl('fadeIn', 'Fondu d\'entrée', 0, 2, 0.005, () => sc.fadeIn, (x) => { sc.fadeIn = x; }, fmtSec, 0, 'Aussi réglable avec la pastille rouge à gauche de l\'onde.')}
      ${loop ? '' : sl('fadeOut', 'Fondu de sortie', 0, 3, 0.005, () => sc.fadeOut, (x) => { sc.fadeOut = x; }, fmtSec, 0, 'Aussi réglable avec la pastille rouge à droite de l\'onde.')}
      ${loop ? '' : sl('voices', 'Voix simultanées', 1, 16, 1, () => sc.voices, (x) => { sc.voices = x; }, (x) => `${x}`, def.voices || 8, 'Au-delà, la plus ancienne est coupée (utile pour les rafales et les pas).')}
      ${def.rpm && sc.files.length ? sl('lo', 'Hauteur au ralenti', 0.2, 2, 0.01, () => sc.lo, (x) => { sc.lo = x; }, (x) => `× ${x.toFixed(2)}`, 0.6, 'Vitesse de lecture du fichier au régime minimum.') : ''}
      ${def.rpm && sc.files.length ? sl('hi', 'Hauteur plein régime', 0.2, 3, 0.01, () => sc.hi, (x) => { sc.hi = x; }, (x) => `× ${x.toFixed(2)}`, 1.7, 'Vitesse de lecture du fichier au régime maximum.') : ''}
    </div></div>
    ${loop ? `<div class="sim"><h3>Simulateur <small>le jeu pilote cette boucle en continu : testez-la comme en jeu</small></h3><div class="grid2">
      ${sl('simA', simLbl[0], 0, def.id === 'wind' ? 0.3 : 1, 0.01, () => sim[0], (x) => { sim[0] = x; }, (x) => `${Math.round((x / (def.id === 'wind' ? 0.3 : 1)) * 100)} %`, sim[0])}
      ${simLbl[1] ? sl('simB', simLbl[1], 0, 1, 0.01, () => sim[1], (x) => { sim[1] = x; }, (x) => `${Math.round(x * 100)} %`, sim[1]) : ''}
    </div></div>` : ''}
    <div class="foot"><button data-a="resetSound">↺ Réinitialiser ce son</button></div>`;
  }
  let waveTok = 0;
  async function updateWave() {
    const tok = ++waveTok;
    if (S.view === 'music') return updateTrackWave(tok);
    const [def, sc] = curSound(), f = sc.files[S.fileIdx];
    const fades = { get in() { return sc.fadeIn; }, set in(v) { sc.fadeIn = v; }, get out() { return sc.fadeOut; }, set out(v) { sc.fadeOut = v; } };
    wave.onChange = (end) => { live(); syncWaveStats(); syncSliders(); if (end) commit(); };
    wave.onSeek = (t) => previewFrom(t);
    const nm = el.main.querySelector('.wname');
    if (f) {
      if (nm) nm.textContent = `${S.fileIdx + 1} · ${f.name}`;
      if (!wave.buf || wave.entry !== f) wave.set(null, null, { note: 'Chargement…' });
      const e = await audio.load(f.name);
      if (tok !== waveTok) return;
      if (e.err) { wave.set(null, null, { note: `${f.name} : ${e.err}` }); syncWaveStats(); return; }
      wave.set(e.buf, f, { editable: true, fades: def.kind === 'loop' ? null : fades, gain: dbToGain(f.gain), label: def.kind === 'loop' ? '∞ zone jouée en boucle' : '' });
    } else {
      if (nm) nm.textContent = def.kind === 'loop' ? 'Boucle de synthèse (générée en direct)' : 'Synthé d\'origine (aperçu)';
      if (def.kind === 'loop') { wave.set(null, null, { note: 'Boucle générée en direct par le jeu : lancez-la avec ▶' }); return; }
      let b = S.synthBufs[def.id];
      if (!b) { wave.set(null, null, { note: 'Rendu du synthé…' }); b = S.synthBufs[def.id] = await audio.renderSynth(def.id, def.id === 'note' ? 523.25 : def.id.startsWith('thunder') ? 0.8 : undefined); }
      if (tok !== waveTok) return;
      wave.set(b, null, { editable: false, label: 'synthé · lecture seule' });
    }
    syncWaveStats();
  }
  function syncWaveStats() {
    const box = el.main.querySelector('.wstats');
    if (!box || S.view !== 'sound') return;
    const [, sc] = curSound(), f = sc.files[S.fileIdx];
    if (!f) return;
    const bi = box.querySelectorAll('input[data-f]');
    const D = wave.buf && wave.entry === f ? wave.buf.duration : 0;
    const end = f.end > f.start ? f.end : D;
    for (const i of bi) if (document.activeElement !== i) i.value = Math.round((i.dataset.f === 'start' ? f.start : end) * 1000);
    if (!D) return;
    const a = analyze(wave.buf, f.start, f.end), g = f.gain;
    const pk = gainToDb(a.peak) + g, rms = gainToDb(a.rms) + g;
    box.querySelector('.wdur').textContent = fmtT(Math.max(0, end - f.start));
    const p = box.querySelector('.wpk'); p.textContent = `${fmtDb(pk)}FS`; p.classList.toggle('warn', pk > 0);
    box.querySelector('.wrms').textContent = fmtDb(rms);
    wave.gain = dbToGain(g);
  }
  function syncSliders() {
    el.main.querySelectorAll('.sl').forEach((l) => {
      const d = S.sliders.get(l.dataset.k), inp = l.querySelector('input');
      if (!d || document.activeElement === inp) return;
      const v = d.get(); inp.value = v; l.querySelector('output').textContent = d.fmt(v);
    });
  }
  function stopPreview() { S.voice?.stop(); S.voice = null; }
  function pitchMul(sc) { return Math.pow(2, (sc.pitch || 0) / 12); }
  function previewFrom(t) {
    audio.init();
    stopPreview();
    if (!wave.buf) return;
    if (S.view === 'music') {
      const tr = curTrack();
      if (!tr) return;
      S.voice = audio.playEntry('music:amb', wave.buf, tr.f, { from: t, v: dbToGain(S.cfg.music.moods[tr.m].vol) });
      return;
    }
    const [def, sc] = curSound(), f = sc.files[S.fileIdx];
    if (!f) { S.voice = audio.playEntry(def.id, wave.buf, { start: 0, end: 0, gain: 0 }, { from: t }); return; }
    S.voice = audio.playEntry(def.id, wave.buf, f, { from: t, p: pitchMul(sc), fadeIn: sc.fadeIn, fadeOut: sc.fadeOut });
  }
  function playCurrent({ random = false, synth = false } = {}) {
    audio.init();
    const [def, sc] = curSound();
    if (def.kind === 'loop' && !synth) { toggleSim(def.id); return; }
    if (S.voice && !S.voice.done && !random && !synth) { stopPreview(); return; }
    stopPreview();
    if (sc.src === 'off' && !synth) toast('Ce son est muet', 'Il n\'est plus joué dans le jeu. Choisissez Synthé ou Fichiers.', 'bad', 2200);
    const arg = def.id === 'note' ? 523.25 : def.id.startsWith('thunder') ? 0.8 : undefined;
    if (synth) {
      if (def.kind === 'loop') { toast('Boucle de synthèse', 'Passez la source sur « Synthé » et lancez la boucle pour l\'entendre.', 'good', 2600); return; }
      audio.play(def.id, { force: 'synth', arg }); return;
    }
    const vo = audio.play(def.id, { arg, fileIndex: random || sc.src !== 'file' || !sc.files.length ? null : S.fileIdx, force: sc.src === 'off' ? (sc.files.length ? 'file' : 'synth') : null });
    if (vo) S.voice = vo;
  }
  function toggleSim(id, on = !S.simOn.has(id)) {
    audio.init();
    const sim = S.sim[id] || (S.sim[id] = id === 'engine' ? [0.8, 0.5] : id === 'wind' ? [0.16, 0.5] : [0.8, 0]);
    if (on) { S.simOn.add(id); audio.setLoop(id, sim[0], sim[1]); } else { S.simOn.delete(id); audio.setLoop(id, 0, sim[1]); }
    renderList();
    const b = el.main.querySelector('[data-a=sim]');
    if (b) { b.classList.toggle('on', on); b.textContent = on ? '■' : '▶'; }
  }

  // ── vue « Console » ──
  function viewMixer() {
    const strip = (c) => {
      const cc = S.cfg.cats[c.id];
      return `<div class="strip${cc.mute ? ' muted' : ''}${audio.solo === c.id ? ' soloed' : ''}" data-cat="${c.id}">
        <b class="ic">${c.icon}</b>
        <div class="fz"><canvas class="mt" data-m="${c.id}"></canvas><input type="range" class="vf" data-cat="${c.id}" min="-40" max="12" step="0.5" value="${cc.vol}" aria-label="Volume ${esc(c.name)}"></div>
        <output>${fmtDb(cc.vol)}</output>
        <div class="ms"><button data-mute="${c.id}" class="${cc.mute ? 'on' : ''}" title="Muet (enregistré)">M</button><button data-solo="${c.id}" class="${audio.solo === c.id ? 'on' : ''}" title="Solo (le temps d'écouter, non enregistré)">S</button></div>
        <button class="tst" data-test="${c.id}" title="${c.id === 'music' ? 'Allumer / éteindre le poste radio' : 'Jouer un son de cette famille'}">▶</button>
        <span class="nm">${esc(c.name)}</span></div>`;
    };
    return `<div class="head"><div class="ttl"><h1>Console de mixage</h1><p>Un fader par famille de sons : équilibrez armes, créatures, ambiance… Les vumètres bougent avec ce qui joue ici (lancez des sons, des boucles, une ambiance). Les joueurs gardent leurs réglages « Volume général » et « Musique ».</p></div></div>
    <div class="mixer">${CATS.map(strip).join('')}
      <div class="strip master" data-cat="master"><b class="ic">🎚</b>
        <div class="fz"><canvas class="mt" data-m="master"></canvas><input type="range" class="vf" data-cat="master" min="-30" max="12" step="0.5" value="${S.cfg.master}" aria-label="Volume général"></div>
        <output>${fmtDb(S.cfg.master)}</output><div class="gr" title="Réduction du limiteur (évite la saturation)">lim. <b>0.0</b></div>
        <button class="tst" data-a="stopAll" title="Tout arrêter (Échap)">■</button><span class="nm">Général</span></div>
    </div>`;
  }
  function drawMeters() {
    el.main.querySelectorAll('canvas.mt').forEach((cv) => {
      const k = cv.dataset.m, m = audio.meter(k), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const y = (db) => h - (clamp((db + 60) / 66, 0, 1) * h);
      const pk = gainToDb(m.peak), rms = gainToDb(m.rms);
      const hold = S.peakHold[k] = Math.max(pk, (S.peakHold[k] ?? -120) - 0.5);
      c.fillStyle = '#0b1022'; c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#5ef2c2'); g.addColorStop(0.72, '#ffd166'); g.addColorStop(0.92, '#ff6b5b');
      c.fillStyle = g; c.globalAlpha = 0.45; c.fillRect(0, y(pk), w, h - y(pk));
      c.globalAlpha = 1; c.fillRect(2, y(rms), w - 4, h - y(rms));
      c.fillStyle = hold > -0.5 ? '#ff5a5a' : '#fff4e0'; c.fillRect(0, y(hold), w, 2);
      c.fillStyle = 'rgba(255,244,224,.25)'; for (const d of [0, -6, -12, -24, -48]) c.fillRect(0, y(d), 3, 1);
    });
    const gr = el.main.querySelector('.gr b');
    if (gr) { const r = audio.reduction; gr.textContent = r > -0.05 ? '0.0' : r.toFixed(1); gr.parentElement.classList.toggle('on', r < -0.5); }
  }

  // ── vue « Réverb » ──
  function viewReverb() {
    const R = S.cfg.reverb;
    const rs = (k, label, min, max, step, fmt, info) => sl(`rv.${k}`, label, min, max, step, () => R[k], (x) => { R[k] = x; R.preset = 'custom'; }, fmt, REVERB_PRESETS[1][k], info);
    const test = pref.revTest && SOUND_BY_ID[pref.revTest] ? pref.revTest : 'gun.pistol';
    let sends = '';
    for (const c of CATS) {
      if (c.id === 'music') continue;
      const items = SOUNDS.filter((s) => s.cat === c.id);
      sends += `<div class="sgrp"><h4>${c.icon} ${esc(c.name)}</h4>${sl(`cs.${c.id}`, 'Toute la famille', 0, 1, 0.01, () => items.reduce((a, s) => a + S.cfg.sounds[s.id].send, 0) / items.length, (x) => items.forEach((s) => { S.cfg.sounds[s.id].send = x; }), (x) => `${Math.round(x * 100)} %`, c.send, 'Règle l\'envoi de tous les sons de la famille')}
        ${items.map((s) => `<div class="srow">${sl(`sd.${s.id}`, esc(s.name), 0, 1, 0.01, () => S.cfg.sounds[s.id].send, (x) => { S.cfg.sounds[s.id].send = x; }, (x) => `${Math.round(x * 100)} %`, c.send)}<button class="pl" data-play="${s.id}" title="Écouter">▶</button></div>`).join('')}</div>`;
    }
    sends += `<div class="sgrp"><h4>🎵 Musiques</h4>${sl('music.send', 'Ambiances et radio', 0, 1, 0.01, () => S.cfg.music.send, (x) => { S.cfg.music.send = x; }, (x) => `${Math.round(x * 100)} %`, 0.08)}</div>`;
    return `<div class="head"><div class="ttl"><h1>Réverb</h1><p>Une salle partagée par tous les sons : elle donne de la profondeur et de l'espace. Choisissez un préréglage, affinez, puis dosez l'envoi de chaque son (un tir porte loin, une interface reste sèche).</p></div>
      <div class="tr"><select class="revTest" aria-label="Son de test">${SOUNDS.filter((s) => s.kind !== 'loop').map((s) => `<option value="${s.id}"${s.id === test ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select><button class="bigplay" data-a="revTest" title="Écouter le son de test (Espace)">▶</button></div></div>
    <div class="presets">${REVERB_PRESETS.map((p) => `<button data-preset="${p.id}" class="${R.preset === p.id ? 'on' : ''}"><i>${p.icon}</i><span>${p.name}</span><small>${p.decay} s</small></button>`).join('')}<span class="pcustom${R.preset === 'custom' ? ' on' : ''}">✎ Sur mesure</span></div>
    <div class="revMain"><div class="irBox"><canvas class="ir"></canvas><small>Réponse de la salle (pré-délai puis décroissance)</small></div>
      <div class="grid1">
        ${rs('decay', 'Durée (taille)', 0.1, 8, 0.05, (x) => `${x.toFixed(2)} s`, 'Temps de décroissance de 60 dB.')}
        ${rs('pre', 'Pré-délai', 0, 200, 1, (x) => `${Math.round(x)} ms`, 'Écart entre le son direct et la réverb : sensation de grand espace.')}
        ${rs('tone', 'Tonalité', 800, 16000, 50, (x) => `${(x / 1000).toFixed(1)} kHz`, 'Coupe les aigus de la réverb : plus bas = plus sombre, plus doux.')}
        ${rs('early', 'Premières réflexions', 0, 1, 0.01, (x) => `${Math.round(x * 100)} %`, 'Échos rapprochés des murs : pièce, hangar.')}
        ${rs('wet', 'Niveau de retour', 0, 1.5, 0.01, (x) => `${Math.round(x * 100)} %`, 'Volume global de la réverb.')}
      </div></div>
    <h3 class="sep">Envoi de chaque son vers la réverb</h3><div class="sends">${sends}</div>`;
  }
  function drawIR() {
    const cv = el.main.querySelector('canvas.ir');
    const ir = audio.reverbIR;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b1022'; c.fillRect(0, 0, w, h);
    if (!ir) return;
    const R = S.cfg.reverb, total = Math.max(1, R.pre / 1000 + ir.duration), d = ir.getChannelData(0), sr = ir.sampleRate;
    const x0 = (R.pre / 1000 / total) * w;
    c.fillStyle = 'rgba(255,209,102,.18)'; c.fillRect(0, 0, x0, h);
    c.fillStyle = '#5ef2c2';
    const per = (ir.duration / total) * w;
    for (let px = 0; px < per; px++) {
      const a = Math.floor((px / per) * d.length), b = Math.floor(((px + 1) / per) * d.length);
      let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(d[i]));
      const y = Math.min(1, m) * (h - 8);
      c.fillRect(x0 + px, h - y, 1, y);
    }
    c.fillStyle = '#8a92b8'; c.font = '600 11px "Bricolage Grotesque", system-ui';
    c.fillText(`${total.toFixed(1)} s`, w - 34, 14);
    void sr;
  }

  // ── vue « Ambiances » ──
  const curTrack = () => { const t = S.track; if (!t) return null; const f = S.cfg.music.moods[t.m]?.files[t.i]; return f ? { m: t.m, i: t.i, f } : null; };
  function viewMusic() {
    const M = S.cfg.music, g = S.game && performance.now() - S.game.seen < 5000 ? S.game : null;
    const tr = curTrack();
    const card = (m) => {
      const mc = M.moods[m.id];
      return `<article class="mood${S.moodPreview === m.id ? ' live' : ''}${g?.mood === m.id ? ' ingame' : ''}" data-drop="mood:${m.id}" data-mood="${m.id}">
        <header><i>${m.icon}</i><div><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div></header>
        ${sl(`mv.${m.id}`, 'Volume', -30, 12, 0.5, () => mc.vol, (x) => { mc.vol = x; }, fmtDb, 0)}
        <ol class="tracks">${mc.files.map((f, i) => `<li class="${tr && tr.m === m.id && tr.i === i ? 'on' : ''}${missing(f.name) ? ' miss' : ''}" data-ti="${i}"><button class="pl" data-tplay="${m.id}:${i}" title="Écouter">${S.voice?.track === `${m.id}:${i}` ? '■' : '▶'}</button><span title="${esc(f.name)}">${esc(f.name.split('/').pop())}</span><small>${f.gain ? fmtDb(f.gain) : ''}${f.start || f.end ? ' ✂' : ''}</small><button data-tedit="${m.id}:${i}" title="Découper / calibrer">✎</button><button data-trm="${m.id}:${i}" title="Retirer">✕</button></li>`).join('')
          || `<li class="empty">${m.fallback ? 'Vide : « Détente » est jouée à la place.' : m.id === 'radio' ? 'Vide : boucle chiptune du poste.' : 'Glissez des musiques ici (mp3 conseillé).'}</li>`}</ol>
        <footer><button data-madd="${m.id}">＋ Ajouter</button>
          ${m.id === 'radio' ? `<button data-radio class="${S.radioOn ? 'on' : ''}">${S.radioOn ? '■ Éteindre' : '▶ Allumer le poste'}</button>`
            : `<button data-mprev="${m.id}" class="${S.moodPreview === m.id ? 'on' : ''}" title="Joue cette ambiance ici comme dans le jeu (fondus, enchaînements)">${S.moodPreview === m.id ? '■ Arrêter' : '▶ Écouter l\'ambiance'}</button>
          <button data-mforce="${m.id}" class="${S.gameForce === m.id ? 'on' : ''}" title="Impose cette ambiance dans le jeu ouvert (pour tester)">🎮 ${S.gameForce === m.id ? 'Imposée' : 'Imposer au jeu'}</button>`}
        </footer></article>`;
    };
    return `<div class="head"><div class="ttl"><h1>Ambiances musicales</h1><p>Le jeu choisit l'ambiance selon la situation et passe de l'une à l'autre en fondu enchaîné. Mettez plusieurs morceaux par ambiance : ils sont mélangés.</p></div>
      <div class="gameNow">${g ? `🎮 Dans le jeu : <b>${esc(MOODS.find((x) => x.id === g.mood)?.name || 'silence')}</b>${g.track ? ` · ♪ ${esc(g.track)}` : ''}${g.forced ? ' <em>(imposée)</em>' : ''}` : '🎮 Jeu non ouvert dans ce navigateur'}</div></div>
    <div class="grid3">
      ${sl('music.xfade', 'Fondu enchaîné', 0, 12, 0.5, () => M.xfade, (x) => { M.xfade = x; }, (x) => `${x.toFixed(1)} s`, 4, 'Durée des fondus entre ambiances et en début de morceau.')}
      ${sl('music.gap', 'Silence entre morceaux', 0, 30, 0.5, () => M.gap, (x) => { M.gap = x; }, (x) => `${x.toFixed(1)} s`, 3)}
      ${sl('music.send2', 'Réverb des musiques', 0, 1, 0.01, () => M.send, (x) => { M.send = x; }, (x) => `${Math.round(x * 100)} %`, 0.08)}
    </div>
    <div class="moods">${MOODS.map(card).join('')}</div>
    ${tr ? `<div class="trackEd"><div class="wtools"><b>✎ ${esc(MOODS.find((x) => x.id === tr.m).name)} · ${esc(tr.f.name)}</b><span class="grow"></span>
        <button data-a="zoomAll">⤢ Tout</button><button data-a="zoomSel">🔍 Sélection</button><button data-a="trimSil">✂ Couper les silences</button><button data-a="resetTrim">↔ Fichier entier</button><button data-a="closeTrack">✕</button></div>
      <div class="wslot"></div>
      <div class="wstats"><span>Durée <b class="wdur">–</b></span><span>Pic <b class="wpk">–</b></span><span>Sonie <b class="wrms">–</b></span></div>
      <div class="grid2">${sl('tgain', 'Gain du morceau', -30, 30, 0.1, () => tr.f.gain, (x) => { tr.f.gain = x; }, fmtDb, 0)}
      <div class="calBtns"><button data-a="normRms" title="Toutes les musiques calibrées à la même sonie">Normaliser la sonie (−20 dB)</button><button data-a="normPeak">Normaliser le pic (−1 dB)</button></div></div></div>` : ''}`;
  }
  async function updateTrackWave(tok) {
    const tr = curTrack();
    if (!tr) return;
    // longue musique : pas d'analyse à chaque mouvement du glissé
    wave.onChange = (end) => { live(); if (end || wave.buf?.length < 2e6) trackStats(); if (end) commit(); };
    wave.onSeek = (t) => previewFrom(t);
    if (!wave.buf || wave.entry !== tr.f) wave.set(null, null, { note: 'Décodage du morceau…' });
    const e = await audio.load(tr.f.name);
    if (tok !== waveTok) return;
    if (e.err) { wave.set(null, null, { note: `${tr.f.name} : ${e.err}` }); return; }
    wave.set(e.buf, tr.f, { editable: true, gain: dbToGain(tr.f.gain) });
    trackStats();
  }
  function trackStats() {
    const tr = curTrack(), box = el.main.querySelector('.trackEd .wstats');
    if (!tr || !box || !wave.buf) return;
    const f = tr.f, end = f.end > f.start ? f.end : wave.buf.duration, a = analyze(wave.buf, f.start, f.end);
    box.querySelector('.wdur').textContent = fmtT(end - f.start);
    const pk = gainToDb(a.peak) + f.gain, p = box.querySelector('.wpk');
    p.textContent = `${fmtDb(pk)}FS`; p.classList.toggle('warn', pk > 0);
    box.querySelector('.wrms').textContent = fmtDb(gainToDb(a.rms) + f.gain);
    wave.gain = dbToGain(f.gain);
  }

  // ── calibrage ──
  // sonie : jamais au point de saturer (le pic reste sous −1 dBFS) ; renvoie 'capped' si le pic a limité le gain
  async function normalize(kind, entry, target) {
    const e = await audio.load(entry.name);
    if (!e.buf) return false;
    const a = analyze(e.buf, entry.start, entry.end), peakDb = gainToDb(a.peak);
    let g = target - (kind === 'peak' ? peakDb : gainToDb(a.rms));
    const capped = kind === 'rms' && g > -1 - peakDb;
    if (capped) g = -1 - peakDb;
    entry.gain = +clamp(g, -30, 30).toFixed(1);
    return capped ? 'capped' : true;
  }
  function editedEntry() { return S.view === 'music' ? curTrack()?.f : curSound()[1].files[S.fileIdx]; }

  // ── choix de fichier (bouton « ＋ ») ──
  function pick(anchor, onPick) {
    const P = el.picker, inp = P.querySelector('input'), ul = P.querySelector('ul');
    if (!S.files.length) { toast('Bibliothèque vide', S.server ? 'Importez des sons (colonne de droite) ou copiez-les dans sounds/, puis F9.' : 'Serveur non connecté.', 'bad', 4000); return; }
    const draw = () => {
      const f = inp.value.trim().toLowerCase();
      ul.innerHTML = S.files.filter((x) => !f || x.name.toLowerCase().includes(f)).map((x) => `<li data-pick="${esc(x.name)}">${esc(x.name)}<small>${fmtSize(x.size)}</small></li>`).join('') || '<li class="empty">Aucun fichier</li>';
    };
    const r = anchor.getBoundingClientRect();
    P.style.left = `${Math.min(r.left, innerWidth - 340)}px`;
    P.style.top = `${Math.min(r.bottom + 6, innerHeight - 320)}px`;
    P.hidden = false; inp.value = ''; draw(); inp.focus();
    inp.oninput = draw;
    ul.onclick = (e) => { const li = e.target.closest('[data-pick]'); if (!li) return; onPick(li.dataset.pick); if (!e.shiftKey) P.hidden = true; };
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!P.contains(e.target)) { P.hidden = true; document.removeEventListener('pointerdown', off); } }), 0);
  }
  function assign(target, names) {
    if (!names.length) return;
    if (target.startsWith('sound:') || target === 'variants') {
      const id = target === 'variants' ? S.sel : target.slice(6), sc = S.cfg.sounds[id];
      change(() => {
        for (const n of names) if (!sc.files.some((f) => f.name === n)) sc.files.push(defaultFile(n));
        sc.src = 'file';
      });
      if (id === S.sel) { S.fileIdx = sc.files.length - 1; renderView(); }
      toast(`${SOUND_BY_ID[id].name} : ${names.length > 1 ? `${names.length} fichiers` : names[0]}`, 'Source : fichiers');
    } else if (target.startsWith('mood:')) {
      const m = target.slice(5), mc = S.cfg.music.moods[m];
      change(() => { for (const n of names) if (!mc.files.some((f) => f.name === n)) mc.files.push(defaultFile(n)); });
      toast(`♪ ${MOODS.find((x) => x.id === m).name}`, `${names.length} morceau${names.length > 1 ? 'x' : ''} ajouté${names.length > 1 ? 's' : ''}`);
    }
  }

  // ── actions ──
  function select(id) {
    if (S.sel !== id) { S.sel = id; S.fileIdx = 0; stopPreview(); el.main.scrollTop = 0; }
    pref.sel = id; savePref();
    if (S.view !== 'sound') setView('sound'); else { renderList(); renderView(); }
    el.list.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function setView(v) { if (v !== S.view) el.main.scrollTop = 0; S.view = v; pref.view = v; savePref(); stopPreview(); renderViews(); renderList(); renderView(); }
  async function act(a, btn) {
    audio.init();
    const [def, sc] = curSound();
    switch (a) {
      case 'save': save(); break;
      case 'refresh': refresh(); break;
      case 'undo': if (S.undo.length) { S.redo.push(snap()); restore(S.undo.pop()); } break;
      case 'redo': if (S.redo.length) { S.undo.push(snap()); restore(S.redo.pop()); } break;
      case 'export': exportCfg(); break;
      case 'import': q('.impCfg').click(); break;
      case 'openGame': window.open('./', 'plane-is-out-game'); break;
      case 'resetAll': if (confirm('Tout remettre au synthé d\'origine ? (vos fichiers restent dans sounds/, Ctrl+Z pour revenir)')) change(() => { const d = defaultConfig(); Object.keys(S.cfg).forEach((k) => delete S.cfg[k]); Object.assign(S.cfg, d); }); break;
      case 'play': playCurrent(); break;
      case 'rand': playCurrent({ random: true }); break;
      case 'synth': playCurrent({ synth: true }); break;
      case 'sim': toggleSim(def.id); break;
      case 'stopAll': stopEverything(); break;
      case 'addFile': pick(btn, (n) => assign('variants', [n])); break;
      case 'zoomAll': wave.zoomAll(); break;
      case 'zoomSel': wave.zoomSel(); break;
      case 'trimSil': {
        const en = editedEntry();
        if (!en || !wave.buf) break;
        const b = silenceBounds(wave.buf);
        if (!b) { toast('Fichier silencieux', '', 'bad'); break; }
        change(() => { en.start = +b.start.toFixed(4); en.end = b.end >= wave.buf.duration - 0.001 ? 0 : +b.end.toFixed(4); }, { render: false });
        wave.draw(); syncWaveStats(); trackStats();
        toast('Silences coupés', `${fmtT(b.start)} → ${fmtT(b.end)}`);
        break;
      }
      case 'resetTrim': { const en = editedEntry(); if (en) { change(() => { en.start = 0; en.end = 0; }, { render: false }); wave.draw(); syncWaveStats(); trackStats(); } break; }
      case 'normPeak': case 'normRms': {
        const en = editedEntry();
        if (!en) break;
        const music = S.view === 'music';
        const ok = await normalize(a === 'normPeak' ? 'peak' : 'rms', en, a === 'normPeak' ? -1 : music ? -20 : -18);
        if (!ok) { toast('Fichier illisible', en.name, 'bad'); break; }
        live(); commit(); syncSliders(); syncWaveStats(); trackStats(); wave.draw();
        toast('Normalisé', `Gain du fichier : ${fmtDb(en.gain)}${ok === 'capped' ? ' (limité pour que le pic ne sature pas)' : ''}`);
        break;
      }
      case 'normAll': {
        let n = 0;
        for (const f of sc.files) if (await normalize('rms', f, -18)) n++;
        live(); commit(); syncSliders(); syncWaveStats(); wave.draw(); renderView();
        toast('Variantes égalisées', `${n} fichier${n > 1 ? 's' : ''} à −18 dB de sonie`);
        break;
      }
      case 'resetSound': change(() => { S.cfg.sounds[def.id] = defaultSound(def); }); break;
      case 'revTest': { const id = el.main.querySelector('.revTest').value; audio.play(id, { arg: id === 'note' ? 523.25 : 0.8 }); break; }
      case 'closeTrack': S.track = null; stopPreview(); renderView(); break;
      default: break;
    }
  }
  function stopEverything() {
    audio.stopAll(); stopPreview();
    S.libVoice?.stop(); S.libVoice = null;
    for (const id of [...S.simOn]) toggleSim(id, false);
    if (S.moodPreview) { S.moodPreview = null; audio.forceMood(null); }
    if (S.radioOn) { S.radioOn = false; audio.setMusic(false); }
    renderList(); renderLib(); if (S.view === 'music') renderView();
  }

  // ── événements ──
  root.addEventListener('click', (e) => {
    const t = e.target;
    const b = t.closest('button, [data-id], [data-var], li[data-ti]');
    if (!b) return;
    const d = b.dataset;
    if (d.view) { setView(d.view); return; }
    if (d.a) { if (b.closest('.more')) b.closest('.more').open = false; act(d.a, b); return; }
    if (d.play) {
      e.stopPropagation(); audio.init();
      const def = SOUND_BY_ID[d.play];
      if (def.kind === 'loop') toggleSim(def.id);
      else audio.play(def.id, { arg: def.id === 'note' ? 523.25 : def.id.startsWith('thunder') ? 0.8 : undefined });
      return;
    }
    if (d.lplay) {
      audio.init();
      const name = d.lplay;
      if (S.libVoice?.name === name) { S.libVoice.stop(); S.libVoice = null; renderLib(); return; }
      S.libVoice?.stop(); S.libVoice = { name, stop() {} };
      renderLib();
      audio.load(name).then((en) => {
        if (S.libVoice?.name !== name) return;
        if (!en.buf) { toast('Lecture impossible', `${name} : ${en.err}`, 'bad'); S.libVoice = null; renderLib(); return; }
        const v = audio.playEntry('preview', en.buf, { start: 0, end: 0, gain: 0 });
        S.libVoice = { name, stop: () => v.stop(), v };
      });
      return;
    }
    if (d.src) { change(() => { curSound()[1].src = d.src; }); if (d.src === 'file' && !curSound()[1].files.length) pick(el.main.querySelector('[data-a=addFile]'), (n) => assign('variants', [n])); return; }
    if (d.rm != null) { e.stopPropagation(); const i = +d.rm; change(() => { curSound()[1].files.splice(i, 1); }); return; }
    if (d.var != null && b.classList.contains('var')) { S.fileIdx = +d.var; stopPreview(); renderView(); return; }
    if (d.mute) { change(() => { const c = S.cfg.cats[d.mute]; c.mute = !c.mute; }); return; }
    if (d.solo) { audio.solo = audio.solo === d.solo ? null : d.solo; renderView(); return; }
    if (d.test) {
      audio.init();
      if (d.test === 'music') { S.radioOn = !S.radioOn; audio.setMusic(S.radioOn, 1); return; }
      const list = SOUNDS.filter((s) => s.cat === d.test && s.kind !== 'loop');
      const s = list[Math.floor(Math.random() * list.length)];
      if (s) audio.play(s.id, { arg: s.id === 'note' ? 523.25 : 0.8 });
      else { const l = SOUNDS.find((x) => x.cat === d.test && x.kind === 'loop'); if (l) toggleSim(l.id); }
      return;
    }
    if (d.preset) {
      const p = REVERB_PRESETS.find((x) => x.id === d.preset);
      change(() => { Object.assign(S.cfg.reverb, { preset: p.id, decay: p.decay, pre: p.pre, tone: p.tone, wet: p.wet, early: p.early }); });
      setTimeout(() => el.main.querySelector('[data-a=revTest]')?.click(), 120);
      return;
    }
    if (d.madd) { pick(b, (n) => assign(`mood:${d.madd}`, [n])); return; }
    if (d.mprev) { audio.init(); S.moodPreview = S.moodPreview === d.mprev ? null : d.mprev; audio.forceMood(S.moodPreview); renderView(); return; }
    if (d.mforce) { S.gameForce = S.gameForce === d.mforce ? null : d.mforce; audio.broadcast({ t: 'mood', mood: S.gameForce }); renderView(); if (!(S.game && performance.now() - S.game.seen < 5000)) toast('Jeu non ouvert', 'Ouvrez le jeu dans ce navigateur (menu ⋯).', 'bad'); return; }
    if (d.radio != null) { audio.init(); S.radioOn = !S.radioOn; audio.setMusic(S.radioOn, 1); renderView(); return; }
    if (d.tplay) {
      audio.init();
      const [m, i] = d.tplay.split(':'), f = S.cfg.music.moods[m].files[+i];
      if (S.voice?.track === d.tplay) { stopPreview(); renderView(); return; }
      stopPreview();
      audio.load(f.name).then((en) => {
        if (!en.buf) { toast('Lecture impossible', `${f.name} : ${en.err}`, 'bad'); return; }
        S.voice = audio.playEntry('music:amb', en.buf, f, { v: dbToGain(S.cfg.music.moods[m].vol) });
        S.voice.track = d.tplay;
        renderView();
      });
      return;
    }
    if (d.tedit) { const [m, i] = d.tedit.split(':'); S.track = { m, i: +i }; stopPreview(); renderView(); el.main.querySelector('.trackEd')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    if (d.trm) { const [m, i] = d.trm.split(':'); change(() => { S.cfg.music.moods[m].files.splice(+i, 1); }); if (S.track?.m === m) S.track = null; renderView(); return; }
    if (d.id && b.classList.contains('snd')) { select(d.id); return; }
    if (d.id && b.closest('.heard')) { select(d.id); return; }
  });
  // curseurs (délégués) : en direct pendant le glissé, historique au relâché, double-clic = défaut
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('.vf')) {
      const k = t.dataset.cat, v = +t.value;
      if (k === 'master') S.cfg.master = v; else S.cfg.cats[k].vol = v;
      t.closest('.strip').querySelector('output').textContent = fmtDb(v);
      live(); return;
    }
    const l = t.closest('.sl');
    if (l && t.type === 'range') {
      const d = S.sliders.get(l.dataset.k);
      if (!d) return;
      d.set(+t.value); l.querySelector('output').textContent = d.fmt(+t.value);
      onSlider(l.dataset.k);
      return;
    }
    if (t.matches('.search')) renderList();
    if (t.matches('.lSearch')) renderLib();
  });
  function onSlider(k) {
    if (k === 'simA' || k === 'simB') { const [def] = curSound(); if (S.simOn.has(def.id)) audio.setLoop(def.id, S.sim[def.id][0], S.sim[def.id][1]); return; }
    live();
    if (k === 'fgain' || k === 'tgain') { syncWaveStats(); trackStats(); wave.draw(); }
    if (k === 'fadeIn' || k === 'fadeOut') wave.draw();
    if (k.startsWith('rv.')) { el.main.querySelector('.pcustom')?.classList.add('on'); el.main.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('on')); setTimeout(drawIR, 130); }
    if (k.startsWith('cs.')) syncSliders();
    if (k.startsWith('sd.')) { const c = el.main.querySelector(`.sl[data-k="cs.${SOUND_BY_ID[k.slice(3)].cat}"]`); if (c) { const d = S.sliders.get(c.dataset.k); c.querySelector('input').value = d.get(); c.querySelector('output').textContent = d.fmt(d.get()); } }
  }
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('.vf') || (t.type === 'range' && t.closest('.sl'))) { commit(); if (t.closest('.sl')?.dataset.k.startsWith('mv.') || t.closest('.sl')?.dataset.k === 'tgain') renderView(); return; }
    if (t.matches('input[data-f]')) {
      const [, sc] = curSound(), f = sc.files[S.fileIdx];
      if (!f) return;
      const v = Math.max(0, (+t.value || 0) / 1000), D = wave.buf?.duration || 1e9;
      change(() => { if (t.dataset.f === 'start') f.start = Math.min(v, (f.end > 0 ? f.end : D) - 0.005); else f.end = v >= D - 0.001 ? 0 : Math.max(v, f.start + 0.005); }, { render: false });
      wave.draw(); syncWaveStats();
      return;
    }
    if (t.matches('.revTest')) { pref.revTest = t.value; savePref(); return; }
    if (t.matches('.upIn')) { upload(t.files); t.value = ''; return; }
    if (t.matches('.impCfg')) {
      const f = t.files[0]; t.value = '';
      f?.text().then((txt) => { try { const c = normalizeConfig(JSON.parse(txt)); change(() => { Object.keys(S.cfg).forEach((k) => delete S.cfg[k]); Object.assign(S.cfg, c); }); toast('Config importée', 'Enregistrez pour l\'écrire dans sounds/config.json'); } catch { toast('Fichier illisible', f.name, 'bad'); } });
    }
  });
  root.addEventListener('dblclick', (e) => {
    // bibliothèque : double-clic = ajouter au son affiché, ou à l'ambiance du morceau en cours d'édition
    const li = e.target.closest('li[data-name]');
    if (li) { if (S.view === 'sound') assign('variants', [li.dataset.name]); else if (S.view === 'music' && S.track) assign(`mood:${S.track.m}`, [li.dataset.name]); return; }
    const l = e.target.closest('.sl');
    if (!l) return;
    const d = S.sliders.get(l.dataset.k);
    if (!d || d.def == null) return;
    d.set(d.def); l.querySelector('input').value = d.def; l.querySelector('output').textContent = d.fmt(d.def);
    onSlider(l.dataset.k); commit();
  });

  // glisser-déposer : fichiers de la bibliothèque, ou fichiers de l'ordinateur (import)
  let dragDepth = 0;
  const isPio = (e) => [...(e.dataTransfer?.types || [])].includes('text/x-pio');
  const isOs = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  root.addEventListener('dragstart', (e) => {
    const li = e.target.closest?.('li[data-name]');
    if (!li) return;
    e.dataTransfer.setData('text/x-pio', li.dataset.name);
    e.dataTransfer.effectAllowed = 'copy';
    root.classList.add('dragging');
  });
  root.addEventListener('dragend', () => { root.classList.remove('dragging'); root.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); });
  root.addEventListener('dragenter', (e) => { if (isOs(e)) { dragDepth++; q('.dropOverlay').hidden = false; } });
  root.addEventListener('dragleave', (e) => { if (isOs(e) && --dragDepth <= 0) { dragDepth = 0; q('.dropOverlay').hidden = true; } });
  root.addEventListener('dragover', (e) => {
    if (!isPio(e) && !isOs(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const z = e.target.closest('[data-drop]');
    root.querySelectorAll('.over').forEach((x) => { if (x !== z) x.classList.remove('over'); });
    z?.classList.add('over');
  });
  root.addEventListener('drop', async (e) => {
    if (!isPio(e) && !isOs(e)) return;
    e.preventDefault();
    dragDepth = 0; q('.dropOverlay').hidden = true; root.classList.remove('dragging');
    const z = e.target.closest('[data-drop]');
    root.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    const target = z?.dataset.drop || (S.view === 'sound' && e.target.closest('.sMain') ? 'variants' : S.view === 'music' && e.target.closest('.sMain') ? null : 'lib');
    if (isPio(e)) { const n = e.dataTransfer.getData('text/x-pio'); if (n && target && target !== 'lib') assign(target, [n]); return; }
    const names = await upload(e.dataTransfer.files, target?.startsWith('mood:') ? 'music' : '');
    if (target && target !== 'lib') assign(target, names);
  });

  // clavier
  addEventListener('keydown', (e) => {
    const typing = e.target.matches?.('input[type=search], input[type=number], input[type=text], select, textarea');
    if (e.code === 'F9') { e.preventDefault(); refresh(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) { e.preventDefault(); act(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY' && !typing) { e.preventDefault(); act('redo'); return; }
    if (e.code === 'Escape') { el.picker.hidden = true; stopEverything(); if (typing) e.target.blur(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    // curseur sélectionné : les flèches le règlent, elles ne changent pas de son
    if (e.target.matches?.('input[type=range]') && e.code.startsWith('Arrow')) return;
    if (e.code === 'Slash') { e.preventDefault(); el.search.focus(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (document.activeElement?.matches('button, summary, input')) document.activeElement.blur();   // sinon Espace « clique » aussi le bouton
      if (S.view === 'sound') playCurrent();
      else if (S.view === 'reverb') act('revTest');
      else if (S.view === 'music' && curTrack()) { if (S.voice && !S.voice.done) stopPreview(); else previewFrom(curTrack().f.start); }
      return;
    }
    if (e.code === 'KeyA' && S.view === 'sound') { playCurrent({ synth: true }); return; }
    if ((e.code === 'ArrowDown' || e.code === 'ArrowUp') && S.view === 'sound') {
      e.preventDefault();
      const ids = [...el.list.querySelectorAll('.snd')].map((x) => x.dataset.id), i = ids.indexOf(S.sel);
      const n = ids[clamp(i + (e.code === 'ArrowDown' ? 1 : -1), 0, ids.length - 1)];
      if (n) select(n);
    }
    if (/^Digit[1-4]$/.test(e.code)) setView(['sound', 'mixer', 'reverb', 'music'][+e.code.slice(5) - 1]);
  });
  addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  // le navigateur n'autorise le son qu'après un geste
  const wake = () => audio.init();
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  // ── liens avec le jeu ──
  audio.on('reverb', () => { if (S.view === 'reverb') drawIR(); });
  audio.on('ended', (x) => { if (S.libVoice?.v === x) { S.libVoice = null; renderLib(); } });
  audio.on('remoteRefresh', () => refresh({ remote: true }));
  audio.on('pong', (m) => { S.game = { ...m, seen: performance.now() }; renderGame(); if (S.view === 'music') { const gn = el.main.querySelector('.gameNow'); if (gn) gn.innerHTML = `🎮 Dans le jeu : <b>${esc(MOODS.find((x) => x.id === m.mood)?.name || 'silence')}</b>${m.track ? ` · ♪ ${esc(m.track)}` : ''}${m.forced ? ' <em>(imposée)</em>' : ''}`; } });
  audio.on('played', (ids) => {
    for (const id of ids) {
      S.heard = [id, ...S.heard.filter((x) => x !== id)].slice(0, 8);
      const r = el.list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (r) { r.classList.remove('hit'); void r.offsetWidth; r.classList.add('hit'); }
    }
    renderHeard();
  });
  setInterval(() => { audio.broadcast({ t: 'ping' }); renderGame(); }, 1500);
  audio.broadcast({ t: 'ping' });

  // animation : tête de lecture, vumètres
  (function frame() {
    requestAnimationFrame(frame);
    if (S.voice) {
      if (S.voice.done) { const tr = S.voice.track; S.voice = null; wave.pos = null; wave.draw(); if (tr && S.view === 'music') renderView(); }
      else if (S.voice.buf === wave.buf) { wave.pos = S.voice.pos; wave.draw(); }
    } else if (wave.pos != null) { wave.pos = null; wave.draw(); }
    if (S.view === 'mixer') drawMeters();
  })();

  // ── démarrage ──
  (async () => {
    audio.init();
    renderAll();
    await loadList();
    const r = await audio.loadConfig();
    S.cfg = audio.config;
    S.saved = S.last = snap();
    renderAll();
    if (S.server && !r.ok) toast('Pas encore de config', 'sounds/config.json sera créé au premier enregistrement.', 'good', 4000);
  })();
}
