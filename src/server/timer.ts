import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { POMODORO_WORK_MIN } from "@/lib/focus";
import type { ActiveTimerDTO } from "@/lib/types";
import { Task } from "@/models/Task";
import { User, type UserDoc } from "@/models/User";

const MIN_COUNTED_MS = 30_000;
/** A forgotten timer must not log absurd hours. */
const STOPWATCH_CAP_MS = 12 * 3_600_000;
/** A Pomodoro work phase counts at most its own length: after that the break should have started. */
const POMODORO_CAP_MS = POMODORO_WORK_MIN * 60_000;

type Mode = "stopwatch" | "pomodoro";

const uid = (userId: string) => new Types.ObjectId(userId);

async function recordEntry(
  userId: string,
  taskId: Types.ObjectId,
  startedAt: Date,
  endedAt: Date,
  cap: number,
): Promise<number> {
  const ms = Math.min(Math.max(0, endedAt.getTime() - startedAt.getTime()), cap);
  if (ms < MIN_COUNTED_MS) return 0;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  await Task.updateOne(
    { _id: taskId, userId: uid(userId) },
    {
      $push: {
        timeEntries: { startedAt, endedAt: new Date(startedAt.getTime() + ms), minutes },
      },
      $inc: { timeSpentMinutes: minutes },
    },
  );
  return minutes;
}

export async function getActiveTimer(
  userId: string,
  /** The already-loaded user record, to skip another read. */
  preloaded?: { activeTimer?: UserDoc["activeTimer"] } | null,
): Promise<ActiveTimerDTO | null> {
  await connectDb();
  const user = preloaded ?? (await User.findById(userId).select("activeTimer").lean());
  const t = user?.activeTimer;
  if (!t?.taskId || !t.mode || !t.phaseStartedAt || !t.startedAt) return null;
  const task = await Task.findOne({ _id: t.taskId, userId: uid(userId), deletedAt: null })
    .select("title")
    .lean();
  if (!task) return null;
  return {
    taskId: String(t.taskId),
    taskTitle: task.title,
    mode: t.mode,
    phase: t.phase === "break" ? "break" : "work",
    phaseStartedAt: t.phaseStartedAt.toISOString(),
    startedAt: t.startedAt.toISOString(),
  };
}

/** Logs the work done so far by the running timer. Returns minutes recorded. */
async function settle(
  userId: string,
  now: Date,
): Promise<{ minutes: number; taskId: string | null }> {
  const user = await User.findById(userId).select("activeTimer").lean();
  const t = user?.activeTimer;
  if (!t?.taskId || !t.phaseStartedAt) return { minutes: 0, taskId: null };
  let minutes = 0;
  if (t.phase !== "break") {
    const cap = t.mode === "pomodoro" ? POMODORO_CAP_MS : STOPWATCH_CAP_MS;
    minutes = await recordEntry(userId, t.taskId, t.phaseStartedAt, now, cap);
  }
  return { minutes, taskId: String(t.taskId) };
}

/** Only one timer runs at a time: starting a new one logs and replaces the old one. */
export async function startTimer(
  userId: string,
  taskId: string,
  mode: Mode,
  now = new Date(),
): Promise<ActiveTimerDTO | null> {
  await connectDb();
  const task = await Task.findOne({
    _id: taskId,
    userId: uid(userId),
    deletedAt: null,
    status: { $ne: "done" },
  })
    .select("_id")
    .lean();
  if (!task) throw new Error("Task not found");
  await settle(userId, now);
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        activeTimer: { taskId: task._id, mode, phase: "work", phaseStartedAt: now, startedAt: now },
      },
    },
  );
  return getActiveTimer(userId);
}

export async function stopTimer(
  userId: string,
  now = new Date(),
): Promise<{ minutes: number; taskId: string } | null> {
  await connectDb();
  const { minutes, taskId } = await settle(userId, now);
  if (!taskId) return null;
  await User.updateOne({ _id: userId }, { $unset: { activeTimer: 1 } });
  return { minutes, taskId };
}

/** Pomodoro: work -> break -> work. The finished work phase is logged. */
export async function advancePhase(
  userId: string,
  now = new Date(),
): Promise<ActiveTimerDTO | null> {
  await connectDb();
  const user = await User.findById(userId).select("activeTimer").lean();
  const t = user?.activeTimer;
  if (!t?.taskId || t.mode !== "pomodoro") return getActiveTimer(userId);
  await settle(userId, now);
  const next = t.phase === "break" ? "work" : "break";
  await User.updateOne(
    { _id: userId },
    { $set: { "activeTimer.phase": next, "activeTimer.phaseStartedAt": now } },
  );
  return getActiveTimer(userId);
}

/** Called when a task is completed or deleted: its timer stops with it. */
export async function stopIfRunningFor(
  userId: string,
  taskId: string,
  now = new Date(),
): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).select("activeTimer").lean();
  if (String(user?.activeTimer?.taskId ?? "") !== String(taskId)) return;
  await stopTimer(userId, now);
}
