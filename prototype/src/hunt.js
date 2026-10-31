// Find-the-toys game: aim the center of the screen at a target and click.
import * as THREE from 'three';

export function createHunt(scene, camera, targets, ui) {
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  raycaster.far = 3;
  const center = new THREE.Vector2(0, 0);
  const found = new Set();
  const total = targets.length;

  function render() {
    if (!ui.hunt) return;
    const items = targets
      .map((t) => {
        const done = found.has(t);
        return `<li class="${done ? 'found' : ''}"${done ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${done ? '✓ ' : ''}${t.name}</li>`;
      })
      .join('');
    ui.hunt.innerHTML = `<h3>さがしもの (${found.size}/${total})</h3><ul>${items}</ul>`;
  }

  function ownerOf(obj) {
    for (let o = obj; o; o = o.parent) {
      const t = targets.find((x) => x.object === o);
      if (t) return t;
    }
    return null;
  }

  function pulse(obj) {
    const s0 = obj.scale.clone();
    const y0 = obj.position.y;
    const h = obj.userData?.height ?? 0.1;
    const t0 = performance.now();
    const dur = 800;
    function step(now) {
      const t = Math.min((now - t0) / dur, 1);
      const k = 1 + 0.35 * Math.sin(Math.PI * t) * (1 - t * 0.5);
      obj.scale.copy(s0).multiplyScalar(k);
      obj.position.y = y0 + h * 0.4 * Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else { obj.scale.copy(s0); obj.position.y = y0; }
    }
    requestAnimationFrame(step);
  }

  render();

  return {
    // point: optional screen position in normalized device coords (default: crosshair)
    onClick(point = center) {
      camera.updateMatrixWorld();
      raycaster.setFromCamera(point, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      if (!hits.length) return;
      const t = ownerOf(hits[0].object);
      if (!t || found.has(t)) return;
      found.add(t);
      pulse(t.object);
      render();
      ui.showToast('みつけた！ ' + t.name);
      if (found.size === total) setTimeout(() => ui.showToast('ぜんぶ みつけた！'), 1300);
    },
  };
}
