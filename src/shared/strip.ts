/**
 * One-row sprite strips: one PNG per pet state (e.g. 4 frames side by side on a green or magenta
 * background). Pure pixel-buffer code, no DOM, so it is unit-testable.
 */
import { newImg, removeBackground, type Img } from "./imageprep";
import type { AnimationDef } from "./types";

export type KeyColor = "auto" | "green" | "magenta" | "none";
type RGB = [number, number, number];

const KEYS: Record<"green" | "magenta", RGB> = { green: [0, 255, 0], magenta: [255, 0, 255] };
const dist = (d: Uint8ClampedArray, i: number, c: RGB) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

function borderPixels(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);
  return out;
}

/** Dominant opaque border colour, or null when the border is mostly transparent / mixed. */
export function borderColor(img: Img): RGB | null {
  const { w, h, d } = img;
  const border = borderPixels(w, h);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const p of border) {
    const i = p * 4;
    if (d[i + 3] < 20) continue;
    const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
    buckets.set(k, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < border.length * 0.5) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

const saturated = (c: RGB) => Math.max(...c) - Math.min(...c) > 120;

/**
 * Remove a chroma-key background. Unlike the flood fill used for single images this also clears the
 * key colour between and inside frames (gaps under legs etc.), which is what a strip needs.
 * Returns what was done, for the import notes.
 */
export function chromaKey(img: Img, key: KeyColor, tol = 100): "keyed" | "flood" | "none" {
  if (key === "none") return "none";
  const { w, h, d } = img;
  const seen = borderColor(img);
  let c: RGB;
  if (key === "auto") {
    if (!seen) return "none"; // already transparent, or no clear background
    if (!saturated(seen)) return removeBackground(img) ? "flood" : "none"; // white/grey bg: keep same-coloured details inside
    c = seen;
  } else {
    // prefer the real (often slightly off) background colour when it is close to the chosen key
    c = seen && dist(new Uint8ClampedArray(seen), 0, KEYS[key]) < 220 ? seen : KEYS[key];
  }
  const gone = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (d[p * 4 + 3] < 20 || dist(d, p * 4, c) <= tol) gone[p] = 1;
  // anti-aliased fringe hugging the removed area
  for (let pass = 0; pass < 2; pass++) {
    const extra: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (gone[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const near = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
      if (near && dist(d, p * 4, c) <= tol * 1.8) extra.push(p);
    }
    for (const p of extra) gone[p] = 1;
  }
  const greenish = c[1] > c[0] + 80 && c[1] > c[2] + 80;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (gone[p]) { d[i + 3] = 0; continue; }
    // de-spill: green light bleeding onto the outline (edge pixels only, so green characters keep their colour)
    const x = p % w, y = (p / w) | 0;
    const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
    if (greenish && edge && d[i + 1] > Math.max(d[i], d[i + 2])) d[i + 1] = Math.max(d[i], d[i + 2]);
  }
  return "keyed";
}

/** How many frames are in the strip: by transparent gaps between sprites, else square frames. */
export function detectFrameCount(img: Img): number {
  const { w, h, d } = img;
  const filled: boolean[] = [];
  for (let x = 0; x < w; x++) {
    let any = false;
    for (let y = 0; y < h && !any; y++) any = d[(y * w + x) * 4 + 3] > 16;
    filled.push(any);
  }
  const segs: [number, number][] = [];
  for (let x = 0; x < w; x++) {
    if (!filled[x]) continue;
    const s = x;
    while (x < w && filled[x]) x++;
    segs.push([s, x]);
  }
  const square = Math.max(1, Math.round(w / h));
  if (segs.length < 2) return square;
  // every sprite must sit in its own equal-width cell; otherwise the gaps are inside sprites
  const n = segs.length, cell = w / n;
  const ok = segs.every(([a, b], i) => Math.floor(a / cell) === i && Math.floor((b - 1) / cell) === i);
  return ok ? n : square;
}

/** Cut the strip into `n` equal cells, then crop all of them to their shared content box (keeps motion aligned). */
export function splitStrip(img: Img, n: number): Img[] {
  const { w, h, d } = img;
  n = Math.max(1, Math.min(64, Math.round(n)));
  const cw = Math.max(1, Math.floor(w / n));
  const x0s = Array.from({ length: n }, (_, i) => Math.round((i * w) / n));
  let bx0 = cw, by0 = h, bx1 = -1, by1 = -1;
  for (const ox of x0s)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < cw && ox + x < w; x++)
        if (d[(y * w + ox + x) * 4 + 3] > 16) {
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
  if (bx1 < 0) { bx0 = 0; by0 = 0; bx1 = cw - 1; by1 = h - 1; }
  const fw = bx1 - bx0 + 1, fh = by1 - by0 + 1;
  return x0s.map((ox) => {
    const out = newImg(fw, fh);
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) {
        const sx = ox + bx0 + x;
        if (sx >= w) continue;
        out.d.set(d.subarray(((by0 + y) * w + sx) * 4, ((by0 + y) * w + sx) * 4 + 4), (y * fw + x) * 4);
      }
    return out;
  });
}

export interface StripAnim { name: string; frames: Img[]; fps: number; loop: boolean }

/**
 * Pack animations into one sheet, one row each. Frames sit bottom-centre in the shared cell so feet
 * stay on the ground when switching states.
 */
export function composeSheet(anims: StripAnim[]): { sheet: Img; frameWidth: number; frameHeight: number; animations: Record<string, AnimationDef> } {
  const all = anims.flatMap((a) => a.frames);
  const fw = Math.max(1, ...all.map((f) => f.w)), fh = Math.max(1, ...all.map((f) => f.h));
  const cols = Math.max(1, ...anims.map((a) => a.frames.length));
  const sheet = newImg(cols * fw, Math.max(1, anims.length) * fh);
  const animations: Record<string, AnimationDef> = {};
  anims.forEach((a, row) => {
    animations[a.name] = { start: row * cols, count: a.frames.length, fps: a.fps, loop: a.loop };
    a.frames.forEach((f, col) => {
      const ox = col * fw + Math.floor((fw - f.w) / 2), oy = row * fh + (fh - f.h);
      for (let y = 0; y < f.h; y++) sheet.d.set(f.d.subarray(y * f.w * 4, (y + 1) * f.w * 4), ((oy + y) * sheet.w + ox) * 4);
    });
  });
  return { sheet, frameWidth: fw, frameHeight: fh, animations };
}

/** Default timing per state for a freshly imported row. */
export function defaultTiming(state: string): { fps: number; loop: boolean } {
  const once = ["jump", "drop", "stretch", "yawn"];
  const fps: Record<string, number> = { idle: 4, sleep: 2, sit: 3, walk: 8, run: 12, typing: 10, scroll: 8, jump: 10, drop: 8, happy: 6, thinking: 4, yawn: 4, stretch: 5 };
  return { fps: fps[state] ?? 6, loop: !once.includes(state) };
}
