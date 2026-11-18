"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * One provider for the whole app makes the tooltips a "warm" group: the first one waits a moment,
 * and while it is warm (until a short time after the last one closes) its neighbours open at once.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={450} skipDelayDuration={900} disableHoverableContent>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  /** The main message. */
  label: string;
  /** A quieter second part, e.g. "5 open". */
  detail?: string;
  /** Keyboard shortcut keys, e.g. ["G", "T"]. */
  keys?: string[];
  side?: "top" | "right" | "bottom" | "left";
  /** Render the child as is, with no tooltip. */
  disabled?: boolean;
  /** A single element that can take a ref. */
  children: React.ReactElement;
}

export function Tooltip({ label, detail, keys, side = "right", disabled, children }: TooltipProps) {
  // Always the same tree, so toggling `disabled` (e.g. when the sidebar opens) never remounts the
  // trigger and cuts its own transitions short.
  const [open, setOpen] = React.useState(false);
  // When disabled (the sidebar opens), forget being open. Otherwise every tooltip that was showing
  // comes back the next time the sidebar collapses.
  const [wasDisabled, setWasDisabled] = React.useState(disabled);
  if (wasDisabled !== disabled) {
    setWasDisabled(disabled);
    if (disabled) setOpen(false);
  }
  return (
    <TooltipPrimitive.Root
      open={open && !disabled}
      onOpenChange={(next) => setOpen(next && !disabled)}
    >
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={10}
          collisionPadding={8}
          className="tip bg-ticker text-ticker-fg text-caption shadow-float z-[110] flex max-w-64 items-center gap-2.5 rounded-xl px-3 py-2 font-semibold ring-1 ring-white/10"
        >
          <span>{label}</span>
          {detail && <span className="font-normal opacity-70">{detail}</span>}
          {keys && keys.length > 0 && (
            <span className="flex items-center gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-5 rounded-md bg-white/15 px-1.5 py-px text-center text-[11px] leading-4 font-semibold"
                >
                  {k}
                </kbd>
              ))}
            </span>
          )}
          <TooltipPrimitive.Arrow width={10} height={5} className="fill-[var(--ticker-bg)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
