"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** WorkDesk mark: a check resting on a desk line, on the brand mint. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M9.5 15.5l4.2 4.2L22.5 10.8"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 24.5h16" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({
  collapsed = false,
  compactOnSmall = false,
  href = "/today",
  className,
}: {
  collapsed?: boolean;
  /** Mark only on narrow screens, where the top bar is crowded. */
  compactOnSmall?: boolean;
  /** Where the logo goes. The signed-out landing page points it at `/`. */
  href?: string;
  className?: string;
}) {
  return (
    <Tooltip label="WorkDesk" detail="Home" disabled={!collapsed}>
      <Link
        href={href}
        aria-label="WorkDesk home"
        className={cn("flex items-center gap-2.5 rounded-xl pointer-coarse:min-w-11", className)}
      >
        <LogoMark />
        <span
          className={cn(
            "font-heading text-[22px] leading-none font-bold tracking-[-0.3px] whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none",
            collapsed && "opacity-0",
            compactOnSmall && "max-[479px]:sr-only",
          )}
        >
          WorkDesk
        </span>
      </Link>
    </Tooltip>
  );
}
