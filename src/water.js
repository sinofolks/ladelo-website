// A small particle hose. Particles fly ballistically and call onHit when their
// flight time is up (or when hitTest says so), then disappear.
import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float glint = smoothstep(0.18, 0.0, length(p - vec2(-0.12, -0.12)));
    gl_FragColor = vec4(uColor + glint * 0.6, core * vAlpha);
  }
`;

export class Water {
  constructor(parent, { max = 900, color = 0x9fd8ff, gravity = -1400, additive = true } = {}) {
    this.max = max;
    this.gravity = gravity;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.tag = new Array(max).fill(null);
    this.alive = new Uint8Array(max);
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: { value: 1000 }, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  setScale(s) {
    this.material.uniforms.uScale.value = s;
  }

  /**
   * Shoot `count` drops from `from` so they land at `to` after `time` seconds.
   * `spread` jitters the landing point (world units). `tag` is passed to onHit.
   */
  shoot(from, to, { count = 6, time = 0.4, spread = 6, size = 7, tag = null } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const t = time * (0.85 + Math.random() * 0.3);
      const tx = to.x + (Math.random() - 0.5) * spread;
      const ty = to.y + (Math.random() - 0.5) * spread;
      const tz = to.z + (Math.random() - 0.5) * spread * 0.3;
      this.pos[i * 3] = from.x;
      this.pos[i * 3 + 1] = from.y;
      this.pos[i * 3 + 2] = from.z;
      this.vel[i * 3] = (tx - from.x) / t;
      this.vel[i * 3 + 1] = (ty - from.y) / t - 0.5 * this.gravity * t;
      this.vel[i * 3 + 2] = (tz - from.z) / t;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.alpha[i] = 0.85;
      this.age[i] = 0;
      this.life[i] = t;
      this.tag[i] = tag;
      this.alive[i] = 1;
    }
  }

  /** Little splash drops that fall away from a point. */
  splash(at, { count = 3, size = 4, speed = 160 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z + 2;
      this.vel[i * 3] = Math.cos(a) * speed * Math.random();
      this.vel[i * 3 + 1] = Math.abs(Math.sin(a)) * speed * 0.8;
      this.vel[i * 3 + 2] = Math.random() * 40;
      this.size[i] = size * (0.5 + Math.random());
      this.alpha[i] = 0.7;
      this.age[i] = 0;
      this.life[i] = 0.35 + Math.random() * 0.2;
      this.tag[i] = null;
      this.alive[i] = 2; // splash: fade out, no hit
    }
  }

  update(dt, onHit) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      any = true;
      this.age[i] += dt;
      this.vel[i * 3 + 1] += this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.alive[i] === 2) this.alpha[i] = 0.7 * (1 - this.age[i] / this.life[i]);
      if (this.age[i] >= this.life[i]) {
        if (this.alive[i] === 1 && onHit) {
          onHit(
            { x: this.pos[i * 3], y: this.pos[i * 3 + 1], z: this.pos[i * 3 + 2] },
            this.tag[i]
          );
        }
        this.alive[i] = 0;
        this.alpha[i] = 0;
        this.size[i] = 0;
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    return any;
  }
}
