import { z } from "zod";
import { MAX_OFFSET_MIN, MAX_REMINDERS_PER_TASK } from "@/lib/reminders";
import { validateRrule } from "@/lib/recurrence";
import { parseHttpUrl } from "@/lib/url-links";

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{M}\p{N}_-]+$/u, "Tags can contain letters, numbers, - and _");

const tiptapDoc = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 500_000, "Description too large");

export const subtaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
  order: z.number().int().default(0),
});

export const reminderInputSchema = z
  .object({
    id: objectId.optional(),
    offsetMin: z.number().int().min(0).max(MAX_OFFSET_MIN).nullable(),
    /** Required for custom reminders (offsetMin === null). */
    at: z.coerce.date().optional(),
  })
  .refine((r) => r.offsetMin !== null || r.at !== undefined, "Pick a time for the custom reminder");

export const recurrenceInputSchema = z.object({
  rrule: z.string().refine(validateRrule, "Unsupported repeat rule"),
  endsAt: z.coerce.date().nullable().optional(),
});

export const waitingOnInputSchema = z.object({
  person: z.string().trim().min(1, "Who are you waiting on?").max(80),
  followUpAt: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: tiptapDoc.nullable().optional(),
  projectId: objectId.nullable().optional(),
  status: z.string().min(1).max(40).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  allDay: z.boolean().optional(),
  tags: z.array(tagSchema).max(20).optional(),
  subtasks: z.array(subtaskSchema).max(100).optional(),
  recurrence: recurrenceInputSchema.nullable().optional(),
  reminders: z.array(reminderInputSchema).max(MAX_REMINDERS_PER_TASK).optional(),
  waitingOn: waitingOnInputSchema.nullable().optional(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskUpdateSchema = taskInputSchema.partial();
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

export const quickAddSchema = z.object({
  text: z.string().trim().min(1, "Type something").max(500),
  /** Used by the calendar: tasks without their own date land on this day. */
  dayKey: dayKeySchema.optional(),
});

const columnSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    value: z.string().min(1).max(40),
  }),
  z.object({ kind: z.literal("project"), value: objectId.nullable() }),
  z.object({
    kind: z.literal("priority"),
    value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
]);

export const moveTaskSchema = z.object({
  taskId: objectId,
  column: columnSchema,
  /** Neighbours in the destination column after the move (null = edge). */
  prevId: objectId.nullable(),
  nextId: objectId.nullable(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const rescheduleSchema = z.object({ taskId: objectId, dayKey: dayKeySchema });

export const reminderActionSchema = z.object({
  taskId: objectId,
  reminderId: objectId,
  action: z.enum(["snooze10", "snooze60", "tomorrow", "done", "dismiss"]),
});

export const claimRemindersSchema = z
  .array(z.object({ taskId: objectId, reminderId: objectId }))
  .max(50);

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone")
    .optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
  workHours: z
    .object({
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    })
    .optional(),
  reminderPrefs: z
    .object({
      defaultOffsetMin: z.number().int().min(0).max(MAX_OFFSET_MIN).nullable(),
      quietHours: z.object({
        enabled: z.boolean(),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
      morningSummary: z.boolean(),
      sound: z
        .object({
          enabled: z.boolean(),
          tone: z.enum(["chime", "bell", "pop"]),
          volume: z.number().min(0.1).max(1),
        })
        .optional(),
    })
    .optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

const tiptapContent = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 500_000, "Note is too large (500KB limit)");

export const noteUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  content: tiptapContent.optional(),
  tags: z.array(tagSchema).max(20).optional(),
  pinned: z.boolean().optional(),
  folder: z.string().trim().max(80).nullable().optional(),
  projectId: objectId.nullable().optional(),
  meeting: z
    .object({
      date: z.coerce.date().nullable().optional(),
      attendees: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      agenda: z.string().max(1000).optional(),
    })
    .optional(),
});
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;

export const noteCreateSchema = noteUpdateSchema.extend({
  title: z.string().max(200).default(""),
});

export const linkSchema = z.object({ taskId: objectId, noteId: objectId });

export const searchQuerySchema = z.string().trim().min(1).max(100);

export const urlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => parseHttpUrl(v) !== null, "Enter a valid http(s) link");

export const attachmentSchema = z.object({ taskId: objectId, url: urlSchema });
export const removeAttachmentSchema = z.object({ taskId: objectId, attachmentId: objectId });

export const timerStartSchema = z.object({
  taskId: objectId,
  mode: z.enum(["stopwatch", "pomodoro"]),
});

export const convertSchema = z.object({
  noteId: objectId,
  titles: z.array(z.string().trim().min(1).max(200)).min(1, "Select some text first").max(20),
});

export const carryOverSchema = z.object({
  taskId: objectId,
  /** "tomorrow" or a yyyy-MM-dd day */
  to: z.union([z.literal("tomorrow"), dayKeySchema]),
});

const templatePayloadChecklist = z.object({
  title: z.string().trim().max(200).default(""),
  items: z.array(z.string().trim().min(1).max(200)).max(100),
});
const templatePayloadNote = z.object({
  title: z.string().max(200).default(""),
  content: z
    .record(z.string(), z.unknown())
    .refine((v) => JSON.stringify(v).length <= 200_000, "Template too large"),
  meeting: z
    .object({
      attendees: z.array(z.string().max(80)).max(30).default([]),
      agenda: z.string().max(1000).default(""),
    })
    .optional(),
});

export const templateInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task_checklist"),
    name: z.string().trim().min(1).max(100),
    payload: templatePayloadChecklist,
  }),
  z.object({
    kind: z.literal("meeting_note"),
    name: z.string().trim().min(1).max(100),
    payload: templatePayloadNote,
  }),
  z.object({
    kind: z.literal("note"),
    name: z.string().trim().min(1).max(100),
    payload: templatePayloadNote,
  }),
]);
export type TemplateInput = z.infer<typeof templateInputSchema>;
