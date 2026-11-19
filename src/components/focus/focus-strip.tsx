"use client";

import { Maximize2, Square, Timer } from "lucide-react";
import { formatClock } from "@/lib/focus";
import { captureDockRect } from "@/lib/focus-morph";
import { cn } from "@/lib/utils";
import { useFocus } from "./focus-provider";

/**
 * The running timer as a floating dock at the bottom centre of the screen (above the tab bar on
 * phones), so it is always in view while you work.
 *
 * TO GO BACK to the old full-width strip under the top bar: see the commented-out `FocusStrip`
 * below, and in `layout/app-shell.tsx` swap `<FocusDock />` for `<FocusStrip />` (the old line is
 * left there, commented). On phones `layout/mobile-nav.tsx` also lifts the add button while the
 * dock is showing; that bit is marked there too.
 */
export function FocusDock() {
  const { timer, elapsedMs, remainingMs, stop, modeOpen, setModeOpen } = useFocus();
  if (!timer) return null;
  const pomodoro = timer.mode === "pomodoro";
  const time = formatClock(pomodoro ? (remainingMs ?? 0) : elapsedMs);
  const label = pomodoro ? (timer.phase === "work" ? "Focus" : "Break") : "Timer";
  return (
    <div
      role="region"
      aria-label="Running timer"
      className={cn(
        // While the focus screen grows out of the dock, the dock stays on top of it for a moment
        // and then fades, so it looks like the dock itself is expanding.
        // Same colours as the primary button: a dark dock in light mode, a light one in dark mode.
        // PREVIOUS: "bg-ticker text-ticker-fg ..." (dark in both modes)
        "bg-btn-primary text-btn-primary-fg shadow-float lp-pop fixed transition-opacity duration-200",
        "flex items-center gap-3 rounded-full py-2 pr-2 pl-2.5 ring-1 ring-white/10 print:hidden",
        modeOpen ? "pointer-events-none z-[60] opacity-0 delay-200" : "z-40",
        // phones: above the tab bar, nearly full width. larger screens: bottom centre.
        "inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mx-auto max-w-md",
        "md:inset-x-auto md:bottom-5 md:left-1/2 md:max-w-xl md:-translate-x-1/2",
      )}
    >
      <span className="bg-accent text-on-accent relative inline-flex size-10 shrink-0 items-center justify-center rounded-full">
        <Timer className="size-5" aria-hidden />
        <span
          className="bg-btn-primary-fg absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full ring-2 ring-[var(--btn-primary-bg)] motion-reduce:animate-none"
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="text-caption block font-semibold opacity-70">{label}</span>
        <span className="text-body-sm block truncate font-semibold">{timer.taskTitle}</span>
      </span>
      <span className="font-heading text-2xl font-bold tabular-nums" aria-live="off">
        {time}
      </span>
      <button
        type="button"
        onClick={() => {
          captureDockRect(); // so the focus screen can grow out of the dock
          setModeOpen(true);
        }}
        aria-label="Open focus mode"
        className="bg-btn-primary-fg/15 hover:bg-btn-primary-fg/25 inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
      >
        <Maximize2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => void stop()}
        className="bg-btn-primary-fg text-btn-primary inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-opacity duration-150 hover:opacity-85"
      >
        <Square className="size-4" aria-hidden /> Stop
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// PREVIOUS DESIGN (kept so it can be restored quickly): a full-width strip under the top bar.
// To restore: uncomment this block, add `import { Button } from "@/components/ui/button";` at the
// top of this file, then use <FocusStrip /> instead of <FocusDock /> in layout/app-shell.tsx.
// ---------------------------------------------------------------------------------------------
// /** Always-visible reminder that a timer is running. */
// export function FocusStrip() {
//   const { timer, elapsedMs, remainingMs, stop, setModeOpen } = useFocus();
//   if (!timer) return null;
//   const pomodoro = timer.mode === "pomodoro";
//   const time = formatClock(pomodoro ? (remainingMs ?? 0) : elapsedMs);
//   const label = pomodoro ? (timer.phase === "work" ? "Focus" : "Break") : "Timer";
//   return (
//     <div
//       role="region"
//       aria-label="Running timer"
//       className="border-border bg-band sticky top-16 z-20 flex items-center gap-3 border-b px-4 py-2 print:hidden"
//     >
//       <Timer className="text-accent-text size-4 shrink-0" aria-hidden />
//       <span className="text-caption font-semibold">{label}</span>
//       <span className="text-body-sm min-w-0 flex-1 truncate font-semibold">{timer.taskTitle}</span>
//       <span className="font-heading text-xl font-bold tabular-nums" aria-live="off">
//         {time}
//       </span>
//       <Button
//         size="sm"
//         variant="secondary"
//         onClick={() => setModeOpen(true)}
//         aria-label="Open focus mode"
//       >
//         <Maximize2 className="size-4" aria-hidden />{" "}
//         <span className="max-sm:sr-only">Focus mode</span>
//       </Button>
//       <Button size="sm" onClick={() => void stop()}>
//         <Square className="size-4" aria-hidden /> Stop
//       </Button>
//     </div>
//   );
// }
