import type { FocusSettings } from "../shared/types";

export type Phase = "idle" | "work" | "break" | "longBreak";

export interface FocusSnap {
  phase: Phase;
  running: boolean;
  /** Epoch ms when the current phase ends (only meaningful while running). */
  endAt: number;
  /** ms left; frozen while paused. */
  remainingMs: number;
  cycle: number;
  cycles: number;
}

export interface PhaseChange { ended: Phase; next: Phase }

/** Pomodoro state machine. Pure and time-injected so it is trivial to test. */
export class Pomodoro {
  phase: Phase = "idle";
  running = false;
  private endAt = 0;
  private remaining = 0;
  cycle = 1;

  constructor(private cfg: () => FocusSettings) {}

  private mins(p: Phase): number {
    const c = this.cfg();
    return (p === "work" ? c.workMin : p === "break" ? c.breakMin : c.longBreakMin) * 60_000;
  }

  private begin(p: Phase, now: number) {
    this.phase = p;
    this.running = true;
    this.remaining = this.mins(p);
    this.endAt = now + this.remaining;
  }

  start(now: number) { this.cycle = 1; this.begin("work", now); }

  stop() { this.phase = "idle"; this.running = false; this.remaining = 0; this.endAt = 0; this.cycle = 1; }

  pause(now: number) {
    if (!this.running) return;
    this.remaining = Math.max(0, this.endAt - now);
    this.running = false;
  }

  resume(now: number) {
    if (this.running || this.phase === "idle") return;
    this.endAt = now + this.remaining;
    this.running = true;
  }

  /** Jump to the next phase immediately. */
  skip(now: number): PhaseChange | null {
    return this.phase === "idle" ? null : this.advance(now);
  }

  /** Move on if the current phase has run out. */
  poll(now: number): PhaseChange | null {
    return this.running && now >= this.endAt ? this.advance(now) : null;
  }

  private advance(now: number): PhaseChange {
    const ended = this.phase;
    let next: Phase;
    if (ended === "work") {
      next = this.cycle >= Math.max(1, this.cfg().cycles) ? "longBreak" : "break";
    } else {
      next = "work";
      this.cycle = ended === "longBreak" ? 1 : this.cycle + 1;
    }
    this.begin(next, now);
    return { ended, next };
  }

  /** ms until the running phase ends, or null when nothing is scheduled. */
  nextEventIn(now: number): number | null {
    return this.running ? Math.max(0, this.endAt - now) : null;
  }

  snapshot(now: number): FocusSnap {
    return {
      phase: this.phase, running: this.running, endAt: this.running ? this.endAt : 0,
      remainingMs: this.running ? Math.max(0, this.endAt - now) : this.remaining,
      cycle: this.cycle, cycles: this.cfg().cycles,
    };
  }
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
