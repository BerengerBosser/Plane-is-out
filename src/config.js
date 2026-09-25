// ─────────────────────────────────────────────────────────────
//  PLANE IS OUT — constantes d'équilibrage (démo solo, îles 1 et 2)
//  Toutes les valeurs réglables sont ici.
// ─────────────────────────────────────────────────────────────

export const CFG = {
  // Temps : 1 h de jeu = 2 min réelles, × 1,35 en solo
  time: {
    realSecondsPerGameHour: 120 * 1.35,
    startHour: 9.5,          // réveil après le crash
    alarmHour: 18.5,         // sirène
    nightHour: 19.0,         // arrivée de la Brume
    dawnHour: 6.5,
    restartHour: 7.0,        // retour au début de journée après un échec
    debugFastForward: 10,
  },

  // Brume et lumière
  // lumières (rayon en m) : ralentissent et brûlent un peu les zombies
  lights: { campfire: 9, planeProjectors: 12, lantern: 6 },

  // Joueur
  player: {
    eyeHeight: 1.65,
    radius: 0.4,
    walkSpeed: 6.8,
    sprintSpeed: 11,
    jumpSpeed: 6.2,
    gravity: 18,
    shallowWaterSlow: 0.7,
    maxWadeDepth: -1.35,     // au-delà, eau trop profonde
    mouseSensitivity: 0.0022,
    interactDistance: 3.2,
    health: 100,
    regenDelay: 5,           // s sans dégâts avant de se soigner
    regenPerSecond: 6,
    stamina: 100,
    sprintCost: 16,          // par seconde
    staminaRegen: 24,
  },

  // Portage : à la main (lent) ou sur le diable (rapide)
  carry: {
    hand: { 1: 1.0, 2: 0.5, 3: 0.3 },
    diable: { 1: 1.0, 2: 0.95, 3: 0.85 },
    slideSlope: 0.36,        // tan(20°)
    repairSeconds: 3.5,      // sans clé à molette
    repairSecondsWrench: 1.3,
    installDistance: 5.6,
  },

  winch: {
    range: 30,
    pullSpeed: 2.4,
  },

  // Combat
  combat: {
    fist: { dmg: 12, range: 2.1, cooldown: 0.42, knock: 5 },
    wrench: { dmg: 30, range: 2.5, cooldown: 0.7, knock: 8 },
    maxVoiles: 4,            // solo
    horde3: 2.5,             // Port-Cendre : horde de nuit plus grosse et plus rapide
    day3: 1.5,               // Port-Cendre : errants de jour (× maxVoiles)
    respawnDelay: 60,        // s avant qu'un zombie tué ne soit remplacé (tant qu'on reste dans le coin)
    respawnNear: 45,         // m : au-delà, en s'éloignant du lieu du kill, le remplacement redevient possible
    respawnClear: 28,        // m : pas de nouvelle sortie de terre autour d'un kill récent
  },

  lantern: {
    oilSeconds: 240,         // autonomie d'un plein
    refillPerSecond: 25,     // près du feu (en % par seconde)
  },

  // Vol (arcade)
  flight: {
    maxThrust: 13,
    airDrag: 0.012,
    waterDrag: 0.03,
    waterFriction: 1.0,
    takeoffSpeed: 15,
    stallSpeed: 13,
    pitchRate: 1.1,
    rollRate: 1.9,
    rudderRate: 0.55,
    bankTurn: 0.9,
    maxPitch: 0.75,
    maxRoll: 1.2,
    worldLimit: 2600,
    fuelPerSecond: 0.42,     // % par seconde à plein gaz
    startFuel: 42,
    reserveFuel: 25,         // bidon de secours dans la cabine
  },

  island: {
    radius: 160,
    size: 460,
    segments: 150,
  },

  code: '874',

  // Île 2 : aéroport de Saint-Escale
  island2: {
    minDist: 1350, maxDist: 1650, // distance à l'île 1 (position tirée au hasard)
    hangarCode: '407',
    radioFreq: '127.35',
    fuses: ['sun', 'anchor', 'plane'], // emplacement → couleur attendue : voir FUSE_SOLUTION
    valves: { A: false, B: true, C: false, D: true },
    lightRadius: 18,
  },
  swim: { level: -1.25, speed: 0.5 },
};
