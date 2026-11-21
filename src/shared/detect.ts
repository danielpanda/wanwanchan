import type { AnimationDef } from "./types";

export interface GridGuess {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  /** Non-empty frames per row (trailing empty cells dropped). */
  counts: number[];
}

const OCC = 8;

/** Candidate cell sizes: divisors of `total` (>= 8px) whose internal boundaries are fully transparent. */
function cleanSize(total: number, boundaryEmpty: (pos: number) => boolean): number | null {
  for (let size = 8; size < total; size++) {
    if (total % size) continue;
    const n = total / size;
    if (n < 2 || n > 64) continue;
    let ok = true;
    for (let k = 1; k < n && ok; k++) ok = boundaryEmpty(k * size);
    if (ok) return size;
  }
  return null;
}

/**
 * Guess the frame grid of a sprite sheet from its alpha channel (`alpha` has w*h entries).
 * A single image yields one frame covering the whole image.
 */
export function guessGrid(w: number, h: number, alpha: ArrayLike<number>): GridGuess {
  const col = new Uint8Array(w), row = new Uint8Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha[y * w + x] > OCC) { col[x] = 1; row[y] = 1; }
  // a boundary at `pos` is clean when columns pos-1 and pos hold no pixels
  let fw = cleanSize(w, (p) => !col[p - 1] && !col[p]) ?? w;
  let fh = cleanSize(h, (p) => !row[p - 1] && !row[p]) ?? h;
  if (fw === w && w >= h * 2 && w % h === 0) fw = h; // touching square frames in a strip
  if (fh === h && h >= w * 2 && h % w === 0) fh = w;
  if (fw === w && fh < h && h % fh === 0 && w % fh === 0 && w / fh <= 64 && w > fh) fw = fh;
  const cols = Math.max(1, Math.floor(w / fw)), rows = Math.max(1, Math.floor(h / fh));
  const counts: number[] = [];
  for (let r = 0; r < rows; r++) {
    let last = 0;
    for (let c = 0; c < cols; c++) {
      let any = false;
      for (let y = r * fh; y < (r + 1) * fh && !any; y++)
        for (let x = c * fw; x < (c + 1) * fw; x++) if (alpha[y * w + x] > OCC) { any = true; break; }
      if (any) last = c + 1;
    }
    counts.push(last);
  }
  return { frameWidth: fw, frameHeight: fh, cols, rows, counts };
}

/** Turn a grid guess into animations: one per non-empty row, idle mapped to the first. */
export function animationsFromGuess(g: GridGuess, fps = 6) {
  const animations: Record<string, AnimationDef> = {};
  g.counts.forEach((n, r) => { if (n > 0) animations[`row${r + 1}`] = { start: r * g.cols, count: n, fps, loop: true }; });
  const names = Object.keys(animations);
  if (!names.length) animations.row1 = { start: 0, count: 1, fps, loop: true };
  const first = Object.keys(animations)[0];
  const total = Object.values(animations).reduce((n, a) => n + (a.count ?? 1), 0);
  if (total === 1) return { animations: { idle: { start: 0, count: 1, fps: 4, loop: true } }, states: { idle: "idle" } };
  return { animations, states: { idle: first } as Record<string, string> };
}

/** Large (non pixel-art) images are scaled down so they fit a desktop pet. */
export function suggestRender(frameHeight: number): { renderScale: number; smooth: boolean } {
  if (frameHeight <= 64) return { renderScale: 1, smooth: false };
  return { renderScale: Math.round((48 / frameHeight) * 10000) / 10000, smooth: true };
}

export async function alphaOf(img: HTMLImageElement): Promise<{ w: number; h: number; alpha: Uint8Array }> {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
  return { w, h, alpha };
}
