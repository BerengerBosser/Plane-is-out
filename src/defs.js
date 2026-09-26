// Définitions partagées : objets, emplacements, noms
import * as THREE from 'three';
import { buildEngine, buildWing, buildProp, buildFloats, buildDashboard, buildCrate, buildWheelKit, buildPlate } from './planeModel.js';
import { buildCargoBox, buildSandbag, buildBallast, buildMirror, buildExtinguisher, buildBattery } from './props.js';

export const ITEMS = {
  wingL: { name: 'Aile gauche', weight: 3, build: buildWing, hint: 'Arrachée au-dessus de la côte nord', carryYaw: Math.PI / 2 },
  engineR: { name: 'Moteur droit', weight: 3, build: () => buildEngine(true), hint: 'A roulé sur la colline, au nord' },
  dashboard: { name: 'Tableau de bord', weight: 1, build: buildDashboard, hint: 'A traversé le toit du cabanon du gardien' },
  prop: { name: 'Hélice gauche', weight: 2, build: buildProp, hint: 'Plantée dans la forêt, au centre-ouest', tilt: -Math.PI / 2 },
  floats: { name: 'Flotteurs', weight: 3, build: buildFloats, hint: 'Dans les herbes, au-dessus de la plage' },
  engineL: { name: 'Moteur gauche', weight: 3, build: () => buildEngine(false), hint: 'Sur la plage, près de l\'épave' },
  crate: { name: 'Caisse Hélios', weight: 4, build: buildCrate },
  wheels: { name: 'Roues amphibies', weight: 3, build: buildWheelKit, hint: 'Dans le hangar 2 de Saint-Escale' },
  plateA: { name: 'Tôle', weight: 1, build: buildPlate, plate: true },
  plateB: { name: 'Tôle', weight: 1, build: buildPlate, plate: true },
  plateC: { name: 'Tôle', weight: 1, build: buildPlate, plate: true },
  plateD: { name: 'Tôle', weight: 1, build: buildPlate, plate: true },
  // énigmes physiques de Saint-Escale (block : on peut monter dessus / charger une plaque)
  cargoBox: { name: 'Caisse de fret', weight: 2, build: buildCargoBox, block: { w: 1.2, h: 1.2, d: 1.2 }, puzzle: 2 },
  sandbag: { name: 'Sac de lest', weight: 2, build: buildSandbag, block: { w: 0.9, h: 0.45, d: 0.6 }, puzzle: 2 },
  ballast: { name: 'Bloc de béton', weight: 3, build: buildBallast, block: { w: 0.8, h: 0.8, d: 0.8 }, puzzle: 2 },
  mirror1: { name: 'Miroir orientable', weight: 1, build: buildMirror, mirror: true, block: { w: 0.6, h: 1.35, d: 0.6, noStand: true }, puzzle: 2 },
  mirror2: { name: 'Miroir de surveillance', weight: 1, build: buildMirror, mirror: true, block: { w: 0.6, h: 1.35, d: 0.6, noStand: true }, puzzle: 2 },
  // île 3
  extinguisher: { name: 'Extincteur', weight: 1, build: buildExtinguisher, puzzle: 3 },
  battery: { name: 'Batterie de démarrage', weight: 2, build: buildBattery, block: { w: 0.7, h: 0.5, d: 0.45 }, puzzle: 3 },
  mirror3: { name: 'Miroir orientable', weight: 1, build: buildMirror, mirror: true, block: { w: 0.6, h: 1.35, d: 0.6, noStand: true }, puzzle: 3 },
  cargoBox3: { name: 'Caisse de fret', weight: 2, build: buildCargoBox, block: { w: 1.2, h: 1.2, d: 1.2 }, puzzle: 3 },
};
export const PART_ORDER = ['engineL', 'engineR', 'wingL', 'prop', 'floats', 'dashboard'];
export const WRECK_ROT = new THREE.Euler(-0.06, Math.PI, 0.14, 'YXZ');
export const SLOT_NAMES = ['Poings', 'Clé à molette', 'Diable', 'Lanterne', 'Pistolet de détresse', 'Fusil-harpon'];
export const SAVE_KEY = 'plane-is-out-save-v4';   // (le format interne est versionné par le champ v)
export const SETTINGS_KEY = 'plane-is-out-settings';
export const PROFILE_KEY = 'plane-is-out-profile';
export const FUSE_SLOTS = [{ key: 'sun', icon: '☀', label: 'Éclairage' }, { key: 'anchor', icon: '⚓', label: 'Ponton' }, { key: 'plane', icon: '✈', label: 'Balisage' }];
export const FUSE_SOLUTION = { sun: 'red', anchor: 'blue', plane: 'yellow' };   // repli : l'ordre réel est tiré au sort (secrets.js)
export const FUSE_NAMES = { red: 'rouge', blue: 'bleu', yellow: 'jaune' };
export const TOOL_NAMES = { diable: 'le diable de secours', wrench: 'la clé à molette', lantern: 'la lanterne du gardien' };
// (symboles des énigmes : secrets.js, tirés au sort à chaque partie)
export const COLORS = ['#ffd166', '#ff6b5b', '#5ef2c2', '#b8a4ff', '#6fb7ff', '#ff8fab'];
export const ITEM_STATES = ['hidden', 'ground', 'carried', 'installed', 'loaded', 'flying', 'placed'];

export function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return null;
}
export function unstore(key) { try { localStorage.removeItem(key); } catch { /* stockage indisponible */ } }
