import { fromZonedTime } from "date-fns-tz";

export type CalendarMode = "month" | "week";

// Calendar dates are handled as plain `yyyy-MM-dd` keys and UTC arithmetic, so daylight-saving
// shifts and the server's own timezone never move a day.

const MS_DAY = 86_400_000;

export function keyToUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  return utcToKey(new Date(keyToUtc(key).getTime() + days * MS_DAY));
}

export function isValidKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcToKey(keyToUtc(value)) === value;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(key: string): number {
  return keyToUtc(key).getUTCDay();
}

export function startOfWeekKey(key: string, weekStartsOn: 0 | 1): string {
  const diff = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDaysKey(key, -diff);
}

export function firstOfMonthKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function shiftMonthKey(key: string, months: number): string {
  const d = keyToUtc(firstOfMonthKey(key));
  return utcToKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

/** The days a view shows: six full weeks for a month, one week otherwise. */
export function gridDays(mode: CalendarMode, anchor: string, weekStartsOn: 0 | 1): string[] {
  const start =
    mode === "month"
      ? startOfWeekKey(firstOfMonthKey(anchor), weekStartsOn)
      : startOfWeekKey(anchor, weekStartsOn);
  return Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) => addDaysKey(start, i));
}

/** Query range [from, to) covering every visible day, in the user's timezone. */
export function visibleRange(days: string[], timezone: string): { from: Date; to: Date } {
  return {
    from: fromZonedTime(`${days[0]}T00:00:00`, timezone),
    to: fromZonedTime(`${addDaysKey(days[days.length - 1], 1)}T00:00:00`, timezone),
  };
}

export function stepAnchor(mode: CalendarMode, anchor: string, direction: 1 | -1): string {
  return mode === "month" ? shiftMonthKey(anchor, direction) : addDaysKey(anchor, direction * 7);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function titleFor(mode: CalendarMode, anchor: string, weekStartsOn: 0 | 1): string {
  if (mode === "month") {
    const d = keyToUtc(anchor);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const start = keyToUtc(startOfWeekKey(anchor, weekStartsOn));
  const end = keyToUtc(addDaysKey(startOfWeekKey(anchor, weekStartsOn), 6));
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const left = `${start.getUTCDate()}${sameMonth ? "" : ` ${MONTHS_SHORT[start.getUTCMonth()]}`}`;
  return `${left} – ${end.getUTCDate()} ${MONTHS_SHORT[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

export function dayLabel(key: string): string {
  const d = keyToUtc(key);
  return `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function weekdayHeaders(weekStartsOn: 0 | 1): string[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, i) => names[(weekStartsOn + i) % 7]);
}
