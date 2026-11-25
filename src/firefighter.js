// A small procedural firefighter. Feet sit at y = 0 and he is about 1.1 units tall;
// scale the root group to size him. Poses are set every frame by the scenes.
import * as THREE from 'three';

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

export const COLORS = {
  red: 0xe5322d,
  coat: 0xc99b5d,
  stripe: 0xf4e04d,
  dark: 0x1b1f2a,
  skin: 0xf2c6a0,
  gold: 0xd9b07a,
  steel: 0xc9ced6,
};

/** The red helmet on its own — used on his head and, bigger, in the menu bar. */
export function makeHelmet() {
  const g = new THREE.Group();
  const red = mat(COLORS.red, { roughness: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), red);
  dome.scale.set(1, 1.05, 1.08);
  g.add(dome);
  const comb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 12), red);
  comb.rotation.x = Math.PI / 2;
  comb.position.set(0, 0.155, 0.0);
  comb.scale.set(1, 1, 0.9);
  g.add(comb);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.025, 40), red);
  brim.scale.set(1, 1, 1.12);
  brim.position.set(0, 0.0, -0.02);
  g.add(brim);
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.03, 0.012, 6),
    mat(COLORS.gold, { metalness: 0.6, roughness: 0.3 })
  );
  shield.rotation.x = Math.PI / 2;
  shield.position.set(0, 0.085, 0.165);
  g.add(shield);
  return g;
}

function limb(radius, length, material) {
  // Pivot at the top, limb hanging down along -y.
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  m.position.y = -length / 2 - radius * 0.4;
  pivot.add(m);
  return pivot;
}

export class Firefighter {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // bobbing / leaning happens here
    this.root.add(this.body);

    const coat = mat(COLORS.coat);
    const dark = mat(COLORS.dark, { roughness: 0.8 });
    const stripe = mat(COLORS.stripe, { emissive: 0x4a3f00, roughness: 0.4 });

    // Legs
    this.legL = limb(0.062, 0.24, dark);
    this.legR = limb(0.062, 0.24, dark);
    this.legL.position.set(-0.085, 0.38, 0);
    this.legR.position.set(0.085, 0.38, 0);
    for (const leg of [this.legL, this.legR]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.17), dark);
      boot.position.set(0, -0.34, 0.025);
      leg.add(boot);
      this.body.add(leg);
    }

    // Torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.2, 8, 20), coat);
    torso.position.y = 0.56;
    torso.scale.set(1, 1, 0.82);
    this.body.add(torso);
    for (const y of [0.47, 0.6]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.016, 8, 32), stripe);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 0.82, 1);
      band.position.y = y;
      this.body.add(band);
    }
    // Air tank on his back
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.17, 6, 16), mat(COLORS.steel, { metalness: 0.7, roughness: 0.3 }));
    tank.position.set(0, 0.6, -0.16);
    this.body.add(tank);

    // Arms
    this.armL = limb(0.05, 0.2, coat);
    this.armR = limb(0.05, 0.2, coat);
    this.armL.position.set(-0.2, 0.72, 0);
    this.armR.position.set(0.2, 0.72, 0);
    for (const arm of [this.armL, this.armR]) {
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), stripe);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.2;
      arm.add(cuff);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 12), dark);
      glove.position.y = -0.3;
      arm.add(glove);
      this.body.add(arm);
    }
    // Hand anchors (for carrying things)
    this.handL = new THREE.Object3D();
    this.handL.position.y = -0.33;
    this.armL.add(this.handL);
    this.handR = new THREE.Object3D();
    this.handR.position.y = -0.33;
    this.armR.add(this.handR);

    // Nozzle, hidden unless spraying
    this.nozzle = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 12), mat(COLORS.dark, { metalness: 0.5 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.1;
    this.nozzle.add(barrel);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), mat(COLORS.gold, { metalness: 0.7, roughness: 0.3 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.22;
    this.nozzle.add(tip);
    this.nozzleTip = new THREE.Object3D();
    this.nozzleTip.position.z = 0.25;
    this.nozzle.add(this.nozzleTip);
    this.nozzle.visible = false;
    this.body.add(this.nozzle);

    // Head
    this.head = new THREE.Group();
    this.head.position.y = 0.88;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 20), mat(COLORS.skin, { roughness: 0.7 }));
    this.head.add(face);
    const eyeMat = mat(0x111111, { roughness: 0.2 });
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), eyeMat);
      eye.position.set(x, 0.0, 0.125);
      this.head.add(eye);
    }
    const cheekMat = mat(0xf08a7a, { roughness: 0.9, transparent: true, opacity: 0.6 });
    for (const x of [-0.075, 0.075]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), cheekMat);
      cheek.position.set(x, -0.04, 0.11);
      cheek.scale.z = 0.4;
      this.head.add(cheek);
    }
    const helmet = makeHelmet();
    helmet.position.y = 0.05;
    helmet.rotation.x = -0.12;
    this.head.add(helmet);
    this.body.add(this.head);

    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  /** Back to standing straight. */
  reset() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    for (const p of [this.legL, this.legR, this.armL, this.armR, this.head]) p.rotation.set(0, 0, 0);
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12;
    this.nozzle.visible = false;
  }

  idle(t) {
    this.reset();
    const b = Math.sin(t * 2.2);
    this.body.position.y = b * 0.008;
    this.armL.rotation.z = -0.12 - b * 0.03;
    this.armR.rotation.z = 0.12 + b * 0.03;
    this.head.rotation.z = Math.sin(t * 0.9) * 0.06;
  }

  walk(phase) {
    this.reset();
    const s = Math.sin(phase);
    this.legL.rotation.x = s * 0.7;
    this.legR.rotation.x = -s * 0.7;
    this.armL.rotation.x = -s * 0.6;
    this.armR.rotation.x = s * 0.6;
    this.body.position.y = Math.abs(Math.cos(phase)) * 0.035;
    this.body.rotation.x = 0.06;
  }

  /** Crouch (k 0..1) before a jump. */
  crouch(k) {
    this.reset();
    this.body.position.y = -0.06 * k;
    this.legL.rotation.x = -0.5 * k;
    this.legR.rotation.x = -0.5 * k;
    this.armL.rotation.x = 0.5 * k;
    this.armR.rotation.x = 0.5 * k;
  }

  /** Mid-air with the left arm reaching up (k 0..1). */
  reach(k) {
    this.reset();
    this.armL.rotation.z = THREE.MathUtils.lerp(-0.12, -(Math.PI - 0.25), k);
    this.armR.rotation.z = THREE.MathUtils.lerp(0.12, 0.6, k);
    this.legL.rotation.x = 0.25 * k;
    this.legR.rotation.x = -0.15 * k;
    this.head.rotation.x = -0.35 * k;
  }

  /** Overarm throw, k 0..1 (wind up, then release around k = 0.6). */
  throwPose(k) {
    this.reset();
    const wind = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5;
    this.armL.rotation.z = THREE.MathUtils.lerp(-(Math.PI - 0.3), -0.5, Math.min(1, k * 1.4));
    this.armL.rotation.x = -wind * 0.4;
    this.body.rotation.z = -0.15 * wind;
    this.body.rotation.y = 0.3 * wind;
  }

  /** Sitting on the ladder, sliding down, facing us. */
  sit() {
    this.reset();
    this.legL.rotation.x = -1.4;
    this.legR.rotation.x = -1.4;
    this.armL.rotation.z = -(Math.PI - 0.5);
    this.armR.rotation.z = Math.PI - 0.5;
    this.body.position.y = 0.06;
  }

  /** Climbing, phase drives alternating arms/legs. */
  climb(phase) {
    this.reset();
    const s = Math.sin(phase);
    this.armL.rotation.x = -2.4 + s * 0.4;
    this.armR.rotation.x = -2.4 - s * 0.4;
    this.legL.rotation.x = -0.6 - s * 0.4;
    this.legR.rotation.x = -0.6 + s * 0.4;
  }

  /** Holding the nozzle forward with both hands, aimed by pitch (radians, + is up). */
  spray(pitch, t = 0) {
    this.reset();
    this.nozzle.visible = true;
    const jitter = Math.sin(t * 40) * 0.01;
    this.armL.rotation.x = -1.35 - pitch * 0.6;
    this.armR.rotation.x = -1.35 - pitch * 0.6;
    this.armL.rotation.z = 0.25;
    this.armR.rotation.z = -0.25;
    this.nozzle.position.set(0, 0.6 + Math.sin(pitch) * 0.2, 0.22);
    this.nozzle.rotation.x = -pitch + jitter;
    this.legL.rotation.x = 0.25;
    this.legR.rotation.x = -0.2;
    this.body.rotation.x = -0.05;
  }

  /** Wave hello with the right arm. */
  wave(t) {
    this.idle(t);
    this.armR.rotation.z = 2.5 + Math.sin(t * 9) * 0.35;
  }
}
