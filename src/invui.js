// Inventaire à la Unturned : vêtements et équipement à gauche, poches au centre, conteneur ouvert à droite.
// Glisser-déposer (R pour tourner l'objet pendant le glisser), double-clic : action rapide, clic droit : menu.
// Raccourcis : Maj + clic transfert rapide, Ctrl + clic (ou Suppr au survol) jeter, 1 à 6 au survol : équiper.
import { GEAR, WEAR_PARTS, WEAR_NAMES, EQ_SLOTS, EQ_NAMES, ICONS, slotType, fitsAt, dims, RARITY_OF, RARITY } from './gear.js';

const $ = (id) => document.getElementById(id);
const svg = (d) => `<svg viewBox="0 0 32 32"><path d="${d}"/></svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// taille d'une case : suit la fenêtre (≈ 20 cases de large, 11 de haut), bornée
let CELL = 52;
function fitCell() {
  CELL = Math.round(Math.max(38, Math.min(64, (innerWidth - 150) / 20, (innerHeight - 170) / 11)));
  return CELL;
}
// boîtes des emplacements (en cases)
const SLOT_BOX = { primary: [4, 2], secondary: [4, 1], u1: [2, 2], u2: [2, 2], u3: [2, 2], u4: [2, 2] };
const WEAR_BOX = [2, 2];
// silhouettes des emplacements vides
const WEAR_ICON = { hat: ICONS.cap, top: ICONS.tee, vest: ICONS.vest, back: ICONS.pack, bottom: ICONS.pants };
const SLOT_ICON = { primary: 'M3 14h20l3-2h3v5h-3l-2 2H9l-2 5H4l1-6H3z', secondary: 'M5 12h16v5H12l-1 6H7l1-6H5z', util: 'M9 6h14v20H9zM13 11h6M13 16h6' };

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
  let state = null, open = false, drag = null, ctxEl = null, hover = null;
  const tip = document.createElement('div'); tip.id = 'invTip'; tip.className = 'hidden'; root.appendChild(tip);
  const ghost = document.createElement('div'); ghost.id = 'invGhost'; ghost.className = 'hidden'; root.appendChild(ghost);

  // ── rendu ──
  const itemHtml = (it, c, box) => {
    const d = GEAR[it.k];
    const [w, h] = box || dims(it);
    const pos = box ? '' : `left:${it.x * CELL}px;top:${it.y * CELL}px;`;
    const extra = A.info(it);
    const small = w * h === 1 ? ' s1' : '';
    const badge = (it.n || 1) > 1 ? `<i class="n">×${it.n}</i>` : extra ? `<i>${esc(extra)}</i>` : '';
    return `<div class="iitem cat-${d.cat} r-${RARITY_OF(it.k)}${it.r && !box ? ' rot' : ''}${small}" data-u="${it.u}" data-c="${c}" style="${pos}width:${w * CELL - 4}px;height:${h * CELL - 4}px">${svg(d.icon)}<b>${esc(d.short || d.name)}</b>${badge}</div>`;
  };
  const gridHtml = (g, cls = '') => `<div class="igrid ${cls}" data-c="${g.id}" data-w="${g.w}" data-h="${g.h}" style="width:${g.w * CELL}px;height:${g.h * CELL}px">${g.items.map((it) => itemHtml(it, g.id)).join('')}</div>`;
  const slotHtml = (id, label, it, box, icon) => `<div class="islot${state.sel === id.slice(2) ? ' sel' : ''}${it ? ' full' : ''}" data-c="${id}" style="width:${box[0] * CELL}px;height:${box[1] * CELL}px"><span>${label}</span>${it ? itemHtml(it, id, box) : svg(icon)}</div>`;
  const boxHead = (title, sub, extra = '') => `<h4><span>${esc(title)}</span><small>${esc(sub)}</small>${extra}</h4>`;

  function render() {
    state = A.state();
    const s = state;
    root.style.setProperty('--cell', `${CELL}px`);
    const wear = WEAR_PARTS.map((p) => slotHtml(`c:${p}`, WEAR_NAMES[p], s.wear[p], WEAR_BOX, WEAR_ICON[p])).join('');
    const eq = EQ_SLOTS.map((q, i) => slotHtml(`s:${q}`, `${i + 1} · ${EQ_NAMES[q]}`, s.eq[q], SLOT_BOX[q], SLOT_ICON[slotType(q)])).join('');
    const fill = (g) => { const n = g.items.reduce((a, it) => a + GEAR[it.k].w * GEAR[it.k].h, 0); return `<em class="ifill"><b style="width:${Math.round(100 * n / (g.w * g.h))}%"></b></em>`; };
    const grids = s.grids.length ? s.grids.map((g) => `<section class="ibox">${boxHead(g.title, `${g.w}×${g.h}`, fill(g))}${gridHtml(g)}</section>`).join('') : '<p class="iempty">Aucune poche : enfilez un vêtement.</p>';
    let other = '';
    if (s.other) other += `<section class="ibox other">${boxHead(s.other.title, `${s.other.w}×${s.other.h}`, fill(s.other))}${gridHtml(s.other)}</section>`;
    if (s.plane) {
      const P = s.plane;
      other += `<section class="ibox plane">${boxHead('Le Coucou', `coque ${Math.round(P.hp)} %`)}<div class="phb"><b style="width:${Math.max(0, Math.min(100, P.hp))}%"></b></div><div class="pslots">${P.parts.map((q) => `<div class="pslot${q.ok ? ' ok' : ''}${q.opt ? ' opt' : ''}" title="${esc(q.name)}">${svg(q.icon)}<span>${esc(q.name)}</span><em>${q.ok ? (q.state || 'monté') : q.opt ? 'absent' : 'manquant'}</em></div>`).join('')}</div></section>`;
    }
    const gl = layoutGround(s.ground);
    other += `<section class="ibox ground">${boxHead('Au sol', 'à portée')}<div class="igrid gz" data-c="ground" data-w="${gl.w}" data-h="${gl.h}" style="width:${gl.w * CELL}px;height:${gl.h * CELL}px">${gl.items.map((it) => itemHtml(it, 'ground')).join('')}</div><p class="ihint">Glissez un objet ici (ou <kbd>Ctrl</kbd>+clic) pour le poser.</p></section>`;
    body.innerHTML = `
      <aside class="icol ichar">
        <h3>Personnage</h3>
        <div class="wearCol">${wear}</div>
        <div class="istats"><span title="Protection">🛡 ${Math.round(s.stats.armor * 100)} %</span><span title="Cases occupées">▦ ${s.stats.used}/${s.stats.cells}</span>${s.stats.swim > 1 ? '<span>🌊 nage +</span>' : ''}</div>
      </aside>
      <aside class="icol ieq"><h3>Équipement</h3><div class="eqCol">${eq}</div><p class="ihint"><kbd>1</kbd>–<kbd>6</kbd> au survol d'un objet : l'y équiper</p></aside>
      <section class="icol imine"><h3>Poches</h3>${grids}</section>
      <section class="icol iother"><h3>${s.other ? 'Conteneur' : 'Autour de vous'}</h3>${other}</section>`;
    if (hover && !body.querySelector(`.iitem[data-u="${CSS.escape(hover.u)}"]`)) hover = null;
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
    if (d.eq) lines.push({ primary: 'Emplacement principal', secondary: 'Emplacement secondaire', util: 'Équipements 3 à 6' }[d.eq]);
    const inf = A.info(it); if (inf) lines.push(inf);
    if (it.c?.length) lines.push(`Contient ${it.c.length} objet${it.c.length > 1 ? 's' : ''}`);
    const shared = c === 'ground' || c === 'plane' || c.startsWith('loot:');
    const keys = shared ? '<kbd>Maj</kbd>+clic prendre' : `<kbd>Maj</kbd>+clic ${c.startsWith('s:') || c.startsWith('c:') ? 'ranger' : 'transférer'} · <kbd>Ctrl</kbd>+clic jeter`;
    tip.className = `r-${rar}`;
    tip.innerHTML = `<header>${svg(d.icon)}<div><b>${esc(d.name)}</b><em>${RARITY[rar]} · ${d.w}×${d.h}${(it.n || 1) > 1 ? ` · ×${it.n}` : ''}</em></div></header>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}${lines.length ? `<small>${lines.map(esc).join(' · ')}</small>` : ''}<footer>${keys}</footer>`;
    moveTip(e);
  }
  function moveTip(e) {
    const w = tip.offsetWidth || 270, h = tip.offsetHeight || 130;
    tip.style.left = `${e.clientX + 18 + w > innerWidth ? e.clientX - w - 14 : e.clientX + 18}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, e.clientY + 14))}px`;
  }
  function find(u, c) {
    const s = state; if (!s) return null;
    if (c.startsWith('s:')) return s.eq[c.slice(2)];
    if (c.startsWith('c:')) return s.wear[c.slice(2)];
    if (c === 'ground') { const g = s.ground.find((q) => q.u === u); return g ? { ...g.it, u } : null; }
    const g = [...s.grids, s.other].find((q) => q && q.id === c);
    return g?.items.find((o) => o.u === u) || null;
  }

  // ── menu contextuel ──
  function closeCtx() { ctxEl?.remove(); ctxEl = null; }
  function openCtx(u, c, e) {
    closeCtx();
    const acts = A.actions(c, u);
    if (!acts.length) return;
    tip.classList.add('hidden');
    ctxEl = document.createElement('div');
    ctxEl.id = 'invCtx';
    const it = find(u, c);
    if (it) { const h = document.createElement('p'); h.textContent = GEAR[it.k].name; ctxEl.appendChild(h); }
    acts.forEach((a) => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span>${esc(a.label)}</span>${a.key ? `<small>${esc(a.key)}</small>` : ''}`;
      b.addEventListener('click', () => { closeCtx(); a.fn(); render(); });
      ctxEl.appendChild(b);
    });
    root.appendChild(ctxEl);
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = `${Math.min(innerWidth - r.width - 8, e.clientX)}px`;
    ctxEl.style.top = `${Math.min(innerHeight - r.height - 8, e.clientY)}px`;
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
  function cellOf(dr, g, x, y) {
    const r = g.getBoundingClientRect();
    return { cx: Math.floor((x - r.left) / CELL - dr.gx + 0.5), cy: Math.floor((y - r.top) / CELL - dr.gy + 0.5) };
  }
  // aimant : si la case visée est prise, l'objet se cale sur la place libre la plus proche (en le tournant au besoin).
  // Une pile identique sous le curseur garde la case visée (l'objet s'y empile).
  function snapCell(dr, t, x, y) {
    const g = [...state.grids, state.other].find((q) => q && q.id === t.dataset.c);
    if (!g) return null;
    const { cx, cy } = cellOf(dr, t, x, y);
    const self = g.items.find((o) => o.u === dr.u);
    if (fitsAt(g.items, g.w, g.h, dr.it, cx, cy, dr.r, self)) return { x: cx, y: cy, r: dr.r, ok: true };
    const r0 = t.getBoundingClientRect(), px = (x - r0.left) / CELL, py = (y - r0.top) / CELL;
    const d = GEAR[dr.it.k];
    if ((d.stack || 1) > 1) {
      const mx = Math.floor(px), my = Math.floor(py);
      const o = g.items.find((q) => q !== self && q.k === dr.it.k && (q.n || 1) < d.stack && mx >= q.x && my >= q.y && mx < q.x + dims(q)[0] && my < q.y + dims(q)[1]);
      if (o) return { x: mx, y: my, r: dr.r, ok: true, merge: o };
    }
    let best = null;
    for (const r of d.w === d.h ? [dr.r] : [dr.r, dr.r ? 0 : 1]) {
      const w = r ? d.h : d.w, h = r ? d.w : d.h;
      for (let yy = 0; yy + h <= g.h; yy++) for (let xx = 0; xx + w <= g.w; xx++) {
        if (!fitsAt(g.items, g.w, g.h, dr.it, xx, yy, r, self)) continue;
        // distance du centre de l'objet au curseur (en cases) ; tourner l'objet coûte un peu
        const dist = Math.hypot(xx + w / 2 - px, yy + h / 2 - py) + (r !== dr.r ? 0.75 : 0);
        if (!best || dist < best.dist) best = { x: xx, y: yy, r, ok: true, dist };
      }
    }
    return best || { x: cx, y: cy, r: dr.r, ok: false };
  }
  function sizeGhost() {
    const d = GEAR[drag.it.k];
    const w = drag.r ? d.h : d.w, h = drag.r ? d.w : d.h;
    ghost.style.width = `${w * CELL - 4}px`; ghost.style.height = `${h * CELL - 4}px`;
    ghost.classList.toggle('rot', !!drag.r);
    if (drag.gx >= w) drag.gx = w - 0.5;
    if (drag.gy >= h) drag.gy = h - 0.5;
  }
  // l'emplacement accepte-t-il l'objet glissé ? (vert : oui, remplacement compris ; rouge : non)
  function slotAccepts(slot, it) {
    const d = GEAR[it.k], id = slot.dataset.c, q = id.slice(2);
    return id.startsWith('c:') ? d.wear === q : !!d.eq && d.eq === slotType(q);
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.live) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.live = true;
      drag.el.classList.add('dragging');
      ghost.innerHTML = drag.el.innerHTML;
      ghost.className = `iitem cat-${GEAR[drag.it.k].cat} r-${RARITY_OF(drag.it.k)}`;
      sizeGhost();
      tip.classList.add('hidden');
      root.classList.add('dragging');
    }
    ghost.style.left = `${e.clientX - drag.gx * CELL}px`;
    ghost.style.top = `${e.clientY - drag.gy * CELL}px`;
    const t = targetAt(e.clientX, e.clientY);
    hl.remove();
    if (t && t !== 'outside' && t.classList.contains('igrid') && t.dataset.c !== 'ground') {
      const sp = snapCell(drag, t, e.clientX, e.clientY);
      if (sp) {
        const d = GEAR[drag.it.k];
        const box = sp.merge ? dims(sp.merge) : sp.r ? [d.h, d.w] : [d.w, d.h];
        const bx = sp.merge ? sp.merge.x : sp.x, by = sp.merge ? sp.merge.y : sp.y;
        hl.className = `ihl ${sp.ok ? 'ok' : 'no'}${sp.merge ? ' merge' : ''}`;
        hl.style.cssText = `left:${bx * CELL}px;top:${by * CELL}px;width:${box[0] * CELL - 4}px;height:${box[1] * CELL - 4}px`;
        t.appendChild(hl);
      }
    }
    document.querySelectorAll('.islot.over, .islot.nope, .igrid.over').forEach((q) => q.classList.remove('over', 'nope'));
    if (t && t !== 'outside' && t.classList.contains('islot')) t.classList.add(slotAccepts(t, drag.it) ? 'over' : 'nope');
    else if (t && t !== 'outside' && t.dataset.c === 'ground') t.classList.add('over');
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    hl.remove();
    ghost.classList.add('hidden');
    root.classList.remove('dragging');
    document.querySelectorAll('.over, .nope').forEach((q) => q.classList.remove('over', 'nope'));
    if (!d.live) { d.el.classList.remove('dragging'); return; }
    const t = targetAt(e.clientX, e.clientY);
    if (t === 'outside') A.move(d.c, d.u, 'ground');
    else if (t) {
      const dst = t.dataset.c;
      if (t.classList.contains('igrid') && dst !== 'ground') { const sp = snapCell(d, t, e.clientX, e.clientY); if (sp) A.move(d.c, d.u, dst, sp.x, sp.y, sp.r); }
      else A.move(d.c, d.u, dst);
    }
    render();
  }
  body.addEventListener('pointerdown', (e) => {
    closeCtx();
    const el = e.target.closest('.iitem');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const it = find(el.dataset.u, el.dataset.c);
    if (!it) return;
    // raccourcis : Maj + clic transfert rapide, Ctrl + clic jeter
    if (e.shiftKey) { A.shift(el.dataset.c, el.dataset.u); tip.classList.add('hidden'); render(); return; }
    if (e.ctrlKey || e.metaKey) { A.drop(el.dataset.c, el.dataset.u); tip.classList.add('hidden'); render(); return; }
    const r = el.getBoundingClientRect();
    const inSlot = el.dataset.c.startsWith('s:') || el.dataset.c.startsWith('c:');
    drag = { el, u: el.dataset.u, c: el.dataset.c, it, r: inSlot ? 0 : it.r || 0, x0: e.clientX, y0: e.clientY, gx: inSlot ? 0.5 : (e.clientX - r.left) / CELL, gy: inSlot ? 0.5 : (e.clientY - r.top) / CELL, live: false };
  });
  addEventListener('pointermove', (e) => {
    if (!open) return;
    onMove(e);
    if (drag) return;
    const el = e.target.closest?.('.iitem');
    if (el && root.contains(el) && !ctxEl) {
      if (hover?.el !== el || tip.classList.contains('hidden')) { hover = { el, u: el.dataset.u, c: el.dataset.c }; showTip(hover.u, hover.c, e); tip.classList.remove('hidden'); }
      moveTip(e);
    } else { hover = el && root.contains(el) ? { el, u: el.dataset.u, c: el.dataset.c } : null; tip.classList.add('hidden'); }
  });
  addEventListener('pointerup', (e) => { if (open) onUp(e); });
  body.addEventListener('dblclick', (e) => { const el = e.target.closest('.iitem'); if (!el) return; A.quick(el.dataset.c, el.dataset.u); render(); });
  body.addEventListener('contextmenu', (e) => { e.preventDefault(); const el = e.target.closest('.iitem'); if (el) openCtx(el.dataset.u, el.dataset.c, e); else closeCtx(); });
  root.addEventListener('pointerdown', (e) => { if (!e.target.closest('#invCtx')) closeCtx(); });
  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'KeyR' && drag?.live) { const d = GEAR[drag.it.k]; if (d.w !== d.h) { drag.r = drag.r ? 0 : 1; const gx = drag.gx; drag.gx = drag.gy; drag.gy = gx; sizeGhost(); } e.preventDefault(); return; }
    if (drag || !hover || !document.contains(hover.el)) return;
    // au survol : Suppr jette, 1 à 6 équipe dans l'emplacement
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); A.drop(hover.c, hover.u); hover = null; tip.classList.add('hidden'); render(); return; }
    const n = /^Digit([1-6])$/.exec(e.code);
    if (n) { e.preventDefault(); A.move(hover.c, hover.u, `s:${EQ_SLOTS[+n[1] - 1]}`); hover = null; tip.classList.add('hidden'); render(); }
  });
  // un clic sur le fond (hors panneaux) ferme l'inventaire
  root.addEventListener('click', (e) => { if (e.target === root) A.onClose?.(); });
  addEventListener('resize', () => { const c = CELL; if (fitCell() !== c && open && !drag) render(); });

  let lastBar = '';
  return {
    open() { open = true; fitCell(); root.classList.remove('hidden'); render(); },
    close() { open = false; drag = null; hover = null; closeCtx(); tip.classList.add('hidden'); ghost.classList.add('hidden'); root.classList.remove('dragging'); root.classList.add('hidden'); },
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
