"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatItem } from "@/components/layout/page-header";
import { useApp } from "@/components/shared/user-context";
import { formatMinutes, weeklyReportMarkdown } from "@/lib/review";
import { keyToUtc, titleFor } from "@/lib/calendar";
import type { WeeklyData } from "@/server/review";
import { ReviewRow } from "./review-row";

function TimeBars({ items }: { items: { name: string; minutes: number }[] }) {
  const max = Math.max(...items.map((i) => i.minutes), 1);
  return (
    <ul aria-label="Time tracked per project" className="space-y-3">
      {items.map((i) => (
        <li key={i.name}>
          <div className="text-body-sm mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate font-semibold">{i.name}</span>
            <span className="text-muted-strong tabular-nums">{formatMinutes(i.minutes)}</span>
          </div>
          <div className="bg-surface-soft h-3 overflow-hidden rounded-full" role="presentation">
            <div
              className="bg-accent h-full rounded-full"
              style={{ width: `${Math.max(2, (i.minutes / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WeeklyReviewView({
  data,
  projectNames,
}: {
  data: WeeklyData;
  projectNames: Record<string, string>;
}) {
  const { user } = useApp();
  const pathname = usePathname();
  const { review } = data;
  const rangeLabel = titleFor("week", data.weekStart, user.weekStartsOn);
  const link = (week: string) => `${pathname}?tab=weekly&week=${week}`;

  async function copyReport() {
    const markdown = weeklyReportMarkdown(review, {
      rangeLabel,
      projectName: (id) => (id ? (projectNames[id] ?? "Project") : "No project"),
      formatDay: (iso) => formatInTimeZone(new Date(iso), user.timezone, "EEE d MMM"),
    });
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Weekly report copied", {
        description: "Paste it into your standup or appraisal notes.",
      });
    } catch {
      toast.error("Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  const rate = review.completionRate === null ? "–" : `${Math.round(review.completionRate * 100)}%`;
  const day = (iso: string | null) =>
    iso ? formatInTimeZone(new Date(iso), user.timezone, "EEE d MMM") : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-heading mr-2 text-2xl font-bold">{rangeLabel}</h2>
        <Button asChild variant="secondary" size="iconSm" className="pointer-coarse:min-w-11">
          <Link href={link(data.prevWeek)} aria-label="Previous week">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="iconSm" className="pointer-coarse:min-w-11">
          <Link href={link(data.nextWeek)} aria-label="Next week">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
        {!data.isCurrentWeek && (
          <Button asChild variant="secondary" size="sm">
            <Link href={`${pathname}?tab=weekly`}>This week</Link>
          </Button>
        )}
        <Button variant="accent" className="ml-auto" onClick={() => void copyReport()}>
          <ClipboardCopy className="size-4" aria-hidden /> Copy weekly report
        </Button>
      </div>

      <div className="bg-band mb-8 flex flex-wrap gap-10 rounded-3xl p-6">
        <StatItem value={review.completedCount} label="Tasks completed" />
        <div>
          <div className="font-heading text-[38px] leading-none font-bold">{rate}</div>
          <div className="text-caption text-muted-strong mt-1">
            {review.completionRate === null
              ? "Nothing was due"
              : `${review.dueDone} of ${review.dueTotal} due tasks done`}
          </div>
        </div>
        <div>
          <div className="font-heading text-[38px] leading-none font-bold">
            {formatMinutes(review.totalMinutes)}
          </div>
          <div className="text-caption text-muted-strong mt-1">Time tracked</div>
        </div>
        <StatItem value={review.notesCreated} label="Notes created" />
      </div>

      <section aria-labelledby="time-heading" className="mb-8">
        <h2 id="time-heading" className="text-nav mb-3">
          Time by project
        </h2>
        {review.timeByProject.length === 0 ? (
          <p className="text-body-sm text-muted-strong">
            No time tracked this week. Start a timer on a task to see it here.
          </p>
        ) : (
          <TimeBars items={review.timeByProject} />
        )}
      </section>

      <section aria-labelledby="slipped-heading" className="mb-8">
        <h2 id="slipped-heading" className="text-nav mb-1">
          Slipped{" "}
          <span className="text-caption bg-surface-soft text-muted-strong rounded-full px-2 py-0.5">
            {review.slipped.length}
          </span>
        </h2>
        {review.slipped.length === 0 ? (
          <p className="text-body-sm border-border text-muted-strong border-t py-4">
            Nothing slipped this week.
          </p>
        ) : (
          <ul aria-label="Slipped tasks" className="border-border border-t">
            {review.slipped.map((t) => (
              <ReviewRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="completed-heading">
        <h2 id="completed-heading" className="text-nav mb-1">
          Completed{" "}
          <span className="text-caption bg-surface-soft text-muted-strong rounded-full px-2 py-0.5">
            {review.completed.length}
          </span>
        </h2>
        {review.completed.length === 0 ? (
          <p className="text-body-sm border-border text-muted-strong border-t py-4">
            Nothing completed yet.
          </p>
        ) : (
          <ul aria-label="Completed tasks" className="border-border border-t">
            {review.completed.map((t) => (
              <li
                key={t.id}
                className="text-body-sm border-border flex items-center justify-between gap-3 border-b px-1 py-2.5"
              >
                <span className="truncate">{t.title}</span>
                <span className="text-caption text-muted-strong shrink-0">
                  {day(t.completedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="sr-only">Week starting {keyToUtc(data.weekStart).toDateString()}</p>
    </div>
  );
}
