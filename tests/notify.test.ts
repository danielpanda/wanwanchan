import { describe, expect, it } from "vitest";
import { inQuiet, nextDue, parseHM, quietEnd, sig } from "../src/pet/reminders";
import { pick, reminderText, timeGreeting } from "../src/shared/messages";
import { fmtDuration, Notifier, type Host, type PresentOpts } from "../src/pet/notify";
import { DEFAULT_SETTINGS, withDefaults, type Reminder, type Settings } from "../src/shared/types";

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m, 0, 0);
const rem = (o: Partial<Reminder>): Reminder => ({ id: "x", emoji: "💧", kind: "interval", every: 30, time: "", text: "", enabled: true, ...o });

describe("reminders", () => {
  it("parses HH:MM", () => {
    expect(parseHM("07:05")).toBe(425);
    expect(parseHM("24:00")).toBeNull();
    expect(parseHM("nope")).toBeNull();
  });
  it("quiet hours wrap past midnight", () => {
    const q = { enabled: true, from: "22:00", to: "07:00" };
    expect(inQuiet(at(23), q)).toBe(true);
    expect(inQuiet(at(3), q)).toBe(true);
    expect(inQuiet(at(12), q)).toBe(false);
    expect(inQuiet(at(23), { ...q, enabled: false })).toBe(false);
    expect(inQuiet(at(10), { enabled: true, from: "09:00", to: "11:00" })).toBe(true);
  });
  it("quiet end is the next occurrence", () => {
    const t = quietEnd(at(23), { to: "07:00" });
    expect(new Date(t).getDate()).toBe(21);
    expect(new Date(t).getHours()).toBe(7);
    expect(new Date(quietEnd(at(3), { to: "07:00" })).getDate()).toBe(20);
  });
  it("interval and daily scheduling", () => {
    const now = at(10).getTime();
    expect(nextDue(rem({ every: 45 }), now)).toBe(now + 45 * 60_000);
    expect(new Date(nextDue(rem({ kind: "daily", time: "12:00" }), now)!).getHours()).toBe(12);
    expect(new Date(nextDue(rem({ kind: "daily", time: "09:00" }), now)!).getDate()).toBe(21); // already passed today
    expect(nextDue(rem({ enabled: false }), now)).toBeNull();
    expect(nextDue(rem({ kind: "daily", time: "bad" }), now)).toBeNull();
    expect(sig(rem({ every: 30 }))).not.toBe(sig(rem({ every: 31 })));
  });
});

describe("messages", () => {
  it("localizes built-ins and uses custom text", () => {
    expect(reminderText(rem({ id: "water", builtin: true }), "en", () => 0)).toMatch(/water/i);
    expect(reminderText(rem({ id: "water", builtin: true }), "id", () => 0)).toMatch(/minum/i);
    expect(reminderText(rem({ text: "Standup!", emoji: "🧍" }), "id")).toBe("🧍 Standup!");
  });
  it("greets by time of day", () => {
    expect(timeGreeting(at(8), "id", () => 0)).toMatch(/pagi/i);
    expect(timeGreeting(at(13), "en", () => 0)).toMatch(/afternoon/i);
    expect(timeGreeting(at(21), "en", () => 0)).toMatch(/night/i);
    expect(pick("id", "chatter", () => 0.999)).toBeTruthy();
  });
  it("settings defaults merge the notify block", () => {
    const s = withDefaults({ notify: { quiet: { enabled: true } } } as unknown as Partial<Settings>);
    expect(s.notify.quiet).toEqual({ enabled: true, from: "22:00", to: "07:00" });
    expect(s.notify.reminders.length).toBeGreaterThan(3);
  });
});

function harness(patch: Partial<Settings["notify"]> = {}) {
  const shown: { text: string; o: PresentOpts }[] = [];
  let typing = false;
  const settings: Settings = withDefaults({ ...DEFAULT_SETTINGS, notify: { ...DEFAULT_SETTINGS.notify, chatter: false, ...patch } });
  const host: Host = {
    settings: () => settings, typing: () => typing,
    present: (text, o) => shown.push({ text, o }),
    close: () => { shown[shown.length - 1]?.o.onClose(); },
  };
  return { n: new Notifier(host), shown, setTyping: (v: boolean) => (typing = v) };
}

describe("Notifier", () => {
  it("shows say() immediately and one bubble at a time", () => {
    const { n, shown } = harness();
    n.say("hi"); n.say("again");
    expect(shown.map((s) => s.text)).toEqual(["hi"]);
    shown[0].o.onClose();
    expect(shown.map((s) => s.text)).toEqual(["hi", "again"]);
  });
  it("chat respects its toggle and doesn't interrupt a bubble", () => {
    const { n, shown } = harness({ greetings: false });
    n.greet();
    expect(shown).toHaveLength(0);
    const h = harness();
    h.n.say("busy");
    h.n.chat("nope");
    expect(h.shown).toHaveLength(1);
  });
  it("reminder bubbles carry snooze/ok buttons; chat bubbles do not", () => {
    const { n, shown } = harness();
    n.welcomeBack();
    expect(shown[0].o.buttons).toBeUndefined();
  });
  it("disabled notifications stay silent", () => {
    const { n, shown } = harness({ enabled: false });
    n.say("x"); n.agent("completed", "claude");
    expect(shown).toHaveLength(0);
  });
});

describe("agent bubbles", () => {
  it("formats durations", () => {
    expect(fmtDuration(42)).toBe("42s");
    expect(fmtDuration(134)).toBe("2m 14s");
    expect(fmtDuration(3900)).toBe("1h 5m");
  });
  it("mentions the agent and how long it took", () => {
    const { n, shown } = harness();
    n.agent("completed", "claude", 134);
    expect(shown[0].text).toMatch(/Claude Code \(2m 14s\)/);
  });
  it("omits the duration for quick tasks and for waiting", () => {
    const a = harness(); a.n.agent("completed", "cursor", 5);
    expect(a.shown[0].text).not.toMatch(/\(/);
    const b = harness(); b.n.agent("waiting", "claude", 300);
    expect(b.shown[0].text).not.toMatch(/\(\d/);
  });
});
