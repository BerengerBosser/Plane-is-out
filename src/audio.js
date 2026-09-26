// Moteur audio : chaque son du catalogue (sounds.js) est joué par le synthé intégré ou par des fichiers
// du dossier sounds/ (mp3, wav…), selon sounds/config.json réglé dans le studio son (/studio).
// Chemin du signal :  source → tranche du son (volume, envoi réverb) → bus de catégorie → général → limiteur
//                                                    └→ réverb à convolution partagée ─┘
// Musiques d'ambiance (détente, dramatique, vol…) et poste radio : lues en flux, avec fondus enchaînés.
// Studio et jeu ouverts dans le même navigateur se parlent (BroadcastChannel) : réglages en direct, F9 partout.
import { SOUNDS, SOUND_BY_ID, CATS, MOODS, defaultConfig, normalizeConfig, dbToGain } from './sounds.js';

const CHANNEL = 'plane-is-out-sound';
const LOOP_IDS = SOUNDS.filter((s) => s.kind === 'loop').map((s) => s.id);
const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));

// ── synthé : kit lié à un contexte (temps réel, ou hors ligne pour dessiner la forme d'onde dans le studio) ──
function makeKit(ctx) {
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.3; d[i] = last; }
  const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.35);
  const ny = ctx.sampleRate / 2 - 100;
  // o = { t: début, v: volume, p: hauteur (multiplicateur) }
  function burst(out, o, { dur = 0.3, freq = 800, type = 'lowpass', vol = 0.5, q = 1, delay = 0 }) {
    const p = o.p, t = o.t + delay / p, dd = dur / p;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = Math.min(ny, freq * p); f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(1e-4, vol * o.v), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dd);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random()); s.stop(t + dd + 0.05);
  }
  function tone(out, o, { f0 = 440, f1 = f0, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 }) {
    const p = o.p, t = o.t + delay / p, dd = dur / p;
    const osc = ctx.createOscillator(); osc.type = type;
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(Math.min(ny, f0 * p), t);
    osc.frequency.exponentialRampToValueAtTime(Math.min(ny, Math.max(20, f1 * p)), t + dd);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vol * o.v), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dd);
    osc.connect(g).connect(out);
    osc.start(t); osc.stop(t + dd + 0.05);
  }
  return { ctx, noise, white, burst, tone };
}

// sons ponctuels de synthèse : (kit, sortie, { t, v, p, arg })
const GUN = {
  shotgun: [[0.45, 900, 1.0], [0.12, 4000, 0.5, 'highpass'], ['t', 120, 40, 0.35, 0.45]],
  rifle: [[0.18, 2200, 0.8], [0.08, 6000, 0.4, 'highpass'], ['t', 160, 60, 0.14, 0.3]],
  smg: [[0.1, 2600, 0.6], [0.05, 6500, 0.3, 'highpass'], ['t', 200, 90, 0.08, 0.2]],
  revolver: [[0.35, 1200, 1.0], [0.1, 4500, 0.5, 'highpass'], ['t', 140, 45, 0.26, 0.42]],
  sniper: [[0.6, 1000, 1.0], [0.12, 7000, 0.6, 'highpass'], ['t', 110, 35, 0.5, 0.5]],
  launcher: [[0.25, 400, 0.9], ['t', 90, 50, 0.2, 0.45]],
  pistol: [[0.22, 1600, 0.85], [0.07, 5000, 0.45, 'highpass'], ['t', 180, 70, 0.16, 0.3]],
};
const gunSynth = (kind) => (K, out, o) => {
  for (const x of GUN[kind]) {
    if (x[0] === 't') K.tone(out, o, { f0: x[1], f1: x[2], dur: x[3], vol: x[4] });
    else K.burst(out, o, { dur: x[0], freq: x[1], vol: x[2], type: x[3] || 'lowpass' });
  }
  if (kind === 'sniper') K.tone(out, o, { f0: 900, f1: 700, dur: 0.06, type: 'square', vol: 0.05, delay: 0.45 });
};
function rumble(K, out, o, at, dur, freq, v, near) {
  const ctx = K.ctx, t = o.t + at;
  const s = ctx.createBufferSource(); s.buffer = K.noise; s.playbackRate.value = (0.5 + Math.random() * 0.2) * o.p;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * o.p;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(1e-4, v * o.v), t + 0.08 + (1 - near) * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.1);
}
const SYN = {
  ...Object.fromEntries(Object.keys(GUN).map((k) => [`gun.${k}`, gunSynth(k)])),
  splat: (K, out, o) => { K.burst(out, o, { dur: 0.18, freq: 500, vol: 0.5 }); K.tone(out, o, { f0: 90, f1: 50, dur: 0.12, vol: 0.2 }); },
  scream: (K, out, o) => { K.tone(out, o, { f0: 900, f1: 1600, dur: 0.9, type: 'sawtooth', vol: 0.09 }); K.tone(out, o, { f0: 1300, f1: 700, dur: 1.1, type: 'square', vol: 0.05, delay: 0.1 }); K.burst(out, o, { dur: 1.0, freq: 2500, type: 'bandpass', vol: 0.3, q: 2 }); },
  bloat: (K, out, o) => { K.burst(out, o, { dur: 0.9, freq: 300, vol: 1.0 }); K.tone(out, o, { f0: 80, f1: 30, dur: 0.7, vol: 0.5 }); K.burst(out, o, { dur: 1.4, freq: 1200, type: 'bandpass', vol: 0.3, q: 0.8 }); },
  pickup: (K, out, o) => K.tone(out, o, { f0: 520, f1: 780, dur: 0.12, type: 'triangle', vol: 0.15 }),
  drop: (K, out, o) => K.burst(out, o, { dur: 0.2, freq: 300, vol: 0.5 }),
  clank: (K, out, o) => { K.tone(out, o, { f0: 900, f1: 600, dur: 0.09, type: 'square', vol: 0.08 }); K.burst(out, o, { dur: 0.08, freq: 3000, type: 'bandpass', vol: 0.3, q: 4 }); },
  thud: (K, out, o) => { K.burst(out, o, { dur: 0.5, freq: 180, vol: 0.9 }); K.tone(out, o, { f0: 90, f1: 40, dur: 0.4, vol: 0.4 }); },
  explosion: (K, out, o) => { K.burst(out, o, { dur: 1.8, freq: 400, vol: 1.0 }); K.tone(out, o, { f0: 70, f1: 25, dur: 1.2, vol: 0.5 }); },
  splash: (K, out, o) => K.burst(out, o, { dur: 1.0, freq: 1400, type: 'bandpass', vol: 0.6, q: 0.7 }),
  ratchet: (K, out, o) => K.tone(out, o, { f0: 1400, f1: 1100, dur: 0.03, type: 'square', vol: 0.05 }),
  beep: (K, out, o) => K.tone(out, o, { f0: 880, dur: 0.08, type: 'square', vol: 0.06 }),
  note: (K, out, o) => K.tone(out, { ...o, p: 1 }, { f0: (o.arg || 523.25) * o.p, dur: 0.22, type: 'triangle', vol: 0.12 }),
  error: (K, out, o) => K.tone(out, o, { f0: 220, f1: 180, dur: 0.18, type: 'square', vol: 0.07 }),
  success: (K, out, o) => [523, 659, 784].forEach((f, i) => K.tone(out, o, { f0: f, dur: 0.22, type: 'triangle', vol: 0.14, delay: i * 0.1 })),
  squeak: (K, out, o) => { K.tone(out, o, { f0: 1300, f1: 1900, dur: 0.12, type: 'triangle', vol: 0.12 }); K.tone(out, o, { f0: 1900, f1: 1200, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.12 }); },
  spark: (K, out, o) => { K.burst(out, o, { dur: 0.35, freq: 5000, type: 'highpass', vol: 0.4, q: 0.5 }); K.tone(out, o, { f0: 120, dur: 0.3, type: 'sawtooth', vol: 0.1 }); },
  powerUp: (K, out, o) => { K.tone(out, o, { f0: 80, f1: 320, dur: 1.4, type: 'sawtooth', vol: 0.08 }); [0, 0.4, 0.8].forEach((d) => K.tone(out, o, { f0: 660, dur: 0.1, type: 'square', vol: 0.05, delay: 0.9 + d })); },
  pour: (K, out, o) => K.burst(out, o, { dur: 0.25, freq: 900, type: 'bandpass', vol: 0.2, q: 2 }),
  dig: (K, out, o) => K.burst(out, o, { dur: 0.18, freq: 500, vol: 0.5 }),
  door: (K, out, o) => { K.tone(out, o, { f0: 180, f1: 120, dur: 0.35, type: 'sawtooth', vol: 0.05 }); K.burst(out, o, { dur: 0.2, freq: 700, vol: 0.3 }); },
  whoosh: (K, out, o) => K.burst(out, o, { dur: 0.18, freq: 1800, type: 'bandpass', vol: 0.25, q: 1.2 }),
  hitFlesh: (K, out, o) => { K.burst(out, o, { dur: 0.18, freq: 500, vol: 0.9 }); K.tone(out, o, { f0: 140, f1: 70, dur: 0.15, vol: 0.3 }); },
  hitShell: (K, out, o) => { K.tone(out, o, { f0: 700, f1: 420, dur: 0.07, type: 'square', vol: 0.1 }); K.burst(out, o, { dur: 0.12, freq: 2400, type: 'bandpass', vol: 0.5, q: 3 }); },
  hurt: (K, out, o) => { K.tone(out, o, { f0: 220, f1: 120, dur: 0.25, type: 'sawtooth', vol: 0.12 }); K.burst(out, o, { dur: 0.2, freq: 300, vol: 0.6 }); },
  hiss: (K, out, o) => { K.burst(out, o, { dur: 1.4, freq: 2600, type: 'highpass', vol: 0.18, q: 0.5 }); K.tone(out, o, { f0: 110, f1: 70, dur: 1.2, type: 'sawtooth', vol: 0.05 }); },
  groan: (K, out, o) => { const f = 80 + Math.random() * 40; K.tone(out, o, { f0: f, f1: f * 0.7, dur: 1.1, type: 'sawtooth', vol: 0.07 }); K.tone(out, o, { f0: f * 1.5, f1: f, dur: 0.9, type: 'triangle', vol: 0.05, delay: 0.1 }); K.burst(out, o, { dur: 0.6, freq: 500, type: 'bandpass', vol: 0.05, q: 1.5 }); },
  radio: (K, out, o) => { K.burst(out, o, { dur: 0.35, freq: 3000, type: 'bandpass', vol: 0.25, q: 0.8 }); K.tone(out, o, { f0: 1200, dur: 0.06, type: 'square', vol: 0.05, delay: 0.3 }); },
  step: (K, out, o) => K.burst(out, o, { dur: 0.08, freq: 700, type: 'bandpass', vol: 0.12, q: 1.5 }),
  stepWater: (K, out, o) => K.burst(out, o, { dur: 0.08, freq: 1600, type: 'bandpass', vol: 0.18, q: 1.5 }),
  siren: (K, out, o) => { for (let i = 0; i < 3; i++) K.tone(out, o, { f0: 420, f1: 760, dur: 0.9, type: 'sawtooth', vol: 0.07, delay: i * 1.0 }); },
  thunder: (K, out, o) => { const near = o.arg || 0; rumble(K, out, o, 0, 3.5 + Math.random() * 1.5, 220 + near * 500, 0.6 + near * 0.6, near); rumble(K, out, o, 0.5 + Math.random() * 0.6, 2.8, 140, 0.45 + near * 0.3, near); },
  thunderCrack: (K, out, o) => {
    const ctx = K.ctx, t = o.t;
    const s = ctx.createBufferSource(); s.buffer = K.white; s.playbackRate.value = o.p;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.max(1e-4, 0.9 * o.v), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + 0.4);
  },
};
// durée à rendre hors ligne pour l'aperçu du studio
const SYN_LEN = { thunder: 6, siren: 3.2, bloat: 1.6, explosion: 2, powerUp: 2, hiss: 1.6, scream: 1.4, groan: 1.4, splash: 1.2 };

// boucles de synthèse : set(a, b, pm) avec pm = multiplicateur de hauteur du réglage « Hauteur »
const SYNLOOP = {
  wind(K, out) {
    const c = K.ctx;
    const s = c.createBufferSource(); s.buffer = K.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(out); s.start();
    return {
      set(v, b, pm) { const t = c.currentTime; g.gain.setTargetAtTime(v, t, 0.3); f.frequency.setTargetAtTime((400 + b * 900) * pm, t, 0.3); },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.05); s.stop(c.currentTime + 0.3); },
    };
  },
  rain(K, out) {
    const c = K.ctx;
    const s = c.createBufferSource(); s.buffer = K.white; s.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(hp).connect(lp).connect(g).connect(out); s.start();
    return {
      set(rain, _b, pm) { g.gain.setTargetAtTime(rain * 0.16, c.currentTime, 0.5); s.playbackRate.value = pm; },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.05); s.stop(c.currentTime + 0.3); },
    };
  },
  gust(K, out) {
    const c = K.ctx;
    const s = c.createBufferSource(); s.buffer = K.noise; s.loop = true; s.playbackRate.value = 0.7;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(out); s.start();
    return {
      set(storm, _b, pm) {
        const t = c.currentTime;
        const gust = storm * (0.1 + 0.08 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 1.9));
        g.gain.setTargetAtTime(Math.max(0, gust), t, 0.4);
        f.frequency.setTargetAtTime((280 + storm * 260) * pm, t, 0.5);
      },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.05); s.stop(c.currentTime + 0.3); },
    };
  },
  // parasites radio : souffle filtré ; b (0 → 1) = clarté du signal (le souffle se creuse, une porteuse monte)
  static(K, out) {
    const c = K.ctx;
    const s = c.createBufferSource(); s.buffer = K.white; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const og = c.createGain(); og.gain.value = 0;
    s.connect(f).connect(g).connect(out); o.connect(og).connect(out);
    s.start(); o.start();
    return {
      set(v, b, pm) {
        const t = c.currentTime;
        g.gain.setTargetAtTime(v * (1 - 0.85 * b), t, 0.05);
        og.gain.setTargetAtTime(v * 0.25 * b * b, t, 0.05);
        o.frequency.setTargetAtTime((700 + b * 300) * pm, t, 0.05);
        f.frequency.setTargetAtTime((1800 + Math.random() * 1400) * pm, t, 0.08);
      },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.05); og.gain.setTargetAtTime(0, c.currentTime, 0.05); s.stop(c.currentTime + 0.3); o.stop(c.currentTime + 0.3); },
    };
  },
  engine(K, out) {
    const c = K.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 82;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = c.createGain(); g.gain.value = 0;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(out);
    o1.start(); o2.start();
    return {
      set(level, rpm, pm) {
        const t = c.currentTime;
        g.gain.setTargetAtTime(level * 0.22, t, 0.1);
        o1.frequency.setTargetAtTime((45 + rpm * 70) * pm, t, 0.1);
        o2.frequency.setTargetAtTime((68 + rpm * 104) * pm, t, 0.1);
        f.frequency.setTargetAtTime((300 + rpm * 900) * pm, t, 0.1);
      },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.05); o1.stop(c.currentTime + 0.3); o2.stop(c.currentTime + 0.3); },
    };
  },
};

// poste radio sans fichier : petite boucle chiptune (Do – La m – Fa – Sol, 112 bpm en croches)
const CH = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]];
const MEL = [72, -1, 74, 76, 79, -1, 76, 74, 72, -1, 69, 72, 74, -1, 71, 67];
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function createAudio({ base = 'sounds/', role = 'game' } = {}) {
  let ctx = null, K = null, master, limiter, post;
  let cfg = defaultConfig();
  let playerVol = 0.7, musicVol = 0.8, solo = null;
  let bust = 0;                    // numéro d'actualisation : force le rechargement des fichiers
  const buses = {}, strips = {}, voices = {}, lastFile = {};
  const buffers = new Map();       // nom de fichier → { p, buf, err }
  const loops = {};
  const loopIn = { wind: [0, 0], rain: [0, 0], gust: [0, 0], engine: [0, 0], static: [0, 0] };
  let rev = null, revKey = '', revTimer = 0;
  const meters = {};
  const handlers = {};
  const emit = (k, v) => (handlers[k] || []).forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
  let studioSeen = 0, played = new Set();

  const url = (name) => base + name.split('/').map(encodeURIComponent).join('/') + (bust ? `?v=${bust}` : '');

  // ── graphe ──
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    K = makeKit(ctx);
    master = ctx.createGain();
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.2;
    post = ctx.createGain();
    master.connect(limiter).connect(post).connect(ctx.destination);
    rev = { in: ctx.createGain(), pre: ctx.createDelay(0.5), conv: ctx.createConvolver(), tone: ctx.createBiquadFilter(), out: ctx.createGain() };
    rev.tone.type = 'lowpass';
    rev.in.connect(rev.pre).connect(rev.conv).connect(rev.tone).connect(rev.out).connect(master);
    for (const c of CATS) {
      const b = { dry: ctx.createGain(), wet: ctx.createGain() };
      b.dry.connect(master); b.wet.connect(rev.in);
      buses[c.id] = b;
    }
    decks.amb = makeDeck('music:amb');
    decks.radio = makeDeck('music:radio');
    setInterval(musicTick, 200);
    setInterval(flushPlayed, 250);
    apply();
  }

  function catGain(id) {
    const c = cfg.cats[id];
    if (!c || c.mute || (solo && solo !== id)) return 0;
    return dbToGain(c.vol) * (id === 'music' ? musicVol : 1);
  }
  function strip(id) {
    if (strips[id]) return strips[id];
    const cat = SOUND_BY_ID[id]?.cat || 'music';
    const s = { in: ctx.createGain(), send: ctx.createGain(), cat };
    // « preview » (bibliothèque du studio) : écoute brute, sans famille ni réverb
    if (id === 'preview') s.in.connect(master);
    else { s.in.connect(buses[cat].dry); s.in.connect(s.send); s.send.connect(buses[cat].wet); }
    strips[id] = s;
    stripLevels(id, s, true);
    return s;
  }
  function stripLevels(id, s, now) {
    const sc = cfg.sounds[id];
    const vol = sc ? (sc.src === 'off' ? 0 : dbToGain(sc.vol)) : 1;
    const send = sc ? sc.send : id === 'preview' ? 0 : cfg.music.send;
    if (now) { s.in.gain.value = vol; s.send.gain.value = send; return; }
    s.in.gain.setTargetAtTime(vol, ctx.currentTime, 0.02);
    s.send.gain.setTargetAtTime(send, ctx.currentTime, 0.02);
  }

  // ── réverb : réponse impulsionnelle générée (bruit à décroissance exponentielle + premières réflexions) ──
  function makeIR(decay, early) {
    const sr = ctx.sampleRate, len = Math.floor(sr * Math.min(9, decay * 1.15 + 0.06));
    const b = ctx.createBuffer(2, len, sr);
    const taps = [];
    for (let k = 0; k < 14; k++) taps.push([0.003 + Math.random() * 0.085, Math.random() < 0.5 ? -1 : 1]);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * (i / sr) / Math.max(0.05, decay));
      for (const [t, s] of taps) { const i = Math.floor((t + ch * 0.0007) * sr); if (i < len) d[i] += s * early * 2.5 * (1 - t / 0.1); }
      for (let i = 0; i < Math.min(len, sr * 0.002); i++) d[i] *= i / (sr * 0.002);
    }
    return b;
  }
  function applyReverb() {
    const R = cfg.reverb, t = ctx.currentTime;
    rev.pre.delayTime.setTargetAtTime(Math.min(0.49, (R.pre || 0) / 1000), t, 0.02);
    rev.tone.frequency.setTargetAtTime(R.tone || 6000, t, 0.02);
    rev.out.gain.setTargetAtTime(R.wet ?? 0.5, t, 0.02);
    const key = `${R.decay}|${R.early}`;
    if (key === revKey) return;
    revKey = key;
    clearTimeout(revTimer);
    revTimer = setTimeout(() => { rev.conv.buffer = makeIR(+R.decay || 1, +R.early || 0); emit('reverb', rev.conv.buffer); }, rev.conv.buffer ? 90 : 0);
  }

  // ── fichiers ──
  function load(name) {
    let e = buffers.get(name);
    if (e) return e.p;
    e = {};
    buffers.set(name, e);
    e.p = (async () => {
      try {
        if (!ctx) throw new Error('audio non initialisé');
        const r = await fetch(url(name), { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 404 ? 'fichier introuvable' : `erreur ${r.status}`);
        e.buf = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) { e.err = err?.message || String(err) || 'format illisible'; }
      emit('load', name);
      return e;
    })();
    return e.p;
  }
  function usedFiles() {
    const set = new Set();
    for (const s of Object.values(cfg.sounds)) if (s.src === 'file') s.files.forEach((f) => set.add(f.name));
    return [...set];
  }
  async function preload() {
    const names = usedFiles();
    const res = await Promise.all(names.map(load));
    return { files: names.length, music: Object.values(cfg.music.moods).reduce((n, m) => n + m.files.length, 0), errors: names.filter((n, i) => res[i].err) };
  }

  // ── lecture ──
  function pickFile(id, files) {
    if (files.length === 1) return files[0];
    let i = Math.floor(Math.random() * files.length);
    if (i === lastFile[id]) i = (i + 1 + Math.floor(Math.random() * (files.length - 1))) % files.length;
    lastFile[id] = i;
    return files[i];
  }
  // joue un tampon (avec découpe, gain de fichier, fondus) dans une tranche ; renvoie une « voix » (studio : tête de lecture)
  function playEntry(stripId, buf, f, { t = ctx.currentTime, v = 1, p = 1, fadeIn = 0, fadeOut = 0, from = null, loop = false } = {}) {
    const st = strip(stripId);
    const start = Math.min(f.start || 0, Math.max(0, buf.duration - 0.005));
    const end = f.end > start ? Math.min(f.end, buf.duration) : buf.duration;
    const at = from != null ? Math.min(Math.max(from, start), end - 0.005) : start;
    const len = end - at, dur = len / p;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = p;
    const g = ctx.createGain(), peak = v * dbToGain(f.gain || 0);
    if (loop) { src.loop = true; src.loopStart = start; src.loopEnd = end; g.gain.value = peak; }
    else {
      const fi = Math.min(fadeIn, dur / 2), fo = Math.min(fadeOut, dur / 2);
      g.gain.setValueAtTime(fi > 0 && at === start ? 0 : peak, t);
      if (fi > 0 && at === start) g.gain.linearRampToValueAtTime(peak, t + fi);
      if (fo > 0) { g.gain.setValueAtTime(peak, t + dur - fo); g.gain.linearRampToValueAtTime(0, t + dur); }
    }
    src.connect(g).connect(st.in);
    if (loop) src.start(t, at); else src.start(t, at, len);
    const voice = {
      src, g, t0: t, at, start, end, rate: p, loop, buf,
      get pos() { const e = (ctx.currentTime - t) * p; if (e < 0) return at; if (!loop) return at + e; const L = end - start; const x = at + e; return x < end ? x : start + ((x - start) % L); },
      get playing() { return !voice.done; },
      stop(fade = 0.015) { if (voice.done) return; const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + fade); try { src.stop(n + fade + 0.01); } catch { /* déjà arrêté */ } },
    };
    src.onended = () => { voice.done = true; g.disconnect(); const l = voices[stripId]; if (l) { const i = l.indexOf(voice); if (i >= 0) l.splice(i, 1); } emit('ended', voice); };
    return voice;
  }
  function play(id, { v = 1, delay = 0, arg, force = null, fileIndex = null } = {}) {
    if (!ctx) return null;
    const def = SOUND_BY_ID[id], sc = cfg.sounds[id];
    if (!def || !sc) return null;
    const mode = force || sc.src;
    if (mode === 'off') return null;
    if (role === 'game' && studioSeen) played.add(id);
    const semis = (sc.pitch || 0) + (sc.rand ? (Math.random() * 2 - 1) * sc.rand : 0);
    let p = Math.pow(2, semis / 12);
    const t = ctx.currentTime + delay;
    if (mode === 'file' && sc.files.length) {
      const f = fileIndex != null ? sc.files[fileIndex] : pickFile(id, sc.files);
      const b = f && buffers.get(f.name);
      if (b?.buf) {
        if (def.freq && arg) p *= arg / def.freq;
        const list = voices[id] || (voices[id] = []);
        while (list.length >= Math.max(1, sc.voices || 8)) list.shift().stop();
        const vo = playEntry(id, b.buf, f, { t, v, p, fadeIn: sc.fadeIn || 0, fadeOut: sc.fadeOut || 0 });
        list.push(vo);
        return vo;
      }
      if (f && !b) load(f.name);   // pas encore chargé : le synthé dépanne cette fois-ci
    }
    SYN[id]?.(K, strip(id).in, { t, v, p, arg });
    return null;
  }

  // ── boucles ──
  function loopSig(id) {
    const sc = cfg.sounds[id], f = sc.src === 'file' ? sc.files[0] : null;
    const b = f && buffers.get(f.name);
    return `${sc.src}|${f ? `${f.name}:${f.start}:${f.end}` : ''}|${b?.buf ? 1 : 0}`;
  }
  function buildLoop(id) {
    const sig = loopSig(id);
    if (loops[id]?.sig === sig) return;
    loops[id]?.stop();
    const sc = cfg.sounds[id], st = strip(id);
    const f = sc.src === 'file' ? sc.files[0] : null;
    let L;
    if (sc.src === 'off') L = { set() {}, stop() {} };
    else if (f && buffers.get(f.name)?.buf) {
      const buf = buffers.get(f.name).buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
      const out = ctx.createGain(); out.gain.value = 0;
      lp.connect(out).connect(st.in);
      const vo = playEntry(id, buf, f, { loop: true, v: 1 });
      vo.g.disconnect(); vo.g.connect(lp);
      L = { file: true, vo, lp, g: out, stop() { vo.stop(0.3); setTimeout(() => out.disconnect(), 500); } };
    } else {
      if (f) load(f.name).then(() => { if (ctx) buildLoop(id); });
      L = SYNLOOP[id](K, st.in);
    }
    L.sig = sig;
    loops[id] = L;
    updateLoop(id);
  }
  function updateLoop(id) {
    const L = loops[id];
    if (!L || !ctx) return;
    const sc = cfg.sounds[id], def = SOUND_BY_ID[id], [a, b] = loopIn[id];
    const pm = Math.pow(2, (sc.pitch || 0) / 12);
    if (!L.file) { L.set(a, b, pm); return; }
    const t = ctx.currentTime;
    let lvl = a / def.ref, rate = pm, lp = 20000, tc = 0.3;
    if (id === 'wind') { lp = 1200 + b * 16000; rate = pm * (0.92 + b * 0.16); }
    else if (id === 'gust') lvl = a * (0.6 + 0.25 * Math.sin(t * 0.7) + 0.15 * Math.sin(t * 1.9));
    else if (id === 'engine') { rate = pm * ((sc.lo ?? 0.6) + ((sc.hi ?? 1.7) - (sc.lo ?? 0.6)) * b); tc = 0.1; }
    L.g.gain.setTargetAtTime(Math.max(0, lvl), t, tc);
    L.lp.frequency.setTargetAtTime(Math.min(20000, lp), t, tc);
    L.vo.src.playbackRate.setTargetAtTime(rate, t, tc);
  }
  function setLoop(id, a, b = 0) {
    loopIn[id][0] = a; loopIn[id][1] = b;
    if (!ctx) return;
    if (!loops[id]) buildLoop(id); else updateLoop(id);
  }

  // ── musiques : platines (ambiance, poste radio) lues en flux avec fondus enchaînés ──
  const decks = {};
  let mood = null, forced = null, radioLevel = 0, chip = null;
  function makeDeck(stripId) {
    const out = ctx.createGain();
    out.connect(strip(stripId).in);
    let key = null, list = [], order = [], pos = 0, cur = null, wait = 0, fails = 0, deckMood = null, lastIdx = -1;
    const xf = () => Math.max(0.05, +cfg.music.xfade || 0);
    function nextEntry() {
      if (pos >= order.length) {
        order = list.map((_, i) => i).sort(() => Math.random() - 0.5);
        if (order.length > 1 && order[0] === lastIdx) order.push(order.shift());
        pos = 0;
      }
      lastIdx = order[pos++];
      return list[lastIdx];
    }
    const target = (tr) => dbToGain((tr.entry.gain || 0) + (cfg.music.moods[tr.mood]?.vol || 0));
    function fade(tr, sec) {
      if (tr.fading) return;
      tr.fading = true;
      const n = ctx.currentTime;
      tr.g.gain.cancelScheduledValues(n); tr.g.gain.setValueAtTime(tr.g.gain.value, n); tr.g.gain.linearRampToValueAtTime(0, n + sec);
      setTimeout(() => kill(tr), sec * 1000 + 200);
      if (tr === cur) { cur = null; wait = 0; }
    }
    function kill(tr) {
      if (tr.dead) return;
      tr.dead = true;
      if (tr === cur) { cur = null; wait = 0; }
      try { tr.el.pause(); tr.el.removeAttribute('src'); tr.el.load(); } catch { /* rien */ }
      tr.node.disconnect(); tr.g.disconnect();
    }
    function start(entry) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = url(entry.name);
      const node = ctx.createMediaElementSource(el);
      const g = ctx.createGain(); g.gain.value = 0;
      node.connect(g).connect(out);
      const tr = { el, node, g, entry, mood: deckMood, fading: false, live: false };
      el.addEventListener('loadedmetadata', () => { if (entry.start > 0 && entry.start < el.duration) el.currentTime = entry.start; });
      el.addEventListener('playing', () => {
        fails = 0; tr.live = true;
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(target(tr), n + xf());
      }, { once: true });
      el.addEventListener('timeupdate', () => {
        const end = entry.end > entry.start ? Math.min(entry.end, el.duration || 1e9) : el.duration;
        const fo = Math.min(xf(), 3);
        if (!tr.fading && end && el.currentTime >= end - fo) fade(tr, fo);
      });
      el.addEventListener('ended', () => kill(tr));
      el.addEventListener('error', () => { fails++; kill(tr); });
      el.play().catch(() => { fails++; kill(tr); });
      return tr;
    }
    return {
      out,
      set(m, entries) {
        const k = entries.length ? `${m}|${entries.map((e) => e.name).join(',')}|${bust}` : '';
        if (k === key) return;
        key = k; deckMood = m;
        if (cur) fade(cur, xf());
        cur = null; list = entries; order = []; pos = 0; wait = 1e9; fails = 0;
      },
      tick(dt) {
        if (cur || !list.length || fails > list.length * 2) return;
        wait += dt;
        if (wait >= (fails ? 2 : +cfg.music.gap || 0)) cur = start(nextEntry());
      },
      levels() { if (cur?.live && !cur.fading) cur.g.gain.setTargetAtTime(target(cur), ctx.currentTime, 0.15); },
      get track() { return cur ? cur.entry.name : null; },
      get mood() { return deckMood; },
    };
  }
  function resolveMood(m) {
    for (let i = 0; i < 3 && m; i++) {
      if (cfg.music.moods[m]?.files.length) return m;
      m = MOOD_BY_ID[m]?.fallback;
    }
    return null;
  }
  function chipTick() {
    const spb = 60 / 112 / 2;
    while (chip.next < ctx.currentTime + 0.25) {
      const bar = Math.floor(chip.step / 8) % 4, ch = CH[bar], s8 = chip.step % 8, t = chip.next, o = { t, v: 1, p: 1 };
      if (s8 % 4 === 0) K.tone(chip.out, o, { f0: mtof(ch[0] - 12), dur: spb * 3, type: 'triangle', vol: 0.35 });
      K.tone(chip.out, o, { f0: mtof(ch[1 + (s8 % 3)]), dur: spb * 0.9, type: 'square', vol: 0.05 });
      const mel = MEL[chip.step % 16];
      if (mel > 0 && Math.floor(chip.step / 16) % 2 === 1) K.tone(chip.out, o, { f0: mtof(mel), dur: spb * 1.6, type: 'triangle', vol: 0.12 });
      if (s8 === 2 || s8 === 6) K.burst(chip.out, o, { dur: 0.05, freq: 6000, type: 'highpass', vol: 0.08 });
      chip.next += spb; chip.step++;
    }
  }
  function musicTick() {
    const radioFiles = cfg.music.moods.radio.files;
    // poste radio : fichiers s'il y en a, sinon la boucle chiptune
    const useChip = radioLevel > 0 && !radioFiles.length;
    decks.radio.set('radio', radioLevel > 0 && radioFiles.length ? radioFiles : []);
    decks.radio.out.gain.setTargetAtTime(radioLevel, ctx.currentTime, 0.15);
    if (useChip && !chip) { chip = { out: ctx.createGain(), next: ctx.currentTime + 0.05, step: 0 }; chip.out.connect(strip('music:radio').in); chip.timer = setInterval(chipTick, 60); }
    if (chip) {
      chip.out.gain.setTargetAtTime(useChip ? radioLevel * 0.5 : 0, ctx.currentTime, 0.15);
      if (!useChip) { const c = chip; chip = null; clearInterval(c.timer); setTimeout(() => c.out.disconnect(), 800); }
    }
    // ambiance : baissée quand le poste radio joue tout près
    const m = resolveMood(forced || mood);
    decks.amb.set(m, m ? cfg.music.moods[m].files : []);
    decks.amb.out.gain.setTargetAtTime(1 - 0.85 * Math.min(1, radioLevel), ctx.currentTime, 0.3);
    decks.amb.tick(0.2); decks.radio.tick(0.2);
    if (role === 'game') for (const id of ['gust']) if (loops[id]?.file) updateLoop(id);
  }

  // ── configuration ──
  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(playerVol * dbToGain(cfg.master || 0), t, 0.02);
    for (const c of CATS) { const g = catGain(c.id); buses[c.id].dry.gain.setTargetAtTime(g, t, 0.02); buses[c.id].wet.gain.setTargetAtTime(g, t, 0.02); }
    for (const id in strips) stripLevels(id, strips[id]);
    applyReverb();
    for (const id of LOOP_IDS) { if (loops[id] || loopIn[id][0] > 0) buildLoop(id); updateLoop(id); }
    decks.amb?.levels(); decks.radio?.levels();
    preload();
  }
  async function loadConfig() {
    try {
      const r = await fetch(`${base}config.json${bust ? `?v=${bust}` : ''}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`erreur ${r.status}`);
      cfg = normalizeConfig(await r.json());
      apply();
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e?.message || String(e) };
    }
  }
  // actualiser : relit la config et tous les fichiers (remplacés ou ajoutés dans sounds/)
  async function refresh({ config = null } = {}) {
    bust = Date.now();
    buffers.clear();
    let ok = true;
    if (config) cfg = normalizeConfig(config);
    else ok = (await loadConfig()).ok;
    if (ctx) for (const id of LOOP_IDS) if (loops[id]) { loops[id].stop(); delete loops[id]; }
    apply();
    const r = ctx ? await preload() : { files: usedFiles().length, music: 0, errors: [] };
    const res = { ...r, config: ok };
    emit('refresh', res);
    return res;
  }

  // ── synchro studio ↔ jeu ──
  let bc = null;
  try { bc = new BroadcastChannel(CHANNEL); } catch { /* navigateur trop ancien */ }
  const broadcast = (m) => { try { bc?.postMessage(m); } catch { /* rien */ } };
  function flushPlayed() {
    if (!played.size) return;
    if (performance.now() - studioSeen > 6000) { studioSeen = 0; played.clear(); return; }
    broadcast({ t: 'played', ids: [...played] });
    played.clear();
  }
  if (bc) bc.onmessage = (e) => {
    const m = e.data || {};
    if (role === 'game') {
      if (m.t === 'cfg') { cfg = normalizeConfig(m.cfg); apply(); }
      else if (m.t === 'refresh') refresh({ config: m.cfg || null }).then((r) => emit('remoteRefresh', r));
      else if (m.t === 'mood') forced = m.mood || null;
      else if (m.t === 'ping') { studioSeen = performance.now(); broadcast({ t: 'pong', mood: resolveMood(forced || mood), want: mood, forced, track: decks.amb?.track || null, radio: radioLevel > 0 }); }
      else if (m.t === 'loop') setLoop(m.id, m.a, m.b);
    } else {
      if (m.t === 'refresh') emit('remoteRefresh', m);
      else if (m.t === 'pong') emit('pong', m);
      else if (m.t === 'played') emit('played', m.ids);
    }
  };

  // ── mesures pour le studio ──
  function meter(key) {
    if (!ctx) return { peak: 0, rms: 0 };
    let M = meters[key];
    if (!M) {
      const node = key === 'master' ? post : buses[key]?.dry;
      if (!node) return { peak: 0, rms: 0 };
      M = meters[key] = { an: ctx.createAnalyser(), buf: null };
      M.an.fftSize = 1024;
      M.buf = new Float32Array(M.an.fftSize);
      node.connect(M.an);
    }
    M.an.getFloatTimeDomainData(M.buf);
    let peak = 0, sum = 0;
    for (let i = 0; i < M.buf.length; i++) { const x = Math.abs(M.buf[i]); if (x > peak) peak = x; sum += x * x; }
    return { peak, rms: Math.sqrt(sum / M.buf.length) };
  }
  async function renderSynth(id, arg) {
    if (!SYN[id]) return null;
    const sr = 44100, len = SYN_LEN[id] || 1;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(1, Math.floor(sr * len), sr);
    SYN[id](makeKit(oc), oc.destination, { t: 0, v: 1, p: 1, arg });
    return oc.startRendering();
  }
  function stopAll() {
    for (const l of Object.values(voices)) [...l].forEach((v) => v.stop());
  }

  const api = {
    init,
    get ready() { return !!ctx; },
    get ctx() { return ctx; },
    get master() { return master; },
    // ── réglages du joueur ──
    setVolume(v) { playerVol = v; if (ctx) master.gain.setTargetAtTime(v * dbToGain(cfg.master || 0), ctx.currentTime, 0.02); },
    setMusicVolume(v) { musicVol = v; if (ctx) apply(); },
    // ── boucles pilotées par le jeu ──
    setWind(v, bright = 0) { setLoop('wind', v, bright); },
    setRain(rain, storm = 0) { setLoop('rain', rain, storm); setLoop('gust', storm, 0); },
    setEngine(level, rpm) { setLoop('engine', level, rpm); },
    setStatic(level, clarity = 0) { setLoop('static', level, clarity); },
    // tonnerre : `delay` = temps de trajet du son, `near` (0-1) = craquement sec si la foudre tombe tout près
    thunder(delay = 0, near = 0) {
      if (near > 0.4) play('thunderCrack', { delay, v: near, arg: near });
      play('thunder', { delay, v: cfg.sounds.thunder.src === 'file' ? 0.5 + near * 0.5 : 1, arg: near });
    },
    gun(kind = 'pistol', v = 1) { play(SOUND_BY_ID[`gun.${kind}`] ? `gun.${kind}` : 'gun.pistol', { v }); },
    step(water) { play(water ? 'stepWater' : 'step'); },
    note(f) { play('note', { arg: f }); },
    // poste radio : niveau selon la distance
    setMusic(on, level = 1) { radioLevel = on ? level : 0; },
    // ambiance musicale voulue par le jeu : menu | calm | drama | flight | null
    setMood(m) { mood = m; },
    get mood() { return resolveMood(forced || mood); },
    get track() { return decks.amb?.track || null; },
    forceMood(m) { forced = m || null; },
    // ── studio ──
    play, playEntry, load, preload, meter, renderSynth, stopAll, url, broadcast, loadConfig, refresh, apply,
    buffer(name) { return buffers.get(name); },
    stats() { return { files: usedFiles().length, music: Object.values(cfg.music.moods).reduce((n, m) => n + m.files.length, 0), errors: [...buffers].filter(([, e]) => e.err).map(([n]) => n) }; },
    get config() { return cfg; },
    setConfig(c) { cfg = c; apply(); },
    get reduction() { return limiter ? limiter.reduction : 0; },
    get reverbIR() { return rev?.conv.buffer || null; },
    set solo(c) { solo = c; apply(); },
    get solo() { return solo; },
    loopLevel(id) { return loopIn[id]; },
    setLoop,
    on(k, f) { (handlers[k] || (handlers[k] = [])).push(f); },
  };
  // tous les sons ponctuels du catalogue, avec leur nom d'appel historique : audio.clank(), audio.splash()…
  for (const s of SOUNDS) if (s.kind !== 'loop' && !s.id.includes('.') && !api[s.id]) api[s.id] = () => play(s.id);
  return api;
}
