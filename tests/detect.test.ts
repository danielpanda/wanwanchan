import { describe, expect, it } from "vitest";
import { animationsFromGuess, guessGrid, suggestRender } from "../src/shared/detect";

/** Build an alpha map with filled boxes. */
function sheet(w: number, h: number, boxes: [number, number, number, number][]) {
  const a = new Uint8Array(w * h);
  for (const [x0, y0, bw, bh] of boxes) for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) a[y * w + x] = 255;
  return a;
}

describe("guessGrid", () => {
  it("single image is one frame (the import bug: whole image used as frame is only right here)", () => {
    const g = guessGrid(100, 80, sheet(100, 80, [[10, 10, 80, 60]]));
    expect([g.frameWidth, g.frameHeight, g.cols, g.rows]).toEqual([100, 80, 1, 1]);
  });

  it("splits a strip whose frames are separated by transparent gutters", () => {
    const boxes: [number, number, number, number][] = [0, 1, 2, 3].map((i) => [i * 32 + 6, 6, 20, 20]);
    const g = guessGrid(128, 32, sheet(128, 32, boxes));
    expect([g.frameWidth, g.frameHeight, g.cols, g.rows]).toEqual([32, 32, 4, 1]);
    expect(g.counts).toEqual([4]);
  });

  it("splits touching square frames in a strip", () => {
    const g = guessGrid(96, 32, sheet(96, 32, [[0, 0, 96, 32]]));
    expect([g.frameWidth, g.frameHeight, g.cols]).toEqual([32, 32, 3]);
  });

  it("handles a multi-row sheet and ignores trailing empty cells", () => {
    const boxes: [number, number, number, number][] = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) if (!(r === 1 && c > 1)) boxes.push([c * 24 + 4, r * 24 + 4, 16, 16]);
    const g = guessGrid(96, 48, sheet(96, 48, boxes));
    expect([g.frameWidth, g.frameHeight, g.cols, g.rows]).toEqual([24, 24, 4, 2]);
    expect(g.counts).toEqual([4, 2]);
    const { animations, states } = animationsFromGuess(g);
    expect(animations.row1).toMatchObject({ start: 0, count: 4 });
    expect(animations.row2).toMatchObject({ start: 4, count: 2 });
    expect(states.idle).toBe("row1");
  });

  it("a single frame becomes an idle animation", () => {
    const g = guessGrid(64, 64, sheet(64, 64, [[8, 8, 48, 48]]));
    expect(animationsFromGuess(g).animations.idle).toBeDefined();
  });
});

describe("suggestRender", () => {
  it("keeps pixel art native and shrinks big images", () => {
    expect(suggestRender(32)).toEqual({ renderScale: 1, smooth: false });
    const r = suggestRender(512);
    expect(r.smooth).toBe(true);
    expect(r.renderScale * 512).toBeCloseTo(48, 0);
  });
});
