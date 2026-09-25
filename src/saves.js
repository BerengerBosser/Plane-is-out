// Sauvegardes : nouvelle partie, export (téléchargement .json), import depuis un fichier
import { SAVE_KEY, store } from './defs.js';

export const SavesMixin = {
  savesInit() {
    const $ = (id) => document.getElementById(id);
    const file = $('importFile');
    const pick = () => { file.value = ''; file.click(); };
    $('btnImport').addEventListener('click', pick);
    $('btnImport2').addEventListener('click', pick);
    file.addEventListener('change', () => { const f = file.files && file.files[0]; if (f) this.importSave(f); });
    $('btnExport').addEventListener('click', () => this.exportSave());
    $('btnRestart').addEventListener('click', () => {
      if (this.session && !this.session.isHost) { this.ui.toast('Réservé à l\'hôte', 'Seul l\'hôte peut relancer la partie.', 'bad'); return; }
      if (!confirmStep(this)) return;
      this.ui.show('pause', false);
      this.newGame(Math.floor(Math.random() * 1e9));
      this.session?.send('start', { seed: this.seed, intro: 1 });
    });
  },

  // télécharge la sauvegarde courante (ou la dernière enregistrée)
  async exportSave() {
    if (this.inGame() && this.isAuthority()) this.save();
    const data = this.inGame() && !this.isAuthority() ? null : store(SAVE_KEY);
    if (!data) { this.ui.toast('Rien à exporter', this.inGame() ? 'Seul l\'hôte détient la sauvegarde de la partie.' : 'Aucune sauvegarde pour l\'instant.', 'bad'); return; }
    const d = new Date();
    const name = `plane-is-out-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}.json`;
    const text = JSON.stringify({ game: 'plane-is-out', ...data }, null, 1);
    // page publiée : on passe par la capacité « downloads » ; sinon, lien de téléchargement classique
    try {
      const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
      if (dl) { await dl.save({ filename: name, data: text }); this.ui.toast('Sauvegarde téléchargée', name, 'good'); return; }
    } catch (e) { if (e && e.code === 'declined') return; }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.ui.toast('Sauvegarde téléchargée', name, 'good');
    } catch { this.ui.toast('Téléchargement impossible', 'Votre navigateur a bloqué le fichier.', 'bad'); }
  },

  // importe un fichier .json exporté plus tôt
  importSave(file) {
    if (file.size > 3e6) { this.ui.toast('Fichier trop gros', 'Ce n\'est pas une sauvegarde de Plane is out.', 'bad'); return; }
    const r = new FileReader();
    r.onload = () => {
      let d = null;
      try { d = JSON.parse(String(r.result)); } catch { d = null; }
      if (!d || d.game !== 'plane-is-out' || !(d.v >= 4) || typeof d.seed !== 'number' || !d.items || !d.flags) {
        this.ui.toast('Sauvegarde illisible', 'Ce fichier n\'est pas une sauvegarde valide de Plane is out.', 'bad', 5000);
        return;
      }
      delete d.game;
      store(SAVE_KEY, d);
      this.refreshMenu();
      if (this.session && this.session.isHost && this.inGame()) {
        this.ui.show('pause', false);
        this.continueGame(true);
        this.session.send('start', { seed: this.seed, late: 1, reload: 1 });
        setTimeout(() => this.sendWorld(), 400);
      } else if (!this.session) {
        this.ui.show('pause', false);
        this.continueGame();
      }
      this.ui.toast('Sauvegarde importée', `Jour ${d.stats?.[2] ?? 1} · ${d.flags?.tookOff ? 'Saint-Escale' : 'Plage du Crash'}`, 'good', 5000);
    };
    r.readAsText(file);
  },
};

// double clic de confirmation pour « Nouvelle partie » (évite une perte accidentelle)
function confirmStep(game) {
  const b = document.getElementById('btnRestart');
  if (b.dataset.armed === '1') { b.dataset.armed = ''; b.querySelector('small').textContent = 'recommencer'; return true; }
  b.dataset.armed = '1';
  b.querySelector('small').textContent = 'cliquez encore pour confirmer';
  setTimeout(() => { b.dataset.armed = ''; b.querySelector('small').textContent = 'recommencer'; }, 3000);
  game.audio.beep();
  return false;
}
