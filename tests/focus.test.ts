import { describe, expect, it } from "vitest";
import { formatClock, phaseLengthMs } from "@/lib/focus";

describe("focus clock", () => {
  it("formats minutes and hours", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5000)).toBe("00:00");
    expect(formatClock(999)).toBe("00:00");
  });
  it("has 25/5 pomodoro phases", () => {
    expect(phaseLengthMs("work")).toBe(25 * 60_000);
    expect(phaseLengthMs("break")).toBe(5 * 60_000);
  });
});
