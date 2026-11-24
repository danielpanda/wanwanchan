/** Turns what the user typed ("tolong buka cursor ya") into an app to open or a built-in action. Pure. */

export type Intent =
  | { type: "app"; app: string }
  | { type: "action"; name: "focus" | "sit" | "jump" | "settings" | "panel" }
  | { type: "none"; suggestions: string[] };

const OPEN_VERBS = ["open", "buka", "bukain", "bukakan", "launch", "start", "run", "jalankan", "jalanin", "mulai", "nyalain", "go", "to", "ke", "the", "app", "aplikasi"];
const FILLER = ["tolong", "please", "pls", "ya", "dong", "deh", "aja", "donk", "yuk", "kak", "cat", "kucing", "dog", "anjing", "wanwan", "wanwanchan", "mate", "pixelmate", "can", "you", "could", "bisa", "minta", "coba", "sekarang", "now"];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Higher is better; 0 = no match. */
export function score(query: string, app: string): number {
  const q = norm(query), a = norm(app);
  if (!q) return 0;
  if (a === q) return 100;
  if (a.startsWith(q)) return 80 - Math.min(20, a.length - q.length);
  if (a.split(" ").some((w) => w.startsWith(q))) return 60;
  if (a.includes(q)) return 40;
  // characters of the query appear in order ("vsc" -> "visual studio code")
  const initials = a.split(" ").map((w) => w[0]).join("");
  if (initials.startsWith(q.replace(/ /g, ""))) return 35;
  let i = 0;
  for (const ch of a) if (ch === q[i]) i++;
  return i === q.length && q.length >= 3 ? 20 : 0;
}

export function fuzzy(query: string, apps: string[], limit = 5): string[] {
  return apps
    .map((a) => ({ a, s: score(query, a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.a.length - y.a.length || x.a.localeCompare(y.a))
    .slice(0, limit)
    .map((x) => x.a);
}

const ACTIONS: { name: Extract<Intent, { type: "action" }>["name"]; words: string[] }[] = [
  { name: "focus", words: ["focus", "fokus", "pomodoro", "timer"] },
  { name: "sit", words: ["sit", "duduk", "stay", "diam", "stand", "berdiri"] },
  { name: "jump", words: ["jump", "lompat", "hi", "halo", "hai", "hello"] },
  { name: "settings", words: ["settings", "setting", "pengaturan", "preferences"] },
  { name: "panel", words: ["agents", "history", "riwayat"] },
];

/** The part of the text that names an app (verbs and filler removed). Used for live suggestions. */
export function targetOf(text: string): string {
  return norm(text).split(" ").filter((w) => !FILLER.includes(w) && !OPEN_VERBS.includes(w)).join(" ");
}

export function parseCommand(text: string, apps: string[]): Intent {
  const n = norm(text);
  if (!n) return { type: "none", suggestions: [] };
  const words = n.split(" ");
  const rest = words.filter((w) => !FILLER.includes(w));
  const verbs = rest.filter((w) => OPEN_VERBS.includes(w));
  const target = rest.filter((w) => !OPEN_VERBS.includes(w)).join(" ");

  // exact app names win ("settings" is also an app on some Macs, but the user typed a bare word)
  if (target) {
    const exact = apps.find((a) => norm(a) === target);
    if (exact) return { type: "app", app: exact };
  }
  const act = ACTIONS.find((a) => a.words.includes(target) || (!target && a.words.some((w) => rest.includes(w))));
  if (act && (verbs.length === 0 || act.name === "settings" || act.name === "focus")) return { type: "action", name: act.name };
  if (!target) return { type: "none", suggestions: [] };
  const hits = fuzzy(target, apps);
  const best = hits[0];
  // open only when there is one clear winner; otherwise let the user pick
  if (best && (hits.length === 1 || score(target, best) > score(target, hits[1]) + 15)) return { type: "app", app: best };
  return { type: "none", suggestions: hits };
}
