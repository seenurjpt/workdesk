"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertCircle, Bell, Calendar, MoreVertical, Repeat, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/components/shared/user-context";
import { StatusManager } from "@/components/statuses/status-manager";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { PriorityBadge } from "@/components/tasks/task-row";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { BOARD_KEY, invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { describeRrule } from "@/lib/recurrence";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";
import { moveTaskAction } from "@/server/actions";
import { getBoardDataAction } from "@/server/queries";
import { useQuickAdd } from "@/components/tasks/quick-add";
import { Button } from "@/components/ui/button";
import {
  applyColumn,
  buildColumns,
  neighbours,
  optimisticOrder,
  type Column,
  type GroupBy,
} from "./board-model";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "project", label: "Project" },
  { value: "priority", label: "Priority" },
];

function CardBody({ task, showProject }: { task: TaskDTO; showProject: boolean }) {
  const { user, projects } = useApp();
  const due = task.dueAt ? formatDue(task.dueAt, task.allDay, user.timezone) : null;
  const project =
    showProject && task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === "done";
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <>
      <span
        className={cn("text-body-sm block font-semibold", done && "text-muted-strong line-through")}
      >
        {task.title}
      </span>
      <span className="text-caption text-muted-strong mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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
          <span
            className="inline-flex items-center gap-1"
            title={describeRrule(task.recurrence.rrule)}
          >
            <Repeat className="size-3.5" aria-hidden />
            <span className="sr-only">{describeRrule(task.recurrence.rrule)}</span>
          </span>
        )}
        {task.reminders.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Bell className="size-3.5" aria-hidden />
            <span className="sr-only">Has reminders</span>
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span>
            {subDone}/{task.subtasks.length}
          </span>
        )}
        {project && (
          <span className="bg-surface-soft inline-flex items-center gap-1.5 rounded-full px-2 py-0.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden
            />
            {project.name}
          </span>
        )}
      </span>
    </>
  );
}

interface CardProps {
  task: TaskDTO;
  columns: Column[];
  columnId: string;
  index: number;
  count: number;
  showProject: boolean;
  onMoveTo: (taskId: string, toColumnId: string, index?: number) => void;
}

function Card({ task, columns, columnId, index, count, showProject, onMoveTo }: CardProps) {
  const { open } = useTaskEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group border-border bg-surface hover:border-muted-strong focus-visible:outline-focus has-[.card-edit:focus-visible]:outline-focus relative rounded-2xl border p-4 transition-[border-color,box-shadow] duration-150 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 has-[.card-edit:focus-visible]:outline-2 has-[.card-edit:focus-visible]:outline-offset-2 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
      aria-label={`${task.title}. Press space to pick up and move with arrow keys.`}
    >
      <button
        type="button"
        onClick={() => open(task)}
        className="card-edit block w-full rounded-lg pr-7 text-left focus-visible:outline-none"
        aria-label={`Edit "${task.title}"`}
      >
        <CardBody task={task} showProject={showProject} />
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`Move "${task.title}"`}
          className="text-muted-strong hover:bg-surface-soft hover:text-foreground absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg transition-colors"
        >
          <MoreVertical className="size-4" aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="border-border bg-surface shadow-float z-50 min-w-48 rounded-xl border p-1"
          >
            <DropdownMenu.Label className="text-caption text-muted-strong px-3 py-1 font-semibold">
              Move to
            </DropdownMenu.Label>
            {columns
              .filter((c) => c.id !== columnId)
              .map((c) => (
                <DropdownMenu.Item
                  key={c.id}
                  onSelect={() => onMoveTo(task.id, c.id)}
                  className="text-nav data-[highlighted]:bg-surface-soft cursor-pointer rounded-lg px-3 py-2 outline-none"
                >
                  {c.title}
                </DropdownMenu.Item>
              ))}
            <DropdownMenu.Separator className="bg-border my-1 h-px" />
            <DropdownMenu.Item
              disabled={index === 0}
              onSelect={() => onMoveTo(task.id, columnId, index - 1)}
              className="text-nav data-[highlighted]:bg-surface-soft cursor-pointer rounded-lg px-3 py-2 outline-none data-[disabled]:opacity-40"
            >
              Move up
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={index === count - 1}
              onSelect={() => onMoveTo(task.id, columnId, index + 1)}
              className="text-nav data-[highlighted]:bg-surface-soft cursor-pointer rounded-lg px-3 py-2 outline-none data-[disabled]:opacity-40"
            >
              Move down
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

function ColumnView({
  column,
  ids,
  tasksById,
  allColumns,
  showProject,
  onMoveTo,
}: {
  column: Column;
  ids: string[];
  tasksById: Map<string, TaskDTO>;
  allColumns: Column[];
  showProject: boolean;
  onMoveTo: CardProps["onMoveTo"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      aria-labelledby={`col-${column.id}`}
      className={cn(
        // Columns share the width, so four fit side by side; with more (grouping by project, say)
        // each keeps a readable minimum and the row scrolls sideways. A column is as tall as its
        // cards: no scrolling inside it, the page scrolls instead.
        "bg-surface-soft flex min-h-72 min-w-[16rem] flex-1 basis-0 snap-start flex-col rounded-3xl p-3",
        isOver && "ring-accent ring-2 ring-inset",
      )}
    >
      <h2 id={`col-${column.id}`} className="text-nav mb-3 flex items-center gap-2 px-1">
        {column.color && (
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
            aria-hidden
          />
        )}
        {column.title}
        <span className="text-caption bg-surface text-muted-strong rounded-full px-2 py-0.5">
          {ids.length}
        </span>
      </h2>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={`${column.title} tasks`}
          className="flex min-h-16 flex-1 flex-col gap-2"
        >
          {ids.map((id, index) => {
            const task = tasksById.get(id);
            return task ? (
              <Card
                key={id}
                task={task}
                columns={allColumns}
                columnId={column.id}
                index={index}
                count={ids.length}
                showProject={showProject}
                onMoveTo={onMoveTo}
              />
            ) : null;
          })}
          {ids.length === 0 && (
            <li className="text-caption text-muted-strong px-2 py-4 text-center">
              Drop tasks here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

export function BoardView({ initial, group }: { initial: TaskDTO[]; group: GroupBy }) {
  const { projects, user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const quickAdd = useQuickAdd();

  const { data: tasks = initial } = useQuery({
    queryKey: [BOARD_KEY],
    initialData: initial,
    queryFn: async () => {
      const res = await getBoardDataAction();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const customStatuses = user.customStatuses;
  const statusOrder = user.statusOrder;
  const columns = useMemo(
    () => buildColumns(tasks, group, projects, customStatuses, statusOrder),
    [tasks, group, projects, customStatuses, statusOrder],
  );
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const baseItems = useMemo(
    () =>
      Object.fromEntries(columns.map((c) => [c.id, c.tasks.map((t) => t.id)])) as Record<
        string,
        string[]
      >,
    [columns],
  );

  const [dragItems, setDragItems] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const items = dragItems ?? baseItems;

  const sensors = useSensors(
    // Mouse: drag after moving a few pixels. Touch: press and hold for a moment, then drag, so a
    // normal swipe still scrolls the page and the columns.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): string | undefined =>
    id in items ? id : Object.keys(items).find((k) => items[k].includes(id));

  /** Optimistically places a task, then persists. `finalIds` is the destination column after the move. */
  function commit(taskId: string, columnId: string, finalIds: string[]) {
    const column = columns.find((c) => c.id === columnId);
    const moved = tasksById.get(taskId);
    if (!column || !moved) return;
    const index = finalIds.indexOf(taskId);
    const others = finalIds
      .filter((id) => id !== taskId)
      .map((id) => tasksById.get(id))
      .filter((t): t is TaskDTO => Boolean(t));
    const { prevId, nextId } = neighbours(others, index);
    const order = optimisticOrder(others, index);

    const snapshot = qc.getQueryData<TaskDTO[]>([BOARD_KEY]);
    qc.setQueryData<TaskDTO[]>([BOARD_KEY], (old = []) =>
      old.map((t) =>
        t.id === taskId ? { ...applyColumn(t, column.key), order: order ?? t.order } : t,
      ),
    );
    void moveTaskAction({ taskId, column: column.key, prevId, nextId }).then((res) => {
      if (!res.ok) {
        qc.setQueryData([BOARD_KEY], snapshot);
        toast.error(res.error);
        return;
      }
      if (res.data.next?.dueAt) {
        toast("Done. Next one scheduled", {
          description: formatDue(res.data.next.dueAt, res.data.next.allDay, user.timezone).label,
        });
      }
      invalidateTaskQueries(qc);
      router.refresh();
    });
  }

  function moveTo(taskId: string, toColumnId: string, index?: number) {
    const from = findContainer(taskId);
    if (!from) return;
    const target = [...(baseItems[toColumnId] ?? [])].filter((id) => id !== taskId);
    if (index !== undefined && from === toColumnId) {
      const list = baseItems[from];
      const current = list.indexOf(taskId);
      if (index < 0 || index >= list.length || index === current) return;
      commit(taskId, toColumnId, arrayMove(list, current, index));
      return;
    }
    commit(taskId, toColumnId, [...target, taskId]);
  }

  function onDragStart(e: DragStartEvent) {
    // a small buzz on phones that support it, so the pick-up is felt
    if (e.activatorEvent.type.startsWith("touch")) navigator.vibrate?.(12);
    setActiveId(String(e.active.id));
    setDragItems(baseItems);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const fromC = findContainer(activeKey);
    const toC = findContainer(overKey);
    if (!fromC || !toC || fromC === toC) return;
    setDragItems((prev) => {
      const cur = prev ?? baseItems;
      const dest = cur[toC];
      const overIndex = dest.indexOf(overKey);
      const below =
        over.rect &&
        active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const index = overKey in cur ? dest.length : overIndex + (below ? 1 : 0);
      return {
        ...cur,
        [fromC]: cur[fromC].filter((id) => id !== activeKey),
        [toC]: [...dest.slice(0, index), activeKey, ...dest.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const activeKey = String(active.id);
    const current = dragItems ?? baseItems;
    setActiveId(null);
    setDragItems(null);
    if (!over) return;
    const toC = findContainer(activeKey);
    if (!toC) return;
    let finalIds = current[toC];
    const overKey = String(over.id);
    if (findContainer(overKey) === toC && overKey !== activeKey && !(overKey in current)) {
      finalIds = arrayMove(finalIds, finalIds.indexOf(activeKey), finalIds.indexOf(overKey));
    }
    const original = Object.keys(baseItems).find((k) => baseItems[k].includes(activeKey));
    const unchanged = original === toC && baseItems[toC].join() === finalIds.join();
    if (!unchanged) commit(activeKey, toC, finalIds);
  }

  /**
   * Which column or card is the drag over? Where the pointer is wins. With "closest corners"
   * alone, an empty column (no cards to be close to) could never be dropped on: the nearest
   * thing was always a card in the column the drag started from.
   */
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const direct = hits.length > 0 ? hits : rectIntersection(args);
    let overId = getFirstCollision(direct, "id");
    if (overId == null) return closestCorners(args);
    if (String(overId) in items) {
      // Over a column: if it has cards, pick the card nearest the dragged one, else the column.
      const cards = new Set(items[String(overId)]);
      if (cards.size > 0) {
        const nearest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => cards.has(String(c.id))),
        });
        overId = nearest[0]?.id ?? overId;
      }
    }
    return [{ id: overId }];
  };

  const activeTask = activeId ? tasksById.get(activeId) : undefined;
  const empty = tasks.length === 0;

  return (
    <div>
      <div role="group" aria-label="Group board by" className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.value}
            type="button"
            aria-pressed={group === g.value}
            onClick={() =>
              router.replace(g.value === "status" ? pathname : `${pathname}?group=${g.value}`)
            }
            className={cn(
              "text-nav min-h-9 rounded-full border px-4",
              group === g.value
                ? "bg-btn-primary text-btn-primary-fg border-transparent"
                : "border-border hover:border-muted-strong hover:bg-surface-soft transition-colors duration-150",
            )}
          >
            {g.label}
          </button>
        ))}
        {group === "status" && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-nav border-border hover:border-muted-strong hover:bg-surface-soft ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed px-4 transition-colors duration-150"
              >
                <Settings2 className="size-4" aria-hidden /> Manage statuses
              </button>
            </DialogTrigger>
            <DialogContent
              title="Manage statuses"
              description="Add your own columns and drag them into the order you want. They sit between Blocked and Done."
              className="max-w-lg"
            >
              <StatusManager />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {empty ? (
        <EmptyState
          title="Nothing on the board"
          body="Add a task and drag it across the columns as work moves forward."
          action={
            <Button variant="accent" onClick={quickAdd.open}>
              Add task
            </Button>
          }
        />
      ) : (
        <DndContext
          id="board-dnd"
          sensors={sensors}
          // Sliding the board while you hold a card near its edge. The default is fast enough to
          // cross a whole phone-sized board in under half a second, so it is slowed down here.
          autoScroll={{ acceleration: 2.5, interval: 8, threshold: { x: 0.18, y: 0.18 } }}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setDragItems(null);
          }}
        >
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
            {columns.map((column) => (
              <ColumnView
                key={column.id}
                column={column}
                ids={items[column.id] ?? []}
                tasksById={tasksById}
                allColumns={columns}
                showProject={group !== "project"}
                onMoveTo={moveTo}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <div className="border-border bg-surface shadow-float rounded-2xl border p-4">
                <CardBody task={activeTask} showProject={group !== "project"} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
