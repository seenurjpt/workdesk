import type { ReminderPrefs } from "@/lib/reminders";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type PriorityValue = 1 | 2 | 3 | 4;

export interface SubtaskDTO {
  id: string;
  title: string;
  done: boolean;
  order: number;
}

export interface ReminderDTO {
  id: string;
  at: string;
  /** Minutes before due, or null for a custom absolute time. */
  offsetMin: number | null;
  sentAt: string | null;
}

export interface AttachmentDTO {
  id: string;
  url: string;
  title: string;
  kind: "link" | "jira" | "confluence";
}

export interface TaskDTO {
  id: string;
  projectId: string | null;
  title: string;
  description: Record<string, unknown> | null;
  status: TaskStatus;
  priority: PriorityValue;
  dueAt: string | null;
  allDay: boolean;
  tags: string[];
  subtasks: SubtaskDTO[];
  recurrence: { rrule: string; timezone: string; endsAt: string | null } | null;
  reminders: ReminderDTO[];
  attachments: AttachmentDTO[];
  timeSpentMinutes: number;
  sourceNoteId: string | null;
  waitingOn: { person: string; followUpAt: string | null; note: string | null } | null;
  completedAt: string | null;
  order: number;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
  openCount: number;
}

export interface UserSettingsDTO {
  id: string;
  name: string;
  email: string;
  timezone: string;
  theme: "system" | "light" | "dark";
  weekStartsOn: 0 | 1;
  workHours: { start: string; end: string };
  reminderPrefs: ReminderPrefs;
}

export interface NoteDTO {
  id: string;
  projectId: string | null;
  title: string;
  content: Record<string, unknown>;
  tags: string[];
  pinned: boolean;
  folder: string | null;
  type: "note" | "meeting";
  meeting: { date: string | null; attendees: string[]; agenda: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListItem {
  id: string;
  projectId: string | null;
  title: string;
  excerpt: string;
  tags: string[];
  pinned: boolean;
  folder: string | null;
  updatedAt: string;
}

export interface NoteVersionItem {
  id: string;
  title: string;
  savedAt: string;
}

export interface NoteVersionDetail extends NoteVersionItem {
  content: Record<string, unknown>;
}

export interface NoteRef {
  id: string;
  title: string;
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface SearchHitTask {
  kind: "task";
  id: string;
  task: TaskDTO;
  titleParts: SnippetPart[];
  score: number;
}

export interface SearchHitNote {
  kind: "note";
  id: string;
  title: string;
  titleParts: SnippetPart[];
  snippet: SnippetPart[];
  pinned: boolean;
  score: number;
}

export interface SearchResults {
  tasks: SearchHitTask[];
  notes: SearchHitNote[];
}

export interface MentionItem {
  id: string;
  label: string;
  hint?: string;
}

export type TemplateKind = "task_checklist" | "meeting_note" | "note";

export interface TemplateDTO {
  id: string;
  name: string;
  kind: TemplateKind;
  system: boolean;
  /** Task checklist: item count. Notes: nothing. */
  summary: string;
}

export interface ActiveTimerDTO {
  taskId: string;
  taskTitle: string;
  mode: "stopwatch" | "pomodoro";
  phase: "work" | "break";
  /** ISO time the current phase began. */
  phaseStartedAt: string;
  startedAt: string;
}

export interface TrashItemDTO {
  kind: "task" | "note";
  id: string;
  title: string;
  deletedAt: string;
  /** Whole days left before it is removed for good. */
  daysLeft: number;
}
