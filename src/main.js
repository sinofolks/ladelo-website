import { initHero } from './hero.js';
import { initWash } from './wash.js';

// ---------- Purchase & download ----------
// TODO(Paddle): replace with Paddle.js checkout once the Paddle account is approved, e.g.
//   Paddle.Initialize({ token: 'live_…' });
//   Paddle.Checkout.open({ items: [{ priceId: 'pri_…', quantity: 1 }] });
const DOWNLOAD_URL = ''; // e.g. https://download.ladelo.app/Ladelo.dmg

for (const a of document.querySelectorAll('[data-buy]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Checkout is coming soon.');
  });
}
for (const a of document.querySelectorAll('[data-download]')) {
  if (DOWNLOAD_URL) a.href = DOWNLOAD_URL;
}
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// ---------- WebGL check ----------
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ---------- Hero ----------
const stage = document.getElementById('hero-stage');
const hint = document.getElementById('hero-hint');
const tip = document.getElementById('hero-tooltip');
const replayBtn = document.getElementById('hero-replay');
let L = null;

const HINTS = {
  helmet: 'Click the helmet to drop the ladder',
  ladder: 'Click an app to bring it back',
  empty: 'The helmet is empty',
};

if (stage && webglOK()) {
  const hero = initHero(stage, {
    layout(l) {
      L = l;
    },
    hint(kind) {
      if (!kind || !L) {
        hint.hidden = true;
        return;
      }
      hint.textContent = HINTS[kind];
      if (kind === 'ladder') {
        hint.className = 'hint';
        hint.style.left = `${L.helmetX - L.tile * 1.5 - 34}px`;
        hint.style.top = `${L.y0 + L.mb + 32}px`;
        if (L.mobile) {
          hint.className = 'hint below';
          hint.style.left = `${L.x0 + L.w * 0.34}px`;
          hint.style.top = `${L.y0 + L.mb + 120}px`;
        }
      } else {
        hint.className = 'hint below';
        hint.style.left = `${L.helmetX}px`;
        hint.style.top = `${L.y0 + L.mb + 12}px`;
      }
      hint.hidden = false;
      if (kind === 'empty') setTimeout(() => (hint.hidden = true), 1600);
      replayBtn.hidden = false;
    },
    tooltip(text, x, y, side) {
      if (!text) {
        tip.hidden = true;
        return;
      }
      tip.textContent = text;
      tip.className = side < 0 ? 'tooltip left' : 'tooltip';
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.hidden = false;
    },
    opened(app) {
      hint.hidden = false;
      hint.className = 'hint below';
      hint.textContent = `${app.name} is back on the menu bar`;
      hint.style.left = `${L.firstIconX}px`;
      hint.style.top = `${L.y0 + L.mb + 12}px`;
      setTimeout(() => this.hint('helmet'), 1800);
    },
  });
  replayBtn.addEventListener('click', () => hero.replay());
}

// ---------- Eye-break demo ----------
const washStage = document.getElementById('wash-stage');
if (washStage && webglOK()) initWash(washStage);
