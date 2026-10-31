// World scale rules. 1 unit = 1 meter. See docs/requirements.md §3.

export const ROOM = {
  width: 4.0,   // x: -2.0 .. 2.0
  depth: 3.6,   // z: -1.8 .. 1.8  (z = -1.8 is the window wall)
  height: 2.5,
};

export const PLAYER = {
  height: 0.08,     // a small toy figure
  eye: 0.07,
  radius: 0.015,
  walkSpeed: 0.25,  // m/s, feels quick at this size
  runSpeed: 0.6,    // with Ctrl held
  flySpeed: 0.8,
  jump: 0.9,        // initial upward velocity (m/s) → ~4cm jump
  stepUp: 0.025,    // can climb onto anything this low without jumping
  gravity: 9.8,
};

export const CAMERA = {
  fov: 70,
  near: 0.003,
  far: 30,
};

// Furniture footprints (center x, z and size). room.js builds these; scatter.js
// uses the same numbers to know where tops and shelves are.
export const FURNITURE = {
  bed:        { x: -1.35, z: -0.55, w: 1.0,  d: 2.0,  h: 0.48 },
  nightstand: { x: -0.25, z: -1.52, w: 0.5,  d: 0.45, h: 0.62, shelfY: 0.14, drawerY: 0.46 },
  lamp:       { x: -0.12, z: -1.6 },        // stands on the nightstand
  toyBox:     { x: 1.35,  z: -1.3,  w: 0.9,  d: 0.5,  h: 0.5 },
  chair:      { x: 1.2,   z: 0.6,   w: 0.45, d: 0.45, seat: 0.45, back: 0.95 },
  bookshelf:  { x: 1.8,   z: -0.25, w: 0.3,  d: 0.9,  h: 1.1, shelves: [0.02, 0.38, 0.74] },
  window:     { x: 0.3,   y: 0.95,  w: 1.3,  h: 1.1 },   // on the z = -1.8 wall
  door:       { z: 1.0,   w: 0.85,  h: 2.05 },          // on the x = -2.0 wall
  // Arched hole at the bottom of the x = +2.0 wall, behind the chair. It leads to
  // the next world (a miniature town in a space behind the wall, x 2.0 .. 3.2).
  wallHole:   { z: 0.75,  w: 0.16,  h: 0.15 },
  nextWorld:  { minX: 2.0, maxX: 3.2, minZ: 0.25, maxZ: 1.25, h: 0.6 },
  // Block "city" built on the floor between the chair and the hole.
  blockCity:  { minX: 1.45, maxX: 1.97, minZ: 0.3, maxZ: 1.25 },
};
