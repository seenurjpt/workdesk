import { statusList, type CustomStatus } from "@/lib/statuses";
import type { PriorityValue, ProjectDTO, TaskDTO, TaskStatus } from "@/lib/types";

export type GroupBy = "status" | "project" | "priority";

export type ColumnKey =
  | { kind: "status"; value: TaskStatus }
  | { kind: "project"; value: string | null }
  | { kind: "priority"; value: PriorityValue };

export interface Column {
  id: string;
  title: string;
  key: ColumnKey;
  color?: string;
  tasks: TaskDTO[];
}

const PRIORITIES: { value: PriorityValue; title: string }[] = [
  { value: 1, title: "P1 · Urgent" },
  { value: 2, title: "P2 · High" },
  { value: 3, title: "P3 · Medium" },
  { value: 4, title: "P4 · Low" },
];

export const NO_PROJECT = "none";

const byOrder = (a: TaskDTO, b: TaskDTO) => a.order - b.order || a.id.localeCompare(b.id);

/** Splits tasks into board columns for the chosen grouping. */
export function buildColumns(
  tasks: TaskDTO[],
  group: GroupBy,
  projects: ProjectDTO[],
  customStatuses: readonly CustomStatus[] = [],
  statusOrder: readonly string[] = [],
): Column[] {
  const sorted = [...tasks].sort(byOrder);
  if (group === "status") {
    return statusList(customStatuses, statusOrder).map((s) => ({
      id: `status:${s.value}`,
      title: s.title,
      key: { kind: "status", value: s.value },
      tasks: sorted.filter((t) => t.status === s.value),
    }));
  }
  if (group === "priority") {
    return PRIORITIES.map((p) => ({
      id: `priority:${p.value}`,
      title: p.title,
      key: { kind: "priority", value: p.value },
      tasks: sorted.filter((t) => t.priority === p.value),
    }));
  }
  const open = sorted.filter((t) => t.status !== "done");
  return [
    {
      id: `project:${NO_PROJECT}`,
      title: "No project",
      key: { kind: "project", value: null },
      tasks: open.filter((t) => t.projectId === null),
    },
    ...projects.map((p) => ({
      id: `project:${p.id}`,
      title: p.name,
      color: p.color,
      key: { kind: "project", value: p.id } as ColumnKey,
      tasks: open.filter((t) => t.projectId === p.id),
    })),
  ];
}

/** The patch that makes a task belong to a column. */
export function applyColumn(task: TaskDTO, key: ColumnKey): TaskDTO {
  switch (key.kind) {
    case "status":
      return {
        ...task,
        status: key.value,
        completedAt: key.value === "done" ? new Date().toISOString() : null,
      };
    case "project":
      return { ...task, projectId: key.value };
    case "priority":
      return { ...task, priority: key.value };
  }
}

/** Neighbours for a card dropped at `index` in `tasks` (which excludes the moved card). */
export function neighbours(
  tasks: TaskDTO[],
  index: number,
): { prevId: string | null; nextId: string | null } {
  return {
    prevId: index > 0 ? (tasks[index - 1]?.id ?? null) : null,
    nextId: tasks[index]?.id ?? null,
  };
}

/** A stable order for an optimistic move, matching what the server will compute. */
export function optimisticOrder(tasks: TaskDTO[], index: number): number | null {
  const prev = index > 0 ? tasks[index - 1]?.order : undefined;
  const next = tasks[index]?.order;
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1000;
  if (next !== undefined) return next - 1000;
  return null;
}
