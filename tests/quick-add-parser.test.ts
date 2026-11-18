import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/quick-add-parser";

const TZ = "Asia/Kolkata";
// Tue 17 Nov 2026, 10:00 IST
const NOW = new Date("2026-11-17T04:30:00Z");
const p = (s: string, now = NOW) => parseQuickAdd(s, { timezone: TZ, now });
const ist = (d?: Date) =>
  d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("Z", "") : undefined;

describe("quick-add parser", () => {
  it("parses the full example", () => {
    const r = p("Send report to Rahul tomorrow 5pm #clientA @report !high every monday");
    expect(r.title).toBe("Send report to Rahul");
    expect(r.projectName).toBe("clientA");
    expect(r.tags).toEqual(["report"]);
    expect(r.priority).toBe(2);
    expect(r.recurrence?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(ist(r.dueAt)).toBe("2026-11-18T17:00:00.000");
    expect(r.allDay).toBe(false);
  });
  it("plain title has no metadata", () => {
    const r = p("Buy stationery");
    expect(r).toMatchObject({ title: "Buy stationery", tags: [], allDay: false });
    expect(r.dueAt).toBeUndefined();
  });
  it("today", () => {
    expect(ist(p("Call vendor today").dueAt)).toBe("2026-11-17T00:00:00.000");
  });
  it("tomorrow is all-day", () => {
    const r = p("Pay invoice tomorrow");
    expect(r.allDay).toBe(true);
    expect(ist(r.dueAt)).toBe("2026-11-18T00:00:00.000");
    expect(r.title).toBe("Pay invoice");
  });
  it("next friday", () => {
    expect(ist(p("Demo next friday").dueAt)).toBe("2026-11-27T00:00:00.000");
  });
  it("in 3 days", () => {
    expect(ist(p("Review PR in 3 days").dueAt)?.slice(0, 10)).toBe("2026-11-20");
  });
  it("25 dec", () => {
    expect(ist(p("Gift 25 dec").dueAt)).toBe("2026-12-25T00:00:00.000");
  });
  it("time only later today stays today", () => {
    expect(ist(p("Standup 5pm").dueAt)).toBe("2026-11-17T17:00:00.000");
  });
  it("past time rolls to next occurrence", () => {
    expect(ist(p("Standup 9am").dueAt)).toBe("2026-11-18T09:00:00.000");
  });
  it("tomorrow near midnight uses the user's timezone", () => {
    // 00:10 IST on 18 Nov == 18:40 UTC on 17 Nov
    const r = p("Submit form tomorrow", new Date("2026-11-17T18:40:00Z"));
    expect(ist(r.dueAt)).toBe("2026-11-19T00:00:00.000");
  });
  it("priority tokens", () => {
    expect(p("a !p1").priority).toBe(1);
    expect(p("a !urgent").priority).toBe(1);
    expect(p("a !high").priority).toBe(2);
    expect(p("a !medium").priority).toBe(3);
    expect(p("a !low").priority).toBe(4);
    expect(p("a !p4").priority).toBe(4);
  });
  it("first priority wins and all are stripped", () => {
    const r = p("a !p1 !low");
    expect(r.priority).toBe(1);
    expect(r.title).toBe("a");
  });
  it("multiple tags dedupe and lowercase", () => {
    expect(p("a @Foo @bar @foo").tags).toEqual(["foo", "bar"]);
  });
  it("project and tag together", () => {
    const r = p("Write spec #Alpha @docs");
    expect(r.projectName).toBe("Alpha");
    expect(r.tags).toEqual(["docs"]);
    expect(r.title).toBe("Write spec");
  });
  it("every day / week / month / weekday", () => {
    expect(p("a every day").recurrence?.rrule).toBe("FREQ=DAILY");
    expect(p("a every week").recurrence?.rrule).toBe("FREQ=WEEKLY");
    expect(p("a every month").recurrence?.rrule).toBe("FREQ=MONTHLY");
    expect(p("a every weekday").recurrence?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
  });
  it("every monday gets a first due date", () => {
    const r = p("Weekly sync every monday");
    expect(r.title).toBe("Weekly sync");
    expect(ist(r.dueAt)).toBe("2026-11-23T00:00:00.000");
  });
  it("every friday 4pm keeps the time", () => {
    const r = p("Wrap up every friday 4pm");
    expect(r.recurrence?.rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(r.allDay).toBe(false);
  });
  it("wait:person", () => {
    const r = p("Get sign-off wait:Priya");
    expect(r.waitingOn?.person).toBe("Priya");
    expect(r.title).toBe("Get sign-off");
  });
  it("wait with quotes", () => {
    expect(p('Get sign-off wait:"Priya Shah"').waitingOn?.person).toBe("Priya Shah");
  });
  it("tokens in the middle of the title", () => {
    expect(p("Email #ops John @mail about budget").title).toBe("Email John about budget");
  });
  it("collapses whitespace", () => {
    expect(p("  a    b   ").title).toBe("a b");
  });
  it("empty input", () => {
    expect(p("").title).toBe("");
  });
  it("only tokens leaves empty title", () => {
    expect(p("#x !p1").title).toBe("");
  });
  it("does not treat emails or mid-word # as tokens", () => {
    const r = p("Mail dev@example.com about C#");
    expect(r.tags).toEqual([]);
    expect(r.projectName).toBeUndefined();
  });
  it("time with minutes", () => {
    expect(ist(p("Sync tomorrow 3:30pm").dueAt)).toBe("2026-11-18T15:30:00.000");
  });
  it("unicode project names", () => {
    expect(p("a #प्रोजेक्ट").projectName).toBe("प्रोजेक्ट");
  });
  it("remind tokens", () => {
    const r = p("Send deck tomorrow 5pm remind:30m");
    expect(r.remindOffsetMin).toBe(30);
    expect(r.title).toBe("Send deck");
    expect(p("a remind:2h").remindOffsetMin).toBe(120);
    expect(p("a remind:1d").remindOffsetMin).toBe(1440);
  });
  it("ignores invalid remind tokens but keeps the text", () => {
    const r = p("a remind:soon");
    expect(r.remindOffsetMin).toBeUndefined();
    expect(r.title).toBe("a remind:soon");
  });
  it("tells whether the text named a day or only a time", () => {
    expect(p("a 5pm").dateExplicit).toBe(false);
    expect(p("a tomorrow 5pm").dateExplicit).toBe(true);
    expect(p("a tomorrow").dateExplicit).toBe(true);
    expect(p("a next friday").dateExplicit).toBe(true);
    expect(p("a 25 dec").dateExplicit).toBe(true);
    expect(p("a every monday").dateExplicit).toBe(true);
    expect(p("plain").dateExplicit).toBe(false);
  });
});
