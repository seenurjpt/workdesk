"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";
import { PublicThemeToggle } from "@/components/shared/public-theme-toggle";
import { cn } from "@/lib/utils";
import { adminLogoutAction } from "@/server/actions";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

/**
 * The administrator's own shell: no tasks, notes, projects or search, just the admin sections.
 * Sidebar on large screens; a top bar with a scrolling row of sections on phones.
 */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const signOut = (
    <button
      type="button"
      onClick={() => void adminLogoutAction()}
      aria-label="Sign out"
      className="text-foreground hover:bg-surface-soft border-border inline-flex h-10 items-center gap-2 rounded-full border px-3 transition-colors"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="text-nav hidden md:inline">Sign out</span>
    </button>
  );
  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="focus:bg-btn-primary focus:text-btn-primary-fg sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="border-border bg-surface flex flex-col border-b md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-16 items-center gap-3 px-4">
          <Logo href="/admin" />
          <span className="bg-band text-accent-text text-caption inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold">
            <ShieldCheck className="size-3.5" aria-hidden /> Admin
          </span>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <PublicThemeToggle />
            {signOut}
          </div>
        </div>
        <nav
          aria-label="Admin sections"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0"
        >
          {NAV.map((n) => {
            const active = "exact" in n ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-nav flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 transition-colors duration-150",
                  active ? "bg-band font-semibold" : "hover:bg-surface-soft",
                )}
              >
                <n.icon className="size-5" aria-hidden /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-border mt-auto hidden space-y-3 border-t p-4 md:block">
          <p className="text-caption text-muted-strong break-all" title={email}>
            Signed in as <span className="text-foreground font-semibold">{email}</span>
          </p>
          <div className="flex items-center gap-2">
            <PublicThemeToggle />
            {signOut}
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
