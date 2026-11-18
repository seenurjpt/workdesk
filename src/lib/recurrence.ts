import { RRule, type Options } from "rrule";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type RepeatFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RepeatConfig {
  freq: RepeatFreq;
  interval: number;
  /** Only used for WEEKLY. Empty means "same weekday as the due date". */
  byWeekday: WeekdayCode[];
}

const FREQ_BY_RRULE: Record<number, RepeatFreq | undefined> = {
  [RRule.DAILY]: "DAILY",
  [RRule.WEEKLY]: "WEEKLY",
  [RRule.MONTHLY]: "MONTHLY",
  [RRule.YEARLY]: "YEARLY",
};

export const WEEKDAYS_RRULE = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";

export function buildRrule({ freq, interval, byWeekday }: RepeatConfig): string {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === "WEEKLY" && byWeekday.length > 0) {
    const ordered = WEEKDAY_CODES.filter((d) => byWeekday.includes(d));
    parts.push(`BYDAY=${ordered.join(",")}`);
  }
  return parts.join(";");
}

function parse(rrule: string): Partial<Options> | null {
  try {
    return RRule.parseString(rrule);
  } catch {
    return null;
  }
}

/**
 * Only simple rules are supported: daily/weekly/monthly/yearly with an interval and optional
 * weekdays. End dates are stored separately (`endsAt`), so COUNT and UNTIL are rejected.
 */
export function validateRrule(rrule: string): boolean {
  if (rrule.length > 200 || /\b(COUNT|UNTIL|DTSTART)\b/i.test(rrule)) return false;
  const o = parse(rrule);
  if (!o || o.freq === undefined || FREQ_BY_RRULE[o.freq] === undefined) return false;
  if (o.interval !== undefined && (o.interval < 1 || o.interval > 365)) return false;
  return true;
}

export function parseRrule(rrule: string): RepeatConfig | null {
  if (!validateRrule(rrule)) return null;
  const o = parse(rrule) as Partial<Options>;
  const freq = FREQ_BY_RRULE[o.freq as number] as RepeatFreq;
  const byweekday =
    o.byweekday === undefined ? [] : Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday];
  const byWeekday = byweekday.flatMap((d) => {
    if (d === null || d === undefined) return [];
    const n =
      typeof d === "number"
        ? d
        : typeof d === "string"
          ? WEEKDAY_CODES.indexOf(d as WeekdayCode)
          : d.weekday;
    return n >= 0 && n < 7 ? [WEEKDAY_CODES[n]] : [];
  });
  return { freq, interval: o.interval ?? 1, byWeekday };
}

export function describeRrule(rrule: string): string {
  const cfg = parseRrule(rrule);
  if (!cfg) return "Repeats";
  const { freq, interval, byWeekday } = cfg;
  if (freq === "WEEKLY" && interval === 1 && byWeekday.join(",") === "MO,TU,WE,TH,FR")
    return "Every weekday";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[freq];
  const base = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  if (freq === "WEEKLY" && byWeekday.length > 0) {
    const names = byWeekday.map((d) => WEEKDAY_NAMES[WEEKDAY_CODES.indexOf(d)]);
    return interval === 1 && byWeekday.length === 1
      ? `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][WEEKDAY_CODES.indexOf(byWeekday[0])]}`
      : `${base} on ${names.join(", ")}`;
  }
  return base;
}

// ---- timezone-aware occurrence maths ----
// rrule works on "floating" dates (UTC fields = wall-clock). We convert a real instant to
// wall-clock in the user's timezone, run the rule there, and convert back. That keeps
// "9:00 every day" at 9:00 across daylight-saving changes.

function toFloating(date: Date, timezone: string): Date {
  const z = toZonedTime(date, timezone);
  return new Date(
    Date.UTC(
      z.getFullYear(),
      z.getMonth(),
      z.getDate(),
      z.getHours(),
      z.getMinutes(),
      z.getSeconds(),
    ),
  );
}

function fromFloating(floating: Date, timezone: string): Date {
  const wall = new Date(
    floating.getUTCFullYear(),
    floating.getUTCMonth(),
    floating.getUTCDate(),
    floating.getUTCHours(),
    floating.getUTCMinutes(),
    floating.getUTCSeconds(),
  );
  return fromZonedTime(wall, timezone);
}

function ruleFor(rrule: string, dtstart: Date): RRule | null {
  const o = parse(rrule);
  if (!o || !validateRrule(rrule)) return null;
  return new RRule({ ...o, dtstart });
}

/**
 * The next due date after completing an occurrence due at `due`.
 * If the task was completed late, the next occurrence is the first one after `now`,
 * so finishing a week-old daily task does not create a pile of past-due copies.
 */
export function nextOccurrence(
  rrule: string,
  due: Date,
  timezone: string,
  now: Date,
  endsAt?: Date | null,
): Date | null {
  const rule = ruleFor(rrule, toFloating(due, timezone));
  if (!rule) return null;
  const threshold = toFloating(due > now ? due : now, timezone);
  const next = rule.after(threshold, false);
  if (!next) return null;
  const result = fromFloating(next, timezone);
  return endsAt && result > endsAt ? null : result;
}

/** First occurrence on or after `from` (used when a repeating task is created without a date). */
export function firstOccurrence(rrule: string, from: Date, timezone: string): Date | null {
  const floating = toFloating(from, timezone);
  const rule = ruleFor(rrule, floating);
  const first = rule?.after(floating, true);
  return first ? fromFloating(first, timezone) : null;
}
