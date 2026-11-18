"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { AlertCircle, CalendarClock, Check, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/components/shared/user-context";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { dayRange } from "@/lib/dates";
import { parseLocalInput } from "@/lib/format";
import { addDaysKey } from "@/lib/calendar";
import { dayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";
import { updateTaskAction } from "@/server/actions";

type FollowUpState = "overdue" | "today" | "later" | "none";

function stateOf(followUpAt: string | null, now: Date, tz: string): FollowUpState {
  if (!followUpAt) return "none";
  const today = dayRange(now, tz, 0);
  const at = new Date(followUpAt);
  if (at < today.start) return "overdue";
  if (at < today.end) return "today";
  return "later";
}

export function WaitingList({ tasks }: { tasks: TaskDTO[] }) {
  const { user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const { open } = useTaskEditor();
  const tz = user.timezone;
  const now = new Date();

  async function patch(
    task: TaskDTO,
    waitingOn: Parameters<typeof updateTaskAction>[1],
    message: string,
  ) {
    const res = await updateTaskAction(task.id, { waitingOn });
    if (!res.ok) return toast.error(res.error);
    toast.success(message, { description: task.title });
    invalidateTaskQueries(qc);
    router.refresh();
  }

  function pushFollowUp(task: TaskDTO, days: number) {
    const w = task.waitingOn;
    if (!w) return;
    const target = parseLocalInput(addDaysKey(dayKey(now, tz), days), undefined, tz);
    void patch(
      task,
      { person: w.person, note: w.note, followUpAt: target },
      `Follow up in ${days} day${days === 1 ? "" : "s"}`,
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting on anyone"
        body="When a task depends on someone else, mark it “Waiting on” in the task editor, or type wait:Priya in quick-add."
      />
    );
  }

  return (
    <ul aria-label="Tasks waiting on others" className="border-border border-t">
      {tasks.map((task) => {
        const w = task.waitingOn;
        if (!w) return null;
        const state = stateOf(w.followUpAt, now, tz);
        return (
          <li
            key={task.id}
            className={cn(
              "border-border flex flex-wrap items-start gap-3 border-b px-1 py-4",
              state === "overdue" && "bg-danger/5",
            )}
          >
            <Hourglass className="text-muted-strong mt-1 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => open(task)}
                className="text-body-sm block text-left font-semibold hover:underline"
              >
                {task.title}
              </button>
              <p className="text-body-sm">
                Waiting on <span className="font-semibold">{w.person}</span>
              </p>
              {w.note && <p className="text-caption text-muted-strong">{w.note}</p>}
              <p
                className={cn(
                  "text-caption mt-1 inline-flex items-center gap-1",
                  state === "overdue" && "text-danger font-semibold",
                  state === "today" && "text-accent-text font-semibold",
                  (state === "later" || state === "none") && "text-muted-strong",
                )}
              >
                {state === "overdue" ? (
                  <AlertCircle className="size-3.5" aria-hidden />
                ) : (
                  <CalendarClock className="size-3.5" aria-hidden />
                )}
                {state === "overdue" && "Follow-up overdue · "}
                {state === "today" && "Follow up today · "}
                {w.followUpAt
                  ? formatInTimeZone(new Date(w.followUpAt), tz, "EEE d MMM")
                  : "No follow-up date"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => pushFollowUp(task, 1)}>
                +1 day
              </Button>
              <Button size="sm" variant="secondary" onClick={() => pushFollowUp(task, 3)}>
                +3 days
              </Button>
              <Button size="sm" onClick={() => void patch(task, null, "No longer waiting")}>
                <Check className="size-4" aria-hidden /> Got it
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
