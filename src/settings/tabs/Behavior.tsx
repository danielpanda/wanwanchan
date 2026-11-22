import { useEffect, useState } from "react";
import { keyboardPermission, openPrivacySettings, petAction, requestKeyboardPermission } from "../../shared/api";
import { Group, Page, Row, Slider, Toggle } from "../ui";
import type { TabProps } from "./types";

const fmtSecs = (v: number) => (v >= 60 ? `${Math.round(v / 6) / 10} min` : `${v} s`);

export function Behavior({ settings: s, update }: TabProps) {
  const [perm, setPerm] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => keyboardPermission().then(setPerm).catch(() => setPerm(null));
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  return (
    <Page title="Behavior">
      <Group title="Mouse">
        <Row label="Mouse interaction" desc="Look toward the cursor and jump when clicked."><Toggle value={s.mouseInteraction} onChange={(v) => update({ mouseInteraction: v })} /></Row>
        <Row label="Follow cursor" desc="The character chases your pointer."><Toggle value={s.followCursor} disabled={!s.mouseInteraction} onChange={(v) => update({ followCursor: v })} /></Row>
        <Row label="Scroll reaction" desc="Plays the Scroll animation while you scroll a page (uses Typing if the character has none). Part of mouse interaction." />
      </Group>
      <Group title="Peek mode">
        <Row label="Peek from the edge" desc="For videos and focus: hides at the right screen edge, stays quiet, and only comes out for reminders. Also in the menu bar.">
          <Toggle value={s.peekMode} onChange={(v) => update({ peekMode: v })} />
        </Row>
      </Group>
      <Group title="Pomodoro">
        <Row label="Timer" desc="A small clock floats above the character; it tells you when to focus and when to rest. Also in the menu bar.">
          <button className="btn primary" onClick={() => petAction("pomodoro:start")}>Start</button>
          <button className="btn" onClick={() => petAction("pomodoro:skip")}>Skip phase</button>
          <button className="btn" onClick={() => petAction("pomodoro:stop")}>Stop</button>
        </Row>
        <Row label="Focus"><Slider value={s.pomodoro.focus} min={5} max={90} step={5} format={(v) => `${v} min`} onChange={(v) => update({ pomodoro: { focus: v } })} /></Row>
        <Row label="Short break"><Slider value={s.pomodoro.shortBreak} min={1} max={30} format={(v) => `${v} min`} onChange={(v) => update({ pomodoro: { shortBreak: v } })} /></Row>
        <Row label="Long break"><Slider value={s.pomodoro.longBreak} min={5} max={60} step={5} format={(v) => `${v} min`} onChange={(v) => update({ pomodoro: { longBreak: v } })} /></Row>
        <Row label="Long break every"><Slider value={s.pomodoro.longEvery} min={2} max={8} format={(v) => `${v} sessions`} onChange={(v) => update({ pomodoro: { longEvery: v } })} /></Row>
      </Group>
      <Group title="Keyboard">
        <Row label="Keyboard interaction" desc="Type-along animation, excited when typing fast. Only the fact that a key was pressed is detected, never which key.">
          <Toggle value={s.keyboardInteraction} onChange={(v) => update({ keyboardInteraction: v })} />
        </Row>
        {s.keyboardInteraction && (
          <Row label="Input Monitoring permission" desc={perm ? "Granted." : "macOS requires this to notice typing in other apps. After granting, switch the toggle off and on (or relaunch)."}>
            {perm ? <span style={{ color: "var(--sub)" }}>✓ Allowed</span> : (
              <>
                <button className="btn primary" onClick={() => requestKeyboardPermission().then(setPerm)}>Request</button>
                <button className="btn" onClick={() => openPrivacySettings()}>Open Settings</button>
              </>
            )}
          </Row>
        )}
      </Group>
      <Group title="Idle">
        <Row label="Random motion" desc="Occasional walks and runs."><Toggle value={s.randomMotion} onChange={(v) => update({ randomMotion: v })} /></Row>
        <Row label="Wander every" desc="Average time between walks.">
          <Slider value={s.wanderEvery} min={5} max={90} step={5} format={(v) => `${v} s`} disabled={!s.randomMotion} onChange={(v) => update({ wanderEvery: v })} />
        </Row>
        <Row label="Sleep mode" desc="Sit, yawn, then fall asleep when you are away; stretches when you come back."><Toggle value={s.sleepMode} onChange={(v) => update({ sleepMode: v })} /></Row>
        <Row label="Sit after"><Slider value={s.sitAfter} min={10} max={600} step={5} format={fmtSecs} disabled={!s.sleepMode} onChange={(v) => update({ sitAfter: v, sleepAfter: Math.max(s.sleepAfter, v + 10) })} /></Row>
        <Row label="Sleep after"><Slider value={s.sleepAfter} min={30} max={1800} step={10} format={fmtSecs} disabled={!s.sleepMode} onChange={(v) => update({ sleepAfter: v, sitAfter: Math.min(s.sitAfter, v - 10) })} /></Row>
      </Group>
    </Page>
  );
}
