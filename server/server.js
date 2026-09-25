// Serveur de Plane is out : sert le jeu, gère les parties (salles par code) et relaie les messages.
// - chaque partie est une salle identifiée par un code à 4 lettres ;
// - le serveur désigne l'hôte (le plus ancien joueur de la salle) et le remplace s'il part ;
// - l'hôte envoie régulièrement l'état du monde, que le serveur garde (mémoire + disque) :
//   un nouvel hôte ou une salle recréée plus tard repart de cette sauvegarde.
// Usage : node server/server.js   (port : variable PORT, 8080 par défaut ; dossier des sauvegardes : DATA_DIR)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const GAME = join(here, '..', 'dist', 'plane-is-out.html');
const PORT = Number(process.env.PORT) || 8080;
const DATA = process.env.DATA_DIR || join(here, '..', 'data');
const MAX_PLAYERS = 4;
const KEEP_DAYS = 14;
try { mkdirSync(DATA, { recursive: true }); } catch { /* lecture seule : sauvegardes en mémoire seulement */ }

const http = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    if (!existsSync(GAME)) { res.writeHead(500); res.end('Build manquant : lancez « node build.mjs ».'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(readFileSync(GAME));
    return;
  }
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(roomList()));
    return;
  }
  res.writeHead(404); res.end('Introuvable');
});

// ── salles ──────────────────────────────────────────────
const rooms = new Map();   // code → { code, members: Map(ws → client), host, started, save, saveAt }
const codeOk = (c) => typeof c === 'string' && /^[A-Z]{4}$/.test(c);
const clean = (s, n) => String(s || '').replace(/[<>&"'`\u0000-\u001f]/g, '').slice(0, n);
const savePath = (code) => join(DATA, `${code}.json`);

function loadSave(code) {
  try { return JSON.parse(readFileSync(savePath(code), 'utf8')); } catch { return null; }
}
function storeSave(room) {
  if (!room.save) return;
  try { writeFileSync(savePath(room.code), JSON.stringify({ at: Date.now(), w: room.save })); } catch { /* disque indisponible */ }
}
function roomList() {
  return [...rooms.values()].filter((r) => r.members.size > 0 && r.members.size < MAX_PLAYERS && r.open)
    .map((r) => ({ code: r.code, players: r.members.size, names: [...r.members.values()].map((c) => c.name), started: !!r.started }));
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function toRoom(room, msg, except) {
  const text = JSON.stringify(msg);
  for (const ws of room.members.keys()) if (ws !== except && ws.readyState === 1) ws.send(text);
}
function setHost(room) {
  const first = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  const id = first ? first.id : null;
  if (id !== room.host) {
    room.host = id;
    toRoom(room, { t: 'host', id, save: room.save || null });
  }
}
function leave(ws) {
  const me = clients.get(ws);
  if (!me || !me.room) return;
  const room = rooms.get(me.room);
  me.room = null;
  if (!room) return;
  room.members.delete(ws);
  toRoom(room, { t: 'left', from: me.id });
  if (room.members.size === 0) { storeSave(room); rooms.delete(room.code); return; }
  setHost(room);
}

// ── connexions ──────────────────────────────────────────
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 256 * 1024 });
const clients = new Map();
let seq = 0;

wss.on('connection', (ws) => {
  const me = { id: `p${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`, room: null, s: null, name: 'Pilote', color: '#fff4e0', last: 0, count: 0, joinedAt: 0, alive: true };
  clients.set(ws, me);
  send(ws, { t: 'welcome', you: me.id, rooms: roomList() });
  ws.on('pong', () => { me.alive = true; });
  ws.on('message', (buf) => {
    const now = Date.now();
    if (now - me.last > 1000) { me.last = now; me.count = 0; }
    if (++me.count > 150) return;   // limite de débit
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'list') { send(ws, { t: 'rooms', list: roomList() }); return; }
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase();
      if (!codeOk(code)) { send(ws, { t: 'error', code: 'bad_code', msg: 'Code invalide (4 lettres).' }); return; }
      leave(ws);
      let room = rooms.get(code);
      if (!room) {
        if (!m.create) {
          const old = loadSave(code);
          if (!old) { send(ws, { t: 'error', code: 'no_room', msg: 'Aucune partie avec ce code.' }); return; }
        }
        const old = loadSave(code);
        room = { code, members: new Map(), host: null, started: false, save: old ? old.w : null, open: true };
        rooms.set(code, room);
      }
      if (room.members.size >= MAX_PLAYERS) { send(ws, { t: 'error', code: 'full', msg: 'La partie est complète (4 joueurs).' }); return; }
      me.room = code; me.name = clean(m.name, 14) || 'Pilote'; me.color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#fff4e0';
      me.joinedAt = now; me.s = null;
      room.members.set(ws, me);
      const peers = [...room.members.values()].filter((c) => c !== me).map((c) => ({ id: c.id, s: c.s }));
      setHost(room);
      send(ws, { t: 'joined', code, you: me.id, host: room.host, peers, started: room.started, save: room.save || null });
      return;
    }
    if (m.t === 'leave') { leave(ws); return; }
    const room = me.room && rooms.get(me.room);
    if (!room) return;
    if (m.t === 'p') { me.s = m.s; toRoom(room, { t: 'p', from: me.id, s: m.s }, ws); }
    else if (m.t === 'e') {
      const d = m.d;
      if (d && d.t === 'start' && me.id === room.host) room.started = true;
      if (d && d.to) { for (const [w, c] of room.members) if (c.id === d.to) send(w, { t: 'e', from: me.id, d }); }
      else toRoom(room, { t: 'e', from: me.id, d }, ws);
    } else if (m.t === 'save' && me.id === room.host && m.w && typeof m.w === 'object') {
      room.save = m.w;
      if (Date.now() - (room.saveAt || 0) > 30000) { room.saveAt = Date.now(); storeSave(room); }
    }
  });
  ws.on('close', () => { leave(ws); clients.delete(ws); });
});

// connexions mortes et vieilles sauvegardes
setInterval(() => {
  for (const [ws, c] of clients) { if (!c.alive) { ws.terminate(); continue; } c.alive = false; try { ws.ping(); } catch { /* fermé */ } }
}, 20000);
setInterval(() => {
  try {
    for (const f of readdirSync(DATA)) {
      const p = join(DATA, f);
      if (Date.now() - statSync(p).mtimeMs > KEEP_DAYS * 86400000) unlinkSync(p);
    }
  } catch { /* rien */ }
}, 3600000);

http.listen(PORT, () => console.log(`Plane is out : http://localhost:${PORT}  (sauvegardes : ${DATA})`));
