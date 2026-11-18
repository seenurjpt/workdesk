"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatItem } from "@/components/layout/page-header";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import type { DailyReview } from "@/lib/review";
import type { TaskDTO } from "@/lib/types";
import { carryOverAction } from "@/server/actions";
import { ReviewRow } from "./review-row";

function Section({
  title,
  hint,
  tasks,
  children,
}: {
  title: string;
  hint?: string;
  tasks: TaskDTO[];
  children?: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-nav flex items-center gap-2">
          {title}
          <span className="text-caption bg-surface-soft text-muted-strong rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </h2>
        {children}
      </div>
      {hint && <p className="text-caption text-muted-strong mb-2">{hint}</p>}
      {tasks.length === 0 ? (
        <p className="text-body-sm border-border text-muted-strong border-t py-4">Nothing here.</p>
      ) : null}
    </section>
  );
}

export function DailyReviewView({ review }: { review: DailyReview }) {
  const router = useRouter();
  const qc = useQueryClient();

  async function carryAll(tasks: TaskDTO[]) {
    let moved = 0;
    for (const t of tasks) {
      const res = await carryOverAction({ taskId: t.id, to: "tomorrow" });
      if (res.ok) moved++;
    }
    toast.success(`Carried ${moved} task${moved === 1 ? "" : "s"} over to tomorrow`);
    invalidateTaskQueries(qc);
    router.refresh();
  }

  const openCount = review.stillOpen.length + review.slipped.length;

  return (
    <div>
      <div className="bg-band mb-2 flex flex-wrap gap-10 rounded-3xl p-6">
        <StatItem value={review.completed.length} label="Completed today" />
        <StatItem value={review.stillOpen.length} label="Still open today" />
        <StatItem value={review.slipped.length} label="Slipped earlier" />
      </div>

      <Section title="Completed today" tasks={review.completed} />
      {review.completed.length > 0 && (
        <ul aria-label="Completed today" className="border-border border-t">
          {review.completed.map((t) => (
            <li
              key={t.id}
              className="text-body-sm border-border text-muted-strong flex items-center gap-3 border-b px-1 py-3"
            >
              <Check className="text-accent-text size-4 shrink-0" aria-hidden />
              <span className="line-through">{t.title}</span>
            </li>
          ))}
        </ul>
      )}

      <Section
        title="Still open today"
        hint="Planned for today but not done. Move them on, or let them go."
        tasks={review.stillOpen}
      >
        {review.stillOpen.length > 1 && (
          <Button size="sm" variant="secondary" onClick={() => void carryAll(review.stillOpen)}>
            Carry all over
          </Button>
        )}
      </Section>
      {review.stillOpen.length > 0 && (
        <ul aria-label="Still open today" className="border-border border-t">
          {review.stillOpen.map((t) => (
            <ReviewRow key={t.id} task={t} />
          ))}
        </ul>
      )}

      <Section
        title="Slipped from earlier"
        hint="Past their day and still open."
        tasks={review.slipped}
      >
        {review.slipped.length > 1 && (
          <Button size="sm" variant="secondary" onClick={() => void carryAll(review.slipped)}>
            Carry all over
          </Button>
        )}
      </Section>
      {review.slipped.length > 0 && (
        <ul aria-label="Slipped from earlier" className="border-border border-t">
          {review.slipped.map((t) => (
            <ReviewRow key={t.id} task={t} />
          ))}
        </ul>
      )}

      {openCount === 0 && (
        <p className="font-heading mt-8 text-2xl font-bold">All clear. Nice work today.</p>
      )}
    </div>
  );
}
