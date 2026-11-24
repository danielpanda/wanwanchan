type PetState = string;

/** Animation priorities: higher wins. Equal priority -> most recently requested wins. */
export const PRIORITY = {
  idle: 10, blink: 11, rest: 20, quirk: 25, transition: 26, focus: 27, music: 28, move: 30, linger: 35, stay: 36, look: 40, notify: 45, typing: 60, excited: 61,
  agent: 70, agentDone: 75, jump: 80, drop: 90, drag: 100,
} as const;

interface Req {
  key: string;
  state: PetState;
  priority: number;
  until: number; // Infinity = held until released
  seq: number;
}

/**
 * Finite state machine driven by "sources". Each source either holds a state until released
 * or pulses a state for a duration (optionally with a cooldown). The visible state is the
 * live request with the highest priority.
 */
export class StateMachine {
  private reqs = new Map<string, Req>();
  private cooldownUntil = new Map<string, number>();
  private seq = 0;
  constructor(private base: PetState = "idle") {}

  hold(key: string, state: PetState, priority: number) {
    const cur = this.reqs.get(key);
    if (cur && cur.state === state && cur.priority === priority && cur.until === Infinity) return;
    this.reqs.set(key, { key, state, priority, until: Infinity, seq: ++this.seq });
  }

  release(key: string) {
    this.reqs.delete(key);
  }

  /** Timed request. Returns false when the key is still cooling down. */
  pulse(key: string, state: PetState, priority: number, now: number, durationMs: number, cooldownMs = 0): boolean {
    if ((this.cooldownUntil.get(key) ?? 0) > now) return false;
    const cur = this.reqs.get(key);
    // Extending the same pulse keeps its sequence so it doesn't steal from newer equal-priority states.
    const seq = cur && cur.state === state && cur.until > now ? cur.seq : ++this.seq;
    this.reqs.set(key, { key, state, priority, until: now + durationMs, seq });
    if (cooldownMs > 0) this.cooldownUntil.set(key, now + durationMs + cooldownMs);
    return true;
  }

  has(key: string, now: number): boolean {
    const r = this.reqs.get(key);
    return !!r && r.until > now;
  }

  current(now: number): { state: PetState; key: string } {
    let best: Req | null = null;
    for (const r of this.reqs.values()) {
      if (r.until <= now) {
        this.reqs.delete(r.key);
        continue;
      }
      if (!best || r.priority > best.priority || (r.priority === best.priority && r.seq > best.seq)) best = r;
    }
    return best ? { state: best.state, key: best.key } : { state: this.base, key: "base" };
  }

  /** Time (ms from now) until the earliest timed request expires, or null. */
  nextExpiry(now: number): number | null {
    let min: number | null = null;
    for (const r of this.reqs.values()) {
      if (r.until !== Infinity && r.until > now) min = min === null ? r.until - now : Math.min(min, r.until - now);
    }
    return min;
  }
}

/** Rolling key-rate tracker. Only timestamps are kept; nothing about which key was pressed. */
export class TypingMeter {
  private stamps: number[] = [];
  constructor(private windowMs = 2000, private fastCount = 9) {}
  hit(now: number) {
    this.stamps.push(now);
    const cut = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] < cut) this.stamps.shift();
    if (this.stamps.length > 64) this.stamps.splice(0, this.stamps.length - 64);
  }
  isFast(now: number) {
    const cut = now - this.windowMs;
    return this.stamps.filter((t) => t >= cut).length >= this.fastCount;
  }
}

export type AgentStateName = "idle" | "thinking" | "working" | "waiting" | "completed" | "error";
const RANK: Record<AgentStateName, number> = { idle: 0, thinking: 1, working: 2, waiting: 3, error: 4, completed: 0 };

/** Merge per-agent states into one (error > waiting > working > thinking). */
export function aggregateAgents(states: Iterable<AgentStateName>): AgentStateName {
  let best: AgentStateName = "idle";
  for (const s of states) if (RANK[s] > RANK[best]) best = s;
  return best;
}

export const AGENT_ANIM: Record<Exclude<AgentStateName, "idle" | "completed">, string> = {
  thinking: "thinking",
  working: "typing",
  waiting: "look",
  error: "error",
};
