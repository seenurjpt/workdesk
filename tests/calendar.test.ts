import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  gridDays,
  isValidKey,
  shiftMonthKey,
  startOfWeekKey,
  stepAnchor,
  titleFor,
  visibleRange,
  weekdayHeaders,
} from "@/lib/calendar";

describe("calendar dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });
  it("validates keys", () => {
    expect(isValidKey("2026-11-17")).toBe(true);
    expect(isValidKey("2026-02-30")).toBe(false);
    expect(isValidKey("nope")).toBe(false);
    expect(isValidKey(undefined)).toBe(false);
  });
  it("finds the start of the week for Monday and Sunday weeks", () => {
    // 17 Nov 2026 is a Tuesday
    expect(startOfWeekKey("2026-11-17", 1)).toBe("2026-11-16");
    expect(startOfWeekKey("2026-11-17", 0)).toBe("2026-11-15");
    expect(startOfWeekKey("2026-11-15", 1)).toBe("2026-11-09"); // a Sunday belongs to the week before
  });
  it("shifts months", () => {
    expect(shiftMonthKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftMonthKey("2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftMonthKey("2026-01-15", -1)).toBe("2025-12-01");
  });
  it("builds a six-week month grid starting on the configured weekday", () => {
    const grid = gridDays("month", "2026-11-17", 1);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26"); // 1 Nov 2026 is a Sunday -> Monday-first grid starts 26 Oct
    expect(grid[41]).toBe("2026-12-06");
    expect(gridDays("month", "2026-11-17", 0)[0]).toBe("2026-11-01");
  });
  it("builds a seven-day week", () => {
    const week = gridDays("week", "2026-11-17", 1);
    expect(week[0]).toBe("2026-11-16");
    expect(week[6]).toBe("2026-11-22");
  });
  it("computes the query range in the user's timezone", () => {
    const { from, to } = visibleRange(["2026-11-16", "2026-11-17"], "Asia/Kolkata");
    expect(from.toISOString()).toBe("2026-11-15T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-11-17T18:30:00.000Z");
  });
  it("steps the anchor by month or week", () => {
    expect(stepAnchor("month", "2026-11-17", 1)).toBe("2026-12-01");
    expect(stepAnchor("month", "2026-11-17", -1)).toBe("2026-10-01");
    expect(stepAnchor("week", "2026-11-17", 1)).toBe("2026-11-24");
    expect(stepAnchor("week", "2026-11-17", -1)).toBe("2026-11-10");
  });
  it("labels", () => {
    expect(titleFor("month", "2026-11-17", 1)).toBe("November 2026");
    expect(titleFor("week", "2026-11-17", 1)).toBe("16 – 22 Nov 2026");
    expect(titleFor("week", "2026-11-26", 1)).toBe("23 – 29 Nov 2026");
    expect(titleFor("week", "2026-12-01", 1)).toBe("30 Nov – 6 Dec 2026");
    expect(weekdayHeaders(1)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(weekdayHeaders(0)[0]).toBe("Sun");
  });
});
