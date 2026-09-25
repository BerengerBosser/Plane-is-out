// Inventaire à la Unturned : vêtements et équipement à gauche, poches au centre, conteneur ouvert à droite.
// Glisser-déposer (R pour tourner l'objet pendant le glisser), double-clic : action rapide, clic droit : menu.
import { GEAR, WEAR_PARTS, WEAR_NAMES, EQ_SLOTS, EQ_NAMES, slotType, fitsAt, dims, RARITY_OF, RARITY } from './gear.js';

const $ = (id) => document.getElementById(id);
const svg = (d) => `<svg viewBox="0 0 32 32"><path d="${d}"/></svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CELL = 38;
// boîtes des emplacements (en cases)
const SLOT_BOX = { primary: [4, 2], secondary: [4, 1], u1: [2, 2], u2: [2, 2], u3: [2, 2], u4: [2, 2] };
const WEAR_BOX = [2, 2];

// grille « au sol » : on range les objets proches dans une grille de 6 de large (affichage seulement)
function layoutGround(list) {
  const W = 6, placed = [];
  let H = 3;
  for (const g of list) {
    const it = { ...g.it, u: g.u };
    let ok = false;
    for (let tries = 0; tries < 2 && !ok; tries++) {
      for (let y = 0; y < H && !ok; y++) for (let x = 0; x < W && !ok; x++) for (const r of [0, 1]) if (!ok && fitsAt(placed, W, H, it, x, y, r)) { it.x = x; it.y = y; it.r = r; placed.push(it); ok = true; }
      if (!ok) H += 3;
    }
  }
  return { w: W, h: Math.max(3, ...placed.map((p) => p.y + dims(p)[1])), items: placed };
}

export function createInvUi(A) {
  const root = $('invScreen');
  const body = $('invBody');
  let state = null, open = false, drag = null, ctxEl = null;
  const tip = document.createElement('div'); tip.id = 'invTip'; tip.className = 'hidden'; root.appendChild(tip);
  const ghost = document.createElement('div'); ghost.id = 'invGhost'; ghost.className = 'hidden'; root.appendChild(ghost);

  // ── rendu ──
  const itemHtml = (it, c, box) => {
    const d = GEAR[it.k];
    const [w, h] = box || dims(it);
    const pos = box ? '' : `left:${it.x * CELL}px;top:${it.y * CELL}px;`;
    const extra = A.info(it);
    return `<div class="iitem cat-${d.cat} r-${RARITY_OF(it.k)}${it.r && !box ? ' rot' : ''}" data-u="${it.u}" data-c="${c}" style="${pos}width:${w * CELL - 3}px;height:${h * CELL - 3}px">${svg(d.icon)}<b>${esc(d.name)}</b>${(it.n || 1) > 1 ? `<i>×${it.n}</i>` : extra ? `<i>${esc(extra)}</i>` : ''}</div>`;
  };
  const gridHtml = (g, cls = '') => `<div class="igrid ${cls}" data-c="${g.id}" data-w="${g.w}" data-h="${g.h}" style="width:${g.w * CELL}px;height:${g.h * CELL}px">${g.items.map((it) => itemHtml(it, g.id)).join('')}</div>`;
  const slotHtml = (id, label, it, box) => `<div class="islot${state.sel === id.slice(2) ? ' sel' : ''}" data-c="${id}" style="width:${box[0] * CELL}px;height:${box[1] * CELL}px"><span>${label}</span>${it ? itemHtml(it, id, box) : ''}</div>`;

  function render() {
    state = A.state();
    const s = state;
    const wear = WEAR_PARTS.map((p) => slotHtml(`c:${p}`, WEAR_NAMES[p], s.wear[p], WEAR_BOX)).join('');
    const eq = EQ_SLOTS.map((q, i) => slotHtml(`s:${q}`, `${i + 1} · ${EQ_NAMES[q]}`, s.eq[q], SLOT_BOX[q])).join('');
    const grids = s.grids.length ? s.grids.map((g) => `<section class="ibox"><h4>${esc(g.title)} <small>${g.w}×${g.h}</small></h4>${gridHtml(g)}</section>`).join('') : '<p class="iempty">Aucune poche : enfilez un vêtement.</p>';
    let other = '';
    if (s.other) other += `<section class="ibox other"><h4>${esc(s.other.title)} <small>${s.other.w}×${s.other.h}</small></h4>${gridHtml(s.other)}</section>`;
    if (s.plane) {
      const P = s.plane;
      other += `<section class="ibox plane"><h4>Le Coucou <small>coque ${Math.round(P.hp)} %</small></h4><div class="phb"><b style="width:${Math.max(0, Math.min(100, P.hp))}%"></b></div><div class="pslots">${P.parts.map((q) => `<div class="pslot${q.ok ? ' ok' : ''}${q.opt ? ' opt' : ''}" title="${esc(q.name)}">${svg(q.icon)}<span>${esc(q.name)}</span><em>${q.ok ? (q.state || 'monté') : q.opt ? 'absent' : 'manquant'}</em></div>`).join('')}</div></section>`;
    }
    const gl = layoutGround(s.ground);
    other += `<section class="ibox ground"><h4>Au sol <small>à portée</small></h4><div class="igrid gz" data-c="ground" data-w="${gl.w}" data-h="${gl.h}" style="width:${gl.w * CELL}px;height:${gl.h * CELL}px">${gl.items.map((it) => itemHtml(it, 'ground')).join('')}</div><p class="ihint">Glissez un objet ici pour le poser.</p></section>`;
    body.innerHTML = `
      <aside class="icol ichar">
        <h3>Personnage</h3>
        <div class="wearCol">${wear}</div>
        <div class="istats"><span>🛡 ${Math.round(s.stats.armor * 100)} %</span><span>▦ ${s.stats.used}/${s.stats.cells}</span>${s.stats.swim > 1 ? '<span>🌊 nage +</span>' : ''}</div>
      </aside>
      <aside class="icol ieq"><h3>Équipement</h3><div class="eqCol">${eq}</div><p class="ihint"><kbd>1</kbd>–<kbd>6</kbd> en main · <kbd>0</kbd> mains nues</p></aside>
      <section class="icol imine"><h3>Poches</h3>${grids}</section>
      <section class="icol iother">${other}</section>`;
  }

  // ── infobulle ──
  function showTip(u, c, e) {
    const it = find(u, c);
    if (!it) { tip.classList.add('hidden'); return; }
    const d = GEAR[it.k];
    const rar = RARITY_OF(it.k);
    const lines = [];
    if (d.grid) lines.push(`Poches ${d.grid[0]}×${d.grid[1]}`);
    if (d.armor) lines.push(`Protection −${Math.round(d.armor * 100)} %`);
    if (d.swim) lines.push('Nage plus rapide');
    if (d.eq) lines.push({ primary: 'Emplacement principal', secondary: 'Emplacement secondaire', util: 'Équipements 1 à 4' }[d.eq]);
    const inf = A.info(it); if (inf) lines.push(inf);
    if (it.c?.length) lines.push(`Contient ${it.c.length} objet${it.c.length > 1 ? 's' : ''}`);
    tip.innerHTML = `<b>${esc(d.name)}</b><em class="r-${rar}">${RARITY[rar]} · ${d.w}×${d.h}</em><p>${esc(d.desc || '')}</p>${lines.length ? `<small>${lines.map(esc).join(' · ')}</small>` : ''}`;
    tip.classList.remove('hidden');
    moveTip(e);
  }
  function moveTip(e) { tip.style.left = `${Math.min(innerWidth - 250, e.clientX + 16)}px`; tip.style.top = `${Math.min(innerHeight - 120, e.clientY + 14)}px`; }
  function find(u, c) {
    const s = state; if (!s) return null;
    if (c.startsWith('s:')) return s.eq[c.slice(2)];
    if (c.startsWith('c:')) return s.wear[c.slice(2)];
    if (c === 'ground') return s.ground.find((g) => g.u === u)?.it && { ...s.ground.find((g) => g.u === u).it, u };
    const g = [...s.grids, s.other].find((q) => q && q.id === c);
    return g?.items.find((o) => o.u === u) || null;
  }

  // ── menu contextuel ──
  function closeCtx() { ctxEl?.remove(); ctxEl = null; }
  function openCtx(u, c, e) {
    closeCtx();
    const acts = A.actions(c, u);
    if (!acts.length) return;
    ctxEl = document.createElement('div');
    ctxEl.id = 'invCtx';
    acts.forEach((a) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; b.addEventListener('click', () => { closeCtx(); a.fn(); render(); }); ctxEl.appendChild(b); });
    root.appendChild(ctxEl);
    ctxEl.style.left = `${Math.min(innerWidth - 170, e.clientX)}px`;
    ctxEl.style.top = `${Math.min(innerHeight - acts.length * 32 - 10, e.clientY)}px`;
  }

  // ── glisser-déposer ──
  const hl = document.createElement('div'); hl.className = 'ihl';
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const g = el.closest('.igrid, .islot');
    if (g) return g;
    if (el.closest('.invWrap')) return null;
    return 'outside';
  }
  function cellOf(g, x, y) {
    const r = g.getBoundingClientRect();
    return { cx: Math.floor((x - r.left) / CELL - drag.gx + 0.5), cy: Math.floor((y - r.top) / CELL - drag.gy + 0.5) };
  }
  function sizeGhost() {
    const d = GEAR[drag.it.k];
    const w = drag.r ? d.h : d.w, h = drag.r ? d.w : d.h;
    ghost.style.width = `${w * CELL - 3}px`; ghost.style.height = `${h * CELL - 3}px`;
    ghost.classList.toggle('rot', !!drag.r);
    if (drag.gx >= w) drag.gx = w - 0.5;
    if (drag.gy >= h) drag.gy = h - 0.5;
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.live) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.live = true;
      drag.el.classList.add('dragging');
      ghost.innerHTML = drag.el.innerHTML;
      ghost.className = `iitem cat-${GEAR[drag.it.k].cat}`;
      sizeGhost();
      tip.classList.add('hidden');
    }
    ghost.style.left = `${e.clientX - drag.gx * CELL}px`;
    ghost.style.top = `${e.clientY - drag.gy * CELL}px`;
    const t = targetAt(e.clientX, e.clientY);
    hl.remove();
    if (t && t !== 'outside' && t.classList.contains('igrid') && t.dataset.c !== 'ground') {
      const { cx, cy } = cellOf(t, e.clientX, e.clientY);
      const d = GEAR[drag.it.k]; const w = drag.r ? d.h : d.w, h = drag.r ? d.w : d.h;
      const gid = t.dataset.c;
      const g = [...state.grids, state.other].find((q) => q && q.id === gid);
      const ok = g && fitsAt(g.items, g.w, g.h, drag.it, cx, cy, drag.r, g.items.find((o) => o.u === drag.u));
      hl.className = `ihl ${ok ? 'ok' : 'no'}`;
      hl.style.cssText = `left:${cx * CELL}px;top:${cy * CELL}px;width:${w * CELL - 3}px;height:${h * CELL - 3}px`;
      t.appendChild(hl);
    }
    document.querySelectorAll('.islot.over, .igrid.over').forEach((q) => q.classList.remove('over'));
    if (t && t !== 'outside' && (t.classList.contains('islot') || t.dataset.c === 'ground')) t.classList.add('over');
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    hl.remove();
    ghost.classList.add('hidden');
    document.querySelectorAll('.over').forEach((q) => q.classList.remove('over'));
    if (!d.live) { d.el.classList.remove('dragging'); return; }
    const t = targetAt(e.clientX, e.clientY);
    let ok = false;
    if (t === 'outside') ok = A.move(d.c, d.u, 'ground');
    else if (t) {
      const dst = t.dataset.c;
      if (t.classList.contains('igrid') && dst !== 'ground') { const { cx, cy } = cellOf(t, e.clientX, e.clientY); ok = A.move(d.c, d.u, dst, cx, cy, d.r); }
      else ok = A.move(d.c, d.u, dst);
    }
    void ok;
    render();
  }
  body.addEventListener('pointerdown', (e) => {
    closeCtx();
    const el = e.target.closest('.iitem');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const it = find(el.dataset.u, el.dataset.c);
    if (!it) return;
    const r = el.getBoundingClientRect();
    const inSlot = el.dataset.c.startsWith('s:') || el.dataset.c.startsWith('c:');
    drag = { el, u: el.dataset.u, c: el.dataset.c, it, r: inSlot ? 0 : it.r || 0, x0: e.clientX, y0: e.clientY, gx: inSlot ? 0.5 : (e.clientX - r.left) / CELL, gy: inSlot ? 0.5 : (e.clientY - r.top) / CELL, live: false };
  });
  addEventListener('pointermove', (e) => { if (!open) return; onMove(e); if (!drag) { const el = e.target.closest?.('.iitem'); if (el && root.contains(el)) showTip(el.dataset.u, el.dataset.c, e); else tip.classList.add('hidden'); } });
  addEventListener('pointerup', (e) => { if (open) onUp(e); });
  body.addEventListener('dblclick', (e) => { const el = e.target.closest('.iitem'); if (!el) return; A.quick(el.dataset.c, el.dataset.u); render(); });
  body.addEventListener('contextmenu', (e) => { e.preventDefault(); const el = e.target.closest('.iitem'); if (el) openCtx(el.dataset.u, el.dataset.c, e); else closeCtx(); });
  root.addEventListener('pointerdown', (e) => { if (!e.target.closest('#invCtx')) closeCtx(); });
  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'KeyR' && drag?.live) { const d = GEAR[drag.it.k]; if (d.w !== d.h) { drag.r = drag.r ? 0 : 1; const gx = drag.gx; drag.gx = drag.gy; drag.gy = gx; sizeGhost(); } e.preventDefault(); }
  });
  // un clic sur le fond (hors panneaux) ferme l'inventaire
  root.addEventListener('click', (e) => { if (e.target === root) A.onClose?.(); });

  let lastBar = '';
  return {
    open() { open = true; root.classList.remove('hidden'); render(); },
    close() { open = false; drag = null; closeCtx(); tip.classList.add('hidden'); ghost.classList.add('hidden'); root.classList.add('hidden'); },
    get isOpen() { return open; },
    refresh() { if (open && !drag) render(); },
    // barre du bas : 1 principale, 2 secondaire, 3 à 6 équipements
    hotbar(eq, sel, info) {
      const bar = $('hotbar');
      const key = EQ_SLOTS.map((s) => `${eq[s]?.u || '-'}:${eq[s]?.n || 0}`).join(',') + sel;
      const html = EQ_SLOTS.map((s, i) => {
        const it = eq[s];
        const d = it && GEAR[it.k];
        const lbl = it ? (d.short || d.name.split(' ')[0]) : EQ_NAMES[s].replace('Équip. ', '');
        return `<div class="slot${sel === s ? ' sel' : ''}${it ? '' : ' empty'} t-${slotType(s)}" data-s="${s}"><i>${i + 1}</i>${it ? svg(d.icon) : ''}<span>${esc(lbl)}</span><u>${it ? esc(info(it) || ((it.n || 1) > 1 ? `×${it.n}` : '')) : ''}</u>${it?.k === 'lantern' ? '<em><b></b></em>' : ''}</div>`;
      }).join('');
      if (key + html !== lastBar) { lastBar = key + html; bar.innerHTML = html; }
      const oil = bar.querySelector('em b'); if (oil) oil.style.width = `${info('oil')}%`;
    },
  };
}
