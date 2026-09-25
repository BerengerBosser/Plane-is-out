// Grille spatiale sur une liste de colliders (cercles, boîtes) : on ne teste que ceux des cases voisines
// au lieu des milliers de l'archipel. Elle se reconstruit d'elle-même quand la liste change (île ajoutée
// ou retirée, drapeaux…) et, par sécurité, toutes les deux secondes.
const CELL = 16;
let stamp = 0;

export function makeColGrid(list) {
  let cells = new Map(), always = [], n = -1, first = null, last = null, built = -1e9;
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  function rebuild() {
    cells = new Map(); always = [];
    n = list.length; first = list[0]; last = list[n - 1]; built = performance.now();
    for (const c of list) {
      if (!c) continue;
      let x0, x1, z0, z1;
      if (c.type === 'circle') { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
      else { x0 = c.minX; x1 = c.maxX; z0 = c.minZ; z1 = c.maxZ; }
      const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
      // forme inconnue ou immense : testée à chaque fois
      if (!Number.isFinite(i0 + i1 + j0 + j1) || (i1 - i0 + 1) * (j1 - j0 + 1) > 64) { always.push(c); continue; }
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let b = cells.get(k);
        if (!b) cells.set(k, (b = []));
        b.push(c);
      }
    }
  }
  return {
    // colliders dont la case touche le carré (x ± R, z ± R), ajoutés à `out`
    query(x, z, R, out = []) {
      if (list.length !== n || list[0] !== first || list[n - 1] !== last || performance.now() - built > 2000) rebuild();
      const s = ++stamp;
      for (const c of always) { c._gq = s; out.push(c); }
      const i0 = Math.floor((x - R) / CELL), i1 = Math.floor((x + R) / CELL), j0 = Math.floor((z - R) / CELL), j1 = Math.floor((z + R) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const b = cells.get(key(i, j));
        if (b) for (const c of b) if (c._gq !== s) { c._gq = s; out.push(c); }
      }
      return out;
    },
  };
}
