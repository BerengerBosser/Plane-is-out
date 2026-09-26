// Panneau « Voix » : le même dans le salon multijoueur et dans Paramètres → Voix.
// Activer et tester le micro (vumètre, s'écouter), choisir le micro, le mode (appuyer pour parler / détection),
// le gain et le seuil ; volume général des voix ; volume et sourdine de chaque coéquipier.
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => `${Math.round(v * 100)} %`;

const HTML = `
<ul class="vpCrew"></ul>
<div class="vpState"><b class="vpDot"></b><span class="vpMsg"></span><button type="button" class="tab vpOn">Activer le micro</button></div>
<div class="vpMeter" title="Niveau du micro · le trait marque le seuil de détection"><i class="vpLvl"></i><em class="vpGate"></em></div>
<div class="row vpMode"><span>Mode</span><div class="qual"><button type="button" class="tab" data-vmode="ptt">Appuyer sur B</button><button type="button" class="tab" data-vmode="open">Voix détectée</button></div></div>
<button type="button" class="big vpPtt"><span>Maintenir pour parler</span><small>ou la touche B</small></button>
<details class="vpMore">
  <summary>Réglages du micro et du son</summary>
  <label class="row vpSel"><span>Micro</span><select class="vpDev"><option value="">Micro par défaut</option></select></label>
  <label class="row vpGateRow"><span>Seuil de détection</span><input class="vpGateIn" type="range" min="0.005" max="0.25" step="0.005"><output></output></label>
  <label class="row"><span>Gain du micro</span><input class="vpGain" type="range" min="0" max="3" step="0.05"><output></output></label>
  <label class="row check"><span>S'écouter (test du micro, avec un casque)</span><input class="vpMon" type="checkbox"></label>
  <label class="row check"><span>Couper mon micro</span><input class="vpMute" type="checkbox"></label>
  <label class="row"><span>Volume des voix</span><input class="vpOut" type="range" min="0" max="2" step="0.05"><output></output></label>
</details>`;

export const VoicePanelMixin = {
  voicePanelsInit() {
    this.vPanels = [];
    // Paramètres : réglages détaillés dépliés ; salon : repliés (ils s'ouvrent à l'activation du micro)
    for (const [id, open] of [['voiceLobby', false], ['voiceSettings', true]]) { const el = document.getElementById(id); if (el) this.vPanels.push(this.voicePanel(el, open)); }
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.vPanels.forEach((p) => p.devices()));
    const tick = () => { this.vPanels.forEach((p) => p.tick()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  },
  voicePanel(el, open) {
    const v = this.voice;
    el.classList.add('vp');
    el.innerHTML = HTML;
    const q = (s) => el.querySelector(s);
    q('.vpMore').open = open;
    const range = (sel, get, set, fmt) => {
      const inp = q(sel), out = inp.nextElementSibling;
      inp.value = get(); out.textContent = fmt(+inp.value);
      inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmt(+inp.value); });
      return () => { if (document.activeElement !== inp) { inp.value = get(); out.textContent = fmt(+inp.value); } };
    };
    const start = async () => {
      if (v.state === 'denied' || v.state === 'unsupported') v.stop();
      const st = await v.start();
      if (st === 'on') devices();
    };
    q('.vpOn').addEventListener('click', () => { if (v.state === 'on') { v.stop(); v.set('on', false); } else { q('.vpMore').open = true; start(); } });
    // micros : les noms n'apparaissent qu'une fois l'accès accordé
    const devices = async () => {
      const sel = q('.vpDev');
      const list = await v.devices();
      sel.innerHTML = '<option value="">Micro par défaut</option>' + list.filter((d) => d.deviceId && d.deviceId !== 'default')
        .map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Micro ${i + 1}`)}</option>`).join('');
      sel.value = list.some((d) => d.deviceId === v.cfg.device) ? v.cfg.device : '';
    };
    q('.vpDev').addEventListener('change', async (e) => { v.set('device', e.target.value); if (v.state === 'on') await v.restart(); });
    el.querySelectorAll('[data-vmode]').forEach((b) => b.addEventListener('click', () => { v.set('mode', b.dataset.vmode); if (v.state === 'off') start(); }));
    const syncs = [
      range('.vpGateIn', () => v.cfg.gate, (x) => v.set('gate', x), (x) => `${Math.round(x * 100)}`),
      range('.vpGain', () => v.cfg.gain, (x) => v.set('gain', x), pct),
      range('.vpOut', () => v.cfg.out, (x) => v.set('out', x), pct),
    ];
    q('.vpMon').addEventListener('change', async (e) => { if (e.target.checked && v.state !== 'on') await start(); v.monitor = e.target.checked; });
    q('.vpMute').addEventListener('change', (e) => v.set('muted', e.target.checked));
    // bouton « parler » (salon, souris) : même effet que B
    const ptt = q('.vpPtt');
    const down = (on) => (e) => { e.preventDefault(); this.vpPtt = on; if (on && v.state === 'off') start(); };
    ptt.addEventListener('pointerdown', down(true));
    for (const k of ['pointerup', 'pointerleave', 'pointercancel']) ptt.addEventListener(k, down(false));
    // cliquer sur le vumètre place le seuil de détection
    q('.vpMeter').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      v.set('gate', Math.max(0.005, Math.min(0.25, ((e.clientX - r.left) / r.width) * 0.25)));
      syncs[0]();
    });
    // équipage : volume et sourdine de chacun (retenus par nom d'une partie à l'autre)
    const crew = q('.vpCrew');
    crew.addEventListener('input', (e) => {
      const li = e.target.closest('li[data-name]');
      if (!li || !e.target.matches('input[type=range]')) return;
      v.setPeer(li.dataset.name, 'v', +e.target.value);
      li.querySelector('output').textContent = pct(+e.target.value);
    });
    crew.addEventListener('click', (e) => {
      const b = e.target.closest('.vpPm');
      if (!b) return;
      const name = b.closest('li').dataset.name;
      const m = !v.peerCfg(name).m;
      v.setPeer(name, 'm', m ? 1 : 0);
      b.classList.toggle('on', m); b.textContent = m ? '🔇' : '🔊';
      b.setAttribute('aria-label', m ? `Réactiver ${name}` : `Couper ${name}`);
    });
    let crewKey = '';
    const buildCrew = (list) => {
      crew.innerHTML = list.map((p) => {
        const c = v.peerCfg(p.name);
        const ctl = p.me ? '<small>vous</small>' : `<input type="range" min="0" max="2" step="0.05" value="${c.v}" aria-label="Volume de ${esc(p.name)}"><output>${pct(c.v)}</output><button type="button" class="vpPm${c.m ? ' on' : ''}" aria-label="${c.m ? 'Réactiver' : 'Couper'} ${esc(p.name)}">${c.m ? '🔇' : '🔊'}</button>`;
        return `<li data-id="${esc(p.id)}"${p.me ? '' : ` data-name="${esc(p.name)}"`}><i style="background:${esc(p.color)}"></i><span class="nm">${esc(p.name)}${p.host ? ' <em>hôte</em>' : ''}</span><span class="vpBar"><b></b></span>${ctl}</li>`;
      }).join('');
    };
    const msg = () => {
      const s = v.state;
      if (s === 'asking') return ['wait', 'Autorisez le micro dans la fenêtre du navigateur…'];
      if (s === 'denied') return ['bad', 'Micro refusé : autorisez-le depuis l\'icône du micro (ou du cadenas) dans la barre d\'adresse, puis réessayez.'];
      if (s === 'unsupported') return ['bad', window.isSecureContext === false ? 'Micro bloqué : le navigateur ne le donne qu\'aux pages en https ou sur localhost.' : 'Micro indisponible sur ce navigateur.'];
      if (s !== 'on') return ['off', 'Micro éteint : vos amis ne vous entendent pas.'];
      if (v.cfg.muted) return ['off', 'Micro coupé.'];
      if (v.talking) return ['talk', 'On vous entend.'];
      return ['on', v.cfg.mode === 'open' ? 'Micro actif : parlez, il s\'ouvre tout seul au-dessus du seuil.' : 'Micro actif : maintenez B (ou le bouton) pour parler.'];
    };
    let lastState = null;
    const tick = () => {
      if (!el.offsetParent) return;   // panneau caché
      const s = v.state;
      if (s !== lastState) { if (s === 'on' && lastState !== null) devices(); lastState = s; }
      const [k, t] = msg();
      el.dataset.state = k;
      const m = q('.vpMsg'); if (m.textContent !== t) m.textContent = t;
      const on = q('.vpOn'); const lbl = s === 'on' ? 'Éteindre' : s === 'denied' || s === 'unsupported' ? 'Réessayer' : 'Activer le micro';
      if (on.textContent !== lbl) on.textContent = lbl;
      on.disabled = s === 'asking';
      el.querySelectorAll('[data-vmode]').forEach((b) => b.classList.toggle('on', b.dataset.vmode === v.cfg.mode));
      q('.vpGateRow').hidden = v.cfg.mode !== 'open';
      q('.vpGate').hidden = v.cfg.mode !== 'open';
      q('.vpGate').style.left = `${Math.min(100, v.cfg.gate / 0.25 * 100)}%`;
      const lvl = q('.vpLvl');
      lvl.style.width = `${Math.min(100, v.rawLevel / 0.25 * 100)}%`;
      lvl.classList.toggle('talk', v.talking);
      q('.vpMon').checked = v.monitor;
      q('.vpMute').checked = !!v.cfg.muted;
      q('.vpPtt').hidden = !this.session || v.cfg.mode === 'open';
      q('.vpPtt').classList.toggle('on', v.talking);
      syncs.forEach((f) => f());
      // équipage
      const ss = this.session;
      const list = ss ? [{ id: 'me', name: this.profile.name, color: this.profile.color, host: ss.isHost, me: true }]
        .concat([...ss.players].map(([id, p]) => ({ id, name: p.name, color: p.color, host: id === ss.hostId }))) : [];
      const key = list.map((p) => `${p.id}:${p.name}:${p.color}:${p.host ? 1 : 0}`).join('|');
      if (key !== crewKey) { crewKey = key; buildCrew(list); }
      crew.hidden = !ss;
      for (const li of crew.children) {
        const id = li.dataset.id;
        const lv = id === 'me' ? v.level : v.peerLevel(id);
        li.classList.toggle('talk', id === 'me' ? v.talking : v.speaking(id));
        li.querySelector('.vpBar b').style.width = `${Math.min(100, lv / 0.25 * 100)}%`;
      }
    };
    devices();
    return { tick, devices };
  },
};
