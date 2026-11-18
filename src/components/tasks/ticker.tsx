import type { TaskDTO } from "@/lib/types";

export function Ticker({ tasks }: { tasks: TaskDTO[] }) {
  if (tasks.length === 0) return null;
  const base = tasks.slice(0, 20);
  const items = Array.from({ length: Math.max(1, Math.ceil(10 / base.length)) }, () => base).flat();
  const strip = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <li key={`${t.id}-${i}`} className="text-nav flex items-center gap-3 whitespace-nowrap">
          <span className="bg-accent size-2 rounded-full" aria-hidden />
          {t.title}
        </li>
      ))}
    </ul>
  );
  return (
    <section
      aria-label="Today's tasks ticker"
      className="ticker bg-ticker text-ticker-fg overflow-hidden py-3"
    >
      <div className="ticker-track">
        {strip(false)}
        <span className="contents motion-reduce:hidden">{strip(true)}</span>
      </div>
    </section>
  );
}
