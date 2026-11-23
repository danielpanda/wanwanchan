import type { BondState } from "./types";

/** XP needed to reach level n+1 is LEVELS[n]. Level 1 starts at 0 XP. */
export const LEVELS = [0, 40, 120, 260, 480, 800, 1300];

export type XpKind = "pet" | "click" | "reminder" | "focus" | "agent" | "daily";

/** XP per action and a per-day cap so nobody can grind levels by spamming clicks. */
export const XP: Record<XpKind, { amount: number; cap: number }> = {
  click: { amount: 1, cap: 15 },
  pet: { amount: 2, cap: 20 },
  reminder: { amount: 5, cap: 40 },
  focus: { amount: 12, cap: 60 },
  agent: { amount: 3, cap: 30 },
  daily: { amount: 10, cap: 17 },
};

export interface AccessoryDef { id: string; level: number; name: { id: string; en: string }; emoji: string }
export const ACCESSORIES: AccessoryDef[] = [
  { id: "bow", level: 2, name: { id: "Pita", en: "Bow" }, emoji: "🎀" },
  { id: "glasses", level: 3, name: { id: "Kacamata", en: "Glasses" }, emoji: "👓" },
  { id: "scarf", level: 4, name: { id: "Syal", en: "Scarf" }, emoji: "🧣" },
  { id: "crown", level: 6, name: { id: "Mahkota", en: "Crown" }, emoji: "👑" },
];

export function levelOf(xp: number): { level: number; into: number; need: number | null } {
  let level = 1;
  for (let i = 1; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1;
  const next = LEVELS[level];
  return { level, into: xp - LEVELS[level - 1], need: next === undefined ? null : next - LEVELS[level - 1] };
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const yesterday = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));

export interface Award { state: BondState; gained: number; levelUp: number | null }

/** Apply one action. Pure: returns the new state, how much XP was actually granted, and a new level if reached. */
export function award(prev: BondState, kind: XpKind, now: Date): Award {
  const today = dayKey(now);
  const s: BondState = { ...prev, dayXp: prev.day === today ? { ...prev.dayXp } : {}, day: today };
  if (kind === "daily") {
    if (s.last === today) return { state: s, gained: 0, levelUp: null };
    s.streak = s.last === yesterday(now) ? s.streak + 1 : 1;
    s.last = today;
  }
  const rule = XP[kind];
  let amount = rule.amount + (kind === "daily" ? Math.min(7, s.streak - 1) : 0);
  const used = s.dayXp[kind] ?? 0;
  amount = Math.max(0, Math.min(amount, rule.cap - used));
  const before = levelOf(s.xp).level;
  s.xp += amount;
  s.dayXp[kind] = used + amount;
  const after = levelOf(s.xp).level;
  return { state: s, gained: amount, levelUp: after > before ? after : null };
}

export const unlocked = (xp: number) => ACCESSORIES.filter((a) => levelOf(xp).level >= a.level);
