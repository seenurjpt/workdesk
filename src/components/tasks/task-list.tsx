"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarPlus, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/components/shared/user-context";
import { VIEW_KEY, useTaskMutations } from "@/hooks/use-task-mutations";
import { dayKey, dayRange, isOverdue } from "@/lib/dates";
import type { PriorityValue, TaskDTO } from "@/lib/types";
import { getViewDataAction } from "@/server/queries";
import type { TaskView, ViewData } from "@/server/tasks";
import { useTaskEditor } from "./task-editor-context";
import { TaskRow } from "./task-row";
import { useQuickAdd } from "./quick-add";

export type ListMode = "today" | "upcoming" | "flat" | "all";

interface Props {
  view: TaskView;
  initial: ViewData;
  mode: ListMode;
  emptyTitle: string;
  emptyBody: string;
}

export function TaskList({ view, initial, mode, emptyTitle, emptyBody }: Props) {
  const { user, projects } = useApp();
  const quickAdd = useQuickAdd();
  const { toggleDone, update, remove } = useTaskMutations();
  const { open: openEditor } = useTaskEditor();

  const { data = initial } = useQuery({
    queryKey: [VIEW_KEY, JSON.stringify(view)],
    queryFn: async () => {
      const res = await getViewDataAction(view);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    initialData: initial,
  });

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const tz = user.timezone;

  const rowProps = (task: TaskDTO) => ({
    task,
    project: task.projectId ? projectById.get(task.projectId) : undefined,
    timezone: tz,
    onToggle: (t: TaskDTO, done: boolean) => toggleDone.mutate({ task: t, done }),
    onEdit: openEditor,
    onDelete: (t: TaskDTO) => remove.mutate(t),
    onPriority: (t: TaskDTO, priority: PriorityValue) =>
      update.mutate({ id: t.id, patch: { priority } }),
  });

  function renderList(tasks: TaskDTO[], label: string) {
    return (
      <ul aria-label={label} className="border-border border-t">
        {tasks.map((t) => (
          <TaskRow key={t.id} {...rowProps(t)} />
        ))}
      </ul>
    );
  }

  const isEmpty = data.tasks.length === 0 && (mode !== "today" || data.completed.length === 0);
  if (isEmpty && data.suggestions.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        body={emptyBody}
        action={
          <Button variant="accent" onClick={quickAdd.open}>
            Add task
          </Button>
        }
      />
    );
  }

  const now = new Date();
  const todayStart = dayRange(now, tz, 0).start;

  let body: React.ReactNode;
  if (mode === "today") {
    const isLate = (t: TaskDTO) =>
      t.dueAt !== null && isOverdue(new Date(t.dueAt), t.allDay, now, tz);
    const overdue = data.tasks.filter(isLate);
    const dueToday = data.tasks.filter((t) => !isLate(t));
    body = (
      <>
        {overdue.length > 0 && (
          <Section title="Overdue" count={overdue.length}>
            {renderList(overdue, "Overdue tasks")}
          </Section>
        )}
        {dueToday.length > 0 && (
          <Section title="Today" count={dueToday.length}>
            {renderList(dueToday, "Tasks due today")}
          </Section>
        )}
        {data.suggestions.length > 0 && (
          <Section title="Plan for today" count={data.suggestions.length}>
            <p className="text-body-sm text-muted-strong mb-2">
              Unscheduled or soon-due tasks you could pull into today.
            </p>
            <ul aria-label="Suggested tasks" className="border-border border-t">
              {data.suggestions.map((t) => (
                <div key={t.id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <ul>
                      <TaskRow {...rowProps(t)} />
                    </ul>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Add "${t.title}" to today`}
                    onClick={() =>
                      update.mutate({ id: t.id, patch: { dueAt: todayStart, allDay: true } })
                    }
                  >
                    <CalendarPlus className="size-4" aria-hidden />
                    <span className="max-sm:sr-only">Today</span>
                  </Button>
                </div>
              ))}
            </ul>
          </Section>
        )}
        {data.completed.length > 0 && (
          <details className="mt-8">
            <summary className="text-nav flex cursor-pointer items-center gap-2 py-2">
              <ChevronDown className="size-4" aria-hidden /> Completed today (
              {data.completed.length})
            </summary>
            {renderList(data.completed, "Completed today")}
          </details>
        )}
      </>
    );
  } else if (mode === "all") {
    // Every open task, in the order you would want to deal with it.
    const todayEnd = dayRange(now, tz, 0).end;
    const upcomingEnd = dayRange(now, tz, 15).start;
    const buckets = { Overdue: [], Today: [], Upcoming: [], Later: [], "No date": [] } as Record<
      string,
      TaskDTO[]
    >;
    for (const t of data.tasks) {
      if (!t.dueAt) buckets["No date"].push(t);
      else if (isOverdue(new Date(t.dueAt), t.allDay, now, tz)) buckets.Overdue.push(t);
      else if (new Date(t.dueAt) < todayEnd) buckets.Today.push(t);
      else if (new Date(t.dueAt) < upcomingEnd) buckets.Upcoming.push(t);
      else buckets.Later.push(t);
    }
    body = Object.entries(buckets)
      .filter(([, list]) => list.length > 0)
      .map(([title, list]) => (
        <Section key={title} title={title} count={list.length}>
          {renderList(list, `${title} tasks`)}
        </Section>
      ));
  } else if (mode === "upcoming") {
    const groups = new Map<string, TaskDTO[]>();
    for (const t of data.tasks) {
      if (!t.dueAt) continue;
      const k = dayKey(new Date(t.dueAt), tz);
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    body = [...groups.entries()].map(([key, tasks]) => (
      <Section
        key={key}
        title={formatInTimeZone(new Date(tasks[0].dueAt as string), tz, "EEEE, d MMM")}
        count={tasks.length}
      >
        {renderList(tasks, `Tasks on ${key}`)}
      </Section>
    ));
  } else {
    body = renderList(data.tasks, "Tasks");
  }

  return (
    <>
      {body}
      <button
        type="button"
        onClick={quickAdd.open}
        className="text-nav text-muted-strong hover:bg-surface-soft hover:text-foreground mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 transition-colors duration-150"
      >
        <Plus className="size-4" aria-hidden /> Add task
      </button>
    </>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-nav mb-2 flex items-center gap-2">
        {title}
        <span className="text-caption bg-surface-soft text-muted-strong rounded-full px-2 py-0.5">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}
