// Automatic, seeded placement of ~500 toys on the room's surfaces, a deliberate "block city"
// between the chair and the wall hole, then a merge of all static toy meshes by material
// (colliders are computed first; the 5 find-targets stay as separate Groups).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { ROOM, FURNITURE as F } from './scale.js';
import { TOYS, PAL, PRIM, C } from './toys.js';

const PI = Math.PI;
const LETTERS = 'ABCDEFGHIJKLNOPQRSTUVWXYZ'.split(''); // M is reserved for a target

export function scatterToys(scene, surfaces, rng) {
  const S = {};
  for (const s of surfaces || []) S[s.name] = s;
  const colliders = [];
  const targets = [];
  const roots = []; // everything that will be merged
  const stats = {};
  const circles = new Map(); // surface name -> [{x, z, r, top}]
  const box = new THREE.Box3();
  const circlesOf = (name) => {
    if (!circles.has(name)) circles.set(name, []);
    return circles.get(name);
  };
  const make = (type, opts) => TOYS[type](rng, opts || {});
  const gauss = () => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
  const count = (name) => { stats[name] = (stats[name] || 0) + 1; };

  // Set pose; sit the lowest point of the object exactly on baseY. Returns its world box.
  function put(obj, x, z, baseY, yaw, tip) {
    obj.rotation.order = 'YXZ';
    obj.rotation.set(tip ? tip.x : 0, yaw, tip ? tip.z : 0);
    obj.position.set(x, 0, z);
    box.setFromObject(obj);
    obj.position.y = baseY - box.min.y;
    box.setFromObject(obj);
    return box;
  }
  function commit(obj, circlesArr, x, z, r, surfName, noCollide, isTarget) {
    scene.add(obj);
    if (!isTarget) roots.push(obj);
    box.setFromObject(obj);
    if (!noCollide && box.max.y - box.min.y > 0.03) colliders.push(box.clone());
    if (circlesArr) {
      // things stack on the solid part of an object only (not on top of a thin pole)
      const w = Math.min(box.max.x - box.min.x, box.max.z - box.min.z);
      circlesArr.push({ x, z, r, rs: r * 0.62, top: box.min.y + Math.min(box.max.y - box.min.y, 0.7 * w) });
    }
    if (surfName) count(isTarget ? 'targets' : surfName);
    return obj;
  }
  const addWorld = (obj, surfName) => { scene.add(obj); roots.push(obj); if (surfName) count(surfName); return obj; };

  // Generic placement of `obj` on surface `surf`.
  // cfg: yaw, tip (probability of lying on its side), lean {x,z}, y, at [x,z], sample () => [x,z],
  //      reject (x,z,r) => bool, stack (rest on things below), maxTop, pack (spacing), tries
  function place(surf, obj, cfg = {}) {
    const arr = circlesOf(surf.name);
    let tip = cfg.lean || null;
    if (!tip && cfg.tip && rng.next() < cfg.tip) {
      const s = rng.next() < 0.5 ? 1 : -1;
      tip = rng.next() < 0.5 ? { x: s * PI / 2, z: 0 } : { x: 0, z: s * PI / 2 };
    }
    const yaw = cfg.yaw ?? rng.range(0, PI * 2);
    const y0 = cfg.y ?? surf.y;
    const b0 = put(obj, 0, 0, y0, yaw, tip);
    const wx = b0.max.x - b0.min.x, wz = b0.max.z - b0.min.z;
    const off = Math.hypot((b0.min.x + b0.max.x) / 2, (b0.min.z + b0.max.z) / 2);
    const r = Math.max(0.5 * Math.sqrt(wx * wz) * 1.15, 0.35 * Math.max(wx, wz)) + off;
    const height = b0.max.y - b0.min.y;
    const inset = Math.min(r * 0.7, (surf.maxX - surf.minX) / 2, (surf.maxZ - surf.minZ) / 2);
    const tries = cfg.tries ?? 60;
    for (let i = 0; i < tries; i++) {
      let x, z;
      if (cfg.at) { x = cfg.at[0]; z = cfg.at[1]; }
      else if (cfg.sample) { [x, z] = cfg.sample(); }
      else {
        x = rng.range(surf.minX + inset, surf.maxX - inset);
        z = rng.range(surf.minZ + inset, surf.maxZ - inset);
      }
      if (!cfg.at) {
        if (x < surf.minX + inset || x > surf.maxX - inset || z < surf.minZ + inset || z > surf.maxZ - inset) continue;
        if (cfg.reject && cfg.reject(x, z, r)) continue;
      }
      let base = y0;
      if (cfg.stack) {
        for (const c of arr) {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < (c.rs ?? c.r) * 1.05) base = Math.max(base, c.top);
        }
        if (cfg.maxTop !== undefined && base + height > cfg.maxTop) continue;
      } else if (!cfg.at) {
        const k = cfg.pack ?? 1;
        let hit = false;
        for (const c of arr) {
          if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r * k) ** 2 * (cfg.tight ? 1 : 0.8)) { hit = true; break; }
        }
        if (hit) continue;
      }
      put(obj, x, z, base, yaw, tip);
      return commit(obj, arr, x, z, r, surf.name, cfg.noCollide, cfg.target);
    }
    return null;
  }
  const bookOpts = () => ({ standing: true, thick: rng.range(0.011, 0.025), w: rng.range(0.07, 0.1), h: rng.range(0.12, 0.22) });

  // ---- floor helpers ----
  const FL = S.floor || { name: 'floor', minX: -ROOM.width / 2, maxX: ROOM.width / 2, minZ: -ROOM.depth / 2, maxZ: ROOM.depth / 2, y: 0 };
  const rect = (c, w, d, m = 0) => ({ x0: c.x - w / 2 - m, x1: c.x + w / 2 + m, z0: c.z - d / 2 - m, z1: c.z + d / 2 + m });
  const solid = [
    rect(F.bed, F.bed.w, F.bed.d, 0.04),
    rect(F.nightstand, F.nightstand.w, F.nightstand.d, 0.03),
    rect(F.toyBox, F.toyBox.w, F.toyBox.d, 0.03),
    rect(F.bookshelf, F.bookshelf.w, F.bookshelf.d, 0.03),
    { x0: FL.minX, x1: FL.minX + 0.45, z0: F.door.z - F.door.w / 2, z1: F.door.z + F.door.w / 2 }, // door swing
  ];
  const chairRect = rect(F.chair, F.chair.w, F.chair.d, 0.01);
  const hitRect = (x, z, r, q) => {
    const dx = Math.max(q.x0 - x, 0, x - q.x1), dz = Math.max(q.z0 - z, 0, z - q.z1);
    return dx * dx + dz * dz < r * r;
  };
  // Walking lanes (about 10cm wide) kept clear of toys, plus the avenue to the wall hole.
  const HZ = F.wallHole.z;
  const lanes = [
    { x0: -0.9, x1: 1.7, z0: -0.42, z1: -0.3 },
    { x0: 0.5, x1: 0.6, z0: -1.7, z1: 1.2 },
    { x0: -0.3, x1: -0.2, z0: -1.25, z1: -0.4 },
    { x0: 1.3, x1: 1.4, z0: -1.0, z1: -0.4 },
    { x0: -1.2, x1: 0.6, z0: 0.92, z1: 1.08 },
    // avenue to the hole (also for the city's own items); starts back at x 0.5 so
    // spread 3's camera, under the chair, has a clear line of sight to the hole
    { x0: 0.5, x1: 2.0, z0: HZ - 0.075, z1: HZ + 0.075 },
  ];
  // elevated track (filled in below): xz samples to keep floor items away from the ramp
  const rampXZ = [];
  const nearRamp = (x, z, r) => {
    for (const p of rampXZ) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < (r + 0.04) ** 2) return true;
    return false;
  };
  const floorReject = (x, z, r, noLanes) => {
    const wm = 0.04;
    if (x < FL.minX + r + wm || x > FL.maxX - r - wm || z < FL.minZ + r + wm || z > FL.maxZ - r - wm) return true;
    for (const q of solid) if (hitRect(x, z, r, q)) return true;
    if (!noLanes) for (const q of lanes) if (hitRect(x, z, r * 0.6, q)) return true;
    if (r < 0.045) {
      const inner = { x0: chairRect.x0 + 0.08, x1: chairRect.x1 - 0.08, z0: chairRect.z0 + 0.08, z1: chairRect.z1 - 0.08 };
      if (!(x > inner.x0 && x < inner.x1 && z > inner.z0 && z < inner.z1) && hitRect(x, z, r, chairRect)) return true;
    } else if (hitRect(x, z, r, chairRect)) return true;
    if (nearRamp(x, z, r)) return true;
    return false;
  };
  const zones = [
    { w: 0.34, x: -0.25, z: -0.9, sx: 0.55, sz: 0.4 },
    { w: 0.3, x: 1.25, z: -0.75, sx: 0.5, sz: 0.3 },
    { w: 0.16, x: 0.95, z: 0.45, sx: 0.4, sz: 0.4 },
    { w: 0.1, x: -0.7, z: 0.1, sx: 0.25, sz: 0.5 },
    { w: 0.1, x: 0, z: 0.2, sx: 1.8, sz: 1.5 },
  ];
  const floorSample = () => {
    let t = rng.next();
    let zn = zones[zones.length - 1];
    for (const z of zones) { if (t < z.w) { zn = z; break; } t -= z.w; }
    return [zn.x + gauss() * zn.sx, zn.z + gauss() * zn.sz];
  };
  const floorCfg = (extra) => ({ sample: floorSample, reject: floorReject, tries: 70, ...extra });
  const onFloor = (type, opts, cfg) => place(FL, make(type, opts), floorCfg(cfg));
  const near = (cx, cz, rad) => () => {
    const a = rng.range(0, PI * 2), d = rng.range(0.01, rad);
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  };

  // ======================= targets first =======================
  function target(name, obj) { if (obj) targets.push({ name, object: obj }); }
  // place a target: like commit, but not merged
  const placeTarget = (surf, obj, cfg) => place(surf, obj, { ...cfg, target: true });

  // 1. rubber duck on the middle bookshelf (front row, reserved span)
  const duckShelf = S.bookshelf1 || S.bookshelf0 || S.bookshelf2;
  const reserved = new Map(); // surface -> [[z0, z1]]
  if (duckShelf) {
    const z = duckShelf.minZ + (duckShelf.maxZ - duckShelf.minZ) * 0.55;
    const o = placeTarget(duckShelf, make('rubberDuck', { scale: 1.1 }), { at: [duckShelf.minX + 0.07, z], yaw: -PI / 2 + 0.25 });
    target('あひる', o);
    reserved.set(duckShelf.name, [[z - 0.06, z + 0.06]]);
  }
  // 2. red marble under the chair (beside, not under, the elevated track)
  {
    const o = placeTarget(FL, make('marble', { color: 0xdd1f26, scale: 1.4 }), { at: [F.chair.x - 0.03, F.chair.z - 0.15] });
    target('あかいビーだま', o);
  }
  // 3. letter tile M on the floor in front of the toy box
  {
    const o = placeTarget(FL, make('letterTile', { letter: 'M', scale: 1.5, colorIdx: 2 }), { at: [F.toyBox.x - 0.28, F.toyBox.z + 0.45], yaw: 0.35 });
    target('Mのもじ', o);
  }
  // 4. gold star on the window sill
  {
    const st = make('goldStar');
    const sill = S.windowSill;
    let o = null;
    if (sill) o = placeTarget(sill, st, { at: [Math.min(sill.maxX - 0.08, F.window.x + F.window.w / 2 - 0.15), (sill.minZ + sill.maxZ) / 2], yaw: 0.15 });
    if (!o) o = placeTarget(FL, st, { at: [F.window.x + 0.5, ROOM.depth / -2 + 0.12], yaw: 0.2 });
    target('きらきらのほし', o);
  }
  // 5. small blue robot in the toy box heap (placed after the heap, below)

  // ======================= bed =======================
  if (S.bed) {
    const B = S.bed;
    // plush leaning back against the pillow / headboard
    const plush = [['teddyBear', {}], ['plushBunny', {}], ['knitPlush', {}], ['plushElephant', {}], ['teddyBear', { color: 0xf2b6c4 }], ['plushBunny', { color: 0xe8b6c8 }]];
    plush.forEach(([t, o], i) => {
      const x = (B.minX + B.maxX) / 2 + (i - 2.5) * 0.12 + rng.range(-0.015, 0.015);
      place(B, make(t, o), { at: [x, B.minZ + 0.07 + (i % 2) * 0.1], yaw: rng.range(-0.35, 0.35), lean: { x: -0.32 - rng.range(0, 0.12), z: rng.range(-0.08, 0.08) } });
    });
    const small = [
      ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'long' }],
      ['sedan', {}], ['raceCar', {}], ['sedan', { taxi: true, color: C.yellow }], ['book', {}], ['book', {}], ['ball', { r: 0.05 }],
      ['plasticBrick', {}], ['plasticBrick', {}], ['jacks', {}], ['yoyo', {}], ['soldier', {}],
      ['dice', {}], ['dice', {}], ['crayon', {}],
    ];
    for (const [t, o] of small) place(B, make(t, o), { tip: t === 'sedan' ? 0 : 0.05, pack: 0.8, tries: 60, sample: () => [rng.range(B.minX + 0.05, B.maxX - 0.05), rng.range(B.minZ + 0.25, B.maxZ - 0.05)] });
  }

  // ======================= chair seat =======================
  if (S.chairSeat) {
    const T = S.chairSeat;
    const cx = (T.minX + T.maxX) / 2, cz = (T.minZ + T.maxZ) / 2;
    // knitted scarf draped over the front edge (front of the seat is -x)
    const scarf = make('scarf', { flat: T.maxX - 0.02 - (T.minX - 0.012) });
    scarf.rotation.set(0, -PI / 2, 0);
    // on the -z side, so it doesn't hang across the sight line to the wall hole
    scarf.position.set(T.maxX - 0.02, T.y + 0.002, T.minZ + 0.06);
    commit(scarf, null, 0, 0, 0, 'chairSeat', true);
    place(T, make('teddyBear'), { at: [cx + 0.04, T.minZ + 0.1], yaw: -PI / 2 + rng.range(-0.3, 0.3), lean: { x: -0.2, z: 0 } });
    place(T, make('plushBunny', { color: 0xb8c8e8, scale: 0.8 }), { at: [cx + 0.06, cz + 0.02], yaw: -PI / 2 + 0.3, lean: { x: -0.15, z: 0 } });
    place(T, make('toyAnimal', { kind: 'dog' }), { sample: () => [rng.range(T.minX + 0.04, cx - 0.04), rng.range(T.minZ + 0.04, T.maxZ - 0.15)], pack: 0.6 });
    place(T, make('book', { color: C.green }), { sample: () => [rng.range(T.minX + 0.07, cx - 0.04), rng.range(T.minZ + 0.07, T.maxZ - 0.2)], pack: 0.5, stack: true, maxTop: T.y + 0.1 });
    place(T, make('sedan'), { sample: () => [rng.range(T.minX + 0.05, cx), rng.range(T.minZ + 0.05, T.maxZ - 0.15)], pack: 0.5, stack: true });
    place(T, make('dice'), { stack: true });
    place(T, make('woodenBlock', { shape: 'cube' }), { sample: () => [rng.range(T.minX + 0.03, cx), rng.range(T.minZ + 0.03, T.maxZ - 0.13)], stack: true, maxTop: T.y + 0.15 });
  }

  // ======================= nightstand top: crowded =======================
  if (S.nightstandTop) {
    const T = S.nightstandTop;
    const arr = circlesOf('nightstandTop');
    arr.push({ x: F.lamp.x, z: F.lamp.z, r: 0.11, rs: 0.11, top: T.y + 1 }); // lamp base: keep clear
    const list = [
      ['globe'], ['tinCan', { pencils: true }], ['crayonBox'], ['book'], ['book'], ['ruler'], ['spoon'], ['funnel'], ['baseball', { r: 0.03 }],
      ['soldier'], ['soldier'], ['soldier'], ['penguin'], ['giraffe'], ['camel'], ['chessKnight'], ['chessKnight'], ['cone'], ['cone'], ['trafficSign'],
      ['sedan'], ['sedan', { taxi: true, color: C.yellow }], ['raceCar'], ['spinningTop'], ['yoyo'], ['jacks'], ['jacks'], ['shuttlecock'],
      ['plasticBrick'], ['plasticBrick'], ['plasticBrick', { nx: 2, nz: 2 }], ['dice'], ['dice'], ['dice'], ['letterTile', { letter: rng.pick(LETTERS) }],
      ['letterTile', { letter: rng.pick(LETTERS) }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'tri' }],
      ['domino'], ['domino'], ['domino'], ['marble'], ['marble'], ['marble'], ['pencil'], ['pencil'], ['crayon'], ['crayon'], ['crayon'],
    ];
    for (const [t, o] of list) place(T, make(t, o), { stack: true, maxTop: T.y + 0.17, tries: 80, pack: 0.45, tip: t === 'pencil' || t === 'crayon' ? 0 : 0.05 });
    // garland draped from the globe-ish side to the lamp side
    addWorld(make('beadGarland', { a: [T.minX + 0.03, T.y + 0.07, T.minZ + 0.02], b: [T.maxX - 0.02, T.y + 0.06, T.minZ + 0.02], sag: 0.04 }), 'nightstandTop');
  }
  // ======================= nightstand shelf: packed =======================
  if (S.nightstandShelf) {
    const T = S.nightstandShelf;
    const mt = T.y + 0.2;
    const list = [
      ['book', bookOpts(), { yaw: rng.range(-0.1, 0.1) + PI / 2 }], ['book', bookOpts(), { yaw: PI / 2 }], ['book', bookOpts(), { yaw: PI / 2 + 0.1 }],
      ['book', bookOpts(), { yaw: PI / 2 }], ['book', bookOpts(), { yaw: PI / 2 - 0.1 }], ['book', bookOpts(), { yaw: PI / 2 }],
      ['crayonBox'], ['tinCan', { pencils: true }], ['bucket', { scale: 0.7 }],
      ['sedan'], ['raceCar'], ['trainWagon'], ['sedan', { taxi: true, color: C.yellow }],
      ['soldier'], ['soldier'], ['penguin'], ['giraffe'], ['camel'], ['chessKnight'], ['cone'], ['toyAnimal'], ['toyAnimal'],
      ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['plasticBrick'], ['baseball', { r: 0.03 }], ['ball', { r: 0.04 }],
    ];
    for (const [t, o, c] of list) place(T, make(t, o), { maxTop: mt, stack: t !== 'book', pack: 0.55, tries: 80, ...(c || {}) });
  }

  // ======================= bookshelves =======================
  function shelfRow(surf) {
    const res = reserved.get(surf.name) || [];
    const len = surf.maxZ - surf.minZ;
    // back row: books and a few boxes / plush / vehicles, backs against the shelf back
    let cursor = surf.minZ + 0.02;
    const maxZ = surf.maxZ - 0.015;
    let n = 0;
    const clearance = 0.3;
    while (cursor < maxZ && n < 20) {
      const t = rng.next();
      let obj;
      if (t < 0.64) obj = make('book', bookOpts());
      else if (t < 0.7) obj = make('crayonBox');
      else if (t < 0.75) obj = make('teddyBear', { scale: 0.7 });
      else if (t < 0.8) obj = make('plushBunny', { scale: 0.65 });
      else if (t < 0.85) obj = make('schoolBus', {});
      else if (t < 0.9) obj = make('globe', {});
      else if (t < 0.95) obj = make('bowlingPin', {});
      else obj = make('rocket', {});
      const isBook = obj.userData.type === 'book';
      const yaw = isBook ? -PI / 2 + rng.range(-0.04, 0.04) : -PI / 2 + rng.range(-0.3, 0.3);
      const b = put(obj, 0, 0, surf.y, yaw, null);
      const w = b.max.z - b.min.z, hgt = b.max.y - b.min.y;
      if (hgt > clearance) continue;
      const x = surf.maxX - 0.012 - b.max.x;
      put(obj, x, cursor - b.min.z, surf.y, yaw, null);
      if (cursor + w > maxZ) break;
      commit(obj, null, 0, 0, 0, surf.name);
      cursor += w + (isBook ? rng.range(0, 0.006) : rng.range(0.004, 0.02));
      n++;
    }
    // front row: figurines and small cars
    const front = ['soldier', 'penguin', 'giraffe', 'camel', 'chessKnight', 'cone', 'toyAnimal', 'sedan', 'raceCar', 'tinCan', 'trafficSign', 'woodenBlock', 'spinningTop', 'baseball'];
    const want = Math.max(5, Math.min(14, Math.round(len / 0.055)));
    const fx = () => surf.minX + 0.045 + rng.range(0, 0.025);
    for (let i = 0; i < want; i++) {
      const t = rng.pick(front);
      const o = t === 'woodenBlock' ? { shape: 'cube' } : t === 'baseball' ? { r: 0.03 } : {};
      place(surf, make(t, o), {
        sample: () => [fx(), rng.range(surf.minZ + 0.03, surf.maxZ - 0.03)],
        reject: (x, z) => res.some(([a, b]) => z > a && z < b),
        yaw: rng.range(-0.5, 0.5) - PI / 2 + (t === 'sedan' || t === 'raceCar' ? 0 : PI / 2), pack: 0.55, tries: 50, maxTop: surf.y + clearance,
      });
    }
  }
  for (const nm of ['bookshelf0', 'bookshelf1', 'bookshelf2']) if (S[nm]) shelfRow(S[nm]);

  // ======================= window sill: lined with figurines =======================
  if (S.windowSill) {
    const T = S.windowSill;
    const fz = (T.minZ + T.maxZ) / 2;
    const list = [
      ['soldier'], ['soldier'], ['soldier'], ['soldier'], ['penguin'], ['penguin'], ['giraffe'], ['giraffe'], ['camel'], ['camel'],
      ['chessKnight'], ['chessKnight'], ['cone'], ['cone'], ['toyAnimal', { kind: 'horse' }], ['toyAnimal', { kind: 'dog' }], ['toyAnimal', { kind: 'sheep' }],
      ['trafficSign'], ['sedan'], ['raceCar'], ['marble'], ['marble'], ['baseball', { r: 0.03 }], ['shuttlecock'], ['trainWagon'],
    ];
    for (const [t, o] of list) {
      place(T, make(t, o), { sample: () => [rng.range(T.minX + 0.03, T.maxX - 0.03), fz + rng.range(-0.02, 0.02)], yaw: rng.range(-0.4, 0.4) + (t === 'sedan' || t === 'raceCar' || t === 'trainWagon' ? PI / 2 : 0), pack: 0.42, tries: 140 });
    }
  }

  // ======================= toy box heap =======================
  if (S.toyBoxInside) {
    const T = S.toyBoxInside;
    const maxTop = T.y + 0.72;
    const heap = [
      ['teddyBear'], ['knitPlush'], ['plushBunny'], ['plushElephant'], ['dumpTruck', { tilt: 0 }], ['schoolBus'], ['fireTruck'], ['airplane'], ['drum'], ['stackingRings'],
      ['ball', { r: 0.1 }], ['ball', { r: 0.08 }], ['ball', { r: 0.06 }], ['ball', { r: 0.06 }], ['ball', { r: 0.04 }], ['ball', { r: 0.04 }], ['baseball'], ['baseball'],
      ['racket'], ['racket'], ['racket'], ['ropeCoil'], ['ropeCoil'], ['bucket'], ['bucket'], ['sailboat'], ['rocket'], ['robot', { color: C.red }],
      ['bowlingPin'], ['bowlingPin'], ['bowlingPin'], ['sedan'], ['sedan'], ['raceCar'], ['trainEngine'], ['trainWagon'],
      ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }], ['woodenBlock', { shape: 'cube' }],
      ['woodenBlock', { shape: 'long' }], ['woodenBlock', { shape: 'cyl' }], ['archBlock', { w: 0.1, h: 0.09, ow: 0.06, oh: 0.065 }], ['column'], ['roofBlock'],
      ['plasticBrick'], ['plasticBrick'], ['plasticBrick'], ['soldier'], ['soldier'], ['soldier'], ['shuttlecock'], ['shuttlecock'], ['sneaker'],
      ['funnel'], ['tinCan', { pencils: true }], ['spinningTop'], ['yoyo'], ['dice'], ['dice'], ['letterTile', { letter: rng.pick(LETTERS) }], ['marbleBag'],
    ];
    for (const [t, o] of heap) place(T, make(t, o), { stack: true, maxTop, tip: t === 'racket' ? 0.6 : 0.35, tries: 70, pack: 0.5 });
    const robot = make('robot', { color: C.blue, scale: 0.8 });
    let o = placeTarget(T, robot, {
      stack: true, maxTop: T.y + 0.98, yaw: 0.5, tries: 120,
      sample: () => [(T.minX + T.maxX) / 2 + rng.range(-0.15, 0.15), T.maxZ - rng.range(0.04, 0.1)],
    });
    if (!o) o = placeTarget(FL, robot, floorCfg({ at: [F.toyBox.x - 0.5, F.toyBox.z + 0.4] }));
    target('あおいロボット', o);
    // toys spilling over the front rim
    addWorld(make('beadGarland', { a: [F.toyBox.x - 0.4, F.toyBox.h + 0.01, F.toyBox.z + F.toyBox.d / 2 + 0.012], b: [F.toyBox.x + 0.4, F.toyBox.h + 0.01, F.toyBox.z + F.toyBox.d / 2 + 0.012], sag: 0.12 }), 'toyBoxInside');
    const fz0 = F.toyBox.z + F.toyBox.d / 2;
    const spill = [['ropeCoil', 0.18], ['ball', 0.5], ['sedan', 0.7], ['ball', 0.82], ['bowlingPin', 1.0], ['baseball', 0.3], ['racket', 0.9]];
    for (const [t, u] of spill) {
      const x = F.toyBox.x - F.toyBox.w / 2 + 0.05 + u * (F.toyBox.w - 0.1);
      const obj = make(t, t === 'ball' ? { r: 0.05 } : {});
      place(FL, obj, { at: [x, fz0 + 0.07 + rng.range(0, 0.1)], tip: t === 'bowlingPin' ? 1 : 0, noCollide: false });
    }
  }

  // ======================= floor =======================
  // 1. wooden track meander (low, crossing lanes is fine) with a little train
  {
    const pattern = ['S', 'S', 'S', 'R', 'R', 'S', 'S', 'R', 'R', 'S', 'S', 'L', 'L', 'S'];
    let px = 0.15, pz = -1.05, th = PI / 2;
    const trackArr = circlesOf('floor');
    let engineAt = null, i = 0;
    for (const p of pattern) {
      const piece = p === 'S' ? make('trackStraight') : make('trackCurve', { dir: p === 'R' ? 1 : -1 });
      const tk = piece.userData.track;
      const c = Math.cos(th), s = Math.sin(th);
      const ex = tk.ex * c + tk.ez * s, ez = -tk.ex * s + tk.ez * c;
      const mx = px + ex / 2, mz = pz + ez / 2;
      if (floorReject(mx, mz, 0.06, true) || floorReject(px + ex, pz + ez, 0.04, true)) break;
      piece.rotation.y = th;
      piece.position.set(px, 0, pz);
      scene.add(piece); roots.push(piece); count('floor');
      trackArr.push({ x: mx, z: mz, r: 0.085, top: 0.013 });
      if (i === 1) engineAt = { x: px + ex / 2, z: pz + ez / 2, th };
      px += ex; pz += ez; th += tk.dyaw; i++;
    }
    if (engineAt) {
      const eng = make('trainEngine');
      eng.rotation.y = engineAt.th;
      eng.position.set(engineAt.x, 0.0125, engineAt.z);
      commit(eng, trackArr, engineAt.x, engineAt.z, 0.07, 'floor');
    }
  }

  // ======================= block city =======================
  const BC = F.blockCity;
  {
    const arr = circlesOf('floor');
    const placeAt = (type, opts, x, z, yaw = 0, y0 = 0, o = {}) => {
      const obj = make(type, opts);
      put(obj, x, z, y0, yaw, o.tip || null);
      const b = box;
      const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
      commit(obj, y0 === 0 ? arr : null, x, z, r, 'city', o.noCollide);
      return obj;
    };
    const topOf = (obj) => box.setFromObject(obj).max.y;
    const aw = F.wallHole.z;
    // --- the avenue of three arches leading straight to the wall hole ---
    const arches = [
      { x: 1.76, c: C.red, w: 0.14, h: 0.125, ow: 0.086, oh: 0.097, fig: 'soldier' },
      { x: 1.84, c: C.yellow, w: 0.13, h: 0.115, ow: 0.082, oh: 0.092, fig: 'penguin' },
      { x: 1.915, c: C.blue, w: 0.12, h: 0.105, ow: 0.078, oh: 0.088, fig: 'camel' },
    ];
    const archTops = [];
    for (const a of arches) {
      const obj = placeAt('archBlock', { color: a.c, w: a.w, h: a.h, ow: a.ow, oh: a.oh, d: 0.03 }, a.x, aw, PI / 2, 0, { noCollide: true });
      // colliders: two pillars + lintel (the opening stays walkable)
      const x0 = a.x - 0.015, x1 = a.x + 0.015;
      colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, aw - a.w / 2), new THREE.Vector3(x1, a.h, aw - a.ow / 2)));
      colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, aw + a.ow / 2), new THREE.Vector3(x1, a.h, aw + a.w / 2)));
      colliders.push(new THREE.Box3(new THREE.Vector3(x0, a.oh - 0.004, aw - a.w / 2), new THREE.Vector3(x1, a.h, aw + a.w / 2)));
      void obj;
      archTops.push([a.x, a.h]);
      placeAt(a.fig, {}, a.x, aw, -PI / 2, a.h);
    }
    // bunting between the arch tops
    for (let i = 0; i < 2; i++) {
      addWorld(make('beadGarland', { a: [archTops[i][0] + 0.015, archTops[i][1] + 0.003, aw - 0.05], b: [archTops[i + 1][0] - 0.015, archTops[i + 1][1] + 0.003, aw - 0.05], sag: 0.006, r: 0.0045 }), 'city');
    }
    // --- left side of the avenue (z < 0.69) ---
    placeAt('cardboardTower', { variant: 0, h: 0.27 }, 1.58, 0.6, 0);
    for (const x of [1.76, 1.84, 1.915]) placeAt('column', { h: 0.12, color: x === 1.84 ? C.white : C.yellow }, x, 0.62, 0);
    const plank = placeAt('plankBlock', { len: 0.25, color: C.green }, 1.825, 0.62, 0, 0.12);
    const pt = topOf(plank);
    placeAt('soldier', { coat: C.blue }, 1.72, 0.62, 0, pt);
    placeAt('giraffe', {}, 1.80, 0.62, PI / 2, pt);
    placeAt('chessKnight', {}, 1.87, 0.62, 0.3, pt);
    placeAt('penguin', {}, 1.93, 0.62, -0.3, pt);
    placeAt('cardboardHouse', { variant: 1, w: 0.14, d: 0.11, h: 0.13 }, 1.70, 0.44, 0);
    // letter-block stack topped with a roof
    {
      let top = 0;
      const x = 1.87, z = 0.45;
      for (let k = 0; k < 3; k++) {
        const bl = make('woodenBlock', { shape: 'cube', letters: true, colorIdx: k % 5 });
        put(bl, x + rng.range(-0.004, 0.004), z + rng.range(-0.004, 0.004), top, rng.range(-0.3, 0.3));
        commit(bl, k === 0 ? arr : null, x, z, 0.03, 'city');
        top = box.max.y;
      }
      const rf = make('roofBlock', { color: C.red });
      put(rf, x, z, top, 0.1);
      commit(rf, null, x, z, 0.03, 'city');
      placeAt('penguin', { scale: 0.9 }, x, z, 0.2, box.max.y);
    }
    placeAt('cardboardTower', { variant: 2, h: 0.2 }, 1.55, 0.36, 0.1);
    placeAt('halfArch', { color: C.orange }, 1.94, 0.35, 0);
    placeAt('halfArch', { color: C.green }, 1.86, 0.34, PI);
    // pyramid of cubes
    {
      const z = 0.33;
      const rows = [[1.62, 1.665, 1.71], [1.6425, 1.6875], [1.665]];
      rows.forEach((xs, ri) => xs.forEach((x, k) => {
        const bl = make('woodenBlock', { shape: 'cube', letters: true });
        put(bl, x, z, ri * 0.04, rng.range(-0.08, 0.08));
        commit(bl, ri === 0 && k === 0 ? arr : null, x, z, 0.03, 'city');
      }));
      placeAt('chessKnight', { scale: 1.0 }, 1.665, z, 0.5, 0.12);
    }
    // --- right side of the avenue (z > 0.81) ---
    placeAt('cardboardHouse', { variant: 3, w: 0.15, d: 0.12, h: 0.12 }, 1.88, 1.07, PI);
    placeAt('cardboardTower', { variant: 1, h: 0.29 }, 1.945, 0.92, PI);
    placeAt('archBlock', { color: C.green, w: 0.13, h: 0.12, d: 0.03 }, 1.8, 0.93, 0, 0, { noCollide: true });
    {
      const x0 = 1.8 - 0.065, x1 = 1.8 + 0.065, ow = 0.13 * 0.62, oh = 0.12 * 0.72, zc = 0.93;
      colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, zc - 0.015), new THREE.Vector3(1.8 - ow / 2, 0.12, zc + 0.015)));
      colliders.push(new THREE.Box3(new THREE.Vector3(1.8 + ow / 2, 0, zc - 0.015), new THREE.Vector3(x1, 0.12, zc + 0.015)));
      colliders.push(new THREE.Box3(new THREE.Vector3(x0, oh - 0.004, zc - 0.015), new THREE.Vector3(x1, 0.12, zc + 0.015)));
    }
    placeAt('soldier', { coat: C.green }, 1.8, 0.93, 0, 0.12);
    placeAt('cardboardTower', { variant: 2, h: 0.22 }, 1.62, 1.2, PI);
    placeAt('cardboardTower', { variant: 0, h: 0.18, w: 0.075, d: 0.075 }, 1.78, 1.2, PI);
    addWorld(make('beadGarland', { a: [1.62, 0.235, 1.2], b: [1.78, 0.195, 1.2], sag: 0.03, r: 0.005 }), 'city');
    for (const [x, z] of [[1.9, 1.2], [1.94, 1.2], [1.92, 1.16]]) {
      const bl = make('woodenBlock', { shape: 'cube', letters: true });
      put(bl, x, z, 0, rng.range(-0.2, 0.2));
      commit(bl, arr, x, z, 0.03, 'city');
    }
    placeAt('column', { h: 0.1, color: C.red }, 1.70, 0.9, 0);
    placeAt('column', { h: 0.1, color: C.red }, 1.70, 1.0, 0);
    const lin = placeAt('plankBlock', { len: 0.12, color: C.orange }, 1.70, 0.95, PI / 2, 0.1);
    placeAt('roofBlock', { color: C.blue }, 1.70, 0.95, PI / 2, topOf(lin));
    // --- signs, cones, barrier along the avenue ---
    placeAt('trafficSign', { kind: 'stop' }, 1.66, 0.655, -0.4);
    placeAt('trafficSign', { kind: 'warn' }, 1.64, 0.855, PI + 0.4);
    placeAt('cone', {}, 1.5, 0.655, 0);
    placeAt('cone', {}, 1.5, 0.845, 0);
    placeAt('cone', {}, 1.5, 0.67, 0);
    placeAt('barrier', {}, 1.55, 0.865, PI / 2 - 0.2);

    // --- wooden track ramp: curves over and around the chair's rear legs and runs under the seat ---
    const rampPts = [
      [1.74, 0.0, 1.14], [1.66, 0.014, 1.11], [1.58, 0.05, 1.04], [1.51, 0.085, 0.95], [1.46, 0.102, 0.84], [1.42, 0.108, 0.72],
      [1.35, 0.106, 0.64], [1.25, 0.098, 0.6], [1.15, 0.082, 0.6], [1.05, 0.052, 0.64], [0.95, 0.018, 0.7], [0.86, 0.0, 0.75], [0.78, 0.0, 0.78],
    ].map(([x, y, z]) => [x, y + 0.01, z]);
    const ramp = make('trackRamp', { pts: rampPts });
    addWorld(ramp, 'city');
    const segs = ramp.userData.segs;
    // floating colliders (groups of segments) and xz samples for keep-out
    for (let i = 0; i < segs.length; i += 3) {
      const grp = segs.slice(i, i + 4);
      const b = new THREE.Box3();
      for (const s of grp) b.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));
      b.min.x -= 0.025; b.max.x += 0.025; b.min.z -= 0.025; b.max.z += 0.025; b.min.y -= 0.011; b.max.y += 0.004;
      colliders.push(b);
    }
    for (const s of segs) rampXZ.push([s.x, s.z]);
    // supports under the elevated parts (not across the avenue)
    let lastSup = -1;
    segs.forEach((s, i) => {
      if (s.y < 0.03 || i - lastSup < 5) return;
      if (s.x > 1.38 && s.z > HZ - 0.12 && s.z < HZ + 0.1) return;
      if (s.x < 1.0 && s.y < 0.04) return;
      lastSup = i;
      const col = make('column', { h: s.y - 0.0105, r: 0.011, color: C.white });
      put(col, s.x, s.z, 0, i);
      commit(col, null, 0, 0, 0, 'city');
    });
    // a little car rolling on the ramp
    {
      const car = make('raceCar', { color: C.red });
      const s = segs[6], n = segs[7];
      const yaw = Math.atan2(n.x - s.x, n.z - s.z), pitch = -Math.atan2(n.y - s.y, Math.hypot(n.x - s.x, n.z - s.z));
      car.rotation.order = 'YXZ';
      car.rotation.set(pitch, yaw, 0);
      car.position.set(s.x, 0, s.z);
      box.setFromObject(car);
      car.position.y = s.y + 0.0045 - box.min.y;
      commit(car, null, 0, 0, 0, 'city', true);
    }
    // the ramp's low entrance and exit are walkable floor: keep the exact avenue/lanes free below
    // --- loose blocks & small toys filling the city (kept off the avenue and the ramp) ---
    const cityReject = (x, z, r) => {
      if (x < BC.minX + r || x > BC.maxX - r || z < BC.minZ + r || z > BC.maxZ - r) return true;
      return floorReject(x, z, r, false);
    };
    const citySample = () => [rng.range(BC.minX, BC.maxX), rng.range(BC.minZ, BC.maxZ)];
    const filler = [
      ['woodenBlock', { shape: 'cube' }, 14], ['woodenBlock', { shape: 'tri' }, 3], ['woodenBlock', { shape: 'cyl' }, 3], ['woodenBlock', { shape: 'long' }, 3],
      ['archBlock', { w: 0.1, h: 0.09, ow: 0.06, oh: 0.065 }, 2], ['column', { h: 0.09 }, 2], ['roofBlock', {}, 2], ['plasticBrick', {}, 3],
      ['soldier', {}, 2], ['sedan', {}, 2], ['dice', {}, 2], ['letterTile', {}, 2], ['cone', {}, 1], ['domino', {}, 3],
    ];
    for (const [t, o, n] of filler) {
      for (let k = 0; k < n; k++) place(FL, make(t, o), { sample: citySample, reject: cityReject, tries: 60, pack: 0.7 });
    }
  }

  // ======================= more floor: dense clusters near the nightstand, toy box, chair =======================
  const rep = (n, f) => { for (let k = 0; k < n; k++) f(k); };
  rep(2, () => onFloor('dumpTruck'));
  onFloor('fireTruck');
  onFloor('schoolBus');
  onFloor('airplane');
  rep(2, () => onFloor('cardboardHouse'));
  onFloor('cardboardTower', { h: 0.2 });
  onFloor('teddyBear', {}, { tip: 0.4 });
  onFloor('knitPlush', {}, { tip: 0.4 });
  onFloor('plushBunny', {}, { tip: 0.3 });
  onFloor('plushElephant', {}, { tip: 0.3 });
  onFloor('rocket', {}, { tip: 0.5 });
  onFloor('sailboat');
  onFloor('drum');
  onFloor('stackingRings');
  rep(2, () => onFloor('robot'));
  rep(2, () => onFloor('trainWagon'));
  rep(2, () => onFloor('pictureBook'));
  rep(2, () => onFloor('ropeCoil'));
  rep(2, () => onFloor('bucket'));
  rep(2, () => onFloor('racket'));
  rep(5, () => onFloor('sedan', { taxi: rng.next() < 0.3 }));
  rep(4, () => onFloor('raceCar'));
  rep(6, () => onFloor('ball'));
  rep(3, () => onFloor('baseball'));
  rep(2, () => onFloor('spinningTop', {}, { tip: 0.3 }));
  rep(4, () => onFloor('bowlingPin', {}, { tip: 0.5 }));
  rep(3, () => onFloor('toyAnimal', {}, { tip: 0.2 }));
  rep(4, () => onFloor('book', {}, { tip: 0.1 }));
  rep(4, () => onFloor('plasticBrick'));
  rep(2, () => onFloor('funnel'));
  rep(2, () => onFloor('tinCan', { pencils: rng.next() < 0.5 }));
  onFloor('marbleBag');
  rep(2, () => onFloor('sneaker'));
  rep(2, () => onFloor('crayonBox'));
  rep(4, () => onFloor('soldier'));
  rep(2, () => onFloor('penguin'));
  rep(2, () => onFloor('giraffe'));
  rep(2, () => onFloor('camel'));
  rep(3, () => onFloor('chessKnight'));
  rep(3, () => onFloor('trafficSign'));
  rep(2, () => onFloor('barrier'));
  rep(3, () => onFloor('cone'));
  rep(3, () => onFloor('shuttlecock'));
  rep(2, () => onFloor('spoon'));
  onFloor('yoyo');
  rep(2, () => onFloor('yoyo'));
  rep(6, () => onFloor('dice'));
  rep(6, () => onFloor('letterTile', { letter: rng.pick(LETTERS) }));
  rep(3, () => onFloor('jacks'));
  // dominoes in a loose line
  {
    const d0 = onFloor('domino');
    if (d0) rep(6, () => onFloor('domino', {}, { sample: near(d0.position.x, d0.position.z, 0.13), reject: floorReject }));
  }
  // wooden-block towers (3-4 high, slightly crooked) and stray blocks
  rep(3, () => {
    const first = onFloor('woodenBlock', { shape: 'cube', letters: true }, { yaw: rng.range(0, PI * 2) });
    if (!first) return;
    const cx = first.position.x, cz = first.position.z;
    let top = box.setFromObject(first).max.y;
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const b = make('woodenBlock', { shape: rng.pick(['cube', 'cube', 'tri']) });
      put(b, cx + rng.range(-0.006, 0.006), cz + rng.range(-0.006, 0.006), top, rng.range(0, PI * 2), null);
      commit(b, null, 0, 0, 0, 'floor');
      top = box.max.y;
    }
  });
  rep(8, () => onFloor('woodenBlock', {}, { tip: 0.1 }));
  rep(3, () => onFloor('archBlock', { w: 0.1, h: 0.09, ow: 0.06, oh: 0.065 }));
  rep(2, () => onFloor('halfArch'));
  rep(2, () => onFloor('column', { h: 0.09 }));
  rep(2, () => onFloor('roofBlock'));
  // marbles in loose clusters
  rep(2, () => {
    const m0 = onFloor('marble');
    if (m0) rep(4, () => onFloor('marble', {}, { sample: near(m0.position.x, m0.position.z, 0.08), reject: floorReject }));
  });
  rep(4, () => onFloor('crayon'));
  rep(3, () => onFloor('pencil'));
  // bunting hung across the bed footboard
  if (S.bed) {
    const B = F.bed, z = B.z + B.d / 2 + 0.012;
    addWorld(make('beadGarland', { a: [B.x - B.w / 2 + 0.06, 0.65, z], b: [B.x + B.w / 2 - 0.06, 0.65, z], sag: 0.1 }), 'bed');
  }

  // ======================= merge static toys by material =======================
  const CELL = 2.0;
  const buckets = new Map();
  const tmp = new THREE.Vector3();
  let sourceMeshes = 0;
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      sourceMeshes++;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingBox();
      g.boundingBox.getCenter(tmp);
      const key = `${o.material.uuid}|${tmp.x < 0.2 ? 0 : 1}`;
      let bk = buckets.get(key);
      if (!bk) { bk = { mat: o.material, geos: [] }; buckets.set(key, bk); }
      bk.geos.push(g);
    });
  }
  const mergedMeshes = [];
  for (const bk of buckets.values()) {
    const merged = mergeGeometries(bk.geos, false);
    for (const g of bk.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, bk.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'toysMerged';
    mergedMeshes.push(mesh);
  }
  for (const root of roots) scene.remove(root);
  for (const m of mergedMeshes) scene.add(m);

  stats.total = Object.entries(stats).reduce((a, [k, v]) => a + (k === 'total' ? 0 : v), 0);
  stats.targets = targets.length;
  stats.mergedMeshes = mergedMeshes.length;
  stats.sourceMeshes = sourceMeshes;
  stats.colliders = colliders.length;
  return { colliders, targets, stats };
}
