import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { escapeRegex, tokenize } from "@/lib/highlight";
import { EMPTY_DOC, extractPlainText } from "@/lib/tiptap";
import type {
  NoteDTO,
  NoteListItem,
  NoteRef,
  NoteVersionDetail,
  NoteVersionItem,
  TaskDTO,
} from "@/lib/types";
import { Note } from "@/models/Note";
import { NoteVersion } from "@/models/NoteVersion";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import type { NoteUpdate } from "@/schemas";
import { toNoteDTO, toNoteListItem, toTaskDTO } from "./serialize";

export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_VERSIONS = 50;
const LIST_LIMIT = 200;

const uid = (userId: string) => new Types.ObjectId(userId);
const live = (userId: string) => ({ userId: uid(userId), deletedAt: null });

export interface NoteFilters {
  q?: string;
  tag?: string;
  folder?: string;
  projectId?: string;
}

export async function listNotes(
  userId: string,
  filters: NoteFilters = {},
): Promise<NoteListItem[]> {
  await connectDb();
  const filter: Record<string, unknown> = { ...live(userId) };
  if (filters.tag) filter.tags = filters.tag.toLowerCase();
  if (filters.folder) filter.folder = filters.folder;
  if (filters.projectId) filter.projectId = new Types.ObjectId(filters.projectId);
  const tokens = tokenize(filters.q ?? "");
  if (tokens.length) {
    filter.$and = tokens.map((t) => {
      const re = new RegExp(escapeRegex(t), "i");
      return { $or: [{ title: re }, { plainText: re }] };
    });
  }
  const docs = await Note.find(filter)
    .select("title plainText tags pinned folder projectId updatedAt")
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
  return docs.map(toNoteListItem);
}

export async function getNoteFacets(userId: string) {
  await connectDb();
  const match = { $match: live(userId) };
  const [tags, folders] = await Promise.all([
    Note.aggregate<{ _id: string; count: number }>([
      match,
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 40 },
    ]),
    Note.aggregate<{ _id: string; count: number }>([
      { $match: { ...live(userId), folder: { $nin: [null, ""] } } },
      { $group: { _id: "$folder", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 40 },
    ]),
  ]);
  return {
    tags: tags.map((t) => ({ name: t._id, count: t.count })),
    folders: folders.map((f) => ({ name: f._id, count: f.count })),
  };
}

export async function getNote(userId: string, id: string): Promise<NoteDTO | null> {
  await connectDb();
  const doc = await Note.findOne({ _id: id, ...live(userId) }).lean();
  return doc ? toNoteDTO(doc) : null;
}

async function assertOwnsProject(userId: string, projectId: string): Promise<void> {
  if (!(await Project.exists({ _id: projectId, userId: uid(userId) }))) {
    throw new Error("Project not found");
  }
}

export async function createNote(
  userId: string,
  input: NoteUpdate = {},
  options: { type?: "note" | "meeting" } = {},
): Promise<NoteDTO> {
  await connectDb();
  if (input.projectId) await assertOwnsProject(userId, input.projectId);
  const content = input.content ?? EMPTY_DOC;
  const doc = await Note.create({
    userId: uid(userId),
    title: input.title ?? "",
    content,
    plainText: extractPlainText(content),
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    folder: input.folder ?? undefined,
    projectId: input.projectId ?? undefined,
    type: options.type ?? "note",
    ...(options.type === "meeting"
      ? {
          meeting: {
            date: input.meeting?.date ?? new Date(),
            attendees: input.meeting?.attendees ?? [],
            agenda: input.meeting?.agenda ?? "",
          },
        }
      : {}),
  });
  return toNoteDTO(doc.toObject());
}

async function pruneVersions(noteId: Types.ObjectId): Promise<void> {
  const extra = await NoteVersion.find({ noteId })
    .sort({ savedAt: -1 })
    .skip(MAX_VERSIONS)
    .select("_id")
    .lean();
  if (extra.length) await NoteVersion.deleteMany({ _id: { $in: extra.map((v) => v._id) } });
}

async function snapshot(
  userId: string,
  note: { _id: Types.ObjectId; title?: string | null; content?: unknown },
  now: Date,
): Promise<void> {
  await NoteVersion.create({
    noteId: note._id,
    userId: uid(userId),
    title: note.title ?? "",
    content: note.content,
    savedAt: now,
  });
  await pruneVersions(note._id);
}

/**
 * Autosave entry point. Snapshots the *previous* state at most once per VERSION_INTERVAL_MS
 * so a bad editing session can always be rolled back.
 */
export async function updateNote(
  userId: string,
  id: string,
  patch: NoteUpdate,
  now = new Date(),
): Promise<{ updatedAt: string } | null> {
  await connectDb();
  if (patch.projectId) await assertOwnsProject(userId, patch.projectId);
  const current = await Note.findOne({ _id: id, ...live(userId) }).lean();
  if (!current) return null;

  const contentChanged =
    patch.content !== undefined &&
    JSON.stringify(patch.content) !== JSON.stringify(current.content);
  const titleChanged = patch.title !== undefined && patch.title !== current.title;

  if (contentChanged || titleChanged) {
    const hadContent = Boolean(current.title) || extractPlainText(current.content).length > 0;
    const last = await NoteVersion.findOne({ noteId: current._id }).sort({ savedAt: -1 }).lean();
    const due = !last || now.getTime() - last.savedAt.getTime() >= VERSION_INTERVAL_MS;
    if (hadContent && due) await snapshot(userId, current, now);
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  if (patch.title !== undefined) $set.title = patch.title;
  if (patch.content !== undefined) {
    $set.content = patch.content;
    $set.plainText = extractPlainText(patch.content);
  }
  if (patch.tags !== undefined) $set.tags = patch.tags;
  if (patch.pinned !== undefined) $set.pinned = patch.pinned;
  if (patch.folder !== undefined) {
    if (patch.folder) $set.folder = patch.folder;
    else $unset.folder = 1;
  }
  if (patch.projectId !== undefined) {
    if (patch.projectId) $set.projectId = patch.projectId;
    else $unset.projectId = 1;
  }
  if (patch.meeting && current.type === "meeting") {
    if (patch.meeting.date !== undefined) {
      if (patch.meeting.date) $set["meeting.date"] = patch.meeting.date;
      else $unset["meeting.date"] = 1;
    }
    if (patch.meeting.attendees !== undefined) $set["meeting.attendees"] = patch.meeting.attendees;
    if (patch.meeting.agenda !== undefined) $set["meeting.agenda"] = patch.meeting.agenda;
  }
  const update: Record<string, unknown> = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!Object.keys(update).length)
    return { updatedAt: current.updatedAt?.toISOString() ?? now.toISOString() };

  const doc = await Note.findOneAndUpdate({ _id: id, ...live(userId) }, update, {
    returnDocument: "after",
  }).lean();
  return doc ? { updatedAt: (doc.updatedAt ?? now).toISOString() } : null;
}

export async function softDeleteNote(userId: string, id: string): Promise<boolean> {
  await connectDb();
  const res = await Note.updateOne(
    { _id: id, ...live(userId) },
    { $set: { deletedAt: new Date() } },
  );
  return res.modifiedCount === 1;
}

export async function restoreNote(userId: string, id: string): Promise<boolean> {
  await connectDb();
  const res = await Note.updateOne(
    { _id: id, userId: uid(userId), deletedAt: { $ne: null } },
    { $unset: { deletedAt: 1 } },
  );
  return res.modifiedCount === 1;
}

// ---- version history ----

export async function listVersions(userId: string, noteId: string): Promise<NoteVersionItem[]> {
  await connectDb();
  const rows = await NoteVersion.find({ noteId, userId: uid(userId) })
    .sort({ savedAt: -1 })
    .limit(MAX_VERSIONS)
    .select("title savedAt")
    .lean();
  return rows.map((v) => ({
    id: String(v._id),
    title: v.title ?? "",
    savedAt: v.savedAt.toISOString(),
  }));
}

export async function getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteVersionDetail | null> {
  await connectDb();
  const v = await NoteVersion.findOne({ _id: versionId, noteId, userId: uid(userId) }).lean();
  if (!v) return null;
  return {
    id: String(v._id),
    title: v.title ?? "",
    savedAt: v.savedAt.toISOString(),
    content: (v.content as Record<string, unknown>) ?? { ...EMPTY_DOC },
  };
}

/** Explicit "Save version": always snapshots the current state. */
export async function saveVersion(
  userId: string,
  noteId: string,
  now = new Date(),
): Promise<boolean> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, ...live(userId) }).lean();
  if (!note) return false;
  await snapshot(userId, note, now);
  return true;
}

/** Restores a version; the current state is snapshotted first so restore is itself undoable. */
export async function restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
  now = new Date(),
): Promise<NoteDTO | null> {
  await connectDb();
  const version = await NoteVersion.findOne({ _id: versionId, noteId, userId: uid(userId) }).lean();
  const note = await Note.findOne({ _id: noteId, ...live(userId) }).lean();
  if (!version || !note) return null;
  await snapshot(userId, note, now);
  const restored = await Note.findOneAndUpdate(
    { _id: noteId, ...live(userId) },
    {
      $set: {
        title: version.title ?? "",
        content: version.content,
        plainText: extractPlainText(version.content),
      },
    },
    { returnDocument: "after" },
  ).lean();
  return restored ? toNoteDTO(restored) : null;
}

// ---- task <-> note links ----

export async function linkTaskNote(userId: string, taskId: string, noteId: string): Promise<void> {
  await connectDb();
  const [task, note] = await Promise.all([
    Task.exists({ _id: taskId, userId: uid(userId), deletedAt: null }),
    Note.exists({ _id: noteId, ...live(userId) }),
  ]);
  if (!task) throw new Error("Task not found");
  if (!note) throw new Error("Note not found");
  await Promise.all([
    Task.updateOne(
      { _id: taskId, userId: uid(userId) },
      { $addToSet: { linkedNoteIds: new Types.ObjectId(noteId) } },
    ),
    Note.updateOne(
      { _id: noteId, userId: uid(userId) },
      { $addToSet: { linkedTaskIds: new Types.ObjectId(taskId) } },
    ),
  ]);
}

export async function unlinkTaskNote(
  userId: string,
  taskId: string,
  noteId: string,
): Promise<void> {
  await connectDb();
  await Promise.all([
    Task.updateOne(
      { _id: taskId, userId: uid(userId) },
      { $pull: { linkedNoteIds: new Types.ObjectId(noteId) } },
    ),
    Note.updateOne(
      { _id: noteId, userId: uid(userId) },
      { $pull: { linkedTaskIds: new Types.ObjectId(taskId) } },
    ),
  ]);
}

export async function getLinkedNotes(userId: string, taskId: string): Promise<NoteRef[]> {
  await connectDb();
  const task = await Task.findOne({ _id: taskId, userId: uid(userId) })
    .select("linkedNoteIds")
    .lean();
  if (!task?.linkedNoteIds?.length) return [];
  const notes = await Note.find({ _id: { $in: task.linkedNoteIds }, ...live(userId) })
    .select("title")
    .sort({ updatedAt: -1 })
    .lean();
  return notes.map((n) => ({ id: String(n._id), title: n.title ?? "" }));
}

export async function getLinkedTasks(userId: string, noteId: string): Promise<TaskDTO[]> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, ...live(userId) })
    .select("linkedTaskIds")
    .lean();
  if (!note?.linkedTaskIds?.length) return [];
  const tasks = await Task.find({
    _id: { $in: note.linkedTaskIds },
    userId: uid(userId),
    deletedAt: null,
  })
    .sort({ status: 1, dueAt: 1 })
    .lean();
  return tasks.map(toTaskDTO);
}

/**
 * Turns selected lines of a note into tasks. Each task remembers its source note and the two
 * are linked both ways, so the note's "Linked tasks" panel shows them straight away.
 */
export async function convertToTasks(
  userId: string,
  noteId: string,
  titles: string[],
): Promise<TaskDTO[]> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, ...live(userId) })
    .select("projectId")
    .lean();
  if (!note) throw new Error("Note not found");
  const clean = titles
    .map((t) => t.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 20);
  if (clean.length === 0) throw new Error("Select some text first");

  const last = await Task.findOne({ userId: uid(userId), deletedAt: null })
    .sort({ order: -1 })
    .select("order")
    .lean();
  let order = last?.order ?? 0;
  const created = await Task.insertMany(
    clean.map((title) => ({
      userId: uid(userId),
      title,
      projectId: note.projectId ?? undefined,
      sourceNoteId: new Types.ObjectId(noteId),
      linkedNoteIds: [new Types.ObjectId(noteId)],
      order: ++order,
    })),
  );
  await Note.updateOne(
    { _id: noteId, userId: uid(userId) },
    { $addToSet: { linkedTaskIds: { $each: created.map((t) => t._id) } } },
  );
  return created.map((t) => toTaskDTO(t.toObject()));
}
