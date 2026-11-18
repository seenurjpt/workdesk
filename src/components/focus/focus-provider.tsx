"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApp } from "@/components/shared/user-context";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { phaseLengthMs } from "@/lib/focus";
import { playTone } from "@/lib/sound";
import type { ActiveTimerDTO } from "@/lib/types";
import { advanceTimerAction, startTimerAction, stopTimerAction } from "@/server/actions";

interface FocusContextValue {
  timer: ActiveTimerDTO | null;
  /** Milliseconds into the current phase (0 until the clock has started on the client). */
  elapsedMs: number;
  /** Pomodoro only: time left in this phase. */
  remainingMs: number | null;
  start: (task: { id: string; title: string }, mode: "stopwatch" | "pomodoro") => Promise<void>;
  stop: () => Promise<void>;
  modeOpen: boolean;
  setModeOpen: (open: boolean) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocus must be used inside FocusProvider");
  return ctx;
}

// A shared one-second clock. Returns 0 on the server so the first render never mismatches.
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void) {
  listeners.add(cb);
  if (!interval) interval = setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}
const clockSnapshot = () => Math.floor(Date.now() / 1000) * 1000;

export function FocusProvider({
  initial,
  children,
}: {
  initial: ActiveTimerDTO | null;
  children: ReactNode;
}) {
  const { user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [synced, setSynced] = useState(initial);
  const [timer, setTimer] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setTimer(initial);
  }
  const [modeOpen, setModeOpen] = useState(false);

  const subscribe = useCallback(
    (cb: () => void) => (timer ? subscribeClock(cb) : () => {}),
    [timer],
  );
  const nowMs = useSyncExternalStore(subscribe, clockSnapshot, () => 0);

  const elapsedMs =
    timer && nowMs ? Math.max(0, nowMs - new Date(timer.phaseStartedAt).getTime()) : 0;
  const remainingMs =
    timer?.mode === "pomodoro" && nowMs
      ? Math.max(0, phaseLengthMs(timer.phase) - elapsedMs)
      : null;

  const settle = useCallback(() => {
    invalidateTaskQueries(qc);
    router.refresh();
  }, [qc, router]);

  const start = useCallback(
    async (task: { id: string; title: string }, mode: "stopwatch" | "pomodoro") => {
      const now = new Date().toISOString();
      setTimer({
        taskId: task.id,
        taskTitle: task.title,
        mode,
        phase: "work",
        phaseStartedAt: now,
        startedAt: now,
      });
      const res = await startTimerAction({ taskId: task.id, mode });
      if (!res.ok) {
        setTimer(initial);
        toast.error(res.error);
        return;
      }
      toast.success(
        mode === "pomodoro" ? "Pomodoro started: 25 minutes of focus" : "Timer started",
        { description: task.title },
      );
      settle();
    },
    [initial, settle],
  );

  const stop = useCallback(async () => {
    const res = await stopTimerAction();
    if (!res.ok) return void toast.error(res.error);
    const title = timer?.taskTitle;
    setTimer(null);
    setModeOpen(false);
    toast(res.data && res.data.minutes > 0 ? `Logged ${res.data.minutes} min` : "Timer stopped", {
      description: title,
    });
    settle();
  }, [settle, timer?.taskTitle]);

  // Pomodoro: when a phase runs out, move to the next one (once per phase) and let the person know.
  const advancing = useRef<string | null>(null);
  const phaseKey = timer ? `${timer.phase}@${timer.phaseStartedAt}` : null;
  const phaseOver = timer?.mode === "pomodoro" && remainingMs === 0;
  const soundPrefs = user.reminderPrefs.sound;
  useEffect(() => {
    if (!timer || !phaseOver || !phaseKey || advancing.current === phaseKey) return;
    advancing.current = phaseKey;
    const wasWork = timer.phase === "work";
    void advanceTimerAction().then((res) => {
      if (!res.ok || !res.data) return;
      setTimer(res.data);
      const title = wasWork ? "Focus session done" : "Break over";
      const body = wasWork ? "Take a 5 minute break." : "Back to it: 25 more minutes.";
      toast(title, { description: body });
      if (soundPrefs.enabled) void playTone(soundPrefs.tone, soundPrefs.volume);
      if (
        document.visibilityState !== "visible" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(title, { body, tag: "pomodoro" });
        } catch {
          /* notifications unavailable */
        }
      }
      settle();
    });
  }, [timer, phaseOver, phaseKey, soundPrefs, settle]);

  const value = useMemo<FocusContextValue>(
    () => ({ timer, elapsedMs, remainingMs, start, stop, modeOpen, setModeOpen }),
    [timer, elapsedMs, remainingMs, start, stop, modeOpen],
  );
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
