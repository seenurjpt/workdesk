"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "@/components/shared/user-context";
import { useOffline } from "@/components/shared/offline-provider";
import { isNetworkError } from "@/lib/offline-queue";
import { formatDue } from "@/lib/format";
import type { TaskDTO } from "@/lib/types";
import { useTrashFx } from "@/components/shared/trash-bin";
import type { ViewData } from "@/server/tasks";
import type { TaskUpdate } from "@/schemas";
import {
  deleteTaskAction,
  restoreTaskAction,
  setTaskDoneAction,
  updateTaskAction,
} from "@/server/actions";

export const VIEW_KEY = "view";
export const BOARD_KEY = "board";
export const CALENDAR_KEY = "calendar";

/** Refresh every cached task query after a change. */
export function invalidateTaskQueries(qc: ReturnType<typeof useQueryClient>): void {
  for (const key of [VIEW_KEY, BOARD_KEY, CALENDAR_KEY, "links"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

function patchViews(qc: ReturnType<typeof useQueryClient>, fn: (data: ViewData) => ViewData): void {
  qc.setQueriesData<ViewData>({ queryKey: [VIEW_KEY] }, (old) => (old ? fn(old) : old));
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useApp();
  const offline = useOffline();

  const settle = () => {
    invalidateTaskQueries(qc);
    router.refresh();
  };

  const toggleDone = useMutation({
    mutationFn: async ({ task, done }: { task: TaskDTO; done: boolean }) => {
      // Offline: keep the optimistic change and send it when the connection is back.
      const keepForLater = () => {
        offline.queue({ type: "toggleDone", taskId: task.id, done });
        toast("Saved offline", { description: "It will sync when you're back online." });
        return {
          task: { ...task, status: done ? ("done" as const) : ("todo" as const) },
          next: null,
        };
      };
      if (!offline.online) return keepForLater();
      try {
        const res = await setTaskDoneAction(task.id, done);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      } catch (error) {
        if (isNetworkError(error)) return keepForLater();
        throw error;
      }
    },
    onMutate: async ({ task, done }) => {
      await qc.cancelQueries({ queryKey: [VIEW_KEY] });
      const snapshot = qc.getQueriesData<ViewData>({ queryKey: [VIEW_KEY] });
      patchViews(qc, (d) =>
        done
          ? {
              ...d,
              tasks: d.tasks.filter((t) => t.id !== task.id),
              suggestions: d.suggestions.filter((t) => t.id !== task.id),
              completed: [
                { ...task, status: "done", completedAt: new Date().toISOString() },
                ...d.completed,
              ],
            }
          : {
              ...d,
              completed: d.completed.filter((t) => t.id !== task.id),
              tasks: [{ ...task, status: "todo", completedAt: null }, ...d.tasks],
            },
      );
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(err.message);
    },
    onSuccess: (data, { task, done }) => {
      if (done) {
        const next = data.next?.dueAt
          ? formatDue(data.next.dueAt, data.next.allDay, user.timezone).label
          : null;
        toast("Task completed", {
          description: next ? `${task.title} · next: ${next}` : task.title,
          action: { label: "Undo", onClick: () => toggleDone.mutate({ task, done: false }) },
        });
      }
    },
    onSettled: settle,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskUpdate }) => {
      const res = await updateTaskAction(id, patch);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onError: (err) => toast.error(err.message),
    onSettled: settle,
  });

  const fx = useTrashFx();
  const remove = useMutation({
    mutationFn: async (task: TaskDTO) => {
      const res = await deleteTaskAction(task.id);
      if (!res.ok) throw new Error(res.error);
    },
    onMutate: async (task) => {
      // Before the row leaves the page, so the animation can start from where it was.
      fx.fly(task.id, task.title);
      await qc.cancelQueries({ queryKey: [VIEW_KEY] });
      const snapshot = qc.getQueriesData<ViewData>({ queryKey: [VIEW_KEY] });
      patchViews(qc, (d) => ({
        tasks: d.tasks.filter((t) => t.id !== task.id),
        completed: d.completed.filter((t) => t.id !== task.id),
        suggestions: d.suggestions.filter((t) => t.id !== task.id),
      }));
      return { snapshot };
    },
    onError: (err, _task, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(err.message);
    },
    onSuccess: (_d, task) => {
      toast("Task deleted", {
        description: task.title,
        action: {
          label: "Undo",
          onClick: async () => {
            await restoreTaskAction(task.id);
            settle();
          },
        },
      });
    },
    onSettled: settle,
  });

  return { toggleDone, update, remove };
}
