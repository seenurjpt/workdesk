"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkPicker } from "@/components/shared/link-picker";
import { useApp } from "@/components/shared/user-context";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";
import { linkTaskNoteAction, unlinkTaskNoteAction } from "@/server/actions";
import { getLinkedTasksAction } from "@/server/queries";

export const linkedTasksKey = (noteId: string) => ["links", "note", noteId] as const;

export function LinkedTasks({ noteId, initial }: { noteId: string; initial: TaskDTO[] }) {
  const { user } = useApp();
  const qc = useQueryClient();
  const { open } = useTaskEditor();
  const { toggleDone } = useTaskMutations();

  const { data: tasks = initial } = useQuery({
    queryKey: linkedTasksKey(noteId),
    initialData: initial,
    queryFn: async () => {
      const res = await getLinkedTasksAction(noteId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["links"] });

  async function link(taskId: string) {
    const res = await linkTaskNoteAction({ taskId, noteId });
    if (!res.ok) return toast.error(res.error);
    void refresh();
  }
  async function unlink(taskId: string) {
    const res = await unlinkTaskNoteAction({ taskId, noteId });
    if (!res.ok) return toast.error(res.error);
    void refresh();
  }

  return (
    <section aria-labelledby="linked-tasks-heading" className="bg-surface-soft rounded-3xl p-4">
      <h2 id="linked-tasks-heading" className="text-nav mb-2">
        Linked tasks
      </h2>
      {tasks.length === 0 ? (
        <p className="text-caption text-muted-strong">
          Type <kbd className="bg-surface rounded px-1">@</kbd> in the note to mention a task, or
          link one below.
        </p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => {
            const done = t.status === "done";
            const due = t.dueAt ? formatDue(t.dueAt, t.allDay, user.timezone) : null;
            return (
              <li key={t.id} className="hover:bg-surface flex items-start gap-2 rounded-xl p-1">
                <button
                  type="button"
                  role="checkbox"
                  data-small-ok
                  aria-checked={done}
                  aria-label={done ? `Mark "${t.title}" as not done` : `Complete "${t.title}"`}
                  onClick={() => toggleDone.mutate({ task: t, done: !done })}
                  className={cn(
                    "hit-area mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    done
                      ? "border-accent bg-accent text-on-accent"
                      : "border-muted-strong hover:border-accent",
                  )}
                >
                  {done && <Check className="size-3" strokeWidth={3} aria-hidden />}
                </button>
                <button type="button" onClick={() => open(t)} className="min-w-0 flex-1 text-left">
                  <span
                    className={cn(
                      "text-body-sm block truncate",
                      done && "text-muted-strong line-through",
                    )}
                  >
                    {t.title}
                  </span>
                  {due && (
                    <span
                      className={cn(
                        "text-caption text-muted-strong inline-flex items-center gap-1",
                        due.overdue && !done && "text-danger font-semibold",
                      )}
                    >
                      <Calendar className="size-3" aria-hidden />
                      {due.label}
                    </span>
                  )}
                </button>
                <Button
                  variant="utility"
                  size="iconSm"
                  aria-label={`Unlink "${t.title}"`}
                  onClick={() => unlink(t.id)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <LinkPicker
        kind="task"
        excludeIds={tasks.map((t) => t.id)}
        onPick={(item) => link(item.id)}
      />
    </section>
  );
}
