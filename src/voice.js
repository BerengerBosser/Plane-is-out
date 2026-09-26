// Chat vocal de proximité : micro → 8 kHz µ-law (200 ms par paquet) → réseau → lecture spatialisée
// Sans micro (refusé ou indisponible), le jeu reste jouable avec le chat texte.
// Réglages (gardés dans le navigateur) : micro choisi, mode (appuyer pour parler / détection de la voix),
// gain et seuil du micro, volume des voix, volume et sourdine de chaque coéquipier (retenus par nom).
import { store } from './defs.js';

const RATE = 8000, CHUNK = 1600;
const VOICE_KEY = 'plane-is-out-voice';
const HOLD = 0.45;   // détection de la voix : on garde le micro ouvert un instant après la dernière syllabe

function muEnc(x) {
  const s = Math.max(-1, Math.min(1, x));
  const sign = s < 0 ? 0x80 : 0;
  const m = Math.log1p(255 * Math.abs(s)) / Math.log1p(255);
  return ~(sign | Math.round(m * 127)) & 0xff;
}
function muDec(b) {
  const u = ~b & 0xff;
  const sign = u & 0x80 ? -1 : 1;
  const m = (u & 0x7f) / 127;
  return sign * (Math.pow(256, m) - 1) / 255;
}
function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function fromB64(str) { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

export function createVoice(audio) {
  let state = 'off';       // off | asking | on | denied | unsupported
  let stream = null, proc = null, src = null, inGain = null, mute = null;
  let talking = false, level = 0, gateT = 0;
  let acc = new Float32Array(CHUNK), accN = 0, frac = 0;
  const peers = new Map(); // id → { next, panner, filter, bag, direct, level, t, sends }
  let onChunk = null;
  let monitor = false;     // test : on s'entend soi-même, tel que les autres nous entendent
  const cfg = Object.assign({ on: false, mode: 'ptt', device: '', gain: 1, gate: 0.05, out: 1, muted: false, peers: {} }, store(VOICE_KEY) || {});
  const save = () => store(VOICE_KEY, cfg);
  // effets d'espace partagés : petite pièce, grand hall, écho de montagne (stéréo)
  let fx = null;
  function fxGraph(ctx) {
    if (fx) return fx;
    const ir = (sec, decay, pre = 0) => {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = i < pre * ctx.sampleRate ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    };
    const room = ctx.createConvolver(); room.buffer = ir(0.5, 3.2);
    const hall = ctx.createConvolver(); hall.buffer = ir(2.6, 2.1, 0.02);
    const roomOut = ctx.createGain(); roomOut.gain.value = 0.55; room.connect(roomOut); roomOut.connect(audio.master);
    const hallOut = ctx.createGain(); hallOut.gain.value = 0.45; hall.connect(hallOut); hallOut.connect(audio.master);
    // écho : deux lignes à retard croisées gauche/droite (effet ping-pong)
    const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    const dl = ctx.createDelay(1.5), dr = ctx.createDelay(1.5); dl.delayTime.value = 0.31; dr.delayTime.value = 0.43;
    const fl = ctx.createGain(), fr = ctx.createGain(); fl.gain.value = 0.38; fr.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const echoIn = ctx.createGain();
    echoIn.connect(lp); lp.connect(split);
    split.connect(dl, 0); split.connect(dr, 1);
    dl.connect(fl); fl.connect(dr); dr.connect(fr); fr.connect(dl);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(audio.master);
    fx = { room, hall, echo: echoIn };
    return fx;
  }

  function encodeChunk(send) {
    const bytes = new Uint8Array(CHUNK);
    for (let k = 0; k < CHUNK; k++) bytes[k] = muEnc(acc[k] * 1.4);
    const b64 = toB64(bytes);
    if (send) onChunk?.(b64);
    if (monitor) api.play('__self', b64, null, 'direct', 1);
  }

  async function start() {
    if (state === 'on' || state === 'asking') return state;
    audio.init();
    const ctx = audio.ctx;
    if (!ctx || !navigator.mediaDevices?.getUserMedia) { state = 'unsupported'; return state; }
    state = 'asking';
    const opts = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: cfg.device ? { ...opts, deviceId: { exact: cfg.device } } : opts });
    } catch (e) {
      // micro choisi débranché : on retombe sur celui par défaut
      if (cfg.device && e?.name === 'OverconstrainedError') { cfg.device = ''; save(); state = 'off'; return start(); }
      state = 'denied'; return state;
    }
    if (ctx.state === 'suspended') ctx.resume();
    src = ctx.createMediaStreamSource(stream);
    inGain = ctx.createGain(); inGain.gain.value = cfg.gain;
    proc = ctx.createScriptProcessor(4096, 1, 1);
    mute = ctx.createGain(); mute.gain.value = 0;
    const ratio = ctx.sampleRate / RATE;
    proc.onaudioprocess = (ev) => {
      const inp = ev.inputBuffer.getChannelData(0);
      let pk = 0;
      for (let i = 0; i < inp.length; i++) pk = Math.max(pk, Math.abs(inp[i]));
      level = level * 0.6 + pk * 0.4;
      const send = talking;
      if (!send && !monitor) { accN = 0; return; }
      // sous-échantillonnage simple (moyenne sur la fenêtre)
      for (let pos = frac; pos < inp.length; pos += ratio) {
        const i0 = Math.floor(pos), i1 = Math.min(inp.length - 1, Math.floor(pos + ratio));
        let sum = 0; for (let k = i0; k <= i1; k++) sum += inp[k];
        acc[accN++] = sum / (i1 - i0 + 1);
        if (accN === CHUNK) { encodeChunk(send); accN = 0; }
        frac = pos + ratio - inp.length;
      }
    };
    src.connect(inGain); inGain.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    state = 'on';
    if (!cfg.on) { cfg.on = true; save(); }
    return state;
  }
  function stop() {
    talking = false; monitor = false; level = 0;
    stream?.getTracks().forEach((t) => t.stop());
    try { src?.disconnect(); inGain?.disconnect(); proc?.disconnect(); } catch { /* déjà déconnecté */ }
    if (proc) proc.onaudioprocess = null;
    stream = null; src = null; inGain = null; proc = null;
    state = 'off';
  }

  function peer(id) {
    let p = peers.get(id);
    if (p) return p;
    const ctx = audio.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'linear';
    panner.refDistance = 2; panner.maxDistance = 38; panner.rolloffFactor = 1;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 0.9;
    const radioGain = ctx.createGain(); radioGain.gain.value = 1.3;
    // talkie au fond du sac : grave, étouffé, plus faible
    const bag = ctx.createBiquadFilter(); bag.type = 'lowpass'; bag.frequency.value = 650; bag.Q.value = 0.7;
    const bagBand = ctx.createBiquadFilter(); bagBand.type = 'highpass'; bagBand.frequency.value = 180;
    const bagGain = ctx.createGain(); bagGain.gain.value = 0.55;
    bag.connect(bagBand); bagBand.connect(bagGain); bagGain.connect(audio.master);
    panner.connect(audio.master);
    filter.connect(radioGain); radioGain.connect(audio.master);
    // salon et test du micro : voix directe, sans espace
    const direct = ctx.createGain(); direct.connect(audio.master);
    // envois vers les effets d'espace (après la spatialisation : la réverbération garde la stéréo)
    const F = fxGraph(ctx);
    const sends = { room: ctx.createGain(), hall: ctx.createGain(), echo: ctx.createGain() };
    for (const [k, g] of Object.entries(sends)) { g.gain.value = 0; panner.connect(g); g.connect(F[k]); }
    // le talkie grésille un peu dans le petit écho de la pièce
    const radioSend = ctx.createGain(); radioSend.gain.value = 0.25; radioGain.connect(radioSend); radioSend.connect(F.room);
    p = { next: 0, panner, filter, bag, direct, level: 0, t: 0, sends };
    peers.set(id, p);
    return p;
  }
  const peerCfg = (name) => cfg.peers[name] || { v: 1, m: 0 };

  const api = {
    get state() { return state; },
    // niveau du micro quand on émet (bouche du personnage, HUD) ; raw : toujours (vumètre des réglages)
    get level() { return talking ? level : 0; },
    get rawLevel() { return state === 'on' ? level : 0; },
    get cfg() { return cfg; },
    get talking() { return talking; },
    get monitor() { return monitor; },
    set monitor(v) { monitor = !!v && state === 'on'; if (!monitor) { const p = peers.get('__self'); if (p) p.next = 0; } },
    set onChunk(fn) { onChunk = fn; },
    start,
    stop,
    async restart() { const was = state === 'on', mon = monitor; stop(); if (was) { await start(); monitor = mon && state === 'on'; } return state; },
    // micros disponibles (les noms ne sont visibles qu'une fois l'accès au micro accordé)
    async devices() {
      try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { return []; }
    },
    set(k, v) {
      cfg[k] = v; save();
      if (k === 'gain' && inGain) inGain.gain.value = v;
    },
    peerGain(name) { const c = peerCfg(name); return c.m ? 0 : c.v; },
    peerCfg,
    setPeer(name, k, v) { const c = { ...peerCfg(name), [k]: v }; cfg.peers[name] = c; save(); },
    // chaque image : ptt = touche ou bouton « parler » enfoncé ; allowed = on a le droit d'émettre (partie, salon)
    update(dt, ptt, allowed) {
      let want = false;
      if (state === 'on' && allowed && !cfg.muted) {
        if (cfg.mode === 'open') {
          if (level > cfg.gate) gateT = HOLD; else gateT = Math.max(0, gateT - dt);
          want = gateT > 0 || ptt;
        } else want = ptt;
      } else gateT = 0;
      talking = want;
    },
    // lecture d'un paquet reçu ; pos : position monde de l'orateur ; radio : talkie ('clear' | 'bag'), 'direct' (salon) ou rien
    // vol : volume propre à ce joueur ; env : { room, hall, echo } entre 0 et 1 selon l'endroit
    play(id, b64, pos, radio, vol = 1, env = null) {
      const ctx = audio.ctx;
      if (!ctx) return;
      const bytes = fromB64(b64);
      const buf = ctx.createBuffer(1, bytes.length, RATE);
      const d = buf.getChannelData(0);
      const k = vol * (id === '__self' ? 1 : cfg.out);
      let pk = 0;
      for (let i = 0; i < bytes.length; i++) { const v = muDec(bytes[i]); pk = Math.max(pk, Math.abs(v)); d[i] = v * k; }
      const p = peer(id);
      p.level = pk; p.t = performance.now();
      if (k <= 0) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      if (radio === 'direct') s.connect(p.direct);
      else if (radio === 'bag') s.connect(p.bag); else if (radio) s.connect(p.filter); else s.connect(p.panner);
      if (env) for (const e of ['room', 'hall', 'echo']) p.sends[e].gain.setTargetAtTime(env[e] || 0, ctx.currentTime, 0.15);
      if (pos) { p.panner.positionX.value = pos.x; p.panner.positionY.value = pos.y + 1.6; p.panner.positionZ.value = pos.z; }
      const now = ctx.currentTime;
      if (p.next < now + 0.05 || p.next > now + 1.2) p.next = now + 0.18; // tampon de gigue
      s.start(p.next);
      p.next += buf.duration;
    },
    // un coéquipier parle-t-il en ce moment (paquet reçu il y a moins de 300 ms) ; niveau pour la bouche et les vumètres
    speaking(id) { const p = peers.get(id); return !!p && performance.now() - p.t < 300 && p.level > 0.04; },
    peerLevel(id) { const p = peers.get(id); return p && performance.now() - p.t < 300 ? p.level : 0; },
    listener(cam) {
      const ctx = audio.ctx;
      if (!ctx) return;
      const L = ctx.listener;
      const f = cam.getWorldDirection(cam.userData.tmpDir || (cam.userData.tmpDir = cam.position.clone()));
      if (L.positionX) {
        L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
        L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    },
  };
  return api;
}
