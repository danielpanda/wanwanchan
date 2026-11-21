import { describe, expect, it } from "vitest";
import { aggregateAgents, PRIORITY, StateMachine, TypingMeter } from "../src/pet/fsm";

describe("StateMachine", () => {
  it("defaults to idle", () => {
    expect(new StateMachine().current(0).state).toBe("idle");
  });

  it("higher priority wins and lower resumes after release", () => {
    const sm = new StateMachine();
    sm.hold("rest", "sleep", PRIORITY.rest);
    expect(sm.current(0).state).toBe("sleep");
    sm.pulse("typing", "typing", PRIORITY.typing, 0, 1000);
    expect(sm.current(10).state).toBe("typing");
    expect(sm.current(1500).state).toBe("sleep");
  });

  it("drag beats everything, drop beats jump", () => {
    const sm = new StateMachine();
    sm.pulse("jump", "jump", PRIORITY.jump, 0, 500);
    sm.pulse("drop", "drop", PRIORITY.drop, 0, 500);
    expect(sm.current(1).state).toBe("drop");
    sm.hold("drag", "drag", PRIORITY.drag);
    expect(sm.current(1).state).toBe("drag");
    sm.release("drag");
    expect(sm.current(1).state).toBe("drop");
  });

  it("respects cooldowns", () => {
    const sm = new StateMachine();
    expect(sm.pulse("look", "look", PRIORITY.look, 0, 1000, 3000)).toBe(true);
    expect(sm.pulse("look", "look", PRIORITY.look, 1500, 1000, 3000)).toBe(false);
    expect(sm.pulse("look", "look", PRIORITY.look, 4100, 1000, 3000)).toBe(true);
  });

  it("extending the same pulse does not steal from newer equal-priority requests", () => {
    const sm = new StateMachine();
    sm.pulse("a", "typing", 60, 0, 1000);
    sm.pulse("b", "happy", 60, 10, 1000);
    sm.pulse("a", "typing", 60, 20, 1000); // key repeat
    expect(sm.current(30).state).toBe("happy");
  });

  it("reports the next expiry", () => {
    const sm = new StateMachine();
    sm.hold("rest", "sit", PRIORITY.rest);
    expect(sm.nextExpiry(0)).toBeNull();
    sm.pulse("jump", "jump", PRIORITY.jump, 100, 400);
    expect(sm.nextExpiry(200)).toBe(300);
  });
});

describe("TypingMeter", () => {
  it("detects fast typing and decays", () => {
    const m = new TypingMeter(2000, 9);
    for (let i = 0; i < 9; i++) m.hit(i * 100);
    expect(m.isFast(900)).toBe(true);
    expect(m.isFast(5000)).toBe(false);
  });
  it("slow typing is not fast", () => {
    const m = new TypingMeter(2000, 9);
    for (let i = 0; i < 6; i++) m.hit(i * 400);
    expect(m.isFast(2400)).toBe(false);
  });
});

describe("aggregateAgents", () => {
  it("ranks error > waiting > working > thinking", () => {
    expect(aggregateAgents(["thinking", "working"])).toBe("working");
    expect(aggregateAgents(["working", "waiting"])).toBe("waiting");
    expect(aggregateAgents(["waiting", "error"])).toBe("error");
    expect(aggregateAgents([])).toBe("idle");
  });
});
