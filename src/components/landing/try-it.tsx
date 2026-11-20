"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { parseQuickAdd } from "@/lib/quick-add-parser";
import { CurvedInput } from "@/components/landing/curved-input";
import { describeParsed } from "@/components/landing/parsed-chips";

const EXAMPLES = [
  "Call Sam friday 3pm #sales !p1",
  "Water plants every week @home",
  "Contract wait:Priya remind:1d tomorrow 10am",
  "Submit expenses 25 dec !low",
];

/** A real input wired to the same parser the app uses. Nothing is sent or saved. */
export function TryIt() {
  const [value, setValue] = useState(EXAMPLES[0]);
  const result = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return parseQuickAdd(value, { timezone: tz });
  }, [value]);
  // Dates depend on the visitor's locale and clock, so they are only drawn after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const chips = mounted ? describeParsed(result) : [];

  return (
    <div className="border-border bg-surface shadow-float rounded-3xl border p-4 sm:p-6">
      <p className="text-caption text-muted-strong mb-3 flex items-center gap-1.5 font-semibold">
        <Sparkles className="size-4" aria-hidden /> Try it. Type anything, nothing is saved.
      </p>
      <CurvedInput
        value={value}
        onChange={setValue}
        ariaLabel="Type a task the way you would say it"
        placeholder="Call Sam friday 3pm #sales !p1"
        type="text"
        width="100%"
        height={60}
        bend={18}
        cornerRadius={18}
        showButton={false}
        shadowSize="sm"
        shadowColor="#000000"
        backgroundColor="var(--surface-soft)"
        textColor="var(--text)"
        placeholderColor="var(--text-muted)"
        borderColor="var(--border)"
        buttonColor="var(--accent)"
        icon={
          <g>
            <circle r={11} fill="var(--accent)" />
            <path
              d="M -4.5 0 H 4.5 M 0 -4.5 V 4.5"
              stroke="var(--on-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="text-caption border-border hover:border-muted-strong hover:bg-surface-soft max-w-full truncate rounded-full border px-3 py-1 transition-colors duration-150"
          >
            {ex}
          </button>
        ))}
      </div>
      <div className="border-border mt-5 border-t pt-4" aria-live="polite">
        <p className="text-caption text-muted-strong">WorkDesk would create</p>
        <p className="font-heading mt-1 text-2xl font-bold break-words">
          {result.title || <span className="text-muted-strong">Start typing…</span>}
        </p>
        <div className="mt-3 flex min-h-8 flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="lp-pop bg-band text-caption rounded-full px-3 py-1 font-semibold"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
