"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { Bell, BellOff, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/shared/user-context";
import { formatDue } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import type { ReminderItem } from "@/server/reminders";
import { useReminders } from "./reminder-provider";

function Row({ item }: { item: ReminderItem }) {
  const { user } = useApp();
  const { act, openTask } = useReminders();
  const due = item.dueAt ? formatDue(item.dueAt, item.allDay, user.timezone) : null;
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
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" onClick={() => void act(item, "done")}>
          <Check className="size-4" aria-hidden /> Done
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void act(item, "snooze10")}>
          <Clock className="size-4" aria-hidden /> 10 min
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void act(item, "snooze60")}>
          1 hr
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void act(item, "tomorrow")}>
          Tomorrow
        </Button>
        <Button size="sm" variant="utility" onClick={() => void act(item, "dismiss")}>
          Clear
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
