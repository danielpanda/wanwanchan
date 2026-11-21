export const STATES = [
  "idle", "blink", "walk", "run", "sit", "sleep", "look",
  "typing", "jump", "happy", "thinking", "drag", "drop", "error",
  "groom", "stretch", "yawn", "wiggle",
] as const;
export type PetState = (typeof STATES)[number];

export const STATE_LABELS: Record<PetState, string> = {
  idle: "Idle", blink: "Blink", walk: "Walk", run: "Run", sit: "Sit", sleep: "Sleep",
  look: "Look (mouse / waiting)", typing: "Typing / working", jump: "Jump (click)",
  happy: "Happy (done / fast typing)", thinking: "Thinking", drag: "Drag", drop: "Drop",
  error: "Error",
  groom: "Groom (idle quirk)", stretch: "Stretch (idle quirk / wake up)", yawn: "Yawn (idle quirk / before sleep)", wiggle: "Wiggle & pounce (idle quirk)",
};

export const AGENTS = ["claude", "codex", "cursor", "antigravity", "opencode", "custom"] as const;
export type AgentId = (typeof AGENTS)[number];
export type AgentState = "idle" | "thinking" | "working" | "waiting" | "completed" | "error";

export interface Reminder {
  id: string;
  emoji: string;
  kind: "interval" | "daily";
  /** Minutes between reminders (interval). */
  every: number;
  /** "HH:MM" (daily). */
  time: string;
  /** Custom text; empty for built-ins (they use localized lines). */
  text: string;
  enabled: boolean;
  builtin?: boolean;
}

export interface NotifySettings {
  enabled: boolean;
  language: "id" | "en";
  bubbleSeconds: number;
  sound: boolean;
  quiet: { enabled: boolean; from: string; to: string };
  greetings: boolean;
  chatter: boolean;
  chatterEvery: number;
  agentReactions: boolean;
  praise: boolean;
  reactions: boolean;
  reminders: Reminder[];
}

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: "water", emoji: "💧", kind: "interval", every: 45, time: "", text: "", enabled: true, builtin: true },
  { id: "eyes", emoji: "👀", kind: "interval", every: 20, time: "", text: "", enabled: false, builtin: true },
  { id: "posture", emoji: "🧘", kind: "interval", every: 60, time: "", text: "", enabled: true, builtin: true },
  { id: "stretch", emoji: "🙆", kind: "interval", every: 90, time: "", text: "", enabled: false, builtin: true },
  { id: "lunch", emoji: "🍙", kind: "daily", every: 60, time: "12:00", text: "", enabled: false, builtin: true },
  { id: "sleep", emoji: "😴", kind: "daily", every: 60, time: "23:30", text: "", enabled: false, builtin: true },
];

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  language: "id",
  bubbleSeconds: 8,
  sound: false,
  quiet: { enabled: false, from: "22:00", to: "07:00" },
  greetings: true,
  chatter: true,
  chatterEvery: 25,
  agentReactions: true,
  praise: true,
  reactions: true,
  reminders: DEFAULT_REMINDERS,
};

export interface Settings {
  enabled: boolean;
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  monitor: string;
  character: string;
  scale: number;
  fps: number | null;
  speed: number;
  position: { x: number; y: number };
  mouseInteraction: boolean;
  followCursor: boolean;
  keyboardInteraction: boolean;
  randomMotion: boolean;
  sleepMode: boolean;
  wanderEvery: number;
  sitAfter: number;
  sleepAfter: number;
  agent: { enabled: boolean; port: number; agents: Record<AgentId, boolean> };
  notify: NotifySettings;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  launchAtLogin: false,
  alwaysOnTop: true,
  monitor: "",
  character: "cat",
  scale: 3,
  fps: null,
  speed: 60,
  position: { x: 0.5, y: 0.92 },
  mouseInteraction: true,
  followCursor: false,
  keyboardInteraction: true,
  randomMotion: true,
  sleepMode: true,
  wanderEvery: 15,
  sitAfter: 45,
  sleepAfter: 180,
  agent: {
    enabled: false,
    port: 47321,
    agents: { claude: true, codex: true, cursor: true, antigravity: true, opencode: true, custom: true },
  },
  notify: DEFAULT_NOTIFY,
};

export function withDefaults(raw: Partial<Settings> | null | undefined): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    position: { ...DEFAULT_SETTINGS.position, ...(r.position ?? {}) },
    agent: {
      ...DEFAULT_SETTINGS.agent,
      ...(r.agent ?? {}),
      agents: { ...DEFAULT_SETTINGS.agent.agents, ...(r.agent?.agents ?? {}) },
    },
    notify: {
      ...DEFAULT_NOTIFY,
      ...(r.notify ?? {}),
      quiet: { ...DEFAULT_NOTIFY.quiet, ...(r.notify?.quiet ?? {}) },
      reminders: Array.isArray(r.notify?.reminders) ? r.notify!.reminders : DEFAULT_NOTIFY.reminders,
    },
  };
}

// ---- sprite configuration (sprite.json) ----
export interface AnimationDef {
  /** First frame index (row-major) when `frames` is not given. */
  start?: number;
  count?: number;
  /** Explicit frame indices; overrides start/count. */
  frames?: number[];
  fps: number;
  loop?: boolean;
}
export interface SpriteConfig {
  name: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, AnimationDef>;
  /** pet state -> animation name. Missing states fall back to an animation with the same name, then idle. */
  states: Partial<Record<PetState, string>>;
  /** Display size multiplier for large images (1 = pixel art at native size). */
  renderScale: number;
  /** Smooth scaling (for high-resolution art). Pixel art keeps this off. */
  smooth: boolean;
  /** Extra animation names to play at random while idle. */
  quirks: string[];
}
