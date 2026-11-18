"use client";

import type { KeyboardEvent } from "react";
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  Flag,
  Hourglass,
  Link2,
  Pencil,
  Repeat,
  Timer,
  Trash2,
} from "lucide-react";
import { StartTimerMenu } from "@/components/focus/start-timer-menu";
import { TaskRowMenu } from "./task-row-menu";
import { formatInTimeZone } from "date-fns-tz";
import { formatMinutes } from "@/lib/review";
import { describeRrule } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { formatDue } from "@/lib/format";
import type { PriorityValue, ProjectDTO, TaskDTO } from "@/lib/types";

const PRIORITY_STYLE: Record<PriorityValue, { color: string; label: string }> = {
  1: { color: "text-p1", label: "P1 Urgent" },
  2: { color: "text-p2", label: "P2 High" },
  3: { color: "text-p3", label: "P3 Medium" },
  4: { color: "text-p4", label: "P4 Low" },
};

export function PriorityBadge({ priority }: { priority: PriorityValue }) {
  const { color, label } = PRIORITY_STYLE[priority];
  return (
    <span
      className={cn("text-caption inline-flex items-center gap-1 font-semibold", color)}
      title={label}
    >
      <Flag className="size-3.5" aria-hidden />
      <span aria-label={label}>P{priority}</span>
    </span>
  );
}

interface TaskRowProps {
  task: TaskDTO;
  project?: ProjectDTO;
  timezone: string;
  onToggle: (task: TaskDTO, done: boolean) => void;
  onEdit: (task: TaskDTO) => void;
  onDelete: (task: TaskDTO) => void;
  onPriority: (task: TaskDTO, priority: PriorityValue) => void;
}

export function TaskRow({
  task,
  project,
  timezone,
  onToggle,
  onEdit,
  onDelete,
  onPriority,
}: TaskRowProps) {
  const done = task.status === "done";
  const due = task.dueAt ? formatDue(task.dueAt, task.allDay, timezone) : null;
  const subDone = task.subtasks.filter((s) => s.done).length;

  function onKeyDown(e: KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " ") {
      e.preventDefault();
      onToggle(task, !done);
    } else if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      onEdit(task);
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      onPriority(task, Number(e.key) as PriorityValue);
    }
  }

  return (
    <li
      data-fx-id={task.id}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="group border-border hover:bg-surface-soft focus-visible:bg-surface-soft relative -mx-3 flex items-start gap-3 rounded-xl border-b border-transparent px-3 py-3 transition-colors duration-150 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-[var(--border)] hover:after:opacity-0 focus-visible:-outline-offset-2 focus-visible:after:opacity-0"
    >
      <button
        type="button"
        role="checkbox"
        data-small-ok
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        onClick={() => onToggle(task, !done)}
        className={cn(
          "hit-area mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-accent bg-accent text-on-accent"
            : "border-muted-strong hover:border-accent hover:bg-accent/10",
        )}
      >
        {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
      </button>

      <button
        type="button"
        onClick={() => onEdit(task)}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit "${task.title}"`}
      >
        <span
          className={cn("text-body-sm block truncate", done && "text-muted-strong line-through")}
        >
          {task.title}
        </span>
        <span className="text-caption text-muted-strong mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {task.priority !== 4 && <PriorityBadge priority={task.priority} />}
          {due && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                due.overdue && !done && "text-danger font-semibold",
              )}
            >
              {due.overdue && !done ? (
                <AlertCircle className="size-3.5" aria-hidden />
              ) : (
                <Calendar className="size-3.5" aria-hidden />
              )}
              {due.overdue && !done && <span className="sr-only">Overdue: </span>}
              {due.label}
            </span>
          )}
          {task.recurrence && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3.5" aria-hidden />
              {describeRrule(task.recurrence.rrule)}
            </span>
          )}
          {task.reminders.some((r) => !r.sentAt) && (
            <span className="inline-flex items-center gap-1">
              <Bell className="size-3.5" aria-hidden />
              <span className="sr-only">Has a reminder</span>
            </span>
          )}
          {task.timeSpentMinutes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden />
              {formatMinutes(task.timeSpentMinutes)}
            </span>
          )}
          {task.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3.5" aria-hidden />
              <span className="sr-only">Links: </span>
              {task.attachments.length}
            </span>
          )}
          {task.waitingOn && (
            <span className="inline-flex items-center gap-1">
              <Hourglass className="size-3.5" aria-hidden />
              Waiting on {task.waitingOn.person}
              {task.waitingOn.followUpAt &&
                ` · ${formatInTimeZone(new Date(task.waitingOn.followUpAt), timezone, "d MMM")}`}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span>
              {subDone}/{task.subtasks.length} subtasks
            </span>
          )}
          {project && (
            <span className="bg-surface-soft group-hover:bg-surface inline-flex items-center gap-1.5 rounded-full px-2 py-0.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: project.color }}
                aria-hidden
              />
              {project.name}
            </span>
          )}
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="bg-surface-soft group-hover:bg-surface rounded-full px-2 py-0.5"
            >
              @{tag}
            </span>
          ))}
        </span>
      </button>

      <span className="shrink-0 sm:hidden">
        <TaskRowMenu task={task} onEdit={onEdit} onDelete={onDelete} />
      </span>

      <span className="hidden shrink-0 gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100 sm:flex">
        <StartTimerMenu task={{ id: task.id, title: task.title }} />
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label={`Edit "${task.title}"`}
          className="text-muted-strong hover:bg-border/60 hover:text-foreground inline-flex size-9 items-center justify-center rounded-xl transition-colors"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label={`Delete "${task.title}"`}
          className="text-muted-strong hover:bg-danger/10 hover:text-danger inline-flex size-9 items-center justify-center rounded-xl transition-colors"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </span>
    </li>
  );
}
