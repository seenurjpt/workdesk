import { describe, expect, it } from "vitest";
import {
  buildDailyReview,
  buildWeeklyReview,
  formatMinutes,
  weeklyReportMarkdown,
} from "@/lib/review";
import type { TaskDTO } from "@/lib/types";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-17T12:30:00Z"); // Tue 17 Nov 18:00 IST
const task = (id: string, over: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: null,
  title: id,
  description: null,
  status: "todo",
  priority: 4,
  dueAt: null,
  allDay: false,
  tags: [],
  subtasks: [],
  recurrence: null,
  reminders: [],
  waitingOn: null,
  attachments: [],
  timeSpentMinutes: 0,
  sourceNoteId: null,
  completedAt: null,
  order: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("formatMinutes", () => {
  it("formats", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h 00m");
    expect(formatMinutes(125)).toBe("2h 05m");
    expect(formatMinutes(-5)).toBe("0m");
    expect(formatMinutes(59.6)).toBe("1h 00m");
  });
});

describe("daily review", () => {
  const tasks = [
    task("doneToday", { status: "done", completedAt: "2026-11-17T05:00:00.000Z" }),
    task("doneYesterday", { status: "done", completedAt: "2026-11-16T05:00:00.000Z" }),
    task("laterToday", { dueAt: "2026-11-17T14:00:00.000Z" }), // 19:30 IST
    task("allDayToday", { dueAt: "2026-11-16T18:30:00.000Z", allDay: true }),
    task("yesterday", { dueAt: "2026-11-16T09:00:00.000Z" }),
    task("lastWeek", { dueAt: "2026-11-10T09:00:00.000Z" }),
    task("tomorrow", { dueAt: "2026-11-18T09:00:00.000Z" }),
    task("undated"),
  ];
  const r = buildDailyReview(tasks, NOW, TZ);
  it("splits completed, still open and slipped", () => {
    expect(r.completed.map((t) => t.id)).toEqual(["doneToday"]);
    expect(r.stillOpen.map((t) => t.id).sort()).toEqual(["allDayToday", "laterToday"]);
    expect(r.slipped.map((t) => t.id)).toEqual(["lastWeek", "yesterday"]); // oldest first
  });
  it("ignores future and undated tasks", () => {
    const all = [...r.completed, ...r.stillOpen, ...r.slipped].map((t) => t.id);
    expect(all).not.toContain("tomorrow");
    expect(all).not.toContain("undated");
    expect(all).not.toContain("doneYesterday");
  });
});

describe("weekly review", () => {
  const projects = [
    { id: "p1", name: "Alpha" },
    { id: "p2", name: "Beta" },
  ];
  const due = [
    task("a", {
      status: "done",
      dueAt: "2026-11-16T09:00:00.000Z",
      completedAt: "2026-11-16T10:00:00.000Z",
      projectId: "p1",
    }),
    task("b", {
      status: "done",
      dueAt: "2026-11-17T09:00:00.000Z",
      completedAt: "2026-11-17T10:00:00.000Z",
    }),
    task("c", { dueAt: "2026-11-16T09:00:00.000Z" }), // slipped
    task("d", { dueAt: "2026-11-19T09:00:00.000Z" }), // still ahead
  ];
  const completed = [
    ...due.filter((t) => t.status === "done"),
    task("early", { status: "done", completedAt: "2026-11-15T20:00:00.000Z" }),
  ];
  const review = buildWeeklyReview({
    dueTasks: due,
    completedTasks: completed,
    notesCreated: 3,
    projects,
    now: NOW,
    timezone: TZ,
    minutesByProject: [
      { projectId: "p1", minutes: 90 },
      { projectId: "p2", minutes: 120 },
      { projectId: "p1", minutes: 30 },
      { projectId: null, minutes: 15 },
      { projectId: "p2", minutes: 0 },
    ],
  });
  it("counts and rates", () => {
    expect(review.completedCount).toBe(3);
    expect(review.dueTotal).toBe(4);
    expect(review.dueDone).toBe(2);
    expect(review.completionRate).toBe(0.5);
    expect(review.notesCreated).toBe(3);
  });
  it("lists only overdue open tasks as slipped", () => {
    expect(review.slipped.map((t) => t.id)).toEqual(["c"]);
  });
  it("merges and sorts time per project", () => {
    expect(review.timeByProject).toEqual([
      { projectId: "p1", name: "Alpha", minutes: 120 },
      { projectId: "p2", name: "Beta", minutes: 120 },
      { projectId: null, name: "No project", minutes: 15 },
    ]);
    expect(review.totalMinutes).toBe(255);
  });
  it("has no completion rate when nothing was due", () => {
    const empty = buildWeeklyReview({
      dueTasks: [],
      completedTasks: [],
      notesCreated: 0,
      projects,
      now: NOW,
      timezone: TZ,
      minutesByProject: [],
    });
    expect(empty.completionRate).toBeNull();
    expect(empty.timeByProject).toEqual([]);
  });
  it("names unknown projects safely", () => {
    const r = buildWeeklyReview({
      dueTasks: [],
      completedTasks: [],
      notesCreated: 0,
      projects: [],
      now: NOW,
      timezone: TZ,
      minutesByProject: [{ projectId: "gone", minutes: 10 }],
    });
    expect(r.timeByProject[0].name).toBe("Archived project");
  });
  it("writes a Markdown report", () => {
    const md = weeklyReportMarkdown(review, {
      rangeLabel: "16 – 22 Nov 2026",
      projectName: (id) => projects.find((p) => p.id === id)?.name ?? "?",
      formatDay: (iso) => iso.slice(0, 10),
    });
    expect(md).toContain("# Weekly report: 16 – 22 Nov 2026");
    expect(md).toContain("- Tasks completed: 3");
    expect(md).toContain("- Completion rate: 50% (2 of 4 due)");
    expect(md).toContain("- Time tracked: 4h 15m");
    expect(md).toContain("- Notes created: 3");
    expect(md).toContain("- a (Alpha)");
    expect(md).toContain("- Alpha: 2h 00m");
    expect(md).toContain("- c (due 2026-11-16)");
  });
  it("reports empty weeks politely", () => {
    const empty = buildWeeklyReview({
      dueTasks: [],
      completedTasks: [],
      notesCreated: 0,
      projects,
      now: NOW,
      timezone: TZ,
      minutesByProject: [],
    });
    const md = weeklyReportMarkdown(empty, {
      rangeLabel: "x",
      projectName: () => "",
      formatDay: (s) => s,
    });
    expect(md).toContain("Completion rate: n/a");
    expect(md).toContain("Nothing completed this week.");
    expect(md).toContain("No time tracked.");
    expect(md).toContain("Nothing slipped.");
  });
});
