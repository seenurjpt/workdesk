import { describe, expect, it } from "vitest";
import { NO_REPEAT, repeatEndsAt, repeatFromTask, repeatToRrule } from "@/lib/repeat-state";

const TZ = "Asia/Kolkata";
const from = (rrule: string, endsAt: string | null = null) => repeatFromTask({ rrule, endsAt }, TZ);

describe("repeat state", () => {
  it("maps stored rules to the preset the editor shows", () => {
    expect(from("FREQ=DAILY").mode).toBe("daily");
    expect(from("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR").mode).toBe("weekdays");
    expect(from("FREQ=WEEKLY").mode).toBe("weekly");
    expect(from("FREQ=WEEKLY;BYDAY=MO").mode).toBe("weekly"); // quick-add "every monday"
    expect(from("FREQ=MONTHLY").mode).toBe("monthly");
    expect(from("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE").mode).toBe("custom");
    expect(from("FREQ=DAILY;INTERVAL=3").mode).toBe("custom");
    expect(from("FREQ=YEARLY").mode).toBe("custom");
    expect(repeatFromTask(null, TZ)).toEqual(NO_REPEAT);
  });

  it("round-trips custom rules", () => {
    const s = from("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(s).toMatchObject({
      mode: "custom",
      freq: "WEEKLY",
      interval: 2,
      weekdays: ["MO", "WE"],
    });
    expect(repeatToRrule(s)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  });

  it("builds presets and clamps custom intervals", () => {
    expect(repeatToRrule({ ...NO_REPEAT, mode: "none" })).toBeNull();
    expect(repeatToRrule({ ...NO_REPEAT, mode: "weekdays" })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(repeatToRrule({ ...NO_REPEAT, mode: "custom", freq: "DAILY", interval: 0 })).toBe(
      "FREQ=DAILY",
    );
    expect(repeatToRrule({ ...NO_REPEAT, mode: "custom", freq: "DAILY", interval: 9999 })).toBe(
      "FREQ=DAILY;INTERVAL=365",
    );
    // weekdays only apply to weekly rules
    expect(
      repeatToRrule({
        ...NO_REPEAT,
        mode: "custom",
        freq: "MONTHLY",
        interval: 2,
        weekdays: ["MO"],
      }),
    ).toBe("FREQ=MONTHLY;INTERVAL=2");
  });

  it("converts the end date to the end of that day in the user's timezone", () => {
    const s = from("FREQ=DAILY", "2026-12-31T18:29:00.000Z"); // 23:59 IST on 31 Dec
    expect(s.endsOn).toBe("2026-12-31");
    expect(repeatEndsAt(s, TZ)?.toISOString()).toBe("2026-12-31T18:29:00.000Z");
    expect(repeatEndsAt(NO_REPEAT, TZ)).toBeNull();
  });
});
