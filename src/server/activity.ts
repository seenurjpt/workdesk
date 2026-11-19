import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ACTIVITY_DAYS, ActivityLog } from "@/models/ActivityLog";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";

export { ACTIVITY_DAYS };

export interface ActivityEntry {
  id: string;
  at: string;
  summary: string;
}

/** Shortens a task or note title so one entry stays on one line. */
export function quoted(title: string, max = 70): string {
  const t = title.replace(/\s+/g, " ").trim();
  return `"${t.length > max ? `${t.slice(0, max - 1)}…` : t || "Untitled"}"`;
}

/**
 * Adds a line to the person's own activity. Best effort: a failure here must never break the
 * action that was just done, so errors are swallowed.
 */
export async function recordActivity(userId: string, summary: string): Promise<void> {
  try {
    await connectDb();
    await ActivityLog.create({
      userId: new Types.ObjectId(userId),
      summary: summary.slice(0, 160),
    });
  } catch (e) {
    console.error("[activity]", e);
  }
}

/** The last 7 days, newest first. Older rows are ignored even before the database removes them. */
export async function listActivity(userId: string, now = new Date()): Promise<ActivityEntry[]> {
  await connectDb();
  const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000);
  const rows = await ActivityLog.find({
    userId: new Types.ObjectId(userId),
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    at: (r as unknown as { createdAt: Date }).createdAt.toISOString(),
    summary: r.summary,
  }));
}

/** The title of one of the person's own tasks or notes (also when it is in Trash), quoted. */
export async function titleOf(userId: string, kind: "task" | "note", id: string): Promise<string> {
  try {
    await connectDb();
    const doc =
      kind === "task"
        ? await Task.findOne({ _id: id, userId }).select("title").lean()
        : await Note.findOne({ _id: id, userId }).select("title").lean();
    return doc ? quoted(doc.title) : `a ${kind}`;
  } catch {
    return `a ${kind}`;
  }
}

export const STATUS_WORDS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const FIELD_WORDS: Record<string, string> = {
  title: "title",
  description: "description",
  projectId: "project",
  status: "status",
  priority: "priority",
  dueAt: "due date",
  allDay: "all-day setting",
  tags: "tags",
  subtasks: "subtasks",
  recurrence: "repeat",
  reminders: "reminders",
  waitingOn: "waiting on",
};

/** "title, due date and priority" for the fields an edit touched. */
export function changedFields(keys: string[]): string {
  const words = keys.map((k) => FIELD_WORDS[k] ?? k);
  if (words.length <= 1) return words[0] ?? "details";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export function minutesWords(minutes: number): string {
  return minutes < 1 ? "less than a minute" : `${minutes} min`;
}
