import { describe, expect, it } from "vitest";
import {
  describeOffset,
  inQuietHours,
  parseOffsetToken,
  partitionDue,
  reminderAt,
  reminderBase,
  snoozeTarget,
} from "@/lib/reminders";

const TZ = "Asia/Kolkata";
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("Z", "");
const NOW = new Date("2026-11-17T04:30:00Z"); // Tue 17 Nov 10:00 IST

describe("reminder times", () => {
  it("timed tasks count from the due time", () => {
    const due = new Date("2026-11-17T09:00:00Z"); // 14:30 IST
    expect(ist(reminderAt(due, false, TZ, "09:30", 15))).toBe("2026-11-17T14:15:00.000");
    expect(ist(reminderAt(due, false, TZ, "09:30", 0))).toBe("2026-11-17T14:30:00.000");
    expect(ist(reminderAt(due, false, TZ, "09:30", 1440))).toBe("2026-11-16T14:30:00.000");
  });
  it("all-day tasks count from the start of work hours on the due day", () => {
    const dueMidnight = new Date("2026-11-17T18:30:00Z"); // Wed 18 Nov 00:00 IST
    expect(ist(reminderBase(dueMidnight, true, TZ, "09:30"))).toBe("2026-11-18T09:30:00.000");
    expect(ist(reminderAt(dueMidnight, true, TZ, "09:30", 1440))).toBe("2026-11-17T09:30:00.000");
  });
});

describe("snooze", () => {
  it("10 minutes and 1 hour", () => {
    expect(snoozeTarget("10m", NOW, TZ, "09:30").getTime() - NOW.getTime()).toBe(10 * 60_000);
    expect(snoozeTarget("1h", NOW, TZ, "09:30").getTime() - NOW.getTime()).toBe(60 * 60_000);
  });
  it("tomorrow means the start of work hours tomorrow, in the user's timezone", () => {
    expect(ist(snoozeTarget("tomorrow", NOW, TZ, "09:30"))).toBe("2026-11-18T09:30:00.000");
    // 00:10 IST on the 18th is still "the 18th" locally, so tomorrow is the 19th
    const lateNight = new Date("2026-11-17T18:40:00Z");
    expect(ist(snoozeTarget("tomorrow", lateNight, TZ, "09:30"))).toBe("2026-11-19T09:30:00.000");
  });
});

describe("quiet hours", () => {
  const quiet = { enabled: true, start: "22:00", end: "07:00" };
  const at = (hhmmIst: string) => new Date(`2026-11-17T${hhmmIst}:00+05:30`);
  it("handles a window that wraps past midnight", () => {
    expect(inQuietHours(at("23:00"), TZ, quiet)).toBe(true);
    expect(inQuietHours(at("03:00"), TZ, quiet)).toBe(true);
    expect(inQuietHours(at("07:00"), TZ, quiet)).toBe(false);
    expect(inQuietHours(at("12:00"), TZ, quiet)).toBe(false);
    expect(inQuietHours(at("22:00"), TZ, quiet)).toBe(true);
  });
  it("handles a same-day window", () => {
    const lunch = { enabled: true, start: "13:00", end: "14:00" };
    expect(inQuietHours(at("13:30"), TZ, lunch)).toBe(true);
    expect(inQuietHours(at("14:00"), TZ, lunch)).toBe(false);
  });
  it("is off when disabled or empty", () => {
    expect(inQuietHours(at("23:00"), TZ, { ...quiet, enabled: false })).toBe(false);
    expect(inQuietHours(at("23:00"), TZ, { enabled: true, start: "10:00", end: "10:00" })).toBe(
      false,
    );
  });
});

describe("labels and tokens", () => {
  it("describes offsets", () => {
    expect(describeOffset(0)).toBe("At due time");
    expect(describeOffset(15)).toBe("15 minutes before");
    expect(describeOffset(60)).toBe("1 hour before");
    expect(describeOffset(120)).toBe("2 hours before");
    expect(describeOffset(1440)).toBe("1 day before");
    expect(describeOffset(null)).toBe("Custom time");
  });
  it("parses remind tokens", () => {
    expect(parseOffsetToken("15m")).toBe(15);
    expect(parseOffsetToken("2h")).toBe(120);
    expect(parseOffsetToken("1d")).toBe(1440);
    expect(parseOffsetToken("8d")).toBeNull();
    expect(parseOffsetToken("abc")).toBeNull();
    expect(parseOffsetToken("")).toBeNull();
  });
});

describe("partitionDue", () => {
  const items = [
    { id: "a", at: "2026-11-17T04:00:00.000Z" },
    { id: "b", at: "2026-11-17T04:30:00.000Z" },
    { id: "c", at: "2026-11-17T05:00:00.000Z" },
    { id: "d", at: "2026-11-17T06:00:00.000Z" },
  ];
  it("splits due from pending and reports the wait for the next", () => {
    const { due, nextInMs } = partitionDue(items, NOW);
    expect(due.map((i) => i.id)).toEqual(["a", "b"]);
    expect(nextInMs).toBe(30 * 60_000);
  });
  it("reports null when nothing is pending", () => {
    expect(partitionDue(items.slice(0, 2), NOW).nextInMs).toBeNull();
    expect(partitionDue([], NOW)).toEqual({ due: [], nextInMs: null });
  });
});
