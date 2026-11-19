"use client";

import type { ReactNode } from "react";
import { usePersistentBool } from "@/hooks/use-persistent-bool";
import { cn } from "@/lib/utils";
// import { FocusStrip } from "@/components/focus/focus-strip"; // previous design: strip under the top bar
import { FocusDock } from "@/components/focus/focus-strip";
import { useFocus } from "@/components/focus/focus-provider";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentBool("workdesk:sidebar-collapsed");
  // While the timer dock floats at the bottom, leave room so it never covers the end of a page.
  const { timer } = useFocus();

  return (
    <div className="min-h-dvh">
      <aside
        className={cn(
          "border-border bg-background fixed inset-y-0 left-0 z-20 hidden flex-col overflow-hidden border-r transition-[width] duration-[320ms] motion-reduce:transition-none md:flex print:hidden",
          "ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className="border-border flex h-16 shrink-0 items-center border-b px-5 pb-px">
          <Logo collapsed={collapsed} className="w-full" />
        </div>
        <Sidebar collapsed={collapsed} />
      </aside>
      <div
        className={cn(
          collapsed ? "md:pl-[72px]" : "md:pl-64",
          "transition-[padding-left] duration-[320ms] motion-reduce:transition-none",
          "ease-[cubic-bezier(0.4,0,0.2,1)]",
          "print:pl-0",
        )}
      >
        <Topbar onToggleSidebar={() => setCollapsed(!collapsed)} />
        {/* <FocusStrip /> previous design: swap back for <FocusDock /> below to restore */}
        <FocusDock />
        {/* previous: className="pb-28 md:pb-8" */}
        <main id="main" className={cn("pb-28 md:pb-8", timer && "pb-44 md:pb-28")}>
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
