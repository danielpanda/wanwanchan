/** Pure pixel-buffer helpers for import cleanup and procedural animation (no DOM needed, so they are testable). */
export interface Img { w: number; h: number; d: Uint8ClampedArray }

export const newImg = (w: number, h: number): Img => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

// ---------------------------------------------------------------- background removal
const l1 = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);

/**
 * Removes a solid / lightly shaded background by flood-filling inward from the border, so
 * same-coloured pixels *inside* the subject (e.g. white eyes) are kept. Returns true if anything changed.
 */
export function removeBackground(img: Img, tol = 60): boolean {
  const { w, h, d } = img;
  const border: number[] = [];
  for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w, y * w + w - 1); }
  const transparent = border.filter((p) => d[p * 4 + 3] < 20).length;
  if (transparent > border.length * 0.5) return false; // already has transparency

  // dominant border colour (quantised), averaged
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const p of border) {
    const i = p * 4;
    if (d[i + 3] < 20) continue;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
    buckets.set(k, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < border.length * 0.4) return false; // no clear background colour
  const br = best.r / best.n, bg = best.g / best.n, bb = best.b / best.n;

  const gone = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (gone[p]) return;
    const i = p * 4;
    if (d[i + 3] < 20 || l1(d, i, br, bg, bb) <= tol) { gone[p] = 1; stack.push(p); }
  };
  for (const p of border) push(p);
  while (stack.length) {
    const p = stack.pop()!, x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  // background trapped between legs / under arms: enclosed bg-coloured pockets in the lowest part of the subject
  {
    let y0 = h, y1 = -1;
    for (let p = 0; p < w * h; p++) if (!gone[p]) { const y = (p / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cut = y0 + (y1 - y0) * 0.7;
    const seen = new Uint8Array(w * h);
    const isBg = (p: number) => !gone[p] && d[p * 4 + 3] > 20 && l1(d, p * 4, br, bg, bb) <= tol;
    for (let s0 = 0; s0 < w * h; s0++) {
      if (seen[s0] || !isBg(s0)) continue;
      const comp: number[] = [s0], st = [s0];
      seen[s0] = 1;
      let low = 0;
      while (st.length) {
        const p = st.pop()!, x = p % w, y = (p / w) | 0;
        if (y >= cut) low++;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
          if (q >= 0 && !seen[q] && isBg(q)) { seen[q] = 1; st.push(q); comp.push(q); }
      }
      if (comp.length >= 150 && low === comp.length) for (const p of comp) gone[p] = 1;
    }
  }
  // remove light halo pixels hugging the removed area (anti-aliased fringe)
  for (let pass = 0; pass < 2; pass++) {
    const extra: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (gone[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const near = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
      if (near && l1(d, p * 4, br, bg, bb) <= tol * 2.2) extra.push(p);
    }
    for (const p of extra) gone[p] = 1;
  }
  let removed = 0;
  for (let p = 0; p < w * h; p++) if (gone[p]) { d[p * 4 + 3] = 0; removed++; }
  return removed > 0;
}

export function cropToContent(img: Img, thr = 16): Img {
  const { w, h, d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > thr) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return img;
  const out = newImg(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = ((y + y0) * w + x + x0) * 4, o = (y * out.w + x) * 4;
    out.d[o] = img.d[s]; out.d[o + 1] = img.d[s + 1]; out.d[o + 2] = img.d[s + 2]; out.d[o + 3] = img.d[s + 3];
  }
  return out;
}

// ---------------------------------------------------------------- upscaled pixel-art detection
const same = (d: Uint8ClampedArray, i: number, j: number, tol: number) => {
  const a = d[i + 3], b = d[j + 3];
  if (a < 64 && b < 64) return true;
  if (a < 64 || b < 64) return false;
  return Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) <= tol;
};

/** Is this a low-res pixel-art image that was enlarged by an integer factor n? Returns n and the block offsets. */
export function detectBlock(img: Img, tol = 32): { n: number; ox: number; oy: number } | null {
  const { w, h, d } = img;
  // Pixel art has hard edges; smooth gradients / photos do not and must not be "restored".
  let pairs = 0, edges = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w - 1; x++) {
    pairs++;
    if (!same(d, (y * w + x) * 4, (y * w + x + 1) * 4, 48)) edges++;
  }
  if (edges < pairs * 0.01) return null;
  const ys = Math.max(1, Math.floor(h / 300)), xs = Math.max(1, Math.floor(w / 300));
  const cons = (n: number) => {
    let bestX = 0, bestY = 0, oxB = 0, oyB = 0;
    for (let o = 0; o < n; o++) {
      let ok = 0, tot = 0;
      for (let y = 0; y < h; y += ys) for (let x = 0; x < w; x++) {
        const c = Math.min(w - 1, Math.max(0, Math.floor((x - o) / n) * n + o + (n >> 1)));
        tot++; if (same(d, (y * w + x) * 4, (y * w + c) * 4, tol)) ok++;
      }
      if (ok / tot > bestX) { bestX = ok / tot; oxB = o; }
      ok = 0; tot = 0;
      for (let x = 0; x < w; x += xs) for (let y = 0; y < h; y++) {
        const c = Math.min(h - 1, Math.max(0, Math.floor((y - o) / n) * n + o + (n >> 1)));
        tot++; if (same(d, (y * w + x) * 4, (c * w + x) * 4, tol)) ok++;
      }
      if (ok / tot > bestY) { bestY = ok / tot; oyB = o; }
    }
    return { c: Math.min(bestX, bestY), ox: oxB, oy: oyB };
  };
  let found: { n: number; ox: number; oy: number } | null = null;
  for (let n = 2; n <= 24 && n * 4 <= Math.min(w, h); n++) {
    const r = cons(n);
    if (r.c >= 0.94) found = { n, ox: r.ox, oy: r.oy };
  }
  return found;
}

/** Collapse n×n blocks to single pixels (nearest/centre sample) and binarise alpha for crisp edges. */
export function downsampleBlocks(img: Img, n: number, ox: number, oy: number): Img {
  const w2 = Math.floor((img.w - ox) / n), h2 = Math.floor((img.h - oy) / n);
  const out = newImg(w2, h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const s = ((oy + y * n + (n >> 1)) * img.w + ox + x * n + (n >> 1)) * 4, o = (y * w2 + x) * 4;
    const a = img.d[s + 3] >= 128 ? 255 : 0;
    out.d[o] = img.d[s]; out.d[o + 1] = img.d[s + 1]; out.d[o + 2] = img.d[s + 2]; out.d[o + 3] = a;
  }
  return out;
}

// ---------------------------------------------------------------- procedural animation for a single image
export interface FrameParams {
  lift?: number; sx?: number; sy?: number; shear?: number; dx?: number; tint?: number; deco?: string;
}

const px = (f: Img, x: number, y: number, c: [number, number, number]) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
  const o = (y * f.w + x) * 4;
  f.d[o] = c[0]; f.d[o + 1] = c[1]; f.d[o + 2] = c[2]; f.d[o + 3] = 255;
};
const HEART: [number, number][] = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
const heart = (f: Img, x: number, y: number) => HEART.forEach(([a, b]) => px(f, x + a, y + b, [255, 88, 120]));
const star = (f: Img, x: number, y: number) => [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => px(f, x + a, y + b, [255, 218, 80]));
function decorate(f: Img, deco: string) {
  const W = f.w;
  switch (deco) {
    case "hearts0": heart(f, 1, 5); heart(f, W - 7, 2); break;
    case "hearts1": heart(f, 2, 2); heart(f, W - 8, 0); break;
    case "hearts2": heart(f, 0, 7); heart(f, W - 6, 4); break;
    case "stars0": star(f, 5, 5); star(f, W - 6, 6); star(f, W >> 1, 2); break;
    case "stars1": star(f, 7, 3); star(f, W - 8, 4); break;
    case "sweat": for (let i = 0; i < 3; i++) px(f, W - 6, 4 + i, [120, 176, 255]), px(f, W - 5, 4 + i, [120, 176, 255]); break;
    case "zzz0": case "zzz1": {
      const t = deco === "zzz1" ? 1 : 0;
      for (const [x, y, s] of [[W - 12 + t, 6 - t, 3], [W - 7 + t, 1 - t, 4]]) {
        for (let i = 0; i < s; i++) { px(f, x + i, y, [120, 176, 255]); px(f, x + i, y + s - 1, [120, 176, 255]); px(f, x + s - 1 - i, y + i, [120, 176, 255]); }
      }
      break;
    }
    case "think1": case "think2": case "think3": {
      const n = Number(deco.slice(5)), x0 = W - 14, y0 = 0;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 12; x++) {
        if ((x === 0 || x === 11) && (y === 0 || y === 6)) continue;
        px(f, x0 + x, y0 + y, (x === 0 || x === 11 || y === 0 || y === 6) ? [90, 90, 110] : [255, 255, 255]);
      }
      for (let i = 0; i < n; i++) { px(f, x0 + 2 + i * 3, y0 + 3, [90, 90, 110]); px(f, x0 + 3 + i * 3, y0 + 3, [90, 90, 110]); }
      break;
    }
  }
}

/** Render one transformed frame (squash/stretch, row shear for lean, lift) with pixel-exact sampling. */
export function renderFrame(src: Img, fw: number, fh: number, p: FrameParams): Img {
  const f = newImg(fw, fh);
  const sx = p.sx ?? 1, sy = p.sy ?? 1, lift = p.lift ?? 0, shear = p.shear ?? 0, dx = p.dx ?? 0, tint = p.tint ?? 1;
  const base = fh - 1;
  for (let y = 0; y < fh; y++) {
    const hs = (base - y - lift + 0.5) / sy; // height above baseline in source pixels
    if (hs < 0 || hs >= src.h) continue;
    const sr = src.h - 1 - Math.floor(hs);
    const sh = Math.round(shear * hs);
    for (let x = 0; x < fw; x++) {
      const ix = Math.floor((x + 0.5 - fw / 2 - sh - dx) / sx + src.w / 2);
      if (ix < 0 || ix >= src.w) continue;
      const s = (sr * src.w + ix) * 4, o = (y * fw + x) * 4;
      if (src.d[s + 3] < 128) continue;
      f.d[o] = src.d[s] * tint; f.d[o + 1] = src.d[s + 1] * tint; f.d[o + 2] = src.d[s + 2] * tint; f.d[o + 3] = 255;
    }
  }
  if (p.deco) decorate(f, p.deco);
  return f;
}

export interface AnimatedSheet {
  frames: Img[];
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { start: number; count: number; fps: number; loop: boolean }>;
  states: Record<string, string>;
}

/** Turn one still image into a full set of pet animations. */
export function animateStill(src: Img): AnimatedSheet {
  const H = src.h;
  const L = (f: number) => Math.max(1, Math.round(f * H));
  const padX = Math.max(8, Math.round(src.w * 0.22));
  const padTop = Math.max(12, Math.round(H * 0.3));
  const fw = src.w + padX * 2, fh = H + padTop;
  type A = { name: string; fps: number; loop: boolean; fr: FrameParams[] };
  const defs: A[] = [
    { name: "idle", fps: 4, loop: true, fr: [{}, { sy: 1.03, sx: 0.99 }, { sy: 1.06, sx: 0.98 }, { sy: 1.03, sx: 0.99 }] },
    { name: "walk", fps: 8, loop: true, fr: [{ shear: 0.02 }, { shear: 0.07, lift: L(0.04) }, { shear: 0.12 }, { shear: 0.07, lift: L(0.04) }] },
    { name: "run", fps: 12, loop: true, fr: [{ shear: 0.16, lift: L(0.08), sy: 0.97 }, { shear: 0.22, sy: 0.93 }, { shear: 0.16, lift: L(0.08), sy: 0.97 }, { shear: 0.22, sy: 0.93 }] },
    { name: "sit", fps: 2, loop: true, fr: [{ sy: 0.92, sx: 1.04 }, { sy: 0.94, sx: 1.03 }] },
    { name: "sleep", fps: 1.5, loop: true, fr: [{ shear: 0.28, sy: 0.84, sx: 1.05, tint: 0.78, deco: "zzz0" }, { shear: 0.28, sy: 0.86, sx: 1.04, tint: 0.78, deco: "zzz1" }] },
    { name: "look", fps: 3, loop: true, fr: [{ shear: 0.08 }, { shear: 0.14, lift: L(0.03) }, { shear: 0.08 }, { shear: 0.0 }] },
    { name: "typing", fps: 10, loop: true, fr: [{}, { lift: L(0.03), sx: 1.02 }, {}, { lift: L(0.03), sx: 0.98 }] },
    { name: "jump", fps: 10, loop: false, fr: [{ sy: 0.84, sx: 1.12 }, { sy: 1.1, sx: 0.94, lift: L(0.05) }, { sy: 1.12, sx: 0.92, lift: L(0.08) }, { sy: 0.86, sx: 1.1 }] },
    { name: "happy", fps: 6, loop: true, fr: [{ shear: 0.08, deco: "hearts0" }, { shear: -0.08, lift: L(0.08), deco: "hearts1" }, { shear: 0.08, deco: "hearts2" }] },
    { name: "thinking", fps: 3, loop: true, fr: [{ shear: -0.05, deco: "think1" }, { shear: 0, deco: "think2" }, { shear: 0.05, deco: "think3" }] },
    { name: "drag", fps: 5, loop: true, fr: [{ sy: 1.12, sx: 0.94, shear: 0.1 }, { sy: 1.12, sx: 0.94, shear: -0.1 }] },
    { name: "drop", fps: 8, loop: false, fr: [{ sy: 0.78, sx: 1.16, deco: "stars0" }, { sy: 0.92, sx: 1.05, deco: "stars1" }] },
    { name: "error", fps: 6, loop: true, fr: [{ dx: -1, deco: "sweat" }, { dx: 1, deco: "sweat" }] },
    { name: "groom", fps: 6, loop: true, fr: [{ shear: 0.12 }, { shear: -0.12 }, { shear: 0.12 }, { shear: -0.12 }] },
    { name: "stretch", fps: 4, loop: false, fr: [{ sy: 0.86, sx: 1.1 }, { sy: 1.16, sx: 0.92 }, { sy: 1.04 }] },
    { name: "yawn", fps: 3, loop: false, fr: [{ sy: 1.02 }, { sy: 1.1, sx: 0.96 }, { sy: 1.1, sx: 0.96 }] },
    { name: "wiggle", fps: 8, loop: true, fr: [{ dx: -1, sy: 0.9 }, { sy: 0.9 }, { dx: 1, sy: 0.9 }] },
  ];
  const frames: Img[] = [];
  const animations: AnimatedSheet["animations"] = {};
  const states: Record<string, string> = {};
  for (const a of defs) {
    animations[a.name] = { start: frames.length, count: a.fr.length, fps: a.fps, loop: a.loop };
    states[a.name] = a.name;
    for (const p of a.fr) frames.push(renderFrame(src, fw, fh, p));
  }
  return { frames, frameWidth: fw, frameHeight: fh, animations, states };
}

export function packSheet(frames: Img[], fw: number, fh: number, cols = 8): Img {
  const rows = Math.ceil(frames.length / cols);
  const out = newImg(cols * fw, rows * fh);
  frames.forEach((f, i) => {
    const cx = (i % cols) * fw, cy = Math.floor(i / cols) * fh;
    for (let y = 0; y < fh; y++) out.d.set(f.d.subarray(y * fw * 4, (y + 1) * fw * 4), ((cy + y) * out.w + cx) * 4);
  });
  return out;
}
