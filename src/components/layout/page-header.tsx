import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  leading,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-3">
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="text-page-title">{title}</h1>
        {subtitle && <p className="text-body-sm text-muted-strong mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-heading text-[38px] leading-none font-bold">{value}</div>
      <div className="text-caption text-muted-strong mt-1">{label}</div>
    </div>
  );
}
