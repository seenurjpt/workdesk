"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

const RETRY_MS = 5000;

/**
 * Debounced, serialised autosave. Patches made while a save is in flight are merged and
 * sent right after, so writes never overlap or arrive out of order.
 * Pending edits are flushed on unmount and when the tab is hidden, and the browser warns
 * before closing with unsaved changes.
 */
export function useAutosave<P extends object>(
  save: (patch: Partial<P>) => Promise<boolean>,
  { delayMs = 800, draftKey }: { delayMs?: number; draftKey?: string } = {},
) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<Partial<P>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const hasPending = useCallback(() => Object.keys(pending.current).length > 0, []);

  const writeDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      if (hasPending()) {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ at: Date.now(), patch: pending.current }),
        );
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      /* storage full or unavailable: autosave still works */
    }
  }, [draftKey, hasPending]);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback((): Promise<void> => {
    clearTimer();
    if (running.current) return running.current;
    const loop = async () => {
      let failed = false;
      while (hasPending()) {
        const patch = pending.current;
        pending.current = {};
        setStatus("saving");
        let ok = false;
        try {
          ok = await saveRef.current(patch);
        } catch {
          ok = false;
        }
        if (!ok) {
          pending.current = { ...patch, ...pending.current };
          failed = true;
          break;
        }
      }
      if (failed) {
        setStatus("error");
        timer.current = setTimeout(() => void flushRef.current(), RETRY_MS);
      } else {
        setStatus("saved");
        writeDraft();
      }
    };
    running.current = loop().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [hasPending, writeDraft]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...pending.current, ...patch };
      writeDraft();
      setStatus("unsaved");
      clearTimer();
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush, writeDraft],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && (hasPending() || running.current)) void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPending() || running.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (hasPending()) void flush();
    };
  }, [flush, hasPending]);

  /** An unsaved local copy left behind by a tab that closed mid-save. */
  const readDraft = useCallback((): { at: number; patch: Partial<P> } | null => {
    if (!draftKey) return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as { at: number; patch: Partial<P> }) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  return { status, schedule, flush, readDraft };
}
