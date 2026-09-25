// Inventaire personnel à la Unturned : vêtements (poches), emplacements d'équipement, grilles.
// Conteneurs partagés (monde) : coffre du Coucou, valises et casiers à fouiller, objets posés au sol.
// Les déplacements qui touchent un conteneur partagé passent par l'hôte (action « cx »).
import * as THREE from 'three';
import { GEAR, WEAR_PARTS, EQ_SLOTS, slotType, fitsAt, findSpot, gridAdd, makeItem, newUid, ARMOR_MAX, LOOT_TABLES, itemLabel } from './gear.js';
import { EQ, GUNS } from './arsenal.js';
import { rng } from './noise.js';

export const CHEST = { w: 8, h: 6 };
const GROUND_R = 2.6;

export function newInventory() {
  const inv = {
    cl: { hat: null, top: makeItem('c_tee'), vest: null, back: null, bottom: makeItem('c_pants') },
    eq: { primary: null, secondary: null, u1: null, u2: null, u3: null, u4: null },
    sel: 'fists',
  };
  gridAdd(inv.cl.top.c, 2, 2, makeItem('bandage', 2));
  return inv;
}
// empile dans les piles existantes d'une grille ; renvoie le reste
function stackIntoGrid(items, it) {
  const max = GEAR[it.k].stack || 1;
  for (const o of items) {
    if (o.k !== it.k || (o.n || 1) >= max) continue;
    const a = Math.min(max - (o.n || 1), it.n || 1);
    o.n = (o.n || 1) + a; it.n = (it.n || 1) - a;
    if (it.n <= 0) return 0;
  }
  return it.n || 1;
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clone = (o) => JSON.parse(JSON.stringify(o));

// icône d'objet dessinée sur un canevas (objets au sol, vus de loin)
const iconTex = {};
function iconTexture(k) {
  if (iconTex[k]) return iconTex[k];
  const cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(16,22,43,.82)'; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffd166'; g.lineWidth = 4; g.stroke();
  g.save(); g.translate(16, 16); g.scale(2, 2);
  g.strokeStyle = '#fff4e0'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  try { g.stroke(new Path2D(GEAR[k].icon)); } catch { /* chemin illisible */ }
  g.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  iconTex[k] = t;
  return t;
}
const CAT_COL = { weapon: '#5d6470', util: '#ffd166', ammo: '#4a5a3a', fish: '#9fb8c8', misc: '#8a6a4a' };
function pickupMesh(it) {
  const d = GEAR[it.k];
  const g = new THREE.Group();
  const col = d.look?.col || CAT_COL[d.cat] || '#8a6a4a';
  const b = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.7, d.w * 0.16), 0.12, Math.min(0.7, d.h * 0.16)), new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
  b.position.y = 0.06; b.castShadow = true; g.add(b);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(it.k), transparent: true, depthWrite: false }));
  sp.scale.set(0.34, 0.34, 1); sp.position.y = 0.5; g.add(sp);
  g.userData.sprite = sp;
  return g;
}

export const InventoryMixin = {
  invInit() {
    this.inv = newInventory();
    this.chest = [];
    this.lootC = {};
    this.lootStamp = {};
    this.gItems = [];
    this.pendingCx = {};
    this.chute = false;
  },
  invWorldReset() {
    for (const g of this.gItems || []) this.scene.remove(g.mesh);
    this.gItems = [];
    this.lootC = {}; this.lootStamp = {};
    // coffre du Coucou : de quoi démarrer (gilets de sauvetage, bandages, pieux, un parachute de secours)
    const ch = [];
    [['c_lifevest', 1], ['c_lifevest', 1], ['bandage', 4], ['stake', 3], ['parachute', 1], ['a_flare', 3]].forEach(([k, n]) => gridAdd(ch, CHEST.w, CHEST.h, makeItem(k, n)));
    this.chest = ch;
  },

  // ── grilles personnelles ──
  wearGrid(part) {
    const it = this.inv.cl[part];
    const d = it && GEAR[it.k];
    if (!d || !d.grid) return null;
    if (!it.c) it.c = [];
    return { id: `g:${part}`, part, it, w: d.grid[0], h: d.grid[1], items: it.c };
  },
  playerGrids() { return ['top', 'bottom', 'vest', 'back'].map((p) => this.wearGrid(p)).filter(Boolean); },
  invEach(fn) {
    for (const s of EQ_SLOTS) { const it = this.inv.eq[s]; if (it) fn(it, `s:${s}`, null); }
    for (const g of this.playerGrids()) for (const it of g.items.slice()) fn(it, g.id, g.items);
  },
  invCount(k) { let n = 0; this.invEach((it) => { if (it.k === k) n += it.n || 1; }); return n; },
  hasItem(k) { return this.invCount(k) > 0; },
  // retire n objets (grilles d'abord, puis emplacements) ; renvoie le nombre pris
  invTake(k, n = 1) {
    let got = 0;
    for (const g of this.playerGrids()) {
      for (const it of g.items.slice()) {
        if (it.k !== k || got >= n) continue;
        const a = Math.min(n - got, it.n || 1);
        it.n = (it.n || 1) - a; got += a;
        if (it.n <= 0) g.items.splice(g.items.indexOf(it), 1);
      }
    }
    for (const s of EQ_SLOTS) {
      const it = this.inv.eq[s];
      if (!it || it.k !== k || got >= n) continue;
      const a = Math.min(n - got, it.n || 1);
      it.n = (it.n || 1) - a; got += a;
      if (it.n <= 0) { this.inv.eq[s] = null; if (this.inv.sel === s) this.inv.sel = 'fists'; }
    }
    if (got) this.invChanged();
    return got;
  },
  invFind(u) {
    for (const s of EQ_SLOTS) if (this.inv.eq[s]?.u === u) return { it: this.inv.eq[s], where: `s:${s}` };
    for (const p of WEAR_PARTS) if (this.inv.cl[p]?.u === u) return { it: this.inv.cl[p], where: `c:${p}` };
    for (const g of this.playerGrids()) { const it = g.items.find((o) => o.u === u); if (it) return { it, where: g.id, list: g.items }; }
    return null;
  },
  invRemove(u) {
    const f = this.invFind(u);
    if (!f) return null;
    if (f.list) f.list.splice(f.list.indexOf(f.it), 1);
    else if (f.where.startsWith('s:')) { const s = f.where.slice(2); this.inv.eq[s] = null; if (this.inv.sel === s) this.inv.sel = 'fists'; }
    else this.inv.cl[f.where.slice(2)] = null;
    return f.it;
  },
  // range un objet : emplacement libre adapté (si demandé), puis piles, puis places libres ; renvoie le reste
  invPut(it, { toSlot = true } = {}) {
    const d = GEAR[it.k];
    if (d.wear && !this.inv.cl[d.wear]) { this.inv.cl[d.wear] = it; this.invChanged(); return 0; }
    // piles existantes (même dans un emplacement d'équipement)
    if ((d.stack || 1) > 1) {
      for (const s of EQ_SLOTS) {
        const o = this.inv.eq[s];
        if (o && o.k === it.k && (o.n || 1) < d.stack) { const a = Math.min(d.stack - (o.n || 1), it.n || 1); o.n = (o.n || 1) + a; it.n = (it.n || 1) - a; if (it.n <= 0) { this.invChanged(); return 0; } }
      }
    }
    if (toSlot && d.eq) {
      const cands = d.eq === 'util' ? ['u1', 'u2', 'u3', 'u4'] : [d.eq];
      const s = cands.find((q) => !this.inv.eq[q]);
      if (s) { it.x = 0; it.y = 0; it.r = 0; this.inv.eq[s] = it; this.invChanged(); return 0; }
    }
    let left = it.n || 1;
    for (const g of this.playerGrids()) {
      left = gridAdd(g.items, g.w, g.h, it);
      if (!left) break;
    }
    this.invChanged();
    return left;
  },
  // donne un objet au joueur ; ce qui ne rentre pas est posé à ses pieds
  giveItem(k, n = 1, extra = {}, opts = {}) {
    const d = GEAR[k];
    if (!d) return 0;
    let left = n, stored = 0;
    while (left > 0) {
      const it = makeItem(k, Math.min(left, d.stack || 1), { ...extra });
      if (GUNS[k] && it.mag === undefined) it.mag = extra.mag ?? GUNS[k].mag;
      const q = it.n;
      const rest = this.invPut(it, opts);
      stored += q - rest;
      if (rest > 0) { it.n = rest; this.dropItem(it); }
      left -= q;
    }
    if (stored < n && !opts.silent) this.ui.toast('Plus de place', `${d.name} posé à vos pieds.`, 'bad', 2200);
    return stored;
  },
  dropItem(it, p) {
    const w = p || this.playerWorld();
    const f = this.player.forward();
    const x = w.x + f.x * 0.8 + (Math.random() - 0.5) * 0.4, z = w.z + f.z * 0.8 + (Math.random() - 0.5) * 0.4;
    this.act('cx', { d: 'ground', it: clone(it), p: [+x.toFixed(2), +(Math.max(this.groundAt(x, z, w.y + 1), -0.3)).toFixed(2), +z.toFixed(2)] });
  },
  invChanged() {
    this._invDirty = true;
    if (this.invUi?.isOpen) this.invUi.refresh();
  },

  // ── en main ──
  heldItem() { const s = this.inv.sel; return s !== 'fists' ? this.inv.eq[s] : null; },
  heldKey() {
    if (this.iron === this.myId()) return 'iron';
    return this.heldItem()?.k || 'fists';
  },
  syncHeld() { const k = this.heldKey(); this.slot = EQ[k] ?? 0; },
  selectEq(s) {
    if (s !== 'fists' && !this.inv.eq[s]) { s = 'fists'; }
    if (this.iron === this.myId() && s !== this.inv.sel) { this.ui.toast('Mains prises', 'Raccrochez d\'abord le fer (<kbd>G</kbd>).', 'bad', 1800); return; }
    const want = s === 'fists' ? 'fists' : this.inv.eq[s].k;
    if (this.carrying && this.carryMode === 'diable' && want !== 'diable') { this.ui.toast('Mains prises', 'Posez la pièce (<kbd>G</kbd>).', 'bad', 1800); return; }
    if (this.carrying && this.carryMode === 'hand' && s !== 'fists') { this.ui.toast('Mains prises', 'Posez la pièce (<kbd>G</kbd>).', 'bad', 1800); return; }
    if (this.inv.sel !== s) { this.reloadT = 0; this.audio.clank(); this.flashKeys?.(); }
    this.inv.sel = s;
    this.syncHeld();
  },
  // prend en main un objet par sa clé (s'il est dans un emplacement d'équipement)
  selectKey(k) { const s = EQ_SLOTS.find((q) => this.inv.eq[q]?.k === k); if (s) this.selectEq(s); return !!s; },
  equipKeys(inp) {
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].forEach((c, i) => {
      if (!inp.hit(c)) return;
      const s = EQ_SLOTS[i];
      this.selectEq(this.inv.sel === s ? 'fists' : s);
    });
    if (inp.hit('Digit0') || inp.hit('Backquote')) this.selectEq('fists');
    if (inp.hit('WheelDown') || inp.hit('WheelUp')) {
      const list = ['fists', ...EQ_SLOTS.filter((s) => this.inv.eq[s])];
      const i = Math.max(0, list.indexOf(this.inv.sel));
      this.selectEq(list[(i + (inp.hit('WheelDown') ? 1 : -1) + list.length) % list.length]);
    }
    if (inp.hit('KeyH')) this.useHeal('bandage');
  },
  // soins : bandage (ou trousse)
  useHeal(k = 'bandage', u) {
    const d = GEAR[k];
    if (!this.hasItem(k)) { this.ui.toast(`Pas de ${d.name.toLowerCase()}`, 'Comptoirs, trousses de secours.', 'bad', 1800); this.audio.error(); return false; }
    if (this.hp >= 99) { this.ui.toast('Déjà en forme', '', '', 1200); return false; }
    if (u) { const f = this.invFind(u); if (f) { f.it.n = (f.it.n || 1) - 1; if (f.it.n <= 0) this.invRemove(u); this.invChanged(); } } else this.invTake(k, 1);
    this.hp = Math.min(100, this.hp + d.heal);
    this.audio.pickup();
    this.ui.toast(d.name, `+${Math.min(d.heal, 100)} santé`, 'good', 1500);
    this.syncHeld();
    return true;
  },

  // ── effets des vêtements ──
  armor() { let a = 0; for (const p of WEAR_PARTS) { const it = this.inv.cl[p]; if (it) a += GEAR[it.k].armor || 0; } return Math.min(ARMOR_MAX, a); },
  swimMul() { const v = this.inv.cl.vest; return v ? GEAR[v.k].swim || 1 : 1; },
  wearSig() { return WEAR_PARTS.map((p) => this.inv.cl[p]?.k || '').join('|'); },
  pocketCells() { return this.playerGrids().reduce((a, g) => a + g.w * g.h, 0); },

  // ── conteneurs partagés ──
  containerInfo(cid) {
    if (cid === 'plane') return { w: CHEST.w, h: CHEST.h, items: this.chest, title: 'Coffre du Coucou' };
    if (cid.startsWith('loot:')) { const id = cid.slice(5), L = this.lootDefs?.[id]; if (!L) return null; return { w: L.grid[0], h: L.grid[1], items: this.ensureLoot(id), title: L.name }; }
    return null;
  },
  // contenu d'une valise / d'un casier : tiré au sort (même graine pour tous) à la première ouverture
  ensureLoot(id) {
    const L = this.lootDefs?.[id];
    if (!L) return [];
    const day = this.stats?.days || 1;
    if (this.lootC[id] && !(L.daily && this.lootStamp[id] !== day)) return this.lootC[id];
    const r = rng(hashStr(`${this.seed}:${id}:${L.daily ? day : 0}`));
    const items = [];
    let n = 0;
    const put = (k) => { const d = GEAR[k]; const q = d.stack ? Math.max(1, Math.round(d.stack * (0.3 + r() * 0.5))) : 1; const it = makeItem(k, k === 'bandage' ? 1 + Math.floor(r() * 3) : q, { u: `${id}-${n++}` }); if (GUNS[k]) it.mag = 0; gridAdd(items, L.grid[0], L.grid[1], it); };
    (L.guaranteed || []).forEach((k) => put(Array.isArray(k) ? k[Math.floor(r() * k.length)] : k));
    const T = LOOT_TABLES[L.table] || [];
    const tot = T.reduce((a, [, w]) => a + w, 0);
    const rolls = L.rolls[0] + Math.floor(r() * (L.rolls[1] - L.rolls[0] + 1));
    for (let i = 0; i < rolls; i++) {
      let x = r() * tot;
      for (const [k, w] of T) { x -= w; if (x <= 0) { put(k); break; } }
    }
    this.lootC[id] = items;
    this.lootStamp[id] = day;
    return items;
  },
  sharedRemove(cid, u) {
    if (cid === 'ground') {
      const i = this.gItems.findIndex((g) => g.u === u);
      if (i < 0) return null;
      const g = this.gItems[i];
      this.scene.remove(g.mesh);
      this.gItems.splice(i, 1);
      return g.it;
    }
    const C = this.containerInfo(cid);
    if (!C) return null;
    const i = C.items.findIndex((o) => o.u === u);
    if (i < 0) return null;
    return C.items.splice(i, 1)[0];
  },
  sharedAdd(cid, it, d = {}) {
    if (cid === 'ground') {
      const p = d.p || [0, 0, 0];
      this.addGroundItem({ u: it.u || newUid(), it, p });
      return true;
    }
    const C = this.containerInfo(cid);
    if (!C) return false;
    if (d.x !== undefined && fitsAt(C.items, C.w, C.h, it, d.x, d.y, d.r || 0)) { it.x = d.x; it.y = d.y; it.r = d.r || 0; C.items.push(it); return true; }
    // pile sur un objet identique ?
    const left = gridAdd(C.items, C.w, C.h, it);
    return left === 0;
  },
  addGroundItem(g) {
    if (this.gItems.some((q) => q.u === g.u)) return;
    const mesh = pickupMesh(g.it);
    mesh.position.set(g.p[0], g.p[1], g.p[2]);
    mesh.rotation.y = (hashStr(g.u) % 628) / 100;
    this.scene.add(mesh);
    this.gItems.push({ ...g, mesh });
  },
  groundNear(p = this.playerWorld()) { return this.gItems.filter((g) => Math.hypot(g.p[0] - p.x, g.p[2] - p.z) < GROUND_R && Math.abs(g.p[1] - p.y) < 2.5); },
  updateGroundItems() {
    for (const g of this.gItems) {
      const s = g.mesh.userData.sprite;
      s.position.y = 0.5 + Math.sin(this.t * 2.4 + g.p[0]) * 0.05;
    }
  },
  groundInteractions(add, me) {
    for (const g of this.gItems) {
      const pt = new THREE.Vector3(g.p[0], g.p[1] + 0.3, g.p[2]);
      if (Math.hypot(pt.x - me.x, pt.z - me.z) > 2.4) continue;
      add(pt, 2.2, { prio: 1.5, prompt: `<kbd>E</kbd> ${itemLabel(g.it)} · <kbd>R</kbd> fouiller`, press: () => this.pickGround(g.u), alt: () => this.openInventory('ground') });
    }
  },
  pickGround(u) {
    const g = this.gItems.find((q) => q.u === u);
    if (!g) return;
    const it = clone(g.it);
    const left = this.invPut(it);
    if (left === (g.it.n || 1)) { this.audio.error(); this.ui.toast('Plus de place', 'Libérez de la place (<kbd>I</kbd>).', 'bad', 1800); this.invUndoPut(it); return; }
    const ok = this.act('cx', { s: 'ground', u });
    if (ok === false) { this.invUndoPut(it); return; }
    if (this.session && !this.session.isHost) this.pendingCx[this.mySeq] = { remove: it.u };
    if (left > 0) { it.n = left; const back = clone(it); back.u = newUid(); back.n = left; this.dropItem(back, new THREE.Vector3(g.p[0], g.p[1], g.p[2])); }
    this.audio.pickup();
    if (GEAR[it.k].eq && !this.heldItem() && !this.carrying) this.selectKey(it.k);
  },
  // annule un rangement (objet refusé par l'hôte)
  invUndoPut(it) { this.invEach((o, where, list) => { if (o.u !== it.u) return; if (list) list.splice(list.indexOf(o), 1); else this.inv.eq[where.slice(2)] = null; }); if (this.inv.cl[GEAR[it.k].wear]?.u === it.u) this.inv.cl[GEAR[it.k].wear] = null; this.invChanged(); },
  onCxReject(seq) {
    const p = this.pendingCx[seq];
    if (!p) return;
    delete this.pendingCx[seq];
    if (p.remove) { this.invRemove(p.remove); this.invChanged(); }
    if (p.add) { const left = this.invPut(p.add); if (left) { p.add.n = left; this.dropItem(p.add); } }
  },

  // ── déplacement générique (glisser-déposer de l'écran d'inventaire) ──
  // src / dst : 'g:top', 's:primary', 'c:back', 'plane', 'loot:ID', 'ground'
  invMove(src, u, dst, x, y, r = 0) {
    const shared = (id) => id === 'plane' || id === 'ground' || id.startsWith('loot:');
    if (src === dst && !shared(src) && src.startsWith('g:')) {
      const f = this.invFind(u); const g = this.wearGrid(src.slice(2));
      if (!f || !g || !fitsAt(g.items, g.w, g.h, f.it, x, y, r, f.it)) return this.mergeStack(f?.it, g?.items, x, y);
      f.it.x = x; f.it.y = y; f.it.r = r; this.invChanged(); return true;
    }
    if (shared(src) && shared(dst)) {
      if (src === dst && src !== 'ground') {
        const C = this.containerInfo(src); const it = C?.items.find((o) => o.u === u);
        if (!it || !fitsAt(C.items, C.w, C.h, it, x, y, r, it)) return false;
        return this.act('cx', { s: src, d: dst, u, x, y, r }) !== false;
      }
      return this.act('cx', { s: src, d: dst, u, x, y, r, p: dst === 'ground' ? this.dropSpot() : undefined }) !== false;
    }
    if (shared(src)) {
      // du conteneur vers soi : on range d'abord chez soi, puis on retire du conteneur
      const C = src === 'ground' ? null : this.containerInfo(src);
      const orig = src === 'ground' ? this.gItems.find((g) => g.u === u)?.it : C?.items.find((o) => o.u === u);
      if (!orig) return false;
      const it = clone(orig);
      if (!this.placePersonal(it, dst, x, y, r)) return false;
      const ok = this.act('cx', { s: src, u });
      if (ok === false) { this.invUndoPut(it); return false; }
      if (this.session && !this.session.isHost) this.pendingCx[this.mySeq] = { remove: it.u };
      this.audio.pickup();
      return true;
    }
    if (shared(dst)) {
      const f = this.invFind(u);
      if (!f) return false;
      if (GEAR[f.it.k].wear && f.where.startsWith('c:') && dst !== 'ground') { /* on peut ranger un vêtement plein (avec son contenu) */ }
      if (dst !== 'ground') {
        const C = this.containerInfo(dst);
        if (!C) return false;
        const fits = x !== undefined ? fitsAt(C.items, C.w, C.h, f.it, x, y, r) || findSpot(C.items, C.w, C.h, f.it) : findSpot(C.items, C.w, C.h, f.it);
        if (!fits) { this.ui.toast('Plus de place', C.title, 'bad', 1500); return false; }
      }
      const it = this.invRemove(u);
      const ok = this.act('cx', { d: dst, it: clone(it), x, y, r, p: dst === 'ground' ? this.dropSpot() : undefined });
      if (ok === false) { this.invPut(it); return false; }
      if (this.session && !this.session.isHost) this.pendingCx[this.mySeq] = { add: clone(it) };
      this.invChanged();
      this.audio.drop();
      return true;
    }
    // personnel → personnel
    const f = this.invFind(u);
    if (!f) return false;
    const it = f.it;
    if (dst.startsWith('g:') && src.startsWith('c:') && dst.slice(2) === src.slice(2)) return false;   // un sac dans lui-même
    const snapshot = clone(this.inv);
    const ox = it.x, oy = it.y, orr = it.r;
    this.invRemove(u);
    const displaced = this.placePersonal(it, dst, x, y, r, true);
    if (!displaced) {
      this.inv = snapshot; this.invChanged();
      return dst.startsWith('g:') ? this.mergeStack(this.invFind(u)?.it, this.wearGrid(dst.slice(2))?.items, x, y) : false;
    }
    if (displaced !== true) {
      // l'objet déplacé revient à la place de celui qu'on a pris
      if (!this.placePersonal(displaced, src, ox, oy, orr) && this.invPut(displaced)) { this.inv = snapshot; this.invChanged(); this.ui.toast('Impossible', 'Pas de place pour échanger.', 'bad', 1500); return false; }
    }
    this.syncHeld();
    this.invChanged();
    this.audio.clank();
    return true;
  },
  dropSpot() { const w = this.playerWorld(); const f = this.player.forward(); const x = w.x + f.x * 0.9, z = w.z + f.z * 0.9; return [+x.toFixed(2), +Math.max(this.groundAt(x, z, w.y + 1), -0.3).toFixed(2), +z.toFixed(2)]; },
  // empile un objet sur une pile identique à la case visée
  mergeStack(it, items, x, y) {
    if (!it || !items) return false;
    const max = GEAR[it.k].stack || 1;
    if (max <= 1) return false;
    const o = items.find((q) => q !== it && q.k === it.k && x >= q.x && y >= q.y && x < q.x + (q.r ? GEAR[q.k].h : GEAR[q.k].w) && y < q.y + (q.r ? GEAR[q.k].w : GEAR[q.k].h));
    if (!o || (o.n || 1) >= max) return false;
    const a = Math.min(max - (o.n || 1), it.n || 1);
    o.n = (o.n || 1) + a; it.n = (it.n || 1) - a;
    if (it.n <= 0) this.invRemove(it.u);
    this.invChanged();
    return true;
  },
  // place un objet dans une destination personnelle ; renvoie true, false, ou l'objet déplacé (échange)
  placePersonal(it, dst, x, y, r = 0, allowSwap = false) {
    const d = GEAR[it.k];
    if (dst.startsWith('s:')) {
      const s = dst.slice(2);
      if (!d.eq || d.eq !== slotType(s)) { this.ui.toast('Pas ici', `${d.name} : ${d.eq ? { primary: 'emplacement principal', secondary: 'emplacement secondaire', util: 'équipements 1 à 4' }[d.eq] : 'à ranger dans un sac'}.`, 'bad', 1800); return false; }
      const old = this.inv.eq[s];
      if (old && !allowSwap) return false;
      it.x = 0; it.y = 0; it.r = 0;
      this.inv.eq[s] = it;
      return old || true;
    }
    if (dst.startsWith('c:')) {
      const p = dst.slice(2);
      if (d.wear !== p) { this.ui.toast('Pas ici', `${d.name} ne se porte pas là.`, 'bad', 1500); return false; }
      const old = this.inv.cl[p];
      if (old && !allowSwap) return false;
      this.inv.cl[p] = it;
      if (d.grid && !it.c) it.c = [];
      // le contenu de l'ancien vêtement passe dans le nouveau si possible
      if (old && old.c?.length && d.grid) {
        const keep = [];
        for (const o of old.c) { if (gridAdd(it.c, d.grid[0], d.grid[1], o)) keep.push(o); }
        old.c = keep;
      }
      return old || true;
    }
    if ((dst.startsWith('g:') || dst === 'grid') && d.wear && it.c?.length) { this.ui.toast('Vêtement plein', 'Videz-le, ou posez-le au coffre ou au sol.', 'bad', 1800); return false; }
    if (dst === 'grid') {
      for (const g of this.playerGrids()) {
        if (g.it === it) continue;
        if ((d.stack || 1) > 1 && !stackIntoGrid(g.items, it)) return true;
        const s = findSpot(g.items, g.w, g.h, it);
        if (s) { Object.assign(it, s); g.items.push(it); return true; }
      }
      this.ui.toast('Plus de place', 'Poches pleines.', 'bad', 1500);
      return false;
    }
    if (dst.startsWith('g:')) {
      const g = this.wearGrid(dst.slice(2));
      if (!g) return false;
      if (g.it === it) return false;
      if (x === undefined) { const s = findSpot(g.items, g.w, g.h, it); if (!s) return false; Object.assign(it, s); g.items.push(it); return true; }
      if (!fitsAt(g.items, g.w, g.h, it, x, y, r)) return false;
      it.x = x; it.y = y; it.r = r;
      g.items.push(it);
      return true;
    }
    if (dst === 'auto') return this.invPut(it) === 0;
    return false;
  },

  // ── écran d'inventaire ──
  // ctx : conteneur ouvert à côté ('plane', 'loot:ID', 'ground') ; le coffre montre aussi l'équipement de l'avion
  openInventory(ctx = null) {
    if (ctx && ctx.startsWith('loot:')) this.ensureLoot(ctx.slice(5));
    this.invCtx = ctx;
    this.invCtxPos = this.playerWorld();
    this.input.unlock();
    this.invUi.open();
  },
  toggleInventory(force) {
    const on = force ?? !this.invUi.isOpen;
    if (on) this.openInventory(null);
    else { this.invUi.close(); this.invCtx = null; if (this.mode === 'explore' && !this.overlayOpen()) this.input.lock(); }
  },
  // on s'éloigne d'un conteneur : il se referme
  updateInvCtx() {
    if (!this.invUi?.isOpen || !this.invCtx || this.invCtx === 'ground') return;
    if (this.playerWorld().distanceTo(this.invCtxPos) > 4) { this.invCtx = null; this.invUi.refresh(); }
  },
  invAdapter() {
    return {
      state: () => this.invViewState(),
      move: (src, u, dst, x, y, r) => { const ok = this.invMove(src, u, dst, x, y, r); this.syncHeld(); return ok; },
      actions: (c, u) => this.invActions(c, u),
      quick: (c, u) => { this.invQuick(c, u); this.syncHeld(); },
      info: (it) => (it === 'oil' ? this.oil : this.itemInfo(it)),
      onClose: () => this.toggleInventory(false),
    };
  },
  itemInfo(it) {
    const d = GEAR[it.k];
    if (!d) return '';
    if (GUNS[it.k]) return `${it.mag ?? 0}/${this.invCount(d.ammo)}`;
    if (d.ammo) return `${this.invCount(d.ammo)}`;
    if (it.k === 'lantern') return `${Math.round(this.oil)} %`;
    if (d.grid) return `${d.grid[0]}×${d.grid[1]}`;
    return '';
  },
  invViewState() {
    const grids = this.playerGrids().map((g) => ({ id: g.id, title: `${{ top: 'Haut', bottom: 'Bas', vest: 'Gilet', back: 'Sac' }[g.part]} · ${GEAR[g.it.k].name}`, w: g.w, h: g.h, items: g.items }));
    let other = null;
    if (this.invCtx && this.invCtx !== 'ground') { const C = this.containerInfo(this.invCtx); if (C) other = { id: this.invCtx, title: C.title, w: C.w, h: C.h, items: C.items }; }
    const used = this.playerGrids().reduce((a, g) => a + g.items.reduce((b, it) => b + GEAR[it.k].w * GEAR[it.k].h, 0), 0);
    return {
      wear: { ...this.inv.cl }, eq: { ...this.inv.eq }, sel: this.inv.sel, grids, other,
      ground: this.groundNear().map((g) => ({ u: g.u, it: g.it })),
      plane: this.invCtx === 'plane' ? this.planeInvState() : null,
      stats: { armor: this.armor(), cells: this.pocketCells(), used, swim: this.swimMul() },
    };
  },
  planeInvState() {
    const I = {
      engine: 'M5 12h15l6 4-6 4H5zM3 14v4M20 12v8', prop: 'M16 16l-3-11h6zM16 16l10 6-5 3zM16 16L6 22l5 3z', wing: 'M3 17l26-5v4L3 21z',
      floats: 'M3 20c3-3 23-3 26 0-3 3-23 3-26 0zM10 18v-6M22 18v-6', dash: 'M4 8h24v14H4zM9 15a2 2 0 1 0 .01 0M16 15a2 2 0 1 0 .01 0M23 15a2 2 0 1 0 .01 0',
      wheels: 'M16 7a9 9 0 1 0 .01 0zM16 13a3 3 0 1 0 .01 0z', tank: 'M8 8h16v18H8zM12 8V5h8v3M8 17h16', up: 'M16 5v22M8 13l8-8 8 8',
    };
    const P = [['engineL', 'Moteur gauche', I.engine], ['engineR', 'Moteur droit', I.engine], ['prop', 'Hélice gauche', I.prop], ['wingL', 'Aile gauche', I.wing], ['floats', 'Flotteurs', I.floats], ['dashboard', 'Tableau de bord', I.dash]];
    const parts = P.map(([k, name, icon]) => ({ name, icon, ok: this.installed.has(k), state: this.wreck?.placed?.[k] !== undefined ? 'à souder' : '' }));
    parts.push({ name: 'Roues amphibies', icon: I.wheels, ok: !!this.flags.wheels, opt: true, state: 'montées' });
    const U = [['tank', 'Réservoir auxiliaire', I.tank], ['engine', 'Moteurs gonflés', I.engine], ['stove', 'Petit poêle', I.up], ['lamps', 'Guirlande', I.up], ['rug', 'Tapis et plantes', I.up]];
    for (const [k, name, icon] of U) parts.push({ name, icon, ok: this.upgrades.has(k), opt: true, state: 'installé' });
    return { hp: this.planeHp(), parts };
  },
  invActions(c, u) {
    const shared = c === 'plane' || c === 'ground' || c.startsWith('loot:');
    const out = [];
    if (shared) {
      const it = c === 'ground' ? this.gItems.find((g) => g.u === u)?.it : this.containerInfo(c)?.items.find((o) => o.u === u);
      if (!it) return out;
      out.push({ label: 'Prendre', fn: () => this.invMove(c, u, 'auto') });
      if (GEAR[it.k].wear) out.push({ label: 'Porter', fn: () => this.invMove(c, u, `c:${GEAR[it.k].wear}`) });
      if (c !== 'ground') out.push({ label: 'Poser au sol', fn: () => this.invMove(c, u, 'ground') });
      return out;
    }
    const f = this.invFind(u);
    if (!f) return out;
    const it = f.it, d = GEAR[it.k];
    if (d.use === 'heal') out.push({ label: 'Utiliser', fn: () => this.useHeal(it.k, u) });
    if (d.eq && f.where.startsWith('g:')) out.push({ label: 'Équiper', fn: () => this.invQuick(c, u) });
    if (d.wear && f.where.startsWith('g:')) out.push({ label: 'Porter', fn: () => this.invMove(c, u, `c:${d.wear}`) });
    if (f.where.startsWith('s:') || f.where.startsWith('c:')) out.push({ label: f.where.startsWith('c:') ? 'Retirer' : 'Ranger', fn: () => this.invMove(c, u, 'grid') });
    if ((it.n || 1) > 1 && f.list) out.push({ label: 'Diviser', fn: () => this.splitStack(u) });
    if (GUNS[it.k] && it.mag > 0) out.push({ label: 'Décharger', fn: () => { const n = it.mag; it.mag = 0; this.giveItem(d.ammo, n, {}, { toSlot: false }); } });
    if (this.invCtx && this.invCtx !== 'ground') out.push({ label: this.invCtx === 'plane' ? 'Mettre au coffre' : 'Déposer', fn: () => this.invMove(c, u, this.invCtx) });
    out.push({ label: 'Jeter', fn: () => this.invMove(c, u, 'ground') });
    return out;
  },
  invQuick(c, u) {
    const shared = c === 'plane' || c === 'ground' || c.startsWith('loot:');
    if (shared) return this.invMove(c, u, 'auto');
    const f = this.invFind(u);
    if (!f) return false;
    const d = GEAR[f.it.k];
    if (f.where.startsWith('g:')) {
      if (d.wear) return this.invMove(c, u, `c:${d.wear}`);
      if (d.eq) {
        const cands = d.eq === 'util' ? ['u1', 'u2', 'u3', 'u4'] : [d.eq];
        const s = cands.find((q) => !this.inv.eq[q]) || cands[0];
        return this.invMove(c, u, `s:${s}`);
      }
      if (d.use === 'heal') return this.useHeal(f.it.k, u);
      if (this.invCtx && this.invCtx !== 'ground') return this.invMove(c, u, this.invCtx);
      return false;
    }
    if (this.invCtx && this.invCtx !== 'ground') return this.invMove(c, u, this.invCtx);
    return this.invMove(c, u, 'grid');
  },
  splitStack(u) {
    const f = this.invFind(u);
    if (!f || !f.list || (f.it.n || 1) < 2) return;
    const half = Math.floor(f.it.n / 2);
    const part = makeItem(f.it.k, half);
    const g = this.wearGrid(f.where.slice(2));
    const s = findSpot(g.items, g.w, g.h, part);
    if (!s) { this.ui.toast('Plus de place', 'Pour diviser la pile.', 'bad', 1500); return; }
    f.it.n -= half; Object.assign(part, s); g.items.push(part);
    this.invChanged();
  },

  // action partagée : conteneurs et sol
  applyInvAct(type, d, by, auth) {
    if (type !== 'cx') return null;
    let it = null;
    if (d.s) { it = this.sharedRemove(d.s, d.u); if (!it) return auth ? false : true; }
    else it = d.it;
    if (!it) return false;
    if (d.d) {
      const target = d.s ? it : clone(it);
      if (!this.sharedAdd(d.d, target, d)) {
        if (d.s) this.sharedAdd(d.s, it, {});
        return auth ? false : true;
      }
    }
    if (this.invUi?.isOpen) this.invUi.refresh();
    if (this.isAuthority()) this.dirtyWorld = true;
    void by;
    return true;
  },
  invWorldState() {
    return { ch: this.chest, lc: this.lootC, ls: this.lootStamp, gi: this.gItems.map((g) => ({ u: g.u, it: g.it, p: g.p })) };
  },
  applyInvWorld(w) {
    if (w.ch) this.chest = clone(w.ch);
    if (w.lc) { this.lootC = clone(w.lc); this.lootStamp = { ...(w.ls || {}) }; }
    if (w.gi) {
      const want = new Set(w.gi.map((g) => g.u));
      for (const g of this.gItems.slice()) if (!want.has(g.u)) { this.scene.remove(g.mesh); this.gItems.splice(this.gItems.indexOf(g), 1); }
      for (const g of w.gi) if (!this.gItems.some((q) => q.u === g.u)) this.addGroundItem(clone(g));
    }
    if (this.invUi?.isOpen) this.invUi.refresh();
  },
};

// migration des sauvegardes v6 (équipement « possédé » et munitions en compteurs) vers l'inventaire
export function migrateInventory(s) {
  const inv = newInventory();
  const spill = [];
  const put = (it) => {
    const d = GEAR[it.k];
    if (d.eq) { const cands = d.eq === 'util' ? ['u1', 'u2', 'u3', 'u4'] : [d.eq]; const q = cands.find((c) => !inv.eq[c]); if (q) { inv.eq[q] = it; return; } }
    for (const p of ['top', 'bottom']) { const g = inv.cl[p]; if (!gridAdd(g.c, GEAR[g.k].grid[0], GEAR[g.k].grid[1], it)) return; }
    spill.push(it);
  };
  const own = s.own || {};
  for (const k of ['wrench', 'diable', 'lantern', 'flare', 'harpoon', 'rod', 'talkie', 'machete', 'bat', 'axe', 'pistol', 'shotgun', 'rifle']) if (own[k]) put(makeItem(k, 1, GUNS[k] ? { mag: s.mag?.[k] ?? 0 } : {}));
  if (own.mask) put(makeItem('c_armorvest'));
  const am = s.ammo || {};
  for (const [k, g] of [['p9', 'a_p9'], ['buck', 'a_buck'], ['r556', 'a_r556'], ['flare', 'a_flare'], ['harpoon', 'a_harpoon']]) {
    let n = am[k] || 0; const st = GEAR[g].stack;
    while (n > 0) { put(makeItem(g, Math.min(n, st))); n -= st; }
  }
  const old = s.inv || {};
  if (old.bandage > 2) { let n = old.bandage - 2; while (n > 0) { put(makeItem('bandage', Math.min(n, 5))); n -= 5; } }
  if (old.stakes) put(makeItem('stake', Math.min(3, old.stakes)));
  return { inv, spill };
}
export { GEAR, WEAR_PARTS, EQ_SLOTS };
