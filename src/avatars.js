// Coéquipiers : personnage low poly animé (marche, assis, à terre, porte), étiquette de nom, bulle de discussion
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';
import { GEAR, WEAR_PARTS } from './gear.js';


function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// objets tenus en main (repère de la main : -y = prolongement du bras, -z = dessus de l'objet)
function heldItems() {
  const g = {};
  const G = (...ms) => { const o = new THREE.Group(); ms.forEach((m) => o.add(m)); o.visible = false; return o; };
  const gun = (len, col, stock) => G(box(0.06, len, 0.08, col, 0, -len / 2 + 0.1, -0.04), box(0.05, 0.12, 0.1, '#2b2f36', 0, 0, 0.02), ...(stock ? [box(0.06, 0.28, 0.1, stock, 0, 0.22, -0.02)] : []));
  g.pistol = gun(0.26, '#2b2f36');
  g.shotgun = gun(0.85, '#3a3f48', '#8a5f3a');
  g.rifle = gun(0.75, '#3a4a3a', '#3a4a3a');
  g.flare = gun(0.22, '#ff6b5b');
  g.harpoon = gun(0.95, '#5d6470', '#8a6a4a');
  g.wrench = G(box(0.05, 0.05, 0.4, '#8d9299', 0, 0, -0.18), box(0.1, 0.04, 0.1, '#8d9299', 0, 0, -0.4));
  g.machete = G(box(0.04, 0.05, 0.14, '#3a2a1e', 0, 0, -0.05), box(0.015, 0.09, 0.55, '#c9ccd2', 0, 0.01, -0.38));
  g.bat = G(box(0.07, 0.07, 0.8, '#b98b5e', 0, 0, -0.35), box(0.02, 0.1, 0.02, '#8d9299', 0, 0.05, -0.62), box(0.02, 0.1, 0.02, '#8d9299', 0, -0.05, -0.55));
  g.axe = G(box(0.05, 0.05, 0.8, '#6d4b37', 0, 0, -0.33), box(0.04, 0.26, 0.2, '#c9352b', 0, 0.08, -0.68));
  g.rod = G(box(0.03, 0.03, 1.6, '#6d4b37', 0, 0, -0.75));
  g.talkie = G(box(0.08, 0.2, 0.05, '#2b2f36', 0, -0.05, 0), box(0.012, 0.14, 0.012, '#1a1d22', 0.02, -0.2, 0));
  g.lantern = G(box(0.14, 0.2, 0.14, '#ffd166', 0, -0.2, 0), box(0.04, 0.12, 0.04, '#5d6470', 0, -0.05, 0));
  g.bandage = G(box(0.1, 0.1, 0.1, '#f4f1ea', 0, -0.04, -0.04));
  g.medkit = G(box(0.24, 0.16, 0.1, '#f4f1ea', 0, -0.08, -0.06), box(0.08, 0.1, 0.11, '#d8322a', 0, -0.08, -0.06));
  g.parachute = G(box(0.2, 0.24, 0.12, '#ff6b5b', 0, -0.1, -0.04));
  g.iron = G(box(0.05, 0.05, 0.2, '#33373f', 0, 0, -0.05), box(0.045, 0.045, 0.12, '#ffd166', 0, 0, -0.2), box(0.02, 0.02, 0.1, '#ff8a3d', 0, 0, -0.31));
  return g;
}
const SLOT_KEYS = ['fists', 'wrench', 'diable', 'lantern', 'flare', 'harpoon', 'rod', 'talkie', 'machete', 'bat', 'axe', 'pistol', 'shotgun', 'rifle', 'bandage', 'medkit', 'parachute', 'iron'];

function label(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 50;
  const draw = (t, hp = 1, bubble = '') => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 26px "Bricolage Grotesque", "Trebuchet MS", sans-serif';
    const w = Math.min(240, g.measureText(t).width + 28);
    g.fillStyle = '#10162b';
    g.beginPath(); g.roundRect((256 - w) / 2, 4, w, 36, 18); g.fill();
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 128, 23);
    g.fillStyle = '#26305a'; g.fillRect(78, 46, 100, 8);
    g.fillStyle = hp > 0.3 ? '#5ef2c2' : '#ff6b5b'; g.fillRect(78, 46, 100 * Math.max(0, hp), 8);
    tex.needsUpdate = true;
    void bubble;
  };
  draw(text);
  return { sprite: sp, draw };
}

function bubbleSprite() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.2, 0.8, 1);
  sp.renderOrder = 51;
  sp.visible = false;
  const draw = (text) => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = 'bold 30px "Bricolage Grotesque", "Trebuchet MS", sans-serif';
    let t = text;
    while (g.measureText(t).width > 470 && t.length > 4) t = `${t.slice(0, -2)}…`;
    const w = g.measureText(t).width + 40;
    g.fillStyle = '#fff4e0';
    g.beginPath(); g.roundRect((512 - w) / 2, 10, w, 70, 22); g.fill();
    g.beginPath(); g.moveTo(236, 78); g.lineTo(256, 108); g.lineTo(276, 78); g.fill();
    g.fillStyle = '#10162b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, 46);
    tex.needsUpdate = true;
  };
  return { sprite: sp, draw };
}

// ── L'équipage : quatre personnages à la silhouette reconnaissable de loin ──
// grosse tête, petites jambes, grosses mains et grosses bottes ; la couleur du joueur teinte une pièce signature.
// Tout le monde commence en tenue de base (vêtements simples aux couleurs du personnage) ;
// ce qu'on enfile ensuite (veste militaire, gilet, sac, casque…) se voit sur le personnage.
export const CHARACTERS = [
  { id: 'gaston', name: 'Gaston', role: 'le pilote', tag: 'Bonnet d\'aviateur, lunettes, écharpe au vent', skin: '#e8b48f', sleeve: '#e9dcc0', cuff: '#d8c8a8', shirt: '#e9dcc0', pants: '#b39b6a' },
  { id: 'nina', name: 'Nina', role: 'la mécano', tag: 'Bandana, salopette, clé dans la poche', skin: '#c98b62', sleeve: '#f4efe4', cuff: '#fff4e0', shirt: '#f4efe4', pants: null },
  { id: 'lou', name: 'Mamie Lou', role: 'la pêcheuse', tag: 'Bob à leurres, marinière, bottes', skin: '#f1c7a4', sleeve: '#f4f1ea', cuff: '#2f4a7a', shirt: '#f4f1ea', pants: '#4d5a6e' },
  { id: 'bako', name: 'Bako', role: 'l\'aventurier', tag: 'Casque colonial, barbe, chemise kaki', skin: '#8d5a3c', sleeve: '#b8a57a', cuff: '#8f7d55', shirt: '#b8a57a', pants: '#8f7d55' },
];

function rz(parent, m, a) { m.rotation.z = a; parent.add(m); return m; }

function cyl(rt, rb, h, col, seg = 8, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.CylinderGeometry(rt, rb, h, seg), col), flatMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// visage commun : yeux expressifs, sourcils, nez
function face(head, skin, o = {}) {
  const y = o.eyeY ?? 0.2, fz = -0.215;
  for (const sx of [-0.1, 0.1]) {
    head.add(box(0.1, 0.1, 0.02, '#ffffff', sx, y, fz));
    head.add(box(0.05, 0.06, 0.02, '#1a1a22', sx + (o.look || 0), y - 0.01, fz - 0.012));
    rz(head, box(0.12, 0.03, 0.03, o.brow || '#3a2a1e', sx, y + 0.085, fz - 0.005), sx > 0 ? -(o.browTilt ?? 0.12) : (o.browTilt ?? 0.12));
  }
  head.add(box(0.07, 0.09, 0.08, o.nose || skin, 0, y - 0.07, fz - 0.03));
  head.add(box(0.12, 0.025, 0.02, '#7a3a2a', 0, y - 0.16, fz));
  if (o.cheeks) for (const sx of [-0.15, 0.15]) head.add(box(0.06, 0.04, 0.02, '#ff9a8a', sx, y - 0.09, fz + 0.003));
}

// wear : clés d'objets portés { hat, top, vest, back, bottom } (voir gear.js) ; looks : leur apparence
function buildLook(ci, color, parts, wear = {}, looks = {}) {
  const C = CHARACTERS[ci] || CHARACTERS[0];
  const { torso, head, legs, arms } = parts;
  const skin = C.skin;
  const anim = {};
  // couvre-chef du personnage : masqué si l'on porte un casque ou une casquette
  const hw = new THREE.Group(); head.add(hw);
  const hatOn = !!wear.hat;
  hw.visible = !hatOn;
  // tête
  head.add(box(0.44, 0.42, 0.42, skin, 0, 0.2, 0));
  for (const sx of [-0.235, 0.235]) head.add(box(0.04, 0.1, 0.08, skin, sx, 0.2, 0.02)); // oreilles
  const boots = (col, h = 0.16) => legs.forEach((l) => l.add(box(0.2, h, 0.32, col, 0, -0.66 + h / 2 - 0.06, -0.05)));
  const hands = (col = skin) => arms.forEach((a) => a.add(box(0.15, 0.15, 0.15, col, 0, -0.56, 0)));
  const legWear = (col) => legs.forEach((l) => l.add(box(0.19, 0.6, 0.21, col, 0, -0.3, 0)));
  const sleeves = (col, len = 0.48) => arms.forEach((a) => a.add(box(0.15, len, 0.16, col, 0, -len / 2 + 0.02, 0)));
  const bare = (col) => arms.forEach((a) => a.add(box(0.12, 0.3, 0.13, col, 0, -0.34, 0)));
  // ── visage et couvre-chef signature ──
  if (C.id === 'gaston') {
    face(head, skin, { brow: '#4a3322' });
    head.add(box(0.36, 0.07, 0.06, '#4a3322', 0, 0.075, -0.245));                 // grosse moustache
    for (const sx of [-0.2, 0.2]) rz(head, box(0.08, 0.05, 0.05, '#4a3322', sx, 0.1, -0.24), sx > 0 ? 0.5 : -0.5);
    head.add(box(0.46, 0.1, 0.44, '#6a4a2c', 0, 0.39, 0.02));                    // cheveux
    hw.add(box(0.48, 0.2, 0.46, '#5a3a24', 0, 0.39, 0.01));                      // bonnet de cuir
    for (const sx of [-0.245, 0.245]) hw.add(box(0.05, 0.26, 0.2, '#5a3a24', sx, 0.2, 0.04));
    hw.add(box(0.46, 0.05, 0.05, '#2a1c12', 0, 0.37, -0.23));
    for (const sx of [-0.11, 0.11]) {                                              // lunettes remontées
      const r = cyl(0.085, 0.085, 0.06, '#c9a24c', 10, sx, 0.41, -0.23); r.rotation.x = Math.PI / 2; hw.add(r);
      const l = cyl(0.062, 0.062, 0.065, '#7fe0ff', 10, sx, 0.41, -0.24); l.rotation.x = Math.PI / 2; hw.add(l);
    }
    // écharpe à la couleur du joueur, qui flotte derrière
    torso.add(box(0.5, 0.1, 0.42, color, 0, 0.66, 0));
    const tail = new THREE.Group(); tail.position.set(0.14, 0.64, 0.22); torso.add(tail);
    tail.add(box(0.12, 0.06, 0.55, color, 0, 0, 0.27));
    tail.add(box(0.13, 0.07, 0.06, '#ffffff', 0, 0, 0.55));
    anim.scarf = tail;
  } else if (C.id === 'nina') {
    face(head, skin, { brow: '#6a2a14', cheeks: true, browTilt: -0.1 });
    head.add(box(0.07, 0.04, 0.02, '#3a3030', -0.14, 0.09, -0.218));              // trace de cambouis
    head.add(box(0.46, 0.1, 0.44, '#8a3a1e', 0, 0.37, 0.02));                     // cheveux
    hw.add(box(0.48, 0.14, 0.46, '#ffcf3a', 0, 0.39, 0));                        // bandana
    const bow = new THREE.Group(); bow.position.set(0, 0.5, -0.05); hw.add(bow);
    rz(bow, box(0.14, 0.1, 0.05, '#ffcf3a', -0.08, 0.02, 0), 0.5);
    rz(bow, box(0.14, 0.1, 0.05, '#ffcf3a', 0.08, 0.02, 0), -0.5);
    for (let i = 0; i < 6; i++) hw.add(box(0.06, 0.035, 0.02, '#1a1a22', -0.17 + i * 0.068, 0.39, -0.232));
    head.add(box(0.42, 0.07, 0.06, '#8a3a1e', 0, 0.35, -0.21));                   // frange
    const braid = new THREE.Group(); braid.position.set(0, 0.24, 0.22); head.add(braid);
    for (let i = 0; i < 4; i++) braid.add(box(0.1 - i * 0.012, 0.1, 0.1, '#8a3a1e', 0, -i * 0.1, 0.04 + i * 0.03));
    anim.braid = braid;
  } else if (C.id === 'lou') {
    face(head, skin, { brow: '#b9b9b9', cheeks: true, eyeY: 0.19 });
    for (const sx of [-0.1, 0.1]) {                                                // lunettes rondes
      const r = new THREE.Mesh(prep(new THREE.TorusGeometry(0.068, 0.014, 4, 12), '#6a4a8a'), flatMat);
      r.position.set(sx, 0.19, -0.24); head.add(r);
    }
    head.add(box(0.07, 0.015, 0.015, '#6a4a8a', 0, 0.2, -0.24));
    head.add(box(0.46, 0.14, 0.44, '#d9d9d9', 0, 0.36, 0.02));                   // cheveux gris
    head.add(cyl(0.12, 0.14, 0.14, '#d9d9d9', 8, 0, 0.36, 0.26));                 // chignon
    hw.add(cyl(0.3, 0.34, 0.08, color, 10, 0, 0.44, 0));                          // bob (couleur du joueur)
    hw.add(cyl(0.22, 0.26, 0.16, color, 10, 0, 0.54, 0));
    hw.add(box(0.05, 0.08, 0.02, '#ff4a6a', 0.2, 0.52, -0.12));                   // leurres
    hw.add(box(0.05, 0.06, 0.02, '#46e6b0', 0.23, 0.5, 0.05));
    hw.add(box(0.04, 0.07, 0.02, '#ffd23a', -0.2, 0.52, -0.08));
  } else {
    face(head, skin, { brow: '#2a1a10', browTilt: 0.2 });
    head.add(box(0.46, 0.2, 0.2, '#2a1a10', 0, 0.02, -0.14));                     // grosse barbe
    head.add(box(0.36, 0.12, 0.14, '#2a1a10', 0, -0.08, -0.16));
    head.add(box(0.14, 0.04, 0.03, '#7a3a2a', 0, 0.06, -0.245));
    head.add(box(0.45, 0.08, 0.43, '#2a1a10', 0, 0.39, 0.02));                    // cheveux ras
    const helm = new THREE.Mesh(prep(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e8dcb0'), flatMat);
    helm.position.y = 0.36; helm.castShadow = true; hw.add(helm);                 // casque colonial
    hw.add(cyl(0.38, 0.38, 0.04, '#e8dcb0', 12, 0, 0.36, 0));
    hw.add(cyl(0.305, 0.305, 0.07, color, 12, 0, 0.41, 0));                       // bandeau (couleur du joueur)
  }

  // ── haut ──
  const top = looks.top || {};
  if (!wear.top || top.kind === 'base') {
    // tenue de base propre à chaque personnage
    if (C.id === 'gaston') { torso.add(box(0.54, 0.58, 0.34, C.shirt, 0, 0.3, 0)); torso.add(box(0.2, 0.12, 0.02, '#c8b898', 0, 0.52, -0.175)); sleeves(C.sleeve, 0.36); bare(skin); hands(); }
    else if (C.id === 'nina') { torso.add(box(0.5, 0.56, 0.32, C.shirt, 0, 0.3, 0)); arms.forEach((a) => a.add(box(0.16, 0.16, 0.17, C.shirt, 0, -0.06, 0))); bare(skin); hands(); }
    else if (C.id === 'lou') {
      torso.add(box(0.56, 0.6, 0.34, C.shirt, 0, 0.3, 0));
      for (const y of [0.12, 0.26, 0.4]) torso.add(box(0.57, 0.05, 0.35, '#2f4a7a', 0, y, 0));   // marinière
      sleeves(C.sleeve, 0.46); arms.forEach((a) => a.add(box(0.16, 0.05, 0.17, '#2f4a7a', 0, -0.2, 0))); hands();
    } else { torso.add(box(0.54, 0.58, 0.34, C.shirt, 0, 0.3, 0)); for (const sx of [-0.14, 0.14]) torso.add(box(0.14, 0.12, 0.02, C.cuff, sx, 0.4, -0.175)); arms.forEach((a) => a.add(box(0.16, 0.2, 0.17, C.shirt, 0, -0.08, 0))); bare(skin); hands(); }
  } else {
    const col = top.col || '#6a6a6a';
    if (top.kind === 'coat') { torso.add(box(0.6, 0.72, 0.38, col, 0, 0.24, 0)); torso.add(box(0.62, 0.1, 0.4, top.cuff || col, 0, 0.62, 0)); for (const sy of [0.42, 0.26, 0.1]) torso.add(box(0.05, 0.05, 0.02, '#2a2a2a', 0.05, sy, -0.195)); }
    else if (top.kind === 'jacket') { torso.add(box(0.58, 0.6, 0.38, col, 0, 0.3, 0)); torso.add(box(0.62, 0.14, 0.4, top.collar || col, 0, 0.58, 0)); torso.add(box(0.04, 0.44, 0.02, '#2a1c12', 0.06, 0.3, -0.195)); for (const sx of [-0.16, 0.18]) torso.add(box(0.14, 0.12, 0.02, top.cuff || col, sx, 0.2, -0.195)); }
    else { torso.add(box(0.54, 0.58, 0.34, col, 0, 0.3, 0)); torso.add(box(0.3, 0.08, 0.36, top.cuff || col, 0, 0.58, 0)); for (const sx of [-0.13, 0.13]) torso.add(box(0.12, 0.1, 0.02, top.cuff || col, sx, 0.42, -0.175)); }
    sleeves(top.sleeve || col, top.kind === 'shirt' ? 0.46 : 0.5); hands(top.kind === 'coat' ? '#f2c230' : skin);
  }
  // ── bas ──
  const bot = looks.bottom || {};
  if (!wear.bottom || bot.kind === 'base') {
    if (C.id === 'nina') {
      torso.add(box(0.52, 0.36, 0.34, color, 0, 0.18, 0));                        // salopette (couleur du joueur)
      for (const sx of [-0.15, 0.15]) torso.add(box(0.07, 0.3, 0.35, color, sx, 0.46, 0));
      torso.add(box(0.2, 0.14, 0.02, color, 0, 0.3, -0.18));
      rz(torso, box(0.05, 0.22, 0.04, '#9aa3ad', 0.12, 0.33, -0.19), 0.25);       // clé
      legWear(color); boots('#3a2e28', 0.22);
    } else if (C.id === 'bako') {
      torso.add(box(0.56, 0.07, 0.36, '#4a3a22', 0, 0.04, 0));
      legs.forEach((l) => { l.add(box(0.2, 0.26, 0.22, C.pants, 0, -0.12, 0)); l.add(box(0.14, 0.2, 0.15, skin, 0, -0.34, 0)); l.add(box(0.16, 0.14, 0.17, '#eee6d0', 0, -0.48, 0)); });
      boots('#5a3a24', 0.2);
    } else { torso.add(box(0.58, 0.07, 0.38, '#2a1c12', 0, 0.04, 0)); legWear(C.pants); boots(C.id === 'lou' ? color : '#1e1a18', C.id === 'lou' ? 0.34 : 0.26); }
  } else {
    torso.add(box(0.56, 0.08, 0.36, '#2a2a22', 0, 0.04, 0));
    legWear(bot.col || '#4a4a4a');
    if (bot.pockets) legs.forEach((l, i) => l.add(box(0.06, 0.16, 0.16, bot.col || '#4a4a4a', i ? 0.12 : -0.12, -0.28, 0)));
    boots('#2a2622', 0.24);
  }
  // ── gilet ──
  const vest = looks.vest;
  if (wear.vest && vest) {
    if (vest.kind === 'life') { torso.add(box(0.62, 0.46, 0.44, vest.col, 0, 0.34, 0)); torso.add(box(0.5, 0.05, 0.46, '#10162b', 0, 0.22, 0)); torso.add(box(0.5, 0.05, 0.46, '#10162b', 0, 0.42, 0)); }
    else { torso.add(box(0.6, 0.44, 0.42, vest.col, 0, 0.34, 0)); if (vest.kind === 'tac') for (const sx of [-0.18, 0, 0.18]) torso.add(box(0.13, 0.14, 0.06, '#3a4a26', sx, 0.28, -0.23)); else torso.add(box(0.44, 0.3, 0.03, '#262c34', 0, 0.36, -0.22)); }
  }
  // ── sac ──
  const back = looks.back;
  if (wear.back && back) {
    const s = back.size || 1;
    torso.add(box(0.44 * Math.min(1.15, s), 0.5 * s, 0.24 * s, back.col, 0, 0.32 + 0.05 * s, 0.26 + 0.1 * s));
    torso.add(box(0.3 * Math.min(1.1, s), 0.16 * s, 0.05, back.col, 0, 0.2, 0.38 + 0.2 * s));
    for (const sx of [-0.16, 0.16]) torso.add(box(0.05, 0.5, 0.04, '#2a2a22', sx, 0.34, -0.18));
    if (back.roll) { const r = cyl(0.1 * s, 0.1 * s, 0.5 * s, color, 8, 0, 0.32 + 0.33 * s, 0.26 + 0.1 * s); r.rotation.z = Math.PI / 2; torso.add(r); }
    anim.pack = true;
  }
  // ── chapeau ──
  const hat = looks.hat;
  if (hatOn && hat) {
    if (hat.kind === 'cap') { head.add(box(0.47, 0.12, 0.45, hat.col, 0, 0.44, 0.01)); head.add(box(0.4, 0.03, 0.18, hat.col, 0, 0.39, -0.29)); }
    else {
      const dome = new THREE.Mesh(prep(new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat.col), flatMat);
      dome.position.y = 0.38; dome.castShadow = true; head.add(dome);
      head.add(cyl(hat.kind === 'fire' ? 0.36 : 0.31, hat.kind === 'fire' ? 0.36 : 0.31, 0.04, hat.col, 12, 0, 0.38, hat.kind === 'fire' ? 0.05 : 0));
      if (hat.kind === 'fire') head.add(box(0.1, 0.12, 0.03, '#ffd166', 0, 0.52, -0.27));
    }
  }
  return anim;
}

// sig : vêtements portés « chapeau|haut|gilet|sac|bas » (clés d'objets, vide = rien ou tenue de base)
export function buildAvatar(name, color, idx = 0, ci = 0, sig = '') {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.72;
  body.add(hips);
  const legs = [];
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0, 0);
    hips.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.02;
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const arms = [];
  for (const sx of [-0.35, 0.35]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 0.56, 0);
    torso.add(arm);
    arms.push(arm);
  }
  const parts = String(sig || '').split('|');
  const wear = {}, looks = {};
  WEAR_PARTS.forEach((p, i) => { const k = parts[i]; if (k && GEAR[k]) { wear[p] = k; looks[p] = GEAR[k].look || {}; } });
  const extra = buildLook(ci, color, { hips, torso, head, legs, arms }, wear, looks);
  void idx;
  // objets en main : main droite (armes, outils) et main gauche (lanterne)
  const held = heldItems();
  const handR = new THREE.Group(); handR.position.set(0, -0.58, 0); arms[1].add(handR);
  const handL = new THREE.Group(); handL.position.set(0, -0.58, 0); arms[0].add(handL);
  for (const [k, o] of Object.entries(held)) (k === 'lantern' ? handL : handR).add(o);
  const tag = label(name, color);
  tag.sprite.position.y = 2.3;
  root.add(tag.sprite);
  const bub = bubbleSprite();
  bub.sprite.position.y = 2.8;
  root.add(bub.sprite);
  let walk = 0, bubbleT = 0, t = 0;

  return {
    root,
    ci,
    sig,
    setName(n, c) { tag.draw(n); void c; },
    // étiquettes plus discrètes de près (cabine)
    near(d) {
      const k = Math.max(0.3, Math.min(1, d / 12));
      tag.sprite.scale.set(1.6 * k, 0.4 * k, 1);
      bub.sprite.scale.set(3.2 * Math.max(0.45, k), 0.8 * Math.max(0.45, k), 1);
      tag.sprite.position.y = 2.3 - (1 - k) * 0.25;
    },
    say(text) { bub.draw(text); bub.sprite.visible = true; bubbleT = 5; },
    hp(v, n) { tag.draw(n, v); },
    // s : { moving, sprint, seat, lying, down, carry, slot, crouch }
    animate(dt, s) {
      t += dt;
      walk += dt * (s.moving ? (s.sprint ? 11 : 7.5) : 0);
      const a = s.moving ? Math.sin(walk) * 0.7 : 0;
      legs[0].rotation.x = a; legs[1].rotation.x = -a;
      arms[0].rotation.x = -a * 0.8; arms[1].rotation.x = a * 0.8;
      arms[0].rotation.z = 0; arms[1].rotation.z = 0;
      body.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, s.moving ? Math.sin(walk) * 0.04 : Math.sin(t * 1.3) * 0.03);
      body.position.set(0, s.moving ? Math.abs(Math.sin(walk)) * 0.05 : Math.sin(t * 2) * 0.008, 0);
      // (le personnage regarde vers -z : lever le bras devant soi = rotation x positive)
      if (s.crouch) { body.position.y -= 0.32; legs[0].rotation.x += 0.9; legs[1].rotation.x += 0.9; hips.rotation.x = 0; torso.rotation.x = -0.35; }
      else torso.rotation.x = s.sprint && s.moving ? -0.18 : 0;
      const key = SLOT_KEYS[s.slot] || 'fists';
      for (const [k, o] of Object.entries(held)) o.visible = !s.carry && (!s.seat || s.armed) && !s.lying && !s.down && k === key && !s.hideHeld;
      const gunLike = ['pistol', 'shotgun', 'rifle', 'flare', 'harpoon'].includes(key);
      const melee = ['wrench', 'machete', 'bat', 'axe'].includes(key);
      if (s.carry) { arms[0].rotation.x = 1.2; arms[1].rotation.x = 1.2; }
      else if (s.push) { arms[0].rotation.x = arms[1].rotation.x = 1.45; torso.rotation.x = -0.35; }
      else if (gunLike) {
        arms[1].rotation.x = 1.5; arms[0].rotation.x = key === 'pistol' ? 1.45 : 1.25;
        arms[0].rotation.z = key === 'pistol' ? 0.45 : 0.3;
        if (s.attack > 0) arms[1].rotation.x = 1.62;
      } else if (melee) {
        arms[1].rotation.x = s.attack > 0 ? 2.5 : 0.55;
        held[key].rotation.x = s.attack > 0 ? -0.2 : 1.0;
      } else if (key === 'talkie') {
        arms[1].rotation.x = s.talk ? 2.3 : 0.35; arms[1].rotation.z = s.talk ? 0.55 : 0;
      } else if (key === 'rod') arms[1].rotation.x = 0.7;
      else if (key === 'lantern') arms[0].rotation.x = 0.9;
      else if (key === 'diable') { arms[0].rotation.x = arms[1].rotation.x = 0.7; }
      else if (s.attack > 0) arms[1].rotation.x = 1.6;
      if (s.seat) {
        legs[0].rotation.x = legs[1].rotation.x = 1.45;
        body.position.y = -0.36;
        if (!(s.armed && (gunLike || melee))) { arms[0].rotation.x = arms[1].rotation.x = 0.5; arms[0].rotation.z = arms[1].rotation.z = 0; }
      }
      if (s.lying || s.down) {
        body.rotation.x = -Math.PI / 2;
        body.position.set(0, 0.25, 0.8);
        legs[0].rotation.x = legs[1].rotation.x = 0;
        if (s.down) { arms[0].rotation.x = 2.6; arms[1].rotation.x = 0.4; }
      }
      if (s.wave) { arms[1].rotation.x = 2.8; arms[1].rotation.z = Math.sin(t * 9) * 0.35; }
      // pièces qui bougent : écharpe au vent, natte, poêle
      if (extra.scarf) extra.scarf.rotation.set(-0.35 - (s.moving ? 0.5 : 0) + Math.sin(t * 7) * 0.12, Math.sin(t * 4.3) * 0.25, 0);
      if (extra.braid) extra.braid.rotation.x = 0.2 + (s.moving ? Math.abs(Math.sin(walk)) * 0.3 : Math.sin(t * 1.5) * 0.05);
      if (extra.pan) extra.pan.rotation.x = s.moving ? Math.sin(walk * 2) * 0.4 : 0;
      if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) bub.sprite.visible = false; }
    },
  };
}

// portraits pour le menu : rendus une fois dans une cible hors écran
export function renderPortraits(renderer, color = '#ff6b5b') {
  const W = 160, H = 200;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a9a', 2.6));
  const d = new THREE.DirectionalLight('#fff0dc', 2.2); d.position.set(-1, 2, -2); scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 20);
  cam.position.set(0.9, 1.75, -3.6); cam.lookAt(0, 1.25, 0);
  const rt = new THREE.WebGLRenderTarget(W, H);
  const px = new Uint8Array(W * H * 4);
  const out = [];
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  for (let i = 0; i < CHARACTERS.length; i++) {
    const av = buildAvatar('', color, 0, i);
    av.root.children.forEach((c) => { if (c.isSprite) c.visible = false; });
    av.animate(0.016, {});
    scene.add(av.root);
    renderer.setRenderTarget(rt);
    renderer.setClearColor('#000000', 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    scene.remove(av.root);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    out.push(cv.toDataURL());
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return out;
}
