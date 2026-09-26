// Secrets de la partie : codes, fréquences, combinaisons et réglages d'énigmes, tirés de la graine.
// Chaque nouvelle partie a les siens ; une sauvegarde (même graine) retrouve exactement les mêmes.
// L'hôte et les invités partagent la graine : tout le monde voit les mêmes indices.
import { rng } from './noise.js';
import { makeLaserRoom } from './laser.js';

export const SYMBOLS = ['⚓', '☀', '★', '♣', '♥', '✈'];
export const FUSE_KEYS = ['sun', 'anchor', 'plane'];
export const VALVE_KEYS = ['A', 'B', 'C', 'D'];

function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// circuit de purge : 4 vannes (A = vidange), 3 manomètres. Pression = combinaison des ouvertures.
// On tire d'abord un réglage solution, puis on centre les zones vertes dessus : toujours soluble.
function makeValves(r) {
  for (let k = 0; k < 200; k++) {
    const W = [0, 1, 2].map(() => [-(0.25 + r() * 0.25), 0, 0, 0]);
    // chaque manomètre dépend de deux des trois vannes d'arrivée ; chaque vanne alimente au moins un manomètre
    const pairs = shuffle([[1, 2], [1, 3], [2, 3]], r);
    pairs.forEach(([a, b], j) => { W[j][a] = +(0.45 + r() * 0.5).toFixed(2); W[j][b] = +(0.3 + r() * 0.45).toFixed(2); });
    const sol = [+(0.1 + r() * 0.45).toFixed(2), +(0.25 + r() * 0.7).toFixed(2), +(0.25 + r() * 0.7).toFixed(2), +(0.25 + r() * 0.7).toFixed(2)];
    const p = W.map((row) => 0.12 + row.reduce((s, w, i) => s + w * sol[i], 0));
    if (p.some((x) => x < 0.3 || x > 0.85)) continue;
    // la solution « tout ouvert » ou « tout fermé » ne doit pas marcher
    const test = (v) => W.every((row, j) => Math.abs(0.12 + row.reduce((s, w, i) => s + w * v[i], 0) - p[j]) < 0.08);
    if (test([0, 1, 1, 1]) || test([0, 0, 0, 0]) || test([1, 1, 1, 1]) || test([0, 0.5, 0.5, 0.5])) continue;
    return { W, target: p.map((x) => +x.toFixed(3)), band: 0.07, sol };
  }
  return { W: [[-0.3, 0.8, 0.4, 0], [-0.3, 0, 0.7, 0.5], [-0.3, 0.5, 0, 0.8]], target: [0.6, 0.55, 0.62], band: 0.07, sol: [0.2, 0.5, 0.4, 0.5] };
}

export function makeSecrets(seed) {
  const r = rng((seed ^ 0x5ec2e7) >>> 0);
  const pick = (n) => Math.floor(r() * n);
  const year = 1851 + pick(48);
  const symbols = shuffle(SYMBOLS, r).slice(0, 3);
  // fréquences au pas de 0,05 MHz (bande aviation 118 → 136) ; deux stations parasites pour brouiller les pistes
  const freqs = new Set();
  const freq = () => { let f; do f = (118 + pick(360) * 0.05).toFixed(2); while ([...freqs].some((q) => Math.abs(q - f) < 1.2)); freqs.add(f); return f; };
  const radioFreq = freq(), meteoFreq = freq(), musicFreq = freq();
  const hangarCode = String(100 + pick(900));
  const colors = shuffle(['red', 'blue', 'yellow'], r);
  return {
    year,
    cabinCode: String(year).slice(1),
    symbols,
    radioFreq, meteoFreq, musicFreq,
    hangarCode,
    fuses: Object.fromEntries(FUSE_KEYS.map((k, i) => [k, colors[i]])),
    laser: makeLaserRoom(seed),
    valves: makeValves(r),
  };
}

// pression lue par chaque manomètre pour des ouvertures de vannes données (0 → 1)
export function valvePressure(V, open) {
  return V.W.map((row) => Math.max(0, 0.12 + row.reduce((s, w, i) => s + w * (+open[VALVE_KEYS[i]] || 0), 0)));
}
