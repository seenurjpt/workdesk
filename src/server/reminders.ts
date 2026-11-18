import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { snoozeTarget, type SnoozeKind } from "@/lib/reminders";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import { countDueSummary, updateTaskWithNext, type UpdateResult } from "./tasks";
import { getUserSettings } from "./users";

const DAY_MS = 86_400_000;
/** How far ahead the scheduler keeps reminders in memory, and how far back "missed" looks. */
export const LOOKAHEAD_MS = 2 * DAY_MS;
export const LOOKBACK_MS = DAY_MS;
const MAX_ITEMS = 100;

export interface ReminderItem {
  /** `${taskId}:${reminderId}` */
  id: string;
  taskId: string;
  reminderId: string;
  title: string;
  at: string;
  sentAt: string | null;
  dueAt: string | null;
  allDay: boolean;
  projectName: string | null;
}

export interface ReminderBundle {
  /** Not yet due: the scheduler fires these. */
  pending: ReminderItem[];
  /** Due while the app was closed: announced once as a summary. */
  missed: ReminderItem[];
  /** Fired in the last 24h: shown in the bell. */
  recent: ReminderItem[];
  /** Only present when the morning summary is enabled. */
  summary: { dueToday: number; overdue: number } | null;
}

export const refId = (taskId: string, reminderId: string) => `${taskId}:${reminderId}`;

export async function getReminderBundle(userId: string, now = new Date()): Promise<ReminderBundle> {
  await connectDb();
  const from = new Date(now.getTime() - LOOKBACK_MS);
  const to = new Date(now.getTime() + LOOKAHEAD_MS);

  const [tasks, user] = await Promise.all([
    Task.find({
      userId: new Types.ObjectId(userId),
      deletedAt: null,
      status: { $ne: "done" },
      reminders: { $elemMatch: { at: { $gte: from, $lte: to }, dismissedAt: null } },
    })
      .select("title dueAt allDay projectId reminders")
      .limit(MAX_ITEMS)
      .lean(),
    getUserSettings(userId),
  ]);

  const projectIds = [
    ...new Set(
      tasks
        .map((t) => t.projectId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds }, userId: new Types.ObjectId(userId) })
        .select("name")
        .lean()
    : [];
  const projectName = new Map(projects.map((p) => [String(p._id), p.name]));

  const bundle: ReminderBundle = { pending: [], missed: [], recent: [], summary: null };
  for (const t of tasks) {
    for (const r of t.reminders ?? []) {
      if (r.dismissedAt || r.at < from || r.at > to) continue;
      const item: ReminderItem = {
        id: refId(String(t._id), String(r._id)),
        taskId: String(t._id),
        reminderId: String(r._id),
        title: t.title,
        at: r.at.toISOString(),
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        allDay: Boolean(t.allDay),
        projectName: t.projectId ? (projectName.get(String(t.projectId)) ?? null) : null,
      };
      if (!r.sentAt) (r.at > now ? bundle.pending : bundle.missed).push(item);
      else if (r.sentAt >= from) bundle.recent.push(item);
    }
  }
  bundle.pending.sort((a, b) => a.at.localeCompare(b.at));
  bundle.missed.sort((a, b) => a.at.localeCompare(b.at));
  bundle.recent.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  if (user?.reminderPrefs.morningSummary) {
    bundle.summary = await countDueSummary(userId, user.timezone, now);
  }
  return bundle;
}

/**
 * Marks reminders as notified. The conditional update is the dedupe point: when several tabs
 * or devices race, exactly one wins and only that one shows the notification.
 * Returns the ids this caller claimed.
 */
export async function claimReminders(
  userId: string,
  refs: { taskId: string; reminderId: string }[],
  now = new Date(),
): Promise<string[]> {
  await connectDb();
  const claimed: string[] = [];
  for (const { taskId, reminderId } of refs) {
    const res = await Task.updateOne(
      {
        _id: taskId,
        userId: new Types.ObjectId(userId),
        deletedAt: null,
        status: { $ne: "done" },
        reminders: { $elemMatch: { _id: reminderId, sentAt: null } },
      },
      { $set: { "reminders.$.sentAt": now } },
    );
    if (res.modifiedCount === 1) claimed.push(refId(taskId, reminderId));
  }
  return claimed;
}

/** Re-arms a reminder for later. It becomes a custom-time reminder so due-date edits don't move it. */
export async function snoozeReminder(
  userId: string,
  taskId: string,
  reminderId: string,
  kind: SnoozeKind,
  now = new Date(),
): Promise<boolean> {
  await connectDb();
  const user = await getUserSettings(userId);
  if (!user) return false;
  const at = snoozeTarget(kind, now, user.timezone, user.workHours.start);
  const res = await Task.updateOne(
    {
      _id: taskId,
      userId: new Types.ObjectId(userId),
      deletedAt: null,
      "reminders._id": reminderId,
    },
    {
      $set: { "reminders.$.at": at, "reminders.$.offsetMin": null },
      $unset: { "reminders.$.sentAt": 1, "reminders.$.dismissedAt": 1 },
    },
  );
  return res.modifiedCount === 1;
}

export async function dismissReminder(
  userId: string,
  taskId: string,
  reminderId: string,
  now = new Date(),
): Promise<boolean> {
  await connectDb();
  const res = await Task.updateOne(
    {
      _id: taskId,
      userId: new Types.ObjectId(userId),
      deletedAt: null,
      "reminders._id": reminderId,
    },
    { $set: { "reminders.$.dismissedAt": now, "reminders.$.sentAt": now } },
  );
  return res.modifiedCount === 1;
}

export type ReminderAction = "snooze10" | "snooze60" | "tomorrow" | "done" | "dismiss";

/** One entry point for notification buttons, the bell and the service worker. */
export async function applyReminderAction(
  userId: string,
  input: { taskId: string; reminderId: string; action: ReminderAction },
  now = new Date(),
): Promise<{ ok: boolean; result?: UpdateResult }> {
  const { taskId, reminderId, action } = input;
  switch (action) {
    case "snooze10":
      return { ok: await snoozeReminder(userId, taskId, reminderId, "10m", now) };
    case "snooze60":
      return { ok: await snoozeReminder(userId, taskId, reminderId, "1h", now) };
    case "tomorrow":
      return { ok: await snoozeReminder(userId, taskId, reminderId, "tomorrow", now) };
    case "dismiss":
      return { ok: await dismissReminder(userId, taskId, reminderId, now) };
    case "done": {
      const result = await updateTaskWithNext(userId, taskId, { status: "done" }, now);
      return { ok: Boolean(result), result: result ?? undefined };
    }
  }
}
export type { SnoozeKind };
