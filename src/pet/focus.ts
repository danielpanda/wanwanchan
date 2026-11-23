import { emit } from "@tauri-apps/api/event";
import type { Settings } from "../shared/types";
import { fmtClock, Pomodoro, type FocusSnap, type PhaseChange } from "./pomodoro";

export type FocusAction = "start" | "pause" | "resume" | "skip" | "stop" | "toggle" | "status";
export type FocusChange = PhaseChange | "start" | "stop" | "pause" | "resume" | null;

const LABEL = { work: "Focus", break: "Break", longBreak: "Long", idle: "" } as const;

/** Runs the pomodoro, shows a small countdown badge under the character, and reports changes. */
export class FocusController {
  private p: Pomodoro;
  private badge: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;

  constructor(private d: { settings(): Settings; onChange(snap: FocusSnap, change: FocusChange): void }) {
    this.p = new Pomodoro(() => d.settings().focus);
    this.badge = document.createElement("div");
    Object.assign(this.badge.style, {
      position: "fixed", left: "0", top: "0", display: "none", padding: "1px 8px", borderRadius: "9px",
      background: "rgba(40,28,34,.78)", color: "#fff", font: "700 11px ui-rounded,-apple-system,sans-serif",
      pointerEvents: "none", whiteSpace: "nowrap", willChange: "transform", fontVariantNumeric: "tabular-nums",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.badge);
  }

  get active() { return this.p.phase !== "idle"; }

  dispatch(a: FocusAction): void {
    const now = Date.now();
    switch (a) {
      case "toggle": return this.dispatch(this.active ? "stop" : "start");
      case "start": this.p.start(now); return this.after("start");
      case "stop": { const was = this.active; this.p.stop(); return this.after(was ? "stop" : null); }
      case "pause": this.p.pause(now); return this.after("pause");
      case "resume": this.p.resume(now); return this.after("resume");
      case "skip": return this.after(this.p.skip(now));
      case "status": return this.after(null);
    }
  }

  private after(change: FocusChange) {
    this.schedule();
    this.render();
    const snap = this.p.snapshot(Date.now());
    emit("focus-status", snap).catch(() => {});
    if (change !== null) this.d.onChange(snap, change);
  }

  private schedule() {
    clearTimeout(this.timer);
    clearInterval(this.tick);
    this.timer = this.tick = undefined;
    const wait = this.p.nextEventIn(Date.now());
    if (wait === null) return;
    this.timer = setTimeout(() => {
      const c = this.p.poll(Date.now());
      if (c) this.after(c); else this.schedule();
    }, wait + 25);
    this.tick = setInterval(() => this.render(), 1000);
  }

  render() {
    const s = this.p.snapshot(Date.now());
    const show = s.phase !== "idle" && this.d.settings().focus.badge;
    this.badge.style.display = show ? "block" : "none";
    if (show) this.badge.textContent = `${LABEL[s.phase]} ${fmtClock(s.remainingMs)}${s.running ? "" : " (paused)"}`;
  }

  /** Keep the badge just below the character's feet. */
  position(x: number, y: number, W: number) {
    if (this.badge.style.display === "none") return;
    const w = this.badge.offsetWidth;
    this.badge.style.transform = `translate3d(${Math.round(Math.min(Math.max(4, x - w / 2), W - w - 4))}px,${Math.round(y + 3)}px,0)`;
  }
}
