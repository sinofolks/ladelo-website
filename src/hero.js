// The hero: a Mac desktop whose crowded menu bar gets tidied by the firefighter.
// Click the helmet to drop the ladder; click an app on the ladder to bring it back.
// World units are CSS pixels, origin at the canvas centre, y up.
import * as THREE from 'three';
import { Firefighter, makeHelmet } from './firefighter.js';
import { APPS, menuTexture, tileTexture, labelCanvas } from './icons.js';
import { Water } from './water.js';

const ease = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
};

export function initHero(container, ui) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.prepend(renderer.domElement);
  renderer.domElement.className = 'hero-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 10, 10000);
  const stage = new THREE.Group();
  scene.add(stage);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a1a1a, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-400, 700, 900);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6a4a, 1.6);
  rim.position.set(600, 200, -500);
  scene.add(rim);

  // ---------- Desktop (wallpaper + menu bar drawn on one canvas) ----------
  const desk = labelCanvas(16, 16);
  const deskMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: desk.texture, transparent: true, toneMapped: false })
  );
  stage.add(deskMesh);

  // ---------- Helmet in the menu bar ----------
  const helmet = new THREE.Group();
  const helmetModel = makeHelmet();
  helmet.add(helmetModel);
  stage.add(helmet);
  const helmetHit = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  stage.add(helmetHit);

  const badge = labelCanvas(64, 64);
  const badgeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: badge.texture, transparent: true, toneMapped: false, depthTest: false })
  );
  badgeMesh.renderOrder = 5;
  stage.add(badgeMesh);

  // ---------- Ladder ----------
  const ladder = new THREE.Group();
  stage.add(ladder);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xe5322d, roughness: 0.35, metalness: 0.2 });
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe2, roughness: 0.3, metalness: 0.75 });
  const railGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
  const rails = [new THREE.Mesh(railGeo, railMat), new THREE.Mesh(railGeo, railMat)];
  rails.forEach((r) => ladder.add(r));
  let rungs = [];

  // ---------- Firefighter ----------
  const ff = new Firefighter();
  ff.root.visible = false;
  stage.add(ff.root);
  const shadowTex = (() => {
    const c = labelCanvas(64, 64);
    const g = c.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.ctx.fillStyle = g;
    c.ctx.fillRect(0, 0, 64, 64);
    c.texture.needsUpdate = true;
    return c.texture;
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.visible = false;
  stage.add(shadow);

  const water = new Water(stage);

  // ---------- Apps ----------
  const TUCK = new Set(['Tuneful', 'Clippy Jar', 'Starling', 'Wanderer', 'Peek', 'Brew', 'Keycaps', 'Drizzle']);
  const icons = APPS.map((app, order) => {
    const mat = new THREE.MeshBasicMaterial({ map: menuTexture(app), transparent: true, toneMapped: false, opacity: 0.95 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.userData.icon = true;
    stage.add(mesh);
    return {
      app, order, mesh, mat,
      where: 'bar', // bar | carried | flying | helmet | ladder
      wobble: 0, wobbleV: 0, pop: 1,
      tx: 0, ty: 0, // smoothed target (px) when on the bar
      slot: 0,
    };
  });

  // ---------- Layout ----------
  let W = 1, H = 1, L = {};
  const toWorld = (x, y, z = 0, out = new THREE.Vector3()) => out.set(x - W / 2, H / 2 - y, z);

  function layout() {
    const r = container.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return;
    W = Math.round(r.width);
    H = Math.round(r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const D = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, D);
    camera.near = D / 10;
    camera.far = D * 4;
    camera.updateProjectionMatrix();
    water.setScale(D * renderer.getPixelRatio());

    const mobile = W < 720;
    const m = mobile ? 10 : 24;
    L = {
      mobile,
      x0: m, y0: m, w: W - 2 * m, h: H - 2 * m,
      mb: mobile ? 30 : 40,
      icon: mobile ? 16 : 22,
      gap: mobile ? 29 : 42,
      S: mobile ? 58 : Math.round(THREE.MathUtils.clamp(H * 0.14, 84, 124)),
      tile: mobile ? 34 : 50,
      slot: mobile ? 48 : 68,
    };
    L.barY = L.y0 + L.mb / 2;
    measureMenu();
    L.helmetX = L.x0 + L.w - L.sysW - (mobile ? 22 : 34);
    L.ground = L.barY + 1.05 * L.S + 0.34 * L.S;
    L.firstIconX = L.helmetX - (mobile ? 32 : 48);
    L.maxIcons = Math.max(3, Math.floor((L.firstIconX - (L.x0 + L.leftW)) / L.gap) + 1);
    L.ladderMax = L.y0 + L.h - 26 - (L.y0 + L.mb);

    drawDesk();
    deskMesh.scale.set(W, H, 1);
    deskMesh.position.set(0, 0, -2);

    const hs = L.mb * 2.2;
    helmetModel.scale.setScalar(hs);
    helmet.rotation.x = 0.28;
    helmet.position.copy(toWorld(L.helmetX, L.barY + L.mb * 0.12, 8));
    helmetHit.scale.set(L.mb * 1.3, L.mb * 1.1, 1);
    helmetHit.position.copy(toWorld(L.helmetX, L.barY, 12));
    badgeMesh.scale.set(18, 18, 1);
    badgeMesh.position.copy(toWorld(L.helmetX + L.mb * 0.48, L.y0 + 6, 30));

    // Ladder: rails and as many rungs as could ever be needed
    const railW = mobile ? 4 : 5;
    const halfW = mobile ? 9 : 11;
    rails[0].scale.set(railW, 1, railW);
    rails[1].scale.set(railW, 1, railW);
    rails[0].position.x = -halfW;
    rails[1].position.x = halfW;
    rungs.forEach((r) => ladder.remove(r));
    rungs = [];
    const step = mobile ? 12 : 14;
    for (let y = step; y < L.ladderMax; y += step) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, halfW * 2, 8), rungMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.y = -y;
      rung.userData.y = y;
      ladder.add(rung);
      rungs.push(rung);
    }
    ladder.position.copy(toWorld(L.helmetX, L.y0 + L.mb - 2, 0));
    setLadderLength(ladderLen);

    ff.root.scale.setScalar(L.S);
    shadow.scale.set(L.S * 0.7, L.S * 0.18, 1);
    for (const ic of icons) ic.mesh.scale.setScalar(ic.where === 'ladder' ? L.tile : L.icon);
    snapBar();
    ui.layout?.(L, { helmetX: L.helmetX, barY: L.barY, W, H });
  }

  const menuFont = (w) => `${w} ${L.mobile ? 12 : 15}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`;
  const MENUS = ['Notes', 'File', 'Edit', 'Format', 'View', 'Window'];
  function clockText() {
    const now = new Date();
    return L.mobile
      ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          '  ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function measureMenu() {
    const c = desk.ctx;
    let x = 42;
    if (!L.mobile) {
      MENUS.forEach((t, i) => {
        c.font = menuFont(i === 0 ? 700 : 500);
        x += c.measureText(t).width + 18;
      });
    }
    L.leftW = x + 6;
    c.font = menuFont(500);
    L.sysW = 16 + c.measureText(clockText()).width + 18 + 26 + (L.mobile ? 0 : 30);
  }

  function drawDesk() {
    const dpr = Math.min(devicePixelRatio, 2);
    const cv = desk.canvas;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const c = desk.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const { x0, y0, w, h, mb } = L;
    const radius = L.mobile ? 18 : 22;
    c.save();
    c.beginPath();
    c.roundRect(x0, y0, w, h, radius);
    c.clip();
    // Wallpaper
    const g = c.createLinearGradient(x0, y0, x0 + w, y0 + h);
    g.addColorStop(0, '#1b2350');
    g.addColorStop(0.55, '#3a1f4d');
    g.addColorStop(1, '#7a2531');
    c.fillStyle = g;
    c.fillRect(x0, y0, w, h);
    const blob = (x, y, r, col) => {
      r = Math.max(1, r);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    blob(x0 + w * 0.82, y0 + h * 0.85, w * 0.45, 'rgba(255,90,60,0.38)');
    blob(x0 + w * 0.15, y0 + h * 0.2, w * 0.4, 'rgba(80,120,255,0.28)');
    blob(x0 + w * 0.5, y0 + h * 1.05, w * 0.35, 'rgba(255,190,120,0.18)');
    // Menu bar
    c.fillStyle = 'rgba(12,14,24,0.55)';
    c.fillRect(x0, y0, w, mb);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x0, y0 + mb - 1, w, 1);
    c.fillStyle = '#fff';
    c.textBaseline = 'middle';
    let x = x0 + 18;
    // A plain dot in place of a system logo
    c.beginPath();
    c.arc(x + 5, y0 + mb / 2, 5, 0, Math.PI * 2);
    c.fill();
    x += 24;
    if (!L.mobile) {
      MENUS.forEach((t, i) => {
        c.font = menuFont(i === 0 ? 700 : 500);
        c.fillText(t, x, y0 + mb / 2 + 1);
        x += c.measureText(t).width + 18;
      });
    }
    // System items on the right: wi-fi, battery, clock
    c.font = menuFont(500);
    const clock = clockText();
    c.textAlign = 'right';
    const right = x0 + w - 16;
    c.fillText(clock, right, y0 + mb / 2 + 1);
    let sx = right - c.measureText(clock).width - 18;
    c.textAlign = 'left';
    // battery
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(sx - 24, y0 + mb / 2 - 6, 22, 12, 3.5);
    c.stroke();
    c.fillRect(sx - 22, y0 + mb / 2 - 4, 15, 8);
    c.fillRect(sx - 1, y0 + mb / 2 - 2.5, 2, 5);
    sx -= 40;
    if (!L.mobile) {
      // wi-fi
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(sx, y0 + mb / 2 + 6, 3.5 + i * 4, -Math.PI * 0.75, -Math.PI * 0.25);
        c.stroke();
      }
    }
    c.restore();
    // Thin bezel highlight
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1, radius);
    c.stroke();
    desk.texture.needsUpdate = true;
  }

  function drawBadge(n) {
    const c = badge.ctx;
    c.clearRect(0, 0, 64, 64);
    if (n > 0) {
      c.fillStyle = '#ff3b30';
      c.beginPath();
      c.arc(32, 32, 30, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.font = '700 38px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(n), 32, 35);
    }
    badge.texture.needsUpdate = true;
  }

  // ---------- Bar bookkeeping ----------
  const barList = () => icons.filter((i) => i.where === 'bar').sort((a, b) => a.slot - b.slot || a.order - b.order);
  const helmetList = () => icons.filter((i) => i.where === 'helmet' || i.where === 'ladder');

  function retarget() {
    const list = barList();
    list.forEach((ic, idx) => {
      ic.tx = L.firstIconX - idx * L.gap;
      ic.ty = L.barY;
      ic.mesh.visible = idx < L.maxIcons;
    });
  }
  function snapBar() {
    retarget();
    for (const ic of barList()) {
      ic.mesh.position.copy(toWorld(ic.tx, ic.ty, 4));
    }
  }

  // ---------- Tiny tween runner ----------
  const tweens = new Set();
  let clock = 0;
  const speed = reduced ? 3 : 1;
  function tween(duration, fn) {
    return new Promise((resolve) => {
      const tw = { start: clock, duration: Math.max(0.0001, duration / speed), fn, resolve };
      tweens.add(tw);
      fn(0);
    });
  }
  const wait = (s) => tween(s, () => {});
  let pose = (t) => ff.idle(t);

  // ---------- Firefighter moves ----------
  const ffPx = { x: 0, y: 0 };
  function placeFF(x, y, z = 40) {
    ffPx.x = x;
    ffPx.y = y;
    toWorld(x, y, z, ff.root.position);
  }
  function setShadow(on, y = L.ground) {
    shadow.visible = on;
    if (on) toWorld(ffPx.x, y + 2, 1, shadow.position);
  }

  function face(dir) {
    // dir: -1 left, 1 right, 0 camera, 2 away
    const target = dir === 0 ? 0 : dir === 2 ? Math.PI : dir * 1.15;
    const from = ff.root.rotation.y;
    return tween(0.12, (k) => (ff.root.rotation.y = THREE.MathUtils.lerp(from, target, ease.out(k))));
  }

  async function walkTo(x) {
    const dx = x - ffPx.x;
    if (Math.abs(dx) < 2) return;
    await face(Math.sign(dx));
    const x0 = ffPx.x;
    const dur = Math.abs(dx) / (L.mobile ? 230 : 320);
    pose = () => {};
    await tween(dur, (k) => {
      placeFF(x0 + dx * k, L.ground);
      setShadow(true);
      ff.walk(k * dur * 13);
    });
    pose = (t) => ff.idle(t);
  }

  function helmetLid(open) {
    const from = helmetModel.rotation.x;
    const to = open ? -0.7 : 0;
    const yFrom = helmetModel.position.y;
    const yTo = open ? L.mb * 0.35 : 0;
    return tween(0.2, (k) => {
      helmetModel.rotation.x = THREE.MathUtils.lerp(from, to, ease.out(k));
      helmetModel.position.y = THREE.MathUtils.lerp(yFrom, yTo, ease.out(k));
    });
  }
  function bounceHelmet() {
    tween(0.35, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.18;
      helmet.scale.set(s, 1 / s, s);
    });
  }

  async function popOut() {
    await helmetLid(true);
    ff.root.visible = true;
    ff.root.rotation.y = 0;
    const sx = L.helmetX, sy = L.barY;
    const ex = L.helmetX - L.S * 0.9, ey = L.ground;
    pose = () => ff.crouch(0.6);
    await tween(0.55, (k) => {
      const e = ease.inOut(k);
      placeFF(THREE.MathUtils.lerp(sx, ex, e), THREE.MathUtils.lerp(sy, ey, e) - Math.sin(k * Math.PI) * L.S * 0.6);
      ff.root.scale.setScalar(L.S * THREE.MathUtils.lerp(0.25, 1, ease.out(k)));
    });
    setShadow(true);
    pose = (t) => ff.idle(t);
    helmetLid(false);
    await wait(0.1);
  }

  async function hopIn() {
    await face(0);
    pose = () => ff.crouch(1);
    await wait(0.12);
    helmetLid(true);
    const sx = ffPx.x, sy = ffPx.y;
    setShadow(false);
    pose = () => ff.reach(0.6);
    await tween(0.5, (k) => {
      const e = ease.inOut(k);
      placeFF(THREE.MathUtils.lerp(sx, L.helmetX, e), THREE.MathUtils.lerp(sy, L.barY, e) - Math.sin(k * Math.PI) * L.S * 0.8);
      ff.root.scale.setScalar(L.S * THREE.MathUtils.lerp(1, 0.2, ease.inOut(k)));
    });
    ff.root.visible = false;
    ff.root.scale.setScalar(L.S);
    await helmetLid(false);
    bounceHelmet();
    pose = (t) => ff.idle(t);
  }

  const handWorld = new THREE.Vector3();
  function handLocal() {
    ff.root.updateMatrixWorld(true);
    ff.handL.getWorldPosition(handWorld);
    return stage.worldToLocal(handWorld);
  }

  async function grab(ic) {
    await face(0);
    await tween(0.12, (k) => ff.crouch(k));
    const y0 = L.ground;
    let got = false;
    pose = () => {};
    await tween(0.5, (k) => {
      const up = Math.sin(k * Math.PI);
      placeFF(ffPx.x, y0 - up * 0.34 * L.S);
      ff.reach(up);
      shadow.scale.set(L.S * 0.7 * (1 - up * 0.4), L.S * 0.18 * (1 - up * 0.4), 1);
      if (!got && k > 0.48) {
        got = true;
        ic.where = 'carried';
        retarget();
      }
    });
    shadow.scale.set(L.S * 0.7, L.S * 0.18, 1);
    await tween(0.1, (k) => ff.crouch(1 - k));
    pose = (t) => ff.idle(t);
  }

  async function throwIn(ic) {
    await face(0);
    let thrown = false;
    pose = () => {};
    await tween(0.42, (k) => {
      ff.throwPose(k);
      if (!thrown && k > 0.55) {
        thrown = true;
        flyIntoHelmet(ic);
      }
    });
    pose = (t) => ff.idle(t);
  }

  function flyIntoHelmet(ic) {
    ic.where = 'flying';
    const from = ic.mesh.position.clone();
    const to = toWorld(L.helmetX, L.barY + 2, 20);
    const s0 = ic.mesh.scale.x;
    tween(0.5, (k) => {
      ic.mesh.position.lerpVectors(from, to, ease.inOut(k));
      ic.mesh.position.y += Math.sin(k * Math.PI) * L.S * 0.9;
      ic.mesh.rotation.z = k * Math.PI * 2;
      ic.mesh.scale.setScalar(s0 * (1 - 0.6 * k));
    }).then(() => {
      ic.where = 'helmet';
      ic.mesh.visible = false;
      ic.mesh.rotation.z = 0;
      drawBadge(helmetList().length);
      bounceHelmet();
    });
  }

  // ---------- Tidy show ----------
  let busy = false;
  let tidied = false;
  async function tidy() {
    if (busy) return;
    busy = true;
    ui.hint?.(null);
    const targets = barList().filter((ic) => TUCK.has(ic.app.name) && ic.mesh.visible);
    const plan = targets.slice(0, L.mobile ? 3 : 6);
    await popOut();
    for (const ic of plan) {
      await walkTo(ic.tx);
      await grab(ic);
      await walkTo(L.helmetX - L.S * 0.9);
      await throwIn(ic);
    }
    // Anything else on the tuck list that didn't fit goes in quietly.
    for (const ic of barList()) {
      if (TUCK.has(ic.app.name)) {
        ic.where = 'helmet';
        ic.mesh.visible = false;
      }
    }
    retarget();
    drawBadge(helmetList().length);
    await wait(0.25);
    await hopIn();
    busy = false;
    tidied = true;
    ui.hint?.('helmet');
  }

  function tidyInstantly() {
    for (const ic of icons) {
      if (TUCK.has(ic.app.name)) {
        ic.where = 'helmet';
        ic.mesh.visible = false;
      }
    }
    snapBar();
    drawBadge(helmetList().length);
    tidied = true;
    ui.hint?.('helmet');
  }

  // ---------- Ladder show ----------
  let ladderLen = 0;
  let ladderOpen = false;
  function setLadderLength(len) {
    ladderLen = len;
    rails.forEach((r) => (r.scale.y = Math.max(0.001, len)));
    rails.forEach((r) => (r.visible = len > 1));
    for (const r of rungs) r.visible = r.userData.y < len - 3;
  }

  function tileSlots(n) {
    const top = L.y0 + L.mb + (L.mobile ? 26 : 32);
    const off = L.tile / 2 + (L.mobile ? 16 : 20);
    let step = L.slot / 2;
    const room = L.ladderMax - 40;
    if (n * step > room) step = room / n;
    return Array.from({ length: n }, (_, i) => ({
      x: L.helmetX + (i % 2 === 0 ? -off : off),
      y: top + i * step,
      side: i % 2 === 0 ? -1 : 1,
    }));
  }

  async function openLadder() {
    if (busy || ladderOpen) return;
    const list = helmetList().sort((a, b) => a.order - b.order);
    if (!list.length) {
      ui.hint?.('empty');
      bounceHelmet();
      return;
    }
    busy = true;
    ladderOpen = true;
    ui.hint?.(null);
    ui.state?.('open');
    const slots = tileSlots(list.length);
    const len = slots[slots.length - 1].y - (L.y0 + L.mb) + L.tile * 0.9;
    await helmetLid(true);
    await tween(0.45, (k) => setLadderLength(len * ease.out(k)));

    list.forEach((ic, i) => {
      ic.where = 'ladder';
      ic.mat.map = tileTexture(ic.app);
      ic.mat.opacity = 1;
      ic.mat.needsUpdate = true;
      ic.mesh.visible = true;
      ic.mesh.rotation.z = 0;
      ic.slotPos = slots[i];
      ic.pop = 0;
      ic.mesh.scale.setScalar(0.001);
      ic.mesh.position.copy(toWorld(slots[i].x, slots[i].y, 10));
    });

    // Slide down, apps pop out as he passes them
    ff.root.visible = true;
    ff.root.rotation.y = 0;
    ff.root.scale.setScalar(L.S);
    setShadow(false);
    pose = () => ff.sit();
    const topY = L.y0 + L.mb + L.S * 0.1;
    const bottomY = L.y0 + L.mb + len;
    const slideDur = Math.min(1.6, (bottomY - topY) / 380);
    const popped = new Set();
    await tween(slideDur, (k) => {
      const y = THREE.MathUtils.lerp(topY, bottomY, ease.inOut(k));
      placeFF(L.helmetX, y + L.S * 0.15, 30);
      for (const ic of list) {
        if (!popped.has(ic) && y > ic.slotPos.y - 6) {
          popped.add(ic);
          tween(0.4, (q) => (ic.pop = ease.back(q)));
        }
      }
    });
    helmetLid(false);
    // Hop off beside the ladder
    const gx = L.helmetX - L.tile - (L.mobile ? 16 : 20) - L.S * 0.55;
    const gy = bottomY + L.S * 0.15;
    pose = () => ff.crouch(0.5);
    const hx = ffPx.x, hy = ffPx.y;
    await tween(0.35, (k) => placeFF(THREE.MathUtils.lerp(hx, gx, ease.out(k)), THREE.MathUtils.lerp(hy, gy, k) - Math.sin(k * Math.PI) * L.S * 0.3, 40));
    setShadow(true, gy);
    pose = (t) => ff.idle(t);
    await wait(0.1);

    if (!reduced) await sprayTiles(list, gy);
    pose = (t) => ff.wave(t);
    setTimeout(() => {
      if (ladderOpen) pose = (t) => ff.idle(t);
    }, 1400);
    busy = false;
    ui.hint?.('ladder');
  }

  const nozzleWorld = new THREE.Vector3();
  async function sprayTiles(list, gy) {
    await face(1);
    const order = [...list].sort((a, b) => b.slotPos.y - a.slotPos.y); // bottom up
    for (const ic of order) {
      const target = toWorld(ic.slotPos.x, ic.slotPos.y, 10);
      const dy = ffPx.y - L.S * 0.6 - ic.slotPos.y;
      const pitch = Math.atan2(dy, Math.abs(ic.slotPos.x - ffPx.x) + 1);
      pose = (t) => ff.spray(Math.min(1.2, pitch), t);
      await tween(0.34, () => {
        ff.root.updateMatrixWorld(true);
        ff.nozzleTip.getWorldPosition(nozzleWorld);
        const from = stage.worldToLocal(nozzleWorld.clone());
        water.shoot(from, target, { count: 5, time: 0.3, spread: L.tile * 0.45, size: L.mobile ? 7 : 11, tag: ic });
      });
    }
    await wait(0.35);
    await face(0);
  }

  async function closeLadder(chosen = null) {
    if (busy || !ladderOpen) return;
    busy = true;
    ui.hint?.(null);
    const list = icons.filter((i) => i.where === 'ladder');
    if (chosen) {
      // It flies back to the menu bar, right next to the helmet
      chosen.where = 'flying';
      const from = chosen.mesh.position.clone();
      const minSlot = Math.min(0, ...barList().map((b) => b.slot));
      chosen.slot = minSlot - 1;
      const to = toWorld(L.firstIconX, L.barY, 4);
      const s0 = chosen.mesh.scale.x;
      tween(0.55, (k) => {
        const e = ease.inOut(k);
        chosen.mesh.position.lerpVectors(from, to, e);
        chosen.mesh.position.x -= Math.sin(k * Math.PI) * 40;
        chosen.mesh.scale.setScalar(THREE.MathUtils.lerp(s0, L.icon, e));
        if (k > 0.6 && chosen.mat.map !== menuTexture(chosen.app)) {
          chosen.mat.map = menuTexture(chosen.app);
          chosen.mat.opacity = 0.95;
          chosen.mat.needsUpdate = true;
        }
      }).then(() => {
        chosen.where = 'bar';
        retarget();
        chosen.mesh.position.copy(toWorld(chosen.tx, chosen.ty, 4));
        drawBadge(helmetList().length);
        ui.opened?.(chosen.app);
      });
    }
    const rest = list.filter((i) => i !== chosen).sort((a, b) => b.slotPos.y - a.slotPos.y);
    rest.forEach((ic, i) => {
      setTimeout(() => tween(0.22, (k) => (ic.pop = 1 - ease.out(k))), i * 40);
    });

    // Climb back up, back to us
    await face(2);
    const sx = ffPx.x;
    const sy = ffPx.y;
    setShadow(false);
    await tween(0.25, (k) => placeFF(THREE.MathUtils.lerp(sx, L.helmetX, k), sy, 30));
    const topY = L.y0 + L.mb + L.S * 0.2;
    const dur = Math.min(1.4, (sy - topY) / 420);
    pose = () => {};
    await helmetLid(true);
    await tween(dur, (k) => {
      placeFF(L.helmetX, THREE.MathUtils.lerp(sy, topY, k), 30);
      ff.climb(k * dur * 16);
    });
    await tween(0.18, (k) => ff.root.scale.setScalar(L.S * (1 - 0.8 * k)));
    ff.root.visible = false;
    ff.root.scale.setScalar(L.S);
    ff.root.rotation.y = 0;
    pose = (t) => ff.idle(t);
    for (const ic of rest) {
      ic.where = 'helmet';
      ic.mesh.visible = false;
    }
    const len = ladderLen;
    await tween(0.3, (k) => setLadderLength(len * (1 - ease.inOut(k))));
    await helmetLid(false);
    bounceHelmet();
    drawBadge(helmetList().length);
    ladderOpen = false;
    busy = false;
    ui.state?.('closed');
    ui.hint?.(helmetList().length ? 'helmet' : null);
  }

  async function replay() {
    if (busy) return;
    if (ladderOpen) await closeLadder();
    if (busy) return;
    // Everything flies back out of the helmet onto the bar, then he tidies again.
    const back = helmetList();
    back.forEach((ic) => {
      ic.where = 'bar';
      ic.slot = 0;
      ic.mat.map = menuTexture(ic.app);
      ic.mat.opacity = 0.95;
      ic.mat.needsUpdate = true;
      ic.mesh.visible = true;
      ic.mesh.scale.setScalar(L.icon);
      ic.mesh.position.copy(toWorld(L.helmetX, L.barY, 4));
    });
    for (const ic of icons) ic.slot = 0;
    retarget();
    drawBadge(0);
    bounceHelmet();
    await wait(0.7);
    tidy();
  }

  // ---------- Pointer ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverTile = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const tiles = icons.filter((i) => i.where === 'ladder' && i.pop > 0.5).map((i) => i.mesh);
    const hits = raycaster.intersectObjects([helmetHit, ...tiles], false);
    if (!hits.length) return null;
    if (hits[0].object === helmetHit) return { helmet: true };
    return { tile: icons.find((i) => i.mesh === hits[0].object) };
  }
  renderer.domElement.addEventListener('pointermove', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    const p = pick(e);
    renderer.domElement.style.cursor = p && !busy ? 'pointer' : '';
    const t = p?.tile || null;
    if (t !== hoverTile) {
      hoverTile = t;
      if (t && !busy) {
        const px = t.slotPos;
        ui.tooltip?.(t.app.name, px.x + px.side * (L.tile / 2 + 8), px.y, px.side);
        t.wobbleV += 6;
      } else ui.tooltip?.(null);
    }
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pointer.tx = pointer.ty = 0;
    hoverTile = null;
    ui.tooltip?.(null);
  });
  renderer.domElement.addEventListener('click', (e) => {
    if (busy) return;
    const p = pick(e);
    if (p?.helmet) {
      if (ladderOpen) closeLadder();
      else if (tidied) openLadder();
    } else if (p?.tile) {
      ui.tooltip?.(null);
      closeLadder(p.tile);
    } else if (ladderOpen) closeLadder();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ladderOpen) closeLadder();
  });

  // ---------- Loop ----------
  let running = false;
  let last = performance.now();
  const tmp = new THREE.Vector3();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    for (const tw of [...tweens]) {
      const k = Math.min(1, (clock - tw.start) / tw.duration);
      tw.fn(k);
      if (k >= 1) {
        tweens.delete(tw);
        tw.resolve();
      }
    }
    pose(clock);

    // Icons
    const smooth = 1 - Math.exp(-dt * 12);
    for (const ic of icons) {
      if (ic.where === 'bar') {
        toWorld(ic.tx, ic.ty, 4, tmp);
        ic.mesh.position.lerp(tmp, smooth);
        ic.mesh.rotation.z = 0;
      } else if (ic.where === 'carried') {
        const h = handLocal();
        ic.mesh.position.set(h.x, h.y + L.icon * 0.3, 60);
        ic.mesh.scale.setScalar(L.icon * 1.25);
      } else if (ic.where === 'ladder') {
        // damped spring wobble, hanging from a hook at the top
        ic.wobbleV += (-ic.wobble * 60 - ic.wobbleV * 5) * dt;
        ic.wobble += ic.wobbleV * dt;
        ic.mesh.rotation.z = ic.wobble * 0.12 * ic.slotPos.side;
        const hover = ic === hoverTile ? 1.1 : 1;
        ic.mesh.scale.setScalar(Math.max(0.001, L.tile * ic.pop * hover));
        toWorld(ic.slotPos.x, ic.slotPos.y, 10, ic.mesh.position);
      }
    }

    water.update(dt, (p, ic) => {
      if (ic && ic.where === 'ladder') ic.wobbleV += 1.4;
      if (Math.random() < 0.5) water.splash(p, { count: 2, size: L.mobile ? 3 : 4 });
    });

    // gentle parallax
    pointer.x += (pointer.tx - pointer.x) * smooth * 0.4;
    pointer.y += (pointer.ty - pointer.y) * smooth * 0.4;
    const scroll = THREE.MathUtils.clamp(-container.getBoundingClientRect().top / H, 0, 1);
    stage.rotation.y = pointer.x * 0.035;
    stage.rotation.x = pointer.y * 0.025 - (reduced ? 0 : ease.out(scroll) * 0.55);
    stage.position.z = reduced ? 0 : -ease.out(scroll) * H * 0.25;

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

  // ---------- Boot ----------
  layout();
  drawBadge(0);
  new ResizeObserver(() => layout()).observe(container);
  setInterval(() => running && drawDesk(), 30000);

  let started = false;
  new IntersectionObserver(([entry]) => {
    setRunning(entry.isIntersecting && !document.hidden);
    if (entry.isIntersecting && !started) {
      started = true;
      if (reduced) tidyInstantly();
      else setTimeout(tidy, 700);
    }
  }).observe(container);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setRunning(false);
    else if (container.getBoundingClientRect().bottom > 0) setRunning(true);
  });

  return {
    toggle: () => (ladderOpen ? closeLadder() : tidied && openLadder()),
    replay,
    get busy() { return busy; },
  };
}
