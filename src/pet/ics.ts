/** Minimal iCalendar (.ics) reader: events, time zones (incl. Outlook's Windows names), recurrence. Pure. */

export interface CalEvent { uid: string; title: string; start: number; end: number; link?: string; location?: string }

type Tz = { iana?: string; fixedMin?: number } | undefined;
interface Wall { y: number; m: number; d: number; hh: number; mm: number; ss: number }
interface Dt { epoch: number; wall?: Wall; tz?: Tz; allDay: boolean }

const WIN_TZ: Record<string, string> = {
  "UTC": "UTC", "GMT Standard Time": "Europe/London", "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris", "E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest", "Russian Standard Time": "Europe/Moscow", "Turkey Standard Time": "Europe/Istanbul",
  "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver", "Pacific Standard Time": "America/Los_Angeles",
  "US Mountain Standard Time": "America/Phoenix", "Atlantic Standard Time": "America/Halifax",
  "Alaskan Standard Time": "America/Anchorage", "Hawaiian Standard Time": "Pacific/Honolulu",
  "E. South America Standard Time": "America/Sao_Paulo", "SA Pacific Standard Time": "America/Bogota",
  "SE Asia Standard Time": "Asia/Bangkok", "Singapore Standard Time": "Asia/Singapore",
  "Malay Peninsula Standard Time": "Asia/Kuala_Lumpur", "China Standard Time": "Asia/Shanghai",
  "Taipei Standard Time": "Asia/Taipei", "Tokyo Standard Time": "Asia/Tokyo", "Korea Standard Time": "Asia/Seoul",
  "India Standard Time": "Asia/Kolkata", "Pakistan Standard Time": "Asia/Karachi", "Bangladesh Standard Time": "Asia/Dhaka",
  "Myanmar Standard Time": "Asia/Yangon", "Arabian Standard Time": "Asia/Dubai", "Israel Standard Time": "Asia/Jerusalem",
  "AUS Eastern Standard Time": "Australia/Sydney", "E. Australia Standard Time": "Australia/Brisbane",
  "W. Australia Standard Time": "Australia/Perth", "New Zealand Standard Time": "Pacific/Auckland",
  "South Africa Standard Time": "Africa/Johannesburg", "Egypt Standard Time": "Africa/Cairo",
};

function resolveTz(tzid?: string): Tz {
  if (!tzid) return undefined;
  const t = tzid.replace(/^"|"$/g, "");
  const m = /UTC\s*([+-])(\d{1,2}):?(\d{2})?/.exec(t);
  if (WIN_TZ[t]) return { iana: WIN_TZ[t] };
  try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return { iana: t }; } catch { /* fall through */ }
  if (m) return { fixedMin: (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) };
  return undefined; // unknown: treat as floating (local time)
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function offsetMin(ts: number, iana: string): number {
  let f = fmtCache.get(iana);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: iana, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    fmtCache.set(iana, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ts))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ts / 1000) * 1000) / 60000;
}

export function wallToEpoch(w: Wall, tz: Tz): number {
  if (!tz) return new Date(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss).getTime();
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  if (tz.fixedMin !== undefined) return guess - tz.fixedMin * 60000;
  const o1 = offsetMin(guess, tz.iana!);
  const o2 = offsetMin(guess - o1 * 60000, tz.iana!);
  return guess - o2 * 60000;
}

function parseDt(value: string, params: Record<string, string>): Dt | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const w: Wall = { y: +m[1], m: +m[2], d: +m[3], hh: +(m[4] ?? 0), mm: +(m[5] ?? 0), ss: +(m[6] ?? 0) };
  const allDay = params.VALUE === "DATE" || m[4] === undefined;
  if (m[7]) return { epoch: Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss), allDay, wall: w, tz: { fixedMin: 0 } };
  const tz = resolveTz(params.TZID);
  return { epoch: wallToEpoch(w, tz), wall: w, tz, allDay };
}

const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

interface Raw {
  uid: string; title: string; start: Dt; end?: Dt; rrule?: Record<string, string>; ex: number[];
  recId?: number; cancelled: boolean; location: string; text: string;
}

function parseProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let inQ = false, colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQ = !inQ;
    else if (line[i] === ":" && !inQ) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon), value = line.slice(colon + 1);
  const parts = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) { const eq = p.indexOf("="); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ""); }
  return { name: (parts[0] ?? "").toUpperCase(), params, value };
}

export function parseEvents(ics: string): Raw[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: Raw[] = [];
  let cur: Partial<Raw> | null = null, skipTz = 0;
  for (const line of lines) {
    if (line === "BEGIN:VTIMEZONE") { skipTz++; continue; }
    if (line === "END:VTIMEZONE") { skipTz = Math.max(0, skipTz - 1); continue; }
    if (skipTz) continue;
    if (line === "BEGIN:VEVENT") { cur = { ex: [], cancelled: false, location: "", text: "", title: "" }; continue; }
    if (line === "END:VEVENT") {
      if (cur?.start) out.push({ ...(cur as Raw), uid: cur.uid ?? `${cur.title}-${cur.start.epoch}` });
      cur = null; continue;
    }
    if (!cur) continue;
    const p = parseProp(line);
    if (!p) continue;
    switch (p.name) {
      case "UID": cur.uid = p.value; break;
      case "SUMMARY": cur.title = unescape(p.value); break;
      case "DTSTART": { const d = parseDt(p.value, p.params); if (d) cur.start = d; break; }
      case "DTEND": { const d = parseDt(p.value, p.params); if (d) cur.end = d; break; }
      case "RRULE": cur.rrule = Object.fromEntries(p.value.split(";").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i).toUpperCase(), kv.slice(i + 1)]; })); break;
      case "EXDATE": for (const v of p.value.split(",")) { const d = parseDt(v, p.params); if (d) cur.ex!.push(d.epoch); } break;
      case "RECURRENCE-ID": { const d = parseDt(p.value, p.params); if (d) cur.recId = d.epoch; break; }
      case "STATUS": cur.cancelled = p.value.toUpperCase() === "CANCELLED"; break;
      case "LOCATION": cur.location = unescape(p.value); cur.text += " " + unescape(p.value); break;
      case "DESCRIPTION": case "URL": case "X-MICROSOFT-SKYPETEAMSMEETINGURL": cur.text += " " + unescape(p.value); break;
    }
  }
  return out;
}

const LINK_HOSTS = /(teams\.microsoft\.com|teams\.live\.com|zoom\.us|zoom\.com|meet\.google\.com|webex\.com|whereby\.com|gotomeeting\.com|bluejeans\.com)/i;
export function meetingLink(text: string): string | undefined {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) if (LINK_HOSTS.test(m[0])) return m[0].replace(/[.,;]+$/, "");
  return undefined;
}

// ---------------------------------------------------------------- recurrence
const DOW = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const dowOf = (y: number, m: number, d: number) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0
const addDays = (y: number, m: number, d: number, n: number) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function* dates(rule: Record<string, string>, s: { y: number; m: number; d: number }): Generator<{ y: number; m: number; d: number }> {
  const n = Math.max(1, Number(rule.INTERVAL ?? 1));
  const byday = (rule.BYDAY ?? "").split(",").filter(Boolean).map((x) => ({ ord: Number(/^[+-]?\d+/.exec(x)?.[0] ?? 0), wd: DOW.indexOf(x.replace(/^[+-]?\d+/, "")) })).filter((x) => x.wd >= 0);
  switch (rule.FREQ) {
    case "DAILY": for (let i = 0; i < 4000; i += n) yield addDays(s.y, s.m, s.d, i); return;
    case "WEEKLY": {
      const wds = (byday.length ? byday.map((b) => b.wd) : [dowOf(s.y, s.m, s.d)]).sort((a, b) => a - b);
      const base = addDays(s.y, s.m, s.d, -dowOf(s.y, s.m, s.d));
      for (let w = 0; w < 700; w += n) for (const wd of wds) {
        const t = addDays(base.y, base.m, base.d, w * 7 + wd);
        if (Date.UTC(t.y, t.m - 1, t.d) >= Date.UTC(s.y, s.m - 1, s.d)) yield t;
      }
      return;
    }
    case "MONTHLY": {
      for (let k = 0; k < 600; k += n) {
        const mi = s.m - 1 + k, y = s.y + Math.floor(mi / 12), m = (mi % 12) + 1;
        if (byday.length) {
          const pos = Number(rule.BYSETPOS ?? 0);
          const list: number[] = [];
          for (let d = 1; d <= daysIn(y, m); d++) for (const b of byday) if (dowOf(y, m, d) === b.wd) list.push(d);
          for (const b of byday) {
            const o = b.ord || pos;
            const match = list.filter((d) => dowOf(y, m, d) === b.wd);
            if (o) { const d = o > 0 ? match[o - 1] : match[match.length + o]; if (d) yield { y, m, d }; }
            else for (const d of match) yield { y, m, d };
          }
        } else {
          const d = Number(rule.BYMONTHDAY ?? s.d);
          if (d > 0 && d <= daysIn(y, m)) yield { y, m, d };
        }
      }
      return;
    }
    case "YEARLY": for (let k = 0; k < 200; k += n) { if (s.d <= daysIn(s.y + k, s.m)) yield { y: s.y + k, m: s.m, d: s.d }; } return;
    default: return;
  }
}

/** Events overlapping [from, to] (epoch ms), recurrences expanded, sorted by start. All-day events are skipped. */
export function upcoming(ics: string, from: number, to: number): CalEvent[] {
  const raws = parseEvents(ics);
  const overridden = new Set(raws.filter((r) => r.recId !== undefined).map((r) => `${r.uid}|${r.recId}`));
  const out: CalEvent[] = [];
  const push = (r: Raw, start: number, dur: number) => {
    if (r.cancelled || start > to || start + dur < from) return;
    out.push({ uid: r.uid, title: r.title || "(no title)", start, end: start + dur, link: meetingLink(r.text), location: r.location || undefined });
  };
  for (const r of raws) {
    if (r.start.allDay) continue;
    const dur = r.end ? Math.max(0, r.end.epoch - r.start.epoch) : 0;
    if (!r.rrule || r.recId !== undefined) { push(r, r.start.epoch, dur); continue; }
    const w = r.start.wall!;
    const until = r.rrule.UNTIL ? parseDt(r.rrule.UNTIL, {})?.epoch : undefined;
    const maxCount = r.rrule.COUNT ? Number(r.rrule.COUNT) : Infinity;
    let count = 0;
    for (const d of dates(r.rrule, w)) {
      const start = wallToEpoch({ ...w, ...d }, r.start.tz);
      if (until !== undefined && start > until + 86_400_000) break;
      if (++count > maxCount || start > to) break;
      if (r.ex.includes(start) || overridden.has(`${r.uid}|${start}`)) continue;
      push(r, start, dur);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
