/* Entry point: page UI first (works everywhere), then the WebGL cube. */
import { initUI } from './ui.js';
import { initExperience } from './experience.js';

const root = document.documentElement;
const reduced = root.classList.contains('reduced');
window.__dkp = true;

initUI({ reduced });

let ok = false;
try {
  ok = initExperience({ reduced });
} catch (err) {
  console.warn('Cube experience disabled:', err);
  ok = false;
}
if (!ok) root.classList.add('no-webgl');
