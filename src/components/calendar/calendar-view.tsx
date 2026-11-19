"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/shared/user-context";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { CALENDAR_KEY, invalidateTaskQueries } from "@/hooks/use-task-mutations";
import {
  dayLabel,
  gridDays,
  keyToUtc,
  stepAnchor,
  titleFor,
  visibleRange,
  weekdayHeaders,
  type CalendarMode,
} from "@/lib/calendar";
import { dayKey as toDayKey } from "@/lib/dates";
import { formatDue, parseLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";
import { rescheduleTaskAction } from "@/server/actions";
import { getCalendarDataAction } from "@/server/queries";
import { CreateTaskDialog } from "./create-task-dialog";

const MAX_CHIPS = 3;

/** Arrow keys move a lifted task one day (left/right) or one week (up/down). */
const gridKeyboard: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const rect = [...context.droppableRects.values()][0];
  const dx = rect?.width ?? 120;
  const dy = rect?.height ?? 100;
  const { x, y } = currentCoordinates;
  switch (event.code) {
    case "ArrowRight":
      return { x: x + dx, y };
    case "ArrowLeft":
      return { x: x - dx, y };
    case "ArrowDown":
      return { x, y: y + dy };
    case "ArrowUp":
      return { x, y: y - dy };
    default:
      return undefined;
  }
};

function Chip({
  task,
  timezone,
  onOpen,
  large,
}: {
  task: TaskDTO;
  timezone: string;
  onOpen: (t: TaskDTO) => void;
  large?: boolean;
}) {
  const { projects } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === "done";
  const time =
    task.dueAt && !task.allDay ? formatInTimeZone(new Date(task.dueAt), timezone, "h:mm a") : null;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpen(task)}
      style={{ borderLeftColor: project?.color }}
      className={cn(
        "text-caption border-l-border bg-surface-soft hover:bg-border/60 flex w-full items-center gap-1 truncate rounded-lg border-l-[3px] px-2 py-1 text-left transition-colors duration-150",
        large && "text-body-sm py-2",
        done && "text-muted-strong line-through",
        isDragging && "opacity-40",
      )}
      aria-label={`${task.title}${time ? `, ${time}` : ""}${done ? ", done" : ""}. Press space to pick up and move to another day.`}
      {...attributes}
      {...listeners}
    >
      {time && <span className="shrink-0 font-semibold">{time}</span>}
      <span className="truncate">{task.title}</span>
      {task.recurrence && <Repeat className="ml-auto size-3 shrink-0" aria-label="Repeats" />}
    </button>
  );
}

function DayCell({
  dayKey,
  today,
  inMonth,
  tasks,
  timezone,
  mode,
  selected,
  onOpen,
  onCreate,
  onSelect,
  onExpand,
}: {
  dayKey: string;
  today: string;
  inMonth: boolean;
  tasks: TaskDTO[];
  timezone: string;
  mode: CalendarMode;
  selected: boolean;
  onOpen: (t: TaskDTO) => void;
  onCreate: (key: string) => void;
  onSelect: (key: string) => void;
  onExpand: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey });
  const isToday = dayKey === today;
  const num = keyToUtc(dayKey).getUTCDate();
  const limit = mode === "week" ? tasks.length : MAX_CHIPS;
  const hidden = tasks.length - limit;

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={dayLabel(dayKey)}
      aria-selected={selected}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          // Desktop: click an empty area to add. Mobile: select the day.
          if (window.matchMedia("(min-width: 768px)").matches) onCreate(dayKey);
          else onSelect(dayKey);
        }
      }}
      className={cn(
        "group border-border md:hover:bg-surface-soft/50 min-h-24 rounded-2xl border p-1.5 transition-colors duration-150 md:min-h-28",
        mode === "week" && "md:min-h-72",
        !inMonth && "bg-surface-soft/60 text-muted-strong",
        isOver && "bg-band",
        selected && "ring-accent ring-2 ring-inset",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onSelect(dayKey)}
          data-small-ok
          aria-label={`Select ${dayLabel(dayKey)}`}
          className={cn(
            "text-caption inline-flex size-7 items-center justify-center rounded-full font-semibold",
            isToday && "bg-accent text-on-accent",
          )}
        >
          {num}
        </button>
        <button
          type="button"
          onClick={() => onCreate(dayKey)}
          aria-label={`Add task on ${dayLabel(dayKey)}`}
          className="text-muted-strong hover:bg-border/60 hover:text-foreground hidden size-7 items-center justify-center rounded-lg opacity-0 transition-colors group-focus-within:opacity-100 group-hover:opacity-100 md:inline-flex"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      {/* Desktop: task chips. */}
      <div className="hidden space-y-1 md:block">
        {tasks.slice(0, limit).map((t) => (
          <Chip key={t.id} task={t} timezone={timezone} onOpen={onOpen} large={mode === "week"} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => onExpand(dayKey)}
            className="text-caption text-accent-text hover:bg-surface-soft w-full rounded-lg px-2 py-0.5 text-left font-semibold transition-colors duration-150"
          >
            +{hidden} more
          </button>
        )}
      </div>

      {/* Mobile: just markers; the selected day's tasks are listed below the grid. */}
      <div className="flex flex-wrap gap-0.5 md:hidden" aria-hidden>
        {tasks.slice(0, 4).map((t) => (
          <span key={t.id} className="bg-accent-text size-1.5 rounded-full" />
        ))}
      </div>
    </div>
  );
}

interface Props {
  initial: TaskDTO[];
  mode: CalendarMode;
  anchor: string;
  today: string;
}

export function CalendarView({ initial, mode, anchor, today }: Props) {
  const { user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { open: openTask } = useTaskEditor();
  const tz = user.timezone;

  const days = useMemo(
    () => gridDays(mode, anchor, user.weekStartsOn),
    [mode, anchor, user.weekStartsOn],
  );
  const range = useMemo(() => visibleRange(days, tz), [days, tz]);
  const queryKey = [CALENDAR_KEY, range.from.toISOString(), range.to.toISOString()] as const;

  const { data: tasks = initial } = useQuery({
    queryKey,
    initialData: initial,
    queryFn: async () => {
      const res = await getCalendarDataAction({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const key = toDayKey(new Date(t.dueAt), tz);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks, tz]);

  const [creating, setCreating] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(days.includes(today) ? today : days[0]);
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);
  const lastDrag = useRef(0);

  const sensors = useSensors(
    // Mouse: drag after moving a few pixels. Touch: press and hold for a moment, then drag, so a
    // normal swipe still scrolls the page and the columns.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: gridKeyboard,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const go = (next: { mode?: CalendarMode; anchor?: string }) => {
    const m = next.mode ?? mode;
    const a = next.anchor ?? anchor;
    router.push(`${pathname}?view=${m}&date=${a}`);
  };

  const open = (t: TaskDTO) => {
    // A keyboard lift ends with the same key that opens a task; ignore that click.
    if (Date.now() - lastDrag.current < 400) return;
    openTask(t);
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    lastDrag.current = Date.now();
    setActiveTask(null);
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const target = String(over.id);
    if (!task?.dueAt || target === toDayKey(new Date(task.dueAt), tz)) {
      if (!task?.dueAt) return;
      return;
    }
    const keepTime = !task.allDay;
    const dueAt = parseLocalInput(
      target,
      keepTime ? formatInTimeZone(new Date(task.dueAt), tz, "HH:mm") : undefined,
      tz,
    );

    const snapshot = qc.getQueryData<TaskDTO[]>(queryKey);
    qc.setQueryData<TaskDTO[]>(queryKey, (old = []) =>
      old.map((t) => (t.id === task.id ? { ...t, dueAt: dueAt.toISOString() } : t)),
    );
    void rescheduleTaskAction({ taskId: task.id, dayKey: target }).then((res) => {
      if (!res.ok) {
        qc.setQueryData(queryKey, snapshot);
        return void toast.error(res.error);
      }
      toast("Rescheduled", { description: `${task.title} · ${dayLabel(target)}` });
      invalidateTaskQueries(qc);
      router.refresh();
    });
  }

  const selectedTasks = byDay.get(selected) ?? [];
  const currentMonth = anchor.slice(0, 7);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-heading mr-2 text-2xl font-bold" aria-live="polite">
          {titleFor(mode, anchor, user.weekStartsOn)}
        </h2>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label={mode === "month" ? "Previous month" : "Previous week"}
          onClick={() => go({ anchor: stepAnchor(mode, anchor, -1) })}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label={mode === "month" ? "Next month" : "Next week"}
          onClick={() => go({ anchor: stepAnchor(mode, anchor, 1) })}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => go({ anchor: today })}>
          Today
        </Button>
        <div role="group" aria-label="Calendar view" className="ml-auto flex gap-2">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => go({ mode: m })}
              className={cn(
                "text-nav min-h-9 rounded-full border px-4 capitalize",
                mode === m
                  ? "bg-btn-primary text-btn-primary-fg border-transparent"
                  : "border-border hover:border-muted-strong hover:bg-surface-soft transition-colors duration-150",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        id="calendar-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setActiveTask(tasks.find((t) => t.id === e.active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div
          role="grid"
          aria-label={titleFor(mode, anchor, user.weekStartsOn)}
          className="space-y-1 sm:space-y-2"
        >
          <div role="row" className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekdayHeaders(user.weekStartsOn).map((d, i) => {
              const isTodayColumn = days.indexOf(today) % 7 === i;
              return (
                <div
                  key={d}
                  role="columnheader"
                  aria-label={d}
                  className={cn(
                    "text-caption flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-center font-semibold tracking-wide uppercase",
                    isTodayColumn ? "bg-band text-accent-text" : "text-muted-strong",
                  )}
                >
                  <span className="sm:hidden" aria-hidden>
                    {d[0]}
                  </span>
                  <span className="hidden sm:inline" aria-hidden>
                    {d}
                  </span>
                  {isTodayColumn && (
                    <span className="bg-accent hidden size-1.5 rounded-full sm:block" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
          <div role="rowgroup" className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((key) => (
              <DayCell
                key={key}
                dayKey={key}
                today={today}
                inMonth={mode === "week" || key.slice(0, 7) === currentMonth}
                tasks={byDay.get(key) ?? []}
                timezone={tz}
                mode={mode}
                selected={key === selected}
                onOpen={open}
                onCreate={setCreating}
                onSelect={setSelected}
                onExpand={(k) => go({ mode: "week", anchor: k })}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="text-caption border-border bg-surface shadow-float rounded-lg border px-2 py-1 font-semibold">
              {activeTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Mobile agenda for the selected day */}
      <section aria-labelledby="agenda-heading" className="mt-4 md:hidden">
        <div className="mb-2 flex items-center">
          <h3 id="agenda-heading" className="text-nav">
            {dayLabel(selected)}
          </h3>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setCreating(selected)}
          >
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
        {selectedTasks.length === 0 ? (
          <p className="text-caption text-muted-strong">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {selectedTasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className={cn(
                    "text-body-sm bg-surface-soft flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left",
                    t.status === "done" && "text-muted-strong line-through",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-caption text-muted-strong">
                    {t.dueAt
                      ? formatDue(t.dueAt, t.allDay, tz).label.replace(
                          /^[A-Za-z]+\s?\d*\s?[A-Za-z]*\s?/,
                          "",
                        )
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateTaskDialog dayKey={creating} onClose={() => setCreating(null)} />
    </div>
  );
}
