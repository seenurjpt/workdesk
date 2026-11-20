"use client";

import { useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReminderAction, ReminderItem } from "@/server/reminders";

export interface ToastProps {
  title: string;
  body: string;
  /** Present for single reminders, so the toast can offer actions. */
  item?: ReminderItem;
  /** Resolves to whether it worked. The card closes only when it did. */
  onAction: (
    item: ReminderItem,
    action: ReminderAction,
  ) => void | boolean | Promise<boolean | void>;
  onOpen: (item: ReminderItem) => void;
  onClose: () => void;
}

/** In-app reminder card: used when the tab is open, or when native notifications are off. */
export function ReminderToast({ title, body, item, onAction, onOpen, onClose }: ToastProps) {
  // The card stays until the server answers, with a spinner on the button that was pressed and the
  // others disabled, so one reminder cannot be actioned twice. It closes only on success.
  const [busy, setBusy] = useState<ReminderAction | null>(null);
  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden />;
  async function run(target: ReminderItem, action: ReminderAction) {
    if (busy) return;
    setBusy(action);
    try {
      const ok = await onAction(target, action);
      if (ok !== false) onClose();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div
      role="alert"
      className="border-border bg-surface shadow-float w-[min(92vw,22rem)] rounded-2xl border p-4"
    >
      <div className="flex items-start gap-3">
        <Bell className="text-accent-text mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold">{title}</p>
          <p className="text-caption text-muted-strong">{body}</p>
        </div>
        <Button variant="utility" size="iconSm" aria-label="Dismiss" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {item && (
        <div className="mt-3 flex flex-wrap gap-2" aria-busy={busy !== null}>
          <Button size="sm" disabled={busy !== null} onClick={() => void run(item, "done")}>
            {busy === "done" && spinner} Done
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void run(item, "snooze10")}
          >
            {busy === "snooze10" && spinner} Snooze 10 min
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void run(item, "snooze60")}
          >
            {busy === "snooze60" && spinner} 1 hr
          </Button>
          <Button
            size="sm"
            variant="utility"
            disabled={busy !== null}
            onClick={() => {
              onOpen(item);
              onClose();
            }}
          >
            Open
          </Button>
        </div>
      )}
    </div>
  );
}
