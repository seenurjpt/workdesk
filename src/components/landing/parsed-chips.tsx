import type { QuickAddResult } from "@/lib/quick-add-parser";

const PRIORITY = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" } as const;

/** What the parser understood, as short labels. Shared by the hero demo and the try-it box. */
export function describeParsed(r: QuickAddResult): string[] {
  const out: string[] = [];
  if (r.dueAt) {
    out.push(
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(r.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
      }).format(r.dueAt),
    );
  }
  if (r.projectName) out.push(`Project: ${r.projectName}`);
  for (const t of r.tags) out.push(`@${t}`);
  if (r.priority) out.push(`${PRIORITY[r.priority]} priority`);
  if (r.recurrence) out.push(`Repeats ${r.recurrence.label.toLowerCase()}`);
  if (r.waitingOn) out.push(`Waiting on ${r.waitingOn.person}`);
  if (r.remindOffsetMin) {
    const m = r.remindOffsetMin;
    out.push(`Reminder ${m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`} before`);
  }
  return out;
}
