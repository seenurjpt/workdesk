import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small shared pieces for the admin pages. */

export function Badge({
  tone,
  children,
}: {
  tone: "admin" | "suspended" | "active" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold",
        tone === "admin" && "bg-band text-accent-text",
        tone === "suspended" && "bg-danger/15 text-danger",
        tone === "active" && "bg-surface-soft text-muted-strong",
        tone === "neutral" && "bg-surface-soft text-muted-strong",
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-border bg-surface rounded-3xl border p-5 sm:p-6", className)}>
      {title && <h2 className="font-heading mb-4 text-xl font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="border-border bg-surface rounded-3xl border p-5">
      <p className="text-caption text-muted-strong font-semibold">{label}</p>
      <p className="font-heading mt-1 text-[34px] leading-none font-bold tabular-nums">{value}</p>
      {hint && <p className="text-caption text-muted-strong mt-2">{hint}</p>}
    </div>
  );
}

/** Previous / next links for a server-rendered, paged list. */
export function Pager({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const link =
    "text-nav border-border hover:bg-surface-soft inline-flex h-10 items-center rounded-full border px-4 transition-colors";
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={link}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-caption text-muted-strong">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={link}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** "3 Nov 2026, 14:05" in the viewer's timezone. */
export function formatWhen(iso: string | null, timeZone: string): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

const ACTION_LABELS: Record<string, string> = {
  "user.suspend": "Suspended an account",
  "user.reactivate": "Reactivated an account",
  "user.promote": "Made an administrator",
  "user.demote": "Removed administrator rights",
  "user.reset-password": "Reset a password",
  "user.create": "Created an account",
  "user.delete": "Deleted an account",
  "settings.registration-open": "Opened sign-ups",
  "settings.registration-closed": "Closed sign-ups",
  "maintenance.purge-trash": "Purged expired Trash",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
