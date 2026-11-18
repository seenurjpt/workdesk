"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocus } from "./focus-provider";

/** Start a stopwatch or a Pomodoro on a task, or stop its running timer. */
export function StartTimerMenu({
  task,
  size = "iconSm",
  label,
}: {
  task: { id: string; title: string };
  size?: "iconSm" | "sm";
  label?: string;
}) {
  const { timer, start, stop } = useFocus();
  const running = timer?.taskId === task.id;

  if (running) {
    return (
      <Button
        variant="utility"
        size={size}
        aria-label={`Stop timer on "${task.title}"`}
        onClick={() => void stop()}
      >
        <Square className="size-4" aria-hidden />
        {label && <span>Stop timer</span>}
      </Button>
    );
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="utility" size={size} aria-label={`Start timer on "${task.title}"`}>
          <Play className="size-4" aria-hidden />
          {label && <span>{label}</span>}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="border-border bg-surface shadow-float z-50 min-w-52 rounded-xl border p-1"
        >
          <DropdownMenu.Item
            onSelect={() => void start(task, "stopwatch")}
            className="text-nav data-[highlighted]:bg-surface-soft cursor-pointer rounded-lg px-3 py-2 outline-none"
          >
            Start stopwatch
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void start(task, "pomodoro")}
            className="text-nav data-[highlighted]:bg-surface-soft cursor-pointer rounded-lg px-3 py-2 outline-none"
          >
            Start Pomodoro (25 / 5)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
