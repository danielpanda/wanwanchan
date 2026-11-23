import { useState } from "react";
import { useSettings } from "./useSettings";
import { General } from "./tabs/General";
import { CharacterTab } from "./tabs/Character";
import { Behavior } from "./tabs/Behavior";
import { AiTab } from "./tabs/Ai";
import { Notifications } from "./tabs/Notifications";
import { FocusTab } from "./tabs/Focus";
import { BondTab } from "./tabs/Bond";
import { CalendarTab } from "./tabs/Calendar";

const TABS = [
  { id: "general", label: "General" },
  { id: "character", label: "Character" },
  { id: "behavior", label: "Behavior" },
  { id: "focus", label: "Focus" },
  { id: "calendar", label: "Calendar" },
  { id: "bond", label: "Bond" },
  { id: "notify", label: "Notifications" },
  { id: "ai", label: "AI Integration" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function App() {
  const { settings, update, ready } = useSettings();
  const [tab, setTab] = useState<TabId>("general");
  if (!ready) return null;
  const p = { settings, update };
  return (
    <div className="settings-root">
      <div className="drag" data-tauri-drag-region />
      <nav className="sidebar" data-tauri-drag-region>
        {TABS.map((t) => (
          <button key={t.id} className="nav" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <div className="mt-6 px-2 text-[11px]" style={{ color: "var(--sub)" }}>WanWan-chan 0.2.2</div>
      </nav>
      <main className="content">
        {tab === "general" && <General {...p} />}
        {tab === "character" && <CharacterTab {...p} />}
        {tab === "behavior" && <Behavior {...p} />}
        {tab === "focus" && <FocusTab {...p} />}
        {tab === "calendar" && <CalendarTab {...p} />}
        {tab === "bond" && <BondTab {...p} />}
        {tab === "notify" && <Notifications {...p} />}
        {tab === "ai" && <AiTab {...p} />}
      </main>
    </div>
  );
}
