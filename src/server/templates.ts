import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { EMPTY_DOC } from "@/lib/tiptap";
import type { TemplateDTO, TemplateKind } from "@/lib/types";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";
import { Template } from "@/models/Template";
import { User } from "@/models/User";
import type { TemplateInput } from "@/schemas";
import { createNote } from "./notes";
import { createTask } from "./tasks";

const uid = (userId: string) => new Types.ObjectId(userId);

type Block = Record<string, unknown>;
const text = (t: string): Block => ({ type: "text", text: t });
const p = (t?: string): Block =>
  t ? { type: "paragraph", content: [text(t)] } : { type: "paragraph" };
const h2 = (t: string): Block => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const checklist = (...items: string[]): Block => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [p(i)] })),
});
const bullets = (...items: string[]): Block => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});

export const SYSTEM_TEMPLATES: TemplateInput[] = [
  {
    kind: "meeting_note",
    name: "Meeting notes",
    payload: {
      title: "Meeting notes",
      meeting: { attendees: [], agenda: "" },
      content: {
        type: "doc",
        content: [
          h2("Agenda"),
          bullets("Topic one", "Topic two"),
          h2("Discussion"),
          p(),
          h2("Decisions"),
          bullets("Decision"),
          h2("Action items"),
          checklist("Action item, owner, due date"),
        ],
      },
    },
  },
  {
    kind: "task_checklist",
    name: "Release checklist",
    payload: {
      title: "Release checklist",
      items: [
        "Freeze scope and cut the release branch",
        "Run the full test suite",
        "Update the changelog and version number",
        "Smoke-test on staging",
        "Get sign-off from product and QA",
        "Deploy to production",
        "Watch errors and metrics for 30 minutes",
        "Announce the release",
      ],
    },
  },
  {
    kind: "task_checklist",
    name: "Client kickoff",
    payload: {
      title: "Client kickoff",
      items: [
        "Send the welcome email and agenda",
        "Confirm goals, scope and success criteria",
        "Agree contacts and communication cadence",
        "Share the timeline and milestones",
        "Collect access and assets",
        "Book the first weekly sync",
        "Write up and share the kickoff notes",
      ],
    },
  },
];

/** Creates the starter templates once per user. The flag is claimed atomically, so it can't double-seed. */
export async function ensureSystemTemplates(userId: string): Promise<void> {
  await connectDb();
  const claim = await User.updateOne(
    { _id: userId, templatesSeeded: { $ne: true } },
    { $set: { templatesSeeded: true } },
  );
  if (claim.modifiedCount !== 1) return;
  await Template.insertMany(
    SYSTEM_TEMPLATES.map((t) => ({ ...t, userId: uid(userId), system: true })),
  );
}

function summary(kind: TemplateKind, payload: unknown): string {
  if (kind === "task_checklist") {
    const n = (payload as { items?: unknown[] }).items?.length ?? 0;
    return `${n} item${n === 1 ? "" : "s"}`;
  }
  return kind === "meeting_note" ? "Meeting note" : "Note";
}

export async function listTemplates(userId: string): Promise<TemplateDTO[]> {
  await ensureSystemTemplates(userId);
  const docs = await Template.find({ userId: uid(userId) })
    .sort({ system: -1, name: 1 })
    .limit(200)
    .lean();
  return docs.map((t) => ({
    id: String(t._id),
    name: t.name,
    kind: t.kind,
    system: Boolean(t.system),
    summary: summary(t.kind, t.payload),
  }));
}

export async function createTemplate(userId: string, input: TemplateInput): Promise<TemplateDTO> {
  await connectDb();
  const doc = await Template.create({ ...input, userId: uid(userId), system: false });
  return {
    id: String(doc._id),
    name: doc.name,
    kind: doc.kind,
    system: false,
    summary: summary(doc.kind, doc.payload),
  };
}

export async function deleteTemplate(userId: string, id: string): Promise<boolean> {
  await connectDb();
  const res = await Template.deleteOne({ _id: id, userId: uid(userId) });
  return res.deletedCount === 1;
}

/** Saves a task's subtasks (or the task itself) as a reusable checklist. */
export async function saveTaskAsTemplate(
  userId: string,
  taskId: string,
  name?: string,
): Promise<TemplateDTO> {
  await connectDb();
  const task = await Task.findOne({ _id: taskId, userId: uid(userId), deletedAt: null }).lean();
  if (!task) throw new Error("Task not found");
  const items = (task.subtasks ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => s.title);
  return createTemplate(userId, {
    kind: "task_checklist",
    name: (name?.trim() || task.title).slice(0, 100),
    payload: { title: task.title, items: items.length ? items : [task.title] },
  });
}

export async function saveNoteAsTemplate(
  userId: string,
  noteId: string,
  name?: string,
): Promise<TemplateDTO> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, userId: uid(userId), deletedAt: null }).lean();
  if (!note) throw new Error("Note not found");
  const title = note.title || "Untitled note";
  const payload = {
    title: note.title ?? "",
    content: (note.content as Record<string, unknown>) ?? { ...EMPTY_DOC },
    ...(note.type === "meeting"
      ? {
          meeting: { attendees: note.meeting?.attendees ?? [], agenda: note.meeting?.agenda ?? "" },
        }
      : {}),
  };
  return createTemplate(userId, {
    kind: note.type === "meeting" ? "meeting_note" : "note",
    name: (name?.trim() || title).slice(0, 100),
    payload,
  });
}

/** Creates a task (checklist templates) or a note (note templates) from a template. */
export async function instantiateTemplate(
  userId: string,
  id: string,
  now = new Date(),
): Promise<{ kind: "task" | "note"; id: string }> {
  await connectDb();
  const t = await Template.findOne({ _id: id, userId: uid(userId) }).lean();
  if (!t) throw new Error("Template not found");

  if (t.kind === "task_checklist") {
    const payload = t.payload as { title?: string; items?: string[] };
    const task = await createTask(
      userId,
      {
        title: (payload.title || t.name).slice(0, 200),
        subtasks: (payload.items ?? []).map((title, order) => ({ title, done: false, order })),
      },
      now,
    );
    return { kind: "task", id: task.id };
  }

  const payload = t.payload as {
    title?: string;
    content?: Record<string, unknown>;
    meeting?: { attendees?: string[]; agenda?: string };
  };
  const note = await createNote(
    userId,
    {
      title: payload.title ?? "",
      content: payload.content,
      ...(t.kind === "meeting_note"
        ? {
            meeting: {
              date: now,
              attendees: payload.meeting?.attendees ?? [],
              agenda: payload.meeting?.agenda ?? "",
            },
          }
        : {}),
    },
    { type: t.kind === "meeting_note" ? "meeting" : "note" },
  );
  return { kind: "note", id: note.id };
}

/** A new meeting note pre-filled from the "Meeting notes" template (or blank if it was deleted). */
export async function createMeetingNote(userId: string, now = new Date()): Promise<{ id: string }> {
  await ensureSystemTemplates(userId);
  const tpl = await Template.findOne({ userId: uid(userId), kind: "meeting_note" })
    .sort({ system: -1, createdAt: 1 })
    .lean();
  if (tpl) return { id: (await instantiateTemplate(userId, String(tpl._id), now)).id };
  const note = await createNote(
    userId,
    { meeting: { date: now, attendees: [], agenda: "" } },
    { type: "meeting" },
  );
  return { id: note.id };
}
