"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { useLocalStorageString } from "@/hooks/use-local-storage";
import {
  QUEUE_KEY,
  enqueue,
  isNetworkError,
  parseQueue,
  replayQueue,
  saveQueue,
  loadQueue,
  type NewOfflineOp,
  type OfflineOp,
  type ReplayOutcome,
} from "@/lib/offline-queue";
import { quickAddAction, setTaskDoneAction } from "@/server/actions";
import { useSyncExternalStore } from "react";

interface OfflineContextValue {
  /** False when the browser says it is offline, or the server could not be reached. */
  online: boolean;
  /** True for a few seconds after the connection comes back. */
  recovered: boolean;
  pending: number;
  /** Keeps a change to send later. */
  queue: (op: NewOfflineOp) => void;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside OfflineProvider");
  return ctx;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

async function run(op: OfflineOp): Promise<ReplayOutcome> {
  try {
    const res =
      op.type === "quickAdd"
        ? await quickAddAction({ text: op.text, dayKey: op.dayKey })
        : await setTaskDoneAction(op.taskId, op.done);
    if (res.ok) return "done";
    // signed out: keep the change until the person signs back in; anything else was rejected
    return /signed out/i.test(res.error) ? "retry" : "drop";
  } catch (error) {
    return isNetworkError(error) ? "retry" : "drop";
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  // The browser's own flag misses "connected to Wi-Fi but no internet". A failed request marks the
  // server unreachable, and then (only then) a probe with backoff finds out when it is back.
  const [unreachable, setUnreachable] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const online = browserOnline && !unreachable;

  const markRecovered = useCallback(() => {
    setRecovered(true);
    setTimeout(() => setRecovered(false), 3500);
  }, []);

  useEffect(() => {
    window.addEventListener("online", markRecovered);
    return () => window.removeEventListener("online", markRecovered);
  }, [markRecovered]);

  useEffect(() => {
    if (!unreachable) return;
    let delay = 3000;
    let timer: ReturnType<typeof setTimeout>;
    const probe = async () => {
      try {
        const res = await fetch("/api/ping", { cache: "no-store" });
        if (res.ok) {
          setUnreachable(false);
          markRecovered();
          return;
        }
      } catch {
        /* still offline */
      }
      delay = Math.min(delay * 2, 30_000);
      timer = setTimeout(probe, delay);
    };
    timer = setTimeout(probe, delay);
    return () => clearTimeout(timer);
  }, [unreachable, markRecovered]);
  const [raw, ,] = useLocalStorageString(QUEUE_KEY);
  const pending = useMemo(() => parseQueue(raw || null).length, [raw]);
  const flushing = useRef(false);

  const queue = useCallback((op: NewOfflineOp) => {
    const next = enqueue(loadQueue(window.localStorage), op, new Date(), crypto.randomUUID());
    saveQueue(window.localStorage, next);
    // let useLocalStorageString subscribers re-read
    window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));
    // Something just failed to reach the server, so treat the connection as down until a probe works.
    setUnreachable(true);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const ops = loadQueue(window.localStorage);
    if (ops.length === 0) return;
    flushing.current = true;
    try {
      const { remaining, synced, dropped } = await replayQueue(ops, run);
      saveQueue(window.localStorage, remaining);
      window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));
      if (synced > 0) toast.success(`Synced ${synced} change${synced === 1 ? "" : "s"}`);
      if (dropped > 0)
        toast.error(
          `${dropped} offline change${dropped === 1 ? " was" : "s were"} rejected and discarded`,
        );
      if (synced > 0) {
        invalidateTaskQueries(qc);
        router.refresh();
      }
    } finally {
      flushing.current = false;
    }
  }, [qc, router]);

  useEffect(() => {
    if (online && pending > 0) void flush();
  }, [online, pending, flush]);

  const value = useMemo(
    () => ({ online, recovered, pending, queue }),
    [online, recovered, pending, queue],
  );

  return (
    <OfflineContext.Provider value={value}>
      {children}
      {!online && (
        <div
          role="status"
          className="border-border bg-surface shadow-float fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full border px-4 py-2 md:bottom-4 print:hidden"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span className="text-body-sm">
            You&apos;re offline.{" "}
            {pending > 0
              ? `${pending} change${pending === 1 ? "" : "s"} will sync when you're back.`
              : "Adding or completing tasks still works."}
          </span>
        </div>
      )}
    </OfflineContext.Provider>
  );
}
