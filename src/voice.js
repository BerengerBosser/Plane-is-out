// Chat vocal de proximité : micro → 8 kHz µ-law (200 ms par paquet) → réseau → lecture spatialisée
// Sans micro (refusé ou indisponible), le jeu reste jouable avec le chat texte.
const RATE = 8000, CHUNK = 1600;

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
  let state = 'off';       // off | asking | on | denied
  let stream = null, proc = null, src = null, mute = null;
  let talking = false, level = 0;
  let acc = new Float32Array(CHUNK), accN = 0, frac = 0;
  const peers = new Map(); // id → { next, gain, panner, filter, level }
  let onChunk = null;

  async function start() {
    if (state === 'on' || state === 'asking') return state;
    const ctx = audio.ctx;
    if (!ctx || !navigator.mediaDevices?.getUserMedia) { state = 'denied'; return state; }
    state = 'asking';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { state = 'denied'; return state; }
    src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    mute = ctx.createGain(); mute.gain.value = 0;
    const ratio = ctx.sampleRate / RATE;
    proc.onaudioprocess = (ev) => {
      const inp = ev.inputBuffer.getChannelData(0);
      let pk = 0;
      for (let i = 0; i < inp.length; i++) pk = Math.max(pk, Math.abs(inp[i]));
      level = level * 0.7 + pk * 0.3;
      if (!talking) { accN = 0; return; }
      // sous-échantillonnage simple (moyenne sur la fenêtre)
      for (let pos = frac; pos < inp.length; pos += ratio) {
        const i0 = Math.floor(pos), i1 = Math.min(inp.length - 1, Math.floor(pos + ratio));
        let sum = 0; for (let k = i0; k <= i1; k++) sum += inp[k];
        acc[accN++] = sum / (i1 - i0 + 1);
        if (accN === CHUNK) {
          const bytes = new Uint8Array(CHUNK);
          for (let k = 0; k < CHUNK; k++) bytes[k] = muEnc(acc[k] * 1.4);
          onChunk?.(toB64(bytes));
          accN = 0;
        }
        frac = pos + ratio - inp.length;
      }
    };
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    state = 'on';
    return state;
  }

  function peer(id) {
    let p = peers.get(id);
    if (p) return p;
    const ctx = audio.ctx;
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower'; panner.distanceModel = 'linear';
    panner.refDistance = 2; panner.maxDistance = 38; panner.rolloffFactor = 1;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 0.9;
    const radioGain = ctx.createGain(); radioGain.gain.value = 1.3;
    gain.connect(panner); panner.connect(audio.master);
    filter.connect(radioGain); radioGain.connect(audio.master);
    p = { next: 0, gain, panner, filter, level: 0, t: 0 };
    peers.set(id, p);
    return p;
  }

  return {
    get state() { return state; },
    get level() { return talking ? level : 0; },
    start,
    set onChunk(fn) { onChunk = fn; },
    setTalking(v) { talking = v && state === 'on'; },
    get talking() { return talking; },
    // lecture d'un paquet reçu ; pos : position monde de l'orateur ; radio : talkie (sans distance)
    play(id, b64, pos, radio, vol = 1) {
      const ctx = audio.ctx;
      if (!ctx) return;
      const bytes = fromB64(b64);
      const buf = ctx.createBuffer(1, bytes.length, RATE);
      const d = buf.getChannelData(0);
      let pk = 0;
      for (let i = 0; i < bytes.length; i++) { d[i] = muDec(bytes[i]); pk = Math.max(pk, Math.abs(d[i])); }
      const p = peer(id);
      p.level = pk; p.t = performance.now();
      const s = ctx.createBufferSource();
      s.buffer = buf;
      if (radio) s.connect(p.filter); else s.connect(p.gain);
      p.gain.gain.value = vol;
      if (pos) { p.panner.positionX.value = pos.x; p.panner.positionY.value = pos.y + 1.6; p.panner.positionZ.value = pos.z; }
      const now = ctx.currentTime;
      if (p.next < now + 0.05 || p.next > now + 1.2) p.next = now + 0.18; // tampon de gigue
      s.start(p.next);
      p.next += buf.duration;
    },
    speaking(id) { const p = peers.get(id); return !!p && performance.now() - p.t < 300 && p.level > 0.04; },
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
    stop() {
      talking = false;
      stream?.getTracks().forEach((t) => t.stop());
      try { src?.disconnect(); proc?.disconnect(); } catch { /* déjà déconnecté */ }
      stream = null; state = 'off';
    },
  };
}
