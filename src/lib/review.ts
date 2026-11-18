import { dayRange, isOverdue } from "@/lib/dates";
import type { TaskDTO } from "@/lib/types";

export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return `${h}h ${String(rest).padStart(2, "0")}m`;
}

// ---- daily ----

export interface DailyReview {
  completed: TaskDTO[];
  /** Open and due later today. */
  stillOpen: TaskDTO[];
  /** Open and due before today: they slipped past their day. */
  slipped: TaskDTO[];
}

const byDue = (a: TaskDTO, b: TaskDTO) =>
  (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
  a.priority - b.priority ||
  a.id.localeCompare(b.id);

export function buildDailyReview(tasks: TaskDTO[], now: Date, timezone: string): DailyReview {
  const today = dayRange(now, timezone, 0);
  const inToday = (iso: string | null) =>
    iso !== null && new Date(iso) >= today.start && new Date(iso) < today.end;
  return {
    completed: tasks
      .filter((t) => t.status === "done" && inToday(t.completedAt))
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? "")),
    stillOpen: tasks.filter((t) => t.status !== "done" && inToday(t.dueAt)).sort(byDue),
    slipped: tasks
      .filter((t) => t.status !== "done" && t.dueAt !== null && new Date(t.dueAt) < today.start)
      .sort(byDue),
  };
}

// ---- weekly ----

export interface WeeklyInput {
  /** Tasks due in the week, any status. */
  dueTasks: TaskDTO[];
  /** Tasks completed in the week, any due date. */
  completedTasks: TaskDTO[];
  notesCreated: number;
  minutesByProject: { projectId: string | null; minutes: number }[];
  projects: { id: string; name: string }[];
  now: Date;
  timezone: string;
}

export interface WeeklyReview {
  completedCount: number;
  dueTotal: number;
  dueDone: number;
  /** 0 – 1, or null when nothing was due. */
  completionRate: number | null;
  slipped: TaskDTO[];
  notesCreated: number;
  timeByProject: { projectId: string | null; name: string; minutes: number }[];
  totalMinutes: number;
  completed: TaskDTO[];
}

export function buildWeeklyReview(input: WeeklyInput): WeeklyReview {
  const { dueTasks, completedTasks, notesCreated, minutesByProject, projects, now, timezone } =
    input;
  const dueDone = dueTasks.filter((t) => t.status === "done").length;
  const names = new Map(projects.map((p) => [p.id, p.name]));

  // merge entries for the same project, then sort by time spent
  const merged = new Map<string | null, number>();
  for (const e of minutesByProject)
    merged.set(e.projectId, (merged.get(e.projectId) ?? 0) + e.minutes);
  const timeByProject = [...merged.entries()]
    .filter(([, minutes]) => minutes > 0)
    .map(([projectId, minutes]) => ({
      projectId,
      name: projectId ? (names.get(projectId) ?? "Archived project") : "No project",
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

  return {
    completedCount: completedTasks.length,
    dueTotal: dueTasks.length,
    dueDone,
    completionRate: dueTasks.length === 0 ? null : dueDone / dueTasks.length,
    slipped: dueTasks
      .filter(
        (t) =>
          t.status !== "done" && t.dueAt && isOverdue(new Date(t.dueAt), t.allDay, now, timezone),
      )
      .sort(byDue),
    notesCreated,
    timeByProject,
    totalMinutes: timeByProject.reduce((sum, p) => sum + p.minutes, 0),
    completed: [...completedTasks].sort((a, b) =>
      (a.completedAt ?? "").localeCompare(b.completedAt ?? ""),
    ),
  };
}

export function weeklyReportMarkdown(
  review: WeeklyReview,
  options: {
    rangeLabel: string;
    projectName: (id: string | null) => string;
    formatDay: (iso: string) => string;
  },
): string {
  const rate =
    review.completionRate === null
      ? "n/a"
      : `${Math.round(review.completionRate * 100)}% (${review.dueDone} of ${review.dueTotal} due)`;
  const lines = [
    `# Weekly report: ${options.rangeLabel}`,
    "",
    "## Summary",
    `- Tasks completed: ${review.completedCount}`,
    `- Completion rate: ${rate}`,
    `- Time tracked: ${formatMinutes(review.totalMinutes)}`,
    `- Notes created: ${review.notesCreated}`,
    "",
    "## Completed",
    ...(review.completed.length
      ? review.completed.map(
          (t) => `- ${t.title}${t.projectId ? ` (${options.projectName(t.projectId)})` : ""}`,
        )
      : ["- Nothing completed this week."]),
    "",
    "## Time by project",
    ...(review.timeByProject.length
      ? review.timeByProject.map((p) => `- ${p.name}: ${formatMinutes(p.minutes)}`)
      : ["- No time tracked."]),
    "",
    "## Slipped",
    ...(review.slipped.length
      ? review.slipped.map(
          (t) => `- ${t.title} (due ${t.dueAt ? options.formatDay(t.dueAt) : "n/a"})`,
        )
      : ["- Nothing slipped."]),
  ];
  return lines.join("\n") + "\n";
}
