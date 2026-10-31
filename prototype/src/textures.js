// Procedural canvas textures for the bedroom + the world beyond the window / wall hole.
// All return THREE.CanvasTexture (RepeatWrapping, anisotropy 8) unless noted. Callers set .repeat.
import * as THREE from 'three';

function rngf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(canvas, srgb = true, clamp = false) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Per-pixel monochrome grain.
function addNoise(ctx, w, h, amt, rnd) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);
}

function star(ctx, cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = rot + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function heart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}

// ---------------------------------------------------------------- floor
// Varnished hardwood. Canvas = 2.0 m (u, along x) x 1.0 m (v): 10 rows of 10 cm planks.
// Suggested repeat: (ROOM.width / 2.0, ROOM.depth / 1.0). Returns { map, rough, bump }.
// bump: plank seams are near-black (the floor reflector uses it to darken seams).
export function woodFloor() {
  const W = 2048, H = 1024, rows = 10, ph = H / rows;
  const [c, ctx] = makeCanvas(W, H);
  const [rc, rctx] = makeCanvas(W, H);
  const [bc, bctx] = makeCanvas(W, H);
  rctx.fillStyle = 'rgb(200,200,200)'; rctx.fillRect(0, 0, W, H);
  bctx.fillStyle = 'rgb(170,170,170)'; bctx.fillRect(0, 0, W, H);

  function piece(x0, y0, len, seed) {
    const r = rngf(seed);
    const hue = 17 + r() * 12, sat = 52 + r() * 22, l = 19 + r() * 15;
    for (const k of [-W, 0, W]) {
      const X = x0 + k;
      if (X + len < 0 || X > W) continue;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + ph);
      g.addColorStop(0, `hsl(${hue},${sat}%,${l - 3}%)`);
      g.addColorStop(0.5, `hsl(${hue + 2},${sat}%,${l + 4}%)`);
      g.addColorStop(1, `hsl(${hue},${sat}%,${l - 4}%)`);
      ctx.fillStyle = g;
      ctx.fillRect(X, y0, len, ph);
      ctx.save();
      ctx.beginPath(); ctx.rect(X, y0, len, ph); ctx.clip();
      bctx.save();
      bctx.beginPath(); bctx.rect(X, y0, len, ph); bctx.clip();
      const gr = rngf(seed * 7 + 3);
      for (let i = 0; i < 64; i++) {
        const gy = y0 + 3 + gr() * (ph - 6);
        const dark = gr() < 0.6;
        const a = 0.12 + gr() * 0.3;
        ctx.strokeStyle = dark ? `rgba(40,15,3,${a})` : `rgba(235,170,100,${a * 0.7})`;
        ctx.lineWidth = 0.6 + gr() * 1.8;
        bctx.strokeStyle = dark ? `rgba(60,60,60,${a * 0.8})` : `rgba(230,230,230,${a * 0.5})`;
        bctx.lineWidth = ctx.lineWidth;
        const p0 = gr() * 6, amp = 0.8 + gr() * 3.5, fr = 0.004 + gr() * 0.016;
        ctx.beginPath(); bctx.beginPath();
        for (let x = X; x <= X + len + 12; x += 12) {
          const y = gy + Math.sin(x * fr + p0) * amp;
          if (x === X) { ctx.moveTo(x, y); bctx.moveTo(x, y); } else { ctx.lineTo(x, y); bctx.lineTo(x, y); }
        }
        ctx.stroke(); bctx.stroke();
      }
      if (gr() < 0.25 && len > 300) { // knot
        const kx = X + 80 + gr() * (len - 160), ky = y0 + 30 + gr() * (ph - 60);
        for (let kk = 6; kk > 0; kk--) {
          ctx.strokeStyle = `rgba(50,20,4,${0.08 + (6 - kk) * 0.05})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(kx, ky, kk * 7, kk * 2.8, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      // edges: dark bevel seams
      ctx.fillStyle = 'rgba(20,8,2,0.88)';
      ctx.fillRect(X, y0, 3, ph);
      ctx.fillRect(X, y0, len, 3);
      ctx.fillStyle = 'rgba(255,215,150,0.22)';
      ctx.fillRect(X + 3, y0 + 3, len, 2);
      ctx.restore();
      bctx.fillStyle = 'rgb(18,18,18)';
      bctx.fillRect(X, y0, 4, ph);
      bctx.fillRect(X, y0, len, 4);
      bctx.restore();
      rctx.fillStyle = 'rgb(250,250,250)';
      rctx.fillRect(X, y0, 4, ph);
      rctx.fillRect(X, y0, len, 4);
    }
  }

  const rr = rngf(11);
  for (let row = 0; row < rows; row++) {
    const y0 = Math.round(row * ph);
    const o = rr() * W;
    let x = 0, i = 0;
    const lens = [];
    while (x < W) {
      let L = 520 + rr() * 800;
      if (W - x - L < 400) L = W - x;
      lens.push(L); x += L;
    }
    let cur = o;
    lens.forEach((L) => {
      piece(((cur % W) + W) % W, y0, L, 100 + row * 31 + i++);
      cur += L;
    });
  }
  addNoise(ctx, W, H, 12, rngf(12));
  const map = toTex(c);
  const rough = toTex(rc, false);
  const bump = toTex(bc, false);
  map.anisotropy = rough.anisotropy = bump.anisotropy = 16;
  return { map, rough, bump };
}

// ---------------------------------------------------------------- walls
// Soft sky/cornflower painted plaster: gentle roller streaks, a few sparse hand-painted dots. Canvas = 1 m x 1 m.
export function polkaWall() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(7);
  ctx.fillStyle = '#7396e0';
  ctx.fillRect(0, 0, S, S);
  // roller streaks (vertical, wrap-safe), very soft
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, w = 10 + rnd() * 50;
    ctx.fillStyle = rnd() < 0.5 ? `rgba(170,198,255,${0.015 + rnd() * 0.03})` : `rgba(50,75,160,${0.015 + rnd() * 0.03})`;
    ctx.fillRect(x, 0, w, S);
    if (x + w > S) ctx.fillRect(x - S, 0, w, S);
  }
  // fine plaster stipple
  for (let i = 0; i < 5000; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.4;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(220,232,255,0.07)' : 'rgba(40,60,140,0.07)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // sparse, small, slightly irregular hand-painted dots (~1/3 of the old density)
  const cols = ['#f3d56a', '#fbfbf4', '#f2a6bf', '#9fe2c8', '#f4a864'];
  const n = 7, cell = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (rnd() < 0.4) continue;
      const x = (i + 0.2 + rnd() * 0.6) * cell + (j % 2) * cell * 0.3;
      const y = (j + 0.2 + rnd() * 0.6) * cell;
      const r = 3.5 + rnd() * 3.5;
      const sx = 0.85 + rnd() * 0.3, rot = rnd() * Math.PI;
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.globalAlpha = 0.8 + rnd() * 0.2;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r * sx, r / sx, rot, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  addNoise(ctx, S, S, 6, rngf(8));
  return toTex(c);
}

// ---------------------------------------------------------------- paint (furniture)
const paintCache = new Map();
// Enamel in the given color: subtle brush strokes, slightly darker edges, a few tiny chips. 512 px.
export function paint(color = '#f5ead6', seed = 3) {
  const key = color + seed;
  if (paintCache.has(key)) return paintCache.get(key);
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const y = rnd() * S, x = rnd() * S, len = 60 + rnd() * 240;
    ctx.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.04})` : `rgba(40,20,0,${0.015 + rnd() * 0.035})`;
    ctx.lineWidth = 0.7 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rnd() - 0.5) * 3); ctx.stroke();
    if (x + len > S) { ctx.beginPath(); ctx.moveTo(x - S, y); ctx.lineTo(x - S + len, y); ctx.stroke(); }
  }
  // worn / pooled edges: darker rim along the tile border
  const E = 14;
  for (const [x0, y0, x1, y1] of [[0, 0, E, 0], [S, 0, S - E, 0], [0, 0, 0, E], [0, S, 0, S - E]]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(60,35,10,0.20)'); g.addColorStop(1, 'rgba(60,35,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  // tiny chips near the edges: bare-wood fleck with a darker rim
  for (let i = 0; i < 9; i++) {
    const nearX = rnd() < 0.5;
    const e = 3 + rnd() * 22, flip = rnd() < 0.5;
    const x = nearX ? (flip ? e : S - e) : rnd() * S, y = nearX ? rnd() * S : (flip ? e : S - e);
    const r = 1.2 + rnd() * 2.2;
    ctx.fillStyle = 'rgba(70,45,20,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, r + 1, r * 0.7 + 1, rnd() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(205,170,120,0.8)';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  addNoise(ctx, S, S, 6, rnd);
  const t = toTex(c);
  paintCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- textiles
export function gingham(color = '#3b82d6') {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(0, 0, S / 2, S);
  ctx.fillRect(0, 0, S, S / 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < S; i += 3) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  addNoise(ctx, S, S, 10, rngf(4));
  return toTex(c);
}

// Fine plain-weave bump map (use as bumpMap). Tile = 16 x 16 threads; set a big .repeat.
export function weave() {
  const S = 128, T = 8;
  const [c, ctx] = makeCanvas(S, S);
  const id = ctx.createImageData(S, S);
  const rnd = rngf(77);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / T), cy = Math.floor(y / T);
      const fx = ((x % T) + 0.5) / T, fy = ((y % T) + 0.5) / T;
      const hor = (cx + cy) % 2 === 0; // weft thread on top
      const v = hor ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
      const k = 120 + v * 90 + (rnd() - 0.5) * 18;
      const i = (y * S + x) * 4;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = k; id.data[i + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return toTex(c, false);
}

// Quilted cotton duvet: muted terracotta, lighter diamond stitching. Tile = 1024 px (16 x 16 half-diamonds).
// Returns { map, bump }. Diamond diagonal = 128 px = tile / 8.
export function quilt() {
  const S = 1024, h = 64;
  const [c, ctx] = makeCanvas(S, S);
  const [bc, bctx] = makeCanvas(S, S);
  const rnd = rngf(23);
  ctx.fillStyle = '#c4614a'; ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#000'; bctx.fillRect(0, 0, S, S);
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 16; j++) {
      if ((i + j) % 2) continue;
      const cx = i * h, cy = j * h;
      const path = (cc) => {
        cc.beginPath();
        cc.moveTo(cx - h, cy); cc.lineTo(cx, cy - h); cc.lineTo(cx + h, cy); cc.lineTo(cx, cy + h);
        cc.closePath();
      };
      const g = ctx.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, h * 0.95);
      g.addColorStop(0, '#e08a6c'); g.addColorStop(0.6, '#cf6a50'); g.addColorStop(1, '#9a4a38');
      ctx.fillStyle = g; path(ctx); ctx.fill();
      const bg = bctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.9);
      bg.addColorStop(0, '#fff'); bg.addColorStop(0.7, '#a0a0a0'); bg.addColorStop(1, '#000');
      bctx.fillStyle = bg; path(bctx); bctx.fill();
      // tiny star in the middle of some diamonds
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(250,215,180,0.45)';
        star(ctx, cx, cy, 9, 4); ctx.fill();
      }
    }
  }
  // stitch lines
  ctx.strokeStyle = '#efd0b8'; ctx.lineWidth = 3; ctx.setLineDash([9, 7]);
  for (let k = -S; k <= 2 * S; k += 2 * h) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + S, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k, S); ctx.lineTo(k + S, 0); ctx.stroke();
  }
  ctx.setLineDash([]);
  // fabric weave noise
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,200,160,0.08)' : 'rgba(80,0,0,0.10)';
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 4, 1);
  }
  addNoise(ctx, S, S, 12, rnd);
  // fine cotton weave baked into the bump (4 px threads)
  {
    const id = bctx.getImageData(0, 0, S, S), d = id.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const hor = ((x >> 2) + (y >> 2)) % 2 === 0;
        const f = hor ? Math.sin((((y & 3) + 0.5) / 4) * Math.PI) : Math.sin((((x & 3) + 0.5) / 4) * Math.PI);
        const i = (y * S + x) * 4, k = (f - 0.5) * 16;
        d[i] += k; d[i + 1] += k; d[i + 2] += k;
      }
    }
    bctx.putImageData(id, 0, 0);
  }
  return { map: toTex(c), bump: toTex(bc, false) };
}

// White fitted sheet with a small colorful print.
export function sheetPrint() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(41);
  ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 0, S, S);
  const cols = ['#e8453c', '#2f7de1', '#f5b700', '#2fb36b', '#9a5be0', '#ff7ab0'];
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
    const k = Math.floor(rnd() * 3), s = 5 + rnd() * 5;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (k === 0) { star(ctx, x + ox, y + oy, s, s * 0.45); ctx.fill(); }
      else if (k === 1) { heart(ctx, x + ox, y + oy, s * 0.8); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x + ox, y + oy, s * 0.55, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = 'rgba(120,100,70,0.06)';
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 1);
  }
  addNoise(ctx, S, S, 8, rnd);
  return toTex(c);
}

// Second sheet: blue stripes with tiny white stars.
export function sheetStripes() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(52);
  ctx.fillStyle = '#f3f7ff'; ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 64) {
    ctx.fillStyle = '#2a64d6'; ctx.fillRect(x, 0, 32, S);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x + 32, 0, 5, S);
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * 8) * 64 + 16 + rnd() * 6, y = rnd() * S;
    ctx.fillStyle = '#ffffff';
    star(ctx, x, y, 6, 2.6); ctx.fill();
  }
  addNoise(ctx, S, S, 9, rnd);
  return toTex(c);
}

// ---------------------------------------------------------------- lamp / toybox
export function lampShade() {
  const W = 1024, H = 320;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = rngf(5);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2848c8');
  g.addColorStop(1, '#4f7af0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = 20 + rnd() * (W - 40), y = 15 + rnd() * (H - 30);
    ctx.fillStyle = rnd() < 0.6 ? '#ffe36b' : '#ffffff';
    star(ctx, x, y, 5 + rnd() * 8, 2.5 + rnd() * 3);
    ctx.fill();
  }
  const planet = (x, y, r, col, ring) => {
    if (ring) {
      ctx.strokeStyle = ring; ctx.lineWidth = r * 0.28;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 0.5, -0.3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill();
    if (ring) {
      ctx.strokeStyle = ring; ctx.lineWidth = r * 0.28;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 0.5, -0.3, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  };
  planet(180, 150, 34, '#ff9a3c', '#ffe08a');
  planet(470, 90, 24, '#59d48a', null);
  planet(700, 190, 30, '#ff7fb0', '#ffffff');
  planet(900, 100, 20, '#c58bf0', null);
  ctx.fillStyle = '#fff4b0';
  ctx.beginPath(); ctx.arc(330, 220, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3558dc';
  ctx.beginPath(); ctx.arc(345, 212, 26, 0, Math.PI * 2); ctx.fill();
  return toTex(c);
}

// Painted emblem (transparent) for the toy box front: yellow star on a green circle.
export function toyBoxEmblem() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#1e9c4c';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 22, 0, Math.PI * 2); ctx.stroke();
  star(ctx, S / 2, S / 2 + 12, 190, 84);
  ctx.fillStyle = '#ffd000'; ctx.fill();
  ctx.strokeStyle = '#e8780c'; ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.stroke();
  // painted-on texture: chipped speckle
  const rnd = rngf(9);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 1 + rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, true, true);
}

// Soft sheer-light patch for the sill (additive).
export function sheer() {
  const [c, ctx] = makeCanvas(256, 64);
  const g = ctx.createRadialGradient(128, 32, 4, 128, 32, 128);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.setTransform(1, 0, 0, 0.5, 0, 16);
  ctx.fillStyle = g; ctx.fillRect(0, -32, 256, 128);
  return toTex(c, true, true);
}

// ---------------------------------------------------------------- outside the window
function puff(ctx, x, y, s, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, s);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.6, `rgba(255,255,255,${a * 0.6})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
}

// Opaque sky: gradient + sun glow + soft clouds. Horizon at the bottom.
export function sky() {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = rngf(61);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f86e0');
  g.addColorStop(0.55, '#6db6f2');
  g.addColorStop(1, '#cfeaff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(780, 330, 4, 780, 330, 220);
  glow.addColorStop(0, 'rgba(255,248,210,0.9)');
  glow.addColorStop(0.3, 'rgba(255,240,190,0.35)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * W, cy = 60 + rnd() * 300, n = 8 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) puff(ctx, cx + (rnd() - 0.5) * 170, cy + (rnd() - 0.5) * 30, 26 + rnd() * 34, 0.55 + rnd() * 0.3);
  }
  const t = toTex(c, true, true);
  return t;
}

function treeBlob(ctx, x, y, r, cols, rnd) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// Distant tree line (alpha). 2048 x 512; bottom of the image is the ground.
export function treeline() {
  const W = 2048, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = rngf(71);
  for (let layer = 0; layer < 2; layer++) {
    const cols = layer === 0 ? ['#6fae86', '#3f7f64'] : ['#4ea062', '#2a6d40'];
    for (let i = 0; i < 26; i++) {
      const x = (i + rnd() * 0.8) * (W / 26), base = H - 8 - layer * 30;
      const th = 80 + rnd() * 120;
      ctx.fillStyle = '#5b4030';
      ctx.fillRect(x - 6, base - th * 0.5, 12, th * 0.5 + 10);
      const R = 50 + rnd() * 40;
      for (let k = 0; k < 6; k++) treeBlob(ctx, x + (rnd() - 0.5) * R * 1.1, base - th * 0.5 - rnd() * R * 0.9 - R * 0.4, R * (0.55 + rnd() * 0.4), cols, rnd);
    }
  }
  ctx.globalCompositeOperation = 'source-atop';
  const hz = ctx.createLinearGradient(0, 0, 0, H);
  hz.addColorStop(0, 'rgba(190,225,250,0.0)');
  hz.addColorStop(1, 'rgba(190,225,250,0.28)');
  ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  return toTex(c, true, true);
}

// Garden hedge with flowers (alpha). 2048 x 256.
export function hedge() {
  const W = 2048, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = rngf(81);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3fa24a'); g.addColorStop(1, '#1c6a30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 70, W, H - 70);
  for (let x = 0; x < W; x += 14) {
    ctx.beginPath(); ctx.arc(x + rnd() * 10, 78 + Math.sin(x * 0.01) * 10 + rnd() * 16, 22 + rnd() * 14, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(150,230,110,${0.15 + rnd() * 0.3})` : `rgba(10,60,25,${0.15 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(rnd() * W, 50 + rnd() * (H - 50), 2 + rnd() * 4, 0, Math.PI * 2); ctx.fill();
  }
  const fc = ['#ff6fa5', '#ffe14d', '#ffffff', '#ff8a3d'];
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = fc[Math.floor(rnd() * fc.length)];
    ctx.beginPath(); ctx.arc(rnd() * W, 70 + rnd() * 120, 3 + rnd() * 4, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, true, true);
}

// Sunlit lawn.
export function lawn() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(91);
  ctx.fillStyle = '#58b43c'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(160,235,100,0.35)' : 'rgba(25,100,30,0.35)';
    ctx.lineWidth = 1;
    const x = rnd() * S, y = rnd() * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 4, y - 5 - rnd() * 8); ctx.stroke();
  }
  return toTex(c);
}

// ---------------------------------------------------------------- the town behind the wall hole
const FAC_COLORS = ['#e8465a', '#ffc72e', '#22b8a8', '#ff8a2d', '#7a5cf0', '#3f9bff', '#ff6fa5', '#7ac52a'];
const FAC_WORDS = ['PAN-PAN', 'TOTO TOYS', 'KORO CAFE', 'MOMO INN', 'HANA', 'PIPPO', 'NUNU BOOKS', 'MIKKE MART'];

// Colorful shop facade 512 x 512 (windows, awning, sign, door).
export function facade(idx) {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(300 + idx * 17);
  const col = FAC_COLORS[idx % FAC_COLORS.length];
  const word = FAC_WORDS[idx % FAC_WORDS.length];
  ctx.fillStyle = col; ctx.fillRect(0, 0, S, S);
  // siding / brick lines
  for (let y = 0; y < S; y += 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(0, y, S, 2);
    for (let x = (y / 10 % 2) * 20; x < S; x += 40) ctx.fillRect(x, y, 2, 10);
  }
  // upper windows
  for (let i = 0; i < 3; i++) {
    const wx = 40 + i * 150, wy = 40, ww = 100, wh = 120;
    ctx.fillStyle = '#fff6e6'; ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    const lit = rnd() < 0.8;
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, lit ? '#ffe9a0' : '#5a7090'); g.addColorStop(1, lit ? '#ffb347' : '#34455e');
    ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = '#fff6e6'; ctx.fillRect(wx + ww / 2 - 3, wy, 6, wh); ctx.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    if (lit && rnd() < 0.6) { ctx.fillStyle = 'rgba(80,40,20,0.45)'; ctx.beginPath(); ctx.arc(wx + 30 + rnd() * 40, wy + wh, 22, Math.PI, 0); ctx.fill(); }
    // flower box
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(wx - 6, wy + wh + 8, ww + 12, 14);
    for (let k = 0; k < 6; k++) { ctx.fillStyle = ['#ff4f6a', '#ffe14d', '#ffffff'][k % 3]; ctx.beginPath(); ctx.arc(wx + 6 + k * 18, wy + wh + 6, 7, 0, Math.PI * 2); ctx.fill(); }
  }
  // sign
  ctx.fillStyle = '#2a1a3a'; ctx.fillRect(40, 220, 432, 64);
  ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 5; ctx.strokeRect(44, 224, 424, 56);
  ctx.fillStyle = '#ffe58a'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(word, S / 2, 254);
  // awning
  const aw = idx % 2 ? '#ffffff' : '#fff3d0', ac = ['#e53b3b', '#2f7de1', '#2fb36b', '#f59a00'][idx % 4];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? aw : ac;
    ctx.beginPath(); ctx.moveTo(30 + i * 56, 290); ctx.lineTo(86 + i * 56, 290); ctx.lineTo(86 + i * 56, 340); ctx.arc(58 + i * 56, 340, 28, 0, Math.PI); ctx.closePath(); ctx.fill();
  }
  // shop window + door
  const g2 = ctx.createLinearGradient(0, 380, 0, S);
  g2.addColorStop(0, '#ffe08a'); g2.addColorStop(1, '#ffa94a');
  ctx.fillStyle = '#fff6e6'; ctx.fillRect(34, 372, 280, 140);
  ctx.fillStyle = g2; ctx.fillRect(42, 380, 264, 132);
  for (let k = 0; k < 5; k++) { ctx.fillStyle = ['#e53b3b', '#2f7de1', '#2fb36b', '#9a5be0', '#ffffff'][k]; ctx.fillRect(60 + k * 46, 470 - (k % 3) * 14, 32, 40 + (k % 3) * 14); }
  ctx.fillStyle = '#5a3320'; ctx.fillRect(340, 360, 130, 152);
  ctx.fillStyle = '#7a4a2a'; ctx.fillRect(350, 370, 110, 142);
  ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(445, 440, 7, 0, Math.PI * 2); ctx.fill();
  addNoise(ctx, S, S, 10, rnd);
  return toTex(c, true, true);
}

// Dusk sky backdrop with crescent moon and distant rooftops. 1024 x 512.
export function dusk() {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const rnd = rngf(401);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d1857'); g.addColorStop(0.45, '#6a3f9f'); g.addColorStop(0.75, '#ff7f5c'); g.addColorStop(1, '#ffc27a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * 0.45, 0.8 + rnd() * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  const mg = ctx.createRadialGradient(760, 110, 10, 760, 110, 90);
  mg.addColorStop(0, 'rgba(255,240,170,0.5)'); mg.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = mg; ctx.fillRect(660, 10, 200, 200);
  ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.arc(760, 110, 40, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(778, 100, 36, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // far rooftops
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? '#2b1d52' : '#4a2f78';
    let x = 0;
    while (x < W) {
      const w = 40 + rnd() * 70, h = 60 + rnd() * 90 + (1 - layer) * 40, y = H - h - (1 - layer) * 40;
      ctx.fillRect(x, y, w, H - y);
      if (rnd() < 0.4) { ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + w / 2, y - 30); ctx.lineTo(x + w + 4, y); ctx.fill(); }
      for (let wy = y + 12; wy < H - 20; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 18) {
        if (rnd() < 0.35) { ctx.fillStyle = '#ffd36a'; ctx.fillRect(wx, wy, 7, 10); ctx.fillStyle = layer ? '#2b1d52' : '#4a2f78'; }
      }
      x += w + 2;
    }
  }
  return toTex(c, true, true);
}

// Town floor: sidewalks, cobbled road and centre dashes. 1024 x 1024.
// u runs along x (the street), v across it (road is the middle 36% of v).
export function townGround() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  const rnd = rngf(501);
  ctx.fillStyle = '#c8b9a2'; ctx.fillRect(0, 0, S, S);
  const y0 = S * 0.33, y1 = S * 0.67;
  // sidewalk tiles
  for (let y = 0; y < S; y += 40) for (let x = 0; x < S; x += 64) {
    if (y > y0 - 40 && y < y1) continue;
    ctx.fillStyle = `hsl(${30 + rnd() * 10},${15 + rnd() * 10}%,${66 + rnd() * 10}%)`;
    ctx.fillRect(x + 1, y + 1, 62, 38);
  }
  // cobbles
  for (let y = y0; y < y1; y += 22) for (let x = -((y / 22) % 2) * 14; x < S; x += 28) {
    const l = 38 + rnd() * 20;
    ctx.fillStyle = `hsl(${220 + rnd() * 40},${8 + rnd() * 10}%,${l}%)`;
    ctx.beginPath(); ctx.ellipse(x + 14, y + 11, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(x + 11, y + 8, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(40,40,60,0.3)'; ctx.fillRect(0, y0 - 3, S, 5); ctx.fillRect(0, y1 - 2, S, 5);
  ctx.fillStyle = '#ffe58a';
  for (let x = 20; x < S; x += 110) ctx.fillRect(x, S / 2 - 4, 60, 8);
  addNoise(ctx, S, S, 10, rnd);
  return toTex(c, true, true);
}
