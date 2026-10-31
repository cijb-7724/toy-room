import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { CAMERA } from './scale.js';
import { createRng } from './rng.js';
import { buildRoom } from './room.js';
import { scatterToys } from './scatter.js';
import { createControls } from './controls.js';
import { createHunt } from './hunt.js';
import { PAGES } from './pages.js';
import { createPhoto } from './photo.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
// Soft studio reflections so plastic, tin and varnished wood read as real materials.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12; // night: only faint reflections
const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);

// Contracts between modules:
//   buildRoom(scene)                 → { colliders: Box3[], surfaces: Surface[] }
//   scatterToys(scene, surfaces, rng) → { colliders: Box3[], targets: Target[] }
//   createControls(camera, dom, colliders, pages, ui) → { update(dt), lock() }
//   createHunt(scene, camera, targets, ui) → { onClick() }
// Surface = { name, minX, maxX, minZ, maxZ, y }   (a flat area toys can sit on)
// Target  = { name: string (Japanese label), object: Object3D }
const room = buildRoom(scene);
const toys = scatterToys(scene, room.surfaces, createRng(20261101));
const colliders = [...room.colliders, ...toys.colliders];

const ui = {
  status: document.getElementById('status'),
  hunt: document.getElementById('hunt'),
  toast: document.getElementById('toast'),
  showToast(text) {
    this.toast.textContent = text;
    this.toast.style.opacity = 1;
    clearTimeout(this._t);
    this._t = setTimeout(() => (this.toast.style.opacity = 0), 1600);
  },
};

const controls = createControls(camera, renderer.domElement, colliders, PAGES, ui);
const hunt = createHunt(scene, camera, toys.targets, ui);

const start = document.getElementById('start');
start.addEventListener('click', () => {
  start.remove();
  controls.lock();
});
// Click picks whatever is under the crosshair. Without pointer lock, dragging
// looks around, so only a click that didn't drag counts as a pick.
renderer.domElement.addEventListener('click', (e) => {
  if (document.pointerLockElement === renderer.domElement) hunt.onClick();
  else if (!controls.wasDrag) {
    hunt.onClick(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
  }
});

// On-screen buttons: walk / fly and the three spreads.
const modeButtons = document.querySelectorAll('[data-mode]');
for (const b of modeButtons) b.addEventListener('click', () => controls.setMode(b.dataset.mode));
for (const b of document.querySelectorAll('[data-page]')) {
  b.addEventListener('click', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + b.dataset.page }));
  });
}
// Keep keyboard focus off the buttons so Space/Enter never "press" them again.
for (const b of document.querySelectorAll('#bar button')) {
  b.tabIndex = -1;
  b.addEventListener('mousedown', (e) => e.preventDefault());
}

addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));

const photo = createPhoto(renderer, scene, camera, colliders);

// On a spread, black bars slide in to frame a 2:1 band like an open picture book.
// The view always renders full screen; the field of view widens as the bars
// close so the band keeps the same framing and nothing jumps.
const SPREAD_ASPECT = 2;
const bars = ['top', 'bottom'].map((side) => {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:0;right:0;${side}:0;height:0;background:#000;pointer-events:none`;
  document.body.appendChild(el);
  return el;
});
let band = 1; // 0 = full screen, 1 = 2:1 spread
let bandFov = PAGES[0].fov ?? CAMERA.fov;
let lensFov = bandFov;
let lastSize = '';
function render(dt) {
  const w = innerWidth, h = innerHeight;
  if (`${w}x${h}` !== lastSize) {
    lastSize = `${w}x${h}`;
    photo.setSize(w, h);
  }
  const target = controls.targetPage;
  band += ((target >= 0 ? 1 : 0) - band) * (1 - Math.exp(-4 * dt));
  // Each spread has its own lens (vertical FOV inside the band); exploring uses the default.
  if (target >= 0) bandFov = PAGES[target].fov ?? CAMERA.fov;
  lensFov += (bandFov - lensFov) * (1 - Math.exp(-4 * dt));
  const fov = CAMERA.fov + (lensFov - CAMERA.fov) * band;
  const bandH = Math.min(h, w / SPREAD_ASPECT);
  const vh = h + (bandH - h) * band;
  const bar = (h - vh) / 2;
  for (const el of bars) el.style.height = bar.toFixed(1) + 'px';
  camera.aspect = w / h;
  camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (h / vh))) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  photo.render(dt, target >= 0 ? PAGES[target].focus : undefined);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update(dt);
  for (const b of modeButtons) b.classList.toggle('on', b.dataset.mode === controls.mode);
  render(dt);
});

// For debugging from the browser console.
window.__app = { scene, camera, renderer, controls, toys, hunt, photo, PAGES };
