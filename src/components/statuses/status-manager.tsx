"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Modifier } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/shared/user-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input } from "@/components/ui/input";
import {
  MAX_CUSTOM_STATUSES,
  MAX_STATUS_NAME,
  statusList,
  type CustomStatus,
  type StatusOption,
} from "@/lib/statuses";
import { cn } from "@/lib/utils";
import {
  addStatusAction,
  removeStatusAction,
  renameStatusAction,
  reorderStatusesAction,
} from "@/server/actions";

/**
 * Add, rename, remove and reorder task statuses. Every status except Done can be dragged into any
 * position; the four built-in ones cannot be renamed or removed. Used on the Settings page and in
 * the board's "Manage statuses" dialog.
 */
export function StatusManager() {
  const router = useRouter();
  const { user } = useApp();
  const custom = user.customStatuses;
  const savedOrder = user.statusOrder;
  // Shows a new order straight away while it saves. It is only used while it still belongs to the
  // data it was made from (`base`), so fresh data from the server always wins.
  const [local, setLocal] = useState<{ base: string[]; list: string[] } | null>(null);
  const natural = statusList(custom, savedOrder).filter((s) => s.value !== "done");
  const ordered: StatusOption[] =
    local && local.base === savedOrder
      ? local.list
          .map((k) => natural.find((s) => s.value === k))
          .filter((s): s is StatusOption => Boolean(s))
      : natural;

  const listRef = useRef<HTMLUListElement>(null);
  // Keeps the dragged row inside the list and moving up and down only. Without this a row can be
  // dragged out of the dialog, and the dialog keeps growing its scroll area.
  const keepInside: Modifier = ({ transform, draggingNodeRect }) => {
    const box = listRef.current?.getBoundingClientRect();
    if (!box || !draggingNodeRect) return { ...transform, x: 0 };
    const minY = box.top - draggingNodeRect.top;
    const maxY = box.bottom - draggingNodeRect.bottom;
    return { ...transform, x: 0, y: Math.min(Math.max(transform.y, minY), maxY) };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<CustomStatus | null>(null);
  const [pending, start] = useTransition();
  const full = custom.length >= MAX_CUSTOM_STATUSES;

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await addStatusAction(name);
      if (!r.ok) return setError(r.error);
      toast.success(`Added "${name.trim()}"`);
      setName("");
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const keys = ordered.map((s) => s.value);
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const list = arrayMove(keys, from, to);
    setLocal({ base: savedOrder, list });
    start(async () => {
      const r = await reorderStatusesAction(list);
      if (!r.ok) {
        toast.error(r.error);
        setLocal(null);
      }
      router.refresh();
    });
  }

  function rename(s: CustomStatus, value: string) {
    if (value.trim() === s.name) return;
    start(async () => {
      const r = await renameStatusAction(s.key, value);
      if (!r.ok) toast.error(r.error);
      else toast.success("Status renamed");
      router.refresh();
    });
  }

  function remove(s: CustomStatus) {
    start(async () => {
      const r = await removeStatusAction(s.key);
      setRemoving(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        r.data.moved > 0
          ? `Removed "${s.name}". ${r.data.moved} task${r.data.moved === 1 ? "" : "s"} moved to To do.`
          : `Removed "${s.name}"`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <DndContext
          id="status-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[keepInside]}
          autoScroll={false}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={ordered.map((s) => s.value)}
            strategy={verticalListSortingStrategy}
          >
            <ul ref={listRef} className="space-y-2" aria-label="Statuses, in board order">
              {ordered.map((s) => (
                <SortableStatus
                  key={s.value}
                  option={s}
                  disabled={pending}
                  onRename={(v) => {
                    const c = custom.find((x) => x.key === s.value);
                    if (c) rename(c, v);
                  }}
                  onRemove={() => {
                    const c = custom.find((x) => x.key === s.value);
                    if (c) setRemoving(c);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <ul aria-label="Always last">
          <li className="border-border bg-surface-soft text-muted-strong flex h-11 items-center gap-2 rounded-2xl border px-4">
            <Lock className="size-4 shrink-0" aria-hidden />
            <span className="text-foreground text-body-sm min-w-0 flex-1 truncate font-semibold">
              Done
            </span>
            <span className="text-caption">Always last</span>
          </li>
        </ul>
      </div>

      <form onSubmit={add} className="space-y-1.5" noValidate>
        <div className="flex gap-2">
          <Input
            aria-label="New status name"
            placeholder={full ? "Limit reached" : "New status, e.g. In review"}
            value={name}
            maxLength={MAX_STATUS_NAME}
            disabled={full || pending}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-2xl"
          />
          <Button type="submit" disabled={full || pending || !name.trim()}>
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
        <FieldError message={error} />
        <p className="text-caption text-muted-strong">
          {custom.length} of {MAX_CUSTOM_STATUSES} extra statuses. Drag the handle to put any status
          in the order you want; Done always stays last. A custom status counts as open work, like
          To do.
        </p>
      </form>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove "${removing?.name ?? ""}"?`}
        body="Tasks in this status are moved back to To do. Nothing is deleted."
        confirmLabel="Remove status"
        busy={pending}
        onConfirm={() => {
          if (removing) remove(removing);
        }}
      />
    </div>
  );
}

function SortableStatus({
  option,
  disabled,
  onRename,
  onRemove,
}: {
  option: StatusOption;
  disabled: boolean;
  onRename: (value: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.value });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // keep dnd-kit's own slide animation and fade the lift (shadow, background) in and out
        transition: [transition, "box-shadow 180ms ease, background-color 180ms ease"]
          .filter(Boolean)
          .join(", "),
      }}
      className={cn(
        "flex items-center gap-1 rounded-2xl pr-1",
        // The lifted row gets its own background and a soft, wide shadow, so it reads as one card
        // instead of a hard rectangle behind the handle and the field.
        isDragging &&
          "bg-surface relative z-10 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.28)] ring-1 ring-black/5 dark:ring-white/10",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder status ${option.title}. Press space, then use the arrow keys.`}
        className="text-muted-strong hover:bg-surface-soft grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-xl active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      {option.custom ? (
        <>
          <Input
            // keyed by name so a rename from elsewhere resets the field
            key={option.title}
            aria-label={`Rename status ${option.title}`}
            defaultValue={option.title}
            maxLength={MAX_STATUS_NAME}
            disabled={disabled}
            className="h-11 rounded-2xl"
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <Button
            variant="utility"
            size="icon"
            aria-label={`Remove status ${option.title}`}
            onClick={onRemove}
          >
            <Trash2 className="size-5" aria-hidden />
          </Button>
        </>
      ) : (
        <div className="border-border bg-surface-soft flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-4">
          <span className="text-body-sm min-w-0 flex-1 truncate font-semibold">{option.title}</span>
          <span className="text-caption text-muted-strong">Built in</span>
        </div>
      )}
    </li>
  );
}
