// Radar du Coucou : échos des îles, cap vers le haut, balayage
export function drawRadar(cv, { x, z, yaw, t, range = 2200, contacts = [] }) {
  const g = cv.getContext('2d');
  const S = cv.width, c = S / 2, R = S / 2 - 4;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#062a2e'; g.fillRect(0, 0, S, S);
  // anneaux
  g.strokeStyle = 'rgba(94,242,194,0.28)'; g.lineWidth = Math.max(1, S / 200);
  for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(c, c, (R * k) / 3, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(c, c - R); g.lineTo(c, c + R); g.moveTo(c - R, c); g.lineTo(c + R, c); g.stroke();
  // balayage
  const a = (t * 1.6) % (Math.PI * 2);
  const grad = g.createConicGradient ? g.createConicGradient(a - 0.9, c, c) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(94,242,194,0)');
    grad.addColorStop(0.14, 'rgba(94,242,194,0.35)');
    grad.addColorStop(0.145, 'rgba(94,242,194,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  }
  const scale = R / range;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (const ct of contacts) {
    const dx = ct.x - x, dz = ct.z - z;
    const lx = dx * cos - dz * sin;
    const lf = -dx * sin - dz * cos;
    let px = c + lx * scale, py = c - lf * scale;
    const d = Math.hypot(px - c, py - c);
    const out = d > R - 10;
    if (out) { px = c + (px - c) / d * (R - 10); py = c + (py - c) / d * (R - 10); }
    // l'écho brille quand le balayage passe
    let ang = Math.atan2(px - c, -(py - c)); if (ang < 0) ang += Math.PI * 2;
    let lag = (a + Math.PI / 2 - ang); lag = ((lag % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const glow = ct.known ? 1 : Math.max(0.25, 1 - lag / 3);
    g.globalAlpha = glow;
    g.fillStyle = ct.color;
    g.beginPath();
    if (out) {
      const ax = (px - c) / (R - 10), ay = (py - c) / (R - 10);
      g.moveTo(px + ax * 8, py + ay * 8);
      g.lineTo(px - ay * 6, py + ax * 6);
      g.lineTo(px + ay * 6, py - ax * 6);
    } else g.arc(px, py, Math.max(4, S / 36), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.font = `bold ${Math.round(S / 14)}px "Bricolage Grotesque", sans-serif`;
    g.fillStyle = '#e9fff7';
    g.textAlign = 'center';
    const km = Math.hypot(dx, dz);
    g.fillText(`${ct.label} · ${km > 999 ? (km / 1000).toFixed(1) + ' km' : Math.round(km) + ' m'}`, Math.min(S - 40, Math.max(40, px)), Math.min(S - 8, Math.max(16, py - 10)));
  }
  // l'avion au centre
  g.fillStyle = '#ffd166';
  g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c - 6, c + 7); g.lineTo(c, c + 3); g.lineTo(c + 6, c + 7); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#5ef2c2'; g.lineWidth = 3;
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#5ef2c2'; g.font = `bold ${Math.round(S / 13)}px "Bricolage Grotesque", sans-serif`; g.textAlign = 'center';
  const nr = R - 12;
  g.textBaseline = 'middle';
  g.fillText('N', c + sin * nr, c - cos * nr);
}
