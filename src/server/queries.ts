"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import type {
  ActionResult,
  MentionItem,
  NoteRef,
  NoteVersionDetail,
  NoteVersionItem,
  SearchResults,
  TaskDTO,
} from "@/lib/types";
import { objectId, searchQuerySchema } from "@/schemas";
import { getLinkedNotes, getLinkedTasks, getVersion, listVersions } from "./notes";
import { globalSearch, lookupNotes, lookupTasks } from "./search";
import {
  getTask,
  getViewData,
  listBoardTasks,
  listCalendarTasks,
  type TaskView,
  type ViewData,
} from "./tasks";
import { getUserSettings } from "./users";

/** Authenticate + validate + run a read. Never leaks internals. */
async function read<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out" };
  try {
    return { ok: true, data: await fn(userId) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Invalid request" };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const viewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inbox") }),
  z.object({ kind: z.literal("general") }),
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("today") }),
  z.object({ kind: z.literal("upcoming") }),
  z.object({ kind: z.literal("overdue") }),
  z.object({ kind: z.literal("project"), projectId: objectId }),
  z.object({ kind: z.literal("tag"), tag: z.string().trim().min(1).max(40) }),
]);

export async function getViewDataAction(raw: unknown): Promise<ActionResult<ViewData>> {
  return read(async (userId) => {
    const view: TaskView = viewSchema.parse(raw);
    const user = await getUserSettings(userId);
    return getViewData(userId, view, user?.timezone ?? "Asia/Kolkata");
  });
}

export async function globalSearchAction(query: string): Promise<ActionResult<SearchResults>> {
  return read(async (userId) => {
    const parsed = searchQuerySchema.safeParse(query);
    if (!parsed.success) return { tasks: [], notes: [] };
    return globalSearch(userId, parsed.data);
  });
}

export async function lookupAction(
  kind: "task" | "note",
  query: string,
): Promise<ActionResult<MentionItem[]>> {
  return read(async (userId) => {
    const q = z.string().max(100).parse(query);
    return kind === "task" ? lookupTasks(userId, q) : lookupNotes(userId, q);
  });
}

export async function listVersionsAction(noteId: string): Promise<ActionResult<NoteVersionItem[]>> {
  return read((userId) => listVersions(userId, objectId.parse(noteId)));
}

export async function getVersionAction(
  noteId: string,
  versionId: string,
): Promise<ActionResult<NoteVersionDetail>> {
  return read(async (userId) => {
    const v = await getVersion(userId, objectId.parse(noteId), objectId.parse(versionId));
    if (!v) throw new Error("not found");
    return v;
  });
}

export async function getLinkedNotesAction(taskId: string): Promise<ActionResult<NoteRef[]>> {
  return read((userId) => getLinkedNotes(userId, objectId.parse(taskId)));
}

export async function getLinkedTasksAction(noteId: string): Promise<ActionResult<TaskDTO[]>> {
  return read((userId) => getLinkedTasks(userId, objectId.parse(noteId)));
}

export async function getTaskAction(taskId: string): Promise<ActionResult<TaskDTO>> {
  return read(async (userId) => {
    const task = await getTask(userId, objectId.parse(taskId));
    if (!task) throw new Error("not found");
    return task;
  });
}

export async function getBoardDataAction(): Promise<ActionResult<TaskDTO[]>> {
  return read((userId) => listBoardTasks(userId));
}

const rangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export async function getCalendarDataAction(raw: unknown): Promise<ActionResult<TaskDTO[]>> {
  return read(async (userId) => {
    const { from, to } = rangeSchema.parse(raw);
    // Guard against huge ranges: the grid never shows more than ~6 weeks.
    if (to.getTime() - from.getTime() > 60 * 86_400_000) throw new Error("range too large");
    return listCalendarTasks(userId, from, to);
  });
}
