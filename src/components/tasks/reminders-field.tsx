"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Bell, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useReminders } from "@/components/reminders/reminder-provider";
import { parseLocalInput } from "@/lib/format";
import {
  MAX_REMINDERS_PER_TASK,
  REMINDER_PRESETS,
  describeOffset,
  reminderAt,
} from "@/lib/reminders";

export interface ReminderRow {
  key: string;
  id?: string;
  /** null = a custom date and time. */
  offsetMin: number | null;
  customDate: string;
  customTime: string;
}

interface Props {
  rows: ReminderRow[];
  onChange: (rows: ReminderRow[]) => void;
  due: Date | null;
  allDay: boolean;
  timezone: string;
  workStart: string;
}

export function reminderRowTime(
  row: ReminderRow,
  p: Pick<Props, "due" | "allDay" | "timezone" | "workStart">,
): Date | null {
  if (row.offsetMin === null) {
    return row.customDate
      ? parseLocalInput(row.customDate, row.customTime || p.workStart, p.timezone)
      : null;
  }
  return p.due ? reminderAt(p.due, p.allDay, p.timezone, p.workStart, row.offsetMin) : null;
}

let counter = 0;
const newKey = () => `new-${++counter}`;

export function RemindersField({ rows, onChange, due, allDay, timezone, workStart }: Props) {
  const { permission, requestPermission } = useReminders();
  const [adding, setAdding] = useState("");
  // Captured once when the editor opens, so render stays pure.
  const [openedAt] = useState(() => Date.now());
  const ctx = { due, allDay, timezone, workStart };

  function add(value: string) {
    setAdding("");
    if (!value) return;
    const base = { key: newKey(), customDate: "", customTime: "" };
    if (value === "custom") onChange([...rows, { ...base, offsetMin: null }]);
    else onChange([...rows, { ...base, offsetMin: Number(value) }]);
  }

  const patch = (key: string, next: Partial<ReminderRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...next } : r)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-body-sm mb-1 flex items-center gap-2 font-semibold">
        <Bell className="size-4" aria-hidden /> Reminders
      </legend>

      {rows.length === 0 && <p className="text-caption text-muted-strong">No reminders.</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const at = reminderRowTime(row, ctx);
          const passed = at !== null && at.getTime() < openedAt - 60_000;
          return (
            <li key={row.key} className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm min-w-0 flex-1">
                <span className="font-semibold">{describeOffset(row.offsetMin)}</span>
                {at && (
                  <span className={passed ? "text-danger" : "text-muted-strong"}>
                    {" · "}
                    {formatInTimeZone(at, timezone, "EEE d MMM, h:mm a")}
                    {passed && " (already passed, will be skipped)"}
                  </span>
                )}
                {!at && row.offsetMin !== null && (
                  <span className="text-muted-strong"> · set a due date first</span>
                )}
              </span>
              {row.offsetMin === null && (
                <span className="flex gap-2">
                  <Input
                    type="date"
                    aria-label={`Reminder ${index + 1} date`}
                    className="w-auto py-1.5"
                    value={row.customDate}
                    onChange={(e) => patch(row.key, { customDate: e.target.value })}
                  />
                  <Input
                    type="time"
                    aria-label={`Reminder ${index + 1} time`}
                    className="w-auto py-1.5"
                    value={row.customTime}
                    onChange={(e) => patch(row.key, { customTime: e.target.value })}
                  />
                </span>
              )}
              <Button
                variant="utility"
                size="iconSm"
                aria-label={`Remove reminder ${index + 1}`}
                onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>

      {rows.length < MAX_REMINDERS_PER_TASK && (
        <div className="flex items-center gap-2">
          <Plus className="size-4 shrink-0" aria-hidden />
          <Select
            aria-label="Add a reminder"
            className="py-2"
            value={adding}
            onValueChange={(v) => add(v)}
          >
            <option value="">Add a reminder…</option>
            {REMINDER_PRESETS.map((p) => (
              <option key={p.offsetMin} value={p.offsetMin} disabled={!due}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom date and time…</option>
          </Select>
        </div>
      )}

      {permission === "default" && (
        <div className="bg-band flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
          <span className="text-caption flex-1">
            Turn on browser notifications to be alerted when a reminder fires.
          </span>
          <Button size="sm" variant="secondary" onClick={() => void requestPermission()}>
            Enable
          </Button>
        </div>
      )}
    </fieldset>
  );
}
