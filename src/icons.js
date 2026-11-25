// Made-up menu bar apps. Each has a glyph drawn in two looks:
// a monochrome menu bar icon and a colourful app tile for the ladder.
import * as THREE from 'three';

const TAU = Math.PI * 2;

// Each glyph draws into a 100×100 box with the current fill/stroke.
const GLYPHS = {
  cloud(c) {
    c.beginPath();
    c.arc(35, 58, 17, Math.PI * 0.5, Math.PI * 1.5);
    c.arc(52, 40, 22, Math.PI * 1.1, Math.PI * 1.95);
    c.arc(70, 56, 18, Math.PI * 1.5, Math.PI * 0.5);
    c.closePath();
    c.fill();
  },
  note(c) {
    c.fillRect(56, 18, 9, 52);
    c.beginPath();
    c.ellipse(46, 72, 16, 12, -0.4, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(56, 18);
    c.quadraticCurveTo(84, 26, 80, 48);
    c.quadraticCurveTo(76, 34, 65, 34);
    c.fill();
  },
  bolt(c) {
    c.beginPath();
    c.moveTo(58, 10);
    c.lineTo(26, 56);
    c.lineTo(48, 56);
    c.lineTo(40, 90);
    c.lineTo(76, 40);
    c.lineTo(54, 40);
    c.closePath();
    c.fill();
  },
  bubble(c) {
    c.beginPath();
    c.roundRect(16, 20, 68, 48, 16);
    c.fill();
    c.beginPath();
    c.moveTo(30, 62);
    c.lineTo(26, 84);
    c.lineTo(48, 66);
    c.fill();
  },
  clip(c) {
    c.lineWidth = 9;
    c.beginPath();
    c.roundRect(24, 22, 52, 64, 9);
    c.stroke();
    c.fillRect(38, 14, 24, 16);
    c.fillRect(36, 46, 28, 7);
    c.fillRect(36, 62, 20, 7);
  },
  timer(c) {
    c.lineWidth = 9;
    c.beginPath();
    c.arc(50, 56, 28, 0, TAU);
    c.stroke();
    c.fillRect(42, 14, 16, 9);
    c.fillRect(46, 38, 8, 22);
    c.fillRect(46, 54, 18, 8);
  },
  star(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 16 : 38;
      const a = -Math.PI / 2 + (i * TAU) / 10;
      c.lineTo(50 + Math.cos(a) * r, 54 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  },
  globe(c) {
    c.lineWidth = 7;
    c.beginPath();
    c.arc(50, 50, 32, 0, TAU);
    c.stroke();
    c.beginPath();
    c.ellipse(50, 50, 13, 32, 0, 0, TAU);
    c.stroke();
    c.fillRect(18, 46, 64, 7);
  },
  eye(c) {
    c.beginPath();
    c.moveTo(12, 50);
    c.quadraticCurveTo(50, 12, 88, 50);
    c.quadraticCurveTo(50, 88, 12, 50);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(50, 50, 15, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.beginPath();
    c.arc(50, 50, 8, 0, TAU);
    c.fill();
  },
  cup(c) {
    c.beginPath();
    c.moveTo(20, 34);
    c.lineTo(70, 34);
    c.lineTo(64, 80);
    c.lineTo(26, 80);
    c.closePath();
    c.fill();
    c.lineWidth = 8;
    c.beginPath();
    c.arc(72, 52, 11, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    c.lineWidth = 5;
    for (const x of [34, 46, 58]) {
      c.beginPath();
      c.moveTo(x, 26);
      c.quadraticCurveTo(x - 6, 18, x, 10);
      c.stroke();
    }
  },
  keys(c) {
    c.lineWidth = 7;
    c.beginPath();
    c.roundRect(12, 28, 76, 46, 9);
    c.stroke();
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) c.fillRect(22 + i * 12, 38 + r * 12, 8, 7);
    c.fillRect(30, 62, 40, 6);
  },
  drop(c) {
    c.beginPath();
    c.moveTo(50, 10);
    c.bezierCurveTo(70, 40, 80, 52, 80, 64);
    c.arc(50, 64, 30, 0, Math.PI);
    c.bezierCurveTo(20, 52, 30, 40, 50, 10);
    c.fill();
  },
};

export const APPS = [
  { name: 'Skyline', glyph: 'cloud', tint: ['#5ac8fa', '#2f7bf5'] },
  { name: 'Tuneful', glyph: 'note', tint: ['#ff6b9a', '#d6246e'] },
  { name: 'Zapper', glyph: 'bolt', tint: ['#ffd24a', '#f59e0b'] },
  { name: 'Chatter', glyph: 'bubble', tint: ['#6ee7b7', '#10b981'] },
  { name: 'Clippy Jar', glyph: 'clip', tint: ['#c4b5fd', '#7c3aed'] },
  { name: 'Pomo', glyph: 'timer', tint: ['#fb923c', '#ea580c'] },
  { name: 'Starling', glyph: 'star', tint: ['#fde68a', '#eab308'] },
  { name: 'Wanderer', glyph: 'globe', tint: ['#67e8f9', '#0891b2'] },
  { name: 'Peek', glyph: 'eye', tint: ['#a5b4fc', '#4f46e5'] },
  { name: 'Brew', glyph: 'cup', tint: ['#d6a77a', '#92400e'] },
  { name: 'Keycaps', glyph: 'keys', tint: ['#cbd5e1', '#475569'] },
  { name: 'Drizzle', glyph: 'drop', tint: ['#93c5fd', '#1d4ed8'] },
];

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  draw(c, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const cache = new Map();

/** Monochrome menu bar glyph. */
export function menuTexture(app) {
  const key = 'm:' + app.glyph;
  if (!cache.has(key)) {
    cache.set(
      key,
      canvasTexture(128, (c) => {
        c.scale(1.28, 1.28);
        c.fillStyle = c.strokeStyle = '#ffffff';
        GLYPHS[app.glyph](c);
      })
    );
  }
  return cache.get(key);
}

/** Colourful rounded app tile. */
export function tileTexture(app) {
  const key = 't:' + app.glyph;
  if (!cache.has(key)) {
    cache.set(
      key,
      canvasTexture(256, (c) => {
        const g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, app.tint[0]);
        g.addColorStop(1, app.tint[1]);
        c.fillStyle = g;
        c.beginPath();
        c.roundRect(14, 14, 228, 228, 54);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.beginPath();
        c.roundRect(14, 14, 228, 110, [54, 54, 20, 20]);
        c.fill();
        c.translate(58, 58);
        c.scale(1.4, 1.4);
        c.fillStyle = c.strokeStyle = '#ffffff';
        c.shadowColor = 'rgba(0,0,0,0.25)';
        c.shadowBlur = 6;
        GLYPHS[app.glyph](c);
      })
    );
  }
  return cache.get(key);
}

/** A canvas-backed texture you can redraw (clock, badge). Call texture.needsUpdate after drawing. */
export function labelCanvas(width, height) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas: cv, ctx: cv.getContext('2d'), texture: tex };
}
