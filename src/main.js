// Point d'entrée
import { Game } from './game.js';

function start() {
  try {
    new Game();
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#141a26;color:#f3efe6;font:16px system-ui;padding:16px;text-align:center">Impossible de lancer la 3D sur cet appareil (WebGL indisponible).<br>${e.message}</div>`);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
