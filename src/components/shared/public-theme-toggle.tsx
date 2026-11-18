"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/shared/theme-provider";
import { Moon, Sun } from "lucide-react";
import { withThemeTransition } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * Light / dark switch for the signed-out pages (landing, sign in, sign up). Two states only, no
 * "system" option. The choice is remembered in this browser, and nothing is sent to the server.
 */
export function PublicThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const next = dark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => withThemeTransition(next, () => setTheme(next))}
      aria-label={mounted ? `Switch to ${next} mode` : "Switch theme"}
      title={mounted ? `Switch to ${next} mode` : undefined}
      className={cn(
        "text-foreground hover:bg-surface-soft border-border hover:border-muted-strong inline-flex size-10 items-center justify-center rounded-full border transition-colors duration-150",
        className,
      )}
    >
      {mounted ? (
        dark ? (
          <Sun className="size-5" aria-hidden />
        ) : (
          <Moon className="size-5" aria-hidden />
        )
      ) : (
        <span className="size-5" aria-hidden />
      )}
    </button>
  );
}
