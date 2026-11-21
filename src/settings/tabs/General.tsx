import { useEffect, useState } from "react";
import { listMonitors, petAction } from "../../shared/api";
import { Group, Page, Row, Select, Toggle } from "../ui";
import type { TabProps } from "./types";

export function General({ settings: s, update }: TabProps) {
  const [monitors, setMonitors] = useState<{ name: string; width: number; height: number }[]>([]);
  useEffect(() => { listMonitors().then(setMonitors).catch(() => {}); }, []);
  return (
    <Page title="General">
      <Group>
        <Row label="Show character" desc="Also available from the menu bar icon."><Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} /></Row>
        <Row label="Launch at login"><Toggle value={s.launchAtLogin} onChange={(v) => update({ launchAtLogin: v })} /></Row>
        <Row label="Always on top" desc="Keep the character above other windows."><Toggle value={s.alwaysOnTop} onChange={(v) => update({ alwaysOnTop: v })} /></Row>
        <Row label="Display" desc="The monitor your character lives on.">
          <Select
            value={s.monitor}
            onChange={(v) => update({ monitor: v })}
            options={[{ value: "", label: "Main display" }, ...monitors.map((m, i) => ({ value: m.name, label: `${m.name || `Display ${i + 1}`} (${m.width}×${m.height})` }))]}
          />
        </Row>
      </Group>
      <Group title="Quick actions">
        <Row label="Say hi" desc="Make the character jump."><button className="btn" onClick={() => petAction("jump")}>Jump</button></Row>
        <Row label="Sit & stay" desc="Make the character sit still until you press it again."><button className="btn" onClick={() => petAction("toggle-sit")}>Sit / Stand</button></Row>
        <Row label="Reset position" desc="Bring the character back if it got lost.">
          <button className="btn" onClick={() => { update({ position: { x: 0.5, y: 0.92 }, enabled: true }); petAction("reset-position"); }}>Reset</button>
        </Row>
      </Group>
    </Page>
  );
}
