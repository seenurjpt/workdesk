"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Calendar, CalendarArrowDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTrashFx } from "@/components/shared/trash-bin";
import { useApp } from "@/components/shared/user-context";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";
import { carryOverAction, deleteTaskAction, restoreTaskAction } from "@/server/actions";

/** A task in a review list, with one-click carry over, reschedule and drop. */
export function ReviewRow({ task }: { task: TaskDTO }) {
  const { user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const { open } = useTaskEditor();
  const fx = useTrashFx();
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState("");
  const due = task.dueAt ? formatDue(task.dueAt, task.allDay, user.timezone) : null;

  const refresh = () => {
    invalidateTaskQueries(qc);
    router.refresh();
  };

  async function carry(to: "tomorrow" | string) {
    const res = await carryOverAction({ taskId: task.id, to });
    if (!res.ok) return void toast.error(res.error);
    toast.success(to === "tomorrow" ? "Carried over to tomorrow" : "Rescheduled", {
      description: task.title,
    });
    setPicking(false);
    refresh();
  }

  async function drop() {
    fx.fly(task.id, task.title);
    const res = await deleteTaskAction(task.id);
    if (!res.ok) return void toast.error(res.error);
    toast("Dropped", {
      description: task.title,
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreTaskAction(task.id);
          refresh();
        },
      },
    });
    refresh();
  }

  return (
    <li
      data-fx-id={task.id}
      className="border-border flex flex-wrap items-center gap-3 border-b px-1 py-3"
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => open(task)}
          className="text-body-sm block truncate text-left font-semibold hover:underline"
        >
          {task.title}
        </button>
        {due && (
          <span
            className={cn(
              "text-caption inline-flex items-center gap-1",
              due.overdue ? "text-danger font-semibold" : "text-muted-strong",
            )}
          >
            {due.overdue ? (
              <AlertCircle className="size-3.5" aria-hidden />
            ) : (
              <Calendar className="size-3.5" aria-hidden />
            )}
            {due.overdue && <span className="sr-only">Overdue: </span>}
            {due.label}
          </span>
        )}
      </div>
      {picking ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (day) void carry(day);
          }}
        >
          <Input
            type="date"
            aria-label={`New date for ${task.title}`}
            className="w-auto py-1.5"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!day}>
            Move
          </Button>
          <Button size="sm" variant="utility" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void carry("tomorrow")}>
            <CalendarArrowDown className="size-4" aria-hidden /> Carry over
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
            Reschedule
          </Button>
          <Button
            size="sm"
            variant="utility"
            onClick={() => void drop()}
            aria-label={`Drop "${task.title}"`}
          >
            <Trash2 className="size-4" aria-hidden /> Drop
          </Button>
        </div>
      )}
    </li>
  );
}
