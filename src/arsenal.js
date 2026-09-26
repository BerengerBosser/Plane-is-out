// Équipement : tout ce qu'on peut avoir en main (une seule chose à la fois) + caractéristiques des armes
// L'identifiant numérique est l'ancien « slot » de la barre d'outils (0 à 6), prolongé pour les nouveaux objets.
export const EQUIP = [
  { id: 0, key: 'fists', name: 'Poings', kind: 'melee', always: true, icon: 'M9 14h12a3 3 0 0 1 3 3v4a6 6 0 0 1-6 6h-5a6 6 0 0 1-6-6v-5a2 2 0 0 1 2-2zM9 14V9a2 2 0 0 1 4 0v5M13 14V8a2 2 0 0 1 4 0v6M17 14V9a2 2 0 0 1 4 0v5' },
  { id: 1, key: 'wrench', name: 'Clé à molette', short: 'Clé', kind: 'melee', icon: 'M20 5a6 6 0 0 0-5 8L5 23a2.5 2.5 0 0 0 4 4l10-10a6 6 0 0 0 8-5l-4 2-3-3 2-4z' },
  { id: 2, key: 'diable', name: 'Diable', kind: 'tool', icon: 'M11 4v18h14M11 22l-3 3M14 10h8v12M9 26a3 3 0 1 0 6 0 3 3 0 1 0-6 0' },
  { id: 3, key: 'lantern', name: 'Lanterne', kind: 'tool', icon: 'M12 7h8M16 3v4M11 9h10v14H11zM10 23h12v3H10zM16 13v6' },
  { id: 4, key: 'flare', name: 'Pistolet de détresse', short: 'Fusées', kind: 'proj', ammo: 'flare', icon: 'M5 12h16l3-3h3v7h-3l-3-2h-5l-2 9H8l1-9H5z' },
  { id: 5, key: 'harpoon', name: 'Fusil-harpon', short: 'Harpon', kind: 'proj', ammo: 'harpoon', icon: 'M3 18h19M22 15l7 3-7 3zM6 18v5h5l2-5M9 18l-2-4' },
  { id: 6, key: 'rod', name: 'Canne à pêche', short: 'Canne', kind: 'tool', icon: 'M6 27L24 5M24 5v10M24 15a3 3 0 1 1-3 3' },
  { id: 7, key: 'talkie', name: 'Talkie-walkie', short: 'Talkie', kind: 'tool', icon: 'M12 9h9v18h-9zM14 9V3M14 13h5M14 17h5M14 21h5' },
  { id: 8, key: 'machete', name: 'Machette', kind: 'melee', icon: 'M6 26l4-4M10 22l2 2M12 24L27 7c1-2-1-3-3-2L9 20' },
  { id: 9, key: 'bat', name: 'Batte cloutée', short: 'Batte', kind: 'melee', icon: 'M6 26l3-3M9 23L24 6a3 3 0 0 1 4 4L11 25M18 10l2 2M22 8l1 3M24 13l-2-1' },
  { id: 10, key: 'axe', name: 'Hache de pompier', short: 'Hache', kind: 'melee', icon: 'M8 27L22 9M17 6c4 0 8 2 9 7-3 0-6-1-8-3zM17 6l-2 3' },
  { id: 11, key: 'pistol', name: 'Pistolet', kind: 'gun', icon: 'M5 11h20v5H14l-2 9H7l2-9H5z' },
  { id: 12, key: 'shotgun', name: 'Fusil à pompe', short: 'Pompe', kind: 'gun', icon: 'M2 13h26v3H2zM8 16h8v3H8zM2 13l-1 7h4l2-4' },
  { id: 13, key: 'rifle', name: 'Carabine', kind: 'gun', icon: 'M2 13h27v3H2zM10 16h4v6h-4zM17 16h3v4h-3zM2 13l-1 6h4l2-3' },
  // objets rapides (équipements 1 à 4) et fer à souder (relié à l'avion)
  { id: 14, key: 'bandage', name: 'Bandage', kind: 'use', icon: 'M7 11h18v10H7zM12 11v10M20 11v10M9 16h2M21 16h2' },
  { id: 15, key: 'medkit', name: 'Trousse de soins', short: 'Trousse', kind: 'use', icon: 'M5 10h22v15H5zM12 10V7h8v3M16 13v9M11.5 17.5h9' },
  { id: 16, key: 'parachute', name: 'Parachute', kind: 'tool', icon: 'M4 15a12 9 0 0 1 24 0zM4 15l12 12 12-12M10 15l6 12 6-12M16 15v12' },
  { id: 17, key: 'iron', name: 'Fer à souder', short: 'Fer', kind: 'tool', icon: 'M4 26l8-8M12 18l3 3M13 17l9-9 3 3-9 9zM22 8l4-4' },
  // armes supplémentaires (butin et comptoirs)
  { id: 18, key: 'revolver', name: 'Revolver', kind: 'gun', icon: 'M4 10h17v4H12v3H9l-2 8H3l2-8V10zM11 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0' },
  { id: 19, key: 'smg', name: 'Pistolet-mitrailleur', short: 'PM', kind: 'gun', icon: 'M3 12h22v4H3zM10 16h4v8h-4zM18 16h3v5h-3zM25 13h4' },
  { id: 20, key: 'sniper', name: 'Fusil de précision', short: 'Précision', kind: 'gun', icon: 'M1 14h28v3H1zM8 10h9v4H8zM10 17h3v6h-3zM1 14v6h4l2-3' },
  { id: 21, key: 'katana', name: 'Katana', kind: 'melee', icon: 'M5 27l3-3M6 22l4 4M9 23L27 5' },
  { id: 22, key: 'sledge', name: 'Masse', kind: 'melee', icon: 'M8 27L20 11M15 5l10 8-4 5-10-8z' },
  { id: 23, key: 'launcher', name: 'Lance-grenades', short: 'Lance-gr.', kind: 'proj', ammo: 'launcher', icon: 'M3 13h20v6H3zM23 12h5v8h-5zM9 19h4v6H9zM3 13l-1 7' },
];
export const EQ = Object.fromEntries(EQUIP.map((e) => [e.key, e.id]));

// armes de mêlée : dégâts, portée, cadence, recul infligé, étourdissement
// cleave : le coup balaye tout l'arc devant soi, comme la gerbe d'un fusil à pompe
//   arc : ouverture (cosinus minimal : plus il est bas, plus l'arc est large) · hits : cibles au plus
//   les cibles suivantes (de la plus proche à la plus lointaine) perdent `falloff` des dégâts chacune
export const MELEE = {
  fists: { dmg: 12, range: 2.1, cd: 0.42, knock: 5, stun: 0.25 },
  wrench: { dmg: 28, range: 2.5, cd: 0.7, knock: 8, stun: 0.35, cleave: true, arc: 0.5, hits: 2, falloff: 0.25 },
  machete: { dmg: 46, range: 2.5, cd: 0.55, knock: 3, stun: 0.3, blade: true, cleave: true, arc: 0.2, hits: 4, falloff: 0.12 },
  bat: { dmg: 36, range: 2.6, cd: 0.72, knock: 11, stun: 0.8, cleave: true, arc: 0.3, hits: 4, falloff: 0.12 },
  axe: { dmg: 72, range: 2.5, cd: 1.0, knock: 6, stun: 0.6, blade: true, cleave: true, arc: 0.35, hits: 3, falloff: 0.15 },
  katana: { dmg: 58, range: 2.8, cd: 0.46, knock: 3, stun: 0.3, blade: true, cleave: true, arc: 0.15, hits: 5, falloff: 0.1 },
  sledge: { dmg: 88, range: 2.6, cd: 1.25, knock: 15, stun: 1.1, cleave: true, arc: 0.25, hits: 8, falloff: 0.05, heavy: true },
};

// armes à feu (tir instantané) : chargeur, munitions, dispersion, recul, bruit (attire les zombies)
export const GUNS = {
  pistol: { dmg: 34, pellets: 1, spread: 0.012, cd: 0.26, mag: 12, ammo: 'p9', reload: 1.3, range: 90, kick: 0.035, noise: 55, auto: false, snd: 'pistol' },
  shotgun: { dmg: 15, pellets: 8, spread: 0.075, cd: 0.85, mag: 6, ammo: 'buck', reload: 0.5, perShell: true, range: 32, kick: 0.11, noise: 75, auto: false, snd: 'shotgun' },
  rifle: { dmg: 29, pellets: 1, spread: 0.016, cd: 0.11, mag: 24, ammo: 'r556', reload: 1.9, range: 130, kick: 0.028, noise: 85, auto: true, snd: 'rifle' },
  revolver: { dmg: 72, pellets: 1, spread: 0.008, cd: 0.55, mag: 6, ammo: 'm357', reload: 2.0, range: 110, kick: 0.075, noise: 65, auto: false, snd: 'revolver' },
  smg: { dmg: 17, pellets: 1, spread: 0.03, cd: 0.075, mag: 30, ammo: 'p9', reload: 1.6, range: 60, kick: 0.018, noise: 50, auto: true, snd: 'smg' },
  // pierce : la balle traverse jusqu'à N ennemis alignés
  sniper: { dmg: 150, pellets: 1, spread: 0.002, cd: 1.3, mag: 5, ammo: 'm762', reload: 2.6, range: 240, kick: 0.12, noise: 110, auto: false, snd: 'sniper', pierce: 3 },
};
// visée (clic droit maintenu) : grossissement de la caméra selon l'arme en main
export const AIM_ZOOM = { pistol: 1.4, shotgun: 1.25, rifle: 2.2, harpoon: 1.7, flare: 1.3, revolver: 1.5, smg: 1.35, sniper: 4.0, launcher: 1.4 };
export const AMMO_NAMES = { p9: 'balles de 9 mm', buck: 'cartouches', r556: 'balles de 5,56', m357: 'balles de .357', m762: 'balles de 7,62', flare: 'fusées', harpoon: 'harpons', launcher: 'grenades' };
export const AMMO_MAX = { p9: 120, buck: 48, r556: 180, m357: 36, m762: 30, flare: 12, harpoon: 8, launcher: 12 };
