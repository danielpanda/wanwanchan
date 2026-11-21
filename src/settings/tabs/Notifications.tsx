import { petAction } from "../../shared/api";
import { pick, reminderText, REMINDER_NAMES } from "../../shared/messages";
import type { Reminder } from "../../shared/types";
import { Group, Page, Row, Select, Slider, Toggle } from "../ui";
import type { TabProps } from "./types";

const fmtMin = (v: number) => (v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ""}` : `${v} min`);

export function Notifications({ settings: s, update }: TabProps) {
  const n = s.notify;
  const set = (patch: Record<string, unknown>) => update({ notify: patch });
  const setReminders = (list: Reminder[]) => set({ reminders: list });
  const edit = (id: string, patch: Partial<Reminder>) => setReminders(n.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const preview = (r: Reminder) => petAction(`say:${reminderText(r, n.language)}`).catch(() => {});

  return (
    <Page title="Notifications">
      <Group>
        <Row label="Speech bubbles" desc="Your character talks: reminders, greetings and little comments.">
          <Toggle value={n.enabled} onChange={(v) => set({ enabled: v })} />
        </Row>
        <Row label="Language">
          <Select value={n.language} onChange={(v) => set({ language: v })} options={[{ value: "id", label: "Bahasa Indonesia" }, { value: "en", label: "English" }]} />
        </Row>
        <Row label="Bubble duration" desc="Reminders stay about 2.5× longer and have Snooze / OK buttons.">
          <Slider value={n.bubbleSeconds} min={3} max={20} format={(v) => `${v} s`} disabled={!n.enabled} onChange={(v) => set({ bubbleSeconds: v })} />
        </Row>
        <Row label="Sound" desc="A tiny 8-bit blip with reminders.">
          <Toggle value={n.sound} disabled={!n.enabled} onChange={(v) => set({ sound: v })} />
          <button className="btn" onClick={() => petAction(`say:${pick(n.language, "chatter")}`)}>Test bubble</button>
        </Row>
        <Row label="Quiet hours" desc="No bubbles during this time (reminders wait until it ends).">
          <Toggle value={n.quiet.enabled} disabled={!n.enabled} onChange={(v) => set({ quiet: { enabled: v } })} />
          <input className="field" type="time" value={n.quiet.from} disabled={!n.quiet.enabled} onChange={(e) => set({ quiet: { from: e.target.value } })} />
          <span>→</span>
          <input className="field" type="time" value={n.quiet.to} disabled={!n.quiet.enabled} onChange={(e) => set({ quiet: { to: e.target.value } })} />
        </Row>
      </Group>

      <Group title="Reminders">
        {n.reminders.map((r) => (
          <div key={r.id}>
            <Row
              label={`${r.emoji} ${r.builtin ? REMINDER_NAMES[n.language][r.id] ?? r.id : r.text || "Custom reminder"}`}
              desc={r.kind === "interval" ? `Every ${fmtMin(r.every)}` : `Daily at ${r.time || "--:--"}`}
            >
              {r.kind === "interval" ? (
                <Slider value={r.every} min={5} max={180} step={5} format={fmtMin} disabled={!n.enabled || !r.enabled} onChange={(v) => edit(r.id, { every: v })} />
              ) : (
                <input className="field" type="time" value={r.time} disabled={!n.enabled || !r.enabled} onChange={(e) => edit(r.id, { time: e.target.value })} />
              )}
              <button className="btn" title="Preview" onClick={() => preview(r)}>▶</button>
              <Toggle value={r.enabled} disabled={!n.enabled} onChange={(v) => edit(r.id, { enabled: v })} />
            </Row>
            {!r.builtin && (
              <div className="row" style={{ borderTop: "none", paddingTop: 0 }}>
                <div className="flex items-center gap-2 w-full">
                  <input className="field" style={{ width: 44, textAlign: "center" }} value={r.emoji} maxLength={4} onChange={(e) => edit(r.id, { emoji: e.target.value })} />
                  <input className="field flex-1" placeholder="What should I say?" value={r.text} maxLength={120} onChange={(e) => edit(r.id, { text: e.target.value })} />
                  <Select value={r.kind} onChange={(v) => edit(r.id, { kind: v, time: v === "daily" && !r.time ? "09:00" : r.time })} options={[{ value: "interval", label: "Repeat" }, { value: "daily", label: "Daily" }]} />
                  <button className="btn danger" onClick={() => setReminders(n.reminders.filter((x) => x.id !== r.id))}>✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="row">
          <span className="desc">Add your own: stand-up, medicine, stretch, anything.</span>
          <button className="btn primary" onClick={() => setReminders([...n.reminders, { id: `c${Date.now()}`, emoji: "⏰", kind: "interval", every: 30, time: "09:00", text: "", enabled: true }])}>Add reminder</button>
        </div>
      </Group>

      <Group title="Little extras">
        <Row label="Greetings" desc="Says hi by time of day, and welcomes you back after a long break."><Toggle value={n.greetings} disabled={!n.enabled} onChange={(v) => set({ greetings: v })} /></Row>
        <Row label="Random chatter" desc="Cute comments now and then.">
          <Toggle value={n.chatter} disabled={!n.enabled} onChange={(v) => set({ chatter: v })} />
          <Slider value={n.chatterEvery} min={5} max={90} step={5} format={(v) => `~${v} min`} disabled={!n.enabled || !n.chatter} onChange={(v) => set({ chatterEvery: v })} />
        </Row>
        <Row label="Reacts to clicks & pets" desc="“Geli ih!” when you poke it, “purr~” when you hover."><Toggle value={n.reactions} disabled={!n.enabled} onChange={(v) => set({ reactions: v })} /></Row>
        <Row label="AI agent updates" desc="Tells you when an agent finishes, fails or needs you."><Toggle value={n.agentReactions} disabled={!n.enabled} onChange={(v) => set({ agentReactions: v })} /></Row>
        <Row label="Typing marathon" desc="After ~45 minutes of non-stop typing it suggests a break (it only counts key presses)."><Toggle value={n.praise} disabled={!n.enabled} onChange={(v) => set({ praise: v })} /></Row>
      </Group>
    </Page>
  );
}
