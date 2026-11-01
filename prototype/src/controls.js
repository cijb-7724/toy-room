import * as THREE from 'three';
import { ROOM, PLAYER } from './scale.js';

const SENS = 0.0022;
const PITCH_MAX = (89 * Math.PI) / 180;
const EPS = 1e-5;
const WALL_MARGIN = 0.01;
const PAGE_ANIM_TIME = 1.2;
const FLY_R = 0.01; // fly-mode camera collision half-size (m)
const MAX_SUBSTEP_DIST = 0.004; // metres of travel per physics substep (boards are >= 1cm)

const HX = ROOM.width / 2;
const HZ = ROOM.depth / 2;

// smootherstep: gentle start and stop without the lurch of a cubic ease
function ease(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createControls(camera, domElement, colliders, pages, ui) {
  camera.rotation.order = 'YXZ';

  let mode = 'fly';
  let yaw = 0;
  let pitch = 0;
  // In walk mode `pos` is the feet position; in fly mode it is the camera position.
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let grounded = false;
  let pageIdx = -1; // page the camera is sitting at, or -1 once the user has moved
  let anim = null;
  let lastStatus = null;

  const keys = Object.create(null);
  const isLocked = () => document.pointerLockElement === domElement;

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);

  // The camera chases the target look direction and eye height a little, so
  // mouse look and stepping onto things glide instead of snapping.
  let viewYaw = 0;
  let viewPitch = 0;
  let eyeY = 0;
  function applyCamera(dt = 0) {
    const look = dt ? 1 - Math.exp(-28 * dt) : 1;
    viewYaw += (yaw - viewYaw) * look;
    viewPitch += (pitch - viewPitch) * look;
    const y = mode === 'walk' ? pos.y + PLAYER.eye : pos.y;
    eyeY = dt && mode === 'walk' ? eyeY + (y - eyeY) * (1 - Math.exp(-18 * dt)) : y;
    camera.position.set(pos.x, eyeY, pos.z);
    camera.rotation.set(viewPitch, viewYaw, 0, 'YXZ');
  }
  function snapView() {
    viewYaw = yaw;
    viewPitch = pitch;
  }

  function clampFly(p) {
    p.x = Math.min(HX - WALL_MARGIN, Math.max(-HX + WALL_MARGIN, p.x));
    p.z = Math.min(HZ - WALL_MARGIN, Math.max(-HZ + WALL_MARGIN, p.z));
    p.y = Math.min(ROOM.height - WALL_MARGIN, Math.max(0.01, p.y));
  }

  function setMode(m) {
    if (m === mode) return;
    if (m === 'walk') {
      pos.y = Math.max(0, pos.y - PLAYER.eye); // camera -> feet
      vel.set(0, 0, 0);
      grounded = false;
    } else {
      pos.y += PLAYER.eye; // feet -> camera
      vel.set(0, 0, 0);
    }
    mode = m;
  }

  function startPage(i) {
    const pg = pages[i];
    if (!pg) return;
    anim = {
      t: 0,
      i,
      fromPos: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      toPos: new THREE.Vector3(...pg.position),
      toQuat: new THREE.Quaternion(),
    };
    tmpM.lookAt(anim.toPos, tmpV.set(...pg.lookAt), UP);
    anim.toQuat.setFromRotationMatrix(tmpM);
    // Longer trips take longer so the glide speed feels the same.
    const dist = anim.fromPos.distanceTo(anim.toPos);
    const turn = anim.fromQuat.angleTo(anim.toQuat);
    anim.dur = Math.min(2.6, Math.max(PAGE_ANIM_TIME, 0.9 + dist * 0.55 + turn * 0.25));
    setMode('fly');
    pos.copy(anim.fromPos);
    vel.set(0, 0, 0);
    pageIdx = -1;
    ui.showToast(pg.title);
  }

  function finishAnim() {
    const a = anim;
    anim = null;
    pos.copy(a.toPos);
    camera.position.copy(pos);
    camera.quaternion.copy(a.toQuat);
    camera.rotation.setFromQuaternion(a.toQuat, 'YXZ');
    yaw = camera.rotation.y;
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, camera.rotation.x));
    snapView();
    applyCamera();
    pageIdx = a.i;
  }

  // ---- input ----
  // Mouse look works with pointer lock, or by dragging when lock is unavailable
  // (e.g. inside an embedded browser pane).
  let dragging = false;
  let dragMoved = 0;
  function onMouseMove(e) {
    if (anim) return;
    if (!isLocked() && !dragging) return;
    yaw -= e.movementX * SENS;
    pitch -= e.movementY * SENS;
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    if (dragging) dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (e.movementX || e.movementY) pageIdx = -1;
  }

  function changeMode(m) {
    if (anim) {
      // cancel the camera move and continue from the current pose
      pos.copy(camera.position);
      camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
      yaw = camera.rotation.y;
      pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, camera.rotation.x));
      snapView();
      anim = null;
    }
    if (m !== mode) setMode(m);
    pageIdx = -1;
  }

  function onKeyDown(e) {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) changeMode(mode === 'walk' ? 'fly' : 'walk');
      return;
    }
    const m = /^Digit([1-5])$/.exec(e.code);
    if (m) {
      if (!e.repeat) startPage(Number(m[1]) - 1);
      return;
    }
    if (e.code === 'Space' || e.code.startsWith('Control') || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) jumpPressed = true;
    keys[e.code] = true;
  }
  let jumpPressed = false;

  domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isLocked()) return;
    dragging = true;
    dragMoved = 0;
  });
  window.addEventListener('mouseup', () => (dragging = false));

  function onKeyUp(e) {
    keys[e.code] = false;
    if (e.code === 'Space') jumpPressed = false;
  }

  function clearKeys() {
    for (const k in keys) keys[k] = false;
  }

  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('pointerlockchange', () => {
    if (!isLocked()) clearKeys();
  });

  // ---- walk physics ----
  const r = PLAYER.radius;
  const H = PLAYER.height;

  // Does the player box at (x, y, z) overlap box b?
  function overlaps(b, x, y, z) {
    return (
      x + r > b.min.x && x - r < b.max.x &&
      z + r > b.min.z && z - r < b.max.z &&
      y + H > b.min.y + EPS && y < b.max.y - EPS
    );
  }

  function overlapsXZ(b, x, z) {
    return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z;
  }

  // Try to move along one horizontal axis ('x' or 'z') by d.
  function moveAxis(axis, d) {
    if (d === 0) return;
    const ox = pos.x, oz = pos.z;
    let nx = ox, nz = oz;
    if (axis === 'x') nx += d; else nz += d;
    nx = Math.min(HX - r - WALL_MARGIN, Math.max(-HX + r + WALL_MARGIN, nx));
    nz = Math.min(HZ - r - WALL_MARGIN, Math.max(-HZ + r + WALL_MARGIN, nz));

    let stepY = pos.y;
    let blocked = false;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (!overlaps(b, nx, pos.y, nz)) continue;
      if (b.max.y - pos.y <= PLAYER.stepUp) stepY = Math.max(stepY, b.max.y);
      else { blocked = true; break; }
    }
    if (!blocked && stepY > pos.y) {
      // re-check at the raised height (e.g. a low ceiling above)
      for (let i = 0; i < colliders.length; i++) {
        if (overlaps(colliders[i], nx, stepY, nz)) { blocked = true; break; }
      }
    }
    if (blocked) {
      if (axis === 'x') vel.x = 0; else vel.z = 0;
      return;
    }
    pos.x = nx;
    pos.z = nz;
    if (stepY > pos.y) {
      pos.y = stepY;
      if (vel.y < 0) vel.y = 0;
    }
  }

  function moveVertical(dy) {
    const prevY = pos.y;
    let ny = prevY + dy;
    grounded = false;
    if (dy <= 0) {
      let top = 0; // floor
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (!overlapsXZ(b, pos.x, pos.z)) continue;
        if (b.max.y <= prevY + EPS && b.max.y > top && b.max.y + EPS > ny && b.min.y < b.max.y) {
          // only boxes whose top we are at/above and have crossed this step
          if (b.max.y >= ny - EPS) top = b.max.y;
        }
      }
      if (ny <= top) {
        ny = top;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      }
    } else {
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (!overlapsXZ(b, pos.x, pos.z)) continue;
        if (prevY + H <= b.min.y + EPS && ny + H > b.min.y) {
          ny = Math.min(ny, b.min.y - H);
          vel.y = 0;
        }
      }
      if (ny + H > ROOM.height) { ny = ROOM.height - H; vel.y = 0; }
    }
    pos.y = ny;
  }

  function walkUpdate(dt, active) {
    // desired horizontal velocity
    let fx = 0, fz = 0;
    if (active) {
      if (keys.KeyW || keys.ArrowUp) fz -= 1;
      if (keys.KeyS || keys.ArrowDown) fz += 1;
      if (keys.KeyD || keys.ArrowRight) fx += 1;
      if (keys.KeyA || keys.ArrowLeft) fx -= 1;
    }
    const len = Math.hypot(fx, fz);
    let tx = 0, tz = 0;
    if (len > 0) {
      const speed = keys.ControlLeft || keys.ControlRight ? PLAYER.runSpeed : PLAYER.walkSpeed;
      fx /= len; fz /= len;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      // forward = (-sin, -cos); right = (cos, -sin)
      tx = (fx * c + fz * s) * speed;
      tz = (-fx * s + fz * c) * speed;
      pageIdx = -1;
    }
    // smooth horizontal acceleration (faster response on the ground)
    const k = 1 - Math.exp(-(grounded ? 14 : 4) * dt);
    vel.x += (tx - vel.x) * k;
    vel.z += (tz - vel.z) * k;

    // One jump per press: holding Space must not bounce on every landing.
    if (active && jumpPressed && grounded) {
      jumpPressed = false;
      vel.y = PLAYER.jump;
      grounded = false;
      pageIdx = -1;
    }

    // substep so thin boards are never tunnelled through
    const maxSpeed = Math.max(Math.hypot(vel.x, vel.z), Math.abs(vel.y) + PLAYER.gravity * dt);
    const n = Math.min(100, Math.max(1, Math.ceil((maxSpeed * dt) / MAX_SUBSTEP_DIST)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      vel.y -= PLAYER.gravity * h;
      moveAxis('x', vel.x * h);
      moveAxis('z', vel.z * h);
      moveVertical(vel.y * h);
    }
  }

  // ---- fly ----
  function flyUpdate(dt, active) {
    const tv = tmpV.set(0, 0, 0);
    if (active) {
      let f = 0, s = 0, u = 0;
      if (keys.KeyW || keys.ArrowUp) f += 1;
      if (keys.KeyS || keys.ArrowDown) f -= 1;
      if (keys.KeyD || keys.ArrowRight) s += 1;
      if (keys.KeyA || keys.ArrowLeft) s -= 1;
      if (keys.Space) u += 1;
      if (keys.ShiftLeft || keys.ShiftRight) u -= 1;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      // look dir = (-sy*cp, sp, -cy*cp); right = (cy, 0, -sy)
      tv.set(
        -sy * cp * f + cy * s,
        sp * f + u,
        -cy * cp * f - sy * s
      );
      if (tv.lengthSq() > 0) {
        const speed = PLAYER.flySpeed * (keys.ControlLeft || keys.ControlRight ? 2.5 : 1);
        tv.normalize().multiplyScalar(speed);
        pageIdx = -1;
      }
    }
    const k = 1 - Math.exp(-8 * dt);
    vel.x += (tv.x - vel.x) * k;
    vel.y += (tv.y - vel.y) * k;
    vel.z += (tv.z - vel.z) * k;
    // substep per axis so the camera slides along toys instead of passing through
    const n = Math.min(100, Math.max(1, Math.ceil((vel.length() * dt) / MAX_SUBSTEP_DIST)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      flyAxis('x', vel.x * h);
      flyAxis('y', vel.y * h);
      flyAxis('z', vel.z * h);
    }
    clampFly(pos);
  }

  // Fly camera is a small cube of half-size FLY_R. A step is refused only if it
  // enters a box it was not already inside, so a camera that starts inside can leave.
  function insideFly(b, x, y, z) {
    return (
      x + FLY_R > b.min.x && x - FLY_R < b.max.x &&
      y + FLY_R > b.min.y && y - FLY_R < b.max.y &&
      z + FLY_R > b.min.z && z - FLY_R < b.max.z
    );
  }
  function flyAxis(axis, d) {
    if (d === 0) return;
    const nx = pos.x + (axis === 'x' ? d : 0);
    const ny = pos.y + (axis === 'y' ? d : 0);
    const nz = pos.z + (axis === 'z' ? d : 0);
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (insideFly(b, nx, ny, nz) && !insideFly(b, pos.x, pos.y, pos.z)) {
        vel[axis] = 0;
        return;
      }
    }
    if (ny - FLY_R < 0 && d < 0) { vel.y = 0; return; } // floor
    pos.set(nx, ny, nz);
  }

  function updateStatus() {
    let s = mode === 'walk'
      ? `モード: 歩く（人形サイズ ${Math.round(PLAYER.height * 100)}cm）`
      : 'モード: 飛ぶ';
    if (pageIdx >= 0 && pages[pageIdx]) s += `　／　${pages[pageIdx].title}`;
    if (s !== lastStatus) {
      lastStatus = s;
      if (ui.status) ui.status.textContent = s;
    }
  }

  // ---- initial state: page 1 view, fly mode ----
  {
    const pg = pages[0];
    pos.set(...pg.position);
    tmpM.lookAt(pos, tmpV.set(...pg.lookAt), UP);
    tmpQ.setFromRotationMatrix(tmpM);
    camera.rotation.setFromQuaternion(tmpQ, 'YXZ');
    yaw = camera.rotation.y;
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, camera.rotation.x));
    pageIdx = 0;
    snapView();
    applyCamera();
    updateStatus();
  }

  return {
    // Page the camera is resting at (-1 while moving or exploring).
    get pageIndex() {
      return anim ? -1 : pageIdx;
    },
    get mode() {
      return mode;
    },
    setMode: changeMode,
    // True if the last mouse press turned into a drag (so it isn't a "pick" click).
    get wasDrag() {
      return dragMoved > 4;
    },
    // Page the camera is resting at or flying to (-1 while exploring).
    get targetPage() {
      return anim ? anim.i : pageIdx;
    },
    lock() {
      // Rejected when the page is embedded or not focused; mouse look just stays off.
      domElement.requestPointerLock()?.catch?.(() => {});
    },
    update(dt) {
      dt = Math.min(Math.max(dt, 0), 0.05);
      if (anim) {
        anim.t = Math.min(1, anim.t + dt / anim.dur);
        const e = ease(anim.t);
        camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
        camera.quaternion.slerpQuaternions(anim.fromQuat, anim.toQuat, e);
        if (anim.t >= 1) finishAnim();
      } else {
        const active = true;
        if (mode === 'walk') walkUpdate(dt, active);
        else flyUpdate(dt, active);
        applyCamera(dt);
      }
      updateStatus();
    },
  };
}
