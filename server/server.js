// Serveur de Plane is out : sert le jeu, gère les parties (salles par code) et relaie les messages.
// - chaque partie est une salle identifiée par un code à 4 lettres ;
// - le serveur désigne l'hôte (le plus ancien joueur de la salle) et le remplace s'il part ;
// - l'hôte envoie régulièrement l'état du monde, que le serveur garde (mémoire + disque) :
//   un nouvel hôte ou une salle recréée plus tard repart de cette sauvegarde.
// Usage : node server/server.js   (port : variable PORT, 8080 par défaut ; dossier des sauvegardes : DATA_DIR)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { WebSocketServer } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const GAME = join(here, '..', 'dist', 'plane-is-out.html');
const STUDIO = join(here, '..', 'dist', 'sound-studio.html');
// sons : dossier sounds/ (fichiers audio + config.json réglée dans le studio)
// écriture (enregistrer la config, importer des fichiers) : seulement depuis cette machine,
// sauf SOUND_EDIT=1 (partout) ou SOUND_EDIT=0 (jamais)
const SOUNDS = resolve(process.env.SOUNDS_DIR || join(here, '..', 'sounds'));
const SOUND_EDIT = process.env.SOUND_EDIT;
const AUDIO_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.webm': 'audio/webm' };
try { mkdirSync(SOUNDS, { recursive: true }); } catch { /* lecture seule */ }
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
  if (url === '/studio' || url === '/studio/') {
    if (!existsSync(STUDIO)) { res.writeHead(500); res.end('Build manquant : lancez « node build.mjs ».'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(readFileSync(STUDIO));
    return;
  }
  if (url.startsWith('/sounds/')) { soundsRoute(req, res, url.slice(8)); return; }
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(roomList()));
    return;
  }
  res.writeHead(404); res.end('Introuvable');
});

// ── sons ────────────────────────────────────────────────
function canEditSounds(req) {
  if (SOUND_EDIT === '1') return true;
  if (SOUND_EDIT === '0') return false;
  if (req.headers['x-forwarded-for']) return false;   // derrière un proxy : jamais « local »
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
// chemin relatif sûr dans sounds/ (sous-dossiers permis, jamais en dehors)
function soundPath(rel) {
  let name;
  try { name = decodeURIComponent(rel); } catch { return null; }
  if (!name || name.includes('\0') || name.split(/[\\/]/).some((p) => p === '..' || p.startsWith('.'))) return null;
  const p = resolve(SOUNDS, name);
  return p.startsWith(SOUNDS + sep) ? p : null;
}
function listSounds(dir = SOUNDS, prefix = '', depth = 0, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory() && depth < 3) listSounds(join(dir, e.name), `${prefix}${e.name}/`, depth + 1, out);
    else if (e.isFile() && AUDIO_TYPES[extname(e.name).toLowerCase()]) {
      const st = statSync(join(dir, e.name));
      out.push({ name: prefix + e.name, size: st.size, mtime: Math.round(st.mtimeMs) });
    }
  }
  return out;
}
function readBody(req, max, done) {
  const chunks = []; let n = 0, over = false;
  req.on('data', (c) => { n += c.length; if (n > max) { over = true; req.destroy(); } else chunks.push(c); });
  req.on('end', () => { if (!over) done(Buffer.concat(chunks)); });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
function soundsRoute(req, res, rel) {
  const edit = canEditSounds(req);
  if (rel === '_list') { json(res, 200, { files: listSounds().sort((a, b) => a.name.localeCompare(b.name)), edit }); return; }
  const p = soundPath(rel);
  if (!p) { json(res, 400, { error: 'Nom de fichier invalide.' }); return; }
  const isConfig = rel === 'config.json';
  const type = isConfig ? 'application/json' : AUDIO_TYPES[extname(p).toLowerCase()];
  if (!type) { json(res, 400, { error: 'Format non pris en charge (mp3, wav, ogg, m4a, aac, flac, webm, opus).' }); return; }
  if (req.method === 'PUT') {
    if (!edit) { json(res, 403, { error: 'Écriture réservée à la machine qui fait tourner le serveur (SOUND_EDIT=1 pour l\'autoriser).' }); return; }
    // page d'une autre origine : refusée (le navigateur l'empêche déjà sans CORS, on double la garde)
    const origin = req.headers.origin;
    let foreign = false;
    if (origin) { try { foreign = new URL(origin).host !== req.headers.host; } catch { foreign = true; } }
    if (foreign) { json(res, 403, { error: 'Origine refusée.' }); return; }
    readBody(req, isConfig ? 2 * 1024 * 1024 : 80 * 1024 * 1024, (buf) => {
      if (isConfig) { try { const c = JSON.parse(buf.toString('utf8')); if (!c || typeof c !== 'object') throw new Error(); } catch { json(res, 400, { error: 'Configuration illisible.' }); return; } }
      try {
        mkdirSync(dirname(p), { recursive: true });
        const tmp = `${p}.${process.pid}.tmp`;
        writeFileSync(tmp, buf); renameSync(tmp, p);
        json(res, 200, { ok: true, name: decodeURIComponent(rel), size: buf.length });
      } catch (e) { json(res, 500, { error: `Écriture impossible : ${e.message}` }); }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let st;
  try { st = statSync(p); } catch { json(res, 404, { error: 'Introuvable' }); return; }
  if (!st.isFile()) { json(res, 404, { error: 'Introuvable' }); return; }
  // lecture partielle (Range) : les musiques sont lues en flux et démarrent au point de découpe
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
  if (range && (range[1] || range[2])) {
    let a = range[1] ? +range[1] : st.size - +range[2], b = range[1] && range[2] ? +range[2] : st.size - 1;
    a = Math.max(0, a); b = Math.min(st.size - 1, b);
    if (a > b) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return; }
    res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(p, { start: a, end: b }).pipe(res);
    return;
  }
  res.writeHead(200, { ...head, 'content-length': st.size });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(p).pipe(res);
}

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

http.listen(PORT, () => console.log(`Plane is out : http://localhost:${PORT}  (sauvegardes : ${DATA})\nStudio son  : http://localhost:${PORT}/studio  (sons : ${SOUNDS})`));
