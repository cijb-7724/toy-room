// Wooden marble run (original design): a backboard between two posts with five
// two-rail ramps zig-zagging down. A marble drops out of the hopper at the top
// every couple of seconds, rolls down each ramp, falls to the next one at the
// post, and finally sinks into a hole in the base, so nothing piles up.
// Local frame: origin at the base's bottom center, ramps on the +z (front) side.
import * as THREE from 'three';
import { TOYS, PAL, wd, pl } from './toys.js';

const H = 0.44; // post height
const PX = 0.15; // posts at x = ±PX
const POST = 0.022;
const BASE_H = 0.03;
const RZ = 0.028; // ramp centerline z (in front of the board)
const RAIL_R = 0.0024, RAIL_GAP = 0.006; // rails at ±RAIL_GAP from the centerline
const MR = 0.0075; // marble radius
const SIT = Math.sqrt((MR + RAIL_R) ** 2 - RAIL_GAP ** 2); // marble center above the rail centers
const RAMPS = 5, RX = 0.128, Y0 = 0.395, DROP = 0.045, GAP = 0.027;

// each ramp starts right under the end of the one above, so marbles drop straight down
const rampStart = (k) => ({ x: k % 2 ? RX : -RX, y: Y0 - k * (DROP + GAP) });
const rampEnd = (k) => ({ x: k % 2 ? -RX : RX, y: Y0 - k * (DROP + GAP) - DROP });
const HOLE_X = rampEnd(RAMPS - 1).x; // the last ramp drops marbles into a hole in the base

function rod(group, mat, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}
function block(group, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

export function createMarbleRun(scene, rng, { x, z, yaw }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);

  const maple = wd(0xd9b27c), walnut = wd(0x8a5a32), red = pl(0xc22a22, { r: 0.4 }), dark = pl(0x1a1410, { r: 0.9 });
  // base with a hole at the bottom of the run
  block(g, walnut, 2 * (PX + 0.04), BASE_H, 0.2, 0, BASE_H / 2, 0.01);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(MR * 1.5, MR * 1.5, 0.001, 20), dark);
  hole.position.set(HOLE_X, BASE_H + 0.0005, RZ);
  g.add(hole);
  // posts, backboard, red caps
  for (const sx of [-1, 1]) {
    block(g, maple, POST, H - BASE_H, POST, sx * PX, BASE_H + (H - BASE_H) / 2, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), red);
    cap.position.set(sx * PX, H + 0.01, 0);
    cap.castShadow = true;
    g.add(cap);
  }
  block(g, maple, 2 * PX - POST, H - BASE_H - 0.03, 0.008, 0, BASE_H + (H - BASE_H - 0.03) / 2, -0.002);
  // open-bottomed hopper over the first ramp (marbles appear inside it); the post is its back wall
  {
    const s = rampStart(0);
    const hx = s.x + 0.003, hy = s.y + SIT + 0.017;
    block(g, red, 0.022, 0.03, 0.003, hx, hy, RZ + 0.0165);
    block(g, red, 0.022, 0.03, 0.003, hx, hy, RZ - 0.0165);
    block(g, red, 0.003, 0.03, 0.036, hx + 0.0125, hy, RZ);
  }
  // ramps: two rails on ties fixed to the board
  for (let k = 0; k < RAMPS; k++) {
    const s = rampStart(k), e = rampEnd(k);
    for (const oz of [-RAIL_GAP, RAIL_GAP]) {
      rod(g, k % 2 ? red : walnut, new THREE.Vector3(s.x, s.y, RZ + oz), new THREE.Vector3(e.x, e.y, RZ + oz), RAIL_R);
    }
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n, tx = s.x + (e.x - s.x) * t, ty = s.y + (e.y - s.y) * t;
      block(g, maple, 0.006, 0.005, RZ + RAIL_GAP + 0.005 - 0.002, tx, ty - RAIL_R - 0.0025, (RZ + RAIL_GAP + 0.005 + 0.002) / 2);
    }
    // little stop at the falling end so marbles drop straight down
    block(g, maple, 0.004, 0.02, 0.03, e.x + Math.sign(e.x) * 0.0095, e.y + 0.004, RZ + 0.004);
  }

  // marble path in local space: roll along each ramp, then fall to the next start
  const path = [];
  for (let k = 0; k < RAMPS; k++) {
    const s = rampStart(k), e = rampEnd(k);
    path.push({ type: 'roll', a: new THREE.Vector3(s.x, s.y + SIT, RZ), b: new THREE.Vector3(e.x, e.y + SIT, RZ) });
    const nx = k + 1 < RAMPS ? rampStart(k + 1) : { x: HOLE_X };
    const ny = k + 1 < RAMPS ? nx.y + SIT : BASE_H - MR * 2.2;
    path.push({ type: 'fall', a: new THREE.Vector3(e.x, e.y + SIT, RZ), b: new THREE.Vector3(nx.x, ny, RZ), last: k + 1 === RAMPS });
  }

  const marbles = [];
  const tmp = new THREE.Vector3(), axis = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let timer = 0.3;

  function spawn() {
    const holder = new THREE.Group(); // pivot at the marble's center
    const m = TOYS.marble(rng, { color: rng.pick(PAL) });
    m.position.y = -MR;
    holder.add(m);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const s = rampStart(0);
    holder.position.set(s.x, s.y + SIT + 0.02, RZ);
    g.add(holder);
    // brief drop from inside the hopper onto the first ramp
    marbles.push({ obj: holder, seg: -1, v: 0, vy: 0, t: 0 });
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0 && marbles.length < 12) {
      spawn();
      timer = 1.2 + rng.next() * 1.2;
    }
    for (let i = marbles.length - 1; i >= 0; i--) {
      const mb = marbles[i];
      const o = mb.obj;
      if (mb.seg === -1) {
        mb.vy -= 9.8 * dt;
        o.position.y += mb.vy * dt;
        const top = path[0].a.y;
        if (o.position.y <= top) { o.position.y = top; mb.seg = 0; mb.t = 0; mb.v = 0.05; }
        continue;
      }
      const sg = path[mb.seg];
      if (sg.type === 'roll') {
        const len = sg.a.distanceTo(sg.b);
        // rolling down a ~10° incline: a = 5/7 g sinθ, with a little rolling friction
        const sin = (sg.a.y - sg.b.y) / len;
        mb.v = Math.min(0.32, mb.v + (5 / 7) * 9.8 * sin * dt - 0.15 * mb.v * dt);
        const ds = mb.v * dt;
        mb.t += ds / len;
        o.position.lerpVectors(sg.a, sg.b, Math.min(1, mb.t));
        // spin about the axis across the direction of travel
        tmp.subVectors(sg.b, sg.a).normalize();
        axis.crossVectors(UP, tmp).normalize();
        o.rotateOnWorldAxis(axis, ds / MR); // (axis in the run's frame = the marble's parent)
        if (mb.t >= 1) { mb.seg++; mb.t = 0; mb.vy = 0; mb.vx = Math.sign(sg.b.x - sg.a.x) * mb.v; }
      } else {
        // fall: keep a bit of forward speed until stopped by the post/stop, then drop
        mb.vy -= 9.8 * dt;
        o.position.y += mb.vy * dt;
        const toX = sg.b.x - o.position.x;
        o.position.x += Math.sign(toX) * Math.min(Math.abs(toX), Math.abs(mb.vx) * dt + 0.15 * dt);
        if (o.position.y <= sg.b.y) {
          if (sg.last) {
            // gone down the hole: hidden inside the base
            g.remove(o);
            marbles.splice(i, 1);
            continue;
          }
          o.position.y = sg.b.y;
          o.position.x = sg.b.x;
          mb.seg++; mb.t = 0; mb.v = 0.06;
        }
      }
    }
  }

  // colliders (world space): base, and the board with its ramps
  g.updateMatrixWorld(true);
  const toWorld = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)).applyMatrix4(g.matrixWorld);
  const colliders = [
    toWorld(-PX - 0.04, 0, -0.09, PX + 0.04, BASE_H, 0.11),
    toWorld(-PX - POST / 2, 0, -POST / 2, PX + POST / 2, H + 0.026, RZ + RAIL_GAP + RAIL_R + 0.004),
  ];
  return { group: g, update, colliders, get count() { return marbles.length; } };
}
