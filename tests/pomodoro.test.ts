import { describe, expect, it } from "vitest";
import { fmtClock, Pomodoro } from "../src/pet/pomodoro";
import { DEFAULT_FOCUS } from "../src/shared/types";

const cfg = { ...DEFAULT_FOCUS, workMin: 25, breakMin: 5, longBreakMin: 15, cycles: 3 };
const MIN = 60_000;

describe("Pomodoro", () => {
  it("runs work -> break -> work ... -> long break", () => {
    const p = new Pomodoro(() => cfg);
    p.start(0);
    expect(p.snapshot(0)).toMatchObject({ phase: "work", cycle: 1, running: true });
    expect(p.poll(24 * MIN)).toBeNull();
    expect(p.poll(25 * MIN)).toEqual({ ended: "work", next: "break" });
    expect(p.poll(30 * MIN)).toEqual({ ended: "break", next: "work" });
    expect(p.snapshot(30 * MIN).cycle).toBe(2);
    p.poll(55 * MIN); p.poll(60 * MIN);
    expect(p.snapshot(60 * MIN)).toMatchObject({ phase: "work", cycle: 3 });
    expect(p.poll(85 * MIN)).toEqual({ ended: "work", next: "longBreak" });
    expect(p.poll(100 * MIN)).toEqual({ ended: "longBreak", next: "work" });
    expect(p.snapshot(100 * MIN).cycle).toBe(1);
  });

  it("pause freezes the clock and resume continues from it", () => {
    const p = new Pomodoro(() => cfg);
    p.start(0);
    p.pause(10 * MIN);
    expect(p.snapshot(500 * MIN).remainingMs).toBe(15 * MIN);
    expect(p.poll(500 * MIN)).toBeNull();
    p.resume(500 * MIN);
    expect(p.nextEventIn(500 * MIN)).toBe(15 * MIN);
  });

  it("skip advances immediately; stop resets", () => {
    const p = new Pomodoro(() => cfg);
    expect(p.skip(0)).toBeNull();
    p.start(0);
    expect(p.skip(MIN)).toEqual({ ended: "work", next: "break" });
    p.stop();
    expect(p.snapshot(0)).toMatchObject({ phase: "idle", running: false });
    expect(p.nextEventIn(0)).toBeNull();
  });

  it("picks up changed durations on the next phase", () => {
    let c = { ...cfg };
    const p = new Pomodoro(() => c);
    p.start(0);
    c = { ...c, breakMin: 10 };
    p.poll(25 * MIN);
    expect(p.nextEventIn(25 * MIN)).toBe(10 * MIN);
  });

  it("formats the clock", () => {
    expect(fmtClock(25 * MIN)).toBe("25:00");
    expect(fmtClock(61_000)).toBe("01:01");
    expect(fmtClock(-5)).toBe("00:00");
  });
});
