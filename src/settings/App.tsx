import { useState } from "react";
import { useSettings } from "./useSettings";
import { General } from "./tabs/General";
import { CharacterTab } from "./tabs/Character";
import { Behavior } from "./tabs/Behavior";
import { AiTab } from "./tabs/Ai";
import { Notifications } from "./tabs/Notifications";

const TABS = [
  { id: "general", label: "General", icon: "⚙️" },
  { id: "character", label: "Character", icon: "🐱" },
  { id: "behavior", label: "Behavior", icon: "✨" },
  { id: "notify", label: "Notifications", icon: "💬" },
  { id: "ai", label: "AI Integration", icon: "🤖" },
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
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div className="mt-6 px-2 text-[11px]" style={{ color: "var(--sub)" }}>WanWan-chan 0.2.0</div>
      </nav>
      <main className="content">
        {tab === "general" && <General {...p} />}
        {tab === "character" && <CharacterTab {...p} />}
        {tab === "behavior" && <Behavior {...p} />}
        {tab === "notify" && <Notifications {...p} />}
        {tab === "ai" && <AiTab {...p} />}
      </main>
    </div>
  );
}
