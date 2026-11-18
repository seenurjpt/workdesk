import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { addDaysKey, startOfWeekKey, visibleRange } from "@/lib/calendar";
import { dayKey, dayRange } from "@/lib/dates";
import {
  buildDailyReview,
  buildWeeklyReview,
  type DailyReview,
  type WeeklyReview,
} from "@/lib/review";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";
import { toTaskDTO } from "./serialize";
import { rescheduleTask, type UpdateResult } from "./tasks";
import { getUserSettings } from "./users";
import { listProjects } from "./projects";

const uid = (userId: string) => new Types.ObjectId(userId);
const LIMIT = 300;

export async function getDailyReview(userId: string, now = new Date()): Promise<DailyReview> {
  await connectDb();
  const user = await getUserSettings(userId);
  if (!user) throw new Error("User not found");
  const today = dayRange(now, user.timezone, 0);
  const base = { userId: uid(userId), deletedAt: null };
  const [open, done] = await Promise.all([
    Task.find({ ...base, status: { $ne: "done" }, dueAt: { $ne: null, $lt: today.end } })
      .sort({ dueAt: 1 })
      .limit(LIMIT)
      .lean(),
    Task.find({ ...base, status: "done", completedAt: { $gte: today.start, $lt: today.end } })
      .limit(LIMIT)
      .lean(),
  ]);
  return buildDailyReview([...open, ...done].map(toTaskDTO), now, user.timezone);
}

/** Moves a task to tomorrow (or a chosen day), keeping its time of day. */
export async function carryOverTask(
  userId: string,
  taskId: string,
  to: "tomorrow" | string,
  now = new Date(),
): Promise<UpdateResult | null> {
  const user = await getUserSettings(userId);
  if (!user) return null;
  const key = to === "tomorrow" ? dayKey(dayRange(now, user.timezone, 1).start, user.timezone) : to;
  return rescheduleTask(userId, taskId, key, now);
}

export interface WeeklyData {
  review: WeeklyReview;
  weekStart: string;
  weekEndInclusive: string;
  prevWeek: string;
  nextWeek: string;
  isCurrentWeek: boolean;
}

export async function getWeeklyReview(
  userId: string,
  anchorKey?: string,
  now = new Date(),
): Promise<WeeklyData> {
  await connectDb();
  const user = await getUserSettings(userId);
  if (!user) throw new Error("User not found");
  const tz = user.timezone;
  const todayKey = dayKey(now, tz);
  const weekStart = startOfWeekKey(anchorKey ?? todayKey, user.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
  const { from, to } = visibleRange(days, tz);
  const base = { userId: uid(userId), deletedAt: null };

  const [dueDocs, doneDocs, notesCreated, minutes, projects] = await Promise.all([
    Task.find({ ...base, dueAt: { $gte: from, $lt: to } })
      .limit(LIMIT * 2)
      .lean(),
    Task.find({ ...base, completedAt: { $gte: from, $lt: to } })
      .limit(LIMIT * 2)
      .lean(),
    Note.countDocuments({ ...base, createdAt: { $gte: from, $lt: to } }),
    Task.aggregate<{ _id: Types.ObjectId | null; minutes: number }>([
      { $match: { ...base, timeEntries: { $elemMatch: { startedAt: { $gte: from, $lt: to } } } } },
      { $unwind: "$timeEntries" },
      { $match: { "timeEntries.startedAt": { $gte: from, $lt: to } } },
      { $group: { _id: "$projectId", minutes: { $sum: "$timeEntries.minutes" } } },
    ]),
    listProjects(userId, true),
  ]);

  const review = buildWeeklyReview({
    dueTasks: dueDocs.map(toTaskDTO),
    completedTasks: doneDocs.map(toTaskDTO),
    notesCreated,
    minutesByProject: minutes.map((m) => ({
      projectId: m._id ? String(m._id) : null,
      minutes: m.minutes,
    })),
    projects,
    now,
    timezone: tz,
  });
  return {
    review,
    weekStart,
    weekEndInclusive: days[6],
    prevWeek: addDaysKey(weekStart, -7),
    nextWeek: addDaysKey(weekStart, 7),
    isCurrentWeek: weekStart === startOfWeekKey(todayKey, user.weekStartsOn),
  };
}
