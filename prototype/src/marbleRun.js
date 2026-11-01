// Marbles rolling down the grooved wooden track (built in scatter.js). Every 6-10 s
// a marble appears at the top end, rolls down the groove (rolling acceleration on
// the slope, a little friction, spinning with distance), drops off the low end onto
// the floor, rolls out a few centimetres, stops and shrinks away, so none pile up.
import * as THREE from 'three';
import { TOYS, PAL } from './toys.js';

const MR = 0.0075; // marble radius (TOYS.marble)
const G = 9.8;

export function createMarbleRun(scene, rng, curve) {
  const len = curve.getLength();
  const marbles = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3(), t = new THREE.Vector3(), axis = new THREE.Vector3();
  let timer = 1.5;

  function spawn() {
    const holder = new THREE.Group(); // pivot at the marble's center
    const m = TOYS.marble(rng, { color: rng.pick(PAL) });
    m.position.y = -MR;
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    holder.add(m);
    holder.scale.setScalar(0.001);
    scene.add(holder);
    marbles.push({ obj: holder, s: 0.01, v: 0, phase: 'appear', k: 0, vel: new THREE.Vector3() });
  }

  function placeOnTrack(mb) {
    const u = Math.min(1, mb.s / len);
    curve.getPointAt(u, p);
    mb.obj.position.set(p.x, p.y + MR, p.z);
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0 && marbles.length < 4) {
      spawn();
      timer = 6 + rng.next() * 4;
    }
    for (let i = marbles.length - 1; i >= 0; i--) {
      const mb = marbles[i], o = mb.obj;
      if (mb.phase === 'appear') {
        // grows in at the top end, then starts rolling
        mb.k = Math.min(1, mb.k + dt / 0.5);
        o.scale.setScalar(Math.max(0.001, mb.k));
        placeOnTrack(mb);
        if (mb.k >= 1) mb.phase = 'roll';
      } else if (mb.phase === 'roll') {
        const u = Math.min(1, mb.s / len);
        curve.getTangentAt(u, t);
        // along the groove: a = 5/7 g sin(slope) for a rolling ball, minus rolling friction
        mb.v = Math.max(0.02, Math.min(0.5, mb.v + ((5 / 7) * G * -t.y - 0.25 * mb.v) * dt));
        const ds = mb.v * dt;
        mb.s += ds;
        placeOnTrack(mb);
        axis.crossVectors(UP, t).normalize();
        o.rotateOnWorldAxis(axis, ds / MR);
        if (mb.s >= len) {
          // off the low end: keep the speed, fall to the floor
          mb.vel.set(t.x, 0, t.z).normalize().multiplyScalar(mb.v);
          mb.phase = 'out';
        }
      } else if (mb.phase === 'out') {
        // free fall to the floor, then roll out and slow down
        if (o.position.y > MR) {
          mb.vel.y -= G * dt;
          o.position.y = Math.max(MR, o.position.y + mb.vel.y * dt);
        } else mb.vel.y = 0;
        const sp = Math.hypot(mb.vel.x, mb.vel.z);
        const nsp = Math.max(0, sp - 0.8 * dt);
        if (sp > 0) { mb.vel.x *= nsp / sp; mb.vel.z *= nsp / sp; }
        o.position.x += mb.vel.x * dt;
        o.position.z += mb.vel.z * dt;
        if (nsp > 0) {
          axis.set(mb.vel.z, 0, -mb.vel.x).normalize();
          o.rotateOnWorldAxis(axis, (nsp * dt) / MR);
        }
        if (nsp < 0.01 && o.position.y <= MR) { mb.phase = 'vanish'; mb.k = 1; }
      } else {
        // stopped: shrink away after a short rest
        mb.k -= dt / 0.9;
        o.scale.setScalar(Math.max(0.001, Math.min(1, mb.k * 1.6)));
        if (mb.k <= 0) {
          scene.remove(o);
          marbles.splice(i, 1);
        }
      }
    }
  }

  return { update, get count() { return marbles.length; } };
}
