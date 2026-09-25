// Catalogue des objets d'inventaire (esprit Unturned) : chaque objet occupe w × h cases.
// eq : emplacement d'équipement qui l'accepte (principale, secondaire, util = équipements 1 à 4).
// Vêtements (wear) : ils donnent des poches (grid) et parfois une protection (armor) ; le sac garde son contenu.
import { EQUIP } from './arsenal.js';

const ic = (k) => EQUIP.find((e) => e.key === k)?.icon;
export const ICONS = {
  tee: 'M11 5l-7 4 3 5 3-2v15h12V12l3 2 3-5-7-4c-1 2-3 3-5 3s-4-1-5-3z',
  jacket: 'M11 5L4 9v17h5V12M21 5l7 4v17h-5V12M11 5c1 3 3 4 5 4s4-1 5-4M9 12v15h14V12M16 9v18',
  pants: 'M9 4h14l2 23h-6l-3-15-3 15H7z',
  vest: 'M11 4L7 7v18h18V7l-4-3c-1 3-3 4-5 4s-4-1-5-4zM16 8v17M10 14h4M18 14h4',
  lifevest: 'M11 4L6 7v16l5 3zM21 4l5 3v16l-5 3zM11 12h10M11 18h10',
  pack: 'M9 9a7 7 0 0 1 14 0v17H9zM12 9V6h8v3M9 17h14M13 20h6',
  cap: 'M5 20c0-7 5-11 11-11s11 4 11 11zM3 20h24',
  helmet: 'M5 21c0-8 5-13 11-13s11 5 11 13zM3 21h26M16 8v5',
  bullets: 'M9 13h4v13H9zM9 13l2-5 2 5M15 13h4v13h-4zM15 13l2-5 2 5M21 13h4v13h-4zM21 13l2-5 2 5',
  shells: 'M8 10h6v16H8zM8 22h6M18 10h6v16h-6zM18 22h6',
  flares: 'M11 9h10v17H11zM11 14h10M16 9V4',
  harpoons: 'M3 13h22M25 10l5 3-5 3zM3 19h22M25 16l5 3-5 3z',
  fish: 'M4 16c5-7 13-7 18 0-5 7-13 7-18 0zM22 16l6-5v10zM9 15h1',
  stake: 'M16 3v20M12 7h8M16 23l-2 4h4z',
};

// ── catalogue ──
export const GEAR = {
  // armes et outils
  wrench: { name: 'Clé à molette', w: 2, h: 1, eq: 'secondary', icon: ic('wrench'), desc: 'Frappe fort. Dégrippe le verrou, répare le générateur.' },
  machete: { name: 'Machette', w: 3, h: 1, eq: 'secondary', icon: ic('machete'), desc: 'Rapide et tranchante.' },
  flare: { name: 'Pistolet de détresse', w: 2, h: 1, eq: 'secondary', icon: ic('flare'), ammo: 'a_flare', desc: 'Éblouit les morts et éclaire la nuit.' },
  pistol: { name: 'Pistolet', w: 2, h: 1, eq: 'secondary', icon: ic('pistol'), ammo: 'a_p9', desc: 'Chargeur de 12.' },
  bat: { name: 'Batte cloutée', w: 4, h: 1, eq: 'primary', icon: ic('bat'), desc: 'Repousse loin et assomme.' },
  axe: { name: 'Hache de pompier', w: 3, h: 2, eq: 'primary', icon: ic('axe'), desc: 'Lente mais redoutable.' },
  shotgun: { name: 'Fusil à pompe', w: 4, h: 2, eq: 'primary', icon: ic('shotgun'), ammo: 'a_buck', desc: 'Dévastateur de près.' },
  rifle: { name: 'Carabine', w: 4, h: 2, eq: 'primary', icon: ic('rifle'), ammo: 'a_r556', desc: 'Automatique. Très bruyante.' },
  harpoon: { name: 'Fusil-harpon', w: 4, h: 1, eq: 'primary', icon: ic('harpoon'), ammo: 'a_harpoon', desc: 'Lent, puissant. Harpons à ramasser.' },
  rod: { name: 'Canne à pêche', w: 4, h: 1, eq: 'primary', icon: ic('rod'), desc: 'Lancer, ferrer, mouliner.' },
  diable: { name: 'Diable', w: 2, h: 4, eq: 'primary', icon: ic('diable'), desc: 'Roule les pièces lourdes.' },
  // équipements rapides (1 à 4)
  lantern: { name: 'Lanterne', w: 1, h: 2, eq: 'util', icon: ic('lantern'), desc: 'Éclaire, ralentit les morts. Recharge au feu.' },
  talkie: { name: 'Talkie-walkie', w: 1, h: 1, eq: 'util', icon: ic('talkie'), desc: 'B : parler à tout l\'équipage.' },
  bandage: { name: 'Bandage', w: 1, h: 1, eq: 'util', stack: 5, use: 'heal', heal: 45, icon: ic('bandage'), desc: '+45 santé. Touche H.' },
  medkit: { name: 'Trousse de soins', w: 2, h: 2, eq: 'util', use: 'heal', heal: 100, icon: ic('medkit'), desc: 'Santé au maximum.' },
  parachute: { name: 'Parachute', w: 2, h: 2, eq: 'util', icon: ic('parachute'), desc: 'Équipé : Espace en chute libre. Usage unique.' },
  // divers
  stake: { name: 'Pieu d\'ancrage', w: 1, h: 2, stack: 3, icon: ICONS.stake, desc: 'Crochet du treuil en main : R pour planter.' },
  // munitions
  a_p9: { name: 'Balles 9 mm', w: 1, h: 1, stack: 30, cat: 'ammo', icon: ICONS.bullets, desc: 'Pistolet.' },
  a_buck: { name: 'Cartouches', w: 1, h: 1, stack: 12, cat: 'ammo', icon: ICONS.shells, desc: 'Fusil à pompe.' },
  a_r556: { name: 'Balles 5,56', w: 1, h: 1, stack: 30, cat: 'ammo', icon: ICONS.bullets, desc: 'Carabine.' },
  a_flare: { name: 'Fusées', w: 1, h: 1, stack: 6, cat: 'ammo', icon: ICONS.flares, desc: 'Pistolet de détresse.' },
  a_harpoon: { name: 'Harpons', w: 2, h: 1, stack: 4, cat: 'ammo', icon: ICONS.harpoons, desc: 'Fusil-harpon.' },
  // pêche
  f_sardine: { name: 'Sardine', w: 1, h: 1, stack: 4, cat: 'fish', fish: 'sardine', icon: ICONS.fish, desc: 'Se vend 2 🐚 · se grille au feu.' },
  f_maquereau: { name: 'Maquereau', w: 1, h: 1, stack: 3, cat: 'fish', fish: 'maquereau', icon: ICONS.fish, desc: 'Se vend 4 🐚.' },
  f_dorade: { name: 'Dorade', w: 2, h: 1, stack: 2, cat: 'fish', fish: 'dorade', icon: ICONS.fish, desc: 'Se vend 7 🐚.' },
  f_merou: { name: 'Mérou', w: 2, h: 1, cat: 'fish', fish: 'merou', icon: ICONS.fish, desc: 'Se vend 12 🐚.' },
  f_thon: { name: 'Thon', w: 3, h: 1, cat: 'fish', fish: 'thon', icon: ICONS.fish, desc: 'Se vend 20 🐚.' },
  f_lanterne: { name: 'Poisson-lanterne', w: 1, h: 1, stack: 2, cat: 'fish', fish: 'lanterne', icon: ICONS.fish, desc: 'Se vend 30 🐚. Ne sort que la nuit.' },
  // vêtements : haut
  c_tee: { name: 'Tenue de base', w: 2, h: 2, wear: 'top', grid: [2, 2], base: true, icon: ICONS.tee, look: { kind: 'base' }, desc: 'Deux petites poches.' },
  c_jeanshirt: { name: 'Chemise en jean', w: 2, h: 2, wear: 'top', grid: [3, 2], icon: ICONS.tee, look: { kind: 'shirt', col: '#4a6a9a', sleeve: '#4a6a9a', cuff: '#3a5580' }, desc: 'Poches de poitrine.' },
  c_raincoat: { name: 'Ciré de pêcheur', w: 2, h: 2, wear: 'top', grid: [3, 2], icon: ICONS.jacket, look: { kind: 'coat', col: '#f2c230', sleeve: '#f2c230', cuff: '#d9a51c' }, desc: 'Grandes poches étanches.' },
  c_pilot: { name: 'Blouson d\'aviateur', w: 2, h: 2, wear: 'top', grid: [3, 3], icon: ICONS.jacket, look: { kind: 'jacket', col: '#7a4a2c', sleeve: '#7a4a2c', cuff: '#e9dcc0', collar: '#e9dcc0' }, desc: 'Cuir épais, doublure en mouton.' },
  c_miljacket: { name: 'Veste militaire', w: 2, h: 2, wear: 'top', grid: [4, 3], armor: 0.08, icon: ICONS.jacket, look: { kind: 'jacket', col: '#5a6a3a', sleeve: '#5a6a3a', cuff: '#4a5a2e', collar: '#4a5a2e' }, desc: 'Renforcée. −8 % de dégâts.' },
  // bas
  c_pants: { name: 'Pantalon de toile', w: 2, h: 2, wear: 'bottom', grid: [2, 2], base: true, icon: ICONS.pants, look: { kind: 'base' }, desc: 'Deux petites poches.' },
  c_jeans: { name: 'Jean', w: 2, h: 2, wear: 'bottom', grid: [3, 2], icon: ICONS.pants, look: { col: '#3a4f7a' }, desc: 'Solide.' },
  c_cargo: { name: 'Pantalon cargo', w: 2, h: 2, wear: 'bottom', grid: [3, 3], icon: ICONS.pants, look: { col: '#8a7a55', pockets: true }, desc: 'Poches sur les cuisses.' },
  c_milpants: { name: 'Treillis militaire', w: 2, h: 2, wear: 'bottom', grid: [4, 3], armor: 0.05, icon: ICONS.pants, look: { col: '#5a6a3a', pockets: true }, desc: 'Renforcé. −5 % de dégâts.' },
  // gilets
  c_lifevest: { name: 'Gilet de sauvetage', w: 2, h: 2, wear: 'vest', grid: [2, 1], swim: 1.6, icon: ICONS.lifevest, look: { kind: 'life', col: '#ff7a2a' }, desc: 'Nage bien plus vite.' },
  c_armorvest: { name: 'Gilet renforcé', w: 2, h: 2, wear: 'vest', grid: [2, 2], armor: 0.3, icon: ICONS.vest, look: { kind: 'armor', col: '#3a4450' }, desc: '−30 % de dégâts.' },
  c_tacvest: { name: 'Gilet tactique', w: 2, h: 2, wear: 'vest', grid: [4, 2], armor: 0.22, icon: ICONS.vest, look: { kind: 'tac', col: '#4a5a32' }, desc: 'Porte-chargeurs. −22 % de dégâts.' },
  // sacs
  c_satchel: { name: 'Sacoche', w: 2, h: 2, wear: 'back', grid: [3, 3], icon: ICONS.pack, look: { size: 0.7, col: '#8a5a3a' }, desc: 'Petite besace en cuir.' },
  c_backpack: { name: 'Sac à dos', w: 2, h: 2, wear: 'back', grid: [4, 4], icon: ICONS.pack, look: { size: 1, col: '#c84a3a' }, desc: 'Sac de voyage.' },
  c_hiking: { name: 'Sac de randonnée', w: 3, h: 3, wear: 'back', grid: [5, 5], icon: ICONS.pack, look: { size: 1.3, col: '#2f6a8a', roll: true }, desc: 'Grand volume.' },
  c_milpack: { name: 'Sac militaire', w: 3, h: 3, wear: 'back', grid: [6, 6], icon: ICONS.pack, look: { size: 1.45, col: '#5a6a3a', roll: true }, desc: 'Le plus grand sac de l\'archipel.' },
  // chapeaux
  c_cap: { name: 'Casquette', w: 2, h: 1, wear: 'hat', icon: ICONS.cap, look: { kind: 'cap', col: '#ff6b5b' }, desc: 'Protège du soleil.' },
  c_firehat: { name: 'Casque de pompier', w: 2, h: 2, wear: 'hat', armor: 0.1, icon: ICONS.helmet, look: { kind: 'fire', col: '#d8322a' }, desc: '−10 % de dégâts.' },
  c_helmet: { name: 'Casque militaire', w: 2, h: 2, wear: 'hat', armor: 0.12, icon: ICONS.helmet, look: { kind: 'mil', col: '#5a6a3a' }, desc: '−12 % de dégâts.' },
};
for (const [k, d] of Object.entries(GEAR)) {
  d.key = k;
  d.cat = d.cat || (d.wear ? 'wear' : d.eq === 'util' ? 'util' : d.eq ? 'weapon' : 'misc');
}
export const WEAR_PARTS = ['hat', 'top', 'vest', 'back', 'bottom'];
export const WEAR_NAMES = { hat: 'Tête', top: 'Haut', vest: 'Gilet', back: 'Sac', bottom: 'Bas' };
export const EQ_SLOTS = ['primary', 'secondary', 'u1', 'u2', 'u3', 'u4'];
export const EQ_NAMES = { primary: 'Principale', secondary: 'Secondaire', u1: 'Équip. 1', u2: 'Équip. 2', u3: 'Équip. 3', u4: 'Équip. 4' };
export const slotType = (s) => (s === 'primary' || s === 'secondary' ? s : 'util');
export const ARMOR_MAX = 0.55;
export const RARITY = { common: 'Commun', uncommon: 'Peu commun', rare: 'Rare', epic: 'Très rare' };

// ── grilles ──
export const dims = (it) => { const d = GEAR[it.k]; return it.r ? [d.h, d.w] : [d.w, d.h]; };
export function fitsAt(items, W, H, it, x, y, r, skip) {
  const d = GEAR[it.k];
  const w = r ? d.h : d.w, h = r ? d.w : d.h;
  if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
  for (const o of items) {
    if (o === skip || o === it) continue;
    const [ow, oh] = dims(o);
    if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
  }
  return true;
}
export function findSpot(items, W, H, it, skip) {
  for (const r of [0, 1]) {
    const d = GEAR[it.k];
    if (r && d.w === d.h) continue;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fitsAt(items, W, H, it, x, y, r, skip)) return { x, y, r };
  }
  return null;
}
// ajoute dans une pile existante ; renvoie le reste
export function stackInto(items, k, n) {
  const max = GEAR[k].stack || 1;
  if (max <= 1) return n;
  for (const o of items) {
    if (o.k !== k || n <= 0) continue;
    const room = max - (o.n || 1);
    if (room > 0) { const a = Math.min(room, n); o.n = (o.n || 1) + a; n -= a; }
  }
  return n;
}
// place un objet dans une grille (pile puis place libre) ; renvoie le reste (0 = tout est rangé)
export function gridAdd(items, W, H, it) {
  const max = GEAR[it.k].stack || 1;
  let n = it.n || 1;
  if (max > 1) { n = stackInto(items, it.k, n); if (n <= 0) return 0; }
  let first = true;
  while (n > 0) {
    const part = { ...it, n: Math.min(n, max) };
    if (!first) part.u = newUid();
    const s = findSpot(items, W, H, part);
    if (!s) { it.n = n; return n; }
    Object.assign(part, s);
    items.push(part);
    n -= part.n;
    first = false;
  }
  return 0;
}

let uidN = 0;
const uidR = Math.floor(Math.random() * 1e6).toString(36);
export function newUid() { uidN += 1; return `${uidR}${uidN.toString(36)}`; }
export function makeItem(k, n = 1, extra = {}) {
  const d = GEAR[k];
  const it = { k, n: Math.max(1, Math.min(n, d.stack || 1)), u: newUid(), x: 0, y: 0, r: 0, ...extra };
  if (d.wear && d.grid) it.c = it.c || [];
  return it;
}
export const itemLabel = (it) => `${GEAR[it.k].name}${(it.n || 1) > 1 ? ` ×${it.n}` : ''}`;

// ── butin : tables de rareté (poids) ──
// Les vêtements de stockage sont rares : chaque île garantit au moins un sac (Jo, objets trouvés, police).
export const LOOT_TABLES = {
  suitcase: [['c_jeanshirt', 7], ['c_jeans', 7], ['c_cap', 6], ['c_raincoat', 4], ['c_cargo', 3], ['c_satchel', 3], ['c_pilot', 1.5], ['c_backpack', 1.2], ['c_hiking', 0.35], ['bandage', 8], ['talkie', 1.2], ['a_p9', 1.5]],
  locker: [['c_jeanshirt', 4], ['c_cargo', 4], ['c_pilot', 3], ['c_lifevest', 3], ['bandage', 8], ['medkit', 2], ['lantern', 1], ['talkie', 2], ['a_flare', 3], ['stake', 3], ['c_satchel', 2], ['c_backpack', 0.8]],
  crate: [['stake', 6], ['a_flare', 4], ['a_harpoon', 3], ['bandage', 5], ['c_cargo', 2], ['c_lifevest', 3], ['medkit', 1], ['c_satchel', 1.5], ['parachute', 0.3]],
  military: [['c_tacvest', 3], ['c_milpants', 4], ['c_miljacket', 4], ['c_helmet', 4], ['c_milpack', 0.5], ['a_p9', 5], ['a_r556', 4], ['a_buck', 4], ['medkit', 3], ['bandage', 4]],
  medical: [['bandage', 10], ['medkit', 2]],
  cockpit: [['parachute', 1], ['c_pilot', 2], ['talkie', 2], ['bandage', 4], ['c_cap', 3]],
};
export const RARITY_OF = (k) => {
  const w = { c_hiking: 'rare', c_milpack: 'epic', c_tacvest: 'rare', c_helmet: 'rare', c_miljacket: 'rare', c_milpants: 'rare', c_backpack: 'uncommon', c_pilot: 'uncommon', c_cargo: 'uncommon', parachute: 'uncommon', medkit: 'uncommon', c_firehat: 'uncommon' };
  return w[k] || 'common';
};
