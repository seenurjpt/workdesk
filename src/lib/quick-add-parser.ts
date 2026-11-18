import * as chrono from "chrono-node";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { parseOffsetToken } from "@/lib/reminders";

export type Priority = 1 | 2 | 3 | 4;

export interface QuickAddResult {
  title: string;
  projectName?: string;
  tags: string[];
  priority?: Priority;
  dueAt?: Date;
  allDay: boolean;
  /** True when the text named a day ("tomorrow", "friday", "25 dec"), not just a time ("5pm"). */
  dateExplicit: boolean;
  recurrence?: { rrule: string; label: string };
  waitingOn?: { person: string };
  /** From `remind:15m` — minutes before the due time. */
  remindOffsetMin?: number;
}

export interface QuickAddOptions {
  timezone: string;
  now?: Date;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  p1: 1,
  urgent: 1,
  p2: 2,
  high: 2,
  p3: 3,
  medium: 3,
  p4: 4,
  low: 4,
};

const WEEKDAYS: Record<string, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
};

function removeMatch(text: string, match: RegExpMatchArray): string {
  const idx = match.index ?? 0;
  return `${text.slice(0, idx)} ${text.slice(idx + match[0].length)}`;
}

function extractRecurrence(text: string): {
  text: string;
  recurrence?: QuickAddResult["recurrence"];
  weekday?: string;
} {
  const re =
    /(^|\s)every\s+(weekday|day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const m = text.match(re);
  if (!m) return { text };
  const unit = m[2].toLowerCase();
  const rest = removeMatch(text, m);
  if (unit in WEEKDAYS) {
    return {
      text: rest,
      weekday: unit,
      recurrence: { rrule: `FREQ=WEEKLY;BYDAY=${WEEKDAYS[unit]}`, label: `Every ${unit}` },
    };
  }
  const table: Record<string, { rrule: string; label: string }> = {
    weekday: { rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday" },
    day: { rrule: "FREQ=DAILY", label: "Every day" },
    week: { rrule: "FREQ=WEEKLY", label: "Every week" },
    month: { rrule: "FREQ=MONTHLY", label: "Every month" },
  };
  return { text: rest, recurrence: table[unit] };
}

export function parseQuickAdd(input: string, options: QuickAddOptions): QuickAddResult {
  const now = options.now ?? new Date();
  let text = ` ${input} `;

  const tags: string[] = [];
  let projectName: string | undefined;
  let priority: Priority | undefined;
  let waitingOn: QuickAddResult["waitingOn"];

  // wait:<person> (quoted or single word)
  const waitMatch = text.match(/(^|\s)wait:(?:"([^"]+)"|([^\s]+))/i);
  if (waitMatch) {
    waitingOn = { person: (waitMatch[2] ?? waitMatch[3]).replace(/[_]/g, " ") };
    text = removeMatch(text, waitMatch);
  }

  // remind:15m / remind:2h / remind:1d
  let remindOffsetMin: number | undefined;
  const remindMatch = text.match(/(^|\s)remind:(\w+)/i);
  if (remindMatch) {
    const minutes = parseOffsetToken(remindMatch[2]);
    if (minutes !== null) {
      remindOffsetMin = minutes;
      text = removeMatch(text, remindMatch);
    }
  }

  // !priority
  const prioRe = /(^|\s)!(p[1-4]|urgent|high|medium|low)\b/gi;
  for (const m of [...text.matchAll(prioRe)]) {
    priority ??= PRIORITY_WORDS[m[2].toLowerCase()];
  }
  text = text.replace(prioRe, " ");

  // #project (first wins)
  const projRe = /(^|\s)#([\p{L}\p{M}\p{N}_-]+)/gu;
  for (const m of [...text.matchAll(projRe)]) {
    projectName ??= m[2];
  }
  text = text.replace(projRe, " ");

  // @tag
  const tagRe = /(^|\s)@([\p{L}\p{M}\p{N}_-]+)/gu;
  for (const m of [...text.matchAll(tagRe)]) {
    const tag = m[2].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  text = text.replace(tagRe, " ");

  // recurrence
  const rec = extractRecurrence(text);
  text = rec.text;

  // date/time
  let dueAt: Date | undefined;
  let allDay = false;
  let dateExplicit = false;
  const reference = { instant: now, timezone: options.timezone };
  const results = chrono.parse(text, reference, { forwardDate: true });
  const first = results[0];
  if (first) {
    const hasTime = first.start.isCertain("hour");
    dateExplicit = ["day", "weekday", "month"].some((c) => first.start.isCertain(c as "day"));
    allDay = !hasTime;
    const d = first.start.date();
    if (hasTime) {
      dueAt = d;
    } else {
      const zoned = toZonedTime(d, options.timezone);
      zoned.setHours(0, 0, 0, 0);
      dueAt = fromZonedTime(zoned, options.timezone);
    }
    text = `${text.slice(0, first.index)} ${text.slice(first.index + first.text.length)}`;
  } else if (rec.weekday) {
    const d = chrono.parseDate(rec.weekday, reference, { forwardDate: true });
    if (d) {
      const zoned = toZonedTime(d, options.timezone);
      zoned.setHours(0, 0, 0, 0);
      dueAt = fromZonedTime(zoned, options.timezone);
      allDay = true;
      dateExplicit = true;
    }
  }

  const title = text.replace(/\s+/g, " ").trim();
  return {
    title,
    projectName,
    tags,
    priority,
    dueAt,
    allDay,
    dateExplicit,
    recurrence: rec.recurrence,
    waitingOn,
    remindOffsetMin,
  };
}
