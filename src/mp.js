// Multijoueur : salon, session, avatars, synchronisation, chat de proximité (texte et voix), repères, relève
import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt } from './terrain.js';
import { FLOOR } from './planeModel.js';
import { openTransport, Session, makeCode } from './net.js';
import { buildAvatar } from './avatars.js';
import { createVoice } from './voice.js';
import { COLORS, PROFILE_KEY, SAVE_KEY, store } from './defs.js';

const MODES = ['menu', 'intro', 'explore', 'flight', 'crashed', 'dead'];
const SURF = ['water', 'ground', 'air'];
const VOICE_RANGE = 38, CHAT_RANGE = 40;

export const MPMixin = {
  mpInit() {
    this.session = null;
    this.transport = null;
    this.mates = new Map();      // id → { av, s, pos, yaw, ... }
    this._mateList = [];
    this.chatting = false;
    this.voice = createVoice(this.audio);
    this.voice.onChunk = (b64) => this.session?.send('vx', { a: b64, r: this.own.talkie ? 1 : 0 });
    const $ = (id) => document.getElementById(id);
    const prof = store(PROFILE_KEY) || {};
    this.profile = { name: prof.name || `Pilote ${Math.floor(Math.random() * 90 + 10)}`, color: prof.color || COLORS[Math.floor(Math.random() * COLORS.length)], server: prof.server || '' };
    $('mpName').value = this.profile.name;
    const sw = $('mpColors');
    const drawSw = () => {
      sw.innerHTML = '';
      for (const c of COLORS) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `sw${c === this.profile.color ? ' on' : ''}`; b.style.background = c; b.setAttribute('aria-label', c);
        b.addEventListener('click', () => { this.profile.color = c; this.saveProfile(); drawSw(); });
        sw.appendChild(b);
      }
    };
    drawSw();
    $('mpName').addEventListener('input', (e) => { this.profile.name = e.target.value.trim().slice(0, 14) || 'Pilote'; this.saveProfile(); });
    $('btnMulti').addEventListener('click', () => this.openLobby());
    $('mpServer').value = this.profile.server || '';
    $('mpConnect').addEventListener('click', () => { this.profile.server = $('mpServer').value.trim(); this.saveProfile(); this.mpLeave(); this.openLobby(true); });
    $('mpServer').addEventListener('keydown', (e) => { if (e.code === 'Enter') $('mpConnect').click(); });
    $('mpClose').addEventListener('click', () => { if (!this.inGame()) { this.mpLeave(); this.ui.show('mpSheet', false); this.ui.show('menu', true); } });
    $('mpCreate').addEventListener('click', () => this.mpJoin(makeCode(), true));
    $('mpJoin').addEventListener('click', () => { const c = $('mpCode').value.trim().toUpperCase(); if (c.length === 4) this.mpJoin(c, false); });
    $('mpCode').addEventListener('keydown', (e) => { if (e.code === 'Enter') $('mpJoin').click(); });
    $('mpCopy').addEventListener('click', () => { navigator.clipboard?.writeText(this.session?.code || '').catch(() => {}); $('mpCopy').textContent = 'Copié !'; setTimeout(() => { $('mpCopy').textContent = 'Copier'; }, 1500); });
    $('mpStart').addEventListener('click', () => this.mpStart());
    $('mpLeave').addEventListener('click', () => { this.mpLeave(); $('mpLobby').hidden = true; $('mpSetup').hidden = false; });
    // chat texte
    const ci = $('chatInput');
    ci.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const t = ci.value.trim(); if (t) this.sendChat(t); this.closeChat(); }
      else if (e.code === 'Escape') this.closeChat();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.session && this.inGame() && !this.chatting && !this.ui.modalOpen() && e.target.tagName !== 'INPUT') { e.preventDefault(); this.openChat(); }
    });
    // repères
    this.pingGeo = new THREE.ConeGeometry(0.5, 1.2, 4).rotateX(Math.PI);
    this.ringGeo = new THREE.TorusGeometry(1.1, 0.08, 6, 24).rotateX(Math.PI / 2);
  },
  saveProfile() { store(PROFILE_KEY, this.profile); },

  async openLobby(force) {
    const $ = (id) => document.getElementById(id);
    this.audio.init();
    this.ui.show('menu', false);
    this.ui.show('mpSheet', true);
    $('mpLobby').hidden = !this.session;
    $('mpSetup').hidden = !!this.session;
    if (this.transport && !force) { this.refreshRooms(); return; }
    const st = $('mpStatus');
    st.className = 'mpStatus';
    st.textContent = 'Connexion au serveur de jeu…';
    $('mpCreate').disabled = true; $('mpJoin').disabled = true;
    if (this.transport && this.transport.ws) { this.transport.closed = true; try { this.transport.ws.close(); } catch { /* */ } }
    this.transport = await openTransport(this.profile.server);
    if (!this.transport) {
      st.className = 'mpStatus bad';
      st.innerHTML = 'Aucun serveur joignable. Indiquez l\'adresse de votre serveur (voir le README : déploiement en un clic sur Render), ou lancez-le en local avec <code>npm start</code>.';
      return;
    }
    const tr = this.transport;
    st.className = 'mpStatus ok';
    st.textContent = tr.kind === 'room' ? 'Pas de serveur : salon de la page publiée (joueurs ayant cette page ouverte).' : `Connecté au serveur ${tr.label}. Créez une partie ou rejoignez-en une.`;
    tr.onStatus((k) => {
      if (k === 'lost') this.ui.toast('Connexion perdue', 'Reconnexion au serveur…', 'bad', 3000);
      if (k === 'reconnected') this.ui.toast('Reconnecté', 'Vous êtes de retour dans la partie.', 'good', 2500);
    });
    $('mpCreate').disabled = false; $('mpJoin').disabled = false;
    this.refreshRooms();
  },
  async refreshRooms() {
    const $ = (id) => document.getElementById(id);
    if (!this.transport || this.transport.kind !== 'ws' || this.session) { $('mpRooms').hidden = true; return; }
    const list = await this.transport.list();
    $('mpRooms').hidden = !list.length;
    const ul = $('mpRoomList');
    ul.innerHTML = '';
    for (const r of list) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const code = document.createElement('b'); code.textContent = r.code;
      const who = document.createElement('span'); who.textContent = `${r.names.join(', ')} · ${r.players}/4${r.started ? ' · en cours' : ''}`;
      b.append(code, who);
      b.addEventListener('click', () => this.mpJoin(r.code, false));
      li.appendChild(b); ul.appendChild(li);
    }
  },

  async mpJoin(code, host) {
    if (!this.transport) return;
    const $ = (id) => document.getElementById(id);
    this.mpLeave();
    const st = $('mpStatus');
    st.className = 'mpStatus'; st.textContent = host ? 'Création de la partie…' : `Connexion à la partie ${code}…`;
    const res = await this.transport.join(code, { name: this.profile.name, color: this.profile.color, create: host });
    if (!res.ok) { st.className = 'mpStatus bad'; st.textContent = res.msg || 'Impossible de rejoindre.'; return; }
    this.serverSave = res.save || null;
    const s = new Session(this.transport, { code, name: this.profile.name, color: this.profile.color, host });
    this.session = s;
    this.bindSession(s);
    s.publish({ m: 0 });
    $('mpSetup').hidden = true; $('mpLobby').hidden = false;
    $('mpCodeShow').textContent = code;
    this.refreshLobby();
    if (!s.isHost) setTimeout(() => { if (this.session === s && !this.inGame()) s.send('hello', {}); }, 600);
  },
  refreshLobby() {
    const $ = (id) => document.getElementById(id);
    const s = this.session;
    if (!s) return;
    const L = [{ name: `${this.profile.name} (vous)`, color: this.profile.color, host: s.isHost }];
    for (const [id, p] of s.players) L.push({ name: p.name, color: p.color, host: id === s.hostId });
    const ul = $('mpPlayers');
    ul.innerHTML = '';
    for (const p of L) {
      const li = document.createElement('li');
      const i = document.createElement('i'); i.style.background = p.color;
      li.append(i, document.createTextNode(p.name));
      if (p.host) { const em = document.createElement('em'); em.textContent = 'hôte'; li.append(' ', em); }
      ul.appendChild(li);
    }
    $('mpStart').hidden = !s.isHost;
    $('mpWait').hidden = s.isHost;
    const hasSave = this.serverSave || store(SAVE_KEY);
    $('mpResumeLabel').textContent = this.serverSave ? 'Reprendre la partie sauvegardée sur le serveur' : 'Reprendre ma sauvegarde';
    $('mpResume').closest('label').classList.toggle('hidden', !s.isHost || !hasSave);
  },
  mpLeave() {
    if (!this.session) return;
    this.session.leave();
    this.session = null;
    for (const m of this.mates.values()) this.scene.remove(m.av.root);
    this.mates.clear();
    this._mateList = [];
    this.voice.setTalking(false);
    this.ui.crew([]);
    this.ui.show('crew', false);
  },

  mpStart() {
    const s = this.session;
    if (!s || !s.isHost) return;
    const resume = document.getElementById('mpResume').checked;
    if (resume && this.serverSave) { store(SAVE_KEY, this.serverSave); this.continueGame(true); }
    else if (resume && store(SAVE_KEY)) this.continueGame(true);
    else this.newGame(Math.floor(Math.random() * 1e9));
    s.send('start', { seed: this.seed, intro: this.mode === 'intro' ? 1 : 0 });
    this.worldSentAt = 0;
  },

  // ── réception ──
  bindSession(s) {
    s.on('_joined', (id, p) => {
      this.refreshLobby();
      if (this.inGame() || this.mode === 'intro') {
        this.ui.toast(`${p.name} rejoint l'équipage`, '', 'good');
        if (s.isHost) { s.send('start', { seed: this.seed, late: 1 }, id); setTimeout(() => this.sendWorld(id), 300); }
      }
    });
    s.on('_left', (id, p) => {
      this.refreshLobby();
      const m = this.mates.get(id);
      if (m) { this.scene.remove(m.av.root); this.mates.delete(id); }
      if (this.inGame()) this.ui.toast(`${p.name} a quitté la partie`, '', 'bad');
      if (s.isHost) {
        for (const it of Object.values(this.items)) if (it.carrier === id) { const pos = m ? m.pos : it.pos; this.applyAct('drop', { id: it.id, x: pos.x, z: pos.z, y: pos.y, r: 0 }, id, false); }
        if (this.pilotId === id) this.pilotId = null;
        if (this.nozzle === id) this.nozzle = null;
        this.dirtyWorld = true;
      }
    });
    s.on('_host', (h) => {
      this.refreshLobby();
      if (h === s.me && this.inGame()) { this.ui.toast('Vous êtes l\'hôte', 'L\'hôte précédent est parti : la partie continue chez vous.', ''); this.dirtyWorld = true; }
    });
    s.on('hello', (d, from) => { if (s.isHost && (this.inGame() || this.mode === 'intro')) { s.send('start', { seed: this.seed, late: 1 }, from); setTimeout(() => this.sendWorld(from), 300); } });
    s.on('start', (d) => this.onStart(d));
    s.on('skip', () => this.skipIntro());
    s.on('world', (w) => this.onWorld(w));
    s.on('notes', (d) => { this.notes = (d.notes || []).map((n) => String(n).replace(/[<>]/g, '')); this.refreshCarnet(); });
    s.on('act', (m, from) => this.onGuestAct(m, from));
    s.on('acted', (m) => this.onActed(m));
    s.on('reject', (m) => {
      this.forceWorld = true;
      if (m.type === 'pick' && this.carrying) { this.carrying = null; this.ui.toast('Trop tard', 'Quelqu\'un a pris cette pièce avant vous.', 'bad', 2000); }
      if (m.type === 'pilot') { this.mode = 'explore'; this.ui.el.hud.dataset.mode = 'explore'; this.ui.flight(false); this.ui.toast('Siège occupé', 'Quelqu\'un pilote déjà.', 'bad'); }
    });
    s.on('hurt', (d) => this.hurt(d.dmg, d.type));
    s.on('hit', (d) => {
      if (!s.isHost) return;
      const e = this.enemies.byId(d.id);
      if (!e) return;
      this.enemies.damage(e, d.dmg, { x: d.dir[0], z: d.dir[1] }, d.knock, this.lightSources());
      if (d.stun) this.enemies.stun(e, d.stun);
    });
    s.on('stun', (d) => { if (s.isHost) this.enemies.stunAround(new THREE.Vector3(...d.p), d.r, d.s); });
    s.on('shot', (d) => this.projectiles.fire(d.k, new THREE.Vector3(...d.p), new THREE.Vector3(...d.d), 'remote'));
    s.on('chat', (d, from) => this.onChat(from, { ...d, t: String(d.t || '').slice(0, 120) }));
    s.on('ping', (d, from) => this.addPing(new THREE.Vector3(...d.p), s.players.get(from)?.color || '#fff', s.players.get(from)?.name));
    s.on('revive', (d) => { if (this.downed) { this.revive(false); this.ui.toast('Relevé !', `${d.by || 'Un coéquipier'} vous a remis sur pied.`, 'good'); } });
    s.on('fx', (d) => this.applyFx(d.type, d.data));
    s.on('sleepReq', (d) => { if (s.isHost) this.requestSleep(d.until); });
    s.on('sleep', (d) => this.doSleep(d.until));
    s.on('wipe', () => this.retryDay());
    s.on('vx', (d, from) => this.onVoice(from, d));
  },

  onStart(d) {
    if (this.session?.isHost) return;
    // déjà dans cette partie : l'instantané du monde suffit
    if (d.late && d.seed === this.seed && (this.inGame() || this.mode === 'intro')) return;
    this.audio.init();
    this.resetWorld();
    this.gotWorld = false;
    this.mySeq = 0;
    this.buildIsland2(d.seed);
    if (d.intro && !d.late) { this.startIntro(); return; }
    // arrivée en cours de partie : l'instantané de l'hôte met le monde en place
    this.placeTools();
    this.setWreck();
    for (const k of Object.keys(this.plane.parts)) if (k !== 'wheels') this.plane.parts[k].visible = false;
    this.mode = 'explore';
    this.spawnAtFire();
    this.enterPlay();
    this.ui.toast('À bord de l\'équipage', 'Synchronisation avec l\'hôte…', 'good');
  },

  // ── état local publié ──
  mpPublish() {
    const s = this.session;
    const p = this.player;
    const st = {
      m: MODES.indexOf(this.mode),
      p: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(2)),
      ab: this.aboard ? 1 : 0,
      y: +p.yaw.toFixed(2),
      st: this.seat?.id || (this.mode === 'flight' ? 'pilot' : 0),
      ly: this.lying ? 1 : 0,
      mv: this.moving ? (this.sprinting ? 2 : 1) : 0,
      sl: this.slot,
      ca: this.carrying ? this.carrying.id : 0,
      hp: Math.round(this.hp),
      dn: this.downed ? 1 : 0,
      fl: this.lanternOn() ? 1 : 0,
      tk: this.own.talkie ? 1 : 0,
      at: this.attackCd > 0.2 ? 1 : 0,
      fr: this.fishState === 'reel' ? 1 : 0,
      fh: this.helpingFish && this.input.down('KeyE') ? 1 : 0,
    };
    if (s.isHost) {
      st.h = +this.hour.toFixed(4);
      st.en = this.enemies.snapshot();
      st.sg = [this.siege.active ? 1 : 0, Math.round(this.siege.genHp), this.siege.wave];
    }
    if (this.ownsPlane() && this.planeLive) {
      const f = this.flight;
      st.pl = [f.pos.x, f.pos.y, f.pos.z, f.yaw, f.pitch, f.roll, f.speed, f.throttle].map((v) => +v.toFixed(3)).concat([SURF.indexOf(f.surface), +f.fuel.toFixed(1), f.autopilot ? 1 : 0]);
    }
    // la présence doit tenir dans 4 Kio : on ne garde que les ennemis proches si besoin
    if (st.en && st.en.length > 30) {
      const pts = this.enemyTargets().map((q) => q.pos);
      const dist = (e) => Math.min(...pts.map((q) => Math.hypot(q.x - e[2], q.z - e[3])));
      st.en = st.en.filter((e) => !(e[6] & 1) || dist(e) < 40).sort((a, b) => dist(a) - dist(b)).slice(0, 40);
    }
    s.publish(st);
  },
  ownsPlane() {
    const s = this.session;
    if (!s) return true;
    const pil = this.pilotId && (this.pilotId === s.me || s.players.has(this.pilotId)) ? this.pilotId : null;
    return (pil || s.hostId) === s.me;
  },

  // ── boucle réseau (chaque image) ──
  mpUpdate(dt) {
    const s = this.session;
    if (!s) return;
    if (this.inGame() || this.mode === 'intro' || this.mode === 'dead') this.mpPublish();
    else s.publish({ m: 0 });
    if (s.isHost && this.inGame()) {
      const now = performance.now();
      const since = now - (this.worldSentAt || 0);
      if (since > 3000 || (this.dirtyWorld && since > 500)) { this.worldSentAt = now; this.dirtyWorld = false; if (s.count() > 1) this.sendWorld(); }
    }
    // coéquipiers
    const list = [];
    const host = s.players.get(s.hostId);
    for (const [id, p] of s.players) {
      const st = p.s;
      if (!st || !st.p) continue;
      let m = this.mates.get(id);
      if (!m) {
        m = { id, av: buildAvatar(p.name, p.color, this.mates.size + 1), pos: new THREE.Vector3(), yaw: 0, tpos: new THREE.Vector3(), first: true };
        this.scene.add(m.av.root);
        this.mates.set(id, m);
      }
      m.name = p.name; m.color = p.color;
      const mode = MODES[st.m] || 'menu';
      m.mode = mode;
      m.aboard = !!st.ab;
      m.seat = st.st || null;
      m.downed = !!st.dn;
      m.carry = st.ca || null;
      m.lantern = !!st.fl;
      m.talkie = !!st.tk;
      m.hp = st.hp;
      m.fishing = !!st.fr;
      m.fishHelp = !!st.fh;
      m.slot = st.sl;
      // position monde
      const lp = new THREE.Vector3(st.p[0], st.p[1], st.p[2]);
      if (m.aboard || mode === 'flight') { this.plane.root.updateMatrixWorld(true); m.tpos.copy(this.plane.root.localToWorld(lp)); m.tyaw = st.y + this.flight.yaw; }
      else { m.tpos.copy(lp); m.tyaw = st.y; }
      if (m.first || m.pos.distanceTo(m.tpos) > 8 || m.aboard) { m.pos.copy(m.tpos); m.yaw = m.tyaw; m.first = false; }
      else { m.pos.lerp(m.tpos, Math.min(1, dt * 12)); let dy = m.tyaw - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.yaw += dy * Math.min(1, dt * 12); }
      const vis = (mode === 'explore' || mode === 'flight' || mode === 'dead') && this.inGame();
      m.av.root.visible = vis;
      m.av.root.position.copy(m.pos);
      if (mode === 'flight') { const sp = this.plane.root.localToWorld(new THREE.Vector3(-0.62, FLOOR, -3.45)); m.av.root.position.copy(sp); m.seat = 'pilot'; }
      m.av.root.rotation.set(0, m.yaw, 0);
      m.av.near(m.pos.distanceTo(this.camera.position));
      m.av.animate(dt, { moving: st.mv > 0, sprint: st.mv === 2, seat: !!m.seat, lying: !!st.ly, down: m.downed, carry: !!m.carry, slot: st.sl, attack: st.at });
      if (m._hp !== m.hp || m._dn !== m.downed) { m._hp = m.hp; m._dn = m.downed; m.av.hp(m.hp / 100, m.downed ? `${m.name} · À TERRE` : m.name); }
      // objet porté par ce coéquipier
      if (m.carry) {
        const it = this.items[m.carry];
        if (it && it.carrier === id) this.poseCarriedAt(it, m.pos, m.yaw, it.mode || 'hand');
      }
      list.push(m);
    }
    this._mateList = list;
    // l'hôte fait autorité sur l'heure, les ennemis et le siège
    if (!s.isHost && host?.s) {
      const hs = host.s;
      if (hs.h !== undefined) this.hour = hs.h;
      if (hs.en && hs.en !== this._lastEn) { this._lastEn = hs.en; this.enemies.applySnapshot(hs.en); }
      if (hs.sg) { this.siege.active = !!hs.sg[0]; this.siege.genHp = hs.sg[1]; this.siege.wave = hs.sg[2]; }
    }
    // avion simulé par un autre joueur
    if (!this.ownsPlane()) {
      const own = this.pilotId && s.players.has(this.pilotId) ? this.pilotId : s.hostId;
      const pl = s.players.get(own)?.s?.pl;
      if (pl) this.applyPlane(pl, dt);
    }
    // voix : oreille = caméra
    this.voice.listener(this.camera);
    const talk = this.inGame() && !this.chatting && this.input.down('KeyB');
    if (talk && this.voice.state === 'off') this.voice.start().then((st) => { if (st === 'denied') this.ui.toast('Micro indisponible', 'Autorisez le micro dans le navigateur, ou utilisez le chat texte (Entrée).', 'bad', 5000); });
    this.voice.setTalking(talk);
    // équipage (HUD)
    if (this.inGame()) {
      const me = this.playerWorld();
      this.ui.show('crew', true);
      this.ui.crew([{ name: this.profile.name, color: this.profile.color, hp: this.hp, down: this.downed, me: true, host: s.isHost, talk: this.voice.talking, talkie: this.own.talkie }]
        .concat(list.map((m) => ({ name: m.name, color: m.color, hp: m.hp, down: m.downed, host: m.id === s.hostId, talk: this.voice.speaking(m.id), talkie: m.talkie, dist: Math.round(m.pos.distanceTo(me)) }))));
      // défaite collective : tout le monde à terre
      if (s.isHost && this.downed && list.length && list.every((m) => m.downed || m.mode === 'dead')) { s.send('wipe', {}); this.retryDay(); }
    }
    this.updatePings(dt);
  },
  mateList() { return this._mateList || []; },
  mateNearDoor() {
    const d = this.plane.root.localToWorld(new THREE.Vector3(1.45, 1.6, 2.2));
    return this.mateList().some((m) => m.pos.distanceTo(d) < 6 || m.aboard);
  },
  mateLanterns() { return this.mateList().filter((m) => m.lantern && !m.aboard).map((m) => m.pos); },
  mateMarkers() { return this.mateList().map((m) => ({ x: m.pos.x, z: m.pos.z, yaw: m.yaw, name: m.name, color: m.color })); },
  mpIndex() {
    if (!this.session) return 0;
    const ids = [...this.session.players.keys(), this.session.me].sort();
    return Math.max(0, ids.indexOf(this.session.me));
  },

  applyPlane(pl, dt) {
    const f = this.flight;
    const [x, y, z, yaw, pitch, roll, speed, thr, surf, fuel, ap] = pl;
    const k = Math.min(1, dt * 10);
    if (f.pos.distanceTo(new THREE.Vector3(x, y, z)) > 25) f.pos.set(x, y, z);
    else f.pos.lerp(new THREE.Vector3(x, y, z), k);
    const ang = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
    f.yaw = ang(f.yaw, yaw); f.pitch = ang(f.pitch, pitch); f.roll = ang(f.roll, roll);
    f.speed = speed; f.throttle = thr; f.surface = SURF[surf] || 'water'; f.fuel = fuel; f.autopilot = !!ap;
    if (!this.planeLive) { this.planeLive = true; this.planeLift = 1; }
    f.apply();
    this.plane.spinners.forEach((sp) => { sp.rotation.z += dt * (5 + thr * 40); });
  },

  // ── à terre ──
  goDown(title) {
    if (this.downed) return;
    if (this.carrying) this.dropCarried();
    if (this.nozzle === this.myId()) this.act('nozzle', { on: false });
    this.downed = true;
    this.downT = 35;
    this.seat = null; this.lying = false;
    this.hp = 0;
    this.audio.hurt();
    this.ui.downed(true, `${title}. Un coéquipier peut vous relever (E maintenu à côté de vous).`);
  },
  updateDowned(dt) {
    this.downT -= dt;
    this.tox = Math.max(0, this.tox - 5 * dt);
    this.ui.downed(true, `Un coéquipier peut vous relever (E maintenu à côté de vous) · réveil au camp dans ${Math.max(0, Math.ceil(this.downT))} s`);
    if (this.downT <= 0) this.revive(true);
  },
  revive(respawn) {
    this.downed = false;
    this.hp = respawn ? 60 : 45;
    this.tox = Math.min(this.tox, 40);
    this.lastHurt = this.t;
    this.ui.downed(false);
    this.ui.hurt(0);
    if (respawn) { this.respawn(); this.ui.toast('Réveil difficile', 'Vous avez rampé jusqu\'au point de ralliement.', 'bad'); }
  },

  // ── chat texte de proximité ──
  openChat() {
    const ci = document.getElementById('chatInput');
    this.chatting = true;
    ci.classList.remove('hidden');
    ci.value = '';
    ci.placeholder = this.own.talkie ? 'Talkie-walkie · tout l\'équipage vous entend' : `Proximité · entendu à ${CHAT_RANGE} m`;
    setTimeout(() => ci.focus(), 0);
  },
  closeChat() {
    const ci = document.getElementById('chatInput');
    this.chatting = false;
    ci.blur();
    ci.classList.add('hidden');
    if (this.inGame() && !this.ui.modalOpen()) this.input.lock();
  },
  sendChat(text) {
    const p = this.playerWorld();
    this.session?.send('chat', { t: text, p: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), r: this.own.talkie ? 1 : 0 });
    this.ui.chat(this.profile.name, this.profile.color, this.own.talkie ? `📻 ${text}` : text);
  },
  onChat(from, d) {
    const p = this.session.players.get(from);
    const m = this.mates.get(from);
    const pos = new THREE.Vector3(...d.p);
    const dist = pos.distanceTo(this.playerWorld());
    const radio = (d.r && this.own.talkie) || d.q;
    if (dist > CHAT_RANGE && !radio) { m?.av.say('…'); return; }
    m?.av.say(d.t);
    this.ui.chat(p?.name || '?', p?.color || '#fff', radio && dist > CHAT_RANGE ? `📻 ${d.t}` : d.t);
    this.audio.beep();
  },

  // ── messages rapides (roue C) : toujours entendus par l'équipage ──
  quickMessage(k) {
    const txt = ['Ici !', 'Aide-moi à porter !', 'Attention !', 'On décolle !'][k];
    if (k === 0) { this.input.pressed.add('KeyV'); this.mpKeys(); }
    const p = this.playerWorld();
    this.session?.send('chat', { t: txt, p: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), q: 1 });
    this.ui.chat(this.profile.name, this.profile.color, txt);
  },

  // ── voix ──
  onVoice(from, d) {
    const m = this.mates.get(from);
    if (!m || !this.inGame()) return;
    const dist = m.pos.distanceTo(this.playerWorld());
    const radio = d.r && this.own.talkie && dist > 10;
    if (!radio && dist > VOICE_RANGE) return;
    this.voice.play(from, d.a, m.pos, radio, 1);
  },

  // ── repères (V) ──
  mpKeys() {
    if (this.input.hit('KeyV')) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const o = this.camera.position.clone();
      let hitP = null;
      for (let d = 1; d < 260; d += 0.8) {
        const q = o.clone().addScaledVector(dir, d);
        if (q.y <= Math.max(this.groundAt(q.x, q.z, q.y + 1), 0)) { hitP = q; break; }
      }
      if (!hitP) return;
      hitP.y = Math.max(this.groundAt(hitP.x, hitP.z, hitP.y + 1), 0);
      this.addPing(hitP, this.profile.color, 'Vous');
      this.session?.send('ping', { p: [hitP.x, hitP.y, hitP.z].map((v) => +v.toFixed(1)) });
    }
  },
  addPing(p, color, name) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
    const cone = new THREE.Mesh(this.pingGeo, mat);
    cone.position.y = 2.2;
    g.add(cone);
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.y = 0.1;
    g.add(ring);
    g.position.copy(p);
    this.scene.add(g);
    this.pings.push({ g, cone, ring, pos: p.clone(), color, t: 0 });
    if (this.pings.length > 6) { const o = this.pings.shift(); this.scene.remove(o.g); }
    this.audio.beep();
    if (name && name !== 'Vous') this.ui.toast(`Repère de ${name}`, `à ${Math.round(p.distanceTo(this.playerWorld()))} m`, '', 1600);
  },
  updatePings(dt) {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const q = this.pings[i];
      q.t += dt;
      q.cone.position.y = 2.2 + Math.sin(q.t * 4) * 0.3;
      q.cone.rotation.y += dt * 2;
      const s = 1 + (q.t % 1.2);
      q.ring.scale.set(s, 1, s);
      const far = q.pos.distanceTo(this.camera.position);
      q.g.scale.setScalar(Math.max(1, far / 25));
      if (q.t > 14) { this.scene.remove(q.g); this.pings.splice(i, 1); }
    }
  },
};

export { CFG, heightAt };
