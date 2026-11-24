import { afterEach, describe, expect, it, vi } from "vitest";
import { inQuiet, nextDue, parseHM, quietEnd, sig } from "../src/pet/reminders";
import { pick, reminderText, timeGreeting, withName } from "../src/shared/messages";
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
  const disabled: string[] = [];
  let typing = false, peeking = false;
  const settings: Settings = withDefaults({ ...DEFAULT_SETTINGS, notify: { ...DEFAULT_SETTINGS.notify, chatter: false, ...patch } });
  const host: Host = {
    settings: () => settings, typing: () => typing,
    present: (text, o) => shown.push({ text, o }),
    close: () => { shown[shown.length - 1]?.o.onClose(); },
    peeking: () => peeking,
    disableReminder: (id) => disabled.push(id),
  };
  return { n: new Notifier(host), shown, disabled, setTyping: (v: boolean) => (typing = v), setPeeking: (v: boolean) => (peeking = v) };
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

describe("calmer bubbles", () => {
  it("addresses the user by name", () => {
    expect(withName("💧 Minum dulu yuk", "Dani")).toBe("💧 Dani, minum dulu yuk");
    expect(withName("Selamat pagi!", "Dani")).toBe("Dani, selamat pagi!");
    expect(withName("I'll keep you company", "Dani")).toBe("Dani, I'll keep you company");
    expect(withName("Hi", "  ")).toBe("Hi");
  });
  it("peek mode mutes chatter but not agent news or notices", () => {
    const h = harness();
    h.setPeeking(true);
    h.n.welcomeBack(); h.n.purr();
    expect(h.shown).toHaveLength(0);
    h.n.agent("completed", "claude");
    expect(h.shown).toHaveLength(1);
    h.shown[0].o.onClose();
    h.n.notice("🍅 break");
    expect(h.shown[1].o.buttons).toHaveLength(1);
  });
  it("chatter has a long cooldown", () => {
    const h = harness();
    h.n.chat("a"); h.shown[0].o.onClose();
    h.n.chat("b");
    expect(h.shown).toHaveLength(1);
  });
  it("a one-shot message reminder fires once and switches itself off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(10));
    const h = harness({ reminders: [rem({ id: "m1", kind: "once", time: "10:30", text: "Call mom", emoji: "📞" })] });
    h.n.sync();
    vi.advanceTimersByTime(31 * 60_000);
    expect(h.shown[0].text).toBe("📞 Call mom");
    expect(h.disabled).toEqual(["m1"]);
    vi.useRealTimers();
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
  it("is never dropped: waits behind a reminder, pushes chatter aside", () => {
    const h = harness();
    h.n.say("busy");
    h.n.agent("waiting", "claude");
    expect(h.shown).toHaveLength(1);
    h.shown[0].o.onClose();
    expect(h.shown[1].text).toMatch(/Claude Code/);
    const c = harness();
    c.n.welcomeBack();
    c.n.agent("completed", "claude");
    expect(c.shown.map((s) => s.text)[1]).toMatch(/Claude Code/);
  });
  it("ignores quiet hours, has an OK button, and shows the detail", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(23));
    const h = harness({ quiet: { enabled: true, from: "22:00", to: "07:00" }, sound: true });
    h.n.agent("waiting", "claude", undefined, "🔐 Bash: npm publish");
    expect(h.shown[0].text).toMatch(/\n🔐 Bash: npm publish$/);
    expect(h.shown[0].o.buttons).toHaveLength(1);
    expect(h.shown[0].o.sound).toBe(true);
    vi.useRealTimers();
  });
  it("a waiting bubble sticks until the agent moves on", () => {
    const h = harness();
    h.n.agent("waiting", "claude");
    expect(h.shown[0].o.seconds).toBeGreaterThan(600);
    let closed = false;
    const onClose = h.shown[0].o.onClose;
    h.shown[0].o.onClose = () => { closed = true; onClose(); };
    h.n.agentResumed("cursor");
    expect(closed).toBe(false);
    h.n.agentResumed("claude");
    expect(closed).toBe(true);
  });
  it("newer news from the same agent replaces the old bubble", () => {
    const h = harness();
    h.n.agent("waiting", "claude");
    h.n.agent("completed", "claude", 120);
    expect(h.shown).toHaveLength(2);
    expect(h.shown[1].text).toMatch(/\(2m 0s\)/);
    expect(h.shown[1].o.seconds).toBeLessThan(600);
  });
  it("respects the agent reactions toggle", () => {
    const h = harness({ agentReactions: false });
    h.n.agent("waiting", "claude");
    expect(h.shown).toHaveLength(0);
  });
  it("omits the duration for quick tasks and for waiting", () => {
    const a = harness(); a.n.agent("completed", "cursor", 5);
    expect(a.shown[0].text).not.toMatch(/\(/);
    const b = harness(); b.n.agent("waiting", "claude", 300);
    expect(b.shown[0].text).not.toMatch(/\(\d/);
  });
});

describe("calendar alerts", () => {
  afterEach(() => vi.useRealTimers());
  it("alerts shortly before a meeting with a Join button, and never repeats it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
    const { n, shown } = harness();
    const start = Date.now() + 30 * 60_000;
    const ev = { uid: "a", title: "Standup", start, end: start + 30 * 60_000, link: "https://teams.microsoft.com/l/x" };
    n.setCalendar([ev], 5);
    vi.advanceTimersByTime(24 * 60_000);
    expect(shown).toHaveLength(0);
    vi.advanceTimersByTime(2 * 60_000);
    expect(shown).toHaveLength(1);
    expect(shown[0].text).toMatch(/Standup/);
    expect(shown[0].text).toMatch(/\(5 menit lagi\)/);
    expect(shown[0].o.buttons?.map((b) => b.label)).toEqual(["Gabung", "OK"]);
    shown[0].o.onClose();
    n.setCalendar([ev], 5); // a refresh brings the same event back
    vi.advanceTimersByTime(60 * 60_000);
    expect(shown).toHaveLength(1);
  });
  it("skips events that already started and drops removed ones", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
    const { n, shown } = harness();
    const now = Date.now();
    n.setCalendar([{ uid: "old", title: "Old", start: now - 10 * 60_000, end: now }], 5);
    n.setCalendar([{ uid: "b", title: "B", start: now + 20 * 60_000, end: now + 50 * 60_000 }], 5);
    n.setCalendar([], 5); // cancelled / removed from the feed
    vi.advanceTimersByTime(3 * 3600_000);
    expect(shown).toHaveLength(0);
  });
});
