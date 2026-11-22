import { describe, expect, it } from "vitest";
import { newImg, type Img } from "../src/shared/imageprep";
import { chromaKey, composeSheet, detectFrameCount, splitStrip } from "../src/shared/strip";

const px = (img: Img, x: number, y: number) => Array.from(img.d.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));
const fill = (img: Img, x0: number, y0: number, w: number, h: number, c: number[]) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.d.set(c, (y * img.w + x) * 4);
};

/** 4 frames of 10×10 on a green strip, each with a 4×6 brown body that bobs by one pixel. */
function greenStrip(bg = [0, 255, 0, 255]) {
  const img = newImg(40, 10);
  fill(img, 0, 0, 40, 10, bg);
  for (let i = 0; i < 4; i++) fill(img, i * 10 + 3, 3 + (i % 2), 4, 6, [120, 70, 40, 255]);
  return img;
}

describe("strip import", () => {
  it("keys out green everywhere, including between frames", () => {
    const img = greenStrip([10, 240, 20, 255]); // slightly off-key, like AI output
    expect(chromaKey(img, "auto")).toBe("keyed");
    expect(px(img, 0, 0)[3]).toBe(0);
    expect(px(img, 10, 5)[3]).toBe(0); // gap between frame 0 and 1
    expect(px(img, 4, 5)).toEqual([120, 70, 40, 255]);
  });
  it("handles JPEG-style noise and a green halo around the sprite", () => {
    const img = greenStrip();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 50; // ±25 noise
    for (let p = 0; p < img.w * img.h; p++) {
      const i = p * 4;
      if (img.d[i + 1] > 200) { img.d[i] += rnd(); img.d[i + 1] += rnd(); img.d[i + 2] += rnd(); }
    }
    fill(img, 2, 3, 1, 6, [70, 160, 30, 255]); // halo column left of frame 0's body (mix of brown and green)
    expect(chromaKey(img, "auto")).toBe("keyed");
    let leftover = 0;
    for (let p = 0; p < img.w * img.h; p++) if (img.d[p * 4 + 3] && img.d[p * 4 + 1] > 200) leftover++;
    expect(leftover).toBe(0);
    expect(px(img, 2, 5)[3]).toBe(0); // halo removed
    expect(px(img, 4, 5)).toEqual([120, 70, 40, 255]);
    expect(detectFrameCount(img)).toBe(4);
  });
  it("keys out an explicit magenta background", () => {
    const img = greenStrip([255, 0, 255, 255]);
    expect(chromaKey(img, "magenta")).toBe("keyed");
    expect(px(img, 39, 9)[3]).toBe(0);
    expect(px(img, 13, 5)[3]).toBe(255);
  });
  it("keeps green characters green away from the edge", () => {
    const img = newImg(10, 10);
    fill(img, 0, 0, 10, 10, [255, 0, 255, 255]);
    fill(img, 2, 2, 6, 6, [40, 160, 60, 255]);
    chromaKey(img, "auto");
    expect(px(img, 4, 4)).toEqual([40, 160, 60, 255]);
  });
  it("'none' leaves the image alone", () => {
    const img = greenStrip();
    expect(chromaKey(img, "none")).toBe("none");
    expect(px(img, 0, 0)[3]).toBe(255);
  });
  it("detects the frame count from gaps, else assumes square frames", () => {
    const img = greenStrip();
    chromaKey(img, "auto");
    expect(detectFrameCount(img)).toBe(4);
    const touching = newImg(64, 16);
    fill(touching, 0, 0, 64, 16, [0, 0, 0, 255]);
    expect(detectFrameCount(touching)).toBe(4);
  });
  it("splits into equally sized, aligned frames", () => {
    const img = greenStrip();
    chromaKey(img, "auto");
    const frames = splitStrip(img, 4);
    expect(frames).toHaveLength(4);
    expect(frames.every((f) => f.w === 4 && f.h === 7)).toBe(true); // shared box covers the bob
    expect(px(frames[0], 0, 0)[3]).toBe(255);
    expect(px(frames[1], 0, 0)[3]).toBe(0); // frame 1 is one pixel lower
  });
  it("composes one row per animation, bottom-centred", () => {
    const a = [newImg(4, 4), newImg(4, 4)];
    const b = [newImg(6, 8)];
    a.forEach((f) => fill(f, 0, 0, 4, 4, [1, 2, 3, 255]));
    const out = composeSheet([{ name: "idle", frames: a, fps: 4, loop: true }, { name: "jump", frames: b, fps: 10, loop: false }]);
    expect([out.frameWidth, out.frameHeight, out.sheet.w, out.sheet.h]).toEqual([6, 8, 12, 16]);
    expect(out.animations.jump).toEqual({ start: 2, count: 1, fps: 10, loop: false });
    expect(px(out.sheet, 1, 7)[3]).toBe(255); // idle frame 0 sits on the floor, centred
    expect(px(out.sheet, 1, 3)[3]).toBe(0);
  });
});
