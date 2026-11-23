import { describe, expect, it } from "vitest";
import { meetingLink, upcoming, wallToEpoch } from "../src/pet/ics";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const WIDE = [utc(2026, 1, 1), utc(2027, 12, 31)] as const;

describe("time zones", () => {
  it("converts Outlook's Windows zone names (WIB = UTC+7)", () => {
    const ev = upcoming(wrap("BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Standup\r\nDTSTART;TZID=SE Asia Standard Time:20261123T090000\r\nDTEND;TZID=SE Asia Standard Time:20261123T093000\r\nEND:VEVENT"), ...WIDE);
    expect(ev).toHaveLength(1);
    expect(ev[0].start).toBe(utc(2026, 11, 23, 2, 0));
    expect(ev[0].end - ev[0].start).toBe(30 * 60_000);
  });
  it("handles DST in IANA zones", () => {
    expect(wallToEpoch({ y: 2026, m: 7, d: 1, hh: 9, mm: 0, ss: 0 }, { iana: "America/New_York" })).toBe(utc(2026, 7, 1, 13));
    expect(wallToEpoch({ y: 2026, m: 12, d: 1, hh: 9, mm: 0, ss: 0 }, { iana: "America/New_York" })).toBe(utc(2026, 12, 1, 14));
  });
  it("reads UTC (Z), fixed-offset names and skips all-day events", () => {
    const body = [
      "BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:Z\r\nDTSTART:20261123T100000Z\r\nEND:VEVENT",
      'BEGIN:VEVENT\r\nUID:f\r\nSUMMARY:F\r\nDTSTART;TZID="(UTC+07:00) Bangkok, Hanoi, Jakarta":20261124T090000\r\nEND:VEVENT',
      "BEGIN:VEVENT\r\nUID:d\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261125\r\nEND:VEVENT",
    ].join("\r\n");
    const ev = upcoming(wrap(body), ...WIDE);
    expect(ev.map((e) => e.title)).toEqual(["Z", "F"]);
    expect(ev[0].start).toBe(utc(2026, 11, 23, 10));
    expect(ev[1].start).toBe(utc(2026, 11, 24, 2));
  });
  it("ignores VTIMEZONE internals and unfolds long lines", () => {
    const body = "BEGIN:VTIMEZONE\r\nTZID:X\r\nBEGIN:STANDARD\r\nDTSTART:16010101T000000\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:u\r\nSUMMARY:Long\r\n  title\r\nDTSTART:20261123T100000Z\r\nEND:VEVENT";
    const ev = upcoming(wrap(body), ...WIDE);
    expect(ev).toHaveLength(1);
    expect(ev[0].title).toBe("Long title");
  });
});

describe("recurrence", () => {
  const weekly = (extra = "") => wrap(`BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:Sync\r\nDTSTART;TZID=SE Asia Standard Time:20261102T100000\r\nDTEND;TZID=SE Asia Standard Time:20261102T103000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE${extra}\r\nEND:VEVENT`);
  it("expands weekly BYDAY inside the window only", () => {
    const ev = upcoming(weekly(), utc(2026, 11, 9), utc(2026, 11, 17));
    expect(ev.map((e) => new Date(e.start).getUTCDate())).toEqual([9, 11, 16]);
    expect(new Date(ev[0].start).getUTCHours()).toBe(3);
  });
  it("honours COUNT, UNTIL and EXDATE", () => {
    expect(upcoming(weekly(";COUNT=3"), ...WIDE).length).toBe(3);
    expect(upcoming(weekly(";UNTIL=20261111T235959Z"), ...WIDE).map((e) => new Date(e.start).getUTCDate())).toEqual([2, 4, 9, 11]);
    const ex = wrap("BEGIN:VEVENT\r\nUID:e\r\nSUMMARY:E\r\nDTSTART:20261123T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261124T100000Z\r\nEND:VEVENT");
    expect(upcoming(ex, ...WIDE).map((e) => new Date(e.start).getUTCDate())).toEqual([23, 25]);
  });
  it("applies RECURRENCE-ID overrides and cancellations", () => {
    const body = [
      "BEGIN:VEVENT\r\nUID:o\r\nSUMMARY:Daily\r\nDTSTART:20261123T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT",
      "BEGIN:VEVENT\r\nUID:o\r\nSUMMARY:Daily (moved)\r\nRECURRENCE-ID:20261124T100000Z\r\nDTSTART:20261124T150000Z\r\nEND:VEVENT",
      "BEGIN:VEVENT\r\nUID:o\r\nSUMMARY:Daily\r\nRECURRENCE-ID:20261125T100000Z\r\nDTSTART:20261125T100000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT",
    ].join("\r\n");
    const ev = upcoming(wrap(body), ...WIDE);
    expect(ev.map((e) => [e.title, new Date(e.start).getUTCHours()])).toEqual([["Daily", 10], ["Daily (moved)", 15]]);
  });
  it("monthly by weekday ordinal and by month day", () => {
    const m = wrap("BEGIN:VEVENT\r\nUID:m\r\nSUMMARY:M\r\nDTSTART:20261110T100000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3\r\nEND:VEVENT");
    expect(upcoming(m, ...WIDE).map((e) => new Date(e.start).toISOString().slice(0, 10))).toEqual(["2026-11-10", "2026-12-08", "2027-01-12"]);
    const m2 = wrap("BEGIN:VEVENT\r\nUID:m3\r\nSUMMARY:M3\r\nDTSTART:20261115T100000Z\r\nRRULE:FREQ=MONTHLY;COUNT=3\r\nEND:VEVENT");
    expect(upcoming(m2, utc(2026, 12, 1), utc(2027, 1, 31)).map((e) => new Date(e.start).toISOString().slice(0, 10))).toEqual(["2026-12-15", "2027-01-15"]);
  });
});

describe("meeting links", () => {
  it("finds Teams / Zoom links and strips punctuation", () => {
    expect(meetingLink("Join: https://teams.microsoft.com/l/meetup-join/abc%40thread.v2/0?context=x.")).toBe("https://teams.microsoft.com/l/meetup-join/abc%40thread.v2/0?context=x");
    expect(meetingLink("see https://example.com and https://us02web.zoom.us/j/123")).toBe("https://us02web.zoom.us/j/123");
    expect(meetingLink("no link")).toBeUndefined();
  });
  it("carries the link from DESCRIPTION", () => {
    const ev = upcoming(wrap("BEGIN:VEVENT\r\nUID:l\r\nSUMMARY:L\r\nDTSTART:20261123T100000Z\r\nDESCRIPTION:Join\\nhttps://meet.google.com/abc-defg-hij\\n\r\nEND:VEVENT"), ...WIDE);
    expect(ev[0].link).toBe("https://meet.google.com/abc-defg-hij");
  });
});
