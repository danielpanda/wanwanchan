import type { Settings } from "../shared/types";
import { upcoming, type CalEvent } from "./ics";

const REFRESH_MS = 15 * 60_000;
const LOOKAHEAD_MS = 36 * 3600_000;

/** Pulls published .ics feeds (Outlook, Google, iCloud...) every 15 minutes while enabled. */
export class CalendarSync {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sig = "";
  private gen = 0;

  constructor(private d: {
    settings(): Settings;
    fetchText(url: string): Promise<string>;
    apply(events: CalEvent[]): void;
  }) {}

  /** Call after every settings change; only re-fetches when something relevant changed. */
  configure() {
    const c = this.d.settings().calendar;
    const sig = JSON.stringify([c.enabled, c.urls, c.leadMin, c.titles]);
    if (sig === this.sig) return;
    this.sig = sig;
    void this.refresh();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.sig = "";
    this.gen++;
  }

  async refresh() {
    clearTimeout(this.timer);
    const gen = ++this.gen;
    const c = this.d.settings().calendar;
    if (!c.enabled || !c.urls.length) { this.d.apply([]); return; }
    const now = Date.now(), events: CalEvent[] = [];
    for (const url of c.urls.slice(0, 3)) {
      try { events.push(...upcoming(await this.d.fetchText(url), now, now + LOOKAHEAD_MS)); }
      catch { /* offline or bad link: try again next round */ }
    }
    if (gen !== this.gen) return; // settings changed while downloading
    this.d.apply(events.sort((a, b) => a.start - b.start));
    this.timer = setTimeout(() => void this.refresh(), REFRESH_MS);
  }
}
