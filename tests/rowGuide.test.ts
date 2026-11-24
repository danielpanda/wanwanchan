import { describe, expect, it } from "vitest";
import { BIPED_POSES, ROW_POSES, rowPrompt } from "../src/shared/rowGuide";
import { STATES } from "../src/shared/types";

describe("row prompt", () => {
  it("spells out layout, size, background and character", () => {
    const p = rowPrompt({ character: "a blue fox", state: "walk", frames: 4, cell: 256, bg: "magenta", style: "pixel", body: "four", tail: true, ears: true, accessory: "" });
    expect(p).toContain("exactly 4 animation frames");
    expect(p).toContain("1024×256 px (aspect ratio 4:1)");
    expect(p).toContain("#FF00FF");
    expect(p).toContain("a blue fox");
    expect(p).toContain("64×64 px sprite");
    expect(p).toContain("reference image"); // non-idle rows reuse the idle design
  });
  it("idle needs no reference; one-shot states say so", () => {
    expect(rowPrompt({ character: "x", state: "idle", frames: 4, cell: 256, bg: "green", style: "cartoon", body: "four", tail: true, ears: true, accessory: "" })).not.toContain("reference image");
    expect(rowPrompt({ character: "x", state: "jump", frames: 4, cell: 256, bg: "green", style: "cartoon", body: "four", tail: true, ears: true, accessory: "" })).toContain("play once");
  });
  it("has a pose for every state", () => {
    expect(STATES.every((s) => ROW_POSES[s].motion.length > 10 && ROW_POSES[s].frames.length >= 4)).toBe(true);
  });
  it("two-legged characters get upright poses where they differ", () => {
    const p = rowPrompt({ character: "x", state: "walk", frames: 8, cell: 256, bg: "green", style: "cartoon", body: "two", tail: true, ears: true, accessory: "" });
    expect(p).toContain("upright walk cycle");
    expect(p).not.toContain("front paw");
    expect(rowPrompt({ character: "x", state: "idle", frames: 4, cell: 256, bg: "green", style: "cartoon", body: "two", tail: true, ears: true, accessory: "" })).toContain(ROW_POSES.idle.motion);
    expect(Object.values(BIPED_POSES).every((v) => v!.frames.length >= 4)).toBe(true);
  });
  it("no tail / no ears drops those clauses without emptying a pose; accessory and style are locked in", () => {
    const base = { character: "x", frames: 4, cell: 256, bg: "green" as const, body: "two" as const, tail: false, ears: false, accessory: "a red scarf" };
    for (const state of STATES) {
      const p = rowPrompt({ ...base, state, style: "chibi" });
      expect(p).not.toMatch(/\b(tail wag|tail curls|ears down|ears perked)/);
      expect(p).not.toMatch(/Frame \d: \./);
    }
    const p = rowPrompt({ ...base, state: "error", style: "chibi" });
    expect(p).toContain("No tail. No animal ears. Wears a red scarf in every frame");
    expect(p).toContain("chibi anime");
  });
  it("lists every frame at the recommended count, key poses otherwise", () => {
    const p = rowPrompt({ character: "x", state: "run", frames: 8, cell: 256, bg: "green", style: "cartoon", body: "four", tail: true, ears: true, accessory: "" });
    expect(p).toContain("2048×256 px (aspect ratio 8:1)");
    expect(p).toContain("Frame 8: ");
    const q = rowPrompt({ character: "x", state: "run", frames: 4, cell: 256, bg: "green", style: "cartoon", body: "four", tail: true, ears: true, accessory: "" });
    expect(q).not.toContain("Frame 1:");
    expect(q).toContain("spread across the 4 frames");
  });
});
