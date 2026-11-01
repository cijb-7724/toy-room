// Procedural toys (original designs). Every toy: origin at bottom center (sits on y = 0), front faces +z.
// TOYS[type](rng, opts?) -> THREE.Group with userData = { type, radius, height } (meters).
// Geometries and materials are cached and shared. All geometry has position/normal/uv and is
// indexed, so scatter.js can bake world matrices and merge everything by material.
import * as THREE from 'three';

const SRGB = THREE.SRGBColorSpace;
const PI = Math.PI;

// ---------- palette ----------
export const C = {
  red: 0xc22a22, yellow: 0xe8b400, blue: 0x2453a8, green: 0x2f8a46, orange: 0xdc7410,
  purple: 0x6e3f9a, pink: 0xd24a82, teal: 0x16918f, white: 0xeeeadc, black: 0x1a1a1f,
};
export const PRIM = [C.red, C.yellow, C.blue, C.green, C.orange];
export const PAL = [C.red, C.yellow, C.blue, C.green, C.orange, C.purple, C.pink, C.teal];
const BEAR_COLORS = [0xb9824f, 0xd9a066, 0xa86a3d, 0xf2b6c4];
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
const tint = (hex, t) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t).getHex();

// ---------- geometry ----------
const geoCache = new Map();
function prep(g) {
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) throw new Error('geometry without uv');
  if (!g.index) {
    const n = g.attributes.position.count;
    const a = new Uint32Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    g.setIndex(new THREE.BufferAttribute(a, 1));
  }
  return g;
}
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = prep(make()); geoCache.set(key, g); }
  return g;
}
const f4 = (v) => +v.toFixed(4);
const boxG = (w, h, d) => geo(`box${f4(w)}|${f4(h)}|${f4(d)}`, () => new THREE.BoxGeometry(w, h, d));
const sphG = (r, ws = 12, hs = 8) => geo(`sph${f4(r)}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cylG = (rt, rb, h, s = 12) => geo(`cyl${f4(rt)}|${f4(rb)}|${f4(h)}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const coneG = (r, h, s = 12) => geo(`cone${f4(r)}|${f4(h)}|${s}`, () => new THREE.ConeGeometry(r, h, s));
const torG = (R, r, rs = 6, ts = 18, arc = PI * 2) => geo(`tor${f4(R)}|${f4(r)}|${rs}|${ts}|${f4(arc)}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
const capG = (r, l) => geo(`cap${f4(r)}|${f4(l)}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));
const latheG = (key, pts, seg = 16) =>
  geo('lathe' + key + seg, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
function scaleUV(g, k) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
// extruded outline (bevelled), centered on z, bottom at the outline's own y.
const extrudeG = (key, shape, depth, bev = 0.002) =>
  geo('ext' + key, () => {
    const e = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
      bevelOffset: -bev, bevelSegments: 2, curveSegments: 10,
    });
    e.translate(0, 0, -(depth - 2 * bev) / 2);
    return scaleUV(e, 8);
  });
// triangular prism with bevel: base on y=0, apex at (apexX*w, h), extruded along z
function triShape(w, h, apexX = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(apexX * w, h); s.closePath();
  return s;
}
const prismG = (w, h, d, apexX = 0, bev = 0.0015) => extrudeG(`pr${f4(w)}|${f4(h)}|${f4(d)}|${apexX}`, triShape(w, h, apexX), d, bev);

// Rounded box: BoxGeometry whose grid is re-projected onto a rounded shell (radius r).
function rboxGeo(w, h, d, r, n) {
  const g = new THREE.BoxGeometry(w, h, d, n, n, n);
  const H = [w / 2, h / 2, d / 2], I = H.map((v) => v - r);
  const tab = n === 6
    ? (i, Hh, Hi) => [-Hh, -(Hi + r / 2), -Hi, 0, Hi, Hi + r / 2, Hh][i]
    : (i, Hh, Hi) => [-Hh, -Hi, 0, Hi, Hh][i];
  const pos = g.attributes.position, nor = g.attributes.normal;
  const q = [0, 0, 0], dims = [w, h, d];
  for (let v = 0; v < pos.count; v++) {
    const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
    let len = 0;
    const nn = [0, 0, 0], cc = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const idx = Math.round((p[a] / dims[a] + 0.5) * n);
      q[a] = tab(idx, H[a], I[a]);
      cc[a] = Math.max(-I[a], Math.min(I[a], q[a]));
      nn[a] = q[a] - cc[a];
      len += nn[a] * nn[a];
    }
    len = Math.sqrt(len);
    if (len < 1e-9) continue;
    for (let a = 0; a < 3; a++) nn[a] /= len;
    pos.setXYZ(v, cc[0] + nn[0] * r, cc[1] + nn[1] * r, cc[2] + nn[2] * r);
    nor.setXYZ(v, nn[0], nn[1], nn[2]);
  }
  return g;
}
const rbox = (w, h, d, r = 0.002, n) => {
  const m = Math.min(w, h, d);
  if (r < 0.0012 || m < 0.007) return boxG(w, h, d);
  const rr = Math.min(r, (m / 2) * 0.98);
  const nn = n ?? (rr >= 0.0035 ? 6 : 4);
  return geo(`rb${f4(w)}|${f4(h)}|${f4(d)}|${f4(rr)}|${nn}`, () => rboxGeo(w, h, d, rr, nn));
};
// per-face atlas cells for a rounded box (faces px,nx,py,ny,pz,nz). Not cached.
function cellBox(w, h, d, r, cells, cols, rows) {
  const n = 6;
  const g = prep(rboxGeo(w, h, d, Math.min(r, Math.min(w, h, d) / 2 * 0.98), n));
  const per = (n + 1) * (n + 1);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const idx = cells[f], col = idx % cols, row = Math.floor(idx / cols);
    for (let k = 0; k < per; k++) {
      const i = f * per + k;
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (col + 0.04 + u * 0.92) / cols, 1 - (row + 1) / rows + (0.04 + v * 0.92) / rows);
    }
  }
  return g;
}

// ---------- seeded texture noise (textures must not use Math.random) ----------
function trng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function ctex(c, rep = 0) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = SRGB;
  t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
  return t;
}
const texMemo = {};
const memo = (k, f) => (texMemo[k] ??= f());
const cardEdgeTex = () => memo('cardEdgeT', () => {
  const c = cv(64, 64), x = c.getContext('2d');
  x.fillStyle = 'rgb(230,214,190)'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) { x.fillStyle = 'rgba(70,40,10,0.35)'; x.fillRect(i, 0, 1.5, 64); x.fillStyle = 'rgba(255,240,210,0.4)'; x.fillRect(i + 2, 0, 1, 64); }
  const t = ctex(c, 3); return t;
});

function grainCanvas() {
  return memo('grainC', () => {
    const r = trng(7), c = cv(256, 256), x = c.getContext('2d');
    x.fillStyle = 'rgb(238,226,210)'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 110; i++) {
      const y = r() * 256, a = 0.05 + r() * 0.2;
      x.strokeStyle = `rgba(105,66,28,${a})`;
      x.lineWidth = 0.5 + r() * 2.2;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 32; px <= 256; px += 32) x.lineTo(px, y + Math.sin(px * 0.025 + i) * 3 * r() + (r() - 0.5) * 3);
      x.stroke();
    }
    for (let i = 0; i < 3; i++) { // a couple of knots
      const kx = r() * 256, ky = r() * 256;
      x.strokeStyle = 'rgba(90,55,25,0.25)'; x.lineWidth = 1;
      for (let k = 1; k < 5; k++) { x.beginPath(); x.ellipse(kx, ky, 3 * k, 1.6 * k, 0, 0, PI * 2); x.stroke(); }
    }
    return c;
  });
}
const grainTex = () => memo('grainT', () => ctex(grainCanvas(), 1));
const fuzzTex = () => memo('fuzzT', () => {
  const r = trng(11), c = cv(128, 128), x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 178 + r() * 77;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 500; i++) {
    x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)';
    x.lineWidth = 1;
    const px = r() * 128, py = r() * 128, a = r() * PI * 2;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4); x.stroke();
  }
  return ctex(c, 4);
});
const knitTex = () => memo('knitT', () => {
  const c = cv(64, 64), x = c.getContext('2d');
  x.fillStyle = 'rgb(225,225,225)'; x.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const px = col * 8, py = row * 8;
      x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(px + 1, py + 1); x.lineTo(px + 4, py + 7); x.lineTo(px + 7, py + 1); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      x.beginPath(); x.moveTo(px + 2, py + 1); x.lineTo(px + 4, py + 5.5); x.lineTo(px + 6, py + 1); x.stroke();
    }
  }
  return ctex(c, 5);
});
const scarfTex = () => memo('scarfT', () => {
  const c = cv(256, 64), x = c.getContext('2d');
  const cols = ['#d62828', '#f4ead2', '#1f5fbf', '#f4ead2'];
  for (let i = 0; i < 16; i++) { x.fillStyle = cols[i % 4]; x.fillRect(i * 16, 0, 16, 64); }
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 64; col++) {
      const px = col * 4, py = row * 4;
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + 2, py + 4); x.lineTo(px + 4, py); x.stroke();
    }
  }
  const t = ctex(c, 0);
  return t;
});
// cardboard: corrugation + crayon-drawn windows & door. variant selects paint.
const cardTex = (variant) => memo('card' + variant, () => {
  const r = trng(31 + variant), c = cv(256, 256), x = c.getContext('2d');
  const base = ['#c79c63', '#f1ead8', '#9fc4e6', '#f0b8c4'][variant];
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) { x.fillStyle = `rgba(80,50,20,${0.07 + (i % 8 ? 0.02 : 0.1)})`; x.fillRect(i, 0, 2, 256); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(60,40,20,${r() * 0.05})`; x.fillRect(r() * 256, r() * 256, 12, 1); }
  const wcol = ['#f2d56a', '#9cc7e8', '#f2d56a', '#efc09a'];
  const wob = (px, py, w, h) => { // hand-drawn wobbly marker rectangle
    x.beginPath(); x.moveTo(px + (r() - 0.5) * 3, py + (r() - 0.5) * 3);
    x.lineTo(px + w + (r() - 0.5) * 4, py + (r() - 0.5) * 3); x.lineTo(px + w + (r() - 0.5) * 3, py + h + (r() - 0.5) * 4);
    x.lineTo(px + (r() - 0.5) * 4, py + h + (r() - 0.5) * 3); x.closePath();
  };
  x.lineJoin = 'round'; x.lineCap = 'round';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const px = 28 + col * 78, py = 20 + row * 62;
      x.globalAlpha = 0.75; x.fillStyle = wcol[(row + col + variant) % 4]; wob(px, py, 40, 38); x.fill(); x.globalAlpha = 1;
      x.strokeStyle = 'rgba(55,40,30,0.85)'; x.lineWidth = 3.2; wob(px, py, 40, 38); x.stroke();
      x.lineWidth = 2.4; x.beginPath(); x.moveTo(px + 20, py + 1); x.lineTo(px + 20 + (r() - 0.5) * 2, py + 37); x.moveTo(px + 1, py + 19); x.lineTo(px + 39, py + 19 + (r() - 0.5) * 2); x.stroke();
    }
  }
  x.fillStyle = 'rgba(110,60,30,0.85)'; wob(100, 206, 56, 50); x.fill();
  x.strokeStyle = 'rgba(55,40,30,0.85)'; x.lineWidth = 3; wob(100, 206, 56, 50); x.stroke();
  x.fillStyle = '#d9b23a'; x.beginPath(); x.arc(146, 232, 3, 0, PI * 2); x.fill();
  x.strokeStyle = 'rgba(40,30,20,0.5)'; x.lineWidth = 3; x.strokeRect(1, 1, 254, 254);
  return ctex(c);
});
const roofTex = () => memo('roofT', () => {
  const c = cv(128, 128), x = c.getContext('2d');
  x.fillStyle = '#b5342b'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 16) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, i, 128, 2); }
  for (let i = 0; i < 128; i += 4) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i, 0, 2, 128); }
  return ctex(c);
});

// glyph atlas for painted letter blocks: 5 colors x 32 cells (A-Z, blank, star, heart, circle, sun)
const GCOLS = 16, GROWS = 10, CELL = 96;
function drawGlyph(x, gi, cx, cy, fg) {
  x.fillStyle = fg; x.lineJoin = 'round';
  if (gi < 26) {
    x.font = 'bold 66px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeText(String.fromCharCode(65 + gi), cx, cy + 4); x.fillText(String.fromCharCode(65 + gi), cx, cy + 4);
  } else if (gi === 27) {
    x.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * PI / 5 - PI / 2, rr = k % 2 ? 14 : 32; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr + 3); }
    x.closePath(); x.stroke(); x.fill();
  } else if (gi === 28) {
    x.beginPath(); x.moveTo(cx, cy + 28);
    x.bezierCurveTo(cx - 44, cy - 4, cx - 22, cy - 40, cx, cy - 14);
    x.bezierCurveTo(cx + 22, cy - 40, cx + 44, cy - 4, cx, cy + 28);
    x.stroke(); x.fill();
  } else if (gi === 29) {
    x.beginPath(); x.arc(cx, cy, 26, 0, PI * 2); x.stroke(); x.fill();
  } else if (gi === 30) {
    x.beginPath(); x.arc(cx, cy, 15, 0, PI * 2); x.fill();
    const ss = x.strokeStyle, sw = x.lineWidth;
    for (let k = 0; k < 8; k++) { const a = k * PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); x.lineTo(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33); x.lineWidth = 5; x.strokeStyle = fg; x.stroke(); }
    x.strokeStyle = ss; x.lineWidth = sw;
  }
}
const blockAtlas = () => memo('atlasT', () => {
  const W = GCOLS * CELL, H = GROWS * CELL;
  const c = cv(W, H), x = c.getContext('2d');
  const bc = cv(W, H), bxc = bc.getContext('2d'); // engraving bump map
  bxc.fillStyle = 'rgb(200,200,200)'; bxc.fillRect(0, 0, W, H);
  const g = grainCanvas(), r = trng(77);
  for (let ci = 0; ci < 5; ci++) {
    const hex = '#' + PRIM[ci].toString(16).padStart(6, '0');
    for (let gi = 0; gi < 31; gi++) {
      const idx = ci * 32 + gi, ox = (idx % GCOLS) * CELL, oy = Math.floor(idx / GCOLS) * CELL;
      x.fillStyle = hex; x.fillRect(ox, oy, CELL, CELL);
      x.globalCompositeOperation = 'multiply';
      x.globalAlpha = 0.6; x.drawImage(g, ox, oy, CELL, CELL); x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      // worn edges + small chips of bare wood
      x.strokeStyle = 'rgba(45,25,8,0.3)'; x.lineWidth = 7; x.strokeRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.strokeRect(ox + 6, oy + 6, CELL - 12, CELL - 12);
      for (let k = 0; k < 4; k++) {
        const side = r() * 4 | 0, t = 6 + r() * (CELL - 12);
        const px = ox + (side === 0 ? t : side === 1 ? CELL - 2 : side === 2 ? t : 2);
        const py = oy + (side === 0 ? 2 : side === 1 ? t : side === 2 ? CELL - 2 : t);
        x.fillStyle = r() < 0.6 ? '#d9b685' : '#b98a55';
        x.beginPath(); x.ellipse(px, py, 2 + r() * 5, 1 + r() * 3, r() * PI, 0, PI * 2); x.fill();
      }
      const fg = ci === 1 ? '#2b1b0a' : '#f0e6cc';
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3;
      const cx = ox + CELL / 2, cy = oy + CELL / 2;
      drawGlyph(x, gi, cx, cy, fg);
      bxc.strokeStyle = 'rgb(40,40,40)'; bxc.lineWidth = 3;
      drawGlyph(bxc, gi, cx, cy, 'rgb(40,40,40)');
    }
  }
  memo.bump = bc;
  return ctex(c);
});
const blockBump = () => memo('atlasBump', () => { blockAtlas(); return ltex(memo.bump, 1, 1); });
const diceAtlas = () => memo('diceT', () => {
  const c = cv(6 * 64, 128), x = c.getContext('2d');
  const PIPS = {
    1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };
  for (let row = 0; row < 2; row++) {
    for (let n = 1; n <= 6; n++) {
      const ox = (n - 1) * 64, oy = row * 64;
      x.fillStyle = row ? '#d62828' : '#fbf6ea'; x.fillRect(ox, oy, 64, 64);
      x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 3; x.strokeRect(ox + 2, oy + 2, 60, 60);
      x.fillStyle = row ? '#fbf6ea' : '#1a1a1a';
      for (const [px, py] of PIPS[n]) { x.beginPath(); x.arc(ox + px * 64, oy + py * 64, 6.5, 0, PI * 2); x.fill(); }
    }
  }
  return ctex(c);
});
const globeTex = () => memo('globeT', () => {
  const c = cv(256, 128), x = c.getContext('2d');
  x.fillStyle = '#2f7fd0'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#4fae4a';
  const blobs = [[50, 45, 26, 18], [80, 85, 14, 24], [130, 40, 22, 14], [150, 70, 20, 26], [200, 50, 30, 16], [210, 95, 14, 9], [105, 60, 10, 8]];
  for (const [bx0, by, rx, ry] of blobs) { x.beginPath(); x.ellipse(bx0, by, rx, ry, 0.3, 0, PI * 2); x.fill(); }
  x.fillStyle = '#f4f8fb'; x.fillRect(0, 0, 256, 9); x.fillRect(0, 119, 256, 9);
  return ctex(c);
});
const rulerTex = () => memo('rulerT', () => {
  const c = cv(320, 64), x = c.getContext('2d');
  x.fillStyle = '#f2cf5c'; x.fillRect(0, 0, 320, 64);
  x.fillStyle = '#3a2a10';
  for (let i = 0; i <= 30; i++) x.fillRect(8 + i * 10 - 1, 0, 2, i % 10 === 0 ? 28 : i % 5 === 0 ? 20 : 12);
  x.font = 'bold 16px sans-serif'; x.textAlign = 'center';
  for (let i = 1; i <= 3; i++) x.fillText(String(i * 10), 8 + i * 100 - 100, 50);
  return ctex(c);
});

// ---------- extra procedural maps (linear data textures: bump / roughness) ----------
function ltex(c, rx = 1, ry = rx) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
// shared plastic micro-texture: mottled mould grain + faint scratches; used as bump AND roughness map
const plasticNoise = () => memo('plasticN', () => {
  const r = trng(101), c = cv(256, 256), x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 205 + r() * 50;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) { // soft blotches
    x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,90,90'},${0.04 + r() * 0.06})`;
    x.beginPath(); x.arc(r() * 256, r() * 256, 1 + r() * 4, 0, PI * 2); x.fill();
  }
  for (let i = 0; i < 90; i++) { // micro scratches
    x.strokeStyle = `rgba(${r() < 0.6 ? '120,120,120' : '255,255,255'},${0.15 + r() * 0.3})`;
    x.lineWidth = 0.6;
    const px = r() * 256, py = r() * 256, a = r() * PI, l = 6 + r() * 26;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  return ltex(c, 3);
});
// brushed tinplate: strongly stretched streaks (roughness variation along one axis)
const brushedTex = () => memo('brushedT', () => {
  const r = trng(202), c = cv(256, 256), x = c.getContext('2d');
  x.fillStyle = 'rgb(190,190,190)'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 120 + r() * 135;
    x.strokeStyle = `rgba(${v},${v},${v},${0.2 + r() * 0.4})`;
    x.lineWidth = 0.5 + r() * 1.2;
    const py = r() * 256, px = r() * 256, l = 40 + r() * 160;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + l, py + (r() - 0.5) * 1.5); x.stroke();
  }
  return ltex(c, 2, 2);
});
// tire tread: bump across blocks
const treadTex = () => memo('treadT', () => {
  const c = cv(64, 64), x = c.getContext('2d');
  x.fillStyle = 'rgb(210,210,210)'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgb(60,60,60)';
  for (let i = 0; i < 4; i++) { x.fillRect(0, i * 16 + 6, 64, 5); }
  x.fillStyle = 'rgb(255,255,255)'; x.fillRect(30, 0, 4, 64);
  return ltex(c, 12, 1);
});
// corrugation: vertical flute bump
const fluteTex = () => memo('fluteT', () => {
  const c = cv(128, 64), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 0);
  for (let i = 0; i <= 16; i++) g.addColorStop(i / 16, i % 2 ? 'rgb(90,90,90)' : 'rgb(235,235,235)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 64);
  const r = trng(303);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.12})`; x.fillRect(r() * 128, r() * 64, 2, 1); }
  return ltex(c, 1, 1);
});
// painted wood: per-colour canvas (grain showing through semi-matte paint, worn darker edges, chips of bare wood)
function paintedWoodTex(hex) {
  return memo('pw' + hex, () => {
    const S = 128, r = trng(hex ^ 0x5a5a), c = cv(S, S), x = c.getContext('2d');
    const css = '#' + hex.toString(16).padStart(6, '0');
    x.fillStyle = css; x.fillRect(0, 0, S, S);
    // grain shows through paint
    x.globalCompositeOperation = 'multiply';
    x.globalAlpha = 0.55; x.drawImage(grainCanvas(), 0, 0, S, S); x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 30; i++) {
      x.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.06})`; x.lineWidth = 0.6;
      const y = r() * S; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y + (r() - 0.5) * 6); x.stroke();
    }
    // worn, darker edge band
    const e = x.createLinearGradient(0, 0, 0, S);
    x.lineWidth = 6; x.strokeStyle = 'rgba(40,20,5,0.28)'; x.strokeRect(1, 1, S - 2, S - 2);
    x.lineWidth = 2; x.strokeStyle = 'rgba(40,20,5,0.3)'; x.strokeRect(5, 5, S - 10, S - 10);
    void e;
    // rubbed-off chips showing bare wood, mostly on edges/corners
    for (let i = 0; i < 9; i++) {
      const side = r() * 4 | 0, t = r() * S, w = 2 + r() * 5, h = 1 + r() * 3;
      const px = side === 0 ? t : side === 1 ? S - 2 : side === 2 ? t : 1;
      const py = side === 0 ? 1 : side === 1 ? t : side === 2 ? S - 2 : t;
      x.fillStyle = r() < 0.6 ? '#d9b685' : '#b98a55';
      x.beginPath(); x.ellipse(px, py, w, h, r() * PI, 0, PI * 2); x.fill();
    }
    const t = ctex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// ---------- materials ----------
const matCache = new Map();
function cached(key, make) {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}
const ph = (p) => new THREE.MeshPhysicalMaterial(p);
// worn, satin plastic (well-loved toys, not showroom-new)
// (roughness / clearcoat are quantized to a few looks so that materials merge into few draw calls)
export const pl = (c, o = {}) => {
  const r0 = o.r ?? 0.3, cc0 = o.cc ?? 0.9;
  const r = r0 < 0.1 ? 0.3 : r0 < 0.42 ? 0.47 : 0.6;
  const cc = cc0 > 0.6 ? 0.15 : 0;
  return cached(`pl${c}|${r}|${cc}|${o.e}`, () => ph({
    color: c, roughness: o.e ? 0.55 : r, metalness: 0, clearcoat: cc, clearcoatRoughness: 0.4,
    roughnessMap: plasticNoise(), bumpMap: plasticNoise(), bumpScale: 0.35,
    emissive: o.e ?? 0, emissiveIntensity: o.e ? 0.6 : 0,
  }));
};
// painted die-cast / tin: car-paint look (metallic base under a glossy clearcoat)
export const tin = (c, o = {}) => cached(`tin${c}|${o.r}`, () => ph({
  color: c, roughness: o.r ?? 0.38, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1,
  roughnessMap: plasticNoise(),
}));
// brushed tinplate (anisotropic-looking streaks)
export const brushed = (c) => cached(`brushed${c}`, () => ph({
  color: c, roughness: 0.3, metalness: 1, roughnessMap: brushedTex(), bumpMap: brushedTex(), bumpScale: 0.2,
}));
export const CHROME = ph({ color: 0xeef2f8, roughness: 0.12, metalness: 1 });
export const BRASS = ph({ color: 0xd8a838, roughness: 0.26, metalness: 1 });
// painted wood (grain through semi-matte paint, worn edges). Material colour is baked into the texture.
export const wd = (c, o = {}) => cached(`wd${c}|${o.r}`, () => ph({
  color: 0xffffff, map: paintedWoodTex(c), roughness: o.r ?? 0.6, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.6,
  bumpMap: grainTex(), bumpScale: 0.4,
}));
// fuzzy plush
export const fz = (c) => cached(`fz${c}`, () => ph({
  color: c, map: fuzzTex(), bumpMap: fuzzTex(), bumpScale: 0.8, roughness: 1, metalness: 0,
  sheen: 1, sheenColor: new THREE.Color(tint(c, 0.55)), sheenRoughness: 0.5,
}));
export const kn = (c) => cached(`kn${c}`, () => ph({
  color: c, map: knitTex(), bumpMap: knitTex(), bumpScale: 1.5, roughness: 1, metalness: 0,
  sheen: 1, sheenColor: new THREE.Color(tint(c, 0.5)), sheenRoughness: 0.6,
}));
export const rub = (c) => cached(`rub${c}`, () => ph({ color: c, roughness: 0.9, metalness: 0 }));
export const paper = (c) => pl(c, { r: 0.6, cc: 0.1 });
const BLACK = pl(0x14141a, { r: 0.22 });
const WHITE = pl(C.white);
const TIRE = cached('tire', () => ph({ color: 0x1b1b1e, roughness: 0.9, metalness: 0, bumpMap: treadTex(), bumpScale: 1.2 }));
const WINDOW = cached('window', () => ph({ color: 0x1c3a5c, roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 }));
const LIGHT = pl(0xfff1a8, { e: 0xffd860 });
const PAGES = paper(0xf4ecd6);
const FLESH = pl(0xe8b894, { r: 0.45, cc: 0.1 });
const SKIRT = cached('skirt', () => ph({ color: 0xf6f3ea, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, clearcoat: 0.1, roughnessMap: plasticNoise() }));
const blockMat = () => cached('blockAtlas', () => ph({ map: blockAtlas(), bumpMap: blockBump(), bumpScale: 1.5, color: 0xffffff, roughness: 0.55, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.4 }));
const diceMat = () => cached('diceAtlas', () => ph({ map: diceAtlas(), bumpMap: plasticNoise(), bumpScale: 0.3, color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.35 }));
const cardMat = (v) => cached('cardM' + v, () => ph({ map: cardTex(v), bumpMap: fluteTex(), bumpScale: 0.6, color: 0xffffff, roughness: 0.95, metalness: 0 }));
const roofMat = () => cached('roofM', () => ph({ map: roofTex(), bumpMap: fluteTex(), bumpScale: 0.8, color: 0xffffff, roughness: 0.95, metalness: 0 }));
const CARDBOARD = () => cached('cardplain', () => ph({ color: 0xb08050, map: cardEdgeTex(), bumpMap: cardEdgeTex(), bumpScale: 0.8, roughness: 0.95, metalness: 0 }));
const SCARF = () => cached('scarf', () => ph({
  map: scarfTex(), bumpMap: scarfTex(), bumpScale: 1.2, color: 0xffffff, roughness: 1, metalness: 0, sheen: 1, sheenColor: new THREE.Color(0xffe8d0), sheenRoughness: 0.6, side: THREE.DoubleSide,
}));

// ---------- building parts ----------
function part(g, geometry, material, p = [0, 0, 0], r, s) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const bx = (g, m, w, h, d, p, r, rad = 0.002) => part(g, rbox(w, h, d, rad), m, p, r);
const sp = (g, m, rad, p, s, ws = 12, hs = 8) => part(g, sphG(rad, ws, hs), m, p, null, s);
const cy = (g, m, rt, rb, h, p, r, s = 12) => part(g, cylG(rt, rb, h, s), m, p, r);
const co = (g, m, rad, h, p, r, s = 12) => part(g, coneG(rad, h, s), m, p, r);
const to = (g, m, R, rr, p, r, arc, ts = 18) => part(g, torG(R, rr, 6, ts, arc), m, p, r);
const cp = (g, m, rad, len, p, r, s) => part(g, capG(rad, len), m, p, r, s);
const newG = () => new THREE.Group();
function finish(g, type, radius, height, s = 1) {
  if (s !== 1) g.scale.setScalar(s);
  g.userData = { ...g.userData, type, radius: radius * s, height: height * s };
  return g;
}
function wheel(g, x, y, z, r, w, hubM = CHROME) {
  const tire = latheG(`tire${f4(r)}|${f4(w)}`, [[r * 0.45, -w / 2], [r * 0.9, -w / 2], [r, -w * 0.32], [r, w * 0.32], [r * 0.9, w / 2], [r * 0.45, w / 2]], 14);
  part(g, tire, TIRE, [x, y, z], [0, 0, PI / 2]);
  // hub stands 1 mm proud of the tyre wall (0.2 mm used to z-fight with it)
  part(g, cylG(r * 0.58, r * 0.58, w + 0.002, 10), hubM, [x, y, z], [0, 0, PI / 2]);
}
const PIT = (rng) => rng.pick(PRIM);

export const TOYS = {};
const T = TOYS;

// ================= plush =================
T.teddyBear = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(BEAR_COLORS);
  const fur = fz(c), pale = fz(0xf3e6cc), accent = pl(rng.pick(PRIM), { r: 0.3 });
  sp(g, fur, 0.09, [0, 0.1, 0], [1, 1.1, 0.95], 14, 10);
  sp(g, pale, 0.06, [0, 0.09, 0.062], [1, 1.1, 0.5]);
  sp(g, fur, 0.075, [0, 0.235, 0.01], null, 14, 10);
  for (const sx of [-1, 1]) {
    sp(g, fur, 0.03, [sx * 0.055, 0.298, 0]);
    sp(g, pale, 0.018, [sx * 0.055, 0.298, 0.014]);
    sp(g, BLACK, 0.009, [sx * 0.028, 0.255, 0.075], null, 10, 8);
    cp(g, fur, 0.022, 0.05, [sx * 0.098, 0.13, 0.03], [0, 0, -sx * 0.5]);
    cp(g, fur, 0.03, 0.04, [sx * 0.055, 0.032, 0.07], [PI / 2, 0, 0]);
    sp(g, pale, 0.022, [sx * 0.055, 0.032, 0.118], [1, 1, 0.5]);
    co(g, accent, 0.02, 0.03, [sx * 0.022, 0.17, 0.075], [0, 0, -sx * PI / 2]);
  }
  sp(g, pale, 0.03, [0, 0.22, 0.075], [1, 0.8, 0.8]);
  sp(g, BLACK, 0.011, [0, 0.23, 0.1], [1.2, 0.8, 0.8], 10, 8);
  sp(g, accent, 0.009, [0, 0.17, 0.075], null, 8, 6);
  return finish(g, 'teddyBear', 0.12, 0.36, o.scale ?? rng.range(0.9, 1.15));
};

T.knitPlush = (rng, o = {}) => {
  const g = newG();
  const A = o.color ?? rng.pick([C.red, C.blue, C.green, C.orange, C.purple]);
  const knit = kn(A), cream = kn(0xf4ead2);
  cp(g, knit, 0.045, 0.07, [0, 0.085, 0]);
  for (const y of [0.06, 0.085, 0.11]) cy(g, cream, 0.0465, 0.0465, 0.012, [0, y, 0], null, 16);
  sp(g, knit, 0.052, [0, 0.2, 0], null, 14, 10);
  sp(g, cream, 0.03, [0, 0.19, 0.034], [1.2, 0.9, 0.6]);
  cy(g, cream, 0.053, 0.053, 0.014, [0, 0.253, 0], null, 16);
  co(g, knit, 0.05, 0.07, [0, 0.288, 0], null, 14);
  sp(g, cream, 0.014, [0, 0.33, 0], null, 8, 6);
  for (const sx of [-1, 1]) {
    sp(g, WHITE, 0.009, [sx * 0.02, 0.21, 0.05], null, 8, 6);
    sp(g, BLACK, 0.0045, [sx * 0.02, 0.21, 0.058], null, 6, 5);
    sp(g, cream, 0.018, [sx * 0.053, 0.2, 0]);
    cp(g, knit, 0.014, 0.09, [sx * 0.065, 0.095, 0], [0, 0, sx * 0.25]);
    cp(g, knit, 0.018, 0.05, [sx * 0.025, 0.02, 0.05], [PI / 2, 0, 0]);
  }
  to(g, pl(C.red), 0.012, 0.002, [0, 0.185, 0.056], [0, 0, PI], PI, 12);
  return finish(g, 'knitPlush', 0.09, 0.34, o.scale ?? rng.range(0.9, 1.1));
};

T.plushBunny = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([0xf2eee6, 0xe8b6c8, 0xb8c8e8]);
  const fur = fz(c), pale = fz(0xfaf5ee), inner = fz(0xf0a0b8);
  cp(g, fur, 0.055, 0.07, [0, 0.09, 0], [-0.1, 0, 0]);
  sp(g, pale, 0.04, [0, 0.085, 0.04], [1, 1.1, 0.6]);
  sp(g, fur, 0.058, [0, 0.21, 0.01], null, 14, 10);
  sp(g, pale, 0.014, [0, 0.025, -0.06]);
  for (const sx of [-1, 1]) {
    cp(g, fur, 0.016, 0.1, [sx * 0.03, 0.34, 0.0], [0, 0, sx * 0.12]);
    cp(g, inner, 0.009, 0.08, [sx * 0.03, 0.34, 0.012], [0, 0, sx * 0.12]);
    sp(g, BLACK, 0.007, [sx * 0.022, 0.222, 0.056], null, 8, 6);
    cp(g, fur, 0.016, 0.05, [sx * 0.058, 0.12, 0.012], [0, 0, -sx * 0.25]);
    cp(g, fur, 0.022, 0.04, [sx * 0.032, 0.025, 0.05], [PI / 2, 0, 0]);
  }
  sp(g, pl(C.pink), 0.008, [0, 0.206, 0.066], null, 8, 6);
  to(g, pl(rng.pick([C.blue, C.red, C.green])), 0.04, 0.007, [0, 0.16, 0.0], [PI / 2, 0, 0], PI * 2, 14);
  return finish(g, 'plushBunny', 0.08, 0.4, o.scale ?? rng.range(0.9, 1.1));
};

T.plushElephant = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([0x9fb2c8, 0xb7a0d8]);
  const fur = fz(c), ear = fur;
  cp(g, fur, 0.06, 0.07, [0, 0.085, 0], [-0.1, 0, 0]);
  sp(g, fur, 0.058, [0, 0.2, 0.02], null, 14, 10);
  cp(g, fur, 0.017, 0.07, [0, 0.15, 0.085], [0.5, 0, 0]);
  sp(g, fur, 0.019, [0, 0.105, 0.1]);
  for (const sx of [-1, 1]) {
    sp(g, ear, 0.05, [sx * 0.075, 0.21, 0.0], [0.3, 1, 0.9]);
    sp(g, BLACK, 0.007, [sx * 0.026, 0.225, 0.07], null, 8, 6);
    cp(g, fur, 0.024, 0.04, [sx * 0.035, 0.03, 0.05], [PI / 2, 0, 0]);
  }
  sp(g, pl(C.red), 0.012, [0, 0.285, 0.0], [1.3, 0.5, 1], 10, 6);
  return finish(g, 'plushElephant', 0.09, 0.28, o.scale ?? rng.range(0.9, 1.1));
};

// ================= tin & plastic vehicles =================
T.robot = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.red, C.blue, C.green, C.orange]);
  const body = tin(c), yel = pl(C.yellow), red = pl(C.red);
  for (const sx of [-1, 1]) {
    bx(g, CHROME, 0.035, 0.015, 0.05, [sx * 0.025, 0.0075, 0.005]);
    cy(g, CHROME, 0.009, 0.009, 0.03, [sx * 0.025, 0.03, 0], null, 10);
    sp(g, CHROME, 0.012, [sx * 0.052, 0.12, 0], null, 10, 8);
    bx(g, body, 0.016, 0.05, 0.016, [sx * 0.056, 0.095, 0]);
    sp(g, CHROME, 0.014, [sx * 0.056, 0.065, 0], null, 10, 8);
    sp(g, WHITE, 0.01, [sx * 0.016, 0.178, 0.028], null, 8, 6);
    sp(g, BLACK, 0.005, [sx * 0.016, 0.178, 0.036], null, 6, 5);
    cy(g, CHROME, 0.008, 0.008, 0.012, [sx * 0.037, 0.17, 0], [0, 0, PI / 2], 10);
  }
  bx(g, body, 0.09, 0.07, 0.065, [0, 0.1, 0], null, 0.005);
  bx(g, BLACK, 0.06, 0.04, 0.004, [0, 0.105, 0.0335]);
  cy(g, yel, 0.008, 0.008, 0.006, [-0.015, 0.108, 0.038], [PI / 2, 0, 0]);
  cy(g, red, 0.008, 0.008, 0.006, [0.015, 0.108, 0.038], [PI / 2, 0, 0]);
  bx(g, WHITE, 0.04, 0.005, 0.004, [0, 0.09, 0.037]);
  cy(g, CHROME, 0.01, 0.01, 0.01, [0, 0.14, 0], null, 10);
  bx(g, body, 0.065, 0.05, 0.055, [0, 0.17, 0], null, 0.005);
  bx(g, BLACK, 0.03, 0.006, 0.003, [0, 0.157, 0.0285]);
  cy(g, CHROME, 0.002, 0.002, 0.03, [0, 0.21, 0], null, 6);
  sp(g, red, 0.007, [0, 0.228, 0], null, 8, 6);
  to(g, CHROME, 0.01, 0.0025, [0, 0.105, -0.036], null, PI * 2, 12);
  return finish(g, 'robot', 0.065, 0.235, o.scale ?? rng.range(0.65, 0.8));
};

T.dumpTruck = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? C.yellow;
  const body = pl(c, { r: 0.3 }), dark = rub(0x4a4f55);
  bx(g, dark, 0.13, 0.025, 0.3, [0, 0.045, 0]);
  bx(g, body, 0.14, 0.09, 0.09, [0, 0.105, 0.105], null, 0.006);
  bx(g, body, 0.14, 0.055, 0.07, [0, 0.0875, 0.18], null, 0.006);
  bx(g, WINDOW, 0.12, 0.035, 0.005, [0, 0.14, 0.152]);
  for (const sx of [-1, 1]) bx(g, WINDOW, 0.004, 0.032, 0.06, [sx * 0.071, 0.14, 0.105]);
  bx(g, pl(shade(c, 0.75)), 0.145, 0.012, 0.096, [0, 0.155, 0.107]); // clear of the tipper's tailgate plane
  bx(g, CHROME, 0.14, 0.012, 0.012, [0, 0.07, 0.218]);
  for (const sx of [-1, 1]) {
    sp(g, LIGHT, 0.01, [sx * 0.05, 0.095, 0.216], [1, 1, 0.5], 8, 6);
    for (const z of [0.14, -0.06, -0.14]) wheel(g, sx * 0.075, 0.045, z, 0.045, 0.03);
  }
  const tilt = o.tilt ?? rng.pick([0, 0, 0.35, 0.55]);
  const bed = newG();
  bed.position.set(0, 0.075, -0.15);
  bed.rotation.x = -tilt;
  g.add(bed);
  const bm = pl(c === C.yellow ? C.red : shade(c, 0.8), { r: 0.35 });
  bx(bed, bm, 0.14, 0.008, 0.21, [0, 0.004, 0.105]);
  for (const sx of [-1, 1]) bx(bed, bm, 0.008, 0.07, 0.21, [sx * 0.066, 0.04, 0.105]);
  bx(bed, bm, 0.14, 0.07, 0.008, [0, 0.04, 0.004]);
  bx(bed, bm, 0.14, 0.095, 0.01, [0, 0.0525, 0.21]);
  return finish(g, 'dumpTruck', 0.17, tilt ? 0.27 : 0.16);
};

T.fireTruck = (rng) => {
  const g = newG();
  const red = pl(C.red, { r: 0.28 });
  bx(g, BLACK, 0.13, 0.03, 0.31, [0, 0.04, 0]);
  bx(g, red, 0.13, 0.07, 0.2, [0, 0.09, -0.05], null, 0.005);
  bx(g, red, 0.13, 0.09, 0.09, [0, 0.1, 0.12], null, 0.006);
  bx(g, WINDOW, 0.12, 0.035, 0.005, [0, 0.12, 0.166]);
  for (const sx of [-1, 1]) bx(g, WINDOW, 0.004, 0.03, 0.06, [sx * 0.066, 0.12, 0.12]);
  bx(g, WHITE, 0.132, 0.008, 0.19, [0, 0.095, -0.05]);
  cy(g, CHROME, 0.03, 0.03, 0.02, [0, 0.135, -0.1], null, 14);
  for (const sx of [-1, 1]) {
    bx(g, CHROME, 0.005, 0.005, 0.24, [sx * 0.025, 0.155, -0.04]);
    for (let i = 0; i < 7; i++) bx(g, CHROME, 0.05, 0.004, 0.004, [0, 0.155, -0.15 + i * 0.037]);
    wheel(g, sx * 0.07, 0.035, 0.11, 0.035, 0.028);
    wheel(g, sx * 0.07, 0.035, -0.08, 0.035, 0.028);
    wheel(g, sx * 0.07, 0.035, -0.13, 0.035, 0.028);
    sp(g, LIGHT, 0.009, [sx * 0.045, 0.07, 0.168], [1, 1, 0.5], 8, 6);
  }
  bx(g, pl(C.blue, { e: 0x1a3a77 }), 0.07, 0.012, 0.016, [0, 0.15, 0.12]);
  bx(g, pl(C.yellow), 0.12, 0.012, 0.012, [0, 0.065, 0.17]);
  return finish(g, 'fireTruck', 0.17, 0.165);
};

T.raceCar = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PAL);
  const body = tin(c);
  bx(g, body, 0.05, 0.02, 0.09, [0, 0.025, -0.005], null, 0.005);
  co(g, body, 0.022, 0.045, [0, 0.025, 0.07], [PI / 2, 0, 0], 12).scale.set(1, 1, 0.55);
  sp(g, WINDOW, 0.02, [0, 0.04, -0.01], [1, 0.8, 1.3]);
  bx(g, WHITE, 0.012, 0.0015, 0.1, [0, 0.0358, 0.0]);
  bx(g, body, 0.06, 0.004, 0.02, [0, 0.055, -0.055]);
  for (const sx of [-1, 1]) {
    bx(g, BLACK, 0.004, 0.025, 0.004, [sx * 0.02, 0.043, -0.055]);
    wheel(g, sx * 0.032, 0.018, 0.04, 0.018, 0.016);
    wheel(g, sx * 0.032, 0.018, -0.04, 0.018, 0.016);
  }
  cy(g, WHITE, 0.01, 0.01, 0.002, [0.0255, 0.03, -0.005], [0, 0, PI / 2], 12);
  return finish(g, 'raceCar', 0.07, 0.058);
};

T.sedan = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PAL);
  const body = tin(c);
  bx(g, body, 0.048, 0.02, 0.11, [0, 0.026, 0], null, 0.006);
  bx(g, body, 0.042, 0.018, 0.055, [0, 0.045, -0.005], null, 0.006);
  bx(g, WINDOW, 0.044, 0.012, 0.045, [0, 0.047, -0.005], null, 0.002);
  bx(g, CHROME, 0.05, 0.005, 0.006, [0, 0.02, 0.056]);
  bx(g, CHROME, 0.05, 0.005, 0.006, [0, 0.02, -0.056]);
  if (o.taxi) bx(g, pl(C.yellow, { e: 0xffd860 }), 0.02, 0.008, 0.01, [0, 0.059, -0.005]);
  for (const sx of [-1, 1]) {
    sp(g, LIGHT, 0.005, [sx * 0.017, 0.028, 0.055], null, 6, 5);
    wheel(g, sx * 0.026, 0.016, 0.036, 0.016, 0.012);
    wheel(g, sx * 0.026, 0.016, -0.036, 0.016, 0.012);
  }
  return finish(g, 'sedan', 0.06, 0.06);
};

T.schoolBus = (rng) => {
  const g = newG();
  const y = pl(0xf5b400, { r: 0.28 });
  bx(g, y, 0.07, 0.045, 0.2, [0, 0.05, 0], null, 0.004);
  bx(g, pl(0xfbd25c), 0.066, 0.004, 0.19, [0, 0.0745, 0]);
  bx(g, BLACK, 0.074, 0.004, 0.204, [0, 0.04, 0]);
  bx(g, WINDOW, 0.06, 0.02, 0.003, [0, 0.058, 0.1]);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) bx(g, WINDOW, 0.002, 0.016, 0.014, [sx * 0.0355, 0.06, -0.075 + i * 0.025]);
    wheel(g, sx * 0.036, 0.02, 0.065, 0.02, 0.014);
    wheel(g, sx * 0.036, 0.02, -0.065, 0.02, 0.014);
    sp(g, LIGHT, 0.006, [sx * 0.024, 0.045, 0.1], null, 8, 6);
  }
  cy(g, pl(C.red), 0.008, 0.008, 0.002, [-0.0365, 0.055, 0.082], [0, 0, PI / 2], 8);
  return finish(g, 'schoolBus', 0.11, 0.077);
};

T.airplane = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.red, C.blue, C.yellow, C.orange]);
  const body = tin(c);
  cp(g, body, 0.017, 0.07, [0, 0.05, 0], [PI / 2, 0, 0]);
  sp(g, WINDOW, 0.014, [0, 0.06, 0.02], [1, 0.7, 1.4]);
  bx(g, tin(C.white), 0.2, 0.005, 0.04, [0, 0.05, 0.005], null, 0.002);
  bx(g, body, 0.07, 0.004, 0.022, [0, 0.055, -0.05]);
  bx(g, body, 0.004, 0.03, 0.025, [0, 0.07, -0.05]);
  co(g, CHROME, 0.011, 0.02, [0, 0.05, 0.062], [PI / 2, 0, 0], 10);
  bx(g, CHROME, 0.075, 0.003, 0.008, [0, 0.05, 0.075]);
  for (const sx of [-1, 1]) {
    bx(g, CHROME, 0.003, 0.03, 0.003, [sx * 0.028, 0.03, 0.01]);
    wheel(g, sx * 0.03, 0.013, 0.01, 0.013, 0.008);
  }
  return finish(g, 'airplane', 0.1, 0.09);
};

T.trainEngine = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.blue, C.green, C.red]);
  const body = tin(c), cab = tin(shade(c, 0.75));
  bx(g, BLACK, 0.056, 0.015, 0.134, [0, 0.0275, 0]); // ends short of the boiler's front cap
  cy(g, body, 0.03, 0.03, 0.09, [0, 0.058, 0.025], [PI / 2, 0, 0], 16);
  bx(g, cab, 0.07, 0.07, 0.04, [0, 0.065, -0.04], null, 0.004);
  bx(g, WHITE, 0.08, 0.008, 0.05, [0, 0.103, -0.04]);
  cy(g, BLACK, 0.01, 0.01, 0.035, [0, 0.105, 0.05], null, 10);
  cy(g, BLACK, 0.017, 0.01, 0.012, [0, 0.127, 0.05], null, 12);
  sp(g, BRASS, 0.012, [0, 0.086, 0.0], [1, 0.8, 1], 10, 8);
  sp(g, LIGHT, 0.009, [0, 0.058, 0.07], null, 8, 6);
  bx(g, pl(C.yellow), 0.04, 0.01, 0.02, [0, 0.03, 0.08], [0.5, 0, 0]);
  for (const sx of [-1, 1]) {
    for (const z of [-0.04, 0, 0.04]) wheel(g, sx * 0.036, 0.02, z, 0.02, 0.01);
    bx(g, BRASS, 0.003, 0.003, 0.08, [sx * 0.04, 0.02, 0]);
    bx(g, WINDOW, 0.002, 0.03, 0.025, [sx * 0.0355, 0.075, -0.04]);
  }
  return finish(g, 'trainEngine', 0.075, 0.135);
};

T.trainWagon = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PRIM);
  bx(g, BLACK, 0.056, 0.014, 0.12, [0, 0.027, 0]);
  const body = tin(c);
  bx(g, body, 0.056, 0.004, 0.11, [0, 0.036, 0]);
  for (const sx of [-1, 1]) {
    bx(g, body, 0.004, 0.03, 0.11, [sx * 0.026, 0.05, 0]);
    for (const z of [-0.04, 0.04]) wheel(g, sx * 0.034, 0.02, z, 0.02, 0.01);
  }
  for (const sz of [-1, 1]) bx(g, body, 0.056, 0.03, 0.004, [0, 0.05, sz * 0.053]);
  const cc = [PRIM[(PRIM.indexOf(c) + 1) % 5], PRIM[(PRIM.indexOf(c) + 2) % 5]];
  bx(g, wd(cc[0]), 0.028, 0.028, 0.028, [-0.01, 0.052, -0.02], null, 0.004);
  bx(g, wd(cc[1]), 0.026, 0.026, 0.026, [0.01, 0.051, 0.025], [0, 0.4, 0], 0.004);
  return finish(g, 'trainWagon', 0.07, 0.085);
};

// ================= blocks =================
const NOM = 'ABCDEFGHIJKLNOPQRSTUVWXYZ'; // no M: M is reserved for a find-target
const glyphOf = (ch) => ch.charCodeAt(0) - 65;
T.woodenBlock = (rng, o = {}) => {
  const g = newG();
  const ci = o.colorIdx ?? rng.int(0, 4);
  const c = o.color ?? PRIM[ci];
  const shape = o.shape ?? rng.pick(['cube', 'cube', 'cube', 'cube', 'long', 'cyl', 'tri', 'plank']);
  let h = 0.04, rad = 0.03;
  if (shape === 'cube' || shape === 'long') {
    const d = shape === 'long' ? 0.08 : 0.04;
    const letters = o.letters ?? (rng.next() < 0.78);
    if (letters) {
      const cells = [];
      for (let f = 0; f < 6; f++) {
        const t = rng.next();
        const gl = t < 0.8 ? glyphOf(rng.pick(NOM.split(''))) : t < 0.88 ? 26 : 27 + rng.int(0, 3);
        cells.push(ci * 32 + (f === 2 && o.topLetter ? glyphOf(o.topLetter) : gl));
      }
      part(g, cellBox(0.04, 0.04, d, 0.0042, cells, GCOLS, GROWS), blockMat(), [0, 0.02, 0]);
    } else {
      bx(g, wd(c), 0.04, 0.04, d, [0, 0.02, 0], null, 0.0042);
    }
    rad = d / 2 + 0.01;
  } else if (shape === 'cyl') {
    cy(g, wd(c), 0.02, 0.02, 0.04, [0, 0.02, 0], null, 16);
  } else if (shape === 'tri') {
    part(g, prismG(0.05, 0.035, 0.04, 0, 0.003), wd(c), [0, 0, 0]);
    h = 0.035;
  } else {
    bx(g, wd(c), 0.1, 0.014, 0.04, [0, 0.007, 0], null, 0.0035);
    h = 0.014; rad = 0.055;
  }
  return finish(g, 'woodenBlock', rad, h);
};

T.letterTile = (rng, o = {}) => {
  const g = newG();
  const ci = o.colorIdx ?? 1;
  const ch = o.letter ?? rng.pick(NOM.split(''));
  const cells = [26, 26, glyphOf(ch), 26, 26, 26].map((v) => ci * 32 + v);
  part(g, cellBox(0.022, 0.014, 0.022, 0.003, cells, GCOLS, GROWS), blockMat(), [0, 0.007, 0]);
  return finish(g, 'letterTile', 0.016, 0.014, o.scale ?? 1);
};

// arch block: width w, height h, depth d, with a round-topped opening ow x oh
function archGeo(w, h, d, ow, oh) {
  return extrudeG(`arch${f4(w)}|${f4(h)}|${f4(d)}|${f4(ow)}|${f4(oh)}`, (() => {
    const s = new THREE.Shape();
    const ar = ow / 2, ay = oh - ar;
    s.moveTo(-w / 2, 0); s.lineTo(-ow / 2, 0); s.lineTo(-ow / 2, ay);
    s.absarc(0, ay, ar, PI, 0, true);
    s.lineTo(ow / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
    return s;
  })(), d, 0.0025);
}
T.archBlock = (rng, o = {}) => {
  const g = newG();
  const w = o.w ?? 0.13, h = o.h ?? 0.12, d = o.d ?? 0.03, ow = o.ow ?? w * 0.62, oh = o.oh ?? h * 0.72;
  const c = o.color ?? rng.pick(PRIM);
  part(g, archGeo(w, h, d, ow, oh), wd(c), [0, 0, 0]);
  g.userData = { arch: { w, h, d, ow, oh } };
  return finish(g, 'archBlock', w / 2, h);
};
T.halfArch = (rng, o = {}) => {
  const g = newG();
  const w = o.w ?? 0.07, h = o.h ?? 0.07, d = o.d ?? 0.04, r = o.r ?? 0.045;
  const c = o.color ?? rng.pick(PRIM);
  const geom = extrudeG(`half${f4(w)}|${f4(h)}|${f4(d)}|${f4(r)}`, (() => {
    const s = new THREE.Shape();
    s.moveTo(r, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.lineTo(0, r);
    s.absarc(0, 0, r, PI / 2, 0, true);
    return s;
  })(), d, 0.0025);
  part(g, geom, wd(c), [-w / 2, 0, 0]);
  return finish(g, 'halfArch', w / 2 + 0.01, h);
};
T.column = (rng, o = {}) => {
  const g = newG();
  const h = o.h ?? 0.11, r = o.r ?? 0.016;
  const c = o.color ?? rng.pick([C.yellow, C.red, C.blue, C.white]);
  const m = wd(c);
  bx(g, m, r * 2.7, 0.01, r * 2.7, [0, 0.005, 0], null, 0.003);
  cy(g, m, r, r * 1.08, h - 0.02, [0, 0.01 + (h - 0.02) / 2, 0], null, 14);
  bx(g, m, r * 2.7, 0.01, r * 2.7, [0, h - 0.005, 0], null, 0.003);
  return finish(g, 'column', r * 1.9, h);
};
T.roofBlock = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PRIM);
  const w = o.w ?? 0.07, h = o.h ?? 0.04;
  part(g, prismG(w, h, 0.04, 0, 0.003), wd(c), [0, 0, 0]);
  return finish(g, 'roofBlock', w / 2 + 0.005, h);
};
T.plankBlock = (rng, o = {}) => {
  const g = newG();
  const L = o.len ?? 0.12, t = o.t ?? 0.014;
  bx(g, wd(o.color ?? rng.pick(PRIM)), L, t, o.d ?? 0.04, [0, t / 2, 0], null, 0.003);
  return finish(g, 'plankBlock', L / 2, t);
};

T.plasticBrick = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PRIM);
  const m = pl(c, { r: 0.28 });
  const nx = o.nx ?? 2, nz = o.nz ?? 4, p = 0.016;
  bx(g, m, nx * p, 0.019, nz * p, [0, 0.0095, 0], null, 0.0012);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    cy(g, m, 0.005, 0.005, 0.004, [(i - (nx - 1) / 2) * p, 0.021, (k - (nz - 1) / 2) * p], null, 8);
  }
  return finish(g, 'plasticBrick', nz * p / 2, 0.023);
};

// ================= cardboard buildings =================
T.cardboardHouse = (rng, o = {}) => {
  const g = newG();
  const v = o.variant ?? rng.int(0, 3);
  const w = o.w ?? rng.range(0.12, 0.16), d = o.d ?? rng.range(0.1, 0.13), h = o.h ?? rng.range(0.1, 0.14);
  bx(g, cardMat(v), w, h, d, [0, h / 2, 0], null, 0.002);
  part(g, prismG(w + 0.016, h * 0.5, d + 0.012, 0, 0.002), roofMat(), [0, h, 0]);
  bx(g, CARDBOARD(), 0.02, 0.04, 0.02, [w * 0.25, h + h * 0.28, -d * 0.2], null, 0.002);
  return finish(g, 'cardboardHouse', Math.max(w, d) / 2 + 0.01, h * 1.5);
};
T.cardboardTower = (rng, o = {}) => {
  const g = newG();
  const v = o.variant ?? rng.int(0, 3);
  const w = o.w ?? 0.085, d = o.d ?? 0.085, h = o.h ?? rng.range(0.2, 0.3);
  bx(g, cardMat(v), w, h, d, [0, h / 2, 0], null, 0.002);
  bx(g, CARDBOARD(), w + 0.008, 0.008, d + 0.008, [0, h + 0.004, 0], null, 0.002);
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2;
    bx(g, CARDBOARD(), 0.012, 0.03, w * 0.5, [Math.sin(a) * (w / 2 + 0.002), h + 0.02, Math.cos(a) * (d / 2 + 0.002)], [0, a, 0], 0.001);
  }
  return finish(g, 'cardboardTower', w / 2 + 0.01, h + 0.035);
};
T.toyHouse = (rng, o = {}) => T.cardboardHouse(rng, { w: 0.14, d: 0.12, h: 0.1, ...o });

// ================= balls & spheres =================
T.ball = (rng, o = {}) => {
  const g = newG();
  const r = o.r ?? rng.pick([0.02, 0.03, 0.04, 0.06, 0.08, 0.1]);
  const kind = o.kind ?? rng.pick(['solid', 'two', 'stripe', 'beach']);
  const c1 = o.color ?? rng.pick(PRIM);
  let c2 = rng.pick(PAL);
  if (c2 === c1) c2 = C.white;
  const m1 = pl(c1, { r: 0.3 }), m2 = pl(c2, { r: 0.3 });
  if (kind === 'two') {
    part(g, geo(`hemiT${f4(r)}`, () => new THREE.SphereGeometry(r, 18, 8, 0, PI * 2, 0, PI / 2)), m1, [0, r, 0]);
    part(g, geo(`hemiB${f4(r)}`, () => new THREE.SphereGeometry(r, 18, 8, 0, PI * 2, PI / 2, PI / 2)), m2, [0, r, 0]);
    to(g, WHITE, r * 0.998, r * 0.06, [0, r, 0], [PI / 2, 0, 0], PI * 2, 24);
  } else if (kind === 'beach' && r >= 0.04) {
    const cols = [C.red, C.white, C.yellow, C.blue, C.white, C.green];
    for (let i = 0; i < 6; i++) {
      part(g, geo(`wedge${f4(r)}|${i}`, () => new THREE.SphereGeometry(r, 6, 10, (i * PI) / 3, PI / 3)), pl(cols[i], { r: 0.35 }), [0, r, 0]);
    }
  } else {
    sp(g, m1, r, [0, r, 0], null, 20, 12);
    if (kind === 'stripe') {
      to(g, m2, r * 0.995, r * 0.1, [0, r, 0], [PI / 2, 0, 0], PI * 2, 24);
      to(g, WHITE, r * 0.995, r * 0.07, [0, r, 0], [0.9, 0, 0], PI * 2, 24);
    }
  }
  return finish(g, 'ball', r, r * 2);
};

T.baseball = (rng, o = {}) => {
  const g = newG();
  const r = o.r ?? 0.037;
  sp(g, pl(0xf4efe4, { r: 0.5, cc: 0.15 }), r, [0, r, 0], null, 16, 10);
  const red = pl(C.red, { r: 0.6, cc: 0 });
  for (const sx of [-1, 1]) to(g, red, r * 0.84, r * 0.04, [sx * r * 0.55, r, 0], [0, PI / 2, 0], PI * 2, 24);
  return finish(g, 'baseball', r, r * 2);
};

T.marble = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PAL);
  const r = 0.0075;
  const glass = cached(`glass${c}`, () => ph({ color: c, roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.8 }));
  sp(g, glass, r, [0, r, 0], null, 12, 8);
  sp(g, pl(rng.pick([0xffffff, C.yellow, C.orange, C.purple]), { r: 0.3 }), r * 0.55, [0, r, 0], null, 8, 6);
  return finish(g, 'marble', r, r * 2, o.scale ?? 1);
};

T.marbleBag = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.red, C.blue, C.green, C.purple]);
  const m = kn(c);
  part(g, latheG('sack', [[0, 0], [0.03, 0.002], [0.045, 0.02], [0.05, 0.04], [0.04, 0.062], [0.018, 0.075], [0.014, 0.085], [0.022, 0.1], [0.03, 0.115], [0.02, 0.112], [0.013, 0.095]], 14), m, [0, 0, 0]);
  to(g, pl(C.yellow), 0.016, 0.003, [0, 0.082, 0], [PI / 2, 0, 0], PI * 2, 12);
  return finish(g, 'marbleBag', 0.05, 0.115, o.scale ?? 1);
};

// ================= other classic toys =================
T.spinningTop = (rng) => {
  const g = newG();
  const c = rng.pick(PRIM);
  const pts = [[0, 0], [0.002, 0], [0.004, 0.012], [0.02, 0.03], [0.032, 0.048], [0.034, 0.054], [0.03, 0.06], [0.012, 0.068], [0, 0.07]];
  part(g, latheG('top', pts, 18), pl(c), [0, 0, 0]);
  to(g, WHITE, 0.0345, 0.003, [0, 0.052, 0], [PI / 2, 0, 0], PI * 2, 20);
  to(g, pl(rng.pick(PRIM)), 0.0235, 0.0025, [0, 0.033, 0], [PI / 2, 0, 0], PI * 2, 20);
  cy(g, CHROME, 0.004, 0.004, 0.025, [0, 0.0825, 0], null, 8);
  sp(g, WHITE, 0.007, [0, 0.098, 0], null, 8, 6);
  return finish(g, 'spinningTop', 0.035, 0.105);
};

T.yoyo = (rng) => {
  const g = newG();
  const c = rng.pick(PRIM);
  for (const sx of [-1, 1]) {
    cy(g, pl(c), 0.03, 0.03, 0.01, [sx * 0.009, 0.03, 0], [0, 0, PI / 2], 20);
    cy(g, WHITE, 0.012, 0.012, 0.0115, [sx * 0.009, 0.03, 0], [0, 0, PI / 2], 12);
  }
  cy(g, CHROME, 0.006, 0.006, 0.014, [0, 0.03, 0], [0, 0, PI / 2], 8);
  to(g, WHITE, 0.008, 0.0015, [0, 0.0015, 0.035], [PI / 2, 0, 0], PI * 2, 10);
  return finish(g, 'yoyo', 0.035, 0.06);
};

T.rubberDuck = (rng, o = {}) => {
  const g = newG();
  const yel = pl(o.color ?? 0xffd000, { r: 0.22, cc: 1 });
  const org = pl(0xf58a2b, { r: 0.35 });
  sp(g, yel, 0.035, [0, 0.03, 0], [0.85, 0.8, 1.15], 18, 12);
  sp(g, yel, 0.026, [0, 0.07, 0.022], null, 16, 10);
  co(g, yel, 0.012, 0.025, [0, 0.045, -0.04], [-PI / 2 - 0.5, 0, 0], 10);
  sp(g, org, 0.012, [0, 0.065, 0.047], [1.3, 0.55, 1.1], 10, 8);
  for (const sx of [-1, 1]) {
    sp(g, yel, 0.012, [sx * 0.03, 0.035, -0.005], [0.35, 0.9, 1.4], 10, 8);
    sp(g, BLACK, 0.004, [sx * 0.015, 0.078, 0.04], null, 8, 6);
  }
  return finish(g, 'rubberDuck', 0.045, 0.1, o.scale ?? 1);
};

T.dice = (rng) => {
  const g = newG();
  const row = rng.next() < 0.4 ? 1 : 0;
  const order = [3, 4, 1, 6, 2, 5];
  const cells = order.map((n) => row * 6 + n - 1);
  part(g, cellBox(0.016, 0.016, 0.016, 0.0022, cells, 6, 2), diceMat(), [0, 0.008, 0]);
  return finish(g, 'dice', 0.011, 0.016, rng.range(0.9, 1.3));
};

T.domino = (rng) => {
  const g = newG();
  bx(g, pl(0x17171c, { r: 0.25 }), 0.022, 0.008, 0.044, [0, 0.004, 0], null, 0.0015);
  bx(g, WHITE, 0.018, 0.0005, 0.0014, [0, 0.0082, 0]);
  const spots = (zc) => {
    const n = rng.int(0, 6);
    const lay = [[0, 0], [-1, -1], [1, 1], [1, -1], [-1, 1], [-1, 0], [1, 0]];
    const order = [[0], [0], [1, 2], [1, 2, 0], [1, 2, 3, 4], [1, 2, 3, 4, 0], [1, 2, 3, 4, 5, 6]];
    for (const i of order[n]) cy(g, WHITE, 0.0016, 0.0016, 0.0005, [lay[i][0] * 0.0055, 0.0083, zc + lay[i][1] * 0.0065], null, 6);
  };
  spots(-0.011); spots(0.011);
  return finish(g, 'domino', 0.025, 0.009);
};

T.jacks = (rng) => {
  const g = newG();
  for (const rot of [[0, 0, 0], [0, 0, PI / 2], [PI / 2, 0, 0]]) cp(g, CHROME, 0.0022, 0.03, [0, 0.014, 0], rot);
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) sp(g, CHROME, 0.0045, [x * 0.0215, 0.014 + y * 0.0215, z * 0.0215], null, 8, 6);
  g.rotation.set(0.6, 0.4, 0.5);
  const w = newG();
  w.add(g);
  g.position.y = 0.0215;
  return finish(w, 'jacks', 0.025, 0.045);
};

T.globe = (rng) => {
  const g = newG();
  part(g, latheG('gbase', [[0, 0], [0.05, 0], [0.05, 0.004], [0.04, 0.012], [0.012, 0.02], [0, 0.02]], 18), wd(0x7a4a28), [0, 0, 0]);
  cy(g, CHROME, 0.005, 0.005, 0.036, [0, 0.036, 0], null, 8);
  const tilt = newG();
  tilt.position.set(0, 0.118, 0);
  tilt.rotation.z = 0.41;
  g.add(tilt);
  const gm = cached('globeM', () => ph({ map: globeTex(), roughness: 0.35, clearcoat: 0.8 }));
  part(tilt, sphG(0.06, 24, 16), gm, [0, 0, 0], [0, rng.range(0, PI * 2), 0]);
  to(tilt, BRASS, 0.066, 0.003, [0, 0, 0], null, PI * 2, 28);
  cy(tilt, BRASS, 0.0045, 0.0045, 0.14, [0, 0, 0], null, 8);
  return finish(g, 'globe', 0.055, 0.2);
};

T.rocket = (rng) => {
  const g = newG();
  const c = rng.pick([C.red, C.blue, C.purple]);
  const body = tin(C.white);
  cy(g, body, 0.026, 0.026, 0.11, [0, 0.075, 0], null, 16);
  co(g, tin(c), 0.026, 0.06, [0, 0.16, 0], null, 16);
  cy(g, WINDOW, 0.011, 0.011, 0.006, [0, 0.1, 0.0255], [PI / 2, 0, 0], 12);
  to(g, CHROME, 0.011, 0.002, [0, 0.1, 0.026], null, PI * 2, 14);
  cy(g, tin(c), 0.027, 0.027, 0.012, [0, 0.04, 0], null, 16);
  co(g, pl(C.orange, { e: 0xff6600 }), 0.014, 0.02, [0, 0.012, 0], [PI, 0, 0], 10);
  for (let i = 0; i < 3; i++) {
    const a = (i * PI * 2) / 3;
    bx(g, tin(c), 0.004, 0.05, 0.03, [Math.sin(a) * 0.03, 0.025, Math.cos(a) * 0.03], [0, a, 0], 0.001);
  }
  return finish(g, 'rocket', 0.06, 0.19);
};

T.toyAnimal = (rng, o = {}) => {
  const g = newG();
  const kind = o.kind ?? rng.pick(['horse', 'dog', 'sheep']);
  if (kind === 'horse') {
    const c = rng.pick([0x9b6a3c, 0xf1e6d2, 0x6b6b72]);
    const m = pl(c, { r: 0.45, cc: 0.5 }), mane = pl(0x2a1d12);
    bx(g, m, 0.02, 0.022, 0.045, [0, 0.033, 0], null, 0.005);
    for (const [sx, z] of [[-1, 0.016], [1, 0.016], [-1, -0.016], [1, -0.016]]) cy(g, m, 0.0035, 0.0035, 0.022, [sx * 0.007, 0.011, z], null, 8);
    bx(g, m, 0.012, 0.03, 0.012, [0, 0.055, 0.02], [-0.35, 0, 0], 0.003);
    bx(g, m, 0.012, 0.012, 0.022, [0, 0.07, 0.03], null, 0.003);
    bx(g, mane, 0.004, 0.028, 0.008, [0, 0.057, 0.014], [-0.35, 0, 0]);
    for (const sx of [-1, 1]) co(g, m, 0.003, 0.008, [sx * 0.004, 0.08, 0.02], null, 6);
    cy(g, mane, 0.0015, 0.003, 0.02, [0, 0.036, -0.026], [0.5, 0, 0], 6);
  } else if (kind === 'dog') {
    const c = rng.pick([0xc89a5e, 0xeeeeee, 0x8a6a4a]);
    const m = pl(c, { r: 0.45, cc: 0.5 }), ear = pl(shade(c, 0.6));
    cp(g, m, 0.014, 0.025, [0, 0.03, 0], [PI / 2, 0, 0]);
    for (const [sx, z] of [[-1, 0.015], [1, 0.015], [-1, -0.015], [1, -0.015]]) cy(g, m, 0.004, 0.004, 0.02, [sx * 0.008, 0.01, z], null, 8);
    sp(g, m, 0.014, [0, 0.048, 0.03]);
    sp(g, WHITE, 0.008, [0, 0.044, 0.042], [1, 0.8, 1], 8, 6);
    sp(g, BLACK, 0.003, [0, 0.046, 0.05], null, 6, 5);
    for (const sx of [-1, 1]) bx(g, ear, 0.004, 0.014, 0.01, [sx * 0.013, 0.048, 0.028], [0, 0, sx * 0.3], 0.001);
    co(g, m, 0.004, 0.02, [0, 0.045, -0.03], [-0.6, 0, 0], 6);
  } else {
    const wool = fz(0xf6f1e6), dark = pl(0x2e2e32);
    for (const [x, y, z, r] of [[0, 0.03, 0, 0.02], [0.012, 0.035, 0.012, 0.016], [-0.012, 0.035, 0.012, 0.016], [0.01, 0.033, -0.014, 0.015], [-0.01, 0.033, -0.014, 0.015], [0, 0.042, 0, 0.016]]) {
      sp(g, wool, r, [x, y, z], null, 8, 6);
    }
    for (const [sx, z] of [[-1, 0.012], [1, 0.012], [-1, -0.012], [1, -0.012]]) cy(g, dark, 0.003, 0.003, 0.016, [sx * 0.009, 0.008, z], null, 6);
    sp(g, dark, 0.012, [0, 0.04, 0.025], [0.9, 1, 1.1], 8, 6);
    for (const sx of [-1, 1]) sp(g, dark, 0.005, [sx * 0.013, 0.043, 0.02], [1, 0.5, 1], 6, 5);
  }
  return finish(g, 'toyAnimal', 0.035, kind === 'horse' ? 0.085 : 0.06, o.scale ?? rng.range(0.9, 1.2));
};

T.bowlingPin = (rng) => {
  const g = newG();
  const pts = [[0, 0], [0.022, 0], [0.03, 0.02], [0.034, 0.06], [0.03, 0.1], [0.018, 0.13], [0.014, 0.15], [0.02, 0.17], [0.022, 0.185], [0.016, 0.2], [0, 0.2]];
  part(g, latheG('pin', pts, 18), pl(0xf7f3ea, { r: 0.25 }), [0, 0, 0]);
  const c = pl(rng.pick([C.red, C.blue, C.green]));
  cy(g, c, 0.0165, 0.0165, 0.008, [0, 0.145, 0], null, 16);
  cy(g, c, 0.0145, 0.0145, 0.006, [0, 0.157, 0], null, 16);
  return finish(g, 'bowlingPin', 0.035, 0.2, rng.range(0.7, 0.9));
};

T.stackingRings = (rng) => {
  const g = newG();
  cy(g, wd(0x9a6a3a), 0.06, 0.065, 0.01, [0, 0.005, 0], null, 18);
  cy(g, wd(0xd9b27c), 0.007, 0.007, 0.13, [0, 0.07, 0], null, 8);
  const n = rng.int(3, 5);
  const order = [C.red, C.orange, C.yellow, C.green, C.blue];
  for (let i = 0; i < n; i++) to(g, pl(order[i], { r: 0.3 }), 0.046 - i * 0.007, 0.009, [0, 0.02 + i * 0.019, 0], [PI / 2, 0, 0], PI * 2, 18);
  sp(g, pl(C.red), 0.014, [0, 0.145, 0], null, 10, 8);
  return finish(g, 'stackingRings', 0.065, 0.16);
};

T.drum = (rng) => {
  const g = newG();
  const c = rng.pick([C.red, C.blue, C.green]);
  cy(g, tin(c), 0.055, 0.055, 0.073, [0, 0.0375, 0], null, 22);
  for (const y of [0.0045, 0.0705]) cy(g, CHROME, 0.057, 0.057, 0.009, [0, y, 0], null, 22);
  cy(g, PAGES, 0.054, 0.054, 0.003, [0, 0.0765, 0], null, 22);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    bx(g, WHITE, 0.004, 0.06, 0.002, [Math.sin(a) * 0.0552, 0.0375, Math.cos(a) * 0.0552], [0, a, 0], 0.0008);
  }
  for (const [s, a] of [[1, 0.4], [-1, -0.35]]) {
    const st = newG();
    st.position.set(s * 0.012, 0.081, 0);
    st.rotation.y = a;
    g.add(st);
    cy(st, wd(0xd9b27c), 0.0028, 0.0028, 0.1, [0, 0, 0], [0, 0, PI / 2], 8);
    sp(st, wd(0xd9b27c), 0.005, [0.05, 0, 0], null, 8, 6);
    sp(st, wd(0xd9b27c), 0.005, [-0.05, 0, 0], null, 8, 6);
  }
  return finish(g, 'drum', 0.06, 0.087);
};

T.sailboat = (rng) => {
  const g = newG();
  const hull = pl(rng.pick([C.red, C.blue, C.green]), { r: 0.28 });
  part(g, cylG(0.08, 0.075, 0.03, 4), hull, [0, 0.015, 0], null, [0.5, 1, 1]);
  part(g, cylG(0.07, 0.07, 0.004, 4), wd(0xd9b27c), [0, 0.032, 0], null, [0.44, 1, 1]);
  bx(g, WHITE, 0.03, 0.014, 0.04, [0, 0.041, -0.03]);
  cy(g, wd(0x7a4a28), 0.0025, 0.0025, 0.17, [0, 0.115, 0.005], null, 6);
  part(g, prismG(0.08, 0.14, 0.003, -0.5, 0.0008), WHITE, [0, 0.04, -0.035], [0, PI / 2, 0]);
  part(g, prismG(0.06, 0.1, 0.003, -0.5, 0.0008), pl(C.yellow), [0, 0.04, 0.035], [0, -PI / 2, 0]);
  bx(g, pl(C.red), 0.002, 0.012, 0.018, [0, 0.2, -0.004]);
  return finish(g, 'sailboat', 0.085, 0.206);
};

T.goldStar = () => {
  const g = newG();
  const star = geo('goldStar', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i * PI) / 5 + PI / 2, r = i % 2 ? 0.013 : 0.03;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
    e.translate(0, 0, -0.003);
    return e;
  });
  part(g, star, cached('gold', () => ph({ color: 0xffc830, metalness: 1, roughness: 0.18, emissive: 0x7a4f00, emissiveIntensity: 0.5, clearcoat: 1 })), [0, 0.038, 0]);
  cy(g, wd(0x7a4a28), 0.012, 0.014, 0.006, [0, 0.003, 0], null, 12);
  return finish(g, 'goldStar', 0.03, 0.07);
};

// ---- track (wooden railway) ----
T.trackStraight = () => {
  const g = newG();
  const wm = wd(0xd9b27c), dm = wd(0x7a4a28);
  bx(g, wm, 0.045, 0.012, 0.12, [0, 0.006, 0.06], null, 0.002);
  for (const sx of [-1, 1]) bx(g, dm, 0.007, 0.002, 0.12, [sx * 0.011, 0.0125, 0.06]);
  finish(g, 'trackStraight', 0.065, 0.013);
  g.userData.track = { ex: 0, ez: 0.12, dyaw: 0 };
  return g;
};
T.trackCurve = (rng, o = {}) => {
  const g = newG();
  const wm = wd(0xd9b27c), dm = wd(0x7a4a28);
  const sign = o.dir ?? 1, R = 0.16, A = PI / 4, N = 5;
  const len = 2 * R * Math.sin(A / N / 2) * 1.05;
  for (let k = 0; k < N; k++) {
    const phi = ((k + 0.5) * A) / N;
    const sg = newG();
    sg.position.set(sign * R * (1 - Math.cos(phi)), 0, R * Math.sin(phi));
    sg.rotation.y = sign * phi;
    g.add(sg);
    bx(sg, wm, 0.045, 0.012, len, [0, 0.006, 0], null, 0.002);
    for (const sx of [-1, 1]) bx(sg, dm, 0.007, 0.002, len, [sx * 0.011, 0.0125, 0]);
  }
  finish(g, 'trackCurve', 0.1, 0.013);
  g.userData.track = { ex: sign * R * (1 - Math.cos(A)), ez: R * Math.sin(A), dyaw: sign * A };
  return g;
};
// Elevated wooden track following a 3D polyline (world coordinates; origin 0). userData.world = true.
T.trackRamp = (rng, o) => {
  // Grooved wooden marble track: one wide board with a channel down the middle,
  // swept along a smooth curve (o.pts: groove-floor centerline, world space).
  const g = newG();
  const curve = new THREE.CatmullRomCurve3(o.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const len = curve.getLength();
  const W = 0.064, T = 0.012, LIP = 0.007, LW = 0.008; // width, depth below groove, lip height, lip width
  const prof = [[-W / 2, -T], [W / 2, -T], [W / 2, LIP], [W / 2 - LW, LIP], [W / 2 - LW, 0], [-W / 2 + LW, 0], [-W / 2 + LW, LIP], [-W / 2, LIP]];
  const n = Math.max(8, Math.round(len / 0.01));
  const UP = new THREE.Vector3(0, 1, 0);
  const frames = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, c = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, t).normalize();
    frames.push({ c, t, side, up, s: u * len });
  }
  const at = (f, p) => f.c.clone().addScaledVector(f.side, p[0]).addScaledVector(f.up, p[1]);
  const pos = [], uv = [], idx = [];
  // sides: separate vertices per profile edge so the corners stay crisp
  let per = 0;
  for (let e = 0; e < prof.length; e++) {
    const a = prof[e], b = prof[(e + 1) % prof.length];
    const base = pos.length / 3;
    for (const f of frames) {
      for (const p of [a, b]) { const v = at(f, p); pos.push(v.x, v.y, v.z); uv.push(f.s / 0.06, per + (p === b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0) / 0.06); }
    }
    per += Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.06;
    for (let k = 0; k < n; k++) {
      const A0 = base + k * 2, B0 = A0 + 1, A1 = A0 + 2, B1 = A0 + 3;
      idx.push(A0, B1, B0, A0, A1, B1);
    }
  }
  // end caps
  const tri = THREE.ShapeUtils.triangulateShape(prof.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const [f, outward] of [[frames[0], -1], [frames[n], 1]]) {
    const base = pos.length / 3;
    for (const p of prof) { const v = at(f, p); pos.push(v.x, v.y, v.z); uv.push(p[0] / 0.06, p[1] / 0.06); }
    for (const [i0, i1, i2] of tri) {
      const v0 = at(f, prof[i0]), v1 = at(f, prof[i1]), v2 = at(f, prof[i2]);
      const nrm = new THREE.Vector3().crossVectors(v1.clone().sub(v0), v2.clone().sub(v0));
      if (nrm.dot(f.t) * outward > 0) idx.push(base + i0, base + i1, base + i2);
      else idx.push(base + i0, base + i2, base + i1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  part(g, prep(geom), wd(0xe9b23a), [0, 0, 0]);
  const segs = [];
  const m = Math.max(4, Math.round(len / 0.022));
  for (let i = 0; i < m; i++) { const p = curve.getPointAt((i + 0.5) / m); segs.push({ x: p.x, y: p.y, z: p.z }); }
  g.userData = { world: true, curve, segs, length: len, groove: { width: W - 2 * LW, depth: T } };
  return finish(g, 'trackRamp', 0.1, 0.1);
};

// ================= small tools & household =================
T.pencil = (rng) => {
  const g = newG();
  const c = rng.pick([C.yellow, C.blue, C.green, C.red]);
  cy(g, pl(c, { r: 0.4 }), 0.004, 0.004, 0.14, [0, 0.004, 0], [0, 0, PI / 2], 6);
  co(g, paper(0xf0d2a0), 0.004, 0.015, [0.0775, 0.004, 0], [0, 0, -PI / 2], 6);
  co(g, BLACK, 0.0016, 0.006, [0.0845, 0.004, 0], [0, 0, -PI / 2], 6);
  cy(g, CHROME, 0.0042, 0.0042, 0.01, [-0.075, 0.004, 0], [0, 0, PI / 2], 8);
  cy(g, pl(C.pink), 0.0038, 0.0038, 0.008, [-0.084, 0.004, 0], [0, 0, PI / 2], 8);
  return finish(g, 'pencil', 0.09, 0.008);
};

T.crayon = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PAL);
  const m = cached(`cr${c}`, () => ph({ color: c, roughness: 0.8, metalness: 0 }));
  cy(g, m, 0.005, 0.005, 0.08, [0, 0.005, 0], [0, 0, PI / 2], 10);
  cy(g, paper(0xf2ead8), 0.0058, 0.0058, 0.045, [-0.005, 0.005, 0], [0, 0, PI / 2], 10);
  co(g, m, 0.005, 0.014, [0.047, 0.005, 0], [0, 0, -PI / 2], 10);
  return finish(g, 'crayon', 0.05, 0.01);
};

T.crayonBox = (rng) => {
  const g = newG();
  const bc = paper(rng.pick([C.green, C.blue, C.red]));
  bx(g, bc, 0.1, 0.003, 0.07, [0, 0.0015, 0], null, 0.001);
  bx(g, bc, 0.1, 0.03, 0.003, [0, 0.015, 0.0335]);
  bx(g, bc, 0.1, 0.03, 0.003, [0, 0.015, -0.0335]);
  for (const sx of [-1, 1]) bx(g, bc, 0.003, 0.03, 0.07, [sx * 0.0485, 0.015, 0]);
  bx(g, paper(C.yellow), 0.08, 0.012, 0.0015, [0, 0.015, 0.0352]);
  let i = 0;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 8; k++) {
    const c = PAL[i++ % 8];
    const x = -0.042 + k * 0.012, z = (r ? 0.014 : -0.014), hh = 0.045 + (k % 3) * 0.006;
    const m = cached(`cr${c}`, () => ph({ color: c, roughness: 0.8 }));
    cy(g, m, 0.0045, 0.0045, hh, [x, 0.004 + hh / 2, z], null, 8);
    co(g, m, 0.0045, 0.012, [x, 0.004 + hh + 0.006, z], null, 8);
  }
  return finish(g, 'crayonBox', 0.06, 0.07);
};

T.ruler = () => {
  const g = newG();
  const m = cached('rulerM', () => ph({ map: rulerTex(), roughness: 0.4, clearcoat: 0.5 }));
  part(g, rbox(0.15, 0.003, 0.03, 0.0008), m, [0, 0.0015, 0]);
  return finish(g, 'ruler', 0.08, 0.003);
};

T.book = (rng, o = {}) => {
  const g = newG();
  const standing = !!o.standing;
  const Tt = o.thick ?? rng.range(0.012, 0.04), W = o.w ?? rng.range(0.1, 0.15), H = o.h ?? rng.range(0.13, 0.2);
  const c = o.color ?? rng.pick(PAL);
  const cover = pl(c, { r: 0.5, cc: 0.35 });
  const B = (t0, t1, w0, w1, h0, h1, m, rad = 0.0015) => {
    const dt = t1 - t0, dw = w1 - w0, dh = h1 - h0;
    const ct = (t0 + t1) / 2, cw = (w0 + w1) / 2, ch = (h0 + h1) / 2;
    if (standing) bx(g, m, dt, dh, dw, [ct - Tt / 2, ch, W / 2 - cw], null, rad);
    else bx(g, m, dw, dt, dh, [cw - W / 2, ct, ch - H / 2], null, rad);
  };
  // Built like a real hardback: spine + two boards + a page block that shows
  // between the boards. Parts only touch back-to-back (both faces hidden), so no
  // two visible faces share a plane and nothing z-fights.
  const bd = Math.min(0.0018, Tt * 0.15); // board thickness
  const sp = 0.003; // spine thickness (along w)
  B(0, Tt, 0, sp, 0, H, cover, 0); // spine
  B(0, bd, sp, W, 0, H, cover, 0); // back board
  B(Tt - bd, Tt, sp, W, 0, H, cover, 0); // front board
  B(bd, Tt - bd, sp, W - 0.002, 0.002, H - 0.002, PAGES, 0); // page block, set in from the board edges
  // labels sit proud of the front board by 0.6 mm
  B(Tt, Tt + 0.0006, W * 0.2, W * 0.8, H * 0.55, H * 0.8, paper(0xf2ead8), 0);
  B(Tt, Tt + 0.0006, W * 0.2, W * 0.8, H * 0.2, H * 0.28, pl(rng.pick(PAL), { r: 0.6, cc: 0.1 }), 0);
  if (standing) return finish(g, 'book', Math.hypot(Tt, W) / 2, H);
  return finish(g, 'book', Math.hypot(W, H) / 2, Tt + 0.001);
};

// picture book standing open like a little tent
T.pictureBook = (rng) => {
  const g = newG();
  const L = 0.13, th = 0.004, d = 0.1, ang = 0.55;
  const c = rng.pick(PAL);
  const H = L * Math.cos(ang);
  for (const sx of [-1, 1]) {
    const h = newG();
    h.position.set(0, H, 0);
    h.rotation.z = -sx * ang;
    g.add(h);
    bx(h, pl(c, { r: 0.5, cc: 0.35 }), th, L, d, [sx * 0.0015, -L / 2, 0], null, 0.001);
    bx(h, PAGES, th, L - 0.008, d - 0.008, [-sx * 0.003, -L / 2, 0], null, 0);
    bx(h, pl(rng.pick(PRIM), { r: 0.6, cc: 0 }), 0.001, 0.05, 0.06, [-sx * 0.0052, -L * 0.45, 0], null, 0);
    sp(h, pl(C.yellow), 0.012, [-sx * 0.0056, -L * 0.2, 0.02], [0.1, 1, 1], 10, 6);
  }
  return finish(g, 'pictureBook', 0.09, H + 0.005);
};

T.tinCan = (rng, o = {}) => {
  const g = newG();
  const r = o.r ?? 0.04, h = o.h ?? 0.09;
  cy(g, brushed(0xc7ccd4), r, r, h, [0, h / 2, 0], null, 16);
  for (const y of [0.004, h - 0.004]) to(g, CHROME, r, 0.0035, [0, y, 0], [PI / 2, 0, 0], PI * 2, 16);
  cy(g, paper(o.label ?? rng.pick(PRIM)), r + 0.0008, r + 0.0008, h * 0.62, [0, h * 0.5, 0], null, 16);
  cy(g, WHITE, r + 0.0016, r + 0.0016, h * 0.14, [0, h * 0.5, 0], null, 16);
  if (o.pencils) {
    for (let i = 0; i < 6; i++) {
      const a = i * PI / 3 + 0.3, lean = 0.12 + (i % 3) * 0.08;
      const pc = PAL[(i * 3) % 8];
      const pg = newG();
      pg.position.set(Math.sin(a) * r * 0.45, h - 0.02, Math.cos(a) * r * 0.45);
      pg.rotation.set(Math.cos(a) * lean, 0, -Math.sin(a) * lean);
      g.add(pg);
      cy(pg, pl(pc, { r: 0.4 }), 0.0036, 0.0036, 0.12, [0, 0.04, 0], null, 6);
      co(pg, paper(0xf0d2a0), 0.0036, 0.014, [0, 0.107, 0], null, 6);
    }
  }
  return finish(g, 'tinCan', r, o.pencils ? h + 0.1 : h);
};

T.funnel = (rng) => {
  const g = newG();
  const c = rng.pick([C.red, C.yellow, C.orange, C.blue]);
  part(g, latheG('funnel', [[0.003, 0], [0.008, 0.0], [0.009, 0.035], [0.045, 0.075], [0.047, 0.09], [0.043, 0.09], [0.006, 0.035], [0.003, 0.0]], 18), cached(`fun${c}`, () => ph({ color: c, roughness: 0.3, metalness: 1, roughnessMap: brushedTex(), bumpMap: brushedTex(), bumpScale: 0.2, side: THREE.DoubleSide })), [0, 0, 0]);
  return finish(g, 'funnel', 0.047, 0.09);
};

T.shuttlecock = (rng) => {
  const g = newG();
  sp(g, rub(0xe8d0a0), 0.0135, [0, 0.0135, 0], null, 12, 8);
  part(g, latheG('skirt', [[0.011, 0.016], [0.03, 0.075], [0.0295, 0.0755], [0.0105, 0.017]], 16), SKIRT, [0, 0, 0]);
  to(g, pl(C.red), 0.03, 0.0016, [0, 0.0752, 0], [PI / 2, 0, 0], PI * 2, 16);
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2;
    bx(g, pl(0xd8d4c8), 0.0008, 0.056, 0.0012, [Math.sin(a) * 0.02, 0.045, Math.cos(a) * 0.02], [0.2 * Math.cos(a), a, 0.2 * Math.sin(a)], 0);
  }
  return finish(g, 'shuttlecock', 0.03, 0.078, rng.range(0.9, 1.2));
};

T.racket = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick(PRIM);
  const fm = pl(c, { r: 0.3 }), sm = pl(0xf4f1ea, { r: 0.4, cc: 0.3 });
  const a = 0.05, b = 0.065, cz = 0.07;
  part(g, torG(a, 0.0045, 6, 28), fm, [0, 0.005, cz], [PI / 2, 0, 0], [1, b / a, 1]);
  for (let i = -3; i <= 3; i++) {
    const x = (i / 4) * a, hl = b * Math.sqrt(1 - (x / a) ** 2) * 2;
    bx(g, sm, 0.0013, 0.0013, hl, [x, 0.005, cz], null, 0);
  }
  for (let i = -4; i <= 4; i++) {
    const z = (i / 5) * b, hl = a * Math.sqrt(1 - (z / b) ** 2) * 2;
    bx(g, sm, hl, 0.0013, 0.0013, [0, 0.0065, cz + z], null, 0);
  }
  for (const sx of [-1, 1]) cy(g, fm, 0.0035, 0.0035, 0.06, [sx * 0.013, 0.005, -0.015], [PI / 2, 0, 0], 6);
  cy(g, fm, 0.006, 0.006, 0.1, [0, 0.005, -0.09], [PI / 2, 0, 0], 8);
  cy(g, rub(0x222226), 0.0075, 0.0075, 0.085, [0, 0.005, -0.1], [PI / 2, 0, 0], 8);
  sp(g, fm, 0.009, [0, 0.005, -0.145], null, 8, 6);
  return finish(g, 'racket', 0.12, 0.012, o.scale ?? 1);
};

T.soldier = (rng, o = {}) => {
  const g = newG();
  const coat = pl(o.coat ?? rng.pick([C.red, C.blue, C.green]), { r: 0.3 });
  const pants = pl(rng.pick([0x2a3f6a, 0xf4f1ea, 0x303030]), { r: 0.35 });
  cy(g, pl(0x3d8a45, { r: 0.5, cc: 0.3 }), 0.022, 0.024, 0.004, [0, 0.002, 0], null, 16);
  for (const sx of [-1, 1]) {
    cy(g, pants, 0.006, 0.006, 0.026, [sx * 0.007, 0.021, 0], null, 8);
    cy(g, BLACK, 0.0075, 0.0075, 0.008, [sx * 0.007, 0.008, 0.001], null, 8);
    cp(g, coat, 0.005, 0.022, [sx * 0.018, 0.052, 0], [0, 0, -sx * 0.1]);
  }
  bx(g, coat, 0.03, 0.032, 0.016, [0, 0.05, 0], null, 0.004);
  bx(g, WHITE, 0.003, 0.034, 0.018, [0, 0.05, 0], [0, 0, 0.5], 0);
  bx(g, WHITE, 0.003, 0.034, 0.018, [0, 0.05, 0], [0, 0, -0.5], 0);
  cy(g, BRASS, 0.0024, 0.0024, 0.004, [0, 0.055, 0.0085], [PI / 2, 0, 0], 6);
  sp(g, FLESH, 0.0085, [0, 0.075, 0], null, 10, 8);
  cy(g, pl(0x15151a), 0.0095, 0.0105, 0.018, [0, 0.087, 0], null, 12);
  cy(g, BRASS, 0.0097, 0.0097, 0.002, [0, 0.082, 0], null, 12);
  cy(g, pl(C.red), 0.0015, 0.0015, 0.012, [0, 0.102, 0], null, 6);
  sp(g, pl(C.red), 0.0035, [0, 0.109, 0], null, 6, 5);
  cy(g, wd(0x6a4220), 0.0018, 0.0018, 0.09, [0.02, 0.055, 0.004], [0.1, 0, -0.08], 6);
  return finish(g, 'soldier', 0.025, 0.11, o.scale ?? rng.range(0.95, 1.2));
};

T.penguin = (rng, o = {}) => {
  const g = newG();
  const body = pl(0x16202e, { r: 0.28 }), belly = pl(0xf5f2ea, { r: 0.3 }), org = pl(C.orange, { r: 0.35 });
  part(g, latheG('peng', [[0, 0.004], [0.016, 0.004], [0.026, 0.02], [0.03, 0.04], [0.024, 0.06], [0.014, 0.075], [0.012, 0.085], [0.016, 0.095], [0.014, 0.104], [0.006, 0.11], [0, 0.11]], 14), body, [0, 0, 0]);
  sp(g, belly, 0.022, [0, 0.04, 0.012], [0.9, 1.5, 0.55], 10, 8);
  co(g, org, 0.006, 0.014, [0, 0.093, 0.022], [PI / 2, 0, 0], 8);
  for (const sx of [-1, 1]) {
    sp(g, WHITE, 0.004, [sx * 0.007, 0.099, 0.015], null, 6, 5);
    sp(g, BLACK, 0.0022, [sx * 0.007, 0.099, 0.0185], null, 5, 4);
    bx(g, body, 0.004, 0.036, 0.016, [sx * 0.032, 0.05, -0.002], [0, 0, sx * 0.3], 0.0015);
    bx(g, org, 0.014, 0.003, 0.02, [sx * 0.012, 0.0045, 0.014], null, 0.001);
  }
  return finish(g, 'penguin', 0.035, 0.11, o.scale ?? rng.range(0.9, 1.15));
};

T.giraffe = (rng, o = {}) => {
  const g = newG();
  const sk = pl(0xf2b830, { r: 0.4 }), sp2 = pl(0x8a4f1c, { r: 0.45 });
  bx(g, sk, 0.026, 0.026, 0.05, [0, 0.05, 0], null, 0.008);
  for (const [sx, z] of [[-1, 0.017], [1, 0.017], [-1, -0.017], [1, -0.017]]) cy(g, sk, 0.0045, 0.0042, 0.04, [sx * 0.008, 0.02, z], null, 8);
  cy(g, sk, 0.007, 0.0085, 0.07, [0, 0.1, 0.02], [-0.2, 0, 0], 10);
  bx(g, sk, 0.016, 0.014, 0.03, [0, 0.14, 0.035], [0.2, 0, 0], 0.005);
  for (const sx of [-1, 1]) {
    cy(g, sk, 0.0016, 0.0016, 0.014, [sx * 0.005, 0.155, 0.03], null, 6);
    sp(g, sp2, 0.003, [sx * 0.005, 0.163, 0.03], null, 6, 5);
    sp(g, BLACK, 0.0025, [sx * 0.0082, 0.143, 0.042], null, 6, 5);
  }
  for (const [x, y, z] of [[0.012, 0.055, 0.005], [-0.011, 0.05, -0.012], [0.013, 0.048, -0.015], [-0.012, 0.058, 0.014], [0.0, 0.1, 0.028], [0.0065, 0.11, 0.024], [-0.0065, 0.09, 0.017]]) {
    sp(g, sp2, 0.005, [x, y, z], [1, 1, 0.45], 6, 5);
  }
  cy(g, sp2, 0.0012, 0.002, 0.03, [0, 0.05, -0.034], [0.6, 0, 0], 5);
  return finish(g, 'giraffe', 0.04, 0.17, o.scale ?? rng.range(0.85, 1.1));
};

T.camel = (rng, o = {}) => {
  const g = newG();
  const sk = pl(0xc99a5b, { r: 0.45 }), dk = pl(0x6a4a2a);
  cp(g, sk, 0.016, 0.03, [0, 0.042, 0], [PI / 2, 0, 0]);
  for (const z of [-0.012, 0.014]) sp(g, sk, 0.014, [0, 0.063, z], [1, 1.2, 1]);
  for (const [sx, z] of [[-1, 0.022], [1, 0.022], [-1, -0.022], [1, -0.022]]) cy(g, sk, 0.0045, 0.004, 0.036, [sx * 0.009, 0.018, z], null, 8);
  cy(g, sk, 0.006, 0.0075, 0.05, [0, 0.07, 0.04], [0.45, 0, 0], 8);
  bx(g, sk, 0.014, 0.014, 0.026, [0, 0.098, 0.05], null, 0.005);
  for (const sx of [-1, 1]) {
    sp(g, BLACK, 0.0022, [sx * 0.0072, 0.1, 0.056], null, 5, 4);
    sp(g, dk, 0.004, [sx * 0.006, 0.108, 0.04], [1, 1, 0.5], 6, 5);
  }
  cy(g, dk, 0.001, 0.002, 0.03, [0, 0.035, -0.04], [0.3, 0, 0], 5);
  return finish(g, 'camel', 0.045, 0.12, o.scale ?? rng.range(0.9, 1.15));
};

T.trafficSign = (rng, o = {}) => {
  const g = newG();
  const kind = o.kind ?? rng.pick(['stop', 'warn', 'round']);
  cy(g, pl(0x303036), 0.022, 0.025, 0.006, [0, 0.003, 0], null, 14);
  cy(g, CHROME, 0.0028, 0.0028, 0.115, [0, 0.0635, 0], null, 8);
  const y0 = 0.105;
  if (kind === 'stop') {
    cy(g, pl(C.red), 0.03, 0.03, 0.004, [0, y0, 0.003], [PI / 2, PI / 8, 0], 8);
    bx(g, WHITE, 0.034, 0.008, 0.0015, [0, y0, 0.0058], null, 0);
  } else if (kind === 'warn') {
    part(g, prismG(0.07, 0.06, 0.004, 0, 0.0008), pl(C.yellow), [0, y0 - 0.025, 0.003]);
    part(g, prismG(0.048, 0.042, 0.0012, 0, 0.0004), pl(C.white), [0, y0 - 0.018, 0.0056]);
    bx(g, BLACK, 0.005, 0.016, 0.0014, [0, y0 - 0.003, 0.0062], null, 0);
  } else {
    cy(g, pl(C.blue), 0.03, 0.03, 0.004, [0, y0, 0.003], [PI / 2, 0, 0], 16);
    bx(g, WHITE, 0.03, 0.007, 0.0015, [0, y0, 0.0058], null, 0);
    co(g, WHITE, 0.011, 0.016, [0.017, y0, 0.0058], [0, 0, -PI / 2], 3);
  }
  return finish(g, 'trafficSign', 0.03, 0.14, o.scale ?? 1);
};

T.barrier = (rng) => {
  const g = newG();
  const red = pl(C.red), wh = WHITE;
  for (const sx of [-1, 1]) bx(g, pl(0x303036), 0.006, 0.05, 0.03, [sx * 0.06, 0.025, 0], null, 0.001);
  for (const y of [0.032, 0.046]) {
    for (let i = 0; i < 6; i++) bx(g, (i + (y > 0.04 ? 1 : 0)) % 2 ? red : wh, 0.02, 0.011, 0.006, [-0.05 + i * 0.02, y, 0.013], null, 0.0015);
  }
  return finish(g, 'barrier', 0.07, 0.055, rng.range(0.9, 1.1));
};

T.cone = (rng, o = {}) => {
  const g = newG();
  bx(g, pl(0x2a2a30), 0.04, 0.004, 0.04, [0, 0.002, 0], null, 0.001);
  part(g, latheG('trcone', [[0, 0.0045], [0.0155, 0.0045], [0.0095, 0.05], [0.003, 0.082], [0, 0.082]], 14), pl(C.orange, { r: 0.35 }), [0, 0, 0]);
  part(g, latheG('trconeband', [[0.0128, 0.03], [0.0107, 0.04], [0.0099, 0.04], [0.0121, 0.03]], 14), WHITE, [0, 0.008, 0]);
  return finish(g, 'cone', 0.02, 0.085, o.scale ?? 1);
};

T.chessKnight = (rng, o = {}) => {
  const g = newG();
  const white = rng.next() < 0.5;
  const m = pl(white ? 0xf2e6c8 : 0x2a1d14, { r: 0.35, cc: 0.7 });
  part(g, latheG('chessbase', [[0, 0], [0.021, 0], [0.022, 0.004], [0.019, 0.01], [0.012, 0.016], [0.014, 0.02], [0, 0.02]], 16), m, [0, 0, 0]);
  const s = new THREE.Shape();
  const pts = [[-0.014, 0.0], [0.014, 0.0], [0.013, 0.014], [0.009, 0.028], [0.014, 0.04], [0.013, 0.05], [0.006, 0.058], [-0.002, 0.063], [-0.008, 0.058], [-0.018, 0.045], [-0.016, 0.04], [-0.008, 0.043], [-0.01, 0.032], [-0.014, 0.015]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  part(g, extrudeG('knight', s, 0.016, 0.002), m, [0, 0.02, 0], [0, PI / 2, 0]);
  return finish(g, 'chessKnight', 0.022, 0.083, o.scale ?? 1.2);
};

T.spoon = (rng) => {
  const g = newG();
  sp(g, CHROME, 0.016, [0, 0.003, 0.05], [0.8, 0.25, 1.3], 12, 8);
  bx(g, CHROME, 0.007, 0.003, 0.09, [0, 0.0025, -0.01], null, 0.001);
  bx(g, CHROME, 0.014, 0.003, 0.025, [0, 0.0025, -0.06], null, 0.001);
  return finish(g, 'spoon', 0.07, 0.01);
};

T.sneaker = (rng, o = {}) => {
  const g = newG();
  const up = pl(o.color ?? rng.pick([C.red, C.blue, C.green, C.orange]), { r: 0.45, cc: 0.4 });
  const wh = pl(0xf4f1ea, { r: 0.5, cc: 0.3 });
  bx(g, wh, 0.05, 0.012, 0.125, [0, 0.006, 0], null, 0.005);
  bx(g, up, 0.048, 0.03, 0.05, [0, 0.027, -0.034], null, 0.01);
  sp(g, up, 0.026, [0, 0.022, 0.03], [0.95, 0.8, 1.7]);
  bx(g, wh, 0.044, 0.02, 0.02, [0, 0.022, 0.065], null, 0.008);
  bx(g, up, 0.04, 0.012, 0.044, [0, 0.043, -0.006], [-0.4, 0, 0], 0.004);
  for (let i = 0; i < 4; i++) bx(g, wh, 0.034, 0.003, 0.004, [0, 0.036 + i * 0.002, 0.016 + i * 0.012 - 0.008], [-0.5, 0, 0], 0.001);
  bx(g, wh, 0.05, 0.004, 0.126, [0, 0.0135, 0], null, 0.001);
  bx(g, pl(C.red), 0.049, 0.012, 0.005, [0, 0.03, -0.062], null, 0.002);
  return finish(g, 'sneaker', 0.07, 0.055, o.scale ?? 1);
};

T.bucket = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.red, C.yellow, C.blue, C.orange]);
  part(g, latheG('bucket', [[0, 0], [0.034, 0], [0.036, 0.004], [0.047, 0.06], [0.049, 0.06], [0.0495, 0.064], [0.046, 0.064], [0.0345, 0.006], [0, 0.006]], 18), cached(`buck${c}`, () => ph({ color: c, roughness: 0.3, metalness: 1, roughnessMap: brushedTex(), bumpMap: brushedTex(), bumpScale: 0.2, side: THREE.DoubleSide })), [0, 0, 0]);
  to(g, CHROME, 0.05, 0.0018, [0, 0.058, 0], [0, PI / 2, 0], PI, 14);
  return finish(g, 'bucket', 0.05, 0.1, o.scale ?? 1);
};

T.pillow = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([0xf4ead8, 0xf7c9d6, 0xc9def2]);
  bx(g, fz(c), 0.22, 0.07, 0.17, [0, 0.035, 0], null, 0.03);
  return finish(g, 'pillow', 0.12, 0.07);
};

T.ropeCoil = (rng, o = {}) => {
  const g = newG();
  const c = o.color ?? rng.pick([C.red, C.yellow, C.blue, C.orange]);
  const pts = [];
  const R = o.R ?? 0.07, n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2, k = 1 + 0.25 * Math.sin(a * 2 + rng.range(0, 1)) + rng.range(-0.1, 0.1);
    pts.push(new THREE.Vector3(Math.cos(a) * R * k, 0.004 + (i % 3) * 0.004, Math.sin(a) * R * k * 0.8));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  part(g, geo(`rope${rng.next()}`, () => new THREE.TubeGeometry(curve, 36, 0.0032, 6, true)), cached(`rope${c}`, () => ph({ color: c, roughness: 0.9, map: knitTex() })), [0, 0, 0]);
  for (const k of [0, 0.5]) {
    const p = curve.getPoint(k);
    cy(g, wd(0xd9b27c), 0.006, 0.006, 0.05, [p.x, p.y + 0.006, p.z], [PI / 2, 0, k * 3], 8);
  }
  return finish(g, 'ropeCoil', R * 1.4, 0.02);
};

T.scarf = (rng, o = {}) => {
  const g = newG();
  const Wd = 0.085, F = o.flat ?? 0.36, Ltot = o.len ?? 0.7, rr = 0.022;
  const segs = 70, cols = 5;
  const geom = new THREE.PlaneGeometry(Wd, Ltot, cols, segs);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), s = pos.getY(i) + Ltot / 2;
    let z, y;
    if (s < F) { z = s; y = 0.0025 * Math.sin(s * 60); }
    else if (s < F + (PI / 2) * rr) { const t = (s - F) / rr; z = F + rr * Math.sin(t); y = rr * (Math.cos(t) - 1); }
    else { z = F + rr; y = -rr - (s - F - (PI / 2) * rr); }
    pos.setXYZ(i, x + Math.sin(s * 40) * 0.003, y + 0.004 + Math.abs(x) * 0.02 * 0, z);
  }
  geom.computeVertexNormals();
  geom.attributes.uv.needsUpdate = true;
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 1.0, uv.getX(i));
  const mesh = part(g, prep(geom), SCARF(), [0, 0, 0]);
  void mesh;
  // tassels at the hanging end
  const yEnd = -rr - (Ltot - F - (PI / 2) * rr);
  for (let i = 0; i < 6; i++) cy(g, kn(0xf4ead2), 0.0022, 0.0018, 0.025, [-0.035 + i * 0.014, yEnd + 0.004 - 0.012, F + rr], null, 5);
  g.userData = { cloth: true };
  return finish(g, 'scarf', 0.2, 0.05);
};

// bead garland strung between two world points (origin 0); userData.world = true
T.beadGarland = (rng, o) => {
  const g = newG();
  const a = new THREE.Vector3(...o.a), b = new THREE.Vector3(...o.b);
  const sag = o.sag ?? 0.05, r = o.r ?? 0.0065;
  const len = a.distanceTo(b) * 1.08;
  const n = Math.max(6, Math.floor(len / (r * 2.1)));
  const cols = o.colors ?? PAL;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    sp(g, pl(cols[i % cols.length], { r: 0.2 }), r, [p.x, p.y, p.z], null, 8, 6);
  }
  g.userData = { world: true };
  return finish(g, 'beadGarland', len / 2, sag);
};

export const TOY_TYPES = Object.keys(TOYS);
