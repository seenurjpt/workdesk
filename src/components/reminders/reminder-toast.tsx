"use client";

import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReminderAction, ReminderItem } from "@/server/reminders";

export interface ToastProps {
  title: string;
  body: string;
  /** Present for single reminders, so the toast can offer actions. */
  item?: ReminderItem;
  onAction: (item: ReminderItem, action: ReminderAction) => void;
  onOpen: (item: ReminderItem) => void;
  onClose: () => void;
}

/** In-app reminder card: used when the tab is open, or when native notifications are off. */
export function ReminderToast({ title, body, item, onAction, onOpen, onClose }: ToastProps) {
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              onAction(item, "done");
              onClose();
            }}
          >
            Done
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onAction(item, "snooze10");
              onClose();
            }}
          >
            Snooze 10 min
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onAction(item, "snooze60");
              onClose();
            }}
          >
            1 hr
          </Button>
          <Button
            size="sm"
            variant="utility"
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
