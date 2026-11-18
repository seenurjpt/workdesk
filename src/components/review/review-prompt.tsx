"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalStorageString } from "@/hooks/use-local-storage";

/** Nudges toward the daily review once work hours are over. Hidden for the rest of the day when dismissed. */
export function ReviewPrompt({ dayKey, show }: { dayKey: string; show: boolean }) {
  const [dismissed, setDismissed] = useLocalStorageString("workdesk:review-dismissed");
  if (!show || dismissed === dayKey) return null;
  return (
    <aside
      aria-label="Daily review"
      className="border-border bg-band mb-6 flex flex-wrap items-center gap-3 rounded-3xl border p-4"
    >
      <p className="text-body-sm min-w-0 flex-1 font-semibold">
        Work hours are over. Take two minutes to close out the day?
      </p>
      <Button asChild size="sm" variant="accent">
        <Link href="/review">Start daily review</Link>
      </Button>
      <Button
        variant="utility"
        size="iconSm"
        aria-label="Dismiss until tomorrow"
        onClick={() => setDismissed(dayKey)}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </aside>
  );
}
