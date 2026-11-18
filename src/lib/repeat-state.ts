import { formatInTimeZone } from "date-fns-tz";
import {
  buildRrule,
  parseRrule,
  WEEKDAYS_RRULE,
  type RepeatFreq,
  type WeekdayCode,
} from "@/lib/recurrence";
import { parseLocalInput } from "@/lib/format";

export type RepeatMode = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

export interface RepeatState {
  mode: RepeatMode;
  interval: number;
  freq: RepeatFreq;
  weekdays: WeekdayCode[];
  /** yyyy-MM-dd in the user's timezone, or "" for "never". */
  endsOn: string;
}

export const NO_REPEAT: RepeatState = {
  mode: "none",
  interval: 1,
  freq: "WEEKLY",
  weekdays: [],
  endsOn: "",
};

export function repeatFromTask(
  recurrence: { rrule: string; endsAt: string | null } | null,
  timezone: string,
): RepeatState {
  if (!recurrence) return NO_REPEAT;
  const cfg = parseRrule(recurrence.rrule);
  const endsOn = recurrence.endsAt
    ? formatInTimeZone(new Date(recurrence.endsAt), timezone, "yyyy-MM-dd")
    : "";
  if (!cfg) return { ...NO_REPEAT, mode: "custom", endsOn };
  const { freq, interval, byWeekday } = cfg;
  const base = { interval, freq, weekdays: byWeekday, endsOn };
  if (recurrence.rrule === WEEKDAYS_RRULE) return { ...base, mode: "weekdays", interval: 1 };
  if (freq === "DAILY" && interval === 1) return { ...base, mode: "daily" };
  if (freq === "WEEKLY" && interval === 1 && byWeekday.length <= 1)
    return { ...base, mode: "weekly" };
  if (freq === "MONTHLY" && interval === 1) return { ...base, mode: "monthly" };
  return { ...base, mode: "custom" };
}

export function repeatToRrule(state: RepeatState): string | null {
  switch (state.mode) {
    case "none":
      return null;
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return WEEKDAYS_RRULE;
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "custom":
      return buildRrule({
        freq: state.freq,
        interval: Math.max(1, Math.min(365, Math.floor(state.interval) || 1)),
        byWeekday: state.freq === "WEEKLY" ? state.weekdays : [],
      });
  }
}

/** End of the chosen day in the user's timezone, so the final occurrence on that day still counts. */
export function repeatEndsAt(state: RepeatState, timezone: string): Date | null {
  return state.endsOn ? parseLocalInput(state.endsOn, "23:59", timezone) : null;
}
