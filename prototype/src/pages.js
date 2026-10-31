// Picture-book spreads: fixed two-page compositions inside the one room.
// Each spread moves closer to the hole at the bottom of the wall, so the story
// shrinks from "the whole room" down to "the doorway to the next world".
// Shown with a 2:1 frame (two square pages side by side). `focus` is the lens
// focus distance in meters (what the photographer would focus on).

export const PAGES = [
  { title: '見開き1　おもちゃのへや', position: [0.55, 2.05, 1.55],  lookAt: [-0.05, 0.35, -0.75], focus: 2.6 },
  { title: '見開き2　ゆかの たかさ',   position: [0.55, 0.16, -0.15], lookAt: [1.65, 0.12, 0.75],  focus: 1.15 },
  { title: '見開き3　かべの あな',     position: [0.85, 0.065, 0.73], lookAt: [2.0, 0.16, 0.75],   focus: 0.95 },
];
