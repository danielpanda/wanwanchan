import { AGENT_LABEL, buttonLabels, pick, reminderText, timeGreeting, type LineKey } from "../shared/messages";
import type { Settings } from "../shared/types";
import { inQuiet, nextDue, quietEnd, sig } from "./reminders";

export interface PresentOpts {
  buttons?: { label: string; primary?: boolean; onClick: () => void }[];
  seconds: number;
  sound: boolean;
  onClose: () => void;
}
export interface Host {
  settings(): Settings;
  present(text: string, o: PresentOpts): void;
  close(): void;
  /** True while the user is typing right now (reminders wait for a pause). */
  typing(): boolean;
}

interface Say { text: string; kind: "reminder" | "chat" | "test" }

export function fmtDuration(secs: number): string {
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SNOOZE_MS = 10 * 60_000;
const MIN_CHAT_GAP = 20_000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Schedules reminders / chatter and shows them one at a time. Event-driven: a single timer is armed
 * for the earliest due item, so nothing runs in between.
 */
export class Notifier {
  private due = new Map<string, number>();
  private sigs = new Map<string, string>();
  private snoozed = new Map<string, string>();
  private queue: Say[] = [];
  private showing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pumpTimer: ReturnType<typeof setTimeout> | undefined;
  private deferred = 0;
  private lastChat = 0;
  private typingRun = { start: 0, last: 0, praised: 0 };

  constructor(private host: Host) {}

  private get n() { return this.host.settings().notify; }

  /** (Re)arm everything from the current settings. Safe to call on every settings change. */
  sync(now = Date.now()) {
    const n = this.n;
    if (!n.enabled) { this.stop(); return; }
    const live = new Set<string>();
    for (const r of n.reminders) {
      const key = `r:${r.id}`;
      if (!r.enabled) continue;
      live.add(key);
      if (this.sigs.get(key) !== sig(r) || !this.due.has(key)) {
        this.sigs.set(key, sig(r));
        const t = nextDue(r, now);
        if (t === null) this.due.delete(key); else this.due.set(key, t);
      }
    }
    for (const k of [...this.due.keys()]) if (k.startsWith("r:") && !live.has(k)) { this.due.delete(k); this.sigs.delete(k); }
    if (n.chatter) { if (!this.due.has("chat")) this.due.set("chat", now + rand(0.5, 1.2) * n.chatterEvery * 60_000); }
    else this.due.delete("chat");
    this.arm();
  }

  stop() {
    clearTimeout(this.timer); clearTimeout(this.pumpTimer);
    this.timer = this.pumpTimer = undefined;
    this.due.clear(); this.sigs.clear(); this.snoozed.clear(); this.queue = [];
    if (this.showing) this.host.close();
    this.showing = false;
  }

  private arm() {
    clearTimeout(this.timer);
    this.timer = undefined;
    let min = Infinity;
    for (const t of this.due.values()) min = Math.min(min, t);
    if (min === Infinity) return;
    this.timer = setTimeout(() => this.tick(), Math.min(2_000_000_000, Math.max(500, min - Date.now())));
  }

  private tick() {
    const now = Date.now(), n = this.n;
    for (const [k, t] of [...this.due]) {
      if (t > now) continue;
      if (k === "chat") {
        this.due.set(k, now + rand(0.7, 1.3) * n.chatterEvery * 60_000);
        this.chat(pick(n.language, "chatter"), n.chatter);
      } else if (k.startsWith("snooze:")) {
        this.due.delete(k);
        this.enqueue({ text: this.snoozed.get(k) ?? "", kind: "reminder" });
        this.snoozed.delete(k);
      } else if (k.startsWith("r:")) {
        const r = n.reminders.find((x) => `r:${x.id}` === k);
        const next = r ? nextDue(r, now) : null;
        if (next === null) this.due.delete(k); else this.due.set(k, next);
        if (r) this.enqueue({ text: reminderText(r, n.language), kind: "reminder" });
      }
    }
    this.arm();
  }

  // ------------------------------------------------------------ showing
  private enqueue(s: Say) {
    if (!this.n.enabled) return;
    this.queue.push(s);
    while (this.queue.length > 4) {
      const i = this.queue.findIndex((q) => q.kind === "chat");
      this.queue.splice(i >= 0 ? i : 0, 1);
    }
    this.pump();
  }

  private pump() {
    clearTimeout(this.pumpTimer);
    if (this.showing) return;
    const n = this.n;
    while (this.queue.length) {
      const s = this.queue[0];
      const now = new Date();
      if (s.kind !== "test" && inQuiet(now, n.quiet)) {
        this.queue.shift();
        if (s.kind === "reminder") this.snooze(s.text, quietEnd(now, n.quiet) - Date.now());
        continue;
      }
      if (s.kind === "reminder" && this.host.typing() && this.deferred < 8) {
        this.deferred++;
        this.pumpTimer = setTimeout(() => this.pump(), 8000);
        return;
      }
      this.deferred = 0;
      this.queue.shift();
      this.show(s);
      return;
    }
  }

  private snooze(text: string, ms: number) {
    const key = `snooze:${Date.now()}:${this.snoozed.size}`;
    this.snoozed.set(key, text);
    this.due.set(key, Date.now() + Math.max(1000, ms));
    this.arm();
  }

  private show(s: Say) {
    const n = this.n, lang = n.language, L = buttonLabels(lang);
    this.showing = true;
    const isReminder = s.kind === "reminder";
    this.host.present(s.text, {
      seconds: isReminder ? Math.max(12, n.bubbleSeconds * 2.5) : n.bubbleSeconds,
      sound: n.sound && s.kind !== "chat",
      buttons: isReminder ? [
        { label: L.later, onClick: () => { this.snooze(s.text, SNOOZE_MS); this.host.close(); this.say(pick(lang, "snooze")); } },
        { label: L.ok, primary: true, onClick: () => this.host.close() },
      ] : undefined,
      onClose: () => { this.showing = false; this.pump(); },
    });
    if (s.kind === "chat") this.lastChat = Date.now();
  }

  // ------------------------------------------------------------ public triggers
  /** Always shown (even in quiet hours): previews and snooze confirmations. */
  say(text: string) { this.enqueue({ text, kind: "test" }); }

  /** Optional chatter: respects its toggle, quiet hours, and doesn't pile up. */
  chat(text: string, enabled = true, force = false) {
    const n = this.n;
    if (!n.enabled || !enabled || this.showing) return;
    if (inQuiet(new Date(), n.quiet)) return;
    if (!force && Date.now() - this.lastChat < MIN_CHAT_GAP) return;
    this.enqueue({ text, kind: "chat" });
  }

  greet() { this.chat(timeGreeting(new Date(), this.n.language), this.n.greetings, true); }
  welcomeBack() { this.chat(pick(this.n.language, "welcome"), this.n.greetings, true); }
  ouch() { this.chat(pick(this.n.language, "ouch"), this.n.reactions, true); }
  /** Short status remark (sit / stand) that bypasses the chatter cooldown. */
  remark(key: "sit" | "stand") { this.chat(pick(this.n.language, key), this.n.reactions, true); }
  purr() { this.chat(pick(this.n.language, "purr"), this.n.reactions); }

  agent(kind: "completed" | "error" | "waiting", agent: string, secs?: number) {
    const key: LineKey = kind === "completed" ? "agentDone" : kind === "error" ? "agentError" : "agentWait";
    const label = AGENT_LABEL[agent] ?? agent;
    const took = secs !== undefined && secs >= 15 && kind !== "waiting" ? ` (${fmtDuration(secs)})` : "";
    this.chat(`${pick(this.n.language, key)}  · ${label}${took}`, this.n.agentReactions, kind !== "waiting");
  }

  /** Called on every key press: after ~45 min of continuous typing, suggest a break. */
  onKey(now: number) {
    const r = this.typingRun;
    if (now - r.last > 120_000) r.start = now;
    r.last = now;
    if (now - r.start >= 45 * 60_000 && now - r.praised >= 45 * 60_000) {
      r.praised = now;
      this.chat(pick(this.n.language, "praise"), this.n.praise, true);
    }
  }
}
