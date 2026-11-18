import { fromZonedTime, toZonedTime } from "date-fns-tz";

export interface DayRange {
  start: Date;
  end: Date;
}

/** Start (inclusive) and end (exclusive) of the user's local day, `offsetDays` from `now`. */
export function dayRange(now: Date, timezone: string, offsetDays = 0): DayRange {
  const zoned = toZonedTime(now, timezone);
  zoned.setHours(0, 0, 0, 0);
  zoned.setDate(zoned.getDate() + offsetDays);
  const start = fromZonedTime(zoned, timezone);
  zoned.setDate(zoned.getDate() + 1);
  const end = fromZonedTime(zoned, timezone);
  return { start, end };
}

/** yyyy-MM-dd key for a date as seen in the user's timezone. */
export function dayKey(date: Date, timezone: string): string {
  const z = toZonedTime(date, timezone);
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${z.getFullYear()}-${m}-${d}`;
}

/** Timed tasks are overdue once past; all-day tasks only after their day has ended. */
export function isOverdue(dueAt: Date, allDay: boolean, now: Date, timezone: string): boolean {
  return allDay ? dueAt < dayRange(now, timezone, 0).start : dueAt < now;
}
