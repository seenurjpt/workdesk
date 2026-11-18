import { describe, expect, it } from "vitest";
import {
  applyColumn,
  buildColumns,
  neighbours,
  optimisticOrder,
} from "@/components/board/board-model";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

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
  attachments: [],
  timeSpentMinutes: 0,
  sourceNoteId: null,
  waitingOn: null,
  completedAt: null,
  order: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const project = (id: string): ProjectDTO => ({
  id,
  name: id,
  color: "#00b97a",
  archived: false,
  order: 0,
  openCount: 0,
});

describe("board columns", () => {
  const tasks = [
    task("a", { order: 3, status: "todo", priority: 1, projectId: "p1" }),
    task("b", { order: 1, status: "in_progress", priority: 2 }),
    task("c", { order: 2, status: "todo", priority: 1, projectId: "p2" }),
    task("d", { order: 4, status: "done", priority: 4, projectId: "p1" }),
  ];
  it("groups by status in order", () => {
    const cols = buildColumns(tasks, "status", []);
    expect(cols.map((c) => c.title)).toEqual(["To do", "In progress", "Blocked", "Done"]);
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["c", "a"]); // sorted by order
    expect(cols[2].tasks).toHaveLength(0);
    expect(cols[3].tasks.map((t) => t.id)).toEqual(["d"]);
  });
  it("groups by priority", () => {
    const cols = buildColumns(tasks, "priority", []);
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["c", "a"]);
    expect(cols[3].tasks.map((t) => t.id)).toEqual(["d"]);
  });
  it("groups by project, leaving completed tasks out", () => {
    const cols = buildColumns(tasks, "project", [project("p1"), project("p2")]);
    expect(cols.map((c) => c.title)).toEqual(["No project", "p1", "p2"]);
    expect(cols[0].tasks.map((t) => t.id)).toEqual(["b"]);
    expect(cols[1].tasks.map((t) => t.id)).toEqual(["a"]); // d is done
  });
});

describe("moves", () => {
  it("applies a column to a task", () => {
    expect(applyColumn(task("a"), { kind: "status", value: "done" })).toMatchObject({
      status: "done",
    });
    expect(
      applyColumn(task("a", { status: "done", completedAt: "x" }), {
        kind: "status",
        value: "todo",
      }),
    ).toMatchObject({ status: "todo", completedAt: null });
    expect(applyColumn(task("a"), { kind: "project", value: "p9" }).projectId).toBe("p9");
    expect(applyColumn(task("a"), { kind: "priority", value: 1 }).priority).toBe(1);
  });
  it("finds neighbours for a drop index", () => {
    const list = [task("a"), task("b"), task("c")];
    expect(neighbours(list, 0)).toEqual({ prevId: null, nextId: "a" });
    expect(neighbours(list, 1)).toEqual({ prevId: "a", nextId: "b" });
    expect(neighbours(list, 3)).toEqual({ prevId: "c", nextId: null });
    expect(neighbours([], 0)).toEqual({ prevId: null, nextId: null });
  });
  it("computes the same order the server does", () => {
    const list = [task("a", { order: 10 }), task("b", { order: 20 })];
    expect(optimisticOrder(list, 1)).toBe(15);
    expect(optimisticOrder(list, 0)).toBe(-990);
    expect(optimisticOrder(list, 2)).toBe(1020);
    expect(optimisticOrder([], 0)).toBeNull();
  });
});
