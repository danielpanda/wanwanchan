import type { PomodoroSettings } from "../shared/types";

export type PomoPhase = "focus" | "short" | "long";
export type PomoEvent = { type: "phase"; phase: PomoPhase; minutes: number } | { type: "stop"; done: number };

/** Focus / break loop. Time is passed in so it stays testable; the pet arms one timer for `endsAt`. */
export class Pomodoro {
  phase: PomoPhase | null = null;
  endsAt = 0;
  done = 0;

  constructor(private cfg: () => PomodoroSettings, private on: (e: PomoEvent) => void) {}

  get running() { return this.phase !== null; }

  start(now: number) { this.done = 0; this.begin("focus", now); }

  stop() {
    if (!this.phase) return;
    this.phase = null;
    this.on({ type: "stop", done: this.done });
  }

  toggle(now: number) { if (this.running) this.stop(); else this.start(now); }

  /** Jump to the next phase now. */
  skip(now: number) { if (this.phase) this.advance(now); }

  /** Advance if the current phase is over. Returns true when the phase changed. */
  tick(now: number): boolean {
    if (!this.phase || now < this.endsAt) return false;
    this.advance(now);
    return true;
  }

  remaining(now: number) { return this.phase ? Math.max(0, this.endsAt - now) : 0; }

  private advance(now: number) {
    if (this.phase === "focus") {
      this.done++;
      this.begin(this.done % Math.max(1, this.cfg().longEvery) === 0 ? "long" : "short", now);
    } else this.begin("focus", now);
  }

  private begin(phase: PomoPhase, now: number) {
    const c = this.cfg();
    const minutes = Math.max(1, phase === "focus" ? c.focus : phase === "short" ? c.shortBreak : c.longBreak);
    this.phase = phase;
    this.endsAt = now + minutes * 60_000;
    this.on({ type: "phase", phase, minutes });
  }
}

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
