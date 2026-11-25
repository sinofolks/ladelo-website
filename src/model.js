// The real Ladelo firefighter (Tripo mesh, Mixamo skeleton) with the same pose
// interface as the procedural one in firefighter.js, so the scenes can swap them.
// Every pose jumps the matching clip to an exact time; nothing plays on its own.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeNozzle } from './firefighter.js';

const URL = '/models/firefighter.glb';
const FPS = 24;
const HEIGHT = 1.1; // same height as the procedural one

// name → [source clip name prefix, first frame, last frame, hips lock]
//   'xz'  keep him in place horizontally (run / climb cycles drift)
//   'xyz' pin the hips completely (the slide moves down a lot; the scene does that)
const CLIPS = {
  walk: ['run', 1, 31, 'xz'],
  grab: ['跳起来抓', 19, 55, 'xz'],
  throw: ['大力扔', 25, 61, 'xz'],
  idle: ['站立待机', 1, 120, 'xz'],
  slide: ['滑滑梯', 33, 61, 'xyz'],
  climb: ['正面朝前', 13, 61, 'xz'],
};

let loading = null;
/** Loads the glb once; resolves to the parsed gltf, or null if it can't be loaded. */
export function loadFirefighter() {
  if (!loading) {
    loading = new GLTFLoader()
      .loadAsync(URL)
      .catch((err) => {
        console.warn('Firefighter model failed to load, using the simple one', err);
        return null;
      });
  }
  return loading;
}

export class ModelFirefighter {
  constructor(gltf) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const model = cloneSkinned(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const k = HEIGHT / (box.max.y - box.min.y || 1);
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    this.body.add(model);
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinned bounds don't follow the pose
        o.castShadow = true;
        if (o.material) {
          o.material = o.material.clone();
          o.material.side = THREE.FrontSide;
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [name, [prefix, f0, f1, lock]] of Object.entries(CLIPS)) {
      const clip = gltf.animations.find((c) => c.name.startsWith(prefix));
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions[name] = { action, start: f0 / FPS, len: (f1 - f0) / FPS, lock };
    }
    this.current = null;

    let hips = null, left = null, right = null;
    model.traverse((o) => {
      if (!o.isBone) return;
      if (!hips && /Hips$/.test(o.name)) hips = o;
      if (!left && /LeftHand$/.test(o.name)) left = o;
      if (!right && /RightHand$/.test(o.name)) right = o;
    });
    this.hips = hips;
    this.hipsRest = hips ? hips.position.clone() : null;
    this.handBoneR = right;

    // Hand anchor the scenes read (carrying icons)
    this.handL = new THREE.Object3D();
    (left || this.body).add(this.handL);
    this.handR = new THREE.Object3D();
    (right || this.body).add(this.handR);

    const nz = makeNozzle();
    this.nozzle = nz.nozzle;
    this.nozzleTip = nz.tip;
    this.nozzle.visible = false;
    this.nozzle.scale.setScalar(1.3);
    this.body.add(this.nozzle);

    this._v = new THREE.Vector3();
    // Measured from the clips: the grab only lifts his hand to 0.88 of his height,
    // so he jumps higher; the throw is right-handed and lets go about 1.1s in.
    this.jumpLift = 0.52;
    this.throwTime = 0.9;
    this.releaseAt = 0.72;
    this.throwHand = this.handR;
  }

  /** Jump clip `name` to `t` seconds into its useful range. */
  _set(name, t) {
    const c = this.actions[name] || this.actions.idle;
    if (!c) return;
    if (this.current !== c) {
      if (this.current) this.current.action.stop();
      c.action.reset().play();
      this.current = c;
    }
    c.action.time = c.start + THREE.MathUtils.clamp(t, 0, c.len);
    this.mixer.update(0);
    if (this.hips && this.hipsRest) {
      this.hips.position.x = this.hipsRest.x;
      this.hips.position.z = this.hipsRest.z;
      if (c.lock === 'xyz') this.hips.position.y = this.hipsRest.y;
    }
    this.nozzle.visible = false;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }
  _cycle(name, phase01) {
    const c = this.actions[name];
    if (c) this._set(name, (((phase01 % 1) + 1) % 1) * c.len);
  }

  reset() {
    this._set('idle', 0);
  }
  idle(t) {
    this._cycle('idle', t / (this.actions.idle?.len || 5));
  }
  walk(phase) {
    this._cycle('walk', phase / (Math.PI * 2) / 2);
  }
  /** Getting ready to jump: the start of the grab clip. */
  crouch(k) {
    this._set('grab', k * 0.5);
  }
  /** In the air, arm up; k 0..1 is how far up. */
  reach(k) {
    this._set('grab', 0.5 + k * 0.5); // left hand is highest 1.0s in
  }
  throwPose(k) {
    const c = this.actions.throw;
    this._set('throw', k * (c ? c.len : 1));
  }
  sit() {
    const c = this.actions.slide;
    this._set('slide', c ? c.len * 0.5 : 0);
  }
  climb(phase) {
    this._cycle('climb', phase / (Math.PI * 2) / 2);
  }
  /** Standing, nozzle held at his right hand and pointed up by `pitch`. */
  spray(pitch, t = 0) {
    this.idle(t);
    this.nozzle.visible = true;
    if (this.handBoneR) {
      this.body.updateMatrixWorld(true);
      this.handBoneR.getWorldPosition(this._v);
      this.body.worldToLocal(this._v);
      this.nozzle.position.copy(this._v);
    } else {
      this.nozzle.position.set(0.15, 0.5, 0.12);
    }
    this.nozzle.rotation.set(-pitch + Math.sin(t * 40) * 0.01, 0, 0);
  }
  wave(t) {
    this.idle(t);
  }
}
