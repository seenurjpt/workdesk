"use client";

import { Repeat } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { describeRrule, WEEKDAY_CODES, type RepeatFreq, type WeekdayCode } from "@/lib/recurrence";
import { repeatToRrule, type RepeatMode, type RepeatState } from "@/lib/repeat-state";
import { cn } from "@/lib/utils";

const DAY_LABELS: Record<WeekdayCode, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const UNITS: { value: RepeatFreq; singular: string }[] = [
  { value: "DAILY", singular: "day" },
  { value: "WEEKLY", singular: "week" },
  { value: "MONTHLY", singular: "month" },
  { value: "YEARLY", singular: "year" },
];

interface Props {
  value: RepeatState;
  onChange: (next: RepeatState) => void;
  hasDueDate: boolean;
  error?: string;
}

export function RepeatField({ value, onChange, hasDueDate, error }: Props) {
  const set = (patch: Partial<RepeatState>) => onChange({ ...value, ...patch });
  const rrule = repeatToRrule(value);

  return (
    <fieldset className="space-y-3">
      <legend className="text-body-sm mb-1 flex items-center gap-2 font-semibold">
        <Repeat className="size-4" aria-hidden /> Repeat
      </legend>
      <div>
        <Label htmlFor="repeat-mode" className="sr-only">
          Repeat
        </Label>
        <Select
          id="repeat-mode"
          value={value.mode}
          onValueChange={(v) => set({ mode: v as RepeatMode })}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday (Mon–Fri)</option>
          <option value="weekly">Every week (same day)</option>
          <option value="monthly">Every month (same date)</option>
          <option value="custom">Custom…</option>
        </Select>
      </div>

      {value.mode === "custom" && (
        <div className="bg-surface-soft space-y-3 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-body-sm">Every</span>
            <Input
              type="number"
              min={1}
              max={365}
              aria-label="Repeat interval"
              className="w-20 py-2"
              value={value.interval}
              onChange={(e) => set({ interval: Number(e.target.value) })}
            />
            <Select
              aria-label="Repeat unit"
              className="w-auto py-2"
              value={value.freq}
              onValueChange={(v) => set({ freq: v as RepeatFreq })}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.singular}
                  {value.interval === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
          </div>
          {value.freq === "WEEKLY" && (
            <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
              {WEEKDAY_CODES.map((code) => {
                const on = value.weekdays.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        weekdays: on
                          ? value.weekdays.filter((d) => d !== code)
                          : [...value.weekdays, code],
                      })
                    }
                    className={cn(
                      "text-caption min-h-9 rounded-full border px-3 font-semibold",
                      on
                        ? "bg-btn-primary text-btn-primary-fg border-transparent"
                        : "border-border hover:bg-surface",
                    )}
                  >
                    {DAY_LABELS[code]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {value.mode !== "none" && (
        <>
          <div>
            <Label htmlFor="repeat-ends">Ends on (optional)</Label>
            <Input
              id="repeat-ends"
              type="date"
              value={value.endsOn}
              onChange={(e) => set({ endsOn: e.target.value })}
            />
          </div>
          <p className="text-caption text-muted-strong">
            {rrule ? describeRrule(rrule) : ""}. Completing it creates the next one automatically.
          </p>
          {!hasDueDate && (
            <p role="alert" className="text-caption text-danger">
              Pick a due date to repeat this task.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
