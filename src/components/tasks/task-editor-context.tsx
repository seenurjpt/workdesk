"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { TaskDTO } from "@/lib/types";
import { TaskEditor } from "./task-editor";

interface TaskEditorContextValue {
  open: (task: TaskDTO) => void;
  task: TaskDTO | null;
  close: () => void;
}
const TaskEditorContext = createContext<TaskEditorContextValue | null>(null);

function useTaskEditorContext(): TaskEditorContextValue {
  const ctx = useContext(TaskEditorContext);
  if (!ctx) throw new Error("Task editor hooks must be used inside TaskEditorProvider");
  return ctx;
}

export function useTaskEditor(): Pick<TaskEditorContextValue, "open"> {
  const { open } = useTaskEditorContext();
  return { open };
}

/**
 * Holds which task is being edited. The editor itself renders in `TaskEditorHost`, which sits
 * deeper in the tree (inside the reminder provider) because the editor needs reminder state.
 */
export function TaskEditorProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<TaskDTO | null>(null);
  const value = useMemo(() => ({ open: setTask, task, close: () => setTask(null) }), [task]);
  return <TaskEditorContext.Provider value={value}>{children}</TaskEditorContext.Provider>;
}

/** One app-wide task editor, so lists, the board, the calendar and search all behave the same. */
export function TaskEditorHost() {
  const { task, close } = useTaskEditorContext();
  return <TaskEditor task={task} onClose={close} />;
}
