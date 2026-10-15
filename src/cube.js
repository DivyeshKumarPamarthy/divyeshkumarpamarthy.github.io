/*
 * Rubik's cube: logical state + three.js view.
 *
 * Axes: +x = R, -x = L, +y = U, -y = D, +z = F, -z = B.
 * A move turns one layer a multiple of 90deg about an axis. Standard notation
 * (R, U', F2 ...) is "clockwise when looking at that face", which for the
 * positive faces (R, U, F) is a negative right-handed rotation.
 */
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const FACE_COLORS = {
  U: '#f2f3f5', // white
  D: '#ffcf1f', // yellow
  F: '#14c46c', // green
  B: '#2d6bff', // blue
  R: '#ff3346', // red
  L: '#ff8417', // orange
};

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

// face letter -> [axis, layer, sign of a clockwise quarter turn]
const MOVE_DEFS = { R: [0, 1, -1], L: [0, -1, 1], U: [1, 1, -1], D: [1, -1, 1], F: [2, 1, -1], B: [2, -1, 1] };

export function parseMove(token) {
  const [axis, layer, dir] = MOVE_DEFS[token[0]];
  const mod = token.slice(1);
  const turns = mod === "'" ? -dir : mod === '2' ? 2 * dir : dir;
  return { token, axis, layer, turns };
}

export const invertMove = (t) => (t.endsWith('2') ? t : t.endsWith("'") ? t[0] : t + "'");

/** Small, fast, seedable PRNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random-move scramble: no face twice in a row, no three moves on one axis. */
export function makeScramble(length, rng) {
  const faces = 'RLUDFB';
  const axisOf = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
  const out = [];
  while (out.length < length) {
    const f = faces[(rng() * 6) | 0];
    const a = out[out.length - 1];
    const b = out[out.length - 2];
    if (a && a[0] === f) continue;
    if (a && b && axisOf[a[0]] === axisOf[f] && axisOf[b[0]] === axisOf[f]) continue;
    const r = rng();
    out.push(f + (r < 0.43 ? '' : r < 0.86 ? "'" : '2'));
  }
  return out;
}

/** Positions (integer -1..1) and orientations of the 26 visible cubies. */
export class CubeState {
  constructor(src) {
    if (src) {
      this.pos = src.pos.map((p) => p.slice());
      this.quat = src.quat.map((q) => q.clone());
      return;
    }
    this.pos = [];
    this.quat = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          this.pos.push([x, y, z]);
          this.quat.push(new Quaternion());
        }
  }

  clone() {
    return new CubeState(this);
  }

  apply(move) {
    const { axis, layer, turns } = move;
    const ang = (turns * Math.PI) / 2;
    const c = Math.round(Math.cos(ang));
    const s = Math.round(Math.sin(ang));
    const q = new Quaternion().setFromAxisAngle(AXES[axis], ang);
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      if (p[axis] !== layer) continue;
      const [x, y, z] = p;
      if (axis === 0) {
        p[1] = y * c - z * s;
        p[2] = y * s + z * c;
      } else if (axis === 1) {
        p[0] = x * c + z * s;
        p[2] = -x * s + z * c;
      } else {
        p[0] = x * c - y * s;
        p[1] = x * s + y * c;
      }
      this.quat[i].premultiply(q).normalize();
    }
    return this;
  }

  isSolved() {
    const home = new CubeState();
    return this.pos.every((p, i) => p[0] === home.pos[i][0] && p[1] === home.pos[i][1] && p[2] === home.pos[i][2]) &&
      this.quat.every((q) => Math.abs(Math.abs(q.w) - 1) < 1e-6);
  }
}

const faceOfNormal = (n) =>
  n[0] === 1 ? 'R' : n[0] === -1 ? 'L' : n[1] === 1 ? 'U' : n[1] === -1 ? 'D' : n[2] === 1 ? 'F' : 'B';

/**
 * The 54 sticker colours as a net, face -> 9 colour letters (row-major,
 * each face viewed from outside; U has F below it, D has F above it).
 */
export function facelets(state) {
  const out = { U: [], D: [], F: [], B: [], R: [], L: [] };
  const home = new CubeState();
  const v = new Vector3();
  for (let i = 0; i < state.pos.length; i++) {
    const h = home.pos[i];
    for (let a = 0; a < 3; a++) {
      if (!h[a]) continue;
      const hn = [0, 0, 0];
      hn[a] = h[a];
      v.set(hn[0], hn[1], hn[2]).applyQuaternion(state.quat[i]);
      const n = [Math.round(v.x), Math.round(v.y), Math.round(v.z)];
      const face = faceOfNormal(n);
      const [x, y, z] = state.pos[i];
      let row, col;
      switch (face) {
        case 'U': col = x + 1; row = z + 1; break;
        case 'D': col = x + 1; row = 1 - z; break;
        case 'F': col = x + 1; row = 1 - y; break;
        case 'B': col = 1 - x; row = 1 - y; break;
        case 'R': col = 1 - z; row = 1 - y; break;
        default: col = z + 1; row = 1 - y; // L
      }
      out[face][row * 3 + col] = faceOfNormal(hn);
    }
  }
  return out;
}

function roundedSquare(size, radius) {
  const h = size / 2;
  const r = radius;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

const BODY = 0.965; // cubie size; spacing is 1, so the gap between cubies is 0.035

function stickerGeometry(detail) {
  const g = new ExtrudeGeometry(roundedSquare(0.79, 0.13), {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.009,
    bevelSize: 0.011,
    bevelSegments: detail > 2 ? 3 : 1,
    curveSegments: detail > 2 ? 7 : 4,
  });
  // sit the tile on the body face (+z); the mesh is rotated onto the other faces
  g.translate(0, 0, BODY / 2 + 0.009);
  return g;
}

function orientSticker(mesh, n) {
  if (n[0] === 1) mesh.rotation.y = Math.PI / 2;
  else if (n[0] === -1) mesh.rotation.y = -Math.PI / 2;
  else if (n[1] === 1) mesh.rotation.x = -Math.PI / 2;
  else if (n[1] === -1) mesh.rotation.x = Math.PI / 2;
  else if (n[2] === -1) mesh.rotation.y = Math.PI;
}

/** The renderable cube: root (screen placement) > spin (orientation) > cubies. */
export class CubeView {
  constructor({ detail = 4 } = {}) {
    this.root = new Group();
    this.spin = new Group();
    this.root.add(this.spin);

    const bodyGeo = new RoundedBoxGeometry(BODY, BODY, BODY, detail, 0.09);
    const bodyMat = new MeshPhysicalMaterial({
      color: 0x0b0c10,
      roughness: 0.34,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.28,
    });
    const stickerGeo = stickerGeometry(detail);
    this.materials = {};
    for (const [f, hex] of Object.entries(FACE_COLORS)) {
      const c = new Color(hex);
      this.materials[f] = new MeshPhysicalMaterial({
        color: c,
        roughness: 0.26,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        emissive: c.clone(),
        emissiveIntensity: 0,
      });
    }

    this.cubies = [];
    const home = new CubeState();
    home.pos.forEach((p) => {
      const g = new Group();
      g.add(new Mesh(bodyGeo, bodyMat));
      for (let a = 0; a < 3; a++) {
        if (!p[a]) continue;
        const n = [0, 0, 0];
        n[a] = p[a];
        const m = new Mesh(stickerGeo, this.materials[faceOfNormal(n)]);
        orientSticker(m, n);
        g.add(m);
      }
      this.spin.add(g);
      this.cubies.push(g);
    });
    this._q = new Quaternion();
  }

  /** Pose the cubies at `state`, with `move` partially applied by `angle` radians. */
  pose(state, move, angle) {
    const q = this._q;
    const turning = move && angle !== 0;
    if (turning) q.setFromAxisAngle(AXES[move.axis], angle);
    for (let i = 0; i < this.cubies.length; i++) {
      const c = this.cubies[i];
      const p = state.pos[i];
      c.position.set(p[0], p[1], p[2]);
      c.quaternion.copy(state.quat[i]);
      if (turning && p[move.axis] === move.layer) {
        c.position.applyQuaternion(q);
        c.quaternion.premultiply(q);
      }
    }
  }

  setGlow(v) {
    for (const m of Object.values(this.materials)) m.emissiveIntensity = v;
  }
}

/** Confetti of tiny stickers that bursts out of the cube when it is solved. */
export class Burst {
  constructor(count = 96) {
    this.count = count;
    const geo = new ShapeGeometry(roundedSquare(0.2, 0.045), 3);
    const mat = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false });
    this.mesh = new InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const colors = Object.values(FACE_COLORS).map((h) => new Color(h));
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, colors[i % colors.length]);
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.r = new Float32Array(count * 3);
    this.w = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.dummy = new Object3D();
    this.active = false;
  }

  fire() {
    for (let i = 0; i < this.count; i++) {
      // random point on a sphere around the cube, flying outwards
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
      const sp = 4.5 + Math.random() * 7;
      this.p.set([dx * 1.4, dy * 1.4, dz * 1.4], i * 3);
      this.v.set([dx * sp, dy * sp + 2.2, dz * sp * 0.6], i * 3);
      this.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.w.set([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14], i * 3);
      this.life[i] = 0;
      this.max[i] = 1.1 + Math.random() * 0.9;
    }
    this.active = true;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.active) return;
    const d = this.dummy;
    let alive = 0;
    const drag = Math.exp(-2.4 * dt);
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.life[i] += dt;
      const t = this.life[i] / this.max[i];
      if (t < 1) alive++;
      this.v[k] *= drag;
      this.v[k + 1] = this.v[k + 1] * drag - 9 * dt;
      this.v[k + 2] *= drag;
      for (let j = 0; j < 3; j++) {
        this.p[k + j] += this.v[k + j] * dt;
        this.r[k + j] += this.w[k + j] * dt;
      }
      const sc = t >= 1 ? 0 : t < 0.12 ? t / 0.12 : 1 - Math.pow((t - 0.12) / 0.88, 2);
      d.position.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      d.rotation.set(this.r[k], this.r[k + 1], this.r[k + 2]);
      d.scale.setScalar(Math.max(sc, 0.0001));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
}
