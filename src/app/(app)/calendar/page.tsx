import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { gridDays, isValidKey, visibleRange, type CalendarMode } from "@/lib/calendar";
import { dayKey } from "@/lib/dates";
import { requireUser } from "@/server/session";
import { listCalendarTasks } from "@/server/tasks";

export const metadata: Metadata = { title: "Calendar" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const sp = await props.searchParams;
  const user = await requireUser();
  const today = dayKey(new Date(), user.timezone);
  const mode: CalendarMode = first(sp.view) === "week" ? "week" : "month";
  const dateParam = first(sp.date);
  const anchor = isValidKey(dateParam) ? dateParam : today;

  const days = gridDays(mode, anchor, user.weekStartsOn);
  const { from, to } = visibleRange(days, user.timezone);
  const tasks = await listCalendarTasks(user.id, from, to);

  return (
    <PageContainer>
      <PageHeader
        title="Calendar"
        subtitle="Drag a task to another day to reschedule. Click a day to add one."
      />
      <CalendarView
        key={`${mode}-${anchor}`}
        initial={tasks}
        mode={mode}
        anchor={anchor}
        today={today}
      />
    </PageContainer>
  );
}
