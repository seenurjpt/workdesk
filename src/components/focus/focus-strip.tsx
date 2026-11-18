"use client";

import { Maximize2, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/focus";
import { useFocus } from "./focus-provider";

/** Always-visible reminder that a timer is running. */
export function FocusStrip() {
  const { timer, elapsedMs, remainingMs, stop, setModeOpen } = useFocus();
  if (!timer) return null;
  const pomodoro = timer.mode === "pomodoro";
  const time = formatClock(pomodoro ? (remainingMs ?? 0) : elapsedMs);
  const label = pomodoro ? (timer.phase === "work" ? "Focus" : "Break") : "Timer";
  return (
    <div
      role="region"
      aria-label="Running timer"
      className="border-border bg-band sticky top-16 z-20 flex items-center gap-3 border-b px-4 py-2 print:hidden"
    >
      <Timer className="text-accent-text size-4 shrink-0" aria-hidden />
      <span className="text-caption font-semibold">{label}</span>
      <span className="text-body-sm min-w-0 flex-1 truncate font-semibold">{timer.taskTitle}</span>
      <span className="font-heading text-xl font-bold tabular-nums" aria-live="off">
        {time}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setModeOpen(true)}
        aria-label="Open focus mode"
      >
        <Maximize2 className="size-4" aria-hidden />{" "}
        <span className="max-sm:sr-only">Focus mode</span>
      </Button>
      <Button size="sm" onClick={() => void stop()}>
        <Square className="size-4" aria-hidden /> Stop
      </Button>
    </div>
  );
}
