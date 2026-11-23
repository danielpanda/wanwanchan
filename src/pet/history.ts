export type RunState = "thinking" | "working" | "waiting" | "completed" | "error" | "idle";

export interface Run {
  id: number;
  agent: string;
  state: RunState;
  start: number;
  end?: number;
  bid?: string;
  last: number;
}

const STALE_MS = 30 * 60_000;
const KEEP = 14;

/** Recent agent runs (per session, in memory). One run = from the first thinking/working event to done/error. */
export class AgentHistory {
  private runs: Run[] = [];
  private seq = 0;

  record(ev: { agent: string; state: RunState; bid?: string | null }, now: number) {
    const active = this.runs.find((r) => r.agent === ev.agent && r.end === undefined);
    const bid = ev.bid ?? undefined;
    if (ev.state === "thinking" || ev.state === "working" || ev.state === "waiting") {
      if (active) { active.state = ev.state; active.last = now; if (bid) active.bid = bid; }
      else this.runs.push({ id: ++this.seq, agent: ev.agent, state: ev.state, start: now, last: now, bid });
    } else if (ev.state === "completed" || ev.state === "error") {
      if (active) { active.state = ev.state; active.end = now; active.last = now; if (bid) active.bid = bid; }
      else this.runs.push({ id: ++this.seq, agent: ev.agent, state: ev.state, start: now, end: now, last: now, bid });
    } else if (active) { // idle / session ended
      active.state = "idle"; active.end = now; active.last = now;
    }
    if (this.runs.length > KEEP) {
      const i = this.runs.findIndex((r) => r.end !== undefined);
      this.runs.splice(i >= 0 ? i : 0, 1);
    }
  }

  /** Newest first. Runs that went quiet for 30 min are treated as ended. */
  list(now: number): Run[] {
    for (const r of this.runs) if (r.end === undefined && now - r.last > STALE_MS) { r.end = r.last; r.state = "idle"; }
    return [...this.runs].sort((a, b) => b.last - a.last);
  }
}

export function ago(ms: number, lang: "id" | "en"): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return lang === "id" ? "baru saja" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return lang === "id" ? `${m} mnt lalu` : `${m} min ago`;
  const h = Math.round(m / 60);
  return lang === "id" ? `${h} jam lalu` : `${h} h ago`;
}
