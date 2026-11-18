import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TabCounts } from "@/server/tasks";

export type TaskTab = "all" | "today" | "upcoming" | "overdue";

export const TASK_TABS: { value: TaskTab; label: string; href: string }[] = [
  { value: "all", label: "All", href: "/today?tab=all" },
  { value: "today", label: "Today", href: "/today" },
  { value: "upcoming", label: "Upcoming", href: "/today?tab=upcoming" },
  { value: "overdue", label: "Overdue", href: "/today?tab=overdue" },
];

export function parseTab(value: string | string[] | undefined): TaskTab {
  const v = Array.isArray(value) ? value[0] : value;
  return TASK_TABS.find((t) => t.value === v)?.value ?? "today";
}

/** Today, Upcoming and Overdue as tabs of one page. Server-rendered links, so each tab has its own URL. */
export function TaskTabs({ active, counts }: { active: TaskTab; counts: TabCounts }) {
  return (
    <nav aria-label="Task views" className="mb-6 flex flex-wrap gap-1.5 sm:gap-2">
      {TASK_TABS.map(({ value, label, href }) => {
        const isActive = active === value;
        const count = counts[value];
        return (
          <Link
            key={value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-nav inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 sm:gap-2 sm:px-4",
              isActive
                ? "bg-btn-primary text-btn-primary-fg border-transparent"
                : "border-border hover:border-muted-strong hover:bg-surface-soft transition-colors duration-150",
            )}
          >
            {label}
            <span
              className={cn(
                "text-caption min-w-5 rounded-full px-1.5 text-center font-semibold",
                isActive ? "bg-btn-primary-fg/20" : "bg-surface-soft",
                value === "overdue" && count > 0 && !isActive && "text-danger",
              )}
            >
              <span className="sr-only">: </span>
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
