import type { Metadata } from "next";
import Link from "next/link";
import { DailyReviewView } from "@/components/review/daily-review";
import { WeeklyReviewView } from "@/components/review/weekly-review";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { isValidKey } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { listProjects } from "@/server/projects";
import { getDailyReview, getWeeklyReview } from "@/server/review";
import { requireUserId } from "@/server/session";

export const metadata: Metadata = { title: "Review" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReviewPage(props: PageProps<"/review">) {
  const sp = await props.searchParams;
  const tab = first(sp.tab) === "weekly" ? "weekly" : "daily";
  const week = first(sp.week);
  const userId = await requireUserId();

  const tabClass = (active: boolean) =>
    cn(
      "text-nav min-h-9 rounded-full border px-4 inline-flex items-center",
      active
        ? "border-transparent bg-btn-primary text-btn-primary-fg"
        : "border-border hover:bg-surface-soft",
    );

  return (
    <PageContainer>
      <PageHeader title="Review" subtitle="Close out the day, and look back on the week." />
      <nav aria-label="Review type" className="mb-6 flex gap-2">
        <Link
          href="/review"
          aria-current={tab === "daily" ? "page" : undefined}
          className={tabClass(tab === "daily")}
        >
          Daily
        </Link>
        <Link
          href="/review?tab=weekly"
          aria-current={tab === "weekly" ? "page" : undefined}
          className={tabClass(tab === "weekly")}
        >
          Weekly
        </Link>
      </nav>
      {tab === "daily" ? (
        <DailyReviewView review={await getDailyReview(userId)} />
      ) : (
        <WeeklyReviewView
          data={await getWeeklyReview(userId, isValidKey(week) ? week : undefined)}
          projectNames={Object.fromEntries(
            (await listProjects(userId, true)).map((p) => [p.id, p.name]),
          )}
        />
      )}
    </PageContainer>
  );
}
