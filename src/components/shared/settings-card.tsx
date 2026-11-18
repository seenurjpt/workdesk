import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One self-contained block of the Settings page: icon, title, short help text and its controls. */
export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "border-border bg-surface flex h-full scroll-mt-24 flex-col rounded-3xl border p-5 sm:p-6",
        className,
      )}
    >
      <header className="flex items-start gap-3.5">
        <span className="bg-band inline-flex size-10 shrink-0 items-center justify-center rounded-2xl">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-xl leading-tight font-bold">
            {title}
          </h2>
          {description && <p className="text-caption text-muted-strong mt-1">{description}</p>}
        </div>
      </header>
      <div className="mt-5 flex-1 space-y-5">{children}</div>
    </section>
  );
}

/** A thin rule between groups of controls inside one card. */
export function CardDivider() {
  return <hr className="border-border" />;
}
