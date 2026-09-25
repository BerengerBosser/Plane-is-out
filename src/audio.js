// Sons générés (Web Audio) : vent, moteur, chocs, sirène, treuil
export function createAudio() {
  let ctx = null, master, windGain, windFilter, engGain, engOsc1, engOsc2, engFilter;
  let noiseBuf, whiteBuf, rainGain, gustGain, gustFilter;
  let vol = 0.7;
  let musicBus = null, musicVol = 0.8, musicLevel = 0, musicTimer = null, nextNote = 0, step = 0;
  // Do – La m – Fa – Sol, 112 bpm en croches
  const CH = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]];
  const MEL = [72, -1, 74, 76, 79, -1, 76, 74, 72, -1, 69, 72, 74, -1, 71, 67];
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function note(freq, t, dur, type, v) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function schedule() {
    const spb = 60 / 112 / 2;
    while (nextNote < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 8) % 4, ch = CH[bar], s8 = step % 8;
      if (s8 % 4 === 0) note(mtof(ch[0] - 12), nextNote, spb * 3, 'triangle', 0.35);
      note(mtof(ch[1 + (s8 % 3)]), nextNote, spb * 0.9, 'square', 0.05);
      const mel = MEL[step % 16];
      if (mel > 0 && Math.floor(step / 16) % 2 === 1) note(mtof(mel), nextNote, spb * 1.6, 'triangle', 0.12);
      if (s8 === 2 || s8 === 6) { const b = ctx.createBufferSource(); b.buffer = noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; const gg = ctx.createGain(); gg.gain.setValueAtTime(0.08, nextNote); gg.gain.exponentialRampToValueAtTime(0.0001, nextNote + 0.05); b.connect(hp).connect(gg).connect(musicBus); b.start(nextNote); b.stop(nextNote + 0.06); }
      nextNote += spb; step++;
    }
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.3; d[i] = last; }

    // vent
    const wn = ctx.createBufferSource();
    wn.buffer = noiseBuf; wn.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 500;
    windGain = ctx.createGain(); windGain.gain.value = 0.0;
    wn.connect(windFilter).connect(windGain).connect(master);
    wn.start();

    // météo : crépitement de pluie (bruit blanc filtré) et rafales d'orage
    whiteBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const w = whiteBuf.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.35);
    const rn = ctx.createBufferSource(); rn.buffer = whiteBuf; rn.loop = true;
    const rHp = ctx.createBiquadFilter(); rHp.type = 'highpass'; rHp.frequency.value = 900;
    const rLp = ctx.createBiquadFilter(); rLp.type = 'lowpass'; rLp.frequency.value = 7000;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rn.connect(rHp).connect(rLp).connect(rainGain).connect(master);
    rn.start();
    const gn = ctx.createBufferSource(); gn.buffer = noiseBuf; gn.loop = true; gn.playbackRate.value = 0.7;
    gustFilter = ctx.createBiquadFilter(); gustFilter.type = 'lowpass'; gustFilter.frequency.value = 350;
    gustGain = ctx.createGain(); gustGain.gain.value = 0;
    gn.connect(gustFilter).connect(gustGain).connect(master);
    gn.start();

    // moteur
    engOsc1 = ctx.createOscillator(); engOsc1.type = 'sawtooth'; engOsc1.frequency.value = 55;
    engOsc2 = ctx.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 82;
    engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 400;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    engOsc1.connect(engFilter); engOsc2.connect(g2).connect(engFilter);
    engFilter.connect(engGain).connect(master);
    engOsc1.start(); engOsc2.start();
  }

  function burst({ dur = 0.3, freq = 800, type = 'lowpass', vol = 0.5, q = 1 }) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone({ f0 = 440, f1 = f0, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 }) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    init,
    get ready() { return !!ctx; },
    get ctx() { return ctx; },
    get master() { return master; },
    setWind(v, bright = 0) {
      if (!ctx) return;
      windGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
      windFilter.frequency.setTargetAtTime(400 + bright * 900, ctx.currentTime, 0.3);
    },
    // pluie (0-1) et orage (0-1) : niveaux continus
    setRain(rain, storm = 0) {
      if (!ctx) return;
      rainGain.gain.setTargetAtTime(rain * 0.16, ctx.currentTime, 0.5);
      const gust = storm * (0.1 + 0.08 * Math.sin(ctx.currentTime * 0.7) + 0.05 * Math.sin(ctx.currentTime * 1.9));
      gustGain.gain.setTargetAtTime(Math.max(0, gust), ctx.currentTime, 0.4);
      gustFilter.frequency.setTargetAtTime(280 + storm * 260, ctx.currentTime, 0.5);
    },
    // tonnerre : `delay` = temps de trajet du son, `near` (0-1) = craquement sec si la foudre tombe tout près
    thunder(delay = 0, near = 0) {
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      const rumble = (at, dur, freq, v) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.5 + Math.random() * 0.2;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(v, at + 0.08 + (1 - near) * 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        s.connect(f).connect(g).connect(master);
        s.start(at, Math.random()); s.stop(at + dur + 0.1);
      };
      if (near > 0.4) {
        // claquement
        const s = ctx.createBufferSource(); s.buffer = whiteBuf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * near, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + 0.4);
      }
      rumble(t0, 3.5 + Math.random() * 1.5, 220 + near * 500, 0.6 + near * 0.6);
      rumble(t0 + 0.5 + Math.random() * 0.6, 2.8, 140, 0.45 + near * 0.3);
    },
    setEngine(level, rpm) {
      if (!ctx) return;
      engGain.gain.setTargetAtTime(level * 0.22, ctx.currentTime, 0.1);
      engOsc1.frequency.setTargetAtTime(45 + rpm * 70, ctx.currentTime, 0.1);
      engOsc2.frequency.setTargetAtTime(68 + rpm * 104, ctx.currentTime, 0.1);
      engFilter.frequency.setTargetAtTime(300 + rpm * 900, ctx.currentTime, 0.1);
    },
    // coups de feu : claquement filtré + grave, volume selon la distance
    gun(kind = 'pistol', v = 1) {
      if (!ctx) return;
      if (kind === 'shotgun') { burst({ dur: 0.45, freq: 900, vol: 1.0 * v }); burst({ dur: 0.12, freq: 4000, type: 'highpass', vol: 0.5 * v }); tone({ f0: 120, f1: 40, dur: 0.35, vol: 0.45 * v }); }
      else if (kind === 'rifle') { burst({ dur: 0.18, freq: 2200, vol: 0.8 * v }); burst({ dur: 0.08, freq: 6000, type: 'highpass', vol: 0.4 * v }); tone({ f0: 160, f1: 60, dur: 0.14, vol: 0.3 * v }); }
      else { burst({ dur: 0.22, freq: 1600, vol: 0.85 * v }); burst({ dur: 0.07, freq: 5000, type: 'highpass', vol: 0.45 * v }); tone({ f0: 180, f1: 70, dur: 0.16, vol: 0.3 * v }); }
    },
    splat() { burst({ dur: 0.18, freq: 500, type: 'lowpass', vol: 0.5 }); tone({ f0: 90, f1: 50, dur: 0.12, vol: 0.2 }); },
    scream() { tone({ f0: 900, f1: 1600, dur: 0.9, type: 'sawtooth', vol: 0.09 }); tone({ f0: 1300, f1: 700, dur: 1.1, type: 'square', vol: 0.05, delay: 0.1 }); burst({ dur: 1.0, freq: 2500, type: 'bandpass', vol: 0.3, q: 2 }); },
    bloat() { burst({ dur: 0.9, freq: 300, vol: 1.0 }); tone({ f0: 80, f1: 30, dur: 0.7, vol: 0.5 }); burst({ dur: 1.4, freq: 1200, type: 'bandpass', vol: 0.3, q: 0.8 }); },
    pickup() { tone({ f0: 520, f1: 780, dur: 0.12, type: 'triangle', vol: 0.15 }); },
    drop() { burst({ dur: 0.2, freq: 300, vol: 0.5 }); },
    clank() { tone({ f0: 900, f1: 600, dur: 0.09, type: 'square', vol: 0.08 }); burst({ dur: 0.08, freq: 3000, type: 'bandpass', vol: 0.3, q: 4 }); },
    thud() { burst({ dur: 0.5, freq: 180, vol: 0.9 }); tone({ f0: 90, f1: 40, dur: 0.4, vol: 0.4 }); },
    explosion() { burst({ dur: 1.8, freq: 400, vol: 1.0 }); tone({ f0: 70, f1: 25, dur: 1.2, vol: 0.5 }); },
    splash() { burst({ dur: 1.0, freq: 1400, type: 'bandpass', vol: 0.6, q: 0.7 }); },
    ratchet() { tone({ f0: 1400, f1: 1100, dur: 0.03, type: 'square', vol: 0.05 }); },
    beep() { tone({ f0: 880, dur: 0.08, type: 'square', vol: 0.06 }); },
    note(f) { tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.12 }); },
    error() { tone({ f0: 220, f1: 180, dur: 0.18, type: 'square', vol: 0.07 }); },
    success() {
      [523, 659, 784].forEach((f, i) => tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.14, delay: i * 0.1 }));
    },
    setVolume(v) { vol = v; if (master) master.gain.value = v; },
    setMusicVolume(v) { musicVol = v; if (musicBus) musicBus.gain.value = v * musicLevel * 0.5; },
    // poste radio : petite boucle chiptune (niveau selon la distance)
    setMusic(on, level = 1) {
      if (!ctx) return;
      musicLevel = on ? level : 0;
      if (!musicBus) { musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master); }
      musicBus.gain.setTargetAtTime(musicVol * musicLevel * 0.5, ctx.currentTime, 0.15);
      if (on && !musicTimer) {
        nextNote = ctx.currentTime + 0.05; step = 0;
        musicTimer = setInterval(schedule, 60);
      } else if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
    squeak() { tone({ f0: 1300, f1: 1900, dur: 0.12, type: 'triangle', vol: 0.12 }); tone({ f0: 1900, f1: 1200, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.12 }); },
    spark() { burst({ dur: 0.35, freq: 5000, type: 'highpass', vol: 0.4, q: 0.5 }); tone({ f0: 120, dur: 0.3, type: 'sawtooth', vol: 0.1 }); },
    powerUp() { tone({ f0: 80, f1: 320, dur: 1.4, type: 'sawtooth', vol: 0.08 }); [0, 0.4, 0.8].forEach((d) => tone({ f0: 660, dur: 0.1, type: 'square', vol: 0.05, delay: 0.9 + d })); },
    pour() { burst({ dur: 0.25, freq: 900, type: 'bandpass', vol: 0.2, q: 2 }); },
    dig() { burst({ dur: 0.18, freq: 500, type: 'lowpass', vol: 0.5 }); },
    door() { tone({ f0: 180, f1: 120, dur: 0.35, type: 'sawtooth', vol: 0.05 }); burst({ dur: 0.2, freq: 700, vol: 0.3 }); },
    whoosh() { burst({ dur: 0.18, freq: 1800, type: 'bandpass', vol: 0.25, q: 1.2 }); },
    hitFlesh() { burst({ dur: 0.18, freq: 500, vol: 0.9 }); tone({ f0: 140, f1: 70, dur: 0.15, vol: 0.3 }); },
    hitShell() { tone({ f0: 700, f1: 420, dur: 0.07, type: 'square', vol: 0.1 }); burst({ dur: 0.12, freq: 2400, type: 'bandpass', vol: 0.5, q: 3 }); },
    hurt() { tone({ f0: 220, f1: 120, dur: 0.25, type: 'sawtooth', vol: 0.12 }); burst({ dur: 0.2, freq: 300, vol: 0.6 }); },
    hiss() { burst({ dur: 1.4, freq: 2600, type: 'highpass', vol: 0.18, q: 0.5 }); tone({ f0: 110, f1: 70, dur: 1.2, type: 'sawtooth', vol: 0.05 }); },
    groan() { const f = 80 + Math.random() * 40; tone({ f0: f, f1: f * 0.7, dur: 1.1, type: 'sawtooth', vol: 0.07 }); tone({ f0: f * 1.5, f1: f, dur: 0.9, type: 'triangle', vol: 0.05, delay: 0.1 }); burst({ dur: 0.6, freq: 500, type: 'bandpass', vol: 0.05, q: 1.5 }); },
    radio() { burst({ dur: 0.35, freq: 3000, type: 'bandpass', vol: 0.25, q: 0.8 }); tone({ f0: 1200, dur: 0.06, type: 'square', vol: 0.05, delay: 0.3 }); },
    step(water) { burst({ dur: 0.08, freq: water ? 1600 : 700, type: 'bandpass', vol: water ? 0.18 : 0.12, q: 1.5 }); },
    siren() {
      for (let i = 0; i < 3; i++) {
        tone({ f0: 420, f1: 760, dur: 0.9, type: 'sawtooth', vol: 0.07, delay: i * 1.0 });
      }
    },
  };
}
