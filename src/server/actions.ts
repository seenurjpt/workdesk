"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, signIn, signOut } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type {
  ActionResult,
  ActiveTimerDTO,
  AttachmentDTO,
  NoteDTO,
  ProjectDTO,
  TaskDTO,
  TemplateDTO,
} from "@/lib/types";
import {
  attachmentSchema,
  carryOverSchema,
  claimRemindersSchema,
  convertSchema,
  linkSchema,
  loginSchema,
  moveTaskSchema,
  noteCreateSchema,
  noteUpdateSchema,
  objectId,
  projectInputSchema,
  quickAddSchema,
  registerSchema,
  reminderActionSchema,
  removeAttachmentSchema,
  rescheduleSchema,
  templateInputSchema,
  timerStartSchema,
  settingsSchema,
  taskInputSchema,
  taskUpdateSchema,
} from "@/schemas";
import { AuthError } from "next-auth";
import {
  convertToTasks,
  createNote,
  linkTaskNote,
  restoreNote,
  restoreVersion,
  saveVersion,
  softDeleteNote,
  unlinkTaskNote,
  updateNote,
} from "./notes";
import { createProject, reorderProjects, updateProject } from "./projects";
import {
  createTask,
  moveTask,
  quickAddTask,
  rescheduleTask,
  restoreTask,
  setTaskDone,
  softDeleteTask,
  updateTaskWithNext,
  type UpdateResult,
} from "./tasks";
import { applyReminderAction, claimReminders } from "./reminders";
import { addAttachment, removeAttachment } from "./attachments";
import { carryOverTask } from "./review";
import {
  createMeetingNote,
  createTemplate,
  deleteTemplate,
  saveNoteAsTemplate,
  saveTaskAsTemplate,
  instantiateTemplate,
} from "./templates";
import { advancePhase, startTimer, stopTimer } from "./timer";
import { emptyTrash, purgeItem } from "./trash";
import { getUserSettings, registerUser, updateUserSettings } from "./users";

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function fail(error: unknown): { ok: false; error: string } {
  // Full detail stays in the server log; the client only gets a safe message.
  if (!(error instanceof z.ZodError)) console.error("[action]", error);
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof Error && error.message && !/^(Mongo|E11000|Cast)/.test(error.message)) {
    // Service-level errors are written for users ("Project not found").
    return { ok: false, error: error.message.length < 120 ? error.message : GENERIC_ERROR };
  }
  return { ok: false, error: GENERIC_ERROR };
}

/** authenticate -> validate -> run service -> revalidate */
async function run<T>(
  fn: (userId: string) => Promise<T>,
  { revalidate = true }: { revalidate?: boolean } = {},
): Promise<ActionResult<T>> {
  const userId = await userIdOrNull();
  if (!userId) return { ok: false, error: "You are signed out" };
  try {
    const data = await fn(userId);
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

// ---- auth ----

export async function registerAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = registerSchema.parse(raw);
    if (!rateLimit(`register:${input.email}`, { capacity: 5, refillPerSec: 1 / 60 })) {
      return { ok: false, error: "Too many attempts. Try again in a minute." };
    }
    await registerUser(input);
    await signIn("credentials", { email: input.email, password: input.password, redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function loginAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = loginSchema.parse(raw);
    await signIn("credentials", { ...input, redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "Incorrect email or password" };
    return fail(e);
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function googleLoginAction(): Promise<void> {
  await signIn("google", { redirectTo: "/today" });
}

// ---- tasks ----

export async function createTaskAction(raw: unknown): Promise<ActionResult<TaskDTO>> {
  return run(async (userId) => createTask(userId, taskInputSchema.parse(raw)));
}

export async function quickAddAction(raw: unknown): Promise<ActionResult<TaskDTO>> {
  return run(async (userId) => {
    const { text, dayKey } = quickAddSchema.parse(raw);
    if (!rateLimit(`quickadd:${userId}`, { capacity: 30, refillPerSec: 1 })) {
      throw new Error("Slow down a little");
    }
    const user = await getUserSettings(userId);
    return quickAddTask(userId, text, user?.timezone ?? "Asia/Kolkata", new Date(), { dayKey });
  });
}

export async function updateTaskAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<UpdateResult>> {
  return run(async (userId) => {
    const result = await updateTaskWithNext(
      userId,
      objectId.parse(id),
      taskUpdateSchema.parse(raw),
    );
    if (!result) throw new Error("Task not found");
    return result;
  });
}

export async function setTaskDoneAction(
  id: string,
  done: boolean,
): Promise<ActionResult<UpdateResult>> {
  return run(async (userId) => {
    const result = await setTaskDone(userId, objectId.parse(id), z.boolean().parse(done));
    if (!result) throw new Error("Task not found");
    return result;
  });
}

export async function moveTaskAction(raw: unknown): Promise<ActionResult<UpdateResult>> {
  return run(async (userId) => {
    const result = await moveTask(userId, moveTaskSchema.parse(raw));
    if (!result) throw new Error("Task not found");
    return result;
  });
}

export async function rescheduleTaskAction(raw: unknown): Promise<ActionResult<UpdateResult>> {
  return run(async (userId) => {
    const { taskId, dayKey } = rescheduleSchema.parse(raw);
    const result = await rescheduleTask(userId, taskId, dayKey);
    if (!result) throw new Error("Task not found");
    return result;
  });
}

// ---- reminders ----

/** No revalidation: the scheduler updates its own state, and navigation refreshes the rest. */
export async function claimRemindersAction(raw: unknown): Promise<ActionResult<string[]>> {
  return run(async (userId) => claimReminders(userId, claimRemindersSchema.parse(raw)), {
    revalidate: false,
  });
}

export async function reminderActionAction(
  raw: unknown,
): Promise<ActionResult<UpdateResult | null>> {
  return run(async (userId) => {
    const res = await applyReminderAction(userId, reminderActionSchema.parse(raw));
    if (!res.ok) throw new Error("That reminder no longer exists");
    return res.result ?? null;
  });
}

export async function deleteTaskAction(id: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    if (!(await softDeleteTask(userId, objectId.parse(id)))) throw new Error("Task not found");
    return null;
  });
}

export async function restoreTaskAction(id: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    if (!(await restoreTask(userId, objectId.parse(id)))) throw new Error("Task not found");
    return null;
  });
}

// ---- projects ----

export async function createProjectAction(raw: unknown): Promise<ActionResult<ProjectDTO>> {
  return run(async (userId) => createProject(userId, projectInputSchema.parse(raw)));
}

export async function updateProjectAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<ProjectDTO>> {
  return run(async (userId) => {
    const patch = projectInputSchema
      .partial()
      .extend({ archived: z.boolean().optional() })
      .parse(raw);
    const project = await updateProject(userId, objectId.parse(id), patch);
    if (!project) throw new Error("Project not found");
    return project;
  });
}

export async function reorderProjectsAction(ids: string[]): Promise<ActionResult<null>> {
  return run(async (userId) => {
    await reorderProjects(userId, z.array(objectId).max(200).parse(ids));
    return null;
  });
}

// ---- settings ----

export async function updateSettingsAction(raw: unknown): Promise<ActionResult<null>> {
  return run(async (userId) => {
    await updateUserSettings(userId, settingsSchema.parse(raw));
    return null;
  });
}

// ---- notes ----

export async function createNoteAction(raw: unknown): Promise<ActionResult<NoteDTO>> {
  return run(async (userId) => createNote(userId, noteCreateSchema.parse(raw ?? {})));
}

/** Autosave: no revalidation, so typing never re-renders server components. */
export async function updateNoteAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ updatedAt: string }>> {
  return run(
    async (userId) => {
      const res = await updateNote(userId, objectId.parse(id), noteUpdateSchema.parse(raw));
      if (!res) throw new Error("Note not found");
      return res;
    },
    { revalidate: false },
  );
}

export async function deleteNoteAction(id: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    if (!(await softDeleteNote(userId, objectId.parse(id)))) throw new Error("Note not found");
    return null;
  });
}

export async function restoreNoteAction(id: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    if (!(await restoreNote(userId, objectId.parse(id)))) throw new Error("Note not found");
    return null;
  });
}

export async function saveVersionAction(noteId: string): Promise<ActionResult<null>> {
  return run(
    async (userId) => {
      if (!(await saveVersion(userId, objectId.parse(noteId)))) throw new Error("Note not found");
      return null;
    },
    { revalidate: false },
  );
}

export async function restoreVersionAction(
  noteId: string,
  versionId: string,
): Promise<ActionResult<NoteDTO>> {
  return run(async (userId) => {
    const note = await restoreVersion(userId, objectId.parse(noteId), objectId.parse(versionId));
    if (!note) throw new Error("Version not found");
    return note;
  });
}

// ---- task <-> note links ----

export async function linkTaskNoteAction(raw: unknown): Promise<ActionResult<null>> {
  return run(async (userId) => {
    const { taskId, noteId } = linkSchema.parse(raw);
    await linkTaskNote(userId, taskId, noteId);
    return null;
  });
}

export async function unlinkTaskNoteAction(raw: unknown): Promise<ActionResult<null>> {
  return run(async (userId) => {
    const { taskId, noteId } = linkSchema.parse(raw);
    await unlinkTaskNote(userId, taskId, noteId);
    return null;
  });
}

// ---- convert note lines to tasks ----

export async function convertToTasksAction(raw: unknown): Promise<ActionResult<TaskDTO[]>> {
  return run(async (userId) => {
    const { noteId, titles } = convertSchema.parse(raw);
    return convertToTasks(userId, noteId, titles);
  });
}

export async function createMeetingNoteAction(): Promise<ActionResult<{ id: string }>> {
  return run(async (userId) => createMeetingNote(userId));
}

// ---- focus timer ----

export async function startTimerAction(raw: unknown): Promise<ActionResult<ActiveTimerDTO | null>> {
  return run(async (userId) => {
    const { taskId, mode } = timerStartSchema.parse(raw);
    return startTimer(userId, taskId, mode);
  });
}

export async function stopTimerAction(): Promise<
  ActionResult<{ minutes: number; taskId: string } | null>
> {
  return run(async (userId) => stopTimer(userId));
}

export async function advanceTimerAction(): Promise<ActionResult<ActiveTimerDTO | null>> {
  return run(async (userId) => advancePhase(userId), { revalidate: false });
}

// ---- links ----

export async function addAttachmentAction(raw: unknown): Promise<ActionResult<AttachmentDTO[]>> {
  return run(async (userId) => {
    if (!rateLimit(`attach:${userId}`, { capacity: 20, refillPerSec: 0.5 }))
      throw new Error("Slow down a little");
    const { taskId, url } = attachmentSchema.parse(raw);
    return addAttachment(userId, taskId, url);
  });
}

export async function removeAttachmentAction(raw: unknown): Promise<ActionResult<AttachmentDTO[]>> {
  return run(async (userId) => {
    const { taskId, attachmentId } = removeAttachmentSchema.parse(raw);
    return removeAttachment(userId, taskId, attachmentId);
  });
}

// ---- templates ----

export async function createTemplateAction(raw: unknown): Promise<ActionResult<TemplateDTO>> {
  return run(async (userId) => createTemplate(userId, templateInputSchema.parse(raw)));
}

export async function saveTaskAsTemplateAction(
  taskId: string,
  name?: string,
): Promise<ActionResult<TemplateDTO>> {
  return run(async (userId) =>
    saveTaskAsTemplate(userId, objectId.parse(taskId), z.string().max(100).optional().parse(name)),
  );
}

export async function saveNoteAsTemplateAction(
  noteId: string,
  name?: string,
): Promise<ActionResult<TemplateDTO>> {
  return run(async (userId) =>
    saveNoteAsTemplate(userId, objectId.parse(noteId), z.string().max(100).optional().parse(name)),
  );
}

export async function deleteTemplateAction(id: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    if (!(await deleteTemplate(userId, objectId.parse(id)))) throw new Error("Template not found");
    return null;
  });
}

export async function instantiateTemplateAction(
  id: string,
): Promise<ActionResult<{ kind: "task" | "note"; id: string }>> {
  return run(async (userId) => instantiateTemplate(userId, objectId.parse(id)));
}

// ---- trash ----

export async function purgeItemAction(
  kind: "task" | "note",
  id: string,
): Promise<ActionResult<null>> {
  return run(async (userId) => {
    const ok = await purgeItem(userId, z.enum(["task", "note"]).parse(kind), objectId.parse(id));
    if (!ok) throw new Error("Item not found in the trash");
    return null;
  });
}

export async function emptyTrashAction(): Promise<ActionResult<number>> {
  return run(async (userId) => emptyTrash(userId));
}

// ---- review ----

export async function carryOverAction(raw: unknown): Promise<ActionResult<UpdateResult>> {
  return run(async (userId) => {
    const { taskId, to } = carryOverSchema.parse(raw);
    const result = await carryOverTask(userId, taskId, to);
    if (!result) throw new Error("Task not found");
    return result;
  });
}
