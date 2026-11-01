// Original cozy child's bedroom: shell, window, door, furniture, lights.
// 1 unit = 1 m. All layout comes from scale.js (ROOM / FURNITURE).
import * as THREE from 'three';
import { ROOM, FURNITURE as F } from './scale.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import * as TX from './textures.js';

export function buildRoom(scene) {
  const colliders = [];
  const surfaces = [];
  const root = new THREE.Group();
  root.name = 'room';
  scene.add(root);

  const HW = ROOM.width / 2;
  const HD = ROOM.depth / 2;
  const H = ROOM.height;

  // ---------- materials ----------
  const std = (color, rough = 0.7, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  const painted = (hex, rough = 0.45, seed = 3) =>
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.paint(hex, seed), roughness: rough, metalness: 0 });
  const M = {
    white: painted('#f1e8d6', 0.5, 3),
    cream: painted('#ecdcb8', 0.5, 4),
    orange: std(0xff7a10, 0.9),
    red: painted('#d81b1b', 0.38, 5),
    blue: std(0x2563eb, 0.5),
    cobalt: painted('#1648d6', 0.4, 6),
    yellow: painted('#ffc300', 0.45, 7),
    green: std(0x2fb457, 0.6),
    honey: painted('#d98a2b', 0.5, 8),
    trim: painted('#f0a020', 0.4, 9),
    brass: std(0xe8b84a, 0.3, { metalness: 0.6 }),
    bookBack: std(0xffd060, 0.8),
  };

  const floorT = TX.woodFloor();
  for (const t of [floorT.map, floorT.rough, floorT.bump]) t.repeat.set(ROOM.width / 2.0, ROOM.depth / 1.0);
  const wallTex = TX.polkaWall();
  const quilt = TX.quilt();
  quilt.map.repeat.set(1, 1);
  const gingTex = TX.gingham('#2f6fe0');
  gingTex.repeat.set(5, 9);
  // fine woven-cloth bump shared by the fabrics (own repeat per use)
  const weaveBump = (rx, ry) => { const t = TX.weave(); t.repeat.set(rx, ry); return t; };

  // ---------- helpers ----------
  const geoCache = new Map();
  const boxGeo = (w, h, d) => {
    const k = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`;
    let g = geoCache.get(k);
    if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
    return g;
  };
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const unitCyl = new THREE.CylinderGeometry(0.02, 0.014, 1, 12); // tapered, height 1
  const unitRod = new THREE.CylinderGeometry(1, 1, 1, 12);

  function add(geo, mat, x, y, z, parent = root, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  }
  const box = (mat, w, h, d, x, y, z, parent = root) => add(boxGeo(w, h, d), mat, x, y, z, parent);
  const ball = (mat, r, x, y, z, parent = root) => {
    const m = add(sphereGeo, mat, x, y, z, parent);
    m.scale.setScalar(r);
    return m;
  };
  // Tapered cylinder between two points (parent-local).
  function lean(parent, mat, a, b, radiusScale = 1) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(unitCyl, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.scale.set(radiusScale, len, radiusScale);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const col = (x0, y0, z0, x1, y1, z1) => {
    colliders.push(new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
  };
  const colC = (cx, cy, cz, w, h, d) =>
    col(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2);
  const surface = (name, minX, maxX, minZ, maxZ, y) => surfaces.push({ name, minX, maxX, minZ, maxZ, y });

  // ---------- shell ----------
  scene.background = new THREE.Color(0x0b1226);

  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: floorT.map, roughnessMap: floorT.rough, roughness: 0.5, metalness: 0,
    bumpMap: floorT.bump, bumpScale: 1.5, clearcoat: 0.25, clearcoatRoughness: 0.55, envMapIntensity: 0.6,
  });
  const floor = add(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMat, 0, 0, 0, root, false, true);
  floor.rotation.x = -Math.PI / 2;

  // Faint, heavily blurred sheen over the satin floor (no sharp mirror images): streaky (vertical taps), fades with distance, darkened at plank seams.
  {
    const rs = Reflector.ReflectorShader;
    const shader = {
      name: 'FloorReflectorShader',
      uniforms: {
        ...THREE.UniformsUtils.clone(rs.uniforms),
        tSeam: { value: floorT.bump },
        uvRepeat: { value: new THREE.Vector2(ROOM.width / 2.0, ROOM.depth / 1.0) },
        strength: { value: 0.06 },
      },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        uniform vec2 uvRepeat;
        varying vec4 vUv;
        varying vec2 vFloorUv;
        varying vec3 vWPos;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vUv = textureMatrix * vec4( position, 1.0 );
          vFloorUv = uv * uvRepeat;
          vWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform sampler2D tSeam;
        uniform float strength;
        varying vec4 vUv;
        varying vec2 vFloorUv;
        varying vec3 vWPos;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec2 uv = vUv.xy / vUv.w;
          float dist = distance( cameraPosition, vWPos );
          float far = smoothstep( 0.25, 3.5, dist );
          // vertical streak blur, longer with distance; slight sideways softening
          float len = mix( 0.03, 0.07, far );
          vec3 acc = vec3( 0.0 );
          float wsum = 0.0;
          for ( int i = -5; i <= 5; i++ ) {
            float f = float( i ) / 5.0;
            float w = exp( -f * f * 2.2 );
            vec2 o = vec2( f * f * 0.12 * len * sign( f ), f * len );
            acc += texture2D( tDiffuse, clamp( uv + o, 0.001, 0.999 ) ).rgb * w;
            wsum += w;
          }
          vec3 refl = acc / wsum;
          // plank seams (near-black in the bump map) swallow the reflection
          float seam = smoothstep( 0.06, 0.26, texture2D( tSeam, vFloorUv ).r );
          // grazing angles reflect more, far away fades
          vec3 V = normalize( cameraPosition - vWPos );
          float fres = mix( 0.55, 1.35, pow( 1.0 - clamp( V.y, 0.0, 1.0 ), 2.0 ) );
          float a = strength * fres * seam * ( 1.0 - 0.65 * far );
          gl_FragColor = vec4( refl, clamp( a, 0.0, 1.0 ) );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    };
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const dbw = () => Math.max(2, Math.round(window.innerWidth * dpr() / 2));
    const dbh = () => Math.max(2, Math.round(window.innerHeight * dpr() / 2));
    const refl = new Reflector(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), {
      textureWidth: dbw(), textureHeight: dbh(), clipBias: 0.003, shader, multisample: 2,
    });
    refl.name = 'floorReflector';
    refl.rotation.x = -Math.PI / 2;
    refl.position.y = 0.0004;
    refl.castShadow = false;
    refl.receiveShadow = false;
    refl.renderOrder = 1;
    const m = refl.material;
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.NormalBlending;
    // keep the mirror texture matched to the window size (half of the drawing buffer)
    const rt = refl.getRenderTarget();
    const baseBefore = refl.onBeforeRender;
    refl.onBeforeRender = function (renderer, sc, camera, ...rest) {
      const w = dbw(), h = dbh();
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      return baseBefore.call(this, renderer, sc, camera, ...rest);
    };
    root.add(refl);
  }

  const ceil = add(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), std(0xf6ecdc, 1), 0, H, 0, root, true, true);
  ceil.rotation.x = Math.PI / 2;
  ceil.material.shadowSide = THREE.DoubleSide;

  // Smooth painted cornflower plaster, darker toward the floor (world-y shader tweak).
  const wallMat = std(0xffffff, 0.9, { map: wallTex });
  wallMat.shadowSide = THREE.DoubleSide;
  wallMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 1.2, vWY)) * mix(1.0, 0.88, smoothstep(2.0, 2.5, vWY));');
  };

  const wh = F.wallHole, NW = F.nextWorld;
  const holeR = wh.w / 2;
  const WD = 0.08; // wall thickness at the hole

  function wall(width, hole, notch) {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0);
    if (notch) { // arched notch cut into the bottom edge (mouse hole)
      s.lineTo(notch.x - holeR, 0);
      s.lineTo(notch.x - holeR, notch.h - holeR);
      s.absarc(notch.x, notch.h - holeR, holeR, Math.PI, 0, true);
      s.lineTo(notch.x + holeR, 0);
    }
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, H);
    s.lineTo(-width / 2, H);
    s.closePath();
    if (hole) {
      const p = new THREE.Path();
      p.moveTo(hole.x0, hole.y0);
      p.lineTo(hole.x0, hole.y1);
      p.lineTo(hole.x1, hole.y1);
      p.lineTo(hole.x1, hole.y0);
      p.closePath();
      s.holes.push(p);
    }
    return new THREE.ShapeGeometry(s, 16);
  }
  const win = F.window;
  const wx0 = win.x - win.w / 2, wx1 = win.x + win.w / 2;
  const wy0 = win.y - win.h / 2, wy1 = win.y + win.h / 2;

  const wN = add(wall(ROOM.width, { x0: wx0, x1: wx1, y0: wy0, y1: wy1 }), wallMat, 0, 0, -HD);
  const wS = add(wall(ROOM.depth * 0 + ROOM.width), wallMat, 0, 0, HD);
  wS.rotation.y = Math.PI;
  const wW = add(wall(ROOM.depth), wallMat, -HW, 0, 0);
  wW.rotation.y = Math.PI / 2;
  // east wall (local x = world z): arched mouse-hole notch at z = wallHole.z
  const wE = add(wall(ROOM.depth, null, { x: wh.z, h: wh.h }), wallMat, HW, 0, 0);
  wE.rotation.y = -Math.PI / 2;
  wN.name = 'windowWall';

  // baseboards (warm white, 12 cm); east one is split around the hole
  const BB = 0.12, BT = 0.015;
  box(M.white, ROOM.width, BB, BT, 0, BB / 2, -HD + BT / 2);
  box(M.white, ROOM.width, BB, BT, 0, BB / 2, HD - BT / 2);
  box(M.white, BT, BB, ROOM.depth, -HW + BT / 2, BB / 2, 0);
  const gapA = wh.z - holeR - 0.035, gapB = wh.z + holeR + 0.035;
  box(M.white, BT, BB, gapA + HD, HW - BT / 2, BB / 2, (gapA - HD) / 2);
  box(M.white, BT, BB, HD - gapB, HW - BT / 2, BB / 2, (HD + gapB) / 2);
  col(-HW, 0, -HD, HW, BB, -HD + BT);
  col(-HW, 0, HD - BT, HW, BB, HD);
  col(-HW, 0, -HD, -HW + BT, BB, HD);
  col(HW - BT, 0, -HD, HW, BB, gapA);
  col(HW - BT, 0, gapB, HW, BB, HD);

  // walls + ceiling colliders (thick, just outside)
  const T = 0.5;
  col(-HW - T, -1, -HD - T, HW + T, H + 1, -HD); // window wall
  col(-HW - T, -1, HD, HW + T, H + 1, HD + T);
  col(-HW - T, -1, -HD - T, -HW, H + 1, HD + T);
  col(-HW - T, H, -HD - T, HW + T, H + 1, HD + T); // ceiling
  // east wall: thick except where the next world (miniature town) sits, there a thin slab with the hole
  col(HW, -1, -HD - T, NW.maxX + T, H + 1, NW.minZ);
  col(HW, -1, NW.maxZ, NW.maxX + T, H + 1, HD + T);
  col(HW, -1, NW.minZ, HW + WD, H + 1, wh.z - holeR);
  col(HW, -1, wh.z + holeR, HW + WD, H + 1, NW.maxZ);
  col(HW, wh.h, wh.z - holeR, HW + WD, H + 1, wh.z + holeR); // over the arch
  col(HW + WD, NW.h, NW.minZ, NW.maxX, H + 1, NW.maxZ); // town ceiling
  col(NW.maxX, -1, NW.minZ, NW.maxX + T, H + 1, NW.maxZ); // town far end

  // ---------- window ----------
  const fz = -HD;
  const BAR = 0.06;
  box(M.white, BAR, win.h, 0.04, wx0 + BAR / 2, win.y, fz);
  box(M.white, BAR, win.h, 0.04, wx1 - BAR / 2, win.y, fz);
  box(M.white, win.w - 2 * BAR, BAR, 0.04, win.x, wy1 - BAR / 2, fz);
  box(M.white, win.w - 2 * BAR, BAR, 0.04, win.x, wy0 + BAR / 2, fz);
  box(M.white, 0.035, win.h - 2 * BAR, 0.03, win.x, win.y, fz); // vertical mullion
  box(M.white, win.w - 2 * BAR, 0.035, 0.03, win.x, win.y + 0.08, fz); // horizontal mullion
  const TR = 0.07;
  box(M.white, TR, win.h + 2 * TR, 0.025, wx0 - TR / 2, win.y, fz + 0.0125);
  box(M.white, TR, win.h + 2 * TR, 0.025, wx1 + TR / 2, win.y, fz + 0.0125);
  box(M.white, win.w, TR, 0.025, win.x, wy1 + TR / 2, fz + 0.0125);
  const glass = add(
    new THREE.PlaneGeometry(win.w - 2 * BAR, win.h - 2 * BAR),
    new THREE.MeshStandardMaterial({ color: 0xdff1ff, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }),
    win.x, win.y, fz, root, false, false,
  );
  glass.renderOrder = 5;

  // outside: layered cards for parallax (sky far, trees, hedge, lawn, potted plants on the ledge)
  // tinted deep blue so the daytime cards read as a moonlit night garden
  const flat = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, color: 0x26355e, ...extra });
  const card = (w, h, z, y, mat, name) => {
    const m = add(new THREE.PlaneGeometry(w, h), mat, win.x, y, z, root, false, false);
    m.name = name;
    return m;
  };
  card(46, 24, -14, 7, flat(TX.sky()), 'sky');
  card(36, 5.5, -10, 2.6, flat(TX.treeline(), { transparent: true, depthWrite: false }), 'trees');
  card(12, 1.9, -3.8, 0.85, flat(TX.hedge(), { transparent: true, depthWrite: false }), 'hedge');
  const lawnTex = TX.lawn();
  lawnTex.repeat.set(10, 5);
  const lawn = add(new THREE.PlaneGeometry(30, 12), flat(lawnTex), win.x, 0.01, -HD - 6.1, root, false, false);
  lawn.rotation.x = -Math.PI / 2;
  {
    const ledgeY = wy0;
    const lz = -HD - 0.11;
    box(M.white, 1.3, 0.04, 0.22, win.x, ledgeY - 0.02, lz);
    const potGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.07, 14);
    const potMats = [std(0xc8541f, 0.7), std(0x2a6fd8, 0.5), std(0xe9b410, 0.5), std(0xc8541f, 0.7)];
    const leaf = [std(0x2f9a3e, 0.8), std(0x3fb54a, 0.8)];
    const bloom = [std(0xff4f6a, 0.6), std(0xffe14d, 0.6), std(0xffffff, 0.6), std(0xff8a3d, 0.6)];
    [-0.45, -0.15, 0.18, 0.46].forEach((ox, i) => {
      const px = win.x + ox;
      add(potGeo, potMats[i], px, ledgeY + 0.035, lz, root, false, false);
      for (let k = 0; k < 3; k++) {
        const b = add(sphereGeo, leaf[k % 2], px + (k - 1) * 0.03, ledgeY + 0.1 + (k % 2) * 0.03, lz + (k - 1) * 0.01, root, false, false);
        b.scale.setScalar(0.04 + (k % 2) * 0.012);
      }
      for (let k = 0; k < 2; k++) {
        const b = add(sphereGeo, bloom[(i + k) % 4], px + (k ? 0.03 : -0.025), ledgeY + 0.155 + k * 0.02, lz + 0.03, root, false, false);
        b.scale.setScalar(0.014);
      }
    });
  }
  // sill
  const sillTop = wy0;
  const sillD = 0.18;
  const sillW = win.w + 0.16;
  box(M.white, sillW, 0.03, sillD, win.x, sillTop - 0.015, fz + sillD / 2);
  col(win.x - sillW / 2, sillTop - 0.03, fz, win.x + sillW / 2, sillTop, fz + sillD);
  // soft sunlight glow on the sill (sheer curtain light)
  {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.17),
      new THREE.MeshBasicMaterial({ map: TX.sheer(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(win.x, sillTop + 0.002, fz + sillD / 2);
    g.renderOrder = 3;
    root.add(g);
  }
  const nsMaxX = F.nightstand.x + F.nightstand.w / 2;
  surface('windowSill', nsMaxX + 0.03, F.toyBox.x - F.toyBox.w / 2 - 0.02, fz + 0.05, fz + sillD - 0.02, sillTop);

  // ---------- mouse hole (east wall) + trim ----------
  {
    const hz = wh.z;
    // tunnel through the wall thickness
    const pts = [[hz - holeR, 0], [hz - holeR, wh.h - holeR]];
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i * Math.PI) / 12;
      pts.push([hz + holeR * Math.cos(a), wh.h - holeR + holeR * Math.sin(a)]);
    }
    pts.push([hz + holeR, wh.h - holeR], [hz + holeR, 0]);
    const pos = [], idx = [];
    pts.forEach(([pz, py]) => { pos.push(HW, py, pz, HW + WD, py, pz); });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, b, c2, b, d, c2);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tunnel = new THREE.Mesh(tg, std(0x7a4a22, 0.6, { side: THREE.DoubleSide }));
    tunnel.receiveShadow = true;
    root.add(tunnel);
    // painted arch trim
    const arc = new THREE.Mesh(new THREE.TorusGeometry(holeR + 0.016, 0.015, 8, 28, Math.PI), M.trim);
    arc.rotation.y = -Math.PI / 2;
    arc.position.set(HW - 0.008, wh.h - holeR, hz);
    arc.castShadow = arc.receiveShadow = true;
    root.add(arc);
    for (const sgn of [-1, 1]) box(M.trim, 0.025, wh.h - holeR, 0.03, HW - 0.008, (wh.h - holeR) / 2, hz + sgn * (holeR + 0.016));
    box(M.trim, 0.04, 0.008, wh.w + 0.07, HW - 0.016, 0.004, hz); // threshold
    // keystone dot
    ball(M.red, 0.012, HW - 0.014, wh.h + 0.018, hz);
  }

  // ---------- next world: miniature town behind the hole ----------
  {
    const x0 = HW + WD, x1 = NW.maxX, z0 = NW.minZ, z1 = NW.maxZ, hh = NW.h;
    const cxm = (HW + x1) / 2, czm = (z0 + z1) / 2, lenX = x1 - HW, lenZ = z1 - z0;
    const T2 = new THREE.Group();
    T2.name = 'town';
    root.add(T2);
    // dusk backdrop on far end, side walls and sky ceiling
    const duskMat = new THREE.MeshBasicMaterial({ map: TX.dusk(), toneMapped: false });
    const dp = (w, h, x, y, z, ry, rx = 0, shadow = false) => {
      const m = add(new THREE.PlaneGeometry(w, h), duskMat, x, y, z, T2, shadow, false);
      m.rotation.set(rx, ry, 0);
      return m;
    };
    dp(lenZ, hh, x1, hh / 2, czm, -Math.PI / 2);
    dp(lenX, hh, cxm, hh / 2, z1, Math.PI);
    dp(lenX, hh, cxm, hh / 2, z0, 0);
    const sk = dp(lenX, lenZ, cxm, hh, czm, 0, Math.PI / 2, true);
    sk.material = duskMat;
    // room-side wall back (so you see the wall's rear when inside the town), with the same arch
    {
      const bg = new THREE.ShapeGeometry(
        (() => {
          const s = new THREE.Shape();
          s.moveTo(-lenZ / 2, 0);
          s.lineTo(-holeR, 0);
          s.lineTo(-holeR, wh.h - holeR);
          s.absarc(0, wh.h - holeR, holeR, Math.PI, 0, true);
          s.lineTo(holeR, 0);
          s.lineTo(lenZ / 2, 0);
          s.lineTo(lenZ / 2, hh);
          s.lineTo(-lenZ / 2, hh);
          s.closePath();
          return s;
        })(), 16,
      );
      const bw = add(bg, std(0x6a4a8a, 0.9), x0, 0, czm, T2, false, true);
      bw.rotation.y = Math.PI / 2;
      bw.material.side = THREE.DoubleSide;
    }
    // street
    const gTex = TX.townGround();
    const gmat = std(0xffffff, 0.85, { map: gTex, emissiveMap: gTex, emissive: 0xffffff, emissiveIntensity: 0.3 });
    const tf = add(new THREE.PlaneGeometry(lenX, lenZ), gmat, cxm, 0.0005, czm, T2, false, true);
    tf.rotation.x = -Math.PI / 2;

    // buildings, 4 per side; facades face the street (z = 0.58 .. 0.92)
    const sx = [2.1, 2.36, 2.62, 2.9, 3.17]; // x edges
    const heights = [0.34, 0.42, 0.3, 0.38, 0.36, 0.28, 0.44, 0.33];
    const sideCols = [0xb8344a, 0xd9a010, 0x168a80, 0xcc6a14, 0x5a3fc0, 0x2c78d8, 0xcc4a80, 0x56961c];
    const capMat = std(0x3a2a4a, 0.8);
    const roofMat = std(0x4a3560, 0.9);
    const sideMats = sideCols.map((c2) => std(c2, 0.85, { emissive: c2, emissiveIntensity: 0.12 }));
    const boxG = (w, h, d) => boxGeo(w, h, d);
    let bi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const bx0 = sx[i], bx1 = sx[i + 1] - 0.008;
        const w = bx1 - bx0, h = heights[bi % 8];
        const depth = 0.28;
        const zc = side < 0 ? z0 + depth / 2 : z1 - depth / 2;
        const ft = TX.facade(bi);
        const fm = std(0xffffff, 0.75, { map: ft, emissiveMap: ft, emissive: 0xffffff, emissiveIntensity: 0.4 });
        const sm = sideMats[bi % 8];
        const mats = [sm, sm, roofMat, roofMat, side < 0 ? fm : sm, side < 0 ? sm : fm];
        const bld = add(boxG(w, h, depth), mats, (bx0 + bx1) / 2, h / 2, zc, T2);
        bld.receiveShadow = true;
        add(boxG(w + 0.016, 0.014, depth + 0.016), capMat, (bx0 + bx1) / 2, h + 0.007, zc, T2);
        if (bi % 3 === 0) add(boxG(0.03, 0.06, 0.03), capMat, bx0 + w * 0.7, h + 0.044, zc, T2);
        col(bx0, 0, zc - depth / 2, bx1, h + 0.014, zc + depth / 2);
        bi++;
      }
    }
    // street lamps (warm emissive bulbs; 3 carry point lights)
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd48a });
    const poleMat = std(0x2b2433, 0.6, { metalness: 0.4 });
    [[2.28, 0.6, true], [2.62, 0.9, true], [2.95, 0.6, true], [3.1, 0.9, false]].forEach(([lx, lz, lit]) => {
      const pole = add(unitRod, poleMat, lx, 0.1, lz, T2);
      pole.scale.set(0.004, 0.2, 0.004);
      add(boxGeo(0.03, 0.006, 0.016), poleMat, lx, 0.012, lz, T2);
      const arm = add(unitRod, poleMat, lx, 0.2, lz + (lz < 0.75 ? 0.02 : -0.02), T2);
      arm.scale.set(0.003, 0.04, 0.003);
      arm.rotation.x = Math.PI / 2;
      const bulb = ball(bulbMat, 0.012, lx, 0.205, lz + (lz < 0.75 ? 0.04 : -0.04), T2);
      bulb.castShadow = bulb.receiveShadow = false;
      if (lit) {
        const pl = new THREE.PointLight(0xffb867, 0.3, 1.0, 2);
        pl.position.set(lx, 0.22, lz + (lz < 0.75 ? 0.04 : -0.04));
        T2.add(pl);
      }
      colC(lx, 0.1, lz, 0.03, 0.2, 0.03);
    });
    // a little warm glow just behind the hole so it invites you in
    const inv = new THREE.PointLight(0xffc27a, 0.35, 0.9, 2);
    inv.position.set(HW + 0.2, 0.25, wh.z);
    T2.add(inv);
  }

  // ---------- curtains (short gingham, tied back) ----------
  const cw = 0.42, cTop = 1.72, cBot = 0.98, ch = cTop - cBot, yTie = 1.28;
  const curtainZ = -HD + 0.1;
  function curtainGeo() {
    const g = new THREE.PlaneGeometry(cw, ch, 28, 22);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ux = p.getX(i) + cw / 2; // 0 = outer edge
      const yw = p.getY(i) + (cTop + cBot) / 2;
      const s = 1 - 0.55 * Math.exp(-(((yw - yTie) / 0.16) ** 2));
      const amp = 0.012 * (1 + (1 - s) * 4);
      p.setX(i, ux * s - cw / 2);
      p.setZ(i, amp * Math.sin((ux / cw) * Math.PI * 2 * 4.5));
    }
    g.computeVertexNormals();
    return g;
  }
  const curtainMat = std(0xffffff, 1.0, { map: gingTex, bumpMap: weaveBump(gingTex.repeat.x * 4, gingTex.repeat.y * 4), bumpScale: 1.2, side: THREE.DoubleSide });
  const cGeo = curtainGeo();
  const outerL = wx0 - 0.2, outerR = wx1 + 0.2;
  const cL = add(cGeo, curtainMat, outerL + cw / 2, (cTop + cBot) / 2, curtainZ);
  const cR = add(cGeo, curtainMat, outerR - cw / 2, (cTop + cBot) / 2, curtainZ);
  cR.scale.x = -1;
  const gathered = cw * 0.45;
  for (const [outer, sgn] of [[outerL, 1], [outerR, -1]]) {
    const tx = outer + sgn * gathered / 2;
    box(M.yellow, gathered + 0.02, 0.035, 0.07, tx, yTie, curtainZ);
    ball(M.red, 0.02, tx, yTie - 0.05, curtainZ + 0.04);
  }
  // rod + finials
  const rod = add(unitRod, M.brass, win.x, cTop + 0.05, curtainZ, root);
  rod.scale.set(0.011, outerR - outerL + 0.1, 0.011);
  rod.rotation.z = Math.PI / 2;
  ball(M.red, 0.025, outerL - 0.06, cTop + 0.05, curtainZ);
  ball(M.red, 0.025, outerR + 0.06, cTop + 0.05, curtainZ);

  // ---------- door ----------
  const dr = F.door;
  const dX = -HW + 0.025;
  box(M.white, 0.05, dr.h, dr.w, dX, dr.h / 2, dr.z);
  box(M.white, 0.06, dr.h + 0.07, 0.07, -HW + 0.03, (dr.h + 0.07) / 2, dr.z - dr.w / 2 - 0.035);
  box(M.white, 0.06, dr.h + 0.07, 0.07, -HW + 0.03, (dr.h + 0.07) / 2, dr.z + dr.w / 2 + 0.035);
  box(M.white, 0.06, 0.07, dr.w + 0.14, -HW + 0.03, dr.h + 0.035, dr.z);
  for (const [py, ph] of [[1.55, 0.5], [0.7, 0.9]]) {
    for (const oz of [-0.2, 0.2]) box(M.cream, 0.012, ph, 0.3, -HW + 0.056, py, dr.z + oz);
  }
  const knobZ = dr.z + dr.w / 2 - 0.09;
  ball(M.brass, 0.028, -HW + 0.095, 1.0, knobZ);
  const stem = add(unitRod, M.brass, -HW + 0.07, 1.0, knobZ);
  stem.scale.set(0.01, 0.04, 0.01);
  stem.rotation.z = Math.PI / 2;
  col(-HW, 0, dr.z - dr.w / 2 - 0.07, -HW + 0.06, dr.h + 0.07, dr.z + dr.w / 2 + 0.07);

  // ---------- floor surface ----------
  const FM = 0.05;
  surface('floor', -HW + FM, HW - FM, -HD + FM, HD - FM, 0);

  // ---------- bed ----------
  {
    const b = F.bed;
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
    const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2; // z0 = head end (window-wall side)
    const P = 0.06;
    // posts
    for (const [px, pz, ph] of [
      [x0 + P / 2, z0 + P / 2, 0.95], [x1 - P / 2, z0 + P / 2, 0.95],
      [x0 + P / 2, z1 - P / 2, 0.65], [x1 - P / 2, z1 - P / 2, 0.65],
    ]) {
      box(M.white, P, ph, P, px, ph / 2, pz);
      ball(M.white, 0.04, px, ph + 0.02, pz);
    }
    // headboard & footboard
    const board = (zc, rails, balTop, balBot) => {
      for (const [ry, rh] of rails) box(M.white, b.w - 2 * P, rh, 0.04, b.x, ry, zc);
      const n = 9, span = b.w - 2 * P - 0.04;
      for (let i = 0; i < n; i++) {
        const bx = x0 + P + 0.02 + (span * (i + 0.5)) / n;
        box(M.white, 0.022, balTop - balBot, 0.022, bx, (balTop + balBot) / 2, zc);
      }
    };
    board(z0 + P / 2, [[0.84, 0.06], [0.46, 0.05]], 0.84, 0.46);
    board(z1 - P / 2, [[0.58, 0.05], [0.3, 0.05]], 0.58, 0.3);
    // side rails + slat platform
    box(M.white, 0.04, 0.12, b.d - 0.04, x0 + 0.03, 0.24, b.z);
    box(M.white, 0.04, 0.12, b.d - 0.04, x1 - 0.03, 0.24, b.z);
    box(M.cream, b.w - 0.06, 0.04, b.d - 0.1, b.x, 0.26, b.z);

    // ----- mattress: rounded slab (extruded rounded rectangle with bevel) in a white printed fitted sheet
    const mw = 0.9, mTop = 0.445, mBot = 0.28;
    const mzA = z0 + P - 0.005, mzB = z1 - P - 0.06; // head end flush with headboard, foot leaves room for the drape
    const mlen = mzB - mzA, mcz = (mzA + mzB) / 2;
    {
      const r = 0.035, cr = 0.06;
      const w = mw - 2 * r, d = mlen - 2 * r;
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + cr, -d / 2);
      s.lineTo(w / 2 - cr, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + cr);
      s.lineTo(w / 2, d / 2 - cr); s.quadraticCurveTo(w / 2, d / 2, w / 2 - cr, d / 2);
      s.lineTo(-w / 2 + cr, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - cr);
      s.lineTo(-w / 2, -d / 2 + cr); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + cr, -d / 2);
      const eg = new THREE.ExtrudeGeometry(s, {
        depth: (mTop - mBot) - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 5, curveSegments: 6,
      });
      eg.rotateX(-Math.PI / 2);
      const sheetT = TX.sheetPrint();
      sheetT.repeat.set(2, 2);
      const mat = std(0xffffff, 1.0, { map: sheetT, bumpMap: weaveBump(sheetT.repeat.x * 40, sheetT.repeat.y * 40), bumpScale: 1.0 });
      const mm = add(eg, mat, b.x, mBot + r, mcz, root, true, true);
      mm.name = 'mattress';
    }

    // ----- fabric (quilt / sheet): plane draped over the mattress, edges bending down over sides and foot
    function bend(a, e, rr) {
      if (a <= e) return [a, 0];
      const t = a - e, q = (rr * Math.PI) / 2;
      if (t <= q) { const th = t / rr; return [e + rr * Math.sin(th), rr * (1 - Math.cos(th))]; }
      return [e + rr + 0.012, rr + (t - q)];
    }
    function fabric(o) {
      const { ex, hlNeg, hlPos, dX, dZ, rr, amp, y0, cz, tile, segW, segL, bumps = [], cuff = 0, seed = 0 } = o;
      const totalW = 2 * (ex + dX), totalL = hlNeg + hlPos + dZ;
      const g = new THREE.PlaneGeometry(totalW, totalL, segW, segL);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i);
        const sz = (v + totalL / 2) - hlNeg;
        const sgn = u < 0 ? -1 : 1;
        const [px, dropx] = bend(Math.abs(u), ex, rr);
        let pz = sz, dropz = 0;
        if (sz > hlPos) [pz, dropz] = bend(sz, hlPos, rr);
        const drop = dropx + dropz;
        const hmix = amp * (
          0.55 * Math.sin(u * 11 + 1.7 * Math.sin(sz * 3 + seed)) +
          0.6 * Math.sin(sz * 8 - u * 5 + seed) +
          0.25 * Math.sin(u * 23 + sz * 17 + seed * 2) +
          0.8 * Math.sin(u * 4.5 + sz * 2.2 + seed * 3)
        );
        const flat = Math.max(0, 1 - drop * 10), side = Math.min(1, drop * 10);
        let X = sgn * px + sgn * hmix * 0.9 * (dropx > 0 ? side : 0);
        let Z = cz + pz + (dropz > 0 ? hmix * 0.9 * Math.min(1, dropz * 10) : 0);
        let Y = y0 - drop + hmix * flat;
        for (const bp of bumps) Y += bp.a * Math.exp(-(((X - bp.x) ** 2 + (Z - cz - bp.z) ** 2) / bp.s)) * flat;
        if (cuff) Y += cuff * Math.exp(-(((sz + hlNeg) / 0.06) ** 2)) * flat;
        p.setXYZ(i, b.x + X, Y, Z);
        uv.setXY(i, u / tile, sz / tile);
      }
      g.computeVertexNormals();
      return g;
    }

    // second rumpled patterned sheet, pulled back toward the head (under the duvet cuff)
    const sheet2Tex = TX.sheetStripes();
    sheet2Tex.repeat.set(1.2, 1.2);
    const sh2 = add(
      fabric({ ex: 0.45, hlNeg: 0.17, hlPos: 0.17, dX: 0.2, dZ: 0, rr: 0.03, amp: 0.0065, y0: 0.462, cz: mzA + 0.535, tile: 0.7, segW: 40, segL: 26, cuff: 0.03, seed: 2.2, bumps: [{ x: -0.1, z: 0.03, a: 0.012, s: 0.01 }] }),
      std(0xffffff, 1.0, { map: sheet2Tex, bumpMap: weaveBump(sheet2Tex.repeat.x * 30, sheet2Tex.repeat.y * 30), bumpScale: 1.0, side: THREE.DoubleSide }), 0, 0, 0, root, true, true,
    );
    sh2.name = 'sheet2';

    // quilted duvet draping over the sides and foot
    const qz0 = z0 + 0.6; // duvet head edge
    const hl = (mzB - qz0) / 2;
    const dcz = (qz0 + mzB) / 2;
    const bedTop = 0.482;
    const qMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: quilt.map, bumpMap: quilt.bump, bumpScale: 3.0, roughness: 1.0, side: THREE.DoubleSide,
      sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xf0c8b8),
    });
    const duvet = add(
      fabric({ ex: 0.45, hlNeg: hl, hlPos: hl, dX: 0.0785 + 0.2, dZ: 0.0628 + 0.15, rr: 0.04, amp: 0.0045, y0: bedTop, cz: dcz, tile: 0.8, segW: 72, segL: 90, cuff: 0.012, seed: 0.7, bumps: [{ x: 0.08, z: 0.12, a: 0.014, s: 0.04 }, { x: -0.17, z: -0.25, a: 0.01, s: 0.03 }] }),
      qMat, 0, 0, 0, root, true, true,
    );
    duvet.name = 'duvet';

    // pillow: squashed superellipsoid with a dent
    const pg = new THREE.SphereGeometry(1, 36, 22);
    {
      const p = pg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const se = (v, k) => Math.sign(v) * Math.abs(v) ** k;
        x = se(x, 0.72); z = se(z, 0.72); y = se(y, 0.8);
        y -= (y > 0 ? 0.22 : 0) * Math.exp(-(x * x + z * z) / 0.18);
        p.setXYZ(i, x * 0.22, y * 0.065, z * 0.15);
      }
      pg.computeVertexNormals();
    }
    const pcz = mzA + 0.2;
    const pillowY = mTop + 0.05;
    const pillowT = TX.sheetPrint();
    pillowT.repeat.set(1.5, 1.5);
    const pil = add(pg, std(0xffffff, 1.0, { map: pillowT, bumpMap: weaveBump(pillowT.repeat.x * 40, pillowT.repeat.y * 40), bumpScale: 1.0 }), b.x, pillowY, pcz, root, true, true);
    pil.rotation.y = 0.07;
    pil.name = 'pillow';

    // colliders
    col(x0, 0, z0, x1, mTop + 0.012, qz0 - 0.02); // head part (mattress + sheets)
    col(x0, 0, qz0 - 0.02, x1, bedTop, z1); // duvet part
    col(x0, 0, z0, x1, 0.95, z0 + P); // headboard
    col(x0, 0, z1 - P, x1, 0.65, z1); // footboard
    col(b.x - 0.22, mTop, pcz - 0.15, b.x + 0.22, pillowY + 0.05, pcz + 0.15); // pillow
    surface('bed', b.x - 0.39, b.x + 0.39, qz0 + 0.05, mzB - 0.06, bedTop);
  }

  // ---------- nightstand ----------
  {
    const n = F.nightstand;
    const x0 = n.x - n.w / 2, x1 = n.x + n.w / 2, z0 = n.z - n.d / 2, z1 = n.z + n.d / 2;
    const topT = 0.025;
    const lx = n.w / 2 - 0.03, lz = n.d / 2 - 0.03;
    // turned legs (lathe)
    const prof = [
      [0.016, 0], [0.02, 0.01], [0.019, 0.05], [0.027, 0.08], [0.02, 0.12], [0.017, 0.16],
      [0.017, 0.35], [0.024, 0.4], [0.019, 0.43], [0.024, 0.46], [0.02, 0.5], [0.028, 0.52],
      [0.028, n.h - topT], [0.0, n.h - topT],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const legGeo = new THREE.LatheGeometry(prof, 14);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(legGeo, M.white, n.x + sx * lx, 0, n.z + sz * lz);
        colC(n.x + sx * lx, (n.h - topT) / 2, n.z + sz * lz, 0.056, n.h - topT, 0.056);
      }
    }
    // top slab with molding step
    box(M.white, n.w + 0.03, topT, n.d + 0.03, n.x, n.h - topT / 2, n.z);
    box(M.cream, n.w - 0.01, 0.015, n.d - 0.01, n.x, n.h - topT - 0.0075, n.z);
    col(x0 - 0.015, n.h - topT - 0.015, z0 - 0.015, x1 + 0.015, n.h, z1 + 0.015);
    // open lower shelf board (top = shelfY)
    const shT = 0.025;
    box(M.white, n.w - 0.04, shT, n.d - 0.04, n.x, n.shelfY - shT / 2, n.z);
    col(x0 + 0.02, n.shelfY - shT, z0 + 0.02, x1 - 0.02, n.shelfY, z1 - 0.02);
    surface('nightstandShelf', x0 + 0.04, x1 - 0.04, z0 + 0.04, z1 - 0.06, n.shelfY);
    // beadboard-ish side panels: backing + vertical strips
    const pY0 = n.shelfY, pY1 = n.h - topT;
    const pH = pY1 - pY0, pYc = (pY0 + pY1) / 2;
    const pLen = n.d - 0.12;
    for (const sx of [-1, 1]) {
      const px = n.x + sx * lx;
      box(M.cream, 0.012, pH, pLen, px, pYc, n.z);
      const cnt = Math.floor(pLen / 0.04);
      for (let i = 0; i < cnt; i++) {
        const sz = n.z - pLen / 2 + 0.02 + i * (pLen - 0.04) / (cnt - 1);
        box(M.white, 0.008, pH - 0.02, 0.026, px + sx * 0.01, pYc, sz);
      }
      col(px - 0.015, pY0, n.z - pLen / 2, px + 0.015, pY1, n.z + pLen / 2);
    }
    const bLen = n.w - 0.12;
    const bz = n.z - lz;
    box(M.cream, bLen, pH, 0.012, n.x, pYc, bz);
    {
      const cnt = Math.floor(bLen / 0.04);
      for (let i = 0; i < cnt; i++) {
        const sx = n.x - bLen / 2 + 0.02 + i * (bLen - 0.04) / (cnt - 1);
        box(M.white, 0.026, pH - 0.02, 0.008, sx, pYc, bz - 0.01);
      }
    }
    col(n.x - bLen / 2, pY0, bz - 0.015, n.x + bLen / 2, pY1, bz + 0.015);
    // drawer (front panel + body)
    const dH = 0.2;
    const dTop = n.drawerY + dH / 2, dBot = n.drawerY - dH / 2;
    const frontZ = z1 - 0.03 + 0.012;
    box(M.cream, n.w - 0.14, dH, n.d - 0.12, n.x, n.drawerY, n.z - 0.01); // body
    box(M.white, n.w - 0.1, dH, 0.025, n.x, n.drawerY, frontZ); // front
    box(M.cream, n.w - 0.2, dH - 0.07, 0.008, n.x, n.drawerY, frontZ + 0.015); // raised panel
    const stemD = add(unitRod, M.white, n.x, n.drawerY, frontZ + 0.03, root);
    stemD.scale.set(0.006, 0.02, 0.006);
    stemD.rotation.x = Math.PI / 2;
    ball(M.red, 0.019, n.x, n.drawerY, frontZ + 0.045);
    col(x0 + 0.03, dBot, z0 + 0.03, x1 - 0.03, dTop, z1 - 0.01);
    // top surface: leave the lamp base (east side) free
    const lampL = F.lamp.x - 0.09;
    surface('nightstandTop', x0 + 0.02, lampL, z0 + 0.02, z1 - 0.02, n.h);
  }

  // ---------- table lamp ----------
  {
    const l = F.lamp;
    const y0 = F.nightstand.h;
    const prof = [
      [0.001, 0], [0.07, 0], [0.076, 0.015], [0.07, 0.05], [0.052, 0.1], [0.034, 0.15],
      [0.022, 0.19], [0.014, 0.22], [0.011, 0.3],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    add(new THREE.LatheGeometry(prof, 24), M.red, l.x, y0, l.z);
    ball(M.brass, 0.014, l.x, y0 + 0.32, l.z);
    const shadeTex = TX.lampShade();
    const shadeMat = new THREE.MeshStandardMaterial({
      map: shadeTex, emissiveMap: shadeTex, emissive: 0xffffff, emissiveIntensity: 1.35,
      roughness: 0.9, side: THREE.DoubleSide,
    });
    add(new THREE.CylinderGeometry(0.075, 0.14, 0.2, 40, 1, true), shadeMat, l.x, y0 + 0.28, l.z);
    const bulb = ball(new THREE.MeshBasicMaterial({ color: 0xfff1c0 }), 0.03, l.x, y0 + 0.24, l.z, root);
    bulb.castShadow = bulb.receiveShadow = false;
    // The lamp is the main light at night, so it casts shadows.
    const pl = new THREE.PointLight(0xffb668, 2.8, 0, 2);
    pl.position.set(l.x, y0 + 0.22, l.z);
    pl.castShadow = true;
    pl.shadow.mapSize.set(1024, 1024);
    pl.shadow.camera.near = 0.03;
    pl.shadow.bias = -0.002;
    pl.shadow.normalBias = 0.01;
    pl.shadow.radius = 3;
    root.add(pl);
    colC(l.x, y0 + 0.11, l.z, 0.15, 0.22, 0.15);
  }

  // ---------- toy box ----------
  {
    const t = F.toyBox;
    const x0 = t.x - t.w / 2, x1 = t.x + t.w / 2, z0 = t.z - t.d / 2, z1 = t.z + t.d / 2;
    const WT = 0.03, BASE = 0.04, RIMH = 0.03, RIMW = 0.055, RIMO = 0.015;
    const bodyTop = t.h - RIMH;
    const bodyH = bodyTop - BASE;
    // base + walls
    box(M.cobalt, t.w, BASE, t.d, t.x, BASE / 2, t.z);
    box(M.cobalt, t.w, bodyH, WT, t.x, BASE + bodyH / 2, z1 - WT / 2);
    box(M.cobalt, t.w, bodyH, WT, t.x, BASE + bodyH / 2, z0 + WT / 2);
    box(M.cobalt, WT, bodyH, t.d - 2 * WT, x0 + WT / 2, BASE + bodyH / 2, t.z);
    box(M.cobalt, WT, bodyH, t.d - 2 * WT, x1 - WT / 2, BASE + bodyH / 2, t.z);
    // blue corner posts
    for (const px of [x0 + 0.026, x1 - 0.026]) {
      for (const pz of [z0 + 0.026, z1 - 0.026]) box(M.yellow, 0.056, bodyTop, 0.056, px, bodyTop / 2, pz);
    }
    // blue band along the bottom of the front
    box(M.yellow, t.w - 0.1, 0.035, 0.008, t.x, 0.075, z1 + 0.004);
    // red rim around the top (overhangs 1.5 cm)
    const ry = t.h - RIMH / 2;
    box(M.red, t.w + 2 * RIMO, RIMH, RIMW, t.x, ry, z1 + RIMO - RIMW / 2);
    box(M.red, t.w + 2 * RIMO, RIMH, RIMW, t.x, ry, z0 - RIMO + RIMW / 2);
    box(M.red, RIMW, RIMH, t.d + 2 * RIMO - 2 * RIMW, x0 - RIMO + RIMW / 2, ry, t.z);
    box(M.red, RIMW, RIMH, t.d + 2 * RIMO - 2 * RIMW, x1 + RIMO - RIMW / 2, ry, t.z);
    // emblem on the front
    const emb = add(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({ map: TX.toyBoxEmblem(), transparent: true, roughness: 0.6 }),
      t.x, BASE + bodyH / 2 + 0.01, z1 + 0.006, root, false, true,
    );
    emb.name = 'toyBoxEmblem';
    // colliders: base + 4 walls (rim thickness)
    col(x0, 0, z0, x1, BASE, z1);
    const CW = 0.05;
    col(x0 - RIMO, 0, z1 - CW + RIMO, x1 + RIMO, t.h, z1 + RIMO);
    col(x0 - RIMO, 0, z0 - RIMO, x1 + RIMO, t.h, z0 + CW - RIMO);
    col(x0 - RIMO, 0, z0 - RIMO, x0 + CW - RIMO, t.h, z1 + RIMO);
    col(x1 - CW + RIMO, 0, z0 - RIMO, x1 + RIMO, t.h, z1 + RIMO);
    const ix = t.w / 2 - CW - 0.02, iz = t.d / 2 - CW - 0.02;
    surface('toyBoxInside', t.x - ix, t.x + ix, t.z - iz, t.z + iz, BASE);

    // lid, propped open against the wall (hinged on the back rim)
    const L = t.d + 2 * RIMO, LT = 0.03, LW = t.w + 2 * RIMO;
    const zh = z0 - RIMO;
    let alpha = 0.45;
    for (let i = 0; i < 6; i++) alpha = Math.asin(Math.min(1, (zh - (-HD + 0.004) - LT * Math.cos(alpha)) / L));
    const lid = new THREE.Group();
    lid.position.set(t.x, t.h, zh);
    lid.rotation.x = -(Math.PI / 2 + alpha);
    root.add(lid);
    box(M.cobalt, LW, LT, L, 0, LT / 2, L / 2, lid);
    box(M.red, LW, LT + 0.006, 0.05, 0, LT / 2, 0.025, lid);
    box(M.red, LW, LT + 0.006, 0.05, 0, LT / 2, L - 0.025, lid);
    box(M.red, 0.05, LT + 0.006, L - 0.1, -LW / 2 + 0.025, LT / 2, L / 2, lid);
    box(M.red, 0.05, LT + 0.006, L - 0.1, LW / 2 - 0.025, LT / 2, L / 2, lid);
    box(M.yellow, LW - 0.12, 0.004, L - 0.12, 0, -0.002, L / 2, lid); // inner face (faces the room)
    // hinges
    for (const hx of [-0.3, 0.3]) box(M.brass, 0.07, 0.012, 0.04, t.x + hx, t.h + 0.004, zh + 0.02);
    const lidTopY = t.h + L * Math.cos(alpha) + LT * Math.sin(alpha);
    col(t.x - LW / 2, t.h, -HD, t.x + LW / 2, lidTopY, zh);
  }

  // ---------- Windsor chair ----------
  {
    const c = F.chair;
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = Math.PI / 2; // local +z (back) -> world +x
    root.add(g);
    const SEATT = 0.035;
    const seatTop = c.seat;
    const hx = c.w / 2, hz = c.d / 2;
    // seat (saddle-ish: slab + rounded front edge)
    box(M.honey, c.w, SEATT, c.d, 0, seatTop - SEATT / 2, 0, g);
    box(M.honey, c.w - 0.04, 0.012, c.d - 0.04, 0, seatTop - SEATT - 0.006, 0, g);
    // splayed legs
    const legTopY = seatTop - SEATT - 0.01;
    const lw = 0.17;
    const world = (lxv, lzv) => [c.x + lzv, c.z - lxv];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a = new THREE.Vector3(sx * lw, legTopY, sz * lw);
        const b = new THREE.Vector3(sx * (lw + 0.045), 0, sz * (lw + 0.045));
        lean(g, M.white, a, b);
        const [wx, wz] = world(sx * (lw + 0.0225), sz * (lw + 0.0225));
        colC(wx, legTopY / 2, wz, 0.07, legTopY, 0.07);
      }
    }
    // stretchers
    const s = (a, b) => lean(g, M.white, new THREE.Vector3(...a), new THREE.Vector3(...b), 0.6);
    s([-0.2, 0.16, -0.2], [-0.2, 0.16, 0.2]);
    s([0.2, 0.16, -0.2], [0.2, 0.16, 0.2]);
    s([-0.2, 0.16, 0], [0.2, 0.16, 0]);
    // back: posts, arched top rail, spindles
    const bz = c.d / 2 - 0.05;
    const topY = c.back;
    const chord = 0.36, sag = 0.03;
    const R = (chord * chord / 4 + sag * sag) / (2 * sag);
    const arc = 2 * Math.asin(chord / (2 * R));
    const cy = topY - R;
    for (const sx of [-1, 1]) {
      lean(g, M.white, new THREE.Vector3(sx * 0.17, seatTop - SEATT, bz), new THREE.Vector3(sx * 0.17, topY - sag, bz), 0.9);
      ball(M.white, 0.02, sx * 0.17, topY - sag + 0.01, bz, g);
      const [wx, wz] = world(sx * 0.17, bz);
      colC(wx, (seatTop + topY) / 2, wz, 0.04, topY - seatTop, 0.04);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.02, 8, 36, arc), M.white);
    rail.rotation.z = Math.PI / 2 - arc / 2;
    rail.position.set(0, cy, bz);
    rail.scale.z = 0.8;
    rail.castShadow = rail.receiveShadow = true;
    g.add(rail);
    box(M.white, 0.34, 0.03, 0.026, 0, 0.62, bz, g);
    for (let i = 0; i < 5; i++) {
      const sx = -0.12 + i * 0.06;
      const yTop = cy + Math.sqrt(R * R - sx * sx) - 0.01;
      lean(g, M.white, new THREE.Vector3(sx, seatTop - SEATT, bz), new THREE.Vector3(sx, yTop, bz), 0.45);
    }
    // seat surface (clear of the back posts)
    surface('chairSeat', c.x - hz + 0.03, c.x + (bz - 0.04), c.z - hx + 0.03, c.z + hx - 0.03, seatTop);
    col(c.x - hz, seatTop - SEATT, c.z - hx, c.x + hz, seatTop, c.z + hx);
  }

  // ---------- bookshelf ----------
  {
    const s = F.bookshelf;
    const x0 = s.x - s.w / 2, x1 = s.x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2;
    const ST = 0.025, BT2 = 0.02, BK = 0.012;
    // sides (ends along z)
    box(M.white, s.w, s.h, ST, s.x, s.h / 2, z0 + ST / 2);
    box(M.white, s.w, s.h, ST, s.x, s.h / 2, z1 - ST / 2);
    col(x0, 0, z0, x1, s.h, z0 + ST);
    col(x0, 0, z1 - ST, x1, s.h, z1);
    // back panel
    box(M.bookBack, BK, s.h, s.d - 2 * ST, x1 - BK / 2, s.h / 2, s.z);
    col(x1 - BK, 0, z0 + ST, x1, s.h, z1 - ST);
    // shelf boards (given y = top face)
    for (const y of s.shelves) {
      box(M.white, s.w - BK, BT2, s.d - 2 * ST, s.x - BK / 2, y - BT2 / 2, s.z);
      col(x0, y - BT2, z0 + ST, x1 - BK, y, z1 - ST);
    }
    // top board with a little overhang + cornice
    box(M.white, s.w + 0.02, 0.025, s.d + 0.02, s.x, s.h - 0.0125, s.z);
    box(M.cream, s.w - 0.02, 0.02, s.d - 0.02, s.x, s.h - 0.035, s.z);
    col(x0 - 0.01, s.h - 0.025, z0 - 0.01, x1 + 0.01, s.h, z1 + 0.01);
    // a few colorful books
    const bookCols = [0xd81e1e, 0x1f5fe8, 0xffc400, 0x1fa84a, 0xff7a10, 0x6a3fd0, 0xff5fa0];
    const bxc = x1 - BK - 0.1 - 0.005;
    const bookRow = (shelfY, zStart, dir, specs) => {
      let z = zStart, lo = zStart, hi = zStart;
      specs.forEach(([th, hh, ci]) => {
        const zc = z + dir * th / 2;
        // a closed box: inner pages would be hidden anyway (an inset pages box shared
        // the spine's plane and z-fought through it)
        box(std(bookCols[ci], 0.7), 0.2, hh, th, bxc, shelfY + hh / 2, zc);
        z += dir * (th + 0.002);
        lo = Math.min(lo, z); hi = Math.max(hi, z);
      });
      return [Math.min(lo, zStart), Math.max(hi, zStart)];
    };
    const [a0, a1] = bookRow(s.shelves[1], z1 - ST - 0.01, -1, [[0.03, 0.22, 0], [0.04, 0.19, 1], [0.025, 0.24, 2], [0.035, 0.2, 3], [0.03, 0.23, 4], [0.04, 0.18, 5]]);
    col(bxc - 0.1, s.shelves[1], a0, bxc + 0.1, s.shelves[1] + 0.24, a1);
    const [b0, b1] = bookRow(s.shelves[2], z0 + ST + 0.01, 1, [[0.035, 0.21, 6], [0.03, 0.24, 1], [0.04, 0.2, 2], [0.025, 0.22, 0]]);
    col(bxc - 0.1, s.shelves[2], b0, bxc + 0.1, s.shelves[2] + 0.24, b1);

    const sx0 = x0 + 0.02, sx1 = x1 - BK - 0.02;
    surface('bookshelf0', sx0, sx1, z0 + ST + 0.02, z1 - ST - 0.02, s.shelves[0]);
    surface('bookshelf1', sx0, sx1, z0 + ST + 0.02, a0 - 0.02, s.shelves[1]);
    surface('bookshelf2', sx0, sx1, b1 + 0.02, z1 - ST - 0.02, s.shelves[2]);
  }

  // ---------- lighting ----------
  // Night: dim cool bounce, a faint warm glow spilling in from the hallway side,
  // and the table lamp (set up with the lamp above) as the main light.
  scene.add(new THREE.HemisphereLight(0x5670c0, 0x3a2a20, 0.25));
  scene.add(new THREE.AmbientLight(0x30406e, 0.07));
  const fill = new THREE.PointLight(0xffc890, 0.9, 6, 2);
  fill.position.set(-1.7, 1.6, 1.5);
  fill.castShadow = false;
  scene.add(fill);

  // Moonlight through the window: aimed so its axis passes through the window centre.
  const sun = new THREE.DirectionalLight(0x9db8ff, 0.9);
  sun.position.set(1.55, 3.7, -5.8);
  sun.target.position.set(-0.1, 0, -0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -3.4; sc.right = 3.4; sc.top = 3.4; sc.bottom = -3.4;
  sc.near = 0.5; sc.far = 16;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2;
  scene.add(sun);
  scene.add(sun.target);

  return { colliders, surfaces };
}
