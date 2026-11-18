import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { dayKey, dayRange, isOverdue } from "@/lib/dates";

export function formatDue(
  iso: string,
  allDay: boolean,
  timezone: string,
  now = new Date(),
): { label: string; overdue: boolean } {
  const due = new Date(iso);
  const today = dayRange(now, timezone, 0);
  const key = dayKey(due, timezone);
  const tomorrowKey = dayKey(dayRange(now, timezone, 1).start, timezone);
  const yesterdayKey = dayKey(dayRange(now, timezone, -1).start, timezone);
  const time = allDay ? "" : ` ${formatInTimeZone(due, timezone, "h:mm a")}`;

  let day: string;
  if (key === dayKey(today.start, timezone)) day = "Today";
  else if (key === tomorrowKey) day = "Tomorrow";
  else if (key === yesterdayKey) day = "Yesterday";
  else
    day = formatInTimeZone(
      due,
      timezone,
      due.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy",
    );

  return { label: `${day}${time}`, overdue: isOverdue(due, allDay, now, timezone) };
}

/** `yyyy-MM-dd` + optional `HH:mm` entered in the user's timezone -> UTC Date. */
export function parseLocalInput(date: string, time: string | undefined, timezone: string): Date {
  return fromZonedTime(`${date}T${time || "00:00"}:00`, timezone);
}

export function toDateInput(iso: string | null, timezone: string): string {
  return iso ? formatInTimeZone(new Date(iso), timezone, "yyyy-MM-dd") : "";
}

export function toTimeInput(iso: string | null, allDay: boolean, timezone: string): string {
  return iso && !allDay ? formatInTimeZone(new Date(iso), timezone, "HH:mm") : "";
}
