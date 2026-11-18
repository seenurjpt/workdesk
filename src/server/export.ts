import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { docToMarkdown, slugify } from "@/lib/markdown";
import { describeRrule } from "@/lib/recurrence";
import { Note } from "@/models/Note";
import { NoteVersion } from "@/models/NoteVersion";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import { Template } from "@/models/Template";
import { User } from "@/models/User";

const uid = (userId: string) => new Types.ObjectId(userId);

/** Everything the person owns, as plain JSON. Never includes the password hash. */
export async function exportAll(userId: string, now = new Date()) {
  await connectDb();
  const owner = { userId: uid(userId) };
  const [user, projects, tasks, notes, versions, templates] = await Promise.all([
    User.findById(userId).lean(), // passwordHash is `select: false`
    Project.find(owner).lean(),
    Task.find({ ...owner, deletedAt: null }).lean(),
    Note.find({ ...owner, deletedAt: null }).lean(),
    NoteVersion.find(owner).lean(),
    Template.find(owner).lean(),
  ]);
  return {
    app: "WorkDesk",
    exportedAt: now.toISOString(),
    user: user
      ? {
          name: user.name,
          email: user.email,
          timezone: user.timezone,
          weekStartsOn: user.weekStartsOn,
          workHours: user.workHours,
          reminderPrefs: user.reminderPrefs,
        }
      : null,
    projects,
    tasks,
    notes,
    noteVersions: versions,
    templates,
  };
}

const HEADERS = [
  "id",
  "title",
  "status",
  "priority",
  "project",
  "due",
  "all_day",
  "tags",
  "repeats",
  "waiting_on",
  "follow_up",
  "time_spent_minutes",
  "links",
  "completed_at",
  "created_at",
];

export async function tasksCsv(userId: string): Promise<string> {
  await connectDb();
  const owner = { userId: uid(userId) };
  const [tasks, projects] = await Promise.all([
    Task.find({ ...owner, deletedAt: null })
      .sort({ createdAt: 1 })
      .lean(),
    Project.find(owner).select("name").lean(),
  ]);
  const names = new Map(projects.map((p) => [String(p._id), p.name]));
  return toCsv(
    HEADERS,
    tasks.map((t) => [
      String(t._id),
      t.title,
      t.status,
      t.priority,
      t.projectId ? (names.get(String(t.projectId)) ?? "") : "",
      t.dueAt ?? "",
      t.allDay ? "yes" : "no",
      (t.tags ?? []).join(" "),
      t.recurrence?.rrule ? describeRrule(t.recurrence.rrule) : "",
      t.waitingOn?.person ?? "",
      t.waitingOn?.followUpAt ?? "",
      t.timeSpentMinutes ?? 0,
      (t.attachments ?? []).map((a) => a.url).join(" "),
      t.completedAt ?? "",
      t.createdAt ?? "",
    ]),
  );
}

export async function noteMarkdown(
  userId: string,
  noteId: string,
): Promise<{ filename: string; markdown: string } | null> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, userId: uid(userId), deletedAt: null }).lean();
  if (!note) return null;
  const title = note.title || "Untitled note";
  const meta =
    note.type === "meeting"
      ? [
          note.meeting?.date ? `**Date:** ${note.meeting.date.toISOString().slice(0, 10)}` : "",
          note.meeting?.attendees?.length
            ? `**Attendees:** ${note.meeting.attendees.join(", ")}`
            : "",
          note.meeting?.agenda ? `**Agenda:** ${note.meeting.agenda}` : "",
        ]
          .filter(Boolean)
          .join("  \n")
      : "";
  const body = docToMarkdown(note.content, title);
  const markdown = meta ? body.replace(/^(# .*\n\n)/, `$1${meta}\n\n`) : body;
  return { filename: `${slugify(title)}.md`, markdown };
}
