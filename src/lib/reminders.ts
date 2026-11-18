import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { dayKey, dayRange } from "@/lib/dates";
import { DEFAULT_SOUND_PREFS, type SoundPrefs } from "@/lib/sound";

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface ReminderPrefs {
  /** Minutes before the due time for timed tasks. `null` = no automatic reminder. */
  defaultOffsetMin: number | null;
  quietHours: QuietHours;
  morningSummary: boolean;
  sound: SoundPrefs;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  defaultOffsetMin: 15,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  morningSummary: false,
  sound: DEFAULT_SOUND_PREFS,
};

export const REMINDER_PRESETS = [
  { offsetMin: 0, label: "At due time" },
  { offsetMin: 15, label: "15 minutes before" },
  { offsetMin: 60, label: "1 hour before" },
  { offsetMin: 1440, label: "1 day before" },
] as const;

export const MAX_REMINDERS_PER_TASK = 5;
export const MAX_OFFSET_MIN = 7 * 24 * 60;

/** The moment offsets count from. All-day tasks use the start of the user's work hours. */
export function reminderBase(
  due: Date,
  allDay: boolean,
  timezone: string,
  workStart: string,
): Date {
  if (!allDay) return due;
  return fromZonedTime(`${dayKey(due, timezone)}T${workStart}:00`, timezone);
}

export function reminderAt(
  due: Date,
  allDay: boolean,
  timezone: string,
  workStart: string,
  offsetMin: number,
): Date {
  return new Date(reminderBase(due, allDay, timezone, workStart).getTime() - offsetMin * 60_000);
}

export type SnoozeKind = "10m" | "1h" | "tomorrow";

export function snoozeTarget(
  kind: SnoozeKind,
  now: Date,
  timezone: string,
  workStart: string,
): Date {
  if (kind === "10m") return new Date(now.getTime() + 10 * 60_000);
  if (kind === "1h") return new Date(now.getTime() + 60 * 60_000);
  const tomorrow = dayRange(now, timezone, 1).start;
  return fromZonedTime(`${dayKey(tomorrow, timezone)}T${workStart}:00`, timezone);
}

export function inQuietHours(now: Date, timezone: string, quiet: QuietHours): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const t = formatInTimeZone(now, timezone, "HH:mm");
  return quiet.start < quiet.end
    ? t >= quiet.start && t < quiet.end
    : t >= quiet.start || t < quiet.end; // wraps past midnight
}

export function describeOffset(offsetMin: number | null): string {
  if (offsetMin === null) return "Custom time";
  if (offsetMin === 0) return "At due time";
  if (offsetMin % 1440 === 0) {
    const d = offsetMin / 1440;
    return `${d} day${d === 1 ? "" : "s"} before`;
  }
  if (offsetMin % 60 === 0) {
    const h = offsetMin / 60;
    return `${h} hour${h === 1 ? "" : "s"} before`;
  }
  return `${offsetMin} minutes before`;
}

/** `remind:15m`, `remind:2h`, `remind:1d` -> minutes. */
export function parseOffsetToken(value: string): number | null {
  const m = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,4})(m|h|d)$/);
  if (!m) return null;
  const n = Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2] as "m" | "h" | "d"];
  return n <= MAX_OFFSET_MIN ? n : null;
}

export interface Schedulable {
  id: string;
  at: string;
}

/** Items whose time has come, and how long until the next one (null if none pending). */
export function partitionDue<T extends Schedulable>(
  items: T[],
  now: Date,
): { due: T[]; nextInMs: number | null } {
  const due: T[] = [];
  let nextAt: number | null = null;
  for (const item of items) {
    const at = new Date(item.at).getTime();
    if (at <= now.getTime()) due.push(item);
    else if (nextAt === null || at < nextAt) nextAt = at;
  }
  due.sort((a, b) => a.at.localeCompare(b.at));
  return { due, nextInMs: nextAt === null ? null : nextAt - now.getTime() };
}
