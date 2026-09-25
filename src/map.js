// Carte de l'archipel (touche M) : relief pré-calculé, joueurs, avion, objectif, repères
import { heightAt } from './terrain.js';

export function createMap() {
  const base = document.createElement('canvas');
  base.width = base.height = 640;
  let view = null; // { cx, cz, size }

  // rend le fond (relief) une fois pour des positions d'îles données
  function build(islands) {
    const xs = islands.map((p) => p.x), zs = islands.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const size = Math.max(x1 - x0, z1 - z0) + 800;
    view = { cx, cz, size };
    const g = base.getContext('2d');
    const img = g.createImageData(base.width, base.height);
    const N = base.width;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cx + (i / N - 0.5) * size, z = cz + (j / N - 0.5) * size;
        const h = heightAt(x, z);
        let r, gg, b;
        if (h < -0.15) { const k = Math.min(1, -h / 14); r = 60 - 40 * k; gg = 170 - 90 * k; b = 190 - 70 * k; }
        else if (h < 1.6) { r = 236; gg = 215; b = 160; }
        else if (h < 14) { r = 120 + h * 3; gg = 165 + h; b = 100; }
        else { r = 170; gg = 150; b = 120; }
        // courbes de niveau
        if (h > 1.6 && Math.abs((h % 6) - 3) < 0.25) { r *= 0.8; gg *= 0.8; b *= 0.8; }
        const k = (j * N + i) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  // dessine la carte ; data : { me, mates:[{x,z,yaw,name,color}], plane, objective, pings, hideIsland2, i2 }
  function draw(cv, data) {
    if (!view) return;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, S = Math.min(W, H);
    const ox = (W - S) / 2, oy = (H - S) / 2;
    g.clearRect(0, 0, W, H);
    g.drawImage(base, ox, oy, S, S);
    const P = (x, z) => [ox + ((x - view.cx) / view.size + 0.5) * S, oy + ((z - view.cz) / view.size + 0.5) * S];
    // brouillard sur les îles inconnues
    for (const hid of [data.hideIsland2 && data.i2, data.hideIsland3 && data.i3].filter(Boolean)) {
      const [x, y] = P(hid.x, hid.z);
      const rr = (380 / view.size) * S;
      const grd = g.createRadialGradient(x, y, rr * 0.2, x, y, rr);
      grd.addColorStop(0, 'rgba(16,22,43,0.97)'); grd.addColorStop(1, 'rgba(16,22,43,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff4e0'; g.font = `bold ${Math.round(S / 12)}px Bungee, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', x, y);
    }
    // noms des îles
    g.font = `800 ${Math.round(S / 38)}px "Bricolage Grotesque", sans-serif`;
    g.textAlign = 'center';
    const label = (t, x, z, dy) => { const [a, b] = P(x, z); g.lineWidth = 4; g.strokeStyle = '#10162b'; g.strokeText(t, a, b + dy); g.fillStyle = '#fff4e0'; g.fillText(t, a, b + dy); };
    label('Plage du Crash', 0, 0, (-200 / view.size) * S);
    if (!data.hideIsland2) label('Saint-Escale', data.i2.x, data.i2.z, (-190 / view.size) * S);
    if (data.i3 && !data.hideIsland3) label('Port-Cendre', data.i3.x, data.i3.z, (-300 / view.size) * S);
    // boutiques : drapeau bien visible
    for (const s of data.shops || []) {
      const [x, y] = P(s.x, s.z);
      g.strokeStyle = '#10162b'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 26); g.stroke();
      g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 20, y - 20); g.lineTo(x, y - 14); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#10162b'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.font = `800 ${Math.round(S / 56)}px "Bricolage Grotesque", sans-serif`; g.lineWidth = 3; g.strokeStyle = '#10162b'; g.textAlign = 'center';
      g.strokeText(`🐚 ${s.label}`, x + 8, y - 32); g.fillStyle = '#ffd166'; g.fillText(`🐚 ${s.label}`, x + 8, y - 32);
    }
    // véhicules
    for (const v of data.vehicles || []) { const [x, y] = P(v.x, v.z); g.fillStyle = '#5ef2c2'; g.strokeStyle = '#10162b'; g.lineWidth = 2; g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4, y - 4, 8, 8); }
    // objectif
    if (data.objective) {
      const [x, y] = P(data.objective.x, data.objective.z);
      g.strokeStyle = '#ffd166'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 12 + Math.sin(performance.now() / 200) * 3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    for (const p of data.pings || []) {
      const [x, y] = P(p.x, p.z);
      g.fillStyle = p.color; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7, y - 16); g.lineTo(x + 7, y - 16); g.fill();
    }
    // avion
    if (data.plane) {
      const [x, y] = P(data.plane.x, data.plane.z);
      g.save(); g.translate(x, y); g.rotate(-data.plane.yaw);
      g.fillStyle = '#fff4e0'; g.strokeStyle = '#10162b'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -12); g.lineTo(3, -2); g.lineTo(12, 2); g.lineTo(3, 3); g.lineTo(2, 9); g.lineTo(5, 12); g.lineTo(-5, 12); g.lineTo(-2, 9); g.lineTo(-3, 3); g.lineTo(-12, 2); g.lineTo(-3, -2); g.closePath();
      g.fill(); g.stroke(); g.restore();
    }
    const arrow = (x0, z0, yaw, color, name, big) => {
      const [x, y] = P(x0, z0);
      g.save(); g.translate(x, y); g.rotate(-yaw);
      const s = big ? 1.3 : 1;
      g.fillStyle = color; g.strokeStyle = '#10162b'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -10 * s); g.lineTo(7 * s, 8 * s); g.lineTo(0, 4 * s); g.lineTo(-7 * s, 8 * s); g.closePath(); g.fill(); g.stroke();
      g.restore();
      if (name) { g.font = `800 ${Math.round(S / 50)}px "Bricolage Grotesque", sans-serif`; g.lineWidth = 3; g.strokeStyle = '#10162b'; g.strokeText(name, x, y - 16); g.fillStyle = color; g.fillText(name, x, y - 16); }
    };
    for (const m of data.mates || []) arrow(m.x, m.z, m.yaw, m.color, m.name, false);
    if (data.me) arrow(data.me.x, data.me.z, data.me.yaw, '#ffd166', 'Vous', true);
    // échelle
    const px = (200 / view.size) * S;
    g.fillStyle = '#10162b'; g.fillRect(ox + 20, oy + S - 30, px, 6);
    g.font = `700 ${Math.round(S / 50)}px "Bricolage Grotesque", sans-serif`; g.textAlign = 'left'; g.fillStyle = '#10162b';
    g.fillText('200 m', ox + 24 + px, oy + S - 24);
  }

  return { build, draw };
}
