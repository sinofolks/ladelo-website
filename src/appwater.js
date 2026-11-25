// Port of the app's water (Sources/LadderbarStage/Water.swift).
//
// Simulation: every drop is a particle flying on a parabola (CPU).
// Rendering, as in the app's Metal shaders:
//   1. each drop is drawn as a soft blob of "density", stretched along its velocity,
//      added into a half-resolution offscreen texture (R = stream & splash, G = drops stuck on glass);
//   2. a fullscreen pass thresholds that texture: where density is high enough there is water.
//      Normals come from the density gradient; bright-to-deep blue, a dark cartoon rim and a white
//      highlight. Drops close together merge into one stream (metaballs).
//   3. mist puffs are drawn as separate translucent white blobs.
// Coordinates are "panel points": origin top-left, y down, like the app.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

export class WaterSim {
  static gravity = 1500;
  static maxParticles = 9000;
  static maxGlass = 4500;

  constructor() {
    this.particles = [];
    this.carry = 0;
    this.glassCount = 0;
  }

  get isEmpty() {
    return this.particles.length === 0;
  }

  /** Speed and flight time to leave along unit vector c and land at offset d; null if impossible. */
  static launch(c, d) {
    const g = WaterSim.gravity;
    if (Math.abs(c.x) <= 0.08) return null;
    const tau2 = (2 * (d.y * c.x - d.x * c.y)) / (g * c.x);
    if (!(tau2 > 0)) return null;
    const tau = Math.sqrt(tau2);
    if (!(tau > 0.12 && tau < 0.9)) return null;
    const speed = (d.x * c.x + d.y * c.y - 0.5 * g * tau2 * c.y) / tau;
    if (!(speed > 100)) return null;
    return { speed, tau };
  }

  /** Spray from s toward t (points). `muzzle` is an optional unit direction. */
  emit(s, muzzle, t, power, wash, dt) {
    const g = WaterSim.gravity;
    const rate = (wash ? 1150 : 420) * power;
    this.carry += rate * dt;
    const n = Math.floor(this.carry);
    this.carry -= n;
    if (n <= 0 || this.particles.length >= WaterSim.maxParticles - 200) return;
    const dist = Math.hypot(t.x - s.x, t.y - s.y);
    const shot = wash || !muzzle ? null : WaterSim.launch(muzzle, { x: t.x - s.x, y: t.y - s.y });
    for (let i = 0; i < n; i++) {
      let tau, vx, vy;
      if (shot) {
        tau = shot.tau;
        vx = muzzle.x * shot.speed;
        vy = muzzle.y * shot.speed;
      } else {
        tau = Math.min(Math.max(dist / 1050, 0.26), 0.6) * rand(0.97, 1.03);
        vx = (t.x - s.x) / tau;
        vy = (t.y - s.y - 0.5 * g * tau * tau) / tau;
      }
      const a = rand(-0.022, 0.022);
      const m = rand(0.97, 1.03);
      const rx = (vx * Math.cos(a) - vy * Math.sin(a)) * m;
      const ry = (vx * Math.sin(a) + vy * Math.cos(a)) * m;
      const p = {
        x: s.x + rand(-1.5, 1.5), y: s.y + rand(-1.5, 1.5), vx: rx, vy: ry,
        radius: rand(2.5, 3.5) * (wash ? 1.5 : 1) * (0.75 + 0.25 * power),
        weight: 1, kind: 0, age: 0, life: tau + 0.08, hit: tau, glass: wash,
      };
      // drops emitted earlier in this frame have already flown a little
      const pre = (dt * i) / n;
      p.vy += g * pre;
      p.x += p.vx * pre;
      p.y += p.vy * pre;
      p.age = pre;
      this.particles.push(p);
    }
  }

  /**
   * Advance. `wiped(p)` says a spot has been squeegeed clean; `onHit(x, y)` is told where the
   * stream lands (to make app tiles wobble).
   */
  step(dt, bw, bh, wiped = null, onHit = null) {
    const g = WaterSim.gravity;
    const spawned = [];
    const ps = this.particles;
    let i = 0;
    while (i < ps.length) {
      const p = ps[i];
      p.age += dt;
      if (p.kind === 3) {
        // a drop on the glass: surface tension holds it, now and then it slips, leaving a trail
        p.vy += g * 0.015 * dt;
        if (Math.random() < (0.25 + p.radius * 0.06) * dt) p.vy += rand(50, 160);
        p.vx += rand(-30, 30) * dt;
        const damp = 1 - Math.min(1, 3.2 * dt);
        p.vx *= damp;
        p.vy *= damp;
        if (p.vy > 25 && this.glassCount < WaterSim.maxGlass && Math.random() < 14 * dt && p.radius > 3) {
          spawned.push({
            x: p.x + rand(-1, 1), y: p.y - p.radius * 0.6, vx: 0, vy: 0,
            radius: rand(1.2, 2.2), weight: 1, kind: 4, age: 0, life: rand(3, 7), hit: Infinity, glass: false,
          });
          p.radius = Math.max(2.5, p.radius - 0.05);
        }
      } else if (p.kind !== 4) {
        p.vy += g * dt * (p.kind === 2 ? 0.08 : 1);
        if (p.kind !== 0) {
          const damp = 1 - Math.min(1, (p.kind === 2 ? 2.5 : 0.5) * dt);
          p.vx *= damp;
          p.vy *= damp;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let dead = p.age > p.life || p.y > bh + 30 || p.x < -60 || p.x > bw + 60;
      if (p.kind !== 0 && wiped && wiped(p)) dead = true;
      if (p.kind === 0 && p.age >= p.hit) {
        const out = p.glass ? WaterSim.splat(p, this.glassCount < WaterSim.maxGlass) : WaterSim.splash(p);
        for (const o of out) spawned.push(o);
        if (onHit) onHit(p.x, p.y);
        dead = true;
      }
      if (p.kind !== 0) {
        const left = 1 - p.age / p.life;
        p.weight = Math.min(1, left * (p.kind >= 3 ? 6 : 3));
      }
      if (dead) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
      } else i++;
    }
    const room = Math.max(0, WaterSim.maxParticles - ps.length);
    for (let k = 0; k < Math.min(room, spawned.length); k++) ps.push(spawned[k]);
    let gc = 0;
    for (const p of ps) if (p.kind >= 3) gc++;
    this.glassCount = gc;
  }

  /** Hitting the glass: most of it sticks as drops, a little splashes. */
  static splat(p, stick) {
    const out = [];
    if (stick && Math.random() < 0.6) {
      out.push({ x: p.x + rand(-14, 14), y: p.y + rand(-10, 10), vx: rand(-20, 20), vy: rand(0, 60),
        radius: rand(3, 10), weight: 1, kind: 3, age: 0, life: rand(30, 45), hit: Infinity });
    }
    if (Math.random() < 0.35) {
      out.push({ x: p.x, y: p.y, vx: p.vx * 0.15 + rand(-220, 220), vy: rand(-200, 60),
        radius: rand(1.8, 3), weight: 1, kind: 1, age: 0, life: rand(0.3, 0.6), hit: Infinity });
    }
    if (Math.random() < 0.06) {
      out.push({ x: p.x, y: p.y, vx: rand(-80, 80), vy: rand(-60, 20),
        radius: rand(12, 22), weight: 1, kind: 2, age: 0, life: rand(0.4, 0.7), hit: Infinity });
    }
    return out;
  }

  /** Hitting an app: a little splash up and sideways, then it falls; sometimes a puff of mist. */
  static splash(p) {
    const out = [];
    const n = Math.random() < 0.15 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      out.push({ x: p.x + rand(-4, 4), y: p.y + rand(-3, 3), vx: p.vx * 0.2 + rand(-280, 280), vy: Math.min(p.vy, 0) * 0.1 + rand(-240, 40),
        radius: rand(1.8, 3.0), weight: 1, kind: 1, age: 0, life: rand(0.35, 0.8), hit: Infinity });
    }
    if (Math.random() < 0.1) {
      out.push({ x: p.x, y: p.y, vx: rand(-100, 100), vy: rand(-80, 20),
        radius: rand(9, 15), weight: 1, kind: 2, age: 0, life: rand(0.3, 0.55), hit: Infinity });
    }
    return out;
  }
}

// ---------------------------------------------------------------- rendering

const dropVertex = /* glsl */ `
  precision highp float;
  in vec2 corner;
  in vec2 iPos;
  in vec2 iVel;
  in vec3 iData; // radius, weight, kind
  uniform vec2 uSize;
  out vec2 vUv;
  out float vWeight;
  out float vGlass;
  void main() {
    float radius = iData.x, kind = iData.z;
    float speed = length(iVel);
    vec2 dir = speed > 1.0 ? iVel / speed : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float stretch = kind < 0.5 ? 1.0 + min(speed * 0.010, 2.6) : (kind < 1.5 ? 1.0 + min(speed * 0.004, 1.0) : 1.0);
    if (kind > 2.5 && kind < 3.5) { stretch = 1.0 + min(speed * 0.006, 0.6); }
    float r = radius * (kind < 1.5 || kind > 2.5 ? 1.6 : 1.0);
    vec2 p = iPos + corner.x * dir * r * stretch + corner.y * perp * r;
    gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
    vUv = corner;
    vWeight = iData.y;
    vGlass = kind > 2.5 ? 1.0 : 0.0;
  }
`;

const densityFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  in float vWeight;
  in float vGlass;
  out vec4 outColor;
  void main() {
    float f = clamp(1.0 - dot(vUv, vUv), 0.0, 1.0);
    float v = f * f * vWeight;
    outColor = vGlass > 0.5 ? vec4(0.0, v, 0.0, 0.0) : vec4(v, 0.0, 0.0, 0.0);
  }
`;

const mistFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  in float vWeight;
  in float vGlass;
  out vec4 outColor;
  void main() {
    float f = clamp(1.0 - dot(vUv, vUv), 0.0, 1.0);
    float a = f * f * vWeight * 0.32;
    outColor = vec4(vec3(0.88, 0.96, 1.0) * a, a);
  }
`;

const fullVertex = /* glsl */ `
  precision highp float;
  in vec3 position;
  out vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Same as the app's waterFragment / glassDrop, with uv flipped to y-down.
const waterFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform sampler2D uDensity;
  uniform vec2 uTexel;
  uniform vec4 uDry;      // x0 y0 x1 y1 (fractions, y down)
  uniform vec2 uSize;
  uniform float uDryOn;
  uniform float uMode;    // 0 both, 1 stream & splash only, 2 glass drops only
  uniform float uBorder;  // fade the side and bottom edges

  vec2 D(vec2 uv) { return texture(uDensity, vec2(uv.x, 1.0 - uv.y)).rg; }

  vec4 glassDrop(vec2 uv, vec2 texel) {
    float d = D(uv).g;
    float edge = smoothstep(0.30, 0.40, d);
    if (edge <= 0.001) return vec4(0.0);
    float gx = D(uv + vec2(texel.x * 1.5, 0.0)).g - D(uv - vec2(texel.x * 1.5, 0.0)).g;
    float gy = D(uv + vec2(0.0, texel.y * 1.5)).g - D(uv - vec2(0.0, texel.y * 1.5)).g;
    vec3 n = normalize(vec3(-gx * 2.5, gy * 2.5, 1.0));
    float rim = 1.0 - smoothstep(0.40, 0.62, d);
    float spec = pow(clamp(dot(n, normalize(vec3(-0.35, 0.75, 0.55))), 0.0, 1.0), 22.0);
    float caustic = pow(clamp(dot(n, normalize(vec3(0.1, -0.8, 0.6))), 0.0, 1.0), 6.0);
    vec3 c = vec3(0.80, 0.90, 1.0);
    c = mix(c, vec3(0.16, 0.30, 0.48), rim * 0.75);
    c += vec3(1.0) * spec + vec3(0.7, 0.9, 1.0) * caustic * 0.5;
    float a = edge * clamp(0.10 + rim * 0.55 + spec * 0.9 + caustic * 0.35, 0.0, 1.0);
    return vec4(clamp(c, 0.0, 1.0) * a, a);
  }

  float dryMask(vec2 uv) {
    if (uDryOn < 0.5) return 1.0;
    float radius = 26.0;
    vec2 p = uv * uSize;
    vec2 lo = uDry.xy * uSize, hi = uDry.zw * uSize;
    vec2 c = (lo + hi) * 0.5, ext = (hi - lo) * 0.5 - radius;
    vec2 q = abs(p - c) - ext;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    return smoothstep(-1.5, 2.5, dist);
  }

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    float keep = dryMask(uv);
    if (keep <= 0.001) { outColor = vec4(0.0); return; }
    vec2 texel = uTexel;
    if (uMode > 1.5) { outColor = glassDrop(uv, texel) * keep; return; }
    float border = uBorder > 0.5
      ? smoothstep(0.0, 0.07, min(uv.x, 1.0 - uv.x)) * smoothstep(0.0, 0.12, 1.0 - uv.y)
      : 1.0;
    vec4 glass = glassDrop(uv, texel);
    float d = D(uv).r;
    float edge = smoothstep(0.30, 0.40, d);
    if (uMode > 0.5) glass = vec4(0.0);
    if (edge <= 0.001) { outColor = glass * keep; return; }
    float gx = D(uv + vec2(texel.x * 1.5, 0.0)).r - D(uv - vec2(texel.x * 1.5, 0.0)).r;
    float gy = D(uv + vec2(0.0, texel.y * 1.5)).r - D(uv - vec2(0.0, texel.y * 1.5)).r;
    vec3 n = normalize(vec3(-gx * 2.2, gy * 2.2, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.65, 0.6));
    vec3 h = normalize(light + vec3(0.0, 0.0, 1.0));
    float spec = pow(clamp(dot(n, h), 0.0, 1.0), 28.0);
    float diffuse = clamp(dot(n, light), 0.0, 1.0);
    float body = clamp((d - 0.35) * 1.1, 0.0, 1.0);
    vec3 deep = vec3(0.05, 0.40, 0.92);
    vec3 bright = vec3(0.55, 0.88, 1.0);
    vec3 c = mix(deep, bright, body * 0.7 + diffuse * 0.3);
    float rim = 1.0 - smoothstep(0.40, 0.58, d);
    c = mix(c, vec3(0.02, 0.22, 0.62), rim * 0.55);
    c += vec3(1.0) * spec * 0.95;
    float a = edge * 0.94 * border;
    vec4 water = vec4(clamp(c, 0.0, 1.0) * a, a);
    outColor = (water + glass * (1.0 - water.a)) * keep;
  }
`;

const premultiplied = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  blendEquation: THREE.AddEquation,
};

function dropGeometry(capacity) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, -1, 1, 1, 1], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const vel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const data = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', pos);
  g.setAttribute('iVel', vel);
  g.setAttribute('iData', data);
  g.instanceCount = 0;
  return g;
}

/**
 * Draws a WaterSim on top of whatever `renderer` has already drawn this frame.
 * `size` is the panel in points; it covers the whole canvas.
 */
export class WaterLayer {
  static capacity = 9000;

  constructor(renderer, { border = true } = {}) {
    this.renderer = renderer;
    const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.size = new THREE.Vector2(1, 1);

    const C = WaterLayer.capacity;
    this.liquidGeo = dropGeometry(C);
    this.mistGeo = dropGeometry(1500);
    const shared = { uSize: { value: this.size } };
    const densityMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: dropVertex,
      fragmentShader: densityFragment,
      uniforms: shared,
      side: THREE.DoubleSide, // y is flipped, so quads face away
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    });
    const mistMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: dropVertex,
      fragmentShader: mistFragment,
      uniforms: shared,
      side: THREE.DoubleSide, // y is flipped, so quads face away
      depthTest: false,
      depthWrite: false,
      transparent: true,
      ...premultiplied,
    });
    this.compositeMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: fullVertex,
      fragmentShader: waterFragment,
      uniforms: {
        uDensity: { value: this.target.texture },
        uTexel: { value: new THREE.Vector2(0.5, 0.5) },
        uDry: { value: new THREE.Vector4() },
        uSize: { value: this.size },
        uDryOn: { value: 0 },
        uMode: { value: 0 },
        uBorder: { value: border ? 1 : 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      ...premultiplied,
    });
    const liquid = new THREE.Mesh(this.liquidGeo, densityMat);
    liquid.frustumCulled = false;
    this.densityScene = new THREE.Scene().add(liquid);
    const mist = new THREE.Mesh(this.mistGeo, mistMat);
    mist.frustumCulled = false;
    this.mistScene = new THREE.Scene().add(mist);
    const full = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), this.compositeMat);
    full.frustumCulled = false;
    this.compositeScene = new THREE.Scene().add(full);
  }

  /**
   * @param particles WaterSim.particles
   * @param opts.size {x, y} panel size in points
   * @param opts.mode 0 both, 1 stream only, 2 glass drops only
   * @param opts.dry  null or {x0, y0, x1, y1} fractions (y down) where no water is drawn
   */
  render(particles, { size, mode = 0, dry = null, mist = true } = {}) {
    const r = this.renderer;
    this.size.set(size.x, size.y);
    // half resolution, like the app: it's blurry on purpose
    const px = r.getDrawingBufferSize(new THREE.Vector2());
    const dw = Math.max(1, Math.floor(px.x / 2)), dh = Math.max(1, Math.floor(px.y / 2));
    if (this.target.width !== dw || this.target.height !== dh) this.target.setSize(dw, dh);
    this.compositeMat.uniforms.uTexel.value.set(1 / dw, 1 / dh);

    // fill instance buffers: liquid first, mist separately
    const L = this.liquidGeo, M = this.mistGeo;
    const lp = L.attributes.iPos.array, lv = L.attributes.iVel.array, ld = L.attributes.iData.array;
    const mp = M.attributes.iPos.array, mv = M.attributes.iVel.array, md = M.attributes.iData.array;
    let nl = 0, nm = 0;
    const capL = WaterLayer.capacity, capM = 1500;
    for (const p of particles) {
      if (p.kind === 2) {
        if (!mist || nm >= capM) continue;
        mp[nm * 2] = p.x; mp[nm * 2 + 1] = p.y;
        mv[nm * 2] = p.vx; mv[nm * 2 + 1] = p.vy;
        md[nm * 3] = p.radius; md[nm * 3 + 1] = p.weight * (1 - p.age / p.life); md[nm * 3 + 2] = 2;
        nm++;
      } else {
        if (nl >= capL) continue;
        if (mode === 1 && p.kind >= 3) continue;
        if (mode === 2 && p.kind < 3) continue;
        lp[nl * 2] = p.x; lp[nl * 2 + 1] = p.y;
        lv[nl * 2] = p.vx; lv[nl * 2 + 1] = p.vy;
        ld[nl * 3] = p.radius; ld[nl * 3 + 1] = p.weight; ld[nl * 3 + 2] = p.kind;
        nl++;
      }
    }
    for (const g of [L, M]) {
      g.attributes.iPos.needsUpdate = true;
      g.attributes.iVel.needsUpdate = true;
      g.attributes.iData.needsUpdate = true;
    }
    L.instanceCount = nl;
    M.instanceCount = mode === 2 ? 0 : nm;
    if (!nl && !M.instanceCount) return;

    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    if (nl) r.render(this.densityScene, this.camera);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);

    const u = this.compositeMat.uniforms;
    u.uMode.value = mode;
    u.uDryOn.value = dry ? 1 : 0;
    if (dry) u.uDry.value.set(dry.x0, dry.y0, dry.x1, dry.y1);
    r.render(this.compositeScene, this.camera);
    if (M.instanceCount) r.render(this.mistScene, this.camera);
    r.autoClear = prevAuto;
  }

  dispose() {
    this.target.dispose();
    this.liquidGeo.dispose();
    this.mistGeo.dispose();
  }
}
