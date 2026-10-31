// Picture-book spreads: fixed two-page compositions inside the one room.
// Each spread moves closer to the hole at the bottom of the wall, so the story
// shrinks from "the whole room" down to "the doorway to the next world".
// Shown with a 2:1 frame (two square pages side by side). `fov` is the lens
// (vertical field of view inside the frame, in degrees; a normal lens, not the
// wide exploring view) and `focus` the focus distance in meters.

export const PAGES = [
  { title: '見開き1　おもちゃのへや', position: [0.45, 2.3, 1.75],  lookAt: [-0.1, 0.3, -0.85], fov: 48, focus: 2.6 },
  { title: '見開き2　ゆかの たかさ',   position: [0.2, 0.14, -0.55], lookAt: [1.6, 0.13, 0.7],   fov: 44, focus: 1.15 },
  { title: '見開き3　かべの あな',     position: [0.68, 0.065, 0.73], lookAt: [2.0, 0.24, 0.75], fov: 55, focus: 1.0 },
];
