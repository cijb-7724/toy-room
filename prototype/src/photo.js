// "Photographed" finish: shallow depth of field that focuses on whatever is at
// the center of the view, then print-like grain, a soft vignette and a gentle
// warm-highlights / cool-shadows grade.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.03 },
    vignette: { value: 0.35 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette, aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // split tone: cool shadows, warm highlights (tungsten key, blue fill)
      c = mix(c, c * vec3(0.9, 0.97, 1.12), (1.0 - smoothstep(0.0, 0.45, l)) * 0.5);
      c = mix(c, c * vec3(1.06, 1.0, 0.9), smoothstep(0.45, 1.0, l) * 0.5);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.35, 1.0, length(d) * 1.1);
      float n = hash(vUv * 1000.0 + fract(time) * 37.0) - 0.5;
      c += n * grain * (1.0 - l * 0.6);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPhoto(renderer, scene, camera, colliders) {
  // The renderer's own antialias does not reach an EffectComposer, so its
  // render targets get MSAA themselves (otherwise every edge crawls when moving).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 1, aperture: 0.002, maxblur: 0.012 });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  // Autofocus on the nearest collider, wall or floor along the view axis.
  // (Boxes are cheap to test; raycasting the merged toy meshes every frame is not.)
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let focus = 1;
  let grainClock = 0;
  function measureFocus() {
    camera.getWorldPosition(ray.origin);
    camera.getWorldDirection(ray.direction);
    let best = 4;
    for (const b of colliders) {
      if (b.containsPoint(ray.origin)) continue;
      if (ray.intersectBox(b, hit)) best = Math.min(best, hit.distanceTo(ray.origin));
    }
    if (ray.intersectPlane(floor, hit)) best = Math.min(best, hit.distanceTo(ray.origin));
    return Math.max(best, 0.02);
  }

  return {
    get focus() {
      return focus;
    },
    setPixelRatio(pr) {
      composer.setPixelRatio(pr);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      finish.uniforms.aspect.value = w / h;
    },
    // fixedFocus: a spread's chosen focus distance; otherwise autofocus.
    render(dt, fixedFocus) {
      focus += ((fixedFocus ?? measureFocus()) - focus) * Math.min(1, dt * 6);
      bokeh.uniforms.focus.value = focus;
      // Blur grows relative to the focus distance, like a real lens: close-up
      // shots get a very shallow focus, the whole-room view stays mostly sharp.
      bokeh.uniforms.aperture.value = 0.004 / focus;
      // grain changes 12 times a second like film, not every frame (reads as flicker)
      grainClock += dt;
      finish.uniforms.time.value = Math.floor(grainClock * 12) / 12;
      composer.render(dt);
    },
  };
}
