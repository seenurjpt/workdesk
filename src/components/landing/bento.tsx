import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

function Card({
  title,
  body,
  className,
  delay,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className={cn("flex", className)}>
      <article className="border-border bg-surface hover:border-muted-strong group flex w-full flex-col overflow-hidden rounded-3xl border transition-[border-color,box-shadow] duration-200 hover:shadow-md">
        <div
          aria-hidden
          className="bg-band/70 relative flex min-h-44 flex-1 items-center justify-center overflow-hidden p-5"
        >
          {children}
        </div>
        <div className="p-6">
          <h3 className="font-heading text-xl font-bold">{title}</h3>
          <p className="text-body-sm text-muted-strong mt-2 leading-relaxed">{body}</p>
        </div>
      </article>
    </Reveal>
  );
}

const pill =
  "bg-surface text-caption rounded-full border border-border px-2.5 py-0.5 font-semibold";

export function Bento() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-6">
      <Card
        className="lg:col-span-4"
        title="Notes that point at the work"
        body="A rich editor with autosave and version history. Mention a task with @ or another note with [[ and each side links back to the other."
      >
        <div className="bg-surface border-border w-full max-w-md rounded-2xl border p-4 text-left shadow-sm transition-transform duration-300 group-hover:-rotate-1">
          <p className="font-heading text-lg font-bold">Q4 planning</p>
          <p className="text-body-sm text-muted-strong mt-2">
            Goals: ship the roadmap after the client review. Owner{" "}
            <span className={cn(pill, "text-accent-text")}>@Send report</span> see also{" "}
            <span className={cn(pill, "text-info")}>[[Hiring plan]]</span>
          </p>
          <div className="text-caption text-muted-strong mt-3 flex items-center gap-2">
            <span className="bg-accent size-2 rounded-full" /> Saved · 3 versions
          </div>
        </div>
      </Card>

      <Card
        className="lg:col-span-2"
        delay={80}
        title="Focus, then review"
        body="Stopwatch or Pomodoro on any task. Time rolls up into a weekly report."
      >
        <svg viewBox="0 0 120 120" className="size-32">
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray="301"
            strokeDashoffset="95"
            transform="rotate(-90 60 60)"
          />
          <text
            x="60"
            y="66"
            textAnchor="middle"
            className="font-heading"
            fontSize="22"
            fontWeight="700"
            fill="var(--text)"
          >
            18:42
          </text>
        </svg>
      </Card>

      <Card
        className="lg:col-span-2"
        title="A board that moves"
        body="Drag cards between columns, or use the keyboard."
      >
        <div className="grid w-full max-w-xs grid-cols-3 gap-2">
          {[
            ["To do", 3],
            ["Doing", 2],
            ["Done", 1],
          ].map(([name, n], c) => (
            <div
              key={name as string}
              className="bg-surface/70 border-border rounded-xl border p-1.5"
            >
              <p className="text-caption text-muted-strong mb-1.5 font-semibold">
                {name as string}
              </p>
              {Array.from({ length: n as number }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "bg-surface border-border mb-1.5 h-7 rounded-lg border",
                    c === 1 && i === 0 && "lp-float border-accent",
                  )}
                  style={{ "--r": "-3deg" } as React.CSSProperties}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card
        className="lg:col-span-2"
        delay={80}
        title="Meetings become actions"
        body="Select the action lines and convert each to a linked task."
      >
        <ul className="w-full max-w-[15rem] space-y-2 text-left">
          {["Draft job description", "Schedule interviews", "Share minutes"].map((t, i) => (
            <li
              key={t}
              className="bg-surface border-border text-caption flex items-center gap-2 rounded-xl border px-3 py-2 font-semibold"
            >
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full border-2",
                  i === 0 ? "bg-accent border-accent" : "border-muted-strong",
                )}
              />
              {t}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        className="lg:col-span-2"
        delay={160}
        title="Waiting on, never forgotten"
        body="Track what others owe you, with a follow-up date."
      >
        <ul className="w-full max-w-[15rem] space-y-2 text-left">
          {[
            ["Priya", "Contract", "today", true],
            ["Dev team", "Estimate", "in 2d", false],
            ["Sam", "Invoice", "in 5d", false],
          ].map(([who, what, when, hot]) => (
            <li
              key={who as string}
              className="bg-surface border-border text-caption flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
            >
              <span className="min-w-0 truncate">
                <strong>{who as string}</strong> · {what as string}
              </span>
              <span
                className={cn("shrink-0 font-semibold", hot ? "text-danger" : "text-muted-strong")}
              >
                {when as string}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
