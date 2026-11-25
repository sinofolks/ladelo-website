// Eye-break demo: the screen frosts over, the firefighter (seen from behind)
// hoses it down while you look away for 20 seconds. Point to aim the water.
import * as THREE from 'three';
import { Firefighter } from './firefighter.js';
import { Water } from './water.js';
import { labelCanvas } from './icons.js';

const BREAK_SECONDS = 20;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uSharp;
  uniform sampler2D uBlur;
  uniform sampler2D uMask;
  uniform sampler2D uWet;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec4 sharp = texture2D(uSharp, vUv);
    vec4 blur = texture2D(uBlur, vUv);
    float frost = texture2D(uMask, vUv).a;
    float wet = texture2D(uWet, vUv).a;
    float grain = hash(floor(vUv * vec2(420.0, 260.0)) + floor(uTime * 2.0)) * 0.06;
    vec3 frosted = blur.rgb * 0.7 + vec3(0.62, 0.68, 0.78) * 0.42 + grain;
    vec3 col = mix(sharp.rgb, frosted, frost);
    // fresh water leaves a bright, slightly refracted sheen
    vec3 sheen = texture2D(uSharp, vUv + vec2(0.0, wet * 0.006)).rgb;
    col = mix(col, sheen + 0.10, wet * 0.6 * (1.0 - frost));
    gl_FragColor = vec4(col, sharp.a);
    #include <colorspace_fragment>
  }
`;

function drawWork(c, w, h) {
  // A made-up document/code window on a calm wallpaper.
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
  // sidebar
  r(6 * u, 11.5 * u, 18 * u, 47.5 * u, 0, '#ece7de');
  for (let i = 0; i < 7; i++) r(8 * u, (14 + i * 4.6) * u, (9 + ((i * 37) % 6)) * u, 1.6 * u, 0.8 * u, i === 1 ? '#e5322d' : '#c9c2b5');
  // text lines
  const cols = ['#2b2f3a', '#2b2f3a', '#7a8090', '#2b2f3a', '#e5322d', '#2b2f3a', '#7a8090', '#2b2f3a', '#2b2f3a', '#7a8090'];
  r(28 * u, 15 * u, 34 * u, 3 * u, 1 * u, '#1b1f2a');
  for (let i = 0; i < 10; i++) {
    const len = [58, 52, 61, 40, 55, 60, 33, 57, 49, 26][i];
    r(28 * u, (22 + i * 3.5) * u, len * u, 1.5 * u, 0.75 * u, cols[i]);
  }
  // chart card
  r(66 * u, 15 * u, 24 * u, 16 * u, 1.5 * u, '#fff');
  const bars = [6, 9, 5, 11, 8, 12];
  bars.forEach((b, i) => r((68.5 + i * 3.4) * u, (29 - b) * u, 2.2 * u, b * u, 0.5 * u, i === 5 ? '#e5322d' : '#9fb3d9'));
}

export function initWash(container, ui) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'wash-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 10000);
  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x302020, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-300, 500, 900);
  scene.add(key);
  const back = new THREE.DirectionalLight(0x9fd8ff, 1.2);
  back.position.set(0, 300, -400);
  scene.add(back);

  const sharp = labelCanvas(16, 16);
  const blur = labelCanvas(16, 16);
  const mask = labelCanvas(320, 200);
  const wet = labelCanvas(320, 200);

  const screenMat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uSharp: { value: sharp.texture },
      uBlur: { value: blur.texture },
      uMask: { value: mask.texture },
      uWet: { value: wet.texture },
      uTime: { value: 0 },
    },
    transparent: true,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  scene.add(screen);

  const ff = new Firefighter();
  ff.root.rotation.y = Math.PI; // back to us, facing the screen
  ff.root.visible = false;
  scene.add(ff.root);
  const water = new Water(scene, { max: 1400, gravity: -900, color: 0x3fa9ff, additive: false });

  let W = 1, H = 1, S = 100, sw = 1, sh = 1, rise = 0;
  function layout() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const D = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, D);
    camera.near = D / 10;
    camera.far = D * 4;
    camera.updateProjectionMatrix();
    water.setScale(D * renderer.getPixelRatio());
    sw = W;
    sh = H;
    screen.scale.set(sw, sh, 1);
    S = H * 0.36;
    ff.root.scale.setScalar(S);

    const dpr = Math.min(devicePixelRatio, 2);
    for (const cv of [sharp, blur]) {
      cv.canvas.width = Math.round(W * dpr);
      cv.canvas.height = Math.round(H * dpr);
    }
    drawWork(sharp.ctx, sharp.canvas.width, sharp.canvas.height);
    // Cheap, portable blur: draw tiny, scale back up.
    const tiny = document.createElement('canvas');
    tiny.width = Math.max(8, Math.round(sharp.canvas.width / 18));
    tiny.height = Math.max(8, Math.round(sharp.canvas.height / 18));
    const tc = tiny.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(sharp.canvas, 0, 0, tiny.width, tiny.height);
    blur.ctx.imageSmoothingQuality = 'high';
    blur.ctx.drawImage(tiny, 0, 0, blur.canvas.width, blur.canvas.height);
    sharp.texture.needsUpdate = true;
    blur.texture.needsUpdate = true;
  }

  // ---------- Masks ----------
  const MW = 320, MH = 200;
  function frostAll(alpha) {
    const c = mask.ctx;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.fillRect(0, 0, MW, MH);
    mask.texture.needsUpdate = true;
  }
  function clearMask(alpha) {
    const c = mask.ctx;
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = `rgba(0,0,0,${alpha})`;
    c.fillRect(0, 0, MW, MH);
    c.globalCompositeOperation = 'source-over';
    mask.texture.needsUpdate = true;
  }
  function dab(u, v, r, strength = 1) {
    const x = u * MW, y = (1 - v) * MH;
    const c = mask.ctx;
    c.globalCompositeOperation = 'destination-out';
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.9 * strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
    const w = wet.ctx;
    const g2 = w.createRadialGradient(x, y, 0, x, y, r * 0.8);
    g2.addColorStop(0, `rgba(255,255,255,${0.5 * strength})`);
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    w.fillStyle = g2;
    w.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const drips = [];

  // ---------- Break state ----------
  let state = 'idle'; // idle | break | ending
  let t0 = 0;
  let frost = 0;
  let clock = 0;
  const aim = { x: 0, y: 0, user: false, lastMove: -10 };

  function start() {
    if (state !== 'idle') return;
    state = 'break';
    t0 = clock;
    frost = 0;
    ff.root.visible = !reduced;
    rise = 0;
    ui.state?.('break', BREAK_SECONDS);
  }
  function stop() {
    if (state !== 'break') return;
    state = 'ending';
    t0 = clock;
    ui.state?.('ending');
  }

  // ---------- Pointer ----------
  function toScreenPoint(e) {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - r.left - W / 2, y: H / 2 - (e.clientY - r.top) };
  }
  renderer.domElement.addEventListener('pointermove', (e) => {
    const p = toScreenPoint(e);
    aim.x = p.x;
    aim.y = p.y;
    aim.user = true;
    aim.lastMove = clock;
  });
  renderer.domElement.addEventListener('pointerleave', () => (aim.user = false));
  renderer.domElement.addEventListener('pointerdown', (e) => {
    const p = toScreenPoint(e);
    aim.x = p.x;
    aim.y = p.y;
    aim.user = true;
    aim.lastMove = clock;
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state === 'break') stop();
  });

  // ---------- Loop ----------
  let running = false;
  let last = performance.now();
  const nozzle = new THREE.Vector3();
  const target = new THREE.Vector3();
  let sprayAcc = 0;
  let lastSecond = -1;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    screenMat.uniforms.uTime.value = clock;

    // Wet sheen dries out
    wet.ctx.globalCompositeOperation = 'destination-out';
    wet.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 1.2)})`;
    wet.ctx.fillRect(0, 0, MW, MH);
    wet.ctx.globalCompositeOperation = 'source-over';

    const elapsed = clock - t0;
    if (state === 'break') {
      if (frost < 1) {
        const add = Math.min(1 - frost, dt / 0.9);
        frost += add;
        frostAll(add * 1.2);
      } else {
        frostAll(dt * 0.05); // it slowly fogs back up
      }
      const left = Math.max(0, Math.ceil(BREAK_SECONDS - elapsed));
      if (left !== lastSecond) {
        lastSecond = left;
        ui.tick?.(left);
      }
      if (elapsed >= BREAK_SECONDS) stop();
    } else if (state === 'ending') {
      clearMask(dt * 1.6);
      if (elapsed > 1.4) {
        state = 'idle';
        clearMask(1);
        ui.state?.('idle');
      }
    }

    // Firefighter rises from the bottom edge and sprays
    const active = state === 'break' && !reduced;
    rise += ((active ? 1 : 0) - rise) * (1 - Math.exp(-dt * (active ? 5 : 7)));
    ff.root.visible = rise > 0.02;
    if (ff.root.visible) {
      const baseY = -H * 0.46 - (1 - rise) * S * 1.2;
      ff.root.position.set(W * 0.3, baseY, H * 0.3);

      // Aim: follow the pointer, or sweep on his own
      let ax, ay;
      if (aim.user && clock - aim.lastMove < 2.5) {
        ax = aim.x;
        ay = aim.y;
      } else {
        const s = clock * 0.9;
        ax = Math.sin(s * 1.3) * sw * 0.42;
        ay = Math.sin(s * 0.7 + 1) * sh * 0.32 + sh * 0.02;
      }
      target.set(ax, ay, 0);
      const dx = ax - ff.root.position.x;
      const dz = ff.root.position.z;
      ff.root.rotation.y = Math.PI - Math.atan2(dx, dz) * 0.9;
      const pitch = Math.atan2(ay - (baseY + S * 0.6), dz) + 0.25;
      ff.spray(THREE.MathUtils.clamp(pitch, -0.2, 1.1), clock);

      if (active && frost > 0.6) {
        sprayAcc += dt;
        while (sprayAcc > 1 / 60) {
          sprayAcc -= 1 / 60;
          ff.root.updateMatrixWorld(true);
          ff.nozzleTip.getWorldPosition(nozzle);
          water.shoot(nozzle, target, { count: 3, time: 0.38, spread: Math.min(W, H) * 0.05, size: Math.max(9, H * 0.024) });
        }
      }
    }

    water.update(dt, (p) => {
      const u = p.x / sw + 0.5;
      const v = p.y / sh + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      dab(u, v, 9 + Math.random() * 6);
      if (Math.random() < 0.05) drips.push({ u, v, speed: 0.05 + Math.random() * 0.08, life: 1 + Math.random() });
      if (Math.random() < 0.3) water.splash({ x: p.x, y: p.y, z: 4 }, { count: 2, size: Math.max(3, H * 0.008), speed: 120 });
    });
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      d.v -= d.speed * dt;
      d.life -= dt;
      dab(d.u, d.v, 3.5, 0.8);
      if (d.life <= 0 || d.v < 0) drips.splice(i, 1);
    }
    mask.texture.needsUpdate = true;
    wet.texture.needsUpdate = true;
    renderer.render(scene, camera);
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

  return { start, stop };
}
