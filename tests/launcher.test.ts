import { describe, expect, it } from "vitest";
import { fuzzy, parseCommand, score } from "../src/pet/launcher";
import { ago, AgentHistory } from "../src/pet/history";

const APPS = ["Safari", "Google Chrome", "Cursor", "Visual Studio Code", "Terminal", "iTerm", "Slack", "Microsoft Teams", "Microsoft Word", "System Settings", "Notes", "Claude", "Spotify"];

describe("fuzzy app search", () => {
  it("ranks exact > prefix > word prefix > substring", () => {
    expect(score("cursor", "Cursor")).toBe(100);
    expect(score("chr", "Google Chrome")).toBe(60);
    expect(score("chrome", "Google Chrome")).toBe(60);
    expect(score("ode", "Visual Studio Code")).toBe(40);
    expect(score("xyz", "Visual Studio Code")).toBe(0);
    expect(fuzzy("term", APPS)).toEqual(["Terminal", "iTerm"]);
    expect(fuzzy("micro", APPS).sort()).toEqual(["Microsoft Teams", "Microsoft Word"]);
  });
  it("matches initials and ignores accents/case", () => {
    expect(fuzzy("vsc", APPS)[0]).toBe("Visual Studio Code");
    expect(fuzzy("GOOGLE", APPS)[0]).toBe("Google Chrome");
    expect(fuzzy("", APPS)).toEqual([]);
  });
});

describe("parseCommand", () => {
  it("opens apps from natural Indonesian / English", () => {
    expect(parseCommand("buka cursor", APPS)).toEqual({ type: "app", app: "Cursor" });
    expect(parseCommand("tolong buka chrome ya", APPS)).toEqual({ type: "app", app: "Google Chrome" });
    expect(parseCommand("Open Slack please", APPS)).toEqual({ type: "app", app: "Slack" });
    expect(parseCommand("terminal", APPS)).toEqual({ type: "app", app: "Terminal" });
    expect(parseCommand("vsc", APPS)).toEqual({ type: "app", app: "Visual Studio Code" });
  });
  it("asks instead of guessing when the match is ambiguous", () => {
    const r = parseCommand("buka microsoft", APPS);
    expect(r.type).toBe("none");
    expect((r as { suggestions: string[] }).suggestions.sort()).toEqual(["Microsoft Teams", "Microsoft Word"]);
    expect(parseCommand("buka zzzz", APPS)).toEqual({ type: "none", suggestions: [] });
  });
  it("understands built-in actions", () => {
    expect(parseCommand("fokus", APPS)).toEqual({ type: "action", name: "focus" });
    expect(parseCommand("start focus", APPS)).toEqual({ type: "action", name: "focus" });
    expect(parseCommand("duduk dong", APPS)).toEqual({ type: "action", name: "sit" });
    expect(parseCommand("lompat", APPS)).toEqual({ type: "action", name: "jump" });
    expect(parseCommand("buka pengaturan", APPS)).toEqual({ type: "action", name: "settings" });
  });
  it("an installed app name beats an action word", () => {
    expect(parseCommand("buka notes", APPS)).toEqual({ type: "app", app: "Notes" });
    expect(parseCommand("", APPS)).toEqual({ type: "none", suggestions: [] });
  });
});

describe("AgentHistory", () => {
  it("tracks a run from start to finish", () => {
    const h = new AgentHistory();
    h.record({ agent: "claude", state: "thinking", bid: "com.apple.Terminal" }, 1000);
    h.record({ agent: "claude", state: "working" }, 2000);
    expect(h.list(2500)).toMatchObject([{ agent: "claude", state: "working", start: 1000, bid: "com.apple.Terminal" }]);
    h.record({ agent: "claude", state: "completed" }, 9000);
    expect(h.list(9500)[0]).toMatchObject({ state: "completed", start: 1000, end: 9000 });
  });
  it("a completion with no start (Codex) still makes a row, and agents are separate", () => {
    const h = new AgentHistory();
    h.record({ agent: "codex", state: "completed" }, 1000);
    h.record({ agent: "claude", state: "working" }, 2000);
    expect(h.list(3000).map((r) => r.agent)).toEqual(["claude", "codex"]);
  });
  it("closes quiet runs after 30 min and keeps the list bounded", () => {
    const h = new AgentHistory();
    h.record({ agent: "cursor", state: "working" }, 0);
    expect(h.list(31 * 60_000)[0]).toMatchObject({ state: "idle", end: 0 });
    for (let i = 0; i < 40; i++) h.record({ agent: `a${i}`, state: "completed" }, i);
    expect(h.list(100).length).toBeLessThanOrEqual(14);
  });
  it("formats relative times", () => {
    expect(ago(10_000, "en")).toBe("just now");
    expect(ago(5 * 60_000, "id")).toBe("5 mnt lalu");
    expect(ago(3 * 3600_000, "en")).toBe("3 h ago");
  });
});
