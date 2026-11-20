"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { Bell, BellOff, Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/shared/user-context";
import { formatDue } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import type { ReminderAction, ReminderItem } from "@/server/reminders";
import { useReminders } from "./reminder-provider";

function Row({ item }: { item: ReminderItem }) {
  const { user } = useApp();
  const { act, openTask } = useReminders();
  const due = item.dueAt ? formatDue(item.dueAt, item.allDay, user.timezone) : null;
  // Which button is waiting for the server. While one is, every button in the row is disabled, so
  // the same reminder cannot be actioned twice.
  const [busy, setBusy] = useState<ReminderAction | null>(null);
  async function run(action: ReminderAction) {
    if (busy) return;
    setBusy(action);
    try {
      await act(item, action);
    } finally {
      setBusy(null);
    }
  }
  const spin = (action: ReminderAction, icon: React.ReactNode) =>
    busy === action ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon;
  const when = item.sentAt ? formatInTimeZone(new Date(item.sentAt), user.timezone, "h:mm a") : "";
  return (
    <li className="border-border border-b px-4 py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => void openTask(item.taskId)}
        className="block w-full text-left"
      >
        <span className="text-body-sm block truncate font-semibold">{item.title}</span>
        <span className="text-caption text-muted-strong">
          Reminded {when}
          {due && ` · due ${due.label}`}
          {due?.overdue && " (overdue)"}
        </span>
      </button>
      <div className="mt-2 flex flex-wrap gap-1" aria-busy={busy !== null}>
        <Button size="sm" disabled={busy !== null} onClick={() => void run("done")}>
          {spin("done", <Check className="size-4" aria-hidden />)} Done
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run("snooze10")}
        >
          {spin("snooze10", <Clock className="size-4" aria-hidden />)} 10 min
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run("snooze60")}
        >
          {busy === "snooze60" && <Loader2 className="size-4 animate-spin" aria-hidden />} 1 hr
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run("tomorrow")}
        >
          {busy === "tomorrow" && <Loader2 className="size-4 animate-spin" aria-hidden />} Tomorrow
        </Button>
        <Button
          size="sm"
          variant="utility"
          disabled={busy !== null}
          onClick={() => void run("dismiss")}
        >
          {busy === "dismiss" && <Loader2 className="size-4 animate-spin" aria-hidden />} Clear
        </Button>
      </div>
    </li>
  );
}

export function NotificationBell() {
  const { recent, unseen, permission, requestPermission, markSeen } = useReminders();
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) markSeen();
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unseen > 0 ? `Notifications, ${unseen} new` : "Notifications"}
          className="hover:bg-surface-soft relative inline-flex size-11 items-center justify-center rounded-full md:size-9"
        >
          <Bell className="size-5" aria-hidden />
          {unseen > 0 && (
            <span
              aria-hidden
              className="text-caption bg-accent text-on-accent absolute top-0.5 right-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 font-semibold md:top-0 md:right-0"
            >
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          onOpenAutoFocus={(event) => {
            // start on the first control so keyboard users see where they are
            event.preventDefault();
            (event.currentTarget as HTMLElement)
              .querySelector<HTMLElement>("a[href], button")
              ?.focus();
          }}
          className="border-border bg-surface shadow-float z-50 w-[min(94vw,24rem)] rounded-3xl border"
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-heading text-lg font-bold">Reminders</h2>
            <Link
              href="/settings#notifications"
              onClick={() => setOpen(false)}
              className="text-caption text-accent-text font-semibold hover:underline"
            >
              Settings
            </Link>
          </div>

          {permission === "default" && (
            <div className="border-border bg-band border-b px-4 py-3">
              <p className="text-body-sm mb-2">Get a browser notification when a task is due.</p>
              <Button size="sm" onClick={() => void requestPermission()}>
                Enable notifications
              </Button>
            </div>
          )}
          {permission === "denied" && (
            <p className="text-caption border-border text-muted-strong flex items-start gap-2 border-b px-4 py-3">
              <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              Browser notifications are blocked for this site. Reminders still appear inside
              WorkDesk. Allow notifications in your browser&apos;s site settings to get them
              elsewhere.
            </p>
          )}

          {recent.length === 0 ? (
            <p className="text-body-sm text-muted-strong px-4 py-8 text-center">
              No reminders in the last 24 hours.
            </p>
          ) : (
            <ul aria-label="Recent reminders" className="max-h-[60vh] overflow-y-auto">
              {recent.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
