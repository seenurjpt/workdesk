import { Types } from "mongoose";
import { MAX_REMINDERS_PER_TASK, reminderAt } from "@/lib/reminders";
import type { UserSettingsDTO } from "@/lib/types";

export interface ReminderDoc {
  _id?: Types.ObjectId;
  at: Date;
  offsetMin: number | null;
  sentAt?: Date | null;
  dismissedAt?: Date | null;
}

export interface ReminderInput {
  id?: string;
  offsetMin: number | null;
  at?: Date;
}

export type ScheduleCtx = Pick<UserSettingsDTO, "timezone" | "workHours" | "reminderPrefs">;

/** Reminders in the past can no longer fire usefully; allow a minute of slack for clock skew. */
const isPast = (at: Date, now: Date) => at.getTime() < now.getTime() - 60_000;

function dedupeAndCap(list: ReminderDoc[]): ReminderDoc[] {
  const seen = new Set<number>();
  const out: ReminderDoc[] = [];
  for (const r of list.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (seen.has(r.at.getTime())) continue;
    seen.add(r.at.getTime());
    out.push(r);
  }
  return out.slice(0, MAX_REMINDERS_PER_TASK);
}

function atFor(
  offsetMin: number | null,
  custom: Date | undefined,
  due: Date | null,
  allDay: boolean,
  ctx: ScheduleCtx,
): Date | null {
  if (offsetMin === null) return custom ?? null;
  if (!due) return null; // relative reminders need a due date
  return reminderAt(due, allDay, ctx.timezone, ctx.workHours.start, offsetMin);
}

/** Applies a full reminder list from the editor, keeping "already notified" state where nothing changed. */
export function buildExplicitReminders(
  existing: ReminderDoc[],
  inputs: ReminderInput[],
  due: Date | null,
  allDay: boolean,
  ctx: ScheduleCtx,
  now: Date,
): ReminderDoc[] {
  const byId = new Map(existing.filter((r) => r._id).map((r) => [String(r._id), r]));
  const out: ReminderDoc[] = [];
  for (const input of inputs) {
    const at = atFor(input.offsetMin, input.at, due, allDay, ctx);
    if (!at) continue;
    const prev = input.id ? byId.get(input.id) : undefined;
    if (prev) {
      const unchanged = prev.at.getTime() === at.getTime();
      out.push({
        _id: prev._id,
        at,
        offsetMin: input.offsetMin,
        ...(unchanged ? { sentAt: prev.sentAt, dismissedAt: prev.dismissedAt } : {}),
      });
    } else if (!isPast(at, now)) {
      out.push({ at, offsetMin: input.offsetMin });
    }
  }
  return dedupeAndCap(out);
}

/** The due date or all-day flag changed: relative reminders move with it, custom ones stay put. */
export function rescheduleReminders(
  existing: ReminderDoc[],
  due: Date | null,
  allDay: boolean,
  ctx: ScheduleCtx,
  now: Date,
): ReminderDoc[] {
  const out: ReminderDoc[] = [];
  for (const r of existing) {
    if (r.offsetMin === null) {
      out.push(r);
      continue;
    }
    const at = atFor(r.offsetMin, undefined, due, allDay, ctx);
    if (!at || isPast(at, now)) continue;
    const unchanged = r.at.getTime() === at.getTime();
    out.push({
      _id: r._id,
      at,
      offsetMin: r.offsetMin,
      ...(unchanged ? { sentAt: r.sentAt, dismissedAt: r.dismissedAt } : {}),
    });
  }
  return dedupeAndCap(out);
}

/** The automatic reminder for a freshly dated task: the user's default, or work-start for all-day. */
export function defaultReminders(
  due: Date | null,
  allDay: boolean,
  ctx: ScheduleCtx,
  now: Date,
): ReminderDoc[] {
  if (!due) return [];
  const offset = allDay ? 0 : ctx.reminderPrefs.defaultOffsetMin;
  if (offset === null) return [];
  if (allDay && ctx.reminderPrefs.defaultOffsetMin === null) return [];
  const at = reminderAt(due, allDay, ctx.timezone, ctx.workHours.start, offset);
  return at.getTime() > now.getTime() ? [{ at, offsetMin: offset }] : [];
}
