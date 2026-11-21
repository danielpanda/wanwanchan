import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gridAnimations, hasAnim, normalizeConfig, resolveAnim } from "../src/pet/sprite";

describe("sprite config", () => {
  it("repairs garbage input", () => {
    const c = normalizeConfig({ frameWidth: -5, frameHeight: "x", animations: { a: { fps: 9999, count: 3 }, b: null }, states: { walk: "nope", idle: "a" } });
    expect(c.frameWidth).toBe(1);
    expect(c.frameHeight).toBe(32);
    expect(c.animations.a.fps).toBe(60);
    expect(c.animations.b).toBeUndefined();
    expect(c.states.walk).toBeUndefined();
    expect(c.states.idle).toBe("a");
  });

  it("always has at least one animation", () => {
    expect(Object.keys(normalizeConfig(null).animations)).toEqual(["idle"]);
  });

  it("resolves explicit mapping, then same-name, then idle fallback", () => {
    const c = normalizeConfig({
      frameWidth: 16, frameHeight: 16,
      animations: { idle: { start: 0, count: 2, fps: 4 }, go: { start: 2, count: 4, fps: 8 } },
      states: { walk: "go" },
    });
    expect(resolveAnim(c, "walk", null)!.frames).toEqual([2, 3, 4, 5]);
    expect(resolveAnim(c, "idle", null)!.name).toBe("idle");
    expect(resolveAnim(c, "sleep", null)!.name).toBe("idle");
    expect(resolveAnim(c, "blink", null)).toBeNull();
    expect(hasAnim(c, "blink")).toBe(false);
    expect(resolveAnim(c, "walk", 12)!.fps).toBe(12);
  });

  it("supports explicit frame lists", () => {
    const c = normalizeConfig({ animations: { look: { frames: [4, 3, 4, 5], fps: 3 } }, states: { look: "look" } });
    expect(resolveAnim(c, "look", null)!.frames).toEqual([4, 3, 4, 5]);
  });

  it("defaults display size and supports custom quirk animations", () => {
    const c = normalizeConfig({ frameWidth: 512, animations: { idle: { start: 0, count: 1, fps: 4 }, dance: { start: 1, count: 4, fps: 8 } }, quirks: ["dance", "nope"], renderScale: 0.1 });
    expect(c.renderScale).toBe(0.1);
    expect(c.smooth).toBe(true);
    expect(c.quirks).toEqual(["dance"]);
    expect(hasAnim(c, "custom:dance")).toBe(true);
    expect(resolveAnim(c, "custom:dance", null)!.frames).toEqual([1, 2, 3, 4]);
    expect(normalizeConfig({}).smooth).toBe(false);
  });

  it("grid helper splits rows", () => {
    const g = gridAnimations(128, 64, 32, 32);
    expect(g.row1).toMatchObject({ start: 0, count: 4 });
    expect(g.row2).toMatchObject({ start: 4, count: 4 });
  });

  it("default cat config is valid and covers every state", () => {
    const raw = JSON.parse(readFileSync("public/characters/cat/sprite.json", "utf8"));
    const c = normalizeConfig(raw);
    for (const s of ["idle","blink","walk","run","sit","sleep","look","typing","jump","happy","thinking","drag","drop","error","groom","stretch","yawn","wiggle"] as const) {
      expect(hasAnim(c, s), s).toBe(true);
    }
  });
});
