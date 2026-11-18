import type { Types } from "mongoose";
import { DEFAULT_REMINDER_PREFS } from "@/lib/reminders";
import { clampVolume, type Tone } from "@/lib/sound";
import type { NoteDTO, NoteListItem, ProjectDTO, TaskDTO, UserSettingsDTO } from "@/lib/types";

interface TaskLean {
  _id: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  title: string;
  description?: unknown;
  status: TaskDTO["status"];
  priority: number;
  dueAt?: Date | null;
  allDay?: boolean | null;
  tags?: string[] | null;
  subtasks?:
    { _id: Types.ObjectId; title: string; done?: boolean | null; order?: number | null }[] | null;
  recurrence?: { rrule?: string | null; timezone?: string | null; endsAt?: Date | null } | null;
  reminders?:
    { _id: Types.ObjectId; at: Date; offsetMin?: number | null; sentAt?: Date | null }[] | null;
  waitingOn?: { person?: string | null; followUpAt?: Date | null; note?: string | null } | null;
  attachments?:
    { _id: Types.ObjectId; url: string; title?: string | null; kind?: string | null }[] | null;
  timeSpentMinutes?: number | null;
  sourceNoteId?: Types.ObjectId | null;
  completedAt?: Date | null;
  order?: number | null;
  createdAt?: Date;
}

export function toTaskDTO(t: TaskLean): TaskDTO {
  return {
    id: String(t._id),
    projectId: t.projectId ? String(t.projectId) : null,
    title: t.title,
    description: (t.description as Record<string, unknown> | null | undefined) ?? null,
    status: t.status,
    priority: t.priority as TaskDTO["priority"],
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    allDay: Boolean(t.allDay),
    tags: t.tags ?? [],
    subtasks: (t.subtasks ?? [])
      .map((s) => ({
        id: String(s._id),
        title: s.title,
        done: Boolean(s.done),
        order: s.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order),
    recurrence: t.recurrence?.rrule
      ? {
          rrule: t.recurrence.rrule,
          timezone: t.recurrence.timezone ?? "UTC",
          endsAt: t.recurrence.endsAt ? t.recurrence.endsAt.toISOString() : null,
        }
      : null,
    reminders: (t.reminders ?? [])
      .map((r) => ({
        id: String(r._id),
        at: r.at.toISOString(),
        offsetMin: r.offsetMin ?? null,
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      }))
      .sort((a, b) => a.at.localeCompare(b.at)),
    waitingOn: t.waitingOn?.person
      ? {
          person: t.waitingOn.person,
          followUpAt: t.waitingOn.followUpAt ? t.waitingOn.followUpAt.toISOString() : null,
          note: t.waitingOn.note ?? null,
        }
      : null,
    attachments: (t.attachments ?? []).map((a) => ({
      id: String(a._id),
      url: a.url,
      title: a.title || a.url,
      kind: (a.kind === "jira" || a.kind === "confluence" ? a.kind : "link") as
        "link" | "jira" | "confluence",
    })),
    timeSpentMinutes: t.timeSpentMinutes ?? 0,
    sourceNoteId: t.sourceNoteId ? String(t.sourceNoteId) : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    order: t.order ?? 0,
    createdAt: (t.createdAt ?? new Date(0)).toISOString(),
  };
}

export function toProjectDTO(
  p: {
    _id: Types.ObjectId;
    name: string;
    color: string;
    archived?: boolean | null;
    order?: number | null;
  },
  openCount = 0,
): ProjectDTO {
  return {
    id: String(p._id),
    name: p.name,
    color: p.color,
    archived: Boolean(p.archived),
    order: p.order ?? 0,
    openCount,
  };
}

export function toUserDTO(u: {
  _id: Types.ObjectId;
  name: string;
  email: string;
  timezone?: string | null;
  theme?: string | null;
  weekStartsOn?: number | null;
  workHours?: { start?: string | null; end?: string | null } | null;
  reminderPrefs?: {
    defaultOffsetMin?: number | null;
    quietHours?: { enabled?: boolean | null; start?: string | null; end?: string | null } | null;
    morningSummary?: boolean | null;
    sound?: { enabled?: boolean | null; tone?: string | null; volume?: number | null } | null;
  } | null;
}): UserSettingsDTO {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    timezone: u.timezone ?? "Asia/Kolkata",
    theme: (u.theme as UserSettingsDTO["theme"]) ?? "system",
    weekStartsOn: u.weekStartsOn === 0 ? 0 : 1,
    workHours: {
      start: u.workHours?.start ?? "09:30",
      end: u.workHours?.end ?? "18:00",
    },
    reminderPrefs: {
      // `null` is meaningful ("no automatic reminder"); only a missing value falls back.
      defaultOffsetMin:
        u.reminderPrefs?.defaultOffsetMin === undefined
          ? DEFAULT_REMINDER_PREFS.defaultOffsetMin
          : u.reminderPrefs.defaultOffsetMin,
      quietHours: {
        enabled: Boolean(u.reminderPrefs?.quietHours?.enabled),
        start: u.reminderPrefs?.quietHours?.start ?? DEFAULT_REMINDER_PREFS.quietHours.start,
        end: u.reminderPrefs?.quietHours?.end ?? DEFAULT_REMINDER_PREFS.quietHours.end,
      },
      morningSummary: Boolean(u.reminderPrefs?.morningSummary),
      sound: {
        enabled: u.reminderPrefs?.sound?.enabled ?? DEFAULT_REMINDER_PREFS.sound.enabled,
        tone: (["chime", "bell", "pop"].includes(u.reminderPrefs?.sound?.tone ?? "")
          ? u.reminderPrefs?.sound?.tone
          : DEFAULT_REMINDER_PREFS.sound.tone) as Tone,
        volume: clampVolume(u.reminderPrefs?.sound?.volume ?? DEFAULT_REMINDER_PREFS.sound.volume),
      },
    },
  };
}

interface NoteLean {
  _id: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  title?: string | null;
  content?: unknown;
  plainText?: string | null;
  tags?: string[] | null;
  pinned?: boolean | null;
  folder?: string | null;
  type?: string | null;
  meeting?: { date?: Date | null; attendees?: string[] | null; agenda?: string | null } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toNoteDTO(n: NoteLean): NoteDTO {
  return {
    id: String(n._id),
    projectId: n.projectId ? String(n.projectId) : null,
    title: n.title ?? "",
    content: (n.content as Record<string, unknown>) ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    tags: n.tags ?? [],
    pinned: Boolean(n.pinned),
    folder: n.folder ?? null,
    type: n.type === "meeting" ? "meeting" : "note",
    meeting:
      n.type === "meeting"
        ? {
            date: n.meeting?.date ? n.meeting.date.toISOString() : null,
            attendees: n.meeting?.attendees ?? [],
            agenda: n.meeting?.agenda ?? "",
          }
        : null,
    createdAt: (n.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (n.updatedAt ?? new Date(0)).toISOString(),
  };
}

export function toNoteListItem(n: NoteLean): NoteListItem {
  const text = (n.plainText ?? "").replace(/\s+/g, " ").trim();
  return {
    id: String(n._id),
    projectId: n.projectId ? String(n.projectId) : null,
    title: n.title ?? "",
    excerpt: text.length > 160 ? `${text.slice(0, 160)}…` : text,
    tags: n.tags ?? [],
    pinned: Boolean(n.pinned),
    folder: n.folder ?? null,
    updatedAt: (n.updatedAt ?? new Date(0)).toISOString(),
  };
}
