// Réseau : une même interface pour deux transports
//  - « ws »   : le serveur de jeu (server/server.js), avec salles par code et hôte désigné par le serveur ;
//  - « room » : le canal temps réel des pages publiées sur claude.ai (repli quand aucun serveur n'est joignable).
// Sémantique commune : chaque participant publie un objet « presence » (état absolu, ~15 Hz)
// et peut émettre des événements ponctuels.

const TOPIC = 'pio';

// ── Transport « room » (page publiée) ───────────────────────
async function roomTransport() {
  if (!window.claude || typeof window.claude.use !== 'function') return null;
  let room = null;
  try { room = await window.claude.use('room'); } catch { room = null; }
  if (!room) return null;
  const t = {
    kind: 'room',
    label: 'salon de la page publiée',
    me: null,
    presenceHandlers: [], eventHandlers: [],
    connected: () => room.connected(),
    setPresence(obj) { room.presence({ s: obj }).catch(() => {}); },
    emit(data) { room.emit(TOPIC, data).catch(() => {}); },
    peers() {
      return room.peers().filter((p) => !p.sameTab && p.kind === 'viewer').map((p) => ({ id: p.peer, presence: p.presence?.s || null }));
    },
    onPresence(fn) { this.presenceHandlers.push(fn); },
    onEvent(fn) { this.eventHandlers.push(fn); },
    onHost() {},
    onStatus() {},
    async join() { return { ok: true }; },
    leave() { this.setPresence({ g: null }); },
    async list() { return []; },
    sendSave() {},
  };
  room.onPeers((ch) => {
    for (const p of ch.peers) if (p.sameTab) t.me = p.peer;
    for (const p of [...ch.joined, ...ch.updated]) if (!p.sameTab && p.kind === 'viewer') t.presenceHandlers.forEach((f) => f(p.peer, p.presence?.s || null));
    for (const p of ch.left) if (!p.sameTab) t.presenceHandlers.forEach((f) => f(p.peer, null));
  });
  room.on(TOPIC, (msg) => { if (msg.sameTab) return; t.eventHandlers.forEach((f) => f(msg.peer, msg.data)); });
  await new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const mine = room.peers().find((p) => p.sameTab);
      if (mine || Date.now() - t0 > 4000) { clearInterval(iv); t.me = mine ? mine.peer : `me${Math.random().toString(36).slice(2, 8)}`; res(); }
    }, 100);
  });
  return t;
}

// ── Transport WebSocket (serveur de jeu, salles) ────────────
function wsTransport(url) {
  return new Promise((resolve) => {
    const peers = new Map();
    const t = {
      kind: 'ws',
      label: url.replace(/^wss?:\/\//, '').replace(/\/ws$/, ''),
      url,
      me: null,
      hostId: null,
      code: null,
      closed: false,
      presenceHandlers: [], eventHandlers: [], hostHandlers: [], statusHandlers: [],
      ws: null,
      connected() { return !!this.ws && this.ws.readyState === 1; },
      raw(msg) { if (this.connected()) this.ws.send(JSON.stringify(msg)); },
      setPresence(obj) { this.raw({ t: 'p', s: obj }); },
      emit(data) { this.raw({ t: 'e', d: data }); },
      peers() { return [...peers.entries()].map(([id, presence]) => ({ id, presence })); },
      onPresence(fn) { this.presenceHandlers.push(fn); },
      onEvent(fn) { this.eventHandlers.push(fn); },
      onHost(fn) { this.hostHandlers.push(fn); },
      onStatus(fn) { this.statusHandlers.push(fn); },
      // rejoint (ou crée) une salle ; résout { ok, host, started, save } ou { ok:false, msg }
      join(code, opts) {
        this.code = code; this.joinOpts = opts;
        return new Promise((res) => {
          this.pendingJoin = res;
          this.raw({ t: 'join', code, ...opts });
          setTimeout(() => { if (this.pendingJoin === res) { this.pendingJoin = null; res({ ok: false, msg: 'Le serveur ne répond pas.' }); } }, 6000);
        });
      },
      leave() {
        this.code = null;
        this.raw({ t: 'leave' });
        for (const id of [...peers.keys()]) { peers.delete(id); this.presenceHandlers.forEach((f) => f(id, null)); }
      },
      list() {
        return new Promise((res) => {
          this.pendingList = res;
          this.raw({ t: 'list' });
          setTimeout(() => { if (this.pendingList === res) { this.pendingList = null; res([]); } }, 4000);
        });
      },
      sendSave(w) { this.raw({ t: 'save', w }); },
    };
    let first = true, retries = 0;
    const connect = () => {
      let ws;
      try { ws = new WebSocket(url); } catch { if (first) { first = false; resolve(null); } return; }
      t.ws = ws;
      const timer = setTimeout(() => { if (first) { first = false; try { ws.close(); } catch { /* déjà fermé */ } resolve(null); } }, 5000);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          t.me = m.you;
          clearTimeout(timer);
          retries = 0;
          if (first) { first = false; resolve(t); }
          else if (t.code) { t.statusHandlers.forEach((f) => f('reconnected')); t.join(t.code, { ...t.joinOpts, create: true }); }
        } else if (m.t === 'joined') {
          t.me = m.you;
          t.hostId = m.host;
          t.pendingJoin?.({ ok: true, host: m.host, started: m.started, save: m.save });
          t.pendingJoin = null;
          t.hostHandlers.forEach((f) => f(m.host, m.save));
          for (const p of m.peers) { peers.set(p.id, p.s); t.presenceHandlers.forEach((f) => f(p.id, p.s)); }
        } else if (m.t === 'error') {
          t.pendingJoin?.({ ok: false, msg: m.msg });
          t.pendingJoin = null;
        } else if (m.t === 'rooms') { t.pendingList?.(m.list || []); t.pendingList = null; }
        else if (m.t === 'host') { t.hostId = m.id; t.hostHandlers.forEach((f) => f(m.id, m.save)); }
        else if (m.t === 'p') { peers.set(m.from, m.s); t.presenceHandlers.forEach((f) => f(m.from, m.s)); }
        else if (m.t === 'left') { peers.delete(m.from); t.presenceHandlers.forEach((f) => f(m.from, null)); }
        else if (m.t === 'e') t.eventHandlers.forEach((f) => f(m.from, m.d));
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        if (first) { first = false; resolve(null); return; }
        if (t.closed) return;
        t.statusHandlers.forEach((f) => f('lost'));
        for (const id of [...peers.keys()]) { peers.delete(id); t.presenceHandlers.forEach((f) => f(id, null)); }
        if (retries++ < 30) setTimeout(connect, Math.min(8000, 1000 * retries));
      };
    };
    connect();
  });
}

// adresse du serveur : « mon-jeu.onrender.com », « https://… », « wss://… » ; vide = le serveur qui sert la page
export function normalizeServer(addr) {
  let a = String(addr || '').trim();
  if (!a) {
    if (location.protocol === 'http:' || location.protocol === 'https:') a = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    else return null;
  }
  if (/^https?:\/\//.test(a)) a = a.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(a)) a = `${/^(localhost|127\.|192\.168\.|10\.)/.test(a) ? 'ws' : 'wss'}://${a}`;
  if (!/\/ws$/.test(a)) a = `${a.replace(/\/$/, '')}/ws`;
  return a;
}

// choisit le transport : serveur indiqué, sinon serveur de la page, sinon salon de la page publiée
export async function openTransport(serverAddr) {
  const tried = new Set();
  for (const addr of [serverAddr, '']) {
    const url = normalizeServer(addr);
    if (!url || tried.has(url)) continue;
    tried.add(url);
    const w = await wsTransport(url);
    if (w) return w;
  }
  return roomTransport();
}

// ── Session de jeu au-dessus du transport ───────────────────
// Rôles : l'hôte fait autorité (temps, ennemis, validation des actions) ;
// chacun simule son propre personnage ; le pilote simule l'avion.
export class Session {
  constructor(transport, { code, name, color, host }) {
    this.tr = transport;
    this.code = code;
    this.name = name;
    this.color = color;
    this.wantHost = host;
    this.players = new Map();   // id -> { name, color, host, s (état), t (reçu à) }
    this.handlers = {};
    this.state = {};
    this.serverHost = transport.kind === 'ws';
    this.hostId = this.serverHost ? transport.hostId : (host ? transport.me : null);
    this._p = (id, pres) => this.onPresence(id, pres);
    this._e = (from, data) => {
      if (this.dead || !data || data.g !== this.code) return;
      if (data.to && data.to !== this.tr.me) return;
      const h = this.handlers[data.t];
      if (h) h(data.d, from);
    };
    this._h = (id, save) => { if (this.dead) return; const before = this.hostId; this.hostId = id; if (before !== id) this.handlers._host?.(id, before, save); };
    transport.onPresence(this._p);
    transport.onEvent(this._e);
    if (this.serverHost) transport.onHost(this._h);
    for (const p of transport.peers()) this.onPresence(p.id, p.presence);
    this.lastSend = 0;
  }
  get me() { return this.tr.me; }
  get isHost() { return this.hostId === this.tr.me; }
  on(type, fn) { this.handlers[type] = fn; }
  send(type, d, to) { this.tr.emit({ g: this.code, t: type, d, to }); }
  onPresence(id, pres) {
    if (this.dead) return;
    if (!pres || pres.g !== this.code) {
      if (this.players.has(id)) { const p = this.players.get(id); this.players.delete(id); this.handlers._left?.(id, p); this.electHost(); }
      return;
    }
    const known = this.players.has(id);
    const p = known ? this.players.get(id) : { name: '', color: '#fff' };
    p.name = String(pres.n || 'Pilote').replace(/[<>&"'`]/g, '').slice(0, 14) || 'Pilote';
    p.color = /^#[0-9a-f]{6}$/i.test(pres.c) ? pres.c : '#fff4e0';
    p.host = !!pres.h; p.s = pres.s; p.t = performance.now();
    this.players.set(id, p);
    if (!known) this.handlers._joined?.(id, p);
    this.electHost();
  }
  // salon de page publiée : l'hôte est celui qui l'annonce ; s'il part, le plus petit identifiant reprend la main
  electHost() {
    if (this.serverHost) return;
    const before = this.hostId;
    const announced = [...this.players.entries()].filter(([, p]) => p.host).map(([id]) => id);
    if (this.wantHost) announced.push(this.tr.me);
    let h = announced.sort()[0] || null;
    if (!h && before && before !== this.tr.me && !this.players.has(before)) {
      const ids = [...this.players.keys(), this.tr.me].sort();
      h = ids[0];
      if (h === this.tr.me) this.wantHost = true;
    }
    if (!h) h = before;
    this.hostId = h;
    if (before !== h) this.handlers._host?.(h, before);
  }
  publish(s) {
    this.state = s;
    const now = performance.now();
    if (now - this.lastSend < 66) return;
    this.lastSend = now;
    this.tr.setPresence({ g: this.code, n: this.name, c: this.color, h: this.isHost ? 1 : 0, s });
  }
  leave() {
    this.dead = true;
    const rm = (arr, f) => { const i = arr ? arr.indexOf(f) : -1; if (i >= 0) arr.splice(i, 1); };
    rm(this.tr.presenceHandlers, this._p); rm(this.tr.eventHandlers, this._e); rm(this.tr.hostHandlers, this._h);
    this.tr.leave();
  }
  count() { return this.players.size + 1; }
}

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}
