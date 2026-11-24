import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { petAction } from "../../shared/api";
import { fmtClock, type FocusSnap } from "../../pet/pomodoro";
import { Group, Page, Row, Slider, Toggle } from "../ui";
import type { TabProps } from "./types";

const LABEL = { idle: "No session", work: "Focus", break: "Short break", longBreak: "Long break" } as const;

export function FocusTab({ settings: s, update }: TabProps) {
  const f = s.focus;
  const set = (patch: Record<string, unknown>) => update({ focus: patch });
  const [snap, setSnap] = useState<FocusSnap | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const un = listen<FocusSnap>("focus-status", (e) => setSnap(e.payload));
    petAction("focus:status").catch(() => {});
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => { clearInterval(t); void un.then((u) => u()); };
  }, []);

  const phase = snap?.phase ?? "idle";
  const remaining = snap ? (snap.running ? Math.max(0, snap.endAt - Date.now()) : snap.remainingMs) : 0;
  const act = (a: string) => petAction(`focus:${a}`).catch(() => {});

  return (
    <Page title="Focus">
      <Group>
        <div className="p-5 text-center">
          <div className="text-[34px] font-bold tabular-nums">{phase === "idle" ? fmtClock(f.workMin * 60_000) : fmtClock(remaining)}</div>
          <div className="desc mb-3" style={{ color: "var(--sub)" }}>
            {LABEL[phase]}{phase !== "idle" && snap ? ` · session ${snap.cycle}/${snap.cycles}` : ""}{snap && !snap.running && phase !== "idle" ? " · paused" : ""}
          </div>
          <div className="flex gap-2 justify-center">
            {phase === "idle" ? (
              <button className="btn primary" onClick={() => act("start")}>Start focus</button>
            ) : (
              <>
                <button className="btn" onClick={() => act(snap?.running ? "pause" : "resume")}>{snap?.running ? "Pause" : "Resume"}</button>
                <button className="btn" onClick={() => act("skip")}>Skip</button>
                <button className="btn danger" onClick={() => act("stop")}>Stop</button>
              </>
            )}
          </div>
        </div>
      </Group>
      <Group title="Durations">
        <Row label="Focus"><Slider value={f.workMin} min={5} max={90} step={5} format={(v) => `${v} min`} onChange={(v) => set({ workMin: v })} /></Row>
        <Row label="Short break"><Slider value={f.breakMin} min={1} max={30} format={(v) => `${v} min`} onChange={(v) => set({ breakMin: v })} /></Row>
        <Row label="Long break" desc="After the last session of a round."><Slider value={f.longBreakMin} min={5} max={60} step={5} format={(v) => `${v} min`} onChange={(v) => set({ longBreakMin: v })} /></Row>
        <Row label="Sessions per round"><Slider value={f.cycles} min={2} max={8} format={(v) => `${v}`} onChange={(v) => set({ cycles: v })} /></Row>
        <Row label="Countdown under the character" desc="A small timer badge below the character."><Toggle value={f.badge} onChange={(v) => set({ badge: v })} /></Row>
      </Group>
      <div className="desc mt-3" style={{ color: "var(--sub)" }}>The character works at its laptop while you focus, then cheers and tells you to rest. Also in the menu bar: “Start / Stop Focus”.</div>
    </Page>
  );
}
