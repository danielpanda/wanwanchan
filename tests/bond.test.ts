import { describe, expect, it } from "vitest";
import { ACCESSORIES, award, dayKey, levelOf, unlocked, XP } from "../src/shared/bond";
import { DEFAULT_BOND, withDefaults } from "../src/shared/types";

const d = (day: number, h = 12) => new Date(2026, 10, day, h);

describe("bond levels", () => {
  it("maps xp to level and progress", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 40 });
    expect(levelOf(40)).toEqual({ level: 2, into: 0, need: 80 });
    expect(levelOf(119)).toMatchObject({ level: 2, into: 79 });
    expect(levelOf(99999)).toMatchObject({ level: 7, need: null });
  });
  it("unlocks accessories by level", () => {
    expect(unlocked(0)).toEqual([]);
    expect(unlocked(40).map((a) => a.id)).toEqual(["bow"]);
    expect(unlocked(1300).length).toBe(ACCESSORIES.length);
  });
});

describe("award", () => {
  it("grants xp and reports level ups", () => {
    const a = award({ ...DEFAULT_BOND, xp: 38 }, "reminder", d(20));
    expect(a.gained).toBe(XP.reminder.amount);
    expect(a.levelUp).toBe(2);
    expect(award(a.state, "reminder", d(20)).levelUp).toBeNull();
  });
  it("caps each kind per day and resets next day", () => {
    let s = DEFAULT_BOND;
    let total = 0;
    for (let i = 0; i < 100; i++) { const r = award(s, "click", d(20)); s = r.state; total += r.gained; }
    expect(total).toBe(XP.click.cap);
    expect(award(s, "click", d(21)).gained).toBe(XP.click.amount);
  });
  it("daily bonus: once a day, streak grows on consecutive days and resets after a gap", () => {
    let r = award(DEFAULT_BOND, "daily", d(20));
    expect(r.state.streak).toBe(1);
    expect(award(r.state, "daily", d(20)).gained).toBe(0);
    r = award(r.state, "daily", d(21));
    expect(r.state.streak).toBe(2);
    expect(r.gained).toBe(XP.daily.amount + 1);
    r = award(r.state, "daily", d(25));
    expect(r.state.streak).toBe(1);
  });
  it("formats day keys and merges defaults", () => {
    expect(dayKey(d(3))).toBe("2026-11-03");
    const s = withDefaults({ bond: { xp: 5 } } as never);
    expect(s.bond).toMatchObject({ xp: 5, streak: 0 });
    expect(s.accessories).toEqual([]);
  });
});
