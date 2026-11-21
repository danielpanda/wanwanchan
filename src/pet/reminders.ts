import type { Reminder } from "../shared/types";

export const parseHM = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

/** Is `now` inside quiet hours? Handles ranges that wrap past midnight (22:00 -> 07:00). */
export function inQuiet(now: Date, q: { enabled: boolean; from: string; to: string }): boolean {
  if (!q.enabled) return false;
  const a = parseHM(q.from), b = parseHM(q.to);
  if (a === null || b === null || a === b) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** When quiet hours end (ms timestamp) assuming `now` is inside them. */
export function quietEnd(now: Date, q: { to: string }): number {
  const b = parseHM(q.to) ?? 0;
  const d = new Date(now);
  d.setHours(Math.floor(b / 60), b % 60, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Next due time (ms) for a reminder. `from` is when it last fired / was armed. */
export function nextDue(r: Reminder, from: number): number | null {
  if (!r.enabled) return null;
  if (r.kind === "interval") return from + Math.max(1, r.every) * 60_000;
  const t = parseHM(r.time);
  if (t === null) return null;
  const d = new Date(from);
  d.setHours(Math.floor(t / 60), t % 60, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Signature used to detect edits to a reminder (so only changed ones get re-armed). */
export const sig = (r: Reminder) => `${r.enabled}|${r.kind}|${r.every}|${r.time}`;
