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
import { addStatus, removeStatus, renameStatus, reorderStatuses } from "./statuses";
import type { CustomStatus } from "@/lib/statuses";
import { adminEmailsFromEnv, getRegistrationOpen } from "./settings";
import {
  STATUS_WORDS,
  changedFields,
  minutesWords,
  quoted,
  recordActivity,
  titleOf,
} from "./activity";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/models/User";

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
  {
    revalidate = true,
    log,
  }: {
    revalidate?: boolean;
    /** One line for the person's own 7-day activity. Return nothing to skip. */
    log?: (
      data: T,
      userId: string,
    ) => string | null | undefined | Promise<string | null | undefined>;
  } = {},
): Promise<ActionResult<T>> {
  const userId = await userIdOrNull();
  if (!userId) return { ok: false, error: "You are signed out" };
  try {
    const data = await fn(userId);
    const line = await log?.(data, userId);
    if (line) await recordActivity(userId, line);
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
    if (!(await getRegistrationOpen())) {
      return { ok: false, error: "Sign-ups are closed. Ask an administrator for an account." };
    }
    const created = await registerUser(input);
    await recordActivity(created.id, "Created the account");
    await signIn("credentials", { email: input.email, password: input.password, redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function loginAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const input = loginSchema.parse(raw);
    // A suspended account gets a clear message, but only once the password is right, so the
    // message cannot be used to find out which emails have accounts.
    await connectDb();
    const found = await User.findOne({ email: input.email }).select("+passwordHash status").lean();
    if (
      found?.status === "suspended" &&
      found.passwordHash &&
      (await bcrypt.compare(input.password, found.passwordHash))
    ) {
      return { ok: false, error: "This account has been suspended. Contact an administrator." };
    }
    await signIn("credentials", { ...input, redirect: false });
    if (found) await recordActivity(String(found._id), "Signed in");
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "Incorrect email or password" };
    return fail(e);
  }
}

/**
 * The one sign-in page for administrators (/admin/login). It only lets active administrators in:
 * anyone else gets the same "incorrect" message as a wrong password, so it cannot be used to find
 * out who is an admin.
 */
export async function adminLoginAction(raw: unknown): Promise<ActionResult<null>> {
  const generic = { ok: false, error: "Incorrect email or password" } as const;
  try {
    const input = loginSchema.parse(raw);
    if (!rateLimit(`adminlogin:${input.email}`, { capacity: 5, refillPerSec: 1 / 30 })) {
      return { ok: false, error: "Too many attempts. Wait a minute and try again." };
    }
    await connectDb();
    const found = await User.findOne({ email: input.email })
      .select("+passwordHash role status")
      .lean();
    if (!found?.passwordHash || !(await bcrypt.compare(input.password, found.passwordHash))) {
      return generic;
    }
    const isAdmin = found.role === "admin" || adminEmailsFromEnv().includes(input.email);
    if (!isAdmin) return generic;
    if (found.status === "suspended") {
      return { ok: false, error: "This account has been suspended." };
    }
    await signIn("credentials", { ...input, redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) return generic;
    return fail(e);
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/** Sign out from the admin panel and land on the admin sign-in page. */
export async function adminLogoutAction(): Promise<void> {
  await signOut({ redirectTo: "/admin/login" });
}

export async function googleLoginAction(): Promise<void> {
  await signIn("google", { redirectTo: "/today" });
}

// ---- tasks ----

export async function createTaskAction(raw: unknown): Promise<ActionResult<TaskDTO>> {
  return run(async (userId) => createTask(userId, taskInputSchema.parse(raw)), {
    log: (t) => `Added task ${quoted(t.title)}`,
  });
}

export async function quickAddAction(raw: unknown): Promise<ActionResult<TaskDTO>> {
  return run(
    async (userId) => {
      const { text, dayKey } = quickAddSchema.parse(raw);
      if (!rateLimit(`quickadd:${userId}`, { capacity: 30, refillPerSec: 1 })) {
        throw new Error("Slow down a little");
      }
      const user = await getUserSettings(userId);
      return quickAddTask(userId, text, user?.timezone ?? "Asia/Kolkata", new Date(), { dayKey });
    },
    { log: (t) => `Added task ${quoted(t.title)}` },
  );
}

export async function updateTaskAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<UpdateResult>> {
  let changed = "details";
  return run(
    async (userId) => {
      const patch = taskUpdateSchema.parse(raw);
      changed = changedFields(Object.keys(patch));
      const result = await updateTaskWithNext(userId, objectId.parse(id), patch);
      if (!result) throw new Error("Task not found");
      return result;
    },
    { log: (r) => `Edited ${quoted(r.task.title)}: changed ${changed}` },
  );
}

export async function setTaskDoneAction(
  id: string,
  done: boolean,
): Promise<ActionResult<UpdateResult>> {
  return run(
    async (userId) => {
      const result = await setTaskDone(userId, objectId.parse(id), z.boolean().parse(done));
      if (!result) throw new Error("Task not found");
      return result;
    },
    { log: (r) => `${done ? "Completed" : "Reopened"} task ${quoted(r.task.title)}` },
  );
}

export async function moveTaskAction(raw: unknown): Promise<ActionResult<UpdateResult>> {
  let where = "another column";
  return run(
    async (userId) => {
      const input = moveTaskSchema.parse(raw);
      const col = input.column;
      where =
        col.kind === "status"
          ? `${STATUS_WORDS[col.value] ?? col.value}`
          : col.kind === "priority"
            ? `priority P${col.value}`
            : col.value
              ? "another project"
              : "General";
      const result = await moveTask(userId, input);
      if (!result) throw new Error("Task not found");
      return result;
    },
    { log: (r) => `Moved ${quoted(r.task.title)} to ${where}` },
  );
}

export async function rescheduleTaskAction(raw: unknown): Promise<ActionResult<UpdateResult>> {
  return run(
    async (userId) => {
      const { taskId, dayKey } = rescheduleSchema.parse(raw);
      const result = await rescheduleTask(userId, taskId, dayKey);
      if (!result) throw new Error("Task not found");
      return result;
    },
    { log: (r) => `Rescheduled task ${quoted(r.task.title)}` },
  );
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
  return run(
    async (userId) => {
      if (!(await softDeleteTask(userId, objectId.parse(id)))) throw new Error("Task not found");
      return null;
    },
    { log: async (_r, u) => `Moved ${await titleOf(u, "task", id)} to Trash` },
  );
}

export async function restoreTaskAction(id: string): Promise<ActionResult<null>> {
  return run(
    async (userId) => {
      if (!(await restoreTask(userId, objectId.parse(id)))) throw new Error("Task not found");
      return null;
    },
    { log: async (_r, u) => `Restored ${await titleOf(u, "task", id)} from Trash` },
  );
}

// ---- custom statuses ----

const statusNameSchema = z.string().max(100);

export async function addStatusAction(name: string): Promise<ActionResult<CustomStatus[]>> {
  return run(async (userId) => addStatus(userId, statusNameSchema.parse(name)), {
    log: () => `Added status ${quoted(name.trim())}`,
  });
}

export async function renameStatusAction(
  key: string,
  name: string,
): Promise<ActionResult<CustomStatus[]>> {
  return run(
    async (userId) =>
      renameStatus(userId, z.string().max(40).parse(key), statusNameSchema.parse(name)),
    { log: () => `Renamed a status to ${quoted(name.trim())}` },
  );
}

export async function reorderStatusesAction(keys: string[]): Promise<ActionResult<string[]>> {
  return run(
    async (userId) => reorderStatuses(userId, z.array(z.string().max(40)).max(20).parse(keys)),
    {
      log: () => "Reordered statuses",
    },
  );
}

export async function removeStatusAction(
  key: string,
): Promise<ActionResult<{ statuses: CustomStatus[]; moved: number }>> {
  return run(async (userId) => removeStatus(userId, z.string().max(40).parse(key)), {
    log: (r) =>
      `Removed a status${r.moved ? ` (${r.moved} task${r.moved === 1 ? "" : "s"} moved to To do)` : ""}`,
  });
}

// ---- projects ----

export async function createProjectAction(raw: unknown): Promise<ActionResult<ProjectDTO>> {
  return run(async (userId) => createProject(userId, projectInputSchema.parse(raw)), {
    log: (p) => `Created project ${quoted(p.name)}`,
  });
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
  return run(
    async (userId) => {
      await updateUserSettings(userId, settingsSchema.parse(raw));
      return null;
    },
    { log: () => "Changed settings" },
  );
}

// ---- notes ----

export async function createNoteAction(raw: unknown): Promise<ActionResult<NoteDTO>> {
  return run(async (userId) => createNote(userId, noteCreateSchema.parse(raw ?? {})), {
    log: (n) => `Created note ${quoted(n.title)}`,
  });
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
  return run(
    async (userId) => {
      if (!(await softDeleteNote(userId, objectId.parse(id)))) throw new Error("Note not found");
      return null;
    },
    { log: async (_r, u) => `Moved note ${await titleOf(u, "note", id)} to Trash` },
  );
}

export async function restoreNoteAction(id: string): Promise<ActionResult<null>> {
  return run(
    async (userId) => {
      if (!(await restoreNote(userId, objectId.parse(id)))) throw new Error("Note not found");
      return null;
    },
    { log: async (_r, u) => `Restored note ${await titleOf(u, "note", id)} from Trash` },
  );
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
  return run(async (userId) => createMeetingNote(userId), { log: () => "Created a meeting note" });
}

// ---- focus timer ----

export async function startTimerAction(raw: unknown): Promise<ActionResult<ActiveTimerDTO | null>> {
  return run(
    async (userId) => {
      const { taskId, mode } = timerStartSchema.parse(raw);
      return startTimer(userId, taskId, mode);
    },
    { log: (t) => (t ? `Started a timer on ${quoted(t.taskTitle)}` : null) },
  );
}

export async function stopTimerAction(): Promise<
  ActionResult<{ minutes: number; taskId: string } | null>
> {
  return run(async (userId) => stopTimer(userId), {
    log: async (r, u) =>
      r
        ? `Stopped the timer on ${await titleOf(u, "task", r.taskId)} (${minutesWords(r.minutes)})`
        : null,
  });
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
  return run(async (userId) => createTemplate(userId, templateInputSchema.parse(raw)), {
    log: (t) => `Created template ${quoted(t.name)}`,
  });
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
  return run(
    async (userId) => {
      if (!(await deleteTemplate(userId, objectId.parse(id))))
        throw new Error("Template not found");
      return null;
    },
    { log: () => "Deleted a template" },
  );
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
  let label = `a ${kind}`;
  return run(
    async (userId) => {
      const k = z.enum(["task", "note"]).parse(kind);
      const itemId = objectId.parse(id);
      label = await titleOf(userId, k, itemId); // before it is gone
      const ok = await purgeItem(userId, k, itemId);
      if (!ok) throw new Error("Item not found in the trash");
      return null;
    },
    { log: () => `Deleted ${kind} ${label} forever` },
  );
}

export async function emptyTrashAction(): Promise<ActionResult<number>> {
  return run(async (userId) => emptyTrash(userId), {
    log: (n) => `Emptied Trash (${n} item${n === 1 ? "" : "s"})`,
  });
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
