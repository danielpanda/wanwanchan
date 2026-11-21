import { describe, expect, it } from "vitest";
import { animateStill, cropToContent, detectBlock, downsampleBlocks, newImg, removeBackground, renderFrame, type Img } from "../src/shared/imageprep";

const fill = (img: Img, x0: number, y0: number, w: number, h: number, c: [number, number, number]) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * img.w + x) * 4; img.d.set([...c, 255], o); }
};
const white = (w: number, h: number) => { const i = newImg(w, h); fill(i, 0, 0, w, h, [255, 255, 255]); return i; };
const alphaAt = (i: Img, x: number, y: number) => i.d[(y * i.w + x) * 4 + 3];

describe("removeBackground", () => {
  it("clears the border-connected background but keeps white inside the subject", () => {
    const img = white(40, 40);
    fill(img, 8, 8, 24, 24, [20, 120, 90]); // body
    fill(img, 16, 14, 6, 6, [255, 255, 255]); // enclosed white eye (upper part)
    expect(removeBackground(img)).toBe(true);
    expect(alphaAt(img, 1, 1)).toBe(0);
    expect(alphaAt(img, 10, 10)).toBe(255);
    expect(alphaAt(img, 18, 16)).toBe(255); // eye kept
  });

  it("removes background pockets trapped between the legs", () => {
    const img = white(80, 80);
    fill(img, 10, 10, 60, 40, [30, 100, 80]); // torso
    fill(img, 10, 50, 12, 28, [30, 100, 80]); // left leg
    fill(img, 58, 50, 12, 28, [30, 100, 80]); // right leg
    fill(img, 22, 50, 36, 10, [30, 100, 80]); // crotch bridge -> encloses a pocket below it? (open below, so reached)
    fill(img, 22, 66, 36, 4, [30, 100, 80]); // foot bar closes the pocket
    removeBackground(img);
    expect(alphaAt(img, 40, 63)).toBe(0); // pocket cleared
  });

  it("leaves images that already have transparency alone", () => {
    const img = newImg(20, 20);
    fill(img, 5, 5, 10, 10, [200, 0, 0]);
    img.d.forEach((_, i) => { if (i % 4 === 3 && img.d[i] === 0) img.d[i] = 0; });
    expect(removeBackground(img)).toBe(false);
  });

  it("does nothing without a clear background colour", () => {
    const img = newImg(20, 20);
    for (let i = 0; i < 400; i++) img.d.set([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255], i * 4);
    expect(removeBackground(img)).toBe(false);
  });
});

describe("pixel art restoration", () => {
  it("detects an integer upscale and restores the native pixels", () => {
    const n = 5, base = newImg(12, 12);
    const cols: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) base.d.set([...cols[(x * 3 + y * 5 + (x ^ y)) % 4], 255], (y * 12 + x) * 4);
    const big = newImg(12 * n, 12 * n);
    for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) big.d.set(base.d.subarray(((y / n | 0) * 12 + (x / n | 0)) * 4, ((y / n | 0) * 12 + (x / n | 0)) * 4 + 4), (y * big.w + x) * 4);
    const b = detectBlock(big)!;
    expect(b.n).toBe(n);
    const small = downsampleBlocks(big, b.n, b.ox, b.oy);
    expect([small.w, small.h]).toEqual([12, 12]);
    expect(Array.from(small.d)).toEqual(Array.from(base.d));
  });

  it("does not invent blocks for smooth gradients", () => {
    const img = newImg(80, 80);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) img.d.set([x * 3, y * 3, (x + y) * 2, 255], (y * 80 + x) * 4);
    expect(detectBlock(img)).toBeNull();
  });

  it("crops to content", () => {
    const img = newImg(30, 30);
    fill(img, 10, 12, 5, 7, [1, 2, 3]);
    const c = cropToContent(img);
    expect([c.w, c.h]).toEqual([5, 7]);
  });
});

describe("procedural animation", () => {
  const sprite = newImg(16, 24);
  fill(sprite, 0, 0, 16, 24, [10, 200, 120]);

  it("renders the identity frame exactly", () => {
    const f = renderFrame(sprite, 16, 24, {});
    expect(Array.from(f.d)).toEqual(Array.from(sprite.d));
  });
  it("lift moves the sprite up and squash makes it shorter", () => {
    const up = renderFrame(sprite, 16, 30, { lift: 4 });
    expect(alphaAt(up, 8, 29)).toBe(0);
    expect(alphaAt(up, 8, 29 - 4)).toBe(255);
    const sq = renderFrame(sprite, 16, 30, { sy: 0.5 });
    expect(alphaAt(sq, 8, 17)).toBe(0);
    expect(alphaAt(sq, 8, 18)).toBe(255);
    expect(alphaAt(sq, 8, 29)).toBe(255);
  });
  it("generates every required state", () => {
    const sheet = animateStill(sprite);
    for (const s of ["idle", "walk", "run", "sit", "sleep", "look", "typing", "jump", "happy", "thinking", "drag", "drop", "error"]) {
      expect(sheet.animations[s], s).toBeDefined();
      expect(sheet.states[s]).toBe(s);
    }
    expect(sheet.frames.every((f) => f.w === sheet.frameWidth && f.h === sheet.frameHeight)).toBe(true);
  });
});
