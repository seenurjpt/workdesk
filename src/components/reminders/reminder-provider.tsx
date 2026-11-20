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
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { useEvent } from "@/hooks/use-event";
import { useLocalStorageString } from "@/hooks/use-local-storage";
import { dayKey } from "@/lib/dates";
import { formatDue } from "@/lib/format";
import { inQuietHours, partitionDue } from "@/lib/reminders";
import { playTone, unlockAudio } from "@/lib/sound";
import { claimRemindersAction, reminderActionAction } from "@/server/actions";
import { getTaskAction } from "@/server/queries";
import type { ReminderAction, ReminderBundle, ReminderItem } from "@/server/reminders";
import { ReminderToast } from "./reminder-toast";

type Permission = NotificationPermission | "unsupported";

interface ReminderContextValue {
  recent: ReminderItem[];
  unseen: number;
  permission: Permission;
  markSeen: () => void;
  requestPermission: () => Promise<Permission>;
  /** Resolves to whether the server accepted the action. */
  act: (item: ReminderItem, action: ReminderAction) => Promise<boolean>;
  openTask: (taskId: string) => Promise<void>;
  sendTest: () => Promise<void>;
}

const ReminderContext = createContext<ReminderContextValue | null>(null);

export function useReminders(): ReminderContextValue {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error("useReminders must be used inside ReminderProvider");
  return ctx;
}

const TICK_MS = 30_000;
const STALE_SYNC_MS = 10 * 60_000;
const MAX_TIMEOUT = 2 ** 31 - 1;
const LATE_MS = 2 * 60_000;
const MAX_INDIVIDUAL = 3;
const CHANNEL = "workdesk-reminders";

function subscribePermission(cb: () => void) {
  window.addEventListener("focus", cb);
  window.addEventListener("workdesk:permission", cb);
  return () => {
    window.removeEventListener("focus", cb);
    window.removeEventListener("workdesk:permission", cb);
  };
}
const getPermission = (): Permission =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

const key = (item: ReminderItem) => `${item.id}@${item.at}`;

export function ReminderProvider({
  bundle,
  children,
}: {
  bundle: ReminderBundle;
  children: ReactNode;
}) {
  const { user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const { open: openEditor } = useTaskEditor();
  const permission = useSyncExternalStore(
    subscribePermission,
    getPermission,
    () => "default" as Permission,
  );
  const [seenAt, setSeenAt] = useLocalStorageString("workdesk:bell-seen");

  // Server data arrives with each navigation/refresh; local state takes over in between.
  const [synced, setSynced] = useState(bundle);
  const [pending, setPending] = useState(() => [...bundle.pending, ...bundle.missed]);
  const [recent, setRecent] = useState(bundle.recent);
  if (synced !== bundle) {
    setSynced(bundle);
    setPending([...bundle.pending, ...bundle.missed]);
    setRecent(bundle.recent);
  }

  const attempted = useRef(new Set<string>());
  const lastSync = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    lastSync.current = Date.now();
  }, [bundle]);

  const unseen = useMemo(
    () => recent.filter((i) => i.sentAt && i.sentAt > seenAt).length,
    [recent, seenAt],
  );

  // ---- presenting ----

  const bodyFor = useEvent((item: ReminderItem) => {
    if (!item.dueAt) return "Reminder";
    const due = formatDue(item.dueAt, item.allDay, user.timezone).label;
    return item.projectName ? `Due ${due} · ${item.projectName}` : `Due ${due}`;
  });

  const showNative = useEvent(
    async (title: string, options: NotificationOptions): Promise<boolean> => {
      if (getPermission() !== "granted") return false;
      try {
        if ("serviceWorker" in navigator) {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (reg) {
            await reg.showNotification(title, options);
            return true;
          }
        }
        new Notification(title, options);
        return true;
      } catch {
        return false;
      }
    },
  );

  /** One sound per batch. Resolves to whether it actually played (browsers can block it). */
  const playSound = useEvent(async (): Promise<boolean> => {
    const sound = user.reminderPrefs.sound;
    return sound.enabled ? playTone(sound.tone, sound.volume) : false;
  });

  const openTask = useEvent(async (taskId: string) => {
    const res = await getTaskAction(taskId);
    if (res.ok) openEditor(res.data);
    else toast.error("That task no longer exists");
  });

  const act = useEvent(async (item: ReminderItem, action: ReminderAction) => {
    const res = await reminderActionAction({
      taskId: item.taskId,
      reminderId: item.reminderId,
      action,
    });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setRecent((r) => r.filter((i) => i.id !== item.id));
    setPending((p) => p.filter((i) => i.id !== item.id));
    if (action === "done" && res.data?.next?.dueAt) {
      toast("Done. Next one scheduled", {
        description: formatDue(res.data.next.dueAt, res.data.next.allDay, user.timezone).label,
      });
    } else if (action === "snooze10" || action === "snooze60" || action === "tomorrow") {
      toast("Snoozed", { description: item.title });
    }
    invalidateTaskQueries(qc);
    router.refresh();
    return true;
  });

  const inApp = useEvent(
    (title: string, body: string, item: ReminderItem | undefined, persistent: boolean) => {
      toast.custom(
        (id) => (
          <ReminderToast
            title={title}
            body={body}
            item={item}
            onAction={(i, a) => act(i, a)}
            onOpen={(i) => void openTask(i.taskId)}
            onClose={() => toast.dismiss(id)}
          />
        ),
        { duration: persistent ? Infinity : 20_000 },
      );
    },
  );

  const present = useEvent(async (won: ReminderItem[], now: Date) => {
    const focused = document.visibilityState === "visible" && document.hasFocus();
    const played = await playSound();
    const allLate = won.every((i) => now.getTime() - new Date(i.at).getTime() > LATE_MS);
    const grouped = won.length > MAX_INDIVIDUAL || (won.length > 1 && allLate);

    if (grouped) {
      const title = allLate ? `You missed ${won.length} reminders` : `${won.length} reminders due`;
      const shown = won.slice(0, 3).map((i) => i.title);
      const body = shown.join(", ") + (won.length > 3 ? ` and ${won.length - 3} more` : "");
      const native =
        !focused &&
        (await showNative(title, {
          body,
          tag: "reminder-summary",
          data: { kind: "summary" },
          silent: played,
        }));
      if (!native) inApp(title, body, undefined, !focused);
      return;
    }

    const maxActions = (Notification as unknown as { maxActions?: number }).maxActions ?? 2;
    const actions = [
      { action: "done", title: "Done" },
      { action: "snooze10", title: "Snooze 10 min" },
      { action: "snooze60", title: "Snooze 1 hr" },
      { action: "tomorrow", title: "Tomorrow" },
    ].slice(0, maxActions);

    for (const item of won) {
      const body = bodyFor(item);
      const native =
        !focused &&
        (await showNative(item.title, {
          body,
          tag: item.id,
          actions,
          data: { kind: "single", taskId: item.taskId, reminderId: item.reminderId },
          silent: played,
        } as NotificationOptions));
      if (!native) inApp(item.title, body, item, !focused);
    }
  });

  // ---- scheduling ----

  const check = useEvent(async () => {
    const now = new Date();
    if (inQuietHours(now, user.timezone, user.reminderPrefs.quietHours)) return;

    const candidates = pending.filter((i) => !attempted.current.has(key(i)));
    const { due } = partitionDue(candidates, now);
    if (due.length > 0) {
      due.forEach((i) => attempted.current.add(key(i)));
      const res = await claimRemindersAction(
        due.map(({ taskId, reminderId }) => ({ taskId, reminderId })),
      );
      if (!res.ok) {
        // Offline or signed out: try again on the next tick.
        due.forEach((i) => attempted.current.delete(key(i)));
        return;
      }
      const won = due.filter((i) => res.data.includes(i.id));
      const wonIds = new Set(due.map((i) => i.id));
      setPending((p) => p.filter((i) => !wonIds.has(i.id)));
      if (won.length > 0) {
        const stamped = won.map((i) => ({ ...i, sentAt: now.toISOString() }));
        setRecent((r) => [...stamped, ...r.filter((x) => !wonIds.has(x.id))]);
        channel.current?.postMessage({ type: "fired", keys: due.map(key) });
        await present(won, now);
      }
    }

    // Optional once-a-day summary at the start of work hours.
    const summary = bundle.summary;
    if (user.reminderPrefs.morningSummary && summary) {
      const today = dayKey(now, user.timezone);
      const nowHm = new Intl.DateTimeFormat("en-GB", {
        timeZone: user.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      let last = "";
      try {
        last = window.localStorage.getItem("workdesk:summary-date") ?? "";
      } catch {
        /* ignore */
      }
      if (
        nowHm >= user.workHours.start &&
        last !== today &&
        (summary.dueToday > 0 || summary.overdue > 0)
      ) {
        try {
          window.localStorage.setItem("workdesk:summary-date", today);
        } catch {
          /* ignore */
        }
        const body = `${summary.dueToday} due today${summary.overdue ? `, ${summary.overdue} overdue` : ""}`;
        const native = await showNative("Good morning", {
          body,
          tag: "morning-summary",
          data: { kind: "summary" },
        });
        if (!native) inApp("Good morning", body, undefined, false);
      }
    }
  });

  useEffect(() => {
    const interval = setInterval(() => void check(), TICK_MS);
    const { nextInMs } = partitionDue(
      pending.filter((i) => !attempted.current.has(key(i))),
      new Date(),
    );
    const exact =
      nextInMs === null
        ? null
        : setTimeout(() => void check(), Math.min(nextInMs + 250, MAX_TIMEOUT));

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void check();
      if (Date.now() - lastSync.current > STALE_SYNC_MS) {
        lastSync.current = Date.now();
        router.refresh();
      }
    };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    void check();
    return () => {
      clearInterval(interval);
      if (exact) clearTimeout(exact);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [pending, check, router]);

  // ---- other tabs and the service worker ----

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<{ type: string; keys?: string[] }>) => {
      if (e.data.type !== "fired" || !e.data.keys) return;
      e.data.keys.forEach((k) => attempted.current.add(k));
      setPending((p) => p.filter((i) => !attempted.current.has(key(i))));
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  const onWorkerMessage = useEvent((e: MessageEvent<{ type?: string; taskId?: string }>) => {
    if (e.data?.type === "reminders-changed") {
      invalidateTaskQueries(qc);
      router.refresh();
    } else if (e.data?.type === "open-task" && e.data.taskId) {
      void openTask(e.data.taskId);
    }
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?mode=dev")
      .catch(() => {
        /* in-app reminders still work without it */
      });
    const handler = (e: MessageEvent) => onWorkerMessage(e);
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [onWorkerMessage]);

  // Browsers only allow sound after the first click or key press; unlock audio then.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // ---- badges ----

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unseen > 0) void nav.setAppBadge?.(unseen).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});

    const strip = (t: string) => t.replace(/^\(\d+\)\s/, "");
    const apply = () => {
      const next = unseen > 0 ? `(${unseen}) ${strip(document.title)}` : strip(document.title);
      if (document.title !== next) document.title = next;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = strip(document.title);
    };
  }, [unseen]);

  // ---- public API ----

  const requestPermission = useCallback(async (): Promise<Permission> => {
    if (typeof Notification === "undefined") return "unsupported";
    const result = await Notification.requestPermission();
    window.dispatchEvent(new Event("workdesk:permission"));
    return result;
  }, []);

  const markSeen = useCallback(() => setSeenAt(new Date().toISOString()), [setSeenAt]);

  const sendTest = useEvent(async () => {
    const title = "WorkDesk test notification";
    const body = "If you can see this, reminders will reach you.";
    const played = await playSound();
    const native = await showNative(title, { body, tag: "test", silent: played });
    if (!native) inApp(title, body, undefined, false);
    else toast.success("Test notification sent");
  });

  const value = useMemo<ReminderContextValue>(
    () => ({ recent, unseen, permission, markSeen, requestPermission, act, openTask, sendTest }),
    [recent, unseen, permission, markSeen, requestPermission, act, openTask, sendTest],
  );

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}
