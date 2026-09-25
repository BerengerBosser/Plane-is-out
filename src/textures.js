// Textures procédurales légères (dessinées une fois sur un canvas) pour donner du grain aux grands murs :
// panneaux de béton, briques, tôle ondulée. Les UV des boîtes sont mis à l'échelle pour garder des carreaux d'environ 3 m.
import * as THREE from 'three';

const cache = new Map();
function canvasTex(key, draw, size = 128) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
function noise(g, S, a) { for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); } }

export const TEX = {
  // panneaux de béton : joints, taches d'humidité
  panel: () => canvasTex('panel', (g, S) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    noise(g, S, 0.07);
    const grd = g.createLinearGradient(0, 0, 0, S); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,50,40,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, S - 3, S, 3); g.fillRect(S - 3, 0, 3, S);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, S, 2);
    for (const [x, y] of [[S * 0.2, S * 0.25], [S * 0.8, S * 0.25], [S * 0.2, S * 0.75], [S * 0.8, S * 0.75]]) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
  }),
  // briques (caserne, maisons)
  brick: () => canvasTex('brick', (g, S) => {
    g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows, w = S / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0), shade = 0.82 + Math.random() * 0.22;
      g.fillStyle = `rgb(${Math.round(255 * shade)},${Math.round(236 * shade)},${Math.round(226 * shade)})`;
      g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
    }
    noise(g, S, 0.06);
  }),
  // tôle ondulée (hangars, dépôt)
  metal: () => canvasTex('metal', (g, S) => {
    for (let x = 0; x < S; x++) { const k = 0.82 + 0.18 * Math.sin((x / S) * Math.PI * 16); g.fillStyle = `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`; g.fillRect(x, 0, 1, S); }
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(120,70,40,${Math.random() * 0.12})`; g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 8, 10 + Math.random() * 30); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, S - 2, S, 2);
  }),
};

// boîte texturée : UV mis à l'échelle de chaque face (tuile de `tile` mètres)
export function texBox(w, h, d, color, kind = 'panel', tile = 3) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, map: TEX[kind]() }));
  m.castShadow = true; m.receiveShadow = true;
  m.userData.dynamic = true;   // non fusionné (matériau propre)
  return m;
}
