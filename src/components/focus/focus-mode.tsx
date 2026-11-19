"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Minimize2, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatClock, phaseLengthMs } from "@/lib/focus";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { captureDockRect } from "@/lib/focus-morph";
import { setTaskDoneAction } from "@/server/actions";
import { useFocus } from "./focus-provider";

/** Full-screen, distraction-free view of the running timer. */
export function FocusMode() {
  const { timer, elapsedMs, remainingMs, stop, modeOpen, setModeOpen } = useFocus();
  const router = useRouter();
  const qc = useQueryClient();
  if (!timer) return null;

  const pomodoro = timer.mode === "pomodoro";
  const shown = pomodoro ? (remainingMs ?? 0) : elapsedMs;
  const progress = pomodoro ? 1 - (remainingMs ?? 0) / phaseLengthMs(timer.phase) : 0;
  const onBreak = pomodoro && timer.phase === "break";

  async function complete() {
    if (!timer) return;
    const res = await setTaskDoneAction(timer.taskId, true);
    if (!res.ok) return void toast.error(res.error);
    captureDockRect();
    setModeOpen(false);
    toast.success("Task completed", { description: timer.taskTitle });
    invalidateTaskQueries(qc);
    router.refresh();
  }

  return (
    <DialogPrimitive.Root
      open={modeOpen}
      onOpenChange={(next) => {
        // Closing shrinks back into the dock, so note where it is right now.
        if (!next) captureDockRect();
        setModeOpen(next);
      }}
    >
      <DialogPrimitive.Portal>
        {/* previous (no animation): <DialogPrimitive.Overlay className="bg-background fixed inset-0 z-50" /> */}
        <DialogPrimitive.Overlay className="focus-screen bg-background fixed inset-0 z-50" />
        {/* previous: className="fixed inset-0 z-50 flex flex-col ..." without "focus-content" */}
        <DialogPrimitive.Content className="focus-content fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center focus:outline-none">
          <DialogPrimitive.Title className="text-caption text-muted-strong font-semibold tracking-wide uppercase">
            {pomodoro ? (onBreak ? "Break" : "Focus session") : "Stopwatch"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="font-heading max-w-2xl text-3xl font-bold md:text-5xl">
            {timer.taskTitle}
          </DialogPrimitive.Description>
          <p
            className="font-heading text-[min(24vw,9rem)] leading-none font-bold tabular-nums"
            role="timer"
            aria-label={pomodoro ? "Time remaining" : "Time elapsed"}
          >
            {formatClock(shown)}
          </p>
          {pomodoro && (
            <div
              className="bg-surface-soft h-2 w-full max-w-md overflow-hidden rounded-full"
              role="presentation"
            >
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="accent" onClick={() => void complete()}>
              <Check className="size-4" aria-hidden /> Complete task
            </Button>
            <Button variant="secondary" onClick={() => void stop()}>
              <Square className="size-4" aria-hidden /> Stop timer
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="utility">
                <Minimize2 className="size-4" aria-hidden /> Back to app
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
