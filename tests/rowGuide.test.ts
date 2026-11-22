import { describe, expect, it } from "vitest";
import { ROW_POSES, rowPrompt } from "../src/shared/rowGuide";
import { STATES } from "../src/shared/types";

describe("row prompt", () => {
  it("spells out layout, size, background and character", () => {
    const p = rowPrompt({ character: "a blue fox", state: "walk", frames: 4, cell: 256, bg: "magenta", pixel: true });
    expect(p).toContain("exactly 4 animation frames");
    expect(p).toContain("1024×256 px (aspect ratio 4:1)");
    expect(p).toContain("#FF00FF");
    expect(p).toContain("a blue fox");
    expect(p).toContain("64×64 px sprite");
    expect(p).toContain("reference image"); // non-idle rows reuse the idle design
  });
  it("idle needs no reference; one-shot states say so", () => {
    expect(rowPrompt({ character: "x", state: "idle", frames: 4, cell: 256, bg: "green", pixel: false })).not.toContain("reference image");
    expect(rowPrompt({ character: "x", state: "jump", frames: 4, cell: 256, bg: "green", pixel: false })).toContain("play once");
  });
  it("has a pose for every state", () => {
    expect(STATES.every((s) => ROW_POSES[s].length > 10)).toBe(true);
  });
});
