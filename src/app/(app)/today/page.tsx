import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { PageContainer, StatItem } from "@/components/layout/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { TaskTabs, parseTab, type TaskTab } from "@/components/tasks/task-tabs";
import { Ticker } from "@/components/tasks/ticker";
import { ReviewPrompt } from "@/components/review/review-prompt";
import { dayKey, isOverdue } from "@/lib/dates";
import { requireUser } from "@/server/session";
import { countTabs, getViewData } from "@/server/tasks";

const TITLES: Record<TaskTab, string> = {
  all: "All tasks",
  today: "Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
};

export async function generateMetadata(props: PageProps<"/today">): Promise<Metadata> {
  return { title: TITLES[parseTab((await props.searchParams).tab)] };
}

const EMPTY: Record<TaskTab, { title: string; body: string }> = {
  all: { title: "No open tasks", body: "Everything is done. Add a task and it will show up here." },
  today: {
    title: "A clear day ahead",
    body: "Nothing is due today. Add a task and it will show up here.",
  },
  upcoming: { title: "Nothing coming up", body: "No tasks are scheduled for the next two weeks." },
  overdue: { title: "Nothing overdue", body: "You are all caught up. Nice." },
};

export default async function TodayPage(props: PageProps<"/today">) {
  const tab = parseTab((await props.searchParams).tab);
  const user = await requireUser();
  const now = new Date();

  // The header stats and ticker always describe today; the list below follows the tab.
  const [todayData, counts, tabData] = await Promise.all([
    getViewData(user.id, { kind: "today" }, user.timezone),
    countTabs(user.id, user.timezone, now),
    tab === "today" ? null : getViewData(user.id, { kind: tab }, user.timezone),
  ]);
  const data = tabData ?? todayData;

  const overdue = todayData.tasks.filter(
    (t) => t.dueAt && isOverdue(new Date(t.dueAt), t.allDay, now, user.timezone),
  ).length;
  const afterWork = formatInTimeZone(now, user.timezone, "HH:mm") >= user.workHours.end;
  const hour = Number(formatInTimeZone(now, user.timezone, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <section className="bg-band">
        <PageContainer className="py-8">
          <p className="text-body-sm text-muted-strong">
            {formatInTimeZone(now, user.timezone, "EEEE, d MMMM")}
          </p>
          <h1 className="text-page-title">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <div className="mt-6 flex gap-10">
            <StatItem value={todayData.tasks.length - overdue} label="Due today" />
            <StatItem value={overdue} label="Overdue" />
            <StatItem value={todayData.completed.length} label="Done today" />
          </div>
        </PageContainer>
      </section>
      <Ticker tasks={todayData.tasks} />
      <PageContainer>
        <ReviewPrompt dayKey={dayKey(now, user.timezone)} show={afterWork} />
        <TaskTabs active={tab} counts={counts} />
        <TaskList
          key={tab}
          view={{ kind: tab }}
          initial={data}
          mode={
            tab === "today"
              ? "today"
              : tab === "upcoming"
                ? "upcoming"
                : tab === "all"
                  ? "all"
                  : "flat"
          }
          emptyTitle={EMPTY[tab].title}
          emptyBody={EMPTY[tab].body}
        />
      </PageContainer>
    </>
  );
}
