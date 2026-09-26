// Catalogue des sons du jeu : partagé par le moteur audio (audio.js) et le studio son (studio.js).
// Chaque son peut être joué par le synthé intégré (par défaut) ou par un ou plusieurs fichiers du dossier sounds/
// (mp3, wav, ogg…), réglés dans le studio : découpe, gain par fichier, volume, hauteur, réverb.
// La configuration est enregistrée dans sounds/config.json.

export const CATS = [
  { id: 'weapons', name: 'Armes', icon: '🔫', send: 0.22 },
  { id: 'zombies', name: 'Créatures', icon: '🧟', send: 0.3 },
  { id: 'player', name: 'Joueur', icon: '🏃', send: 0.1 },
  { id: 'world', name: 'Monde et objets', icon: '🔧', send: 0.2 },
  { id: 'ui', name: 'Interface', icon: '🔔', send: 0 },
  { id: 'amb', name: 'Ambiance et météo', icon: '🌧', send: 0 },
  { id: 'vehicles', name: 'Véhicules', icon: '✈', send: 0.04 },
  { id: 'music', name: 'Musique', icon: '🎵', send: 0.08 },
];

// kind : shot (ponctuel) | loop (boucle pilotée en continu par le jeu)
// ref : pour les boucles, niveau que le jeu envoie « à fond » (le fichier y joue à 100 %)
export const SOUNDS = [
  // armes
  { id: 'gun.pistol', cat: 'weapons', name: 'Pistolet', desc: 'Tir au pistolet (le vôtre, et ceux des coéquipiers selon la distance).' },
  { id: 'gun.revolver', cat: 'weapons', name: 'Revolver', desc: 'Tir au revolver .357.' },
  { id: 'gun.smg', cat: 'weapons', name: 'Pistolet-mitrailleur', desc: 'Chaque balle en rafale : gardez-le court.', voices: 12 },
  { id: 'gun.rifle', cat: 'weapons', name: 'Carabine', desc: 'Tir à la carabine 5.56.' },
  { id: 'gun.shotgun', cat: 'weapons', name: 'Fusil à pompe', desc: 'Tir au fusil à pompe.' },
  { id: 'gun.sniper', cat: 'weapons', name: 'Fusil de précision', desc: 'Tir au fusil de précision (avec le cliquet de la culasse).' },
  { id: 'gun.launcher', cat: 'weapons', name: 'Lance-grenades', desc: 'Départ d\'une grenade.' },
  { id: 'whoosh', cat: 'weapons', name: 'Souffle / lancer', desc: 'Coup de machette, batte, hache, lancer, fusée de détresse.' },
  { id: 'hitFlesh', cat: 'weapons', name: 'Impact dans la chair', desc: 'Un coup ou une balle touche un zombie.' },
  { id: 'hitShell', cat: 'weapons', name: 'Impact sur carapace', desc: 'Un coup touche un crabe, un boss cuirassé ou le générateur.' },
  // créatures
  { id: 'groan', cat: 'zombies', name: 'Grognement', desc: 'Un zombie se réveille, les morts sortent de terre, le méga-zombie rugit.' },
  { id: 'scream', cat: 'zombies', name: 'Cri du Hurleur', desc: 'Le Hurleur appelle la horde.' },
  { id: 'bloat', cat: 'zombies', name: 'Gonflé qui éclate', desc: 'Un zombie gonflé explose.' },
  { id: 'splat', cat: 'zombies', name: 'Mort (flaque)', desc: 'Un zombie s\'effondre à proximité.' },
  { id: 'hiss', cat: 'zombies', name: 'Sifflement', desc: 'Un boss se prépare, invoque, ou une vague du siège commence.' },
  // joueur
  { id: 'step', cat: 'player', name: 'Pas', desc: 'Chaque pas sur le sol. Mettez plusieurs variantes !', voices: 4 },
  { id: 'stepWater', cat: 'player', name: 'Pas dans l\'eau', desc: 'Chaque pas dans l\'eau peu profonde.', voices: 4 },
  { id: 'hurt', cat: 'player', name: 'Blessure', desc: 'Vous êtes touché.' },
  { id: 'dig', cat: 'player', name: 'Creuser', desc: 'Pelle dans le sable ou la terre.' },
  { id: 'pour', cat: 'player', name: 'Verser', desc: 'Faire le plein, verser un liquide.' },
  // monde
  { id: 'clank', cat: 'world', name: 'Clang métallique', desc: 'Réparation à la clé, pièce posée, boss sonné… le son le plus fréquent du jeu.', voices: 6 },
  { id: 'thud', cat: 'world', name: 'Choc sourd', desc: 'Objet lourd qui tombe, coup de poing du méga-zombie.' },
  { id: 'explosion', cat: 'world', name: 'Explosion', desc: 'Grenade, crash, générateur qui saute, onde de choc d\'un boss.' },
  { id: 'splash', cat: 'world', name: 'Éclaboussure', desc: 'Plongeon, amerrissage, poisson qui mord.' },
  { id: 'door', cat: 'world', name: 'Porte', desc: 'Ouverture/fermeture de porte, trappe, casier.' },
  { id: 'spark', cat: 'world', name: 'Étincelles', desc: 'Soudure, court-circuit, fusée de détresse.' },
  { id: 'powerUp', cat: 'world', name: 'Mise sous tension', desc: 'Le courant revient, le générateur redémarre.' },
  { id: 'squeak', cat: 'world', name: 'Grincement / couinement', desc: 'Canard en caoutchouc trouvé.' },
  { id: 'ratchet', cat: 'world', name: 'Cliquet', desc: 'Treuil, crochet, manivelle : joué à chaque cran.', voices: 4 },
  { id: 'drop', cat: 'world', name: 'Poser / lâcher', desc: 'Lâcher un objet porté.' },
  { id: 'siren', cat: 'world', name: 'Sirène', desc: 'Alarme de 18 h, siège de la centrale, moteur en feu.' },
  { id: 'radio', cat: 'world', name: 'Grésillement radio', desc: 'Marthe prend la parole à la radio.' },
  { id: 'static', cat: 'world', name: 'Parasites radio', kind: 'loop', ref: 0.2, desc: 'Souffle de la radio de la tour pendant qu\'on cherche la fréquence : il s\'efface et une porteuse apparaît près d\'une station.' },
  // interface
  { id: 'pickup', cat: 'ui', name: 'Ramasser', desc: 'Un objet entre dans l\'inventaire.' },
  { id: 'beep', cat: 'ui', name: 'Bip', desc: 'Clic de menu, touche de digicode, admin.' },
  { id: 'error', cat: 'ui', name: 'Erreur', desc: 'Action impossible, mauvais code, plus de munitions.' },
  { id: 'success', cat: 'ui', name: 'Réussite', desc: 'Énigme résolue, objectif atteint.' },
  { id: 'note', cat: 'ui', name: 'Note musicale', desc: 'Touches des séquenceurs (jeu de Simon), poisson ferré. La hauteur suit la note jouée (réf. 523 Hz).', freq: 523.25 },
  // ambiance et météo
  { id: 'wind', cat: 'amb', name: 'Vent', kind: 'loop', ref: 0.25, desc: 'Vent continu : fort en hauteur et en vol, faible à l\'abri. La brillance suit la vitesse.' },
  { id: 'rain', cat: 'amb', name: 'Pluie', kind: 'loop', ref: 1, desc: 'Crépitement de pluie (atténué à l\'intérieur).' },
  { id: 'gust', cat: 'amb', name: 'Rafales d\'orage', kind: 'loop', ref: 1, desc: 'Grondement des rafales pendant la tempête.' },
  { id: 'thunder', cat: 'amb', name: 'Tonnerre (grondement)', desc: 'Roulement du tonnerre, retardé selon la distance de l\'éclair.' },
  { id: 'thunderCrack', cat: 'amb', name: 'Tonnerre (claquement)', desc: 'Craquement sec quand la foudre tombe tout près.' },
  // véhicules
  { id: 'engine', cat: 'vehicles', name: 'Moteur', kind: 'loop', ref: 1, rpm: true, desc: 'Moteur de l\'hydravion, des voitures, du jet et du Boeing : la hauteur suit le régime.' },
];

// ambiances musicales : quand elles jouent (le jeu choisit selon la situation)
export const MOODS = [
  { id: 'menu', name: 'Menu', icon: '🏝', desc: 'Écran titre et menus. Vide : on reprend « Détente ».', fallback: 'calm' },
  { id: 'calm', name: 'Détente', icon: '🌅', desc: 'Exploration de jour, bricolage de l\'avion, pêche.' },
  { id: 'drama', name: 'Dramatique', icon: '🌩', desc: 'Nuit dehors, zombies proches, boss, siège, joueur à terre, crash.' },
  { id: 'flight', name: 'En vol', icon: '✈', desc: 'Aux commandes d\'un avion. Vide : on reprend « Détente ».', fallback: 'calm' },
  { id: 'radio', name: 'Poste radio', icon: '📻', desc: 'Le poste du camp (E pour l\'allumer). Vide : petite boucle chiptune.' },
];

export const SOUND_BY_ID = Object.fromEntries(SOUNDS.map((s) => [s.id, s]));
export const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));

// réverb : préréglages (durée en s, pré-délai en ms, tonalité = coupe-haut en Hz, niveau de retour, premières réflexions)
export const REVERB_PRESETS = [
  { id: 'dry', name: 'Sec', icon: '·', decay: 0.3, pre: 0, tone: 4000, wet: 0.2, early: 0 },
  { id: 'beach', name: 'Plein air', icon: '🏖', decay: 1.1, pre: 25, tone: 5200, wet: 0.5, early: 0.2 },
  { id: 'room', name: 'Pièce', icon: '🚪', decay: 0.7, pre: 4, tone: 7000, wet: 0.7, early: 0.7 },
  { id: 'hangar', name: 'Hangar', icon: '🏭', decay: 2.4, pre: 18, tone: 6000, wet: 0.8, early: 0.5 },
  { id: 'cave', name: 'Grotte', icon: '🕳', decay: 3.6, pre: 30, tone: 3200, wet: 0.9, early: 0.6 },
  { id: 'hall', name: 'Cathédrale', icon: '⛪', decay: 5.5, pre: 45, tone: 5000, wet: 0.85, early: 0.3 },
];

export const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i;

export function defaultSound(def) {
  const cat = CAT_BY_ID[def.cat];
  return { src: 'synth', files: [], vol: 0, pitch: 0, rand: 0, send: cat ? cat.send : 0, fadeIn: 0, fadeOut: 0, voices: def.voices || 8, ...(def.rpm ? { lo: 0.6, hi: 1.7 } : {}) };
}
export function defaultFile(name) { return { name, start: 0, end: 0, gain: 0 }; }

export function defaultConfig() {
  return {
    v: 1,
    master: 0,
    reverb: { preset: 'beach', decay: 1.1, pre: 25, tone: 5200, wet: 0.5, early: 0.2 },
    cats: Object.fromEntries(CATS.map((c) => [c.id, { vol: 0, mute: false }])),
    sounds: Object.fromEntries(SOUNDS.map((s) => [s.id, defaultSound(s)])),
    music: { xfade: 4, gap: 3, send: 0.08, moods: Object.fromEntries(MOODS.map((m) => [m.id, { files: [], vol: 0 }])) },
  };
}

// complète une config (fichier plus ancien, sons ajoutés depuis) avec les valeurs par défaut
export function normalizeConfig(c) {
  const d = defaultConfig();
  if (!c || typeof c !== 'object') return d;
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const files = (list) => (Array.isArray(list) ? list : []).filter((f) => f && typeof f.name === 'string')
    .map((f) => ({ name: f.name, start: Math.max(0, num(f.start, 0)), end: Math.max(0, num(f.end, 0)), gain: num(f.gain, 0) }));
  const out = { v: 1, master: num(c.master, 0), reverb: { ...d.reverb, ...(c.reverb || {}) }, cats: {}, sounds: {}, music: { ...d.music, ...(c.music || {}), moods: {} } };
  for (const k of Object.keys(d.cats)) out.cats[k] = { ...d.cats[k], ...(c.cats?.[k] || {}) };
  for (const k of Object.keys(d.sounds)) {
    const s = { ...d.sounds[k], ...(c.sounds?.[k] || {}) };
    s.files = files(s.files);
    if (!['synth', 'file', 'off'].includes(s.src)) s.src = 'synth';
    out.sounds[k] = s;
  }
  for (const k of Object.keys(d.music.moods)) {
    const m = c.music?.moods?.[k] || {};
    out.music.moods[k] = { vol: num(m.vol, 0), files: files(m.files) };
  }
  return out;
}

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => (g > 1e-6 ? 20 * Math.log10(g) : -120);
