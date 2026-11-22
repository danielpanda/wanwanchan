import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { agentEvent, agentHelperPath, integrationSet, integrationStatus } from "../../shared/api";
import { AGENTS, type AgentId } from "../../shared/types";
import { Group, Page, Row, Select, Toggle } from "../ui";
import type { TabProps } from "./types";

const NAMES: Record<AgentId, string> = {
  claude: "Claude Code", codex: "OpenAI Codex CLI", cursor: "Cursor", antigravity: "Google Antigravity", opencode: "OpenCode", custom: "Custom / other",
};

const CONNECT = [
  { id: "claude", label: "Claude Code", desc: "Thinking, tools, permission prompts, done, API failures. Edits ~/.claude/settings.json (backup kept, your hooks untouched)." },
  { id: "cursor", label: "Cursor", desc: "Prompt sent, shell/file activity, stop (error if it fails). Edits ~/.cursor/hooks.json." },
  { id: "codex", label: "OpenAI Codex CLI", desc: "Reports when a turn completes (all Codex exposes). Adds a notify line to ~/.codex/config.toml." },
  { id: "opencode", label: "OpenCode", desc: "Session idle/error, permission asks, tool use via a small plugin." },
  { id: "shell", label: "Terminal (any command)", desc: "zsh: builds, tests and scripts over 5 s make the pet work, then cheer or sulk. Also covers Antigravity and agents without hooks. Wrap one command with wanwanchan-run." },
  { id: "antigravity", label: "Google Antigravity", desc: "No hook or event API I could verify, so it can't be connected directly. The Terminal option reacts to commands it runs in your shell." },
];

const SUPPORT: Record<AgentId, string> = {
  claude: "Full: prompt submit, tool use, permission prompts and questions (with the tool / question in the bubble), stop and API failures.",
  codex: "Partial: Codex CLI's `notify` setting reports turn completion only (no thinking/working events).",
  cursor: "Partial: Cursor hooks (hooks.json) report prompt submit, file edits and stop. Check Cursor's docs for your version.",
  antigravity: "None documented: no hook/event API we could rely on. Use the generic helper from your own scripts, or the simulator.",
  opencode: "Partial: an OpenCode plugin can forward session events (idle/error/permission) and tool use.",
  custom: "Any tool can call the helper or POST to the local endpoint.",
};

function snippet(agent: AgentId, helper: string, port: number): string {
  const h = `'${helper}'`;
  const url = `http://127.0.0.1:${port}/event`;
  switch (agent) {
    case "claude": {
      const hook = (ev: string) => [{ hooks: [{ type: "command", command: `${h} claude ${ev}` }] }];
      const m = (ev: string) => [{ matcher: "*", hooks: [{ type: "command", command: `${h} claude ${ev}` }] }];
      return `// merge into ~/.claude/settings.json\n` + JSON.stringify({
        hooks: {
          UserPromptSubmit: hook("UserPromptSubmit"), PreToolUse: m("PreToolUse"), PostToolUse: m("PostToolUse"), Notification: hook("Notification"),
          PermissionRequest: hook("PermissionRequest"), Stop: hook("Stop"), StopFailure: hook("StopFailure"), SessionEnd: hook("SessionEnd"),
        },
      }, null, 2);
    }
    case "codex":
      return `# add to ~/.codex/config.toml\nnotify = ["${helper}", "codex", "agent-turn-complete"]`;
    case "cursor": {
      const c = (ev: string) => [{ command: `${h} cursor ${ev}` }];
      return `// ~/.cursor/hooks.json\n` + JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: c("beforeSubmitPrompt"), afterFileEdit: c("afterFileEdit"), stop: c("stop") } }, null, 2);
    }
    case "opencode":
      return `// ~/.config/opencode/plugins/wanwanchan.js
const send = (e) => fetch("${url}?agent=opencode&event=" + encodeURIComponent(e)).catch(() => {});
export const WanWan-chan = async () => ({
  event: async ({ event }) => send(event.type),   // session.idle, session.error, permission.updated, ...
  "tool.execute.before": async () => send("tool.execute.before"),
});`;
    case "antigravity":
    case "custom":
      return `# from any script or tool\n${h} ${agent} thinking\n${h} ${agent} working\n${h} ${agent} completed\n\n# or plain HTTP\ncurl -X POST "${url}?agent=${agent}&state=completed"\n\n# states: idle | thinking | working | waiting | completed | error`;
  }
}

export function AiTab({ settings: s, update }: TabProps) {
  const [helper, setHelper] = useState("~/Library/Application Support/com.wanwanchan.app/bin/wanwanchan-notify");
  const [pick, setPick] = useState<AgentId>("claude");
  const [server, setServer] = useState<{ running: boolean; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [inst, setInst] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = () => integrationStatus().then(setInst).catch(() => {});
  useEffect(() => { void refresh(); }, []);
  async function toggleInstall(id: string) {
    setBusy(id);
    try { setNote(await integrationSet(id, !inst[id])); } catch (e) { setNote(String(e)); }
    await refresh();
    setBusy("");
  }

  useEffect(() => { agentHelperPath().then((p) => p && setHelper(p)).catch(() => {}); }, [s.agent.enabled]);
  useEffect(() => {
    const un = listen<{ running: boolean; error?: string }>("agent-server", (e) => setServer(e.payload));
    return () => { void un.then((f) => f()); };
  }, []);

  const test = (state: string) => agentEvent("test", state).catch(() => {});

  return (
    <Page title="AI Integration">
      <Group>
        <Row label="Enable agent detection" desc={s.agent.enabled ? (server?.error ? `Could not listen on port ${s.agent.port}: ${server.error}` : `Listening on 127.0.0.1:${s.agent.port} (local only).`) : "Starts a local-only listener that agent hooks can call."}>
          <Toggle value={s.agent.enabled} onChange={(v) => update({ agent: { enabled: v } })} />
        </Row>
      </Group>

      <Group title="Connect your tools (one click)">
        {CONNECT.map((c) => (
          <Row key={c.id} label={c.label} desc={c.desc}>
            {c.id === "antigravity" ? <span className="desc" style={{ color: "var(--sub)" }}>use Terminal</span> : (
              <>
                {inst[c.id] && <span style={{ color: "var(--sub)" }}>✓ Installed</span>}
                <button className={`btn ${inst[c.id] ? "" : "primary"}`} disabled={busy === c.id} onClick={() => toggleInstall(c.id)}>{inst[c.id] ? "Remove" : "Install"}</button>
              </>
            )}
          </Row>
        ))}
        {note && <div className="px-3.5 py-2.5 desc" style={{ color: "var(--sub)", borderTop: "1px solid var(--line)" }}>{note}</div>}
      </Group>

      <Group title="Agents to react to">
        {AGENTS.map((a) => (
          <Row key={a} label={NAMES[a]}>
            <Toggle value={s.agent.agents[a]} disabled={!s.agent.enabled} onChange={(v) => update({ agent: { agents: { [a]: v } } })} />
          </Row>
        ))}
      </Group>

      <Group title="Test animation">
        <div className="p-3 flex flex-wrap gap-2">
          {[["thinking", "Thinking"], ["working", "Working"], ["waiting", "Waiting"], ["completed", "Completed"], ["error", "Error"], ["idle", "Idle"]].map(([k, l]) => (
            <button key={k} className="btn" onClick={() => test(k)}>{l}</button>
          ))}
        </div>
        <div className="px-3 pb-3 desc" style={{ color: "var(--sub)" }}>Works even when detection is off. Thinking → thinking pose · Working → typing · Waiting → looking around · Completed → happy · Error → sad.</div>
      </Group>

      <Group title="Set up an agent">
        <Row label="Agent" desc={SUPPORT[pick]}>
          <Select value={pick} onChange={setPick} options={AGENTS.map((a) => ({ value: a, label: NAMES[a] }))} />
        </Row>
        <div className="p-3">
          <pre className="code">{snippet(pick, helper, s.agent.port)}</pre>
          <button className="btn mt-2" onClick={() => navigator.clipboard.writeText(snippet(pick, helper, s.agent.port)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>
      </Group>
    </Page>
  );
}
