// Définitions partagées : objets, emplacements, noms
import * as THREE from 'three';
import { buildEngine, buildWing, buildProp, buildFloats, buildDashboard, buildCrate, buildWheelKit, buildPlate } from './planeModel.js';

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
};
export const PART_ORDER = ['engineL', 'engineR', 'wingL', 'prop', 'floats', 'dashboard'];
export const WRECK_ROT = new THREE.Euler(-0.06, Math.PI, 0.14, 'YXZ');
export const SLOT_NAMES = ['Poings', 'Clé à molette', 'Diable', 'Lanterne', 'Pistolet de détresse', 'Fusil-harpon'];
export const SAVE_KEY = 'plane-is-out-save-v4';
export const SETTINGS_KEY = 'plane-is-out-settings';
export const PROFILE_KEY = 'plane-is-out-profile';
export const FUSE_SLOTS = [{ key: 'sun', icon: '☀', label: 'Éclairage' }, { key: 'anchor', icon: '⚓', label: 'Ponton' }, { key: 'plane', icon: '✈', label: 'Balisage' }];
export const FUSE_SOLUTION = { sun: 'red', anchor: 'blue', plane: 'yellow' };
export const FUSE_NAMES = { red: 'rouge', blue: 'bleu', yellow: 'jaune' };
export const TOOL_NAMES = { diable: 'le diable de secours', wrench: 'la clé à molette', lantern: 'la lanterne du gardien' };
export const SYMBOLS = ['⚓', '☀', '★', '♣', '♥', '✈'];
export const SYMBOL_CODE = ['⚓', '★', '♥'];
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
