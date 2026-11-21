import { alphaOf, animationsFromGuess, guessGrid } from "./detect";
import {
  animateStill, cropToContent, detectBlock, downsampleBlocks, newImg, packSheet, removeBackground, type Img,
} from "./imageprep";
import type { SpriteConfig } from "./types";
import { normalizeConfig } from "../pet/sprite";

export interface ImportOptions { clean: boolean; animate: boolean }
export interface ImportResult { png: string; config: SpriteConfig; notes: string[]; suggestedScale: number }

const toImg = (c: HTMLCanvasElement): Img => {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const id = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, d: id.data };
};
function toCanvas(img: Img): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.w; c.height = img.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.d), img.w, img.h), 0, 0);
  return c;
}

/** Smooth downscale in halving steps (avoids the aliasing of a single big drawImage). */
function shrink(src: HTMLCanvasElement, targetH: number): HTMLCanvasElement {
  let cur = src;
  while (cur.height > targetH) {
    const nh = Math.max(targetH, Math.floor(cur.height / 2)), nw = Math.max(1, Math.round((cur.width * nh) / cur.height));
    const c = document.createElement("canvas");
    c.width = nw; c.height = nh;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
  }
  return cur;
}

export async function processImport(image: HTMLImageElement, name: string, opt: ImportOptions): Promise<ImportResult> {
  const notes: string[] = [];
  let c = document.createElement("canvas");
  c.width = image.naturalWidth; c.height = image.naturalHeight;
  c.getContext("2d")!.drawImage(image, 0, 0);

  let pixelArt = false;
  if (opt.clean) {
    if (Math.max(c.width, c.height) > 1200) c = shrink(c, Math.round(1200 * Math.min(1, c.height / c.width)) || 1200);
    let img = toImg(c);
    if (removeBackground(img)) notes.push("background removed");
    const block = detectBlock(img);
    if (block) {
      img = downsampleBlocks(img, block.n, block.ox, block.oy);
      pixelArt = true;
      notes.push(`restored pixel art (${block.n}× blocks → ${img.w}×${img.h})`);
    }
    c = toCanvas(img);
    if (!pixelArt && c.height > 96) { c = shrink(c, 96); notes.push(`downscaled to ${c.width}×${c.height}`); }
  }

  const { w, h, alpha } = await alphaOfCanvas(c);
  const grid = guessGrid(w, h, alpha);
  const single = grid.cols === 1 && grid.rows === 1;

  if (single && opt.animate) {
    const sprite = cropToContent(toImg(c));
    const sheet = animateStill(sprite);
    const packed = packSheet(sheet.frames, sheet.frameWidth, sheet.frameHeight);
    const cfg = normalizeConfig({
      name, frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
      animations: sheet.animations, states: sheet.states, smooth: !pixelArt && opt.clean, quirks: [],
    });
    notes.push(`generated ${sheet.frames.length} animation frames`);
    return { png: toCanvas(packed).toDataURL("image/png"), config: cfg, notes, suggestedScale: scaleFor(sheet.frameHeight) };
  }

  const { animations, states } = animationsFromGuess(grid);
  const cfg = normalizeConfig({
    name, frameWidth: grid.frameWidth, frameHeight: grid.frameHeight, animations, states,
    smooth: opt.clean && !pixelArt, renderScale: 1,
  });
  notes.push(single ? "single image" : `detected ${grid.frameWidth}×${grid.frameHeight} frames`);
  return { png: c.toDataURL("image/png"), config: cfg, notes, suggestedScale: scaleFor(grid.frameHeight) };
}

/** Pick the pixel scale that makes the pet roughly 100 logical px tall. */
export const scaleFor = (frameH: number) => Math.min(5, Math.max(1, Math.round(100 / frameH)));

async function alphaOfCanvas(c: HTMLCanvasElement) {
  const img = toImg(c);
  const alpha = new Uint8Array(img.w * img.h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.d[i * 4 + 3];
  return { w: img.w, h: img.h, alpha };
}

export { alphaOf, newImg };
