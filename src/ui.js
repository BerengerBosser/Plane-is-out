// Interface : HUD, messages, carnet, fenêtres d'énigmes, radio
const $ = (id) => document.getElementById(id);

export function createUI() {
  const el = {
    hud: $('hud'), prompt: $('prompt'), hold: $('hold'), carry: $('carry'), toast: $('toast'),
    flight: $('flight'), keys: $('keys'), subtitle: $('subtitle'), carnet: $('carnet'),
    objList: $('objList'), noteList: $('noteList'), modal: $('modal'), menu: $('menu'), pause: $('pause'),
    dead: $('dead'), fade: $('fade'), debug: $('debug'), crosshair: $('crosshair'), settings: $('settings'),
    help: $('help'), endScreen: $('endScreen'), fps: $('fps'), compass: $('compass'),
  };

  let lastPrompt = '';
  const api = {
    el,
    show(id, on) { (el[id] || (el[id] = $(id))).classList.toggle('hidden', !on); },
    visible(id) { return !(el[id] || (el[id] = $(id))).classList.contains('hidden'); },
    prompt(html) { if (html !== lastPrompt) { el.prompt.innerHTML = html; lastPrompt = html; } el.crosshair.classList.toggle('active', !!html); },
    hold(p) { el.hold.style.display = p > 0 ? 'block' : 'none'; el.hold.firstChild.style.width = `${Math.min(1, p) * 100}%`; },
    carry(title, sub) { el.carry.innerHTML = title ? `${title}${sub ? `<small>${sub}</small>` : ''}` : ''; },
    toast(title, text = '', kind = '', ms = 4200) {
      if (kind === true) kind = 'bad';
      const d = document.createElement('div');
      d.className = `t ${kind || ''}`;
      d.innerHTML = `<b>${title}</b>${text}`;
      el.toast.appendChild(d);
      while (el.toast.children.length > 3) el.toast.firstChild.remove();
      setTimeout(() => d.remove(), ms);
    },
    tox(v) { $('tox').classList.toggle('on', v > 0.5); $('toxBar').style.width = `${v}%`; },
    keys(html) { if (el.keys.innerHTML !== html) el.keys.innerHTML = html; },
    subtitle(html) { el.subtitle.innerHTML = html; },
    fade(v, color = '#000', ms = 800) { el.fade.style.transition = `opacity ${ms}ms`; el.fade.style.background = color; el.fade.style.opacity = v; },
    flight(on, d) {
      el.flight.style.display = on ? 'block' : 'none';
      if (!on) return;
      $('fSpeed').textContent = Math.round(d.speed * 3.6);
      $('fAlt').textContent = Math.max(0, Math.round(d.alt));
      $('fThrottle').style.width = `${Math.round(d.throttle * 100)}%`;
      $('fFuel').style.width = `${Math.round(d.fuel)}%`;
      $('fFuelTxt').textContent = `${Math.round(d.fuel)} %`;
      $('fFuel').parentElement.classList.toggle('low', d.fuel < 15);
      $('fState').textContent = d.state;
    },
    carnet(sub, objectives, notes) {
      $('carnetSub').textContent = sub;
      el.objList.innerHTML = objectives.map((o) => `<li class="${o.done ? 'done' : ''}${o.sub ? ' sub' : ''}"><span class="box"></span><span>${o.text}${o.hint && !o.done ? `<small>${o.hint}</small>` : ''}</span></li>`).join('');
      el.noteList.innerHTML = notes.length ? notes.map((n) => `<li><span>— ${n}</span></li>`).join('') : '<li><span>— rien pour l\'instant</span></li>';
    },
    photos(list) {
      $('photoTitle').hidden = !list.length;
      const pl = $('photoList');
      if (pl.childElementCount === list.length) return;
      pl.innerHTML = '';
      list.forEach((ph) => { const f = document.createElement('figure'); const im = new Image(); im.src = ph.src; im.alt = ph.cap; const c = document.createElement('figcaption'); c.textContent = ph.cap; f.append(im, c); pl.appendChild(f); });
    },
    wheel(on, sel) {
      const w = $('wheel');
      w.classList.toggle('hidden', !on);
      w.querySelectorAll('span').forEach((sp, i) => sp.classList.toggle('on', i === sel));
    },
    tracker(island, title, sub = '') {
      $('trIsland').textContent = island;
      if ($('trTitle').textContent !== title) $('trTitle').textContent = title;
      $('trSub').textContent = sub;
    },
    compass(on, yaw) {
      el.compass.classList.toggle('hidden', !on);
      if (!on) return;
      const strip = $('compassStrip');
      if (!strip.childElementCount) {
        const labels = ['N', '', 'NE', '', 'E', '', 'SE', '', 'S', '', 'SO', '', 'O', '', 'NO', ''];
        let html = '';
        for (let k = 0; k < 3; k++) labels.forEach((l) => { html += `<span class="${l.length === 1 ? 'c' : ''}">${l || '·'}</span>`; });
        strip.innerHTML = html;
      }
      // cap : 0 = nord (-z), croissant vers l'est
      let heading = (-yaw) % (Math.PI * 2); if (heading < 0) heading += Math.PI * 2;
      const perStep = 40, steps = 16;
      const off = (heading / (Math.PI * 2)) * steps * perStep;
      const w = el.compass.clientWidth;
      strip.style.left = `${w / 2 - (steps * perStep + off) - perStep / 2}px`;
    },
    debug(text) { el.debug.textContent = text; },
    fps(text) { el.fps.textContent = text; },
    vitals(hp, st) { $('hpBar').style.width = `${Math.max(0, hp)}%`; $('stBar').style.width = `${Math.max(0, st)}%`; },
    hotbar(sel, owned, oil) {
      document.querySelectorAll('#hotbar .slot').forEach((d, i) => { d.classList.toggle('sel', i === sel); d.classList.toggle('locked', !owned[i]); });
      $('oilBar').style.width = `${Math.max(0, Math.min(100, oil))}%`;
    },
    hurt(v) { $('hurt').style.opacity = v; },
    ammo(flare, harp) { $('ammoFlare').textContent = flare; $('ammoHarp').textContent = harp; },
    boss(b) {
      $('bossBar').classList.toggle('hidden', !b);
      if (!b) return;
      $('bossName').textContent = b.name;
      $('bossHp').style.width = `${Math.max(0, b.hp) * 100}%`;
      $('bossHint').textContent = b.hint || '';
    },
    gen(g) {
      $('genBar').classList.toggle('hidden', !g);
      if (!g) return;
      $('genHp').style.width = `${Math.max(0, g.hp)}%`;
      $('genInfo').textContent = g.info || '';
    },
    crew(list) {
      const el2 = $('crew');
      el2.classList.toggle('hidden', !list.length);
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const html = list.map((p) => `<div class="mate${p.down ? ' down' : ''}${p.talk ? ' talk' : ''}${p.me ? ' me' : ''}"><i style="background:${p.color}"></i><span class="nm">${esc(p.name)}${p.host ? ' <em>hôte</em>' : ''}${p.talkie ? ' 📻' : ''}</span><span class="hpb"><b style="width:${Math.max(0, Math.min(100, p.hp ?? 100))}%"></b></span><small>${p.down ? 'À TERRE' : p.me ? (p.talk ? '🎙 parle' : 'vous') : p.talk ? '🎙 parle' : p.dist !== undefined ? `${p.dist} m` : ''}</small></div>`).join('');
      if (el2.innerHTML !== html) el2.innerHTML = html;
    },
    chat(name, color, text) {
      const log = $('chatLog');
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.style.color = color; b.textContent = name;
      p.appendChild(b);
      p.appendChild(document.createTextNode(text));
      log.appendChild(p);
      while (log.children.length > 6) log.firstChild.remove();
      setTimeout(() => p.remove(), 14000);
    },
    downed(on, text) { $('downed').classList.toggle('hidden', !on); if (text) $('downedText').textContent = text; },
    veil(v) { $('veil').style.opacity = v; },
    deadTitle(t) { $('deadTitle').textContent = t; },
  };

  // ── radio : messages tapés lettre par lettre ──
  const queue = [];
  let busy = false;
  const radioEl = $('radio'), radioText = $('radioText');
  api.radio = (msg, onBeep) => {
    queue.push(msg);
    if (!busy) next();
    function next() {
      const m = queue.shift();
      if (!m) { busy = false; radioEl.classList.remove('on'); return; }
      busy = true;
      onBeep?.();
      radioEl.classList.add('on');
      let i = 0;
      radioText.textContent = '';
      const iv = setInterval(() => {
        i += 2;
        radioText.textContent = m.slice(0, i);
        if (i >= m.length) { clearInterval(iv); setTimeout(next, Math.max(3800, m.length * 55)); }
      }, 26);
    }
  };

  // ── fenêtres (cadenas, fusibles, radio, notes) ──
  let onClose = null;
  api.modalOpen = () => !el.modal.classList.contains('hidden');
  api.openModal = (title, hint, cb) => {
    $('mTitle').textContent = title;
    $('mHint').textContent = hint || 'Échap pour fermer';
    const body = $('mBody');
    body.innerHTML = '';
    onClose = cb || null;
    api.show('modal', true);
    return body;
  };
  api.closeModal = () => { if (!api.modalOpen()) return; api.show('modal', false); const c = onClose; onClose = null; c?.(); };
  $('mClose').addEventListener('click', () => api.closeModal());

  const btn = (label, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = `dbtn ${cls}`; b.textContent = label; return b; };

  // pavé numérique générique
  api.keypad = (title, len, onSubmit, closeCb) => {
    const body = api.openModal(title, 'Chiffres au clavier · Entrée pour valider · Échap pour fermer', closeCb);
    let code = '';
    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    const render = () => { lcd.textContent = (code + '_'.repeat(len)).slice(0, len).split('').join(' '); };
    render();
    body.appendChild(lcd);
    const grid = document.createElement('div');
    grid.className = 'keysGrid';
    const press = (k) => {
      if (k === '⌫') code = code.slice(0, -1);
      else if (k === 'OK') {
        if (!onSubmit(code)) { lcd.classList.remove('err'); void lcd.offsetWidth; lcd.classList.add('err'); code = ''; }
        else { lcd.classList.add('ok'); }
      } else if (code.length < len) code += k;
      render();
      if (code.length === len && k !== 'OK' && k !== '⌫') setTimeout(() => press('OK'), 160);
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].forEach((k) => {
      const b = btn(k, k === 'OK' ? 'go' : k === '⌫' ? 'alt' : '');
      b.addEventListener('click', () => press(k));
      grid.appendChild(b);
    });
    body.appendChild(grid);
    api.modalKey = (e) => {
      if (/^(Digit|Numpad)\d$/.test(e.code)) press(e.code.slice(-1));
      else if (e.code === 'Backspace') press('⌫');
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') press('OK');
    };
  };

  // tableau à fusibles : 3 emplacements, fusibles possédés
  api.fusePanel = (slots, owned, onChange, closeCb) => {
    const body = api.openModal('Tableau électrique', 'Cliquez un emplacement pour y placer (ou retirer) un fusible', closeCb);
    const colors = { red: '#ff4d4d', blue: '#3d7bff', yellow: '#ffd166' };
    const names = { red: 'rouge', blue: 'bleu', yellow: 'jaune' };
    const row = document.createElement('div');
    row.className = 'fuseRow';
    const inv = document.createElement('p');
    inv.className = 'inv';
    const draw = () => {
      row.innerHTML = '';
      slots.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fuseSlot';
        b.innerHTML = `<span class="ic">${s.icon}</span><span class="fz" style="background:${s.fuse ? colors[s.fuse] : '#2a2f45'}"></span><span>${s.label}</span>`;
        b.addEventListener('click', () => {
          const free = owned.filter((f) => !slots.some((o) => o.fuse === f));
          const order = [null, ...free];
          if (s.fuse) s.fuse = null; else s.fuse = order[1] || null;
          onChange(slots);
          draw();
        });
        row.appendChild(b);
      });
      const free = owned.filter((f) => !slots.some((o) => o.fuse === f));
      inv.textContent = owned.length ? `Fusibles en poche : ${free.length ? free.map((f) => names[f]).join(', ') : 'aucun (tous placés)'}` : 'Aucun fusible en poche. Cherchez-en sur l\'île.';
    };
    draw();
    body.appendChild(row);
    body.appendChild(inv);
    api.modalKey = null;
  };

  // radio de la tour : réglage de fréquence
  api.radioTuner = (onTune, closeCb) => {
    const body = api.openModal('Radio de la tour', 'Réglez la fréquence puis appuyez sur Émettre', closeCb);
    let f = 118.0;
    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    const render = () => { lcd.textContent = `${f.toFixed(2)} MHz`; };
    render();
    body.appendChild(lcd);
    const dial = document.createElement('div');
    dial.className = 'dial';
    [['−1', -1], ['−0.05', -0.05], ['+0.05', 0.05], ['+1', 1]].forEach(([l, d]) => {
      const b = btn(l);
      b.addEventListener('click', () => { f = Math.min(136, Math.max(108, Math.round((f + d) * 100) / 100)); render(); });
      dial.appendChild(b);
    });
    body.appendChild(dial);
    const go = btn('Émettre', 'go');
    go.addEventListener('click', () => { if (!onTune(f.toFixed(2))) { lcd.classList.remove('err'); void lcd.offsetWidth; lcd.classList.add('err'); } else lcd.classList.add('ok'); });
    body.appendChild(go);
    api.modalKey = (e) => {
      if (e.code === 'ArrowUp') { f = Math.min(136, Math.round((f + 0.05) * 100) / 100); render(); }
      if (e.code === 'ArrowDown') { f = Math.max(108, Math.round((f - 0.05) * 100) / 100); render(); }
      if (e.code === 'ArrowRight') { f = Math.min(136, f + 1); render(); }
      if (e.code === 'ArrowLeft') { f = Math.max(108, f - 1); render(); }
      if (e.code === 'Enter') go.click();
    };
  };

  // cadenas à symboles (coffre du canot)
  api.symbolLock = (symbols, onTry, closeCb) => {
    const body = api.openModal('Coffre de survie', 'Cliquez sur chaque molette pour changer le symbole', closeCb);
    const vals = [0, 0, 0];
    const row = document.createElement('div');
    row.className = 'symRow';
    const draw = () => {
      row.innerHTML = '';
      vals.forEach((v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `${symbols[v]}<small>molette ${i + 1}</small>`;
        b.addEventListener('click', () => { vals[i] = (vals[i] + 1) % symbols.length; draw(); });
        row.appendChild(b);
      });
    };
    draw();
    body.appendChild(row);
    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    lcd.style.fontSize = '18px';
    lcd.textContent = 'VERROUILLÉ';
    body.appendChild(lcd);
    const go = btn('Ouvrir', 'go');
    go.addEventListener('click', () => {
      if (!onTry(vals.map((v) => symbols[v]))) { lcd.classList.remove('err'); void lcd.offsetWidth; lcd.classList.add('err'); lcd.textContent = 'ÇA NE BOUGE PAS'; }
      else { lcd.classList.add('ok'); lcd.textContent = 'CLAC !'; }
    });
    body.appendChild(go);
    api.modalKey = (e) => { if (e.code === 'Enter') go.click(); };
  };

  // lecture d'une note
  api.note = (title, text, closeCb) => {
    const body = api.openModal(title, 'Échap pour fermer · la note est recopiée dans le carnet', closeCb);
    const n = document.createElement('div');
    n.className = 'note';
    n.innerHTML = text;
    body.appendChild(n);
    api.modalKey = null;
  };

  // jauge de chaleur du chalumeau (sous le réticule)
  api.weld = (w) => {
    let el2 = document.getElementById('weldGauge');
    if (!el2) {
      el2 = document.createElement('div');
      el2.id = 'weldGauge';
      el2.innerHTML = '<div class="wg"><i class="zone"></i><i class="fill"></i></div><small></small>';
      document.getElementById('hud').appendChild(el2);
    }
    el2.classList.toggle('hidden', !w);
    if (!w) return;
    el2.querySelector('.zone').style.cssText = `left:${w.lo}%;width:${w.hi - w.lo}%`;
    const f = el2.querySelector('.fill');
    f.style.width = `${Math.min(100, w.heat)}%`;
    f.classList.toggle('hot', w.heat > w.hi);
    f.classList.toggle('ok', w.heat >= w.lo && w.heat <= w.hi);
    el2.querySelector('small').textContent = w.msg || '';
  };

  // ── circuit hydraulique : tuyaux à faire pivoter (source à gauche, pompe à droite) ──
  // cells : tableau H×W de masques (N=1, E=2, S=4, W=8) ; src/dst : rangées d'entrée/sortie
  api.pipePuzzle = (pz, onSolve, closeCb) => {
    const body = api.openModal('Circuit de la cuve', 'Cliquez les tuyaux pour les faire pivoter · reliez la cuve à la pompe', closeCb);
    const { W, H, src, dst } = pz;
    const wrap = document.createElement('div');
    wrap.className = 'pipeWrap';
    const grid = document.createElement('div');
    grid.className = 'pipeGrid';
    grid.style.gridTemplateColumns = `repeat(${W}, 1fr)`;
    const lab = (t, cls) => { const d = document.createElement('div'); d.className = `pipeEnd ${cls}`; d.innerHTML = t; return d; };
    const inL = lab('CUVE<b>⛽</b>', 'l'); inL.style.gridRow = `${src + 1}`;
    const outR = lab('POMPE<b>⚙</b>', 'r'); outR.style.gridRow = `${dst + 1}`;
    const left = document.createElement('div'); left.className = 'pipeSide'; left.style.gridTemplateRows = `repeat(${H}, 1fr)`; left.appendChild(inL);
    const right = document.createElement('div'); right.className = 'pipeSide'; right.style.gridTemplateRows = `repeat(${H}, 1fr)`; right.appendChild(outR);
    wrap.append(left, grid, right);
    const status = document.createElement('div');
    status.className = 'lcd';
    status.style.fontSize = '16px';
    let moves = 0, solved = false;
    const rot = (m) => ((m << 1) | (m >> 3)) & 15;
    const flow = () => {
      const on = new Set();
      const q = [];
      if (pz.cells[src][0] & 8) { q.push([0, src]); on.add(`0,${src}`); }
      const D = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
      while (q.length) {
        const [x, y] = q.shift();
        const m = pz.cells[y][x];
        for (const [dx, dy, b, back] of D) {
          if (!(m & b)) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!(pz.cells[ny][nx] & back) || on.has(`${nx},${ny}`)) continue;
          on.add(`${nx},${ny}`); q.push([nx, ny]);
        }
      }
      return { on, done: on.has(`${W - 1},${dst}`) && (pz.cells[dst][W - 1] & 2) };
    };
    const svg = (m, wet) => {
      const c = wet ? '#5ef2c2' : '#8a93b8';
      const seg = { 1: 'M50 50 L50 0', 2: 'M50 50 L100 50', 4: 'M50 50 L50 100', 8: 'M50 50 L0 50' };
      const d = [1, 2, 4, 8].filter((b) => m & b).map((b) => seg[b]).join(' ');
      return `<svg viewBox="0 0 100 100"><path d="${d}" stroke="#10162b" stroke-width="30" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="18" stroke-linecap="round"/><circle cx="50" cy="50" r="12" fill="${c}"/></svg>`;
    };
    const draw = () => {
      const f = flow();
      grid.innerHTML = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pipe${f.on.has(`${x},${y}`) ? ' wet' : ''}`;
        b.innerHTML = svg(pz.cells[y][x], f.on.has(`${x},${y}`));
        b.addEventListener('click', () => { if (solved) return; pz.cells[y][x] = rot(pz.cells[y][x]); moves++; api.onTick?.(); draw(); });
        grid.appendChild(b);
      }
      status.textContent = f.done ? 'PRESSION OK · CIRCUIT FERMÉ' : `DÉBIT : ${Math.round((f.on.size / (W * H)) * 100)} % · ${moves} coups`;
      if (f.done && !solved) { solved = true; status.classList.add('ok'); setTimeout(() => onSolve(pz), 500); }
    };
    body.appendChild(wrap);
    body.appendChild(status);
    draw();
    api.modalKey = null;
  };

  // ── pompe : garder l'aiguille de pression dans la zone verte ──
  api.pumpPanel = ({ getFuel, max, onFlow, onBurst, onFull }, closeCb) => {
    const body = api.openModal('Pompe à carburant', 'Maintenez « Pomper » (ou Espace) · gardez l\'aiguille dans le vert · le rouge fait sauter la sécurité', closeCb);
    const cv = document.createElement('canvas');
    cv.width = 520; cv.height = 250;
    cv.className = 'gauge';
    body.appendChild(cv);
    const bar = document.createElement('div');
    bar.className = 'fuelBar';
    bar.innerHTML = '<i></i><span></span>';
    body.appendChild(bar);
    const b = btn('Pomper', 'go big');
    body.appendChild(b);
    let hold = false, p = 10, lock = 0, t = 0, last = performance.now(), full = false;
    const down = () => { hold = true; }, up = () => { hold = false; };
    b.addEventListener('mousedown', down); b.addEventListener('touchstart', down);
    addEventListener('mouseup', up); addEventListener('touchend', up);
    api.modalKey = (e) => { if (e.code === 'Space') { hold = true; e.preventDefault(); } };
    const keyUp = (e) => { if (e.code === 'Space') hold = false; };
    addEventListener('keyup', keyUp);
    const g = cv.getContext('2d');
    const frame = () => {
      if (!api.modalOpen() || body.parentNode === null || !body.contains(cv)) { removeEventListener('mouseup', up); removeEventListener('keyup', keyUp); return; }
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const gLo = 40 + Math.sin(t * 0.7) * 16 + Math.sin(t * 1.9) * 5, gHi = gLo + 20;
      if (lock > 0) { lock -= dt; p = Math.max(0, p - 40 * dt); }
      else {
        p += (hold ? 48 : -34) * dt + Math.sin(t * 9) * 3 * dt;
        p = Math.max(0, Math.min(100, p));
        if (p > 90) { lock = 2.2; onBurst?.(); }
      }
      const inG = p >= gLo && p <= gHi && lock <= 0;
      if (inG && !full) onFlow(dt);
      const fuel = getFuel();
      if (!full && fuel >= max - 0.01) { full = true; onFull?.(); }
      // cadran
      const W = cv.width, H = cv.height, cx = W / 2, cy = H - 22, R = 190;
      g.clearRect(0, 0, W, H);
      const ang = (v) => Math.PI + (v / 100) * Math.PI;
      const arc = (a, b2, col, w) => { g.beginPath(); g.arc(cx, cy, R, ang(a), ang(b2)); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
      arc(0, 100, '#2a2f45', 34);
      arc(gLo, gHi, '#5ef2c2', 34);
      arc(90, 100, '#ff6b5b', 34);
      for (let v = 0; v <= 100; v += 10) {
        const a = ang(v);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26)); g.lineTo(cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40));
        g.strokeStyle = '#fff4e0'; g.lineWidth = 3; g.stroke();
      }
      const a = ang(p);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
      g.strokeStyle = lock > 0 ? '#ff6b5b' : '#ffd166'; g.lineWidth = 7; g.lineCap = 'round'; g.stroke();
      g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fillStyle = '#10162b'; g.fill();
      g.font = '700 22px "Bricolage Grotesque", sans-serif'; g.textAlign = 'center'; g.fillStyle = lock > 0 ? '#ff6b5b' : inG ? '#5ef2c2' : '#fff4e0';
      g.fillText(lock > 0 ? 'SÉCURITÉ ! ATTENDEZ' : full ? 'RÉSERVOIR PLEIN' : inG ? 'ÇA COULE' : p < gLo ? 'PRESSION TROP BASSE' : 'TROP HAUT, RELÂCHEZ', cx, cy - 60);
      bar.firstChild.style.width = `${Math.min(100, (fuel / max) * 100)}%`;
      bar.lastChild.textContent = `Réservoir ${Math.round(fuel)} / ${max} %`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  // ── comptoir d'échange ──
  api.shop = ({ title, sub, items, getScrap, onBuy }, closeCb) => {
    const body = api.openModal(title, 'Payez en coquillages : ramassez-les sur les plages, vendez votre pêche · Échap pour fermer', closeCb);
    const head = document.createElement('div');
    head.className = 'shopHead';
    const grid = document.createElement('div');
    grid.className = 'shopGrid';
    const draw = () => {
      const s = getScrap();
      head.innerHTML = `<span>${sub}</span><b>🐚 ${s} coquillages</b>`;
      grid.innerHTML = '';
      for (const it of items()) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = `shopCard${it.owned ? ' owned' : ''}${it.sell ? ' sell' : ''}${!it.owned && !it.sell && s < it.cost ? ' poor' : ''}`;
        c.innerHTML = `<span class="ic">${it.icon}</span><b>${it.name}</b><small>${it.desc}</small><em>${it.sell ? `+${it.gain} 🐚` : it.owned ? 'acquis' : `🐚 ${it.cost}`}</em>`;
        c.addEventListener('click', () => { if (it.owned) return; if (onBuy(it.id)) { c.classList.add('bought'); setTimeout(draw, 250); } else { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } });
        grid.appendChild(c);
      }
    };
    draw();
    body.append(head, grid);
    api.modalKey = null;
    api.refreshShop = draw;
  };

  // ── séquenceur (mémoire de couleurs) : 3 manches de longueur croissante ──
  api.simon = ({ title, rounds = [3, 4, 5], onPad, onFail, onSolve }, closeCb) => {
    const body = api.openModal(title, 'Regardez la séquence, puis reproduisez-la · touches 1 à 4 possibles', closeCb);
    const cols = ['#ff6b5b', '#ffd166', '#5ef2c2', '#b8a4ff'];
    const lcd = document.createElement('div');
    lcd.className = 'lcd';
    lcd.style.fontSize = '18px';
    const grid = document.createElement('div');
    grid.className = 'simonGrid';
    const pads = cols.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pad'; b.style.setProperty('--c', c);
      b.innerHTML = `<span>${i + 1}</span>`;
      b.addEventListener('click', () => press(i));
      grid.appendChild(b);
      return b;
    });
    body.append(lcd, grid);
    let round = 0, seq = [], pos = 0, busy = true;
    const flash = (i, ms = 380) => { pads[i].classList.add('lit'); onPad?.(i); setTimeout(() => pads[i].classList.remove('lit'), ms); };
    const play = () => {
      busy = true; pos = 0;
      seq = Array.from({ length: rounds[round] }, () => Math.floor(Math.random() * 4));
      lcd.textContent = `MANCHE ${round + 1}/${rounds.length} · REGARDEZ`;
      lcd.classList.remove('err', 'ok');
      seq.forEach((i, k) => setTimeout(() => { if (api.modalOpen()) flash(i); }, 700 + k * 620));
      setTimeout(() => { busy = false; lcd.textContent = `MANCHE ${round + 1}/${rounds.length} · À VOUS`; }, 700 + seq.length * 620);
    };
    const press = (i) => {
      if (busy) return;
      flash(i, 200);
      if (seq[pos] !== i) {
        busy = true; lcd.textContent = 'ERREUR · ON RECOMMENCE'; lcd.classList.remove('err'); void lcd.offsetWidth; lcd.classList.add('err');
        onFail?.();
        setTimeout(play, 1100);
        return;
      }
      pos++;
      if (pos === seq.length) {
        round++;
        busy = true;
        if (round === rounds.length) { lcd.textContent = 'SÉQUENCE VALIDÉE'; lcd.classList.add('ok'); setTimeout(() => onSolve(), 700); }
        else { lcd.textContent = 'BIEN · MANCHE SUIVANTE'; setTimeout(play, 900); }
      }
    };
    api.modalKey = (e) => { const m = /^(Digit|Numpad)([1-4])$/.exec(e.code); if (m) press(+m[2] - 1); };
    play();
  };

  return api;
}
