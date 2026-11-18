import { describe, expect, it } from "vitest";
import {
  buildRrule,
  describeRrule,
  firstOccurrence,
  nextOccurrence,
  parseRrule,
  validateRrule,
  type RepeatConfig,
} from "@/lib/recurrence";

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const ist = (d: Date | null) =>
  d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("Z", "") : null;
const utc = (s: string) => new Date(s);

describe("buildRrule / parseRrule / describeRrule", () => {
  it("builds the common patterns", () => {
    expect(buildRrule({ freq: "DAILY", interval: 1, byWeekday: [] })).toBe("FREQ=DAILY");
    expect(buildRrule({ freq: "WEEKLY", interval: 2, byWeekday: ["WE", "MO"] })).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
    );
    expect(buildRrule({ freq: "MONTHLY", interval: 1, byWeekday: ["MO"] })).toBe("FREQ=MONTHLY");
  });
  it("round-trips", () => {
    const cfg: RepeatConfig = { freq: "WEEKLY", interval: 3, byWeekday: ["TU", "FR"] };
    expect(parseRrule(buildRrule(cfg))).toEqual(cfg);
  });
  it("describes in plain words", () => {
    expect(describeRrule("FREQ=DAILY")).toBe("Every day");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO")).toBe("Every Monday");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("Every weekday");
    expect(describeRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe("Every 2 weeks on Mon, Wed");
    expect(describeRrule("FREQ=MONTHLY;INTERVAL=3")).toBe("Every 3 months");
    expect(describeRrule("nonsense")).toBe("Repeats");
  });
  it("validates", () => {
    expect(validateRrule("FREQ=DAILY")).toBe(true);
    expect(validateRrule("FREQ=WEEKLY;BYDAY=MO")).toBe(true);
    expect(validateRrule("FREQ=HOURLY")).toBe(false);
    expect(validateRrule("FREQ=DAILY;COUNT=3")).toBe(false);
    expect(validateRrule("FREQ=DAILY;UNTIL=20271231T000000Z")).toBe(false);
    expect(validateRrule("FREQ=DAILY;INTERVAL=0")).toBe(false);
    expect(validateRrule("FREQ=DAILY;INTERVAL=1000")).toBe(false);
    expect(validateRrule("garbage")).toBe(false);
    expect(validateRrule("")).toBe(false);
  });
});

describe("nextOccurrence", () => {
  const due = utc("2026-11-17T04:00:00Z"); // Tue 17 Nov 09:30 IST
  const early = utc("2026-11-17T03:00:00Z"); // completed before it was due

  it("daily moves to tomorrow at the same time", () => {
    expect(ist(nextOccurrence("FREQ=DAILY", due, IST, early))).toBe("2026-11-18T09:30:00.000");
  });
  it("weekly on a weekday", () => {
    expect(ist(nextOccurrence("FREQ=WEEKLY;BYDAY=MO", due, IST, early))).toBe(
      "2026-11-23T09:30:00.000",
    );
  });
  it("weekdays skip the weekend", () => {
    const friday = utc("2026-11-20T04:00:00Z");
    expect(ist(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", friday, IST, early))).toBe(
      "2026-11-23T09:30:00.000",
    );
  });
  it("every 2 weeks", () => {
    expect(ist(nextOccurrence("FREQ=WEEKLY;INTERVAL=2", due, IST, early))).toBe(
      "2026-12-01T09:30:00.000",
    );
  });
  it("monthly keeps the day of month", () => {
    expect(ist(nextOccurrence("FREQ=MONTHLY", due, IST, early))).toBe("2026-12-17T09:30:00.000");
  });
  it("yearly", () => {
    expect(ist(nextOccurrence("FREQ=YEARLY", due, IST, early))).toBe("2027-11-17T09:30:00.000");
  });
  it("completing a week-old daily task jumps to the first occurrence after now", () => {
    const now = utc("2026-11-24T02:00:00Z"); // 24 Nov 07:30 IST, before 09:30
    expect(ist(nextOccurrence("FREQ=DAILY", due, IST, now))).toBe("2026-11-24T09:30:00.000");
    const later = utc("2026-11-24T06:00:00Z"); // after 09:30
    expect(ist(nextOccurrence("FREQ=DAILY", due, IST, later))).toBe("2026-11-25T09:30:00.000");
  });
  it("completing early never produces an occurrence at or before the current due date", () => {
    const next = nextOccurrence("FREQ=DAILY", due, IST, early);
    expect(next && next > due).toBe(true);
  });
  it("stops after endsAt", () => {
    expect(nextOccurrence("FREQ=DAILY", due, IST, early, utc("2026-11-17T20:00:00Z"))).toBeNull();
    expect(
      nextOccurrence("FREQ=DAILY", due, IST, early, utc("2026-11-30T00:00:00Z")),
    ).not.toBeNull();
  });
  it("keeps wall-clock time across a daylight-saving change", () => {
    // 9:00 New York on Sat 31 Oct 2026 (EDT, UTC-4) -> Sun 1 Nov (EST after fall-back, UTC-5)
    const before = utc("2026-10-31T13:00:00Z");
    const next = nextOccurrence("FREQ=DAILY", before, NY, utc("2026-10-31T12:00:00Z"));
    expect(next?.toISOString()).toBe("2026-11-01T14:00:00.000Z"); // still 9:00 local
    // and spring-forward: 9:00 on Sat 7 Mar 2026 (EST) -> Sun 8 Mar (EDT)
    const spring = nextOccurrence(
      "FREQ=DAILY",
      utc("2026-03-07T14:00:00Z"),
      NY,
      utc("2026-03-07T12:00:00Z"),
    );
    expect(spring?.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });
  it("monthly on the 31st skips months without a 31st", () => {
    const jan31 = utc("2026-01-31T04:00:00Z");
    expect(ist(nextOccurrence("FREQ=MONTHLY", jan31, IST, utc("2026-01-30T00:00:00Z")))).toBe(
      "2026-03-31T09:30:00.000",
    );
  });
  it("returns null for invalid rules", () => {
    expect(nextOccurrence("nope", due, IST, early)).toBeNull();
  });
  it("all-day tasks stay at local midnight", () => {
    const allDay = utc("2026-11-16T18:30:00Z"); // 17 Nov 00:00 IST
    expect(ist(nextOccurrence("FREQ=DAILY", allDay, IST, utc("2026-11-16T10:00:00Z")))).toBe(
      "2026-11-18T00:00:00.000",
    );
  });
});

describe("firstOccurrence", () => {
  const todayStart = utc("2026-11-16T18:30:00Z"); // Tue 17 Nov 00:00 IST
  it("daily starts today", () => {
    expect(ist(firstOccurrence("FREQ=DAILY", todayStart, IST))).toBe("2026-11-17T00:00:00.000");
  });
  it("weekdays from a Saturday land on Monday", () => {
    const sat = utc("2026-11-20T18:30:00Z"); // Sat 21 Nov 00:00 IST
    expect(ist(firstOccurrence("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", sat, IST))).toBe(
      "2026-11-23T00:00:00.000",
    );
  });
});
