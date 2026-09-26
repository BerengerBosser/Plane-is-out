// Point d'entrée du studio son (dist/sound-studio.html, servi sur /studio)
import { createAudio } from './audio.js';
import { mountStudio } from './studio.js';

const start = () => mountStudio(document.getElementById('studio'), createAudio({ role: 'studio' }));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
