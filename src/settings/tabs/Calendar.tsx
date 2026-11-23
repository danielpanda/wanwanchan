import { useState } from "react";
import { fetchUrlText } from "../../shared/api";
import { upcoming, type CalEvent } from "../../pet/ics";
import { Group, Page, Row, Slider, Toggle } from "../ui";
import type { TabProps } from "./types";

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export function CalendarTab({ settings: s, update }: TabProps) {
  const c = s.calendar;
  const set = (patch: Record<string, unknown>) => update({ calendar: patch });
  const [test, setTest] = useState<{ events?: CalEvent[]; error?: string; busy?: boolean }>({});
  const [help, setHelp] = useState(false);

  async function run() {
    setTest({ busy: true });
    const events: CalEvent[] = [];
    try {
      const now = Date.now();
      for (const u of c.urls.filter(Boolean)) events.push(...upcoming(await fetchUrlText(u), now, now + 7 * 86_400_000));
      setTest({ events: events.sort((a, b) => a.start - b.start).slice(0, 8) });
    } catch (e) { setTest({ error: String(e) }); }
  }

  return (
    <Page title="Calendar">
      <Group>
        <Row label="Calendar alerts" desc="The character tells you before meetings, with a Join button for Teams / Zoom / Meet links.">
          <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
        </Row>
        <Row label="Alert" desc="How long before a meeting starts."><Slider value={c.leadMin} min={0} max={30} format={(v) => (v === 0 ? "at start" : `${v} min`)} disabled={!c.enabled} onChange={(v) => set({ leadMin: v })} /></Row>
        <Row label="Show event titles" desc="Off shows just “Meeting” (handy when screen sharing)."><Toggle value={c.titles} disabled={!c.enabled} onChange={(v) => set({ titles: v })} /></Row>
      </Group>

      <Group title="Calendar links (.ics)">
        {c.urls.map((u, i) => (
          <div className="row" key={i}>
            <input className="field flex-1" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" value={u} spellCheck={false}
              onChange={(e) => set({ urls: c.urls.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button className="btn danger" onClick={() => set({ urls: c.urls.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="row">
          <span className="desc">{c.urls.length ? "Up to 3 links." : "Paste a published calendar link."}</span>
          <div className="flex gap-2">
            {c.urls.length < 3 && <button className="btn" onClick={() => set({ urls: [...c.urls, ""] })}>Add link</button>}
            <button className="btn primary" disabled={!c.urls.some(Boolean) || test.busy} onClick={run}>{test.busy ? "Checking…" : "Test"}</button>
          </div>
        </div>
        {test.error && <div className="px-3.5 py-2.5 desc" style={{ color: "#e5484d", borderTop: "1px solid var(--line)" }}>{test.error}</div>}
        {test.events && (
          <div className="px-3.5 py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="desc mb-1" style={{ color: "var(--sub)" }}>{test.events.length ? "Next events found:" : "Connected, but no events in the next 7 days."}</div>
            {test.events.map((e, i) => <div key={i} className="text-[12.5px]">{fmt(e.start)} · {e.title}{e.link ? " (link)" : ""}</div>)}
          </div>
        )}
      </Group>

      <button className="btn mt-3" onClick={() => setHelp(!help)}>{help ? "Hide" : "How do I get the link?"}</button>
      {help && (
        <div className="desc mt-2" style={{ color: "var(--sub)", lineHeight: 1.6 }}>
          <b>Outlook (web):</b> Settings → Calendar → Shared calendars → <i>Publish a calendar</i> → choose the calendar and “Can view all details” → Publish → copy the <b>ICS</b> link.<br />
          <b>Google Calendar:</b> Settings → your calendar → Integrate calendar → <i>Secret address in iCal format</i>.<br />
          <b>iCloud:</b> Calendar → share → Public Calendar → copy link.<br /><br />
          Work or school Outlook accounts often have publishing turned off by an admin. If so, this option isn’t available for that account.
          <br /><br />The link is fetched only by this app, refreshed every 15 minutes, and event details are never sent anywhere else. Treat the link like a password: anyone with it can read that calendar.
        </div>
      )}
    </Page>
  );
}
