// Eye-break demo, following the app's BreakShow.swift:
//   he hops in and faces you, raises the hose and washes the screen in zig-zag rows (7.5 s)
//   while it frosts over: he and the stream are "outside the window", behind the frosted glass;
//   drops that hit the glass hang on it in front and slide down. Then a card asks you to look
//   away for 20 seconds (no water over the card), and he squeegees the glass clean row by row.
// Layers (back to front): desktop + firefighter + stream | frosted glass | glass drops | squeegee | card.
import * as THREE from 'three';
import { Firefighter } from './firefighter.js';
import { loadFirefighter, ModelFirefighter } from './model.js';
import { WaterSim, WaterLayer } from './appwater.js';
import { labelCanvas } from './icons.js';

const VW = 1024; // the demo is a Mac screen this many points wide
const REST = 20;
const WASH_DURATION = 7.5;
const WASH_ROWS = [0.07, 0.22, 0.37, 0.52, 0.67];
const WIPE_ROWS = 5;
const BIG = 182; // his height in points while washing (bigScale 2.4 × 76)
const WIPE = 114; // while squeegeeing (wipeScale 1.5 × 76)
const CARD = { w: 360, h: 300, cy: 0.42 };

const ease = {
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  back: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
};
const lerp = THREE.MathUtils.lerp;

function drawWork(c, w, h) {
  // A made-up document window on a calm wallpaper.
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#20305f');
  g.addColorStop(1, '#5b2a43');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const r = (x, y, ww, hh, rad, col) => {
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(x, y, ww, hh, rad);
    c.fill();
  };
  const u = w / 100;
  r(6 * u, 7 * u, 88 * u, 52 * u, 2 * u, '#f7f4ee');
  r(6 * u, 7 * u, 88 * u, 4.5 * u, [2 * u, 2 * u, 0, 0], '#e6e1d8');
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(9 * u + i * 2.4 * u, 9.25 * u, 0.8 * u, 0, Math.PI * 2);
    c.fill();
  });
  r(6 * u, 11.5 * u, 18 * u, 47.5 * u, 0, '#ece7de');
  for (let i = 0; i < 7; i++) r(8 * u, (14 + i * 4.6) * u, (9 + ((i * 37) % 6)) * u, 1.6 * u, 0.8 * u, i === 1 ? '#e5322d' : '#c9c2b5');
  const cols = ['#2b2f3a', '#2b2f3a', '#7a8090', '#2b2f3a', '#e5322d', '#2b2f3a', '#7a8090', '#2b2f3a', '#2b2f3a', '#7a8090'];
  r(28 * u, 15 * u, 34 * u, 3 * u, 1 * u, '#1b1f2a');
  for (let i = 0; i < 10; i++) {
    const len = [58, 52, 61, 40, 55, 60, 33, 57, 49, 26][i];
    r(28 * u, (22 + i * 3.5) * u, len * u, 1.5 * u, 0.75 * u, cols[i]);
  }
  r(66 * u, 15 * u, 24 * u, 16 * u, 1.5 * u, '#fff');
  [6, 9, 5, 11, 8, 12].forEach((b, i) => r((68.5 + i * 3.4) * u, (29 - b) * u, 2.2 * u, b * u, 0.5 * u, i === 5 ? '#e5322d' : '#9fb3d9'));
}

function makeRenderer(container, cls) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  r.domElement.className = cls;
  container.appendChild(r.domElement);
  return r;
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x302020, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-300, 500, 900);
  scene.add(key);
}

export function initWash(container) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startBtn = container.querySelector('#wash-start');
  const card = container.querySelector('.wash-card');
  const countEl = container.querySelector('#wash-count');
  const ring = container.querySelector('.ring-progress');
  const skipBtn = container.querySelector('#wash-skip');

  // Back: desktop, firefighter, stream
  const back = makeRenderer(container, 'wash-canvas wash-back');
  const frostEl = document.createElement('div');
  frostEl.className = 'wash-frost';
  container.appendChild(frostEl);
  // Front: drops stuck on the glass (and him, once he climbs in front to squeegee)
  const front = makeRenderer(container, 'wash-canvas wash-front');
  const fx = document.createElement('canvas');
  fx.className = 'wash-canvas wash-fx';
  container.appendChild(fx);
  const fxc = fx.getContext('2d');
  // overlay (button + card) stays on top
  container.appendChild(container.querySelector('.wash-overlay'));

  const camera = new THREE.PerspectiveCamera(30, 1, 10, 10000);
  const backScene = new THREE.Scene();
  const frontScene = new THREE.Scene();
  lights(backScene);
  lights(frontScene);

  const sharp = labelCanvas(16, 16);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: sharp.texture, toneMapped: false })
  );
  backScene.add(screen);

  let ff = new Firefighter();
  ff.root.visible = false;
  let ffScene = backScene;
  backScene.add(ff.root);
  loadFirefighter().then((gltf) => {
    if (!gltf) return;
    const m = new ModelFirefighter(gltf);
    m.root.visible = ff.root.visible;
    m.root.position.copy(ff.root.position);
    m.root.rotation.copy(ff.root.rotation);
    m.root.scale.copy(ff.root.scale);
    ffScene.remove(ff.root);
    ffScene.add(m.root);
    ff = m;
  });
  function moveFF(scene) {
    if (scene === ffScene) return;
    ffScene.remove(ff.root);
    scene.add(ff.root);
    ffScene = scene;
  }

  const sim = new WaterSim();
  if (import.meta.env.DEV) window.__wash = { sim, get ff() { return ff; }, get backWater() { return backWater; }, get back() { return back; } };
  const backWater = new WaterLayer(back);
  const frontWater = new WaterLayer(front);

  // ---------- Layout ----------
  let W = 1, H = 1, k = 1, PH = 1;
  function layout() {
    const r = container.getBoundingClientRect();
    if (r.width < 50) return;
    W = Math.round(r.width);
    H = Math.round(r.height);
    k = W / VW;
    PH = H / k;
    for (const rr of [back, front]) rr.setSize(W, H, false);
    camera.aspect = W / H;
    const D = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, D);
    camera.near = D / 10;
    camera.far = D * 4;
    camera.updateProjectionMatrix();
    screen.scale.set(W, H, 1);
    screen.position.z = -40;
    const dpr = Math.min(devicePixelRatio, 2);
    sharp.canvas.width = Math.round(W * dpr);
    sharp.canvas.height = Math.round(H * dpr);
    sharp.texture.dispose();
    drawWork(sharp.ctx, sharp.canvas.width, sharp.canvas.height);
    sharp.texture.needsUpdate = true;
    fx.width = Math.round(W * dpr);
    fx.height = Math.round(H * dpr);
    card.style.top = `${CARD.cy * 100}%`;
  }

  // points (y down) <-> world
  const world = (x, y, z = 0, out = new THREE.Vector3()) => out.set(x * k - W / 2, H / 2 - y * k, z);
  const toPoints = (v) => {
    const p = v.clone().project(camera);
    return { x: (((p.x + 1) / 2) * W) / k, y: (((1 - p.y) / 2) * H) / k };
  };

  // ---------- State shared with the frame loop ----------
  const st = {
    active: false,
    spray: null, // {x, y, power} points
    frost: 0,
    clearAbove: 0,
    clearBand: null, // {x0, x1, y0, y1} points
    squeegee: null, // {hand, blade, length} points
    card: 0,
  };
  let skipped = false;
  let running = false;
  let clock = 0;

  const tweens = new Set();
  const tween = (duration, fn, skippable = false) =>
    new Promise((resolve) => {
      const tw = { start: clock, duration, fn, resolve, skippable };
      tweens.add(tw);
      fn(0);
    });
  const sleep = (s) => tween(s, () => {});

  // feet at (x, y) points, height h points
  function place(x, y, h) {
    world(x, y, 0, ff.root.position);
    ff.root.scale.setScalar((h * k) / 1.1);
  }

  const v3 = new THREE.Vector3();
  function nozzlePoints() {
    ff.root.updateMatrixWorld(true);
    ff.nozzleTip.getWorldPosition(v3);
    return toPoints(v3);
  }
  /** Turn toward a point on the glass; returns how far to tilt the hose up. */
  function aim(tx, ty, fx0, fy0) {
    const dx = tx - fx0;
    const up = fy0 - BIG * 0.45 - ty;
    const turn = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(up, 20) * 1.35 + 20) * 1.2, -1.2, 1.2);
    const pitch = THREE.MathUtils.clamp(Math.atan2(up, Math.abs(dx) * 0.5 + 120), 0, 1.2);
    return { turn, pitch };
  }

  function washPoint(p) {
    const pts = [];
    WASH_ROWS.forEach((r, i) => {
      const y = PH * r;
      const a = { x: VW * 0.05, y }, b = { x: VW * 0.95, y };
      pts.push(...(i % 2 === 0 ? [a, b] : [b, a]));
    });
    const lens = [];
    for (let i = 1; i < pts.length; i++) lens.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    let d = Math.min(Math.max(p, 0), 1) * lens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const q = lens[i] > 0 ? Math.min(d / lens[i], 1) : 0;
        return { x: lerp(pts[i].x, pts[i + 1].x, q), y: lerp(pts[i].y, pts[i + 1].y, q) };
      }
      d -= lens[i];
    }
    return pts[pts.length - 1];
  }

  // ---------- The show ----------
  async function run() {
    if (st.active) return;
    st.active = true;
    skipped = false;
    startBtn.hidden = true;
    const landX = VW / 2, landY = PH;

    if (!reduced) {
      // 1. hop in from below and land facing you
      moveFF(backScene);
      ff.root.visible = true;
      ff.root.rotation.set(0, 0, 0);
      await tween(0.6, (p) => {
        place(landX, landY + BIG * (1 - ease.out(p)) - Math.sin(p * Math.PI) * 40, BIG);
        ff.crouch(1 - p);
      });
      // 2. raise the hose
      await tween(0.45, (p) => ff.spray(0.3 * p, clock));

      // 3. wash the screen in zig-zag rows while it frosts over
      let turn = 0;
      const t0 = clock;
      await tween(
        WASH_DURATION,
        (p) => {
          const t = washPoint(p);
          const a = aim(t.x, t.y, landX, landY);
          turn += (a.turn - turn) * 0.12;
          ff.spray(a.pitch, clock);
          ff.root.rotation.y = turn;
          const ramp = Math.min(1, p / 0.03, (1 - p) / 0.03);
          st.spray = { x: t.x, y: t.y, power: ramp * (0.85 + 0.15 * Math.sin((clock - t0) * 30)) };
          st.frost = ease.inOut(Math.min(1, p * 1.15));
        },
        true
      );
      st.spray = null;
      // 4. hose off, turn back to you; the card pops up
      const turnEnd = ff.root.rotation.y, frostEnd = st.frost;
      await tween(0.45, (p) => {
        ff.spray(0.3, clock);
        ff.root.rotation.y = turnEnd * (1 - ease.inOut(p));
        st.frost = lerp(frostEnd, 1, p);
        st.card = ease.back(p);
      });
    } else {
      st.frost = 1;
      st.card = 1;
    }

    // 5. count down 20 s (skip goes straight to wiping)
    for (let left = REST; left > 0 && !skipped; left--) {
      countEl.textContent = String(left);
      ring.style.strokeDashoffset = String(1 - left / REST);
      for (let i = 0; i < 10 && !skipped; i++) await sleep(0.1);
    }
    await tween(0.25, (p) => (st.card = 1 - p));
    st.card = 0;

    if (!reduced) {
      // 6. squeegee the glass clean, row by row; he's in front of the glass now
      moveFF(frontScene);
      const bandH = PH / WIPE_ROWS;
      const lead = 46;
      const placeAtBlade = (bx, yc, dir, bob = 0) => {
        const hand = { x: bx - dir * lead, y: yc + bob };
        ff.reach(1);
        ff.root.rotation.y = dir > 0 ? 0.9 : -0.9;
        // put him where his raised hand lands on `hand`
        place(hand.x, hand.y + WIPE, WIPE);
        ff.root.updateMatrixWorld(true);
        ff.handL.getWorldPosition(v3);
        const hp = toPoints(v3);
        place(hand.x + (hand.x - hp.x), hand.y + WIPE + (hand.y - hp.y), WIPE);
        st.squeegee = { hand, blade: { x: bx, y: yc + bob }, length: bandH * 0.92 };
      };
      const p0 = ff.root.position.clone();
      const s0 = ff.root.scale.x;
      // jump up to the top-left corner
      await tween(0.5, (p) => {
        placeAtBlade(0, bandH / 2, 1);
        const target = ff.root.position.clone();
        const ts = ff.root.scale.x;
        const q = ease.inOut(p);
        ff.root.position.lerpVectors(p0, target, q);
        ff.root.position.y += Math.sin(p * Math.PI) * 80 * k;
        ff.root.scale.setScalar(lerp(s0, ts, q));
        if (p < 1) st.squeegee = null;
      });
      for (let row = 0; row < WIPE_ROWS; row++) {
        const dir = row % 2 === 0 ? 1 : -1;
        const yc = bandH * (row + 0.5);
        const from = dir > 0 ? 0 : VW, to = dir > 0 ? VW : 0;
        const rs = clock;
        await tween(0.62, (p) => {
          const bx = lerp(from, to, ease.inOut(p));
          const bob = Math.sin((clock - rs) * 14) * 3;
          placeAtBlade(bx, yc, dir, bob);
          st.clearBand = { x0: Math.min(from, bx), x1: Math.max(from, bx), y0: yc - bandH / 2, y1: yc + bandH / 2 };
        });
        st.clearAbove = bandH * (row + 1);
        st.clearBand = null;
        if (row + 1 >= WIPE_ROWS) break;
        const ny = bandH * (row + 1.5);
        await tween(0.18, (p) => placeAtBlade(to, lerp(yc, ny, ease.inOut(p)), -dir));
      }
      st.frost = 0;
      st.squeegee = null;
      // 7. hop away
      const q0 = ff.root.position.clone();
      const s1 = ff.root.scale.x;
      await tween(0.7, (p) => {
        ff.crouch(0.5);
        ff.root.position.set(lerp(q0.x, 0, p), lerp(q0.y, -H, ease.inOut(p)) + Math.sin(p * Math.PI) * 60 * k, 0);
        ff.root.scale.setScalar(s1 * (1 - 0.6 * p));
      });
      ff.root.visible = false;
    } else {
      await tween(0.4, (p) => (st.frost = 1 - p));
    }
    st.frost = 0;
    st.clearAbove = 0;
    st.clearBand = null;
    st.active = false;
    startBtn.hidden = false;
  }

  function skip() {
    if (st.active) skipped = true;
  }
  startBtn.addEventListener('click', run);
  skipBtn.addEventListener('click', skip);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') skip();
  });

  // ---------- Frost: a CSS backdrop blur over the back canvas, like the app's NSVisualEffectView ----------
  function updateFrost() {
    frostEl.style.opacity = String(st.frost);
    if (st.frost <= 0.001) return;
    const top = st.clearAbove * k;
    const b = st.clearBand;
    let poly;
    if (b) {
      const y0 = b.y0 * k, y1 = b.y1 * k;
      if (b.x0 <= 0.5) {
        const bx = b.x1 * k;
        poly = [[bx, y0], [W, y0], [W, H], [0, H], [0, y1], [bx, y1]];
      } else {
        const bx = b.x0 * k;
        poly = [[0, y0], [bx, y0], [bx, y1], [W, y1], [W, H], [0, H]];
      }
    } else {
      poly = [[0, top], [W, top], [W, H], [0, H]];
    }
    frostEl.style.clipPath = `polygon(${poly.map(([x, y]) => `${x}px ${y}px`).join(',')})`;
  }

  // The squeegee in his hand (Squeegee in BreakShow.swift)
  function drawSqueegee() {
    const dpr = fx.width / W;
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxc.clearRect(0, 0, W, H);
    const sq = st.squeegee;
    if (!sq) return;
    fxc.scale(k, k);
    const { hand, blade, length } = sq;
    const dir = blade.x >= hand.x ? 1 : -1;
    fxc.save();
    fxc.shadowColor = 'rgba(0,0,0,0.35)';
    fxc.shadowBlur = 5;
    fxc.shadowOffsetY = 3;
    fxc.strokeStyle = 'rgb(219,56,51)';
    fxc.lineWidth = 7;
    fxc.lineCap = 'round';
    fxc.beginPath();
    fxc.moveTo(hand.x, hand.y);
    fxc.lineTo(blade.x - dir * 6, blade.y);
    fxc.stroke();
    fxc.fillStyle = 'rgb(51,51,51)';
    fxc.beginPath();
    fxc.arc(hand.x, hand.y, 6, 0, Math.PI * 2);
    fxc.fill();
    const mx = blade.x - dir * 7 - 5;
    const mg = fxc.createLinearGradient(mx, 0, mx + 10, 0);
    mg.addColorStop(0, 'rgb(242,242,242)');
    mg.addColorStop(1, 'rgb(153,153,153)');
    fxc.fillStyle = mg;
    fxc.beginPath();
    fxc.roundRect(mx, blade.y - length / 2, 10, length, 4);
    fxc.fill();
    fxc.fillStyle = 'rgb(26,26,26)';
    fxc.beginPath();
    fxc.roundRect(blade.x - 3, blade.y - length / 2 + 2, 6, length - 4, 3);
    fxc.fill();
    fxc.restore();
    const wx = dir > 0 ? blade.x + 3 : blade.x - 15;
    const wg = fxc.createLinearGradient(wx, 0, wx + 12, 0);
    wg.addColorStop(0, `rgba(140,209,255,${dir > 0 ? 0.6 : 0})`);
    wg.addColorStop(1, `rgba(140,209,255,${dir > 0 ? 0 : 0.6})`);
    fxc.fillStyle = wg;
    fxc.beginPath();
    fxc.roundRect(wx, blade.y - length / 2, 12, length, 6);
    fxc.fill();
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    for (const tw of [...tweens]) {
      const p = Math.min(1, (clock - tw.start) / tw.duration);
      tw.fn(p);
      if (p >= 1 || (tw.skippable && skipped)) {
        tweens.delete(tw);
        tw.resolve();
      }
    }

    if (st.spray && st.spray.power > 0 && ff.root.visible) {
      sim.emit(nozzlePoints(), null, st.spray, st.spray.power, true, dt);
    }
    const band = st.clearBand;
    if (!sim.isEmpty) {
      sim.step(dt, VW, PH, (p) => p.y < st.clearAbove || (band && p.x >= band.x0 && p.x <= band.x1 && p.y >= band.y0 && p.y <= band.y1));
    }

    // the card: the app's 360×300 card, scaled to this screen; no water drawn over it
    card.hidden = st.card <= 0.001;
    if (!card.hidden) {
      card.style.transform = `translate(-50%, -50%) scale(${k * Math.max(0.001, st.card)})`;
      card.style.opacity = String(Math.min(1, st.card * 1.5));
    }
    const dry =
      st.card > 0.001
        ? { x0: 0.5 - CARD.w / 2 / VW, y0: CARD.cy - CARD.h / 2 / PH, x1: 0.5 + CARD.w / 2 / VW, y1: CARD.cy + CARD.h / 2 / PH }
        : null;

    const size = { x: VW, y: PH };
    back.render(backScene, camera);
    backWater.render(sim.particles, { size, mode: 1, dry });
    front.render(frontScene, camera);
    frontWater.render(sim.particles, { size, mode: 2, dry });
    updateFrost();
    drawSqueegee();
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  layout();
  new ResizeObserver(layout).observe(container);
  new IntersectionObserver(([e]) => setRunning(e.isIntersecting)).observe(container);
  return { start: run, stop: skip };
}
