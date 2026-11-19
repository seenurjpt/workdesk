import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ACTIVITY_DAYS, listActivity } from "@/server/activity";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  const entries = await listActivity(user.id);
  const tz = user.timezone;
  const dayFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const groups: { day: string; items: { id: string; time: string; summary: string }[] }[] = [];
  for (const e of entries) {
    const d = new Date(e.at);
    const day = dayFmt.format(d);
    let g = groups.at(-1);
    if (!g || g.day !== day) {
      g = { day, items: [] };
      groups.push(g);
    }
    g.items.push({ id: e.id, time: timeFmt.format(d), summary: e.summary });
  }
  return (
    <PageContainer>
      <PageHeader
        title="Activity"
        subtitle={`What you did in WorkDesk over the last ${ACTIVITY_DAYS} days. Only you can see this, and older entries are removed automatically.`}
      />
      {groups.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Add, complete or edit something and it will show up here."
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.day} aria-labelledby={`d-${g.day}`}>
              <h2 id={`d-${g.day}`} className="font-heading mb-2 text-xl font-bold">
                {g.day}
              </h2>
              <ul className="divide-border border-border bg-surface divide-y rounded-3xl border">
                {g.items.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-4 px-5 py-3">
                    <time className="text-caption text-muted-strong w-12 shrink-0 tabular-nums">
                      {i.time}
                    </time>
                    <span className="text-body-sm min-w-0 break-words">{i.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
