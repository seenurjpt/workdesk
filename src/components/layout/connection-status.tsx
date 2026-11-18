"use client";

import { Check, WifiOff } from "lucide-react";
import { useOffline } from "@/components/shared/offline-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Shows in the top bar while there is no connection, and briefly turns green when it comes back.
 * Nothing is rendered while you are online, so it never takes up space.
 */
export function ConnectionStatus() {
  const { online, recovered, pending } = useOffline();
  const visible = !online || recovered;
  const waiting =
    pending > 0
      ? `${pending} change${pending === 1 ? "" : "s"} will sync when you're back.`
      : "Adding or completing tasks still works.";

  return (
    <div role="status" aria-live="polite" className="contents">
      {visible && (
        <Tooltip
          side="bottom"
          label={online ? "Back online" : "You're offline"}
          detail={online ? undefined : waiting}
        >
          <span
            data-testid="connection-status"
            className={cn(
              "lp-pop text-caption inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 font-semibold sm:px-3",
              online
                ? "border-success/40 bg-success/15 text-accent-text"
                : "border-warning/50 bg-warning/15 text-foreground",
            )}
          >
            {online ? (
              <Check className="size-4" strokeWidth={3} aria-hidden />
            ) : (
              <WifiOff className="size-4" aria-hidden />
            )}
            <span className="max-sm:sr-only">{online ? "Back online" : "Offline"}</span>
            {!online && pending > 0 && (
              <span className="bg-warning text-on-accent rounded-full px-1.5 text-[11px] leading-4">
                {pending}
              </span>
            )}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
