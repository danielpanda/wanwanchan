import { describe, expect, it } from "vitest";
import { fmtClock, Pomodoro, type PomoEvent } from "../src/pet/pomodoro";

const MIN = 60_000;

describe("Pomodoro", () => {
  it("loops focus -> short break, and a long break every N sessions", () => {
    const ev: PomoEvent[] = [];
    const p = new Pomodoro(() => ({ focus: 25, shortBreak: 5, longBreak: 15, longEvery: 2 }), (e) => ev.push(e));
    p.start(0);
    expect(p.phase).toBe("focus");
    expect(p.tick(24 * MIN)).toBe(false);
    expect(p.tick(25 * MIN)).toBe(true);
    expect(p.phase).toBe("short");
    p.tick(30 * MIN); // -> focus
    p.tick(55 * MIN); // second focus done -> long
    expect(p.phase).toBe("long");
    expect(p.remaining(60 * MIN)).toBe(10 * MIN);
    p.stop();
    expect(ev.map((e) => (e.type === "phase" ? e.phase : `stop${e.done}`))).toEqual(["focus", "short", "focus", "long", "stop2"]);
  });
  it("skip and toggle", () => {
    const p = new Pomodoro(() => ({ focus: 25, shortBreak: 5, longBreak: 15, longEvery: 4 }), () => {});
    p.toggle(0);
    p.skip(1000);
    expect(p.phase).toBe("short");
    p.toggle(2000);
    expect(p.running).toBe(false);
  });
  it("formats the clock", () => {
    expect(fmtClock(25 * MIN)).toBe("25:00");
    expect(fmtClock(61_500)).toBe("1:02");
  });
});
