import { Types } from "mongoose";
import { assertStatus } from "./statuses";
import { connectDb } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { dayRange } from "@/lib/dates";
import { parseLocalInput } from "@/lib/format";
import { firstOccurrence, nextOccurrence } from "@/lib/recurrence";
import { parseQuickAdd } from "@/lib/quick-add-parser";
import { Task } from "@/models/Task";
import { Project } from "@/models/Project";
import type { MoveTaskInput, TaskInput, TaskUpdate } from "@/schemas";
import type { TaskDTO } from "@/lib/types";
import { toTaskDTO } from "./serialize";
import { extractAtlassianLinks } from "@/lib/url-links";
import { resolveLink } from "./attachments";
import { findOrCreateProjectByName } from "./projects";
import {
  buildExplicitReminders,
  defaultReminders,
  rescheduleReminders,
  type ScheduleCtx,
} from "./task-schedule";
import { stopIfRunningFor } from "./timer";
import { getUserSettings } from "./users";

const VIEW_LIMIT = 500;

export type TaskView =
  | { kind: "inbox" }
  | { kind: "general" }
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "upcoming" }
  | { kind: "overdue" }
  | { kind: "project"; projectId: string }
  | { kind: "tag"; tag: string };

function base(userId: string) {
  return { userId: new Types.ObjectId(userId), deletedAt: null };
}

const SORT = { dueAt: 1, priority: 1, order: 1, _id: 1 } as const;

/** The Mongo filter for a view. Shared by the lists and the tab counts so they can never disagree. */
function viewFilter(
  userId: string,
  view: TaskView,
  timezone: string,
  now: Date,
): Record<string, unknown> {
  const open = { ...base(userId), status: { $ne: "done" as const } };
  const today = dayRange(now, timezone, 0);
  switch (view.kind) {
    case "inbox":
      return { ...open, projectId: null, dueAt: null };
    case "general":
      return { ...open, projectId: null };
    case "all":
      return open;
    case "today":
      return { ...open, dueAt: { $ne: null, $lt: today.end } };
    case "upcoming":
      // tomorrow and the following two weeks: today's tasks live on the Today tab
      return { ...open, dueAt: { $gte: today.end, $lt: dayRange(now, timezone, 15).start } };
    case "overdue":
      return {
        ...open,
        $or: [
          { allDay: true, dueAt: { $lt: today.start } },
          { allDay: { $ne: true }, dueAt: { $lt: now } },
        ],
      };
    case "project":
      return { ...open, projectId: new Types.ObjectId(view.projectId) };
    case "tag":
      return { ...open, tags: view.tag.toLowerCase() };
  }
}

export async function listTasks(
  userId: string,
  view: TaskView,
  timezone: string,
  now = new Date(),
): Promise<TaskDTO[]> {
  await connectDb();
  const filter = viewFilter(userId, view, timezone, now);
  if (view.kind === "all") {
    // Mongo sorts missing dates first; everyone expects "no date" last, so fetch the two groups apart.
    const [dated, undated] = await Promise.all([
      Task.find({ ...filter, dueAt: { $ne: null } })
        .sort(SORT)
        .limit(VIEW_LIMIT)
        .lean(),
      Task.find({ ...filter, dueAt: null })
        .sort({ priority: 1, order: 1, _id: 1 })
        .limit(VIEW_LIMIT)
        .lean(),
    ]);
    return [...dated, ...undated].slice(0, VIEW_LIMIT).map(toTaskDTO);
  }
  const docs = await Task.find(filter).sort(SORT).limit(VIEW_LIMIT).lean();
  return docs.map(toTaskDTO);
}

export interface TabCounts {
  /** Every open task. */
  all: number;
  /** Open tasks due today. */
  today: number;
  /** Open tasks due from tomorrow, for two weeks. */
  upcoming: number;
  /** Open tasks past their due date. */
  overdue: number;
}

export async function countTabs(
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<TabCounts> {
  await connectDb();
  const today = dayRange(now, timezone, 0);
  // One round trip instead of four. Each facet reuses the same filter the lists use, so a tab's
  // count and its list can never disagree.
  const count = (match: Record<string, unknown>) => [{ $match: match }, { $count: "n" }];
  const [row] = await Task.aggregate<Record<keyof TabCounts, { n: number }[]>>([
    { $match: viewFilter(userId, { kind: "all" }, timezone, now) },
    {
      $facet: {
        all: [{ $count: "n" }],
        today: count({ dueAt: { $gte: today.start, $lt: today.end } }),
        upcoming: count(viewFilter(userId, { kind: "upcoming" }, timezone, now)),
        overdue: count(viewFilter(userId, { kind: "overdue" }, timezone, now)),
      },
    },
  ]);
  const n = (k: keyof TabCounts) => row?.[k]?.[0]?.n ?? 0;
  return { all: n("all"), today: n("today"), upcoming: n("upcoming"), overdue: n("overdue") };
}

export async function listCompletedToday(userId: string, timezone: string, now = new Date()) {
  await connectDb();
  const today = dayRange(now, timezone, 0);
  const docs = await Task.find({
    ...base(userId),
    status: "done",
    completedAt: { $gte: today.start, $lt: today.end },
  })
    .sort({ completedAt: -1 })
    .limit(100)
    .lean();
  return docs.map(toTaskDTO);
}

/** Open tasks worth pulling into today: unscheduled, plus high-priority tasks due soon. */
export async function listPlanSuggestions(userId: string, timezone: string, now = new Date()) {
  await connectDb();
  const today = dayRange(now, timezone, 0);
  const docs = await Task.find({
    ...base(userId),
    status: { $ne: "done" },
    $or: [
      { dueAt: null },
      { dueAt: { $gte: today.end, $lt: dayRange(now, timezone, 3).start }, priority: { $lte: 2 } },
    ],
  })
    .sort({ priority: 1, dueAt: 1, _id: 1 })
    .limit(5)
    .lean();
  return docs.map(toTaskDTO);
}

export async function getTask(userId: string, id: string): Promise<TaskDTO | null> {
  await connectDb();
  const doc = await Task.findOne({ _id: id, ...base(userId) }).lean();
  return doc ? toTaskDTO(doc) : null;
}

export async function listTagCounts(userId: string): Promise<{ tag: string; count: number }[]> {
  await connectDb();
  const rows = await Task.aggregate<{ _id: string; count: number }>([
    { $match: { ...base(userId), status: { $ne: "done" } } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 50 },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
}

async function assertOwnsProject(userId: string, projectId: string): Promise<void> {
  const ok = await Project.exists({ _id: projectId, userId: new Types.ObjectId(userId) });
  if (!ok) throw new Error("Project not found");
}

async function loadCtx(userId: string): Promise<ScheduleCtx> {
  const user = await getUserSettings(userId);
  if (!user) throw new Error("User not found");
  return user;
}

const NEEDS_DATE = "Pick a due date for repeating tasks";

export async function createTask(
  userId: string,
  input: TaskInput,
  now = new Date(),
): Promise<TaskDTO> {
  await connectDb();
  if (input.projectId) await assertOwnsProject(userId, input.projectId);
  if (input.status) await assertStatus(userId, input.status);
  if (input.recurrence && !input.dueAt) throw new Error(NEEDS_DATE);
  const ctx = input.dueAt || input.reminders ? await loadCtx(userId) : null;
  const allDay = input.allDay ?? false;
  const due = input.dueAt ?? null;
  const last = await Task.findOne(base(userId)).sort({ order: -1 }).select("order").lean();

  const reminders =
    ctx && input.reminders
      ? buildExplicitReminders([], input.reminders, due, allDay, ctx, now)
      : ctx
        ? defaultReminders(due, allDay, ctx, now)
        : [];

  const { recurrence, reminders: _r, ...rest } = input;
  void _r;
  const doc = await Task.create({
    ...rest,
    projectId: input.projectId ?? undefined,
    dueAt: input.dueAt ?? undefined,
    subtasks: input.subtasks?.map((s, i) => ({ title: s.title, done: s.done, order: i })),
    userId: new Types.ObjectId(userId),
    order: (last?.order ?? 0) + 1,
    reminders,
    remindersCustomized: Boolean(input.reminders),
    recurrence: recurrence
      ? {
          rrule: recurrence.rrule,
          timezone: ctx?.timezone ?? "UTC",
          endsAt: recurrence.endsAt ?? undefined,
        }
      : undefined,
    ...(input.status === "done" ? { completedAt: now } : {}),
  });
  return toTaskDTO(doc.toObject());
}

export async function quickAddTask(
  userId: string,
  text: string,
  timezone: string,
  now = new Date(),
  options: { dayKey?: string } = {},
): Promise<TaskDTO> {
  const { text: withoutLinks, urls } = extractAtlassianLinks(text);
  const parsed = parseQuickAdd(withoutLinks, { timezone, now });
  const links = await Promise.all(
    urls.slice(0, 5).map((u) => resolveLink(u.toString(), { fetchTitle: false })),
  );
  // a pasted issue link with no other words becomes the task title (e.g. "PROJ-123")
  if (!parsed.title && links[0]) parsed.title = links[0].title;
  if (!parsed.title) throw new Error("Add a title for the task");
  const project = parsed.projectName
    ? await findOrCreateProjectByName(userId, parsed.projectName)
    : null;
  await connectDb();
  const ctx = await loadCtx(userId);

  let dueAt = parsed.dueAt ?? null;
  let allDay = parsed.allDay;
  if (options.dayKey && (!dueAt || (!parsed.dateExplicit && !parsed.allDay))) {
    // A chosen calendar day wins unless the text names its own day. A bare time ("4pm") applies to it.
    const time = dueAt && !allDay ? formatInTimeZone(dueAt, timezone, "HH:mm") : undefined;
    dueAt = parseLocalInput(options.dayKey, time, timezone);
    allDay = !time;
  }
  if (!dueAt && parsed.recurrence) {
    dueAt = firstOccurrence(parsed.recurrence.rrule, dayRange(now, timezone, 0).start, timezone);
    allDay = true;
  }

  const reminders =
    parsed.remindOffsetMin !== undefined && dueAt
      ? buildExplicitReminders([], [{ offsetMin: parsed.remindOffsetMin }], dueAt, allDay, ctx, now)
      : defaultReminders(dueAt, allDay, ctx, now);

  const last = await Task.findOne(base(userId)).sort({ order: -1 }).select("order").lean();
  const doc = await Task.create({
    userId: new Types.ObjectId(userId),
    title: parsed.title.slice(0, 200),
    projectId: project ? new Types.ObjectId(project.id) : undefined,
    tags: parsed.tags.slice(0, 20),
    priority: parsed.priority ?? 4,
    dueAt: dueAt ?? undefined,
    allDay,
    recurrence: parsed.recurrence ? { rrule: parsed.recurrence.rrule, timezone } : undefined,
    waitingOn: parsed.waitingOn ? { person: parsed.waitingOn.person } : undefined,
    reminders,
    attachments: links,
    remindersCustomized: parsed.remindOffsetMin !== undefined,
    order: (last?.order ?? 0) + 1,
  });
  return toTaskDTO(doc.toObject());
}

type TaskLean = NonNullable<Awaited<ReturnType<typeof findLean>>>;
const findLean = (userId: string, id: string) => Task.findOne({ _id: id, ...base(userId) }).lean();

/**
 * Creates the next occurrence of a repeating task. Idempotent: the completed task records the
 * spawned id with a conditional update, so completing twice can never create two copies.
 */
async function spawnNextOccurrence(
  userId: string,
  done: TaskLean,
  ctx: ScheduleCtx,
  now: Date,
): Promise<TaskDTO | null> {
  const rec = done.recurrence;
  if (!rec?.rrule || !done.dueAt || done.recurrenceSpawnedId) return null;
  const next = nextOccurrence(rec.rrule, done.dueAt, rec.timezone ?? ctx.timezone, now, rec.endsAt);
  if (!next) return null;

  const newId = new Types.ObjectId();
  const claim = await Task.updateOne(
    { _id: done._id, ...base(userId), recurrenceSpawnedId: null },
    { $set: { recurrenceSpawnedId: newId } },
  );
  if (claim.modifiedCount !== 1) return null;

  const allDay = Boolean(done.allDay);
  const relative = (done.reminders ?? []).filter(
    (r) => r.offsetMin !== null && r.offsetMin !== undefined,
  );
  const reminders = rescheduleReminders(
    relative.map((r) => ({ at: r.at, offsetMin: r.offsetMin ?? null })),
    next,
    allDay,
    ctx,
    now,
  );
  try {
    const doc = await Task.create({
      _id: newId,
      userId: done.userId,
      projectId: done.projectId,
      title: done.title,
      description: done.description,
      status: "todo",
      priority: done.priority,
      dueAt: next,
      allDay,
      tags: done.tags,
      subtasks: (done.subtasks ?? []).map((s, i) => ({ title: s.title, done: false, order: i })),
      recurrence: { rrule: rec.rrule, timezone: rec.timezone ?? ctx.timezone, endsAt: rec.endsAt },
      recurrenceParentId: done.recurrenceParentId ?? done._id,
      reminders,
      remindersCustomized: done.remindersCustomized,
      order: done.order,
    });
    return toTaskDTO(doc.toObject());
  } catch (err) {
    await Task.updateOne({ _id: done._id }, { $unset: { recurrenceSpawnedId: 1 } });
    throw err;
  }
}

/** Reopening a repeating task removes the untouched next occurrence it created. */
async function retractSpawned(userId: string, reopened: TaskLean, now: Date): Promise<void> {
  if (!reopened.recurrenceSpawnedId) return;
  const res = await Task.updateOne(
    { _id: reopened.recurrenceSpawnedId, ...base(userId), status: { $ne: "done" } },
    { $set: { deletedAt: now } },
  );
  if (res.modifiedCount === 1) {
    await Task.updateOne({ _id: reopened._id }, { $unset: { recurrenceSpawnedId: 1 } });
  }
}

export type TaskPatch = TaskUpdate & { order?: number };
export interface UpdateResult {
  task: TaskDTO;
  /** The next occurrence created when a repeating task was completed. */
  next: TaskDTO | null;
}

export async function updateTaskWithNext(
  userId: string,
  id: string,
  patch: TaskPatch,
  now = new Date(),
): Promise<UpdateResult | null> {
  await connectDb();
  const existing = await findLean(userId, id);
  if (!existing) return null;
  if (patch.projectId) await assertOwnsProject(userId, patch.projectId);
  if (patch.status) await assertStatus(userId, patch.status);

  const dueChanged = patch.dueAt !== undefined || patch.allDay !== undefined;
  const dueAfter = patch.dueAt !== undefined ? patch.dueAt : (existing.dueAt ?? null);
  const allDayAfter = patch.allDay ?? Boolean(existing.allDay);
  const recurrenceAfter =
    patch.recurrence !== undefined
      ? patch.recurrence
      : existing.recurrence?.rrule
        ? existing.recurrence
        : null;
  if (recurrenceAfter && !dueAfter) throw new Error(NEEDS_DATE);

  const needsCtx =
    dueChanged ||
    patch.reminders !== undefined ||
    patch.recurrence !== undefined ||
    patch.status === "done";
  const ctx = needsCtx ? await loadCtx(userId) : null;

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  const assign = (key: string, value: unknown) => {
    if (value === null) $unset[key] = 1;
    else $set[key] = value;
  };

  if (patch.title !== undefined) $set.title = patch.title;
  if (patch.description !== undefined) assign("description", patch.description);
  if (patch.projectId !== undefined) assign("projectId", patch.projectId);
  if (patch.dueAt !== undefined) assign("dueAt", patch.dueAt);
  if (patch.allDay !== undefined) $set.allDay = patch.allDay;
  if (patch.priority !== undefined) $set.priority = patch.priority;
  if (patch.order !== undefined) $set.order = patch.order;
  if (patch.tags !== undefined) $set.tags = patch.tags;
  if (patch.subtasks !== undefined) {
    $set.subtasks = patch.subtasks.map((s, i) => ({
      ...(s.id && Types.ObjectId.isValid(s.id) ? { _id: new Types.ObjectId(s.id) } : {}),
      title: s.title,
      done: s.done,
      order: i,
    }));
  }
  if (patch.waitingOn !== undefined) {
    if (patch.waitingOn === null) $unset.waitingOn = 1;
    else {
      $set.waitingOn = {
        person: patch.waitingOn.person,
        followUpAt: patch.waitingOn.followUpAt ?? undefined,
        note: patch.waitingOn.note ?? undefined,
      };
    }
  }
  if (patch.recurrence !== undefined) {
    if (patch.recurrence === null) $unset.recurrence = 1;
    else {
      $set.recurrence = {
        rrule: patch.recurrence.rrule,
        timezone: ctx?.timezone ?? "UTC",
        endsAt: patch.recurrence.endsAt ?? undefined,
      };
    }
  }

  if (ctx) {
    const current = (existing.reminders ?? []).map((r) => ({
      _id: r._id,
      at: r.at,
      offsetMin: r.offsetMin ?? null,
      sentAt: r.sentAt,
      dismissedAt: r.dismissedAt,
    }));
    if (patch.reminders !== undefined) {
      $set.reminders = buildExplicitReminders(
        current,
        patch.reminders,
        dueAfter,
        allDayAfter,
        ctx,
        now,
      );
      $set.remindersCustomized = true;
    } else if (dueChanged) {
      let next = rescheduleReminders(current, dueAfter, allDayAfter, ctx, now);
      if (next.length === 0 && !existing.dueAt && dueAfter && !existing.remindersCustomized) {
        next = defaultReminders(dueAfter, allDayAfter, ctx, now);
      }
      $set.reminders = next;
    }
  }

  const reopening =
    patch.status !== undefined && patch.status !== "done" && existing.status === "done";
  const completing = patch.status === "done" && existing.status !== "done";
  if (patch.status !== undefined) {
    $set.status = patch.status;
    if (patch.status === "done")
      $set.completedAt = existing.completedAt && !completing ? existing.completedAt : now;
    else $unset.completedAt = 1;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!Object.keys(update).length) {
    const task = await getTask(userId, id);
    return task ? { task, next: null } : null;
  }

  const doc = await Task.findOneAndUpdate({ _id: id, ...base(userId) }, update, {
    returnDocument: "after",
  }).lean();
  if (!doc) return null;

  if (completing) await stopIfRunningFor(userId, id, now);
  let next: TaskDTO | null = null;
  if (completing && ctx) next = await spawnNextOccurrence(userId, doc, ctx, now);
  if (reopening) await retractSpawned(userId, doc, now);
  const fresh = next || reopening ? ((await findLean(userId, id)) ?? doc) : doc;
  return { task: toTaskDTO(fresh), next };
}

export async function updateTask(
  userId: string,
  id: string,
  patch: TaskPatch,
  now = new Date(),
): Promise<TaskDTO | null> {
  return (await updateTaskWithNext(userId, id, patch, now))?.task ?? null;
}

export async function setTaskDone(
  userId: string,
  id: string,
  done: boolean,
  now = new Date(),
): Promise<UpdateResult | null> {
  return updateTaskWithNext(userId, id, { status: done ? "done" : "todo" }, now);
}

export async function softDeleteTask(userId: string, id: string): Promise<boolean> {
  await connectDb();
  await stopIfRunningFor(userId, id);
  const res = await Task.updateOne(
    { _id: id, ...base(userId) },
    { $set: { deletedAt: new Date() } },
  );
  return res.modifiedCount === 1;
}

export async function restoreTask(userId: string, id: string): Promise<boolean> {
  await connectDb();
  const res = await Task.updateOne(
    { _id: id, userId: new Types.ObjectId(userId), deletedAt: { $ne: null } },
    { $unset: { deletedAt: 1 } },
  );
  return res.modifiedCount === 1;
}

/** Counts used by the optional morning summary notification. */
export async function countDueSummary(
  userId: string,
  timezone: string,
  now = new Date(),
): Promise<{ dueToday: number; overdue: number }> {
  await connectDb();
  const today = dayRange(now, timezone, 0);
  const open = { ...base(userId), status: { $ne: "done" as const } };
  const [dueToday, overdue] = await Promise.all([
    Task.countDocuments({ ...open, dueAt: { $gte: today.start, $lt: today.end } }),
    Task.countDocuments({
      ...open,
      $or: [
        { allDay: true, dueAt: { $lt: today.start } },
        { allDay: { $ne: true }, dueAt: { $lt: now } },
      ],
    }),
  ]);
  return { dueToday, overdue };
}

// ---- board ----

const BOARD_DONE_WINDOW_DAYS = 14;

export async function listBoardTasks(userId: string, now = new Date()): Promise<TaskDTO[]> {
  await connectDb();
  const since = new Date(now.getTime() - BOARD_DONE_WINDOW_DAYS * 86_400_000);
  const docs = await Task.find({
    ...base(userId),
    $or: [{ status: { $ne: "done" } }, { completedAt: { $gte: since } }],
  })
    .sort({ order: 1, _id: 1 })
    .limit(VIEW_LIMIT)
    .lean();
  return docs.map(toTaskDTO);
}

async function orderOf(userId: string, id: string | null): Promise<number | null> {
  if (!id) return null;
  const doc = await Task.findOne({ _id: id, ...base(userId) })
    .select("order")
    .lean();
  return doc ? (doc.order ?? 0) : null;
}

/** Spreads orders out again when repeated midpoints have run out of precision. */
async function renumber(userId: string): Promise<void> {
  const docs = await Task.find(base(userId)).sort({ order: 1, _id: 1 }).select("_id").lean();
  if (!docs.length) return;
  await Task.bulkWrite(
    docs.map((d, i) => ({
      updateOne: { filter: { _id: d._id }, update: { $set: { order: (i + 1) * 1000 } } },
    })),
  );
}

/** Moves a card to another column/position. Order uses midpoints between neighbours. */
export async function moveTask(
  userId: string,
  input: MoveTaskInput,
  now = new Date(),
): Promise<UpdateResult | null> {
  await connectDb();
  const exists = await Task.exists({ _id: input.taskId, ...base(userId) });
  if (!exists) return null;

  let prev = await orderOf(userId, input.prevId);
  let next = await orderOf(userId, input.nextId);
  if (prev !== null && next !== null && Math.abs(next - prev) < 1e-6) {
    await renumber(userId);
    prev = await orderOf(userId, input.prevId);
    next = await orderOf(userId, input.nextId);
  }
  let order: number | undefined;
  if (prev !== null && next !== null) order = (prev + next) / 2;
  else if (prev !== null) order = prev + 1000;
  else if (next !== null) order = next - 1000;

  const { column } = input;
  const patch: TaskPatch = {
    ...(order !== undefined ? { order } : {}),
    ...(column.kind === "status" ? { status: column.value } : {}),
    ...(column.kind === "project" ? { projectId: column.value } : {}),
    ...(column.kind === "priority" ? { priority: column.value } : {}),
  };
  return updateTaskWithNext(userId, input.taskId, patch, now);
}

// ---- calendar ----

const CALENDAR_LIMIT = 1000;

export async function listCalendarTasks(userId: string, from: Date, to: Date): Promise<TaskDTO[]> {
  await connectDb();
  const docs = await Task.find({ ...base(userId), dueAt: { $gte: from, $lt: to } })
    .sort({ dueAt: 1, priority: 1, _id: 1 })
    .limit(CALENDAR_LIMIT)
    .lean();
  return docs.map(toTaskDTO);
}

/** Moves a task to another day, keeping its time of day (all-day tasks stay all-day). */
export async function rescheduleTask(
  userId: string,
  id: string,
  dayKey: string,
  now = new Date(),
): Promise<UpdateResult | null> {
  await connectDb();
  const existing = await findLean(userId, id);
  if (!existing) return null;
  const ctx = await loadCtx(userId);
  const keepTime = existing.dueAt && !existing.allDay;
  const time = keepTime
    ? formatInTimeZone(existing.dueAt as Date, ctx.timezone, "HH:mm")
    : undefined;
  return updateTaskWithNext(
    userId,
    id,
    { dueAt: parseLocalInput(dayKey, time, ctx.timezone), allDay: !keepTime },
    now,
  );
}

export interface ViewData {
  tasks: TaskDTO[];
  completed: TaskDTO[];
  suggestions: TaskDTO[];
}

export async function getViewData(
  userId: string,
  view: TaskView,
  timezone: string,
  now = new Date(),
): Promise<ViewData> {
  const tasks = await listTasks(userId, view, timezone, now);
  if (view.kind !== "today") return { tasks, completed: [], suggestions: [] };
  const [completed, suggestions] = await Promise.all([
    listCompletedToday(userId, timezone, now),
    listPlanSuggestions(userId, timezone, now),
  ]);
  const inToday = new Set(tasks.map((t) => t.id));
  return { tasks, completed, suggestions: suggestions.filter((s) => !inToday.has(s.id)) };
}

/** Open tasks that belong to no project (dated or not): the "General" list. */
export async function countGeneralTasks(userId: string): Promise<number> {
  await connectDb();
  return Task.countDocuments({
    ...base(userId),
    status: { $ne: "done" as const },
    projectId: null,
  });
}

// ---- waiting on ----

/** Open tasks someone else is holding up, soonest follow-up first (no follow-up date last). */
export async function listWaiting(userId: string): Promise<TaskDTO[]> {
  await connectDb();
  const docs = await Task.find({
    ...base(userId),
    status: { $ne: "done" as const },
    "waitingOn.person": { $nin: [null, ""] },
  })
    .limit(VIEW_LIMIT)
    .lean();
  return docs.map(toTaskDTO).sort((a, b) => {
    const af = a.waitingOn?.followUpAt ?? "9999";
    const bf = b.waitingOn?.followUpAt ?? "9999";
    return af.localeCompare(bf) || a.priority - b.priority || a.id.localeCompare(b.id);
  });
}

/** Total tracked minutes across a project's tasks (finished ones included). */
export async function sumProjectMinutes(userId: string, projectId: string): Promise<number> {
  await connectDb();
  const rows = await Task.aggregate<{ total: number }>([
    { $match: { ...base(userId), projectId: new Types.ObjectId(projectId) } },
    { $group: { _id: null, total: { $sum: "$timeSpentMinutes" } } },
  ]);
  return rows[0]?.total ?? 0;
}
