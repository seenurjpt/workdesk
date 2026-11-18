"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import { useFocus } from "@/components/focus/focus-provider";
import type { TaskDTO } from "@/lib/types";

const ITEM =
  "text-nav flex min-h-11 cursor-pointer items-center rounded-lg px-3 outline-none data-[highlighted]:bg-surface-soft";

/** One ⋮ menu instead of three icon buttons, so titles keep their space on narrow screens. */
export function TaskRowMenu({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskDTO;
  onEdit: (task: TaskDTO) => void;
  onDelete: (task: TaskDTO) => void;
}) {
  const { timer, start, stop } = useFocus();
  const running = timer?.taskId === task.id;
  const ref = { id: task.id, title: task.title };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Actions for "${task.title}"`}
        className="text-muted-strong hover:bg-surface inline-flex size-11 items-center justify-center rounded-xl"
      >
        <MoreVertical className="size-5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="border-border bg-surface shadow-float z-50 min-w-52 rounded-xl border p-1"
        >
          <DropdownMenu.Item onSelect={() => onEdit(task)} className={ITEM}>
            Edit
          </DropdownMenu.Item>
          {running ? (
            <DropdownMenu.Item onSelect={() => void stop()} className={ITEM}>
              Stop timer
            </DropdownMenu.Item>
          ) : (
            <>
              <DropdownMenu.Item onSelect={() => void start(ref, "stopwatch")} className={ITEM}>
                Start stopwatch
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void start(ref, "pomodoro")} className={ITEM}>
                Start Pomodoro (25 / 5)
              </DropdownMenu.Item>
            </>
          )}
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <DropdownMenu.Item onSelect={() => onDelete(task)} className={`${ITEM} text-danger`}>
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
