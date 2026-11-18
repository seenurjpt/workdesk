import { Check, CalendarDays, Flag, Inbox, FileText, LayoutGrid, Repeat, Sun } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

const TABS = [
  ["All", "12", true],
  ["Today", "4", false],
  ["Upcoming", "5", false],
  ["Overdue", "1", false],
] as const;

const ROWS = [
  {
    title: "Send Q4 report to Client A",
    meta: "Today 5:00 PM",
    p: "text-p2",
    chip: "Client A",
    late: false,
  },
  {
    title: "Follow up on vendor quote",
    meta: "Yesterday",
    p: "text-p1",
    chip: "Vendors",
    late: true,
  },
  {
    title: "Monthly invoice run",
    meta: "Every month",
    p: "text-p3",
    chip: "Finance",
    late: false,
    repeat: true,
  },
  {
    title: "Book meeting room for retro",
    meta: "Fri 10:00 AM",
    p: "text-p4",
    chip: "Team",
    late: false,
  },
] as const;

/** A static, decorative picture of the app built from the same tokens as the real UI. */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "border-border bg-surface shadow-float overflow-hidden rounded-3xl border text-left select-none",
        className,
      )}
    >
      <div className="border-border flex items-center gap-1.5 border-b px-4 py-3">
        <span className="bg-border size-2.5 rounded-full" />
        <span className="bg-border size-2.5 rounded-full" />
        <span className="bg-border size-2.5 rounded-full" />
        <span className="bg-surface-soft text-caption text-muted-strong ml-3 hidden rounded-full px-3 py-0.5 sm:block">
          workdesk / today
        </span>
      </div>
      <div className="grid sm:grid-cols-[168px_minmax(0,1fr)]">
        <div className="border-border bg-surface-soft/50 hidden space-y-1 border-r p-3 sm:block">
          <div className="mb-3 flex items-center gap-2 px-1">
            <LogoMark className="size-6" />
            <span className="font-heading text-lg font-bold">WorkDesk</span>
          </div>
          {[
            [Inbox, "Inbox", false],
            [Sun, "Today", true],
            [LayoutGrid, "Board", false],
            [CalendarDays, "Calendar", false],
            [FileText, "Notes", false],
          ].map(([Icon, label, on]) => {
            const I = Icon as typeof Inbox;
            return (
              <div
                key={label as string}
                className={cn(
                  "text-nav flex items-center gap-2.5 rounded-xl px-2.5 py-1.5",
                  on && "bg-surface border-accent border",
                )}
              >
                <I className="size-4" /> {label as string}
              </div>
            );
          })}
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TABS.map(([label, count, on]) => (
              <span
                key={label}
                className={cn(
                  "text-caption inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold",
                  on ? "bg-btn-primary text-btn-primary-fg border-transparent" : "border-border",
                  label === "Overdue" && !on && "text-danger",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5",
                    on ? "bg-btn-primary-fg/20" : "bg-surface-soft",
                  )}
                >
                  {count}
                </span>
              </span>
            ))}
          </div>
          <ul>
            {ROWS.map((r) => (
              <li
                key={r.title}
                className="border-border flex items-start gap-3 border-b py-3 last:border-0"
              >
                <span className="border-muted-strong mt-0.5 size-5 shrink-0 rounded-full border-2" />
                <span className="min-w-0">
                  <span className="text-body-sm block truncate font-semibold">{r.title}</span>
                  <span className="text-caption text-muted-strong mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn("inline-flex items-center gap-1", r.p)}>
                      <Flag className="size-3" /> P
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        r.late && "text-danger font-semibold",
                      )}
                    >
                      {"repeat" in r && r.repeat && <Repeat className="size-3" />}
                      {r.meta}
                    </span>
                    <span className="bg-surface-soft rounded-full px-2 py-0.5">{r.chip}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="text-caption text-muted-strong mt-2 flex items-center gap-2">
            <Check className="text-accent-text size-4" /> 3 done today
          </div>
        </div>
      </div>
    </div>
  );
}
