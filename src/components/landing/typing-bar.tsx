"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { parseQuickAdd } from "@/lib/quick-add-parser";
import { describeParsed } from "@/components/landing/parsed-chips";

const SENTENCES = [
  "Send report tomorrow 5pm #clientA @report !high",
  "Water the office plants every friday",
  "Contract review next monday wait:Priya remind:1h",
  "Book retro room thursday 10am #team !p2",
];

/** Types sentences into a mock quick-add bar and shows what the real parser makes of them. */
export function TypingBar() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;

    const show = (s: string) => {
      const r = parseQuickAdd(s, { timezone: tz });
      setText(s);
      setTitle(r.title);
      setChips(describeParsed(r));
    };

    if (reduced) {
      timer = setTimeout(() => {
        show(SENTENCES[0]);
        setDone(true);
      }, 0);
      return () => clearTimeout(timer);
    }

    const tick = () => {
      const s = SENTENCES[i % SENTENCES.length];
      if (n <= s.length) {
        show(s.slice(0, n));
        setDone(false);
        n += 1;
        timer = setTimeout(tick, 38 + Math.random() * 30);
      } else {
        setDone(true);
        timer = setTimeout(() => {
          i += 1;
          n = 0;
          tick();
        }, 2600);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="border-border bg-surface shadow-float mx-auto w-full max-w-2xl rounded-3xl border p-3 text-left sm:p-4">
      <div
        className="border-border bg-surface-soft/60 flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3"
        role="img"
        aria-label="Demo: a task typed in plain words and turned into a dated, tagged task"
      >
        <span className="bg-accent text-on-accent inline-flex size-7 shrink-0 items-center justify-center rounded-full">
          <Plus className="size-4" aria-hidden />
        </span>
        <span className="text-body-sm min-w-0 flex-1 font-semibold break-words" aria-hidden>
          {text || <span className="text-muted-strong font-light">Add a task…</span>}
          <span className="lp-caret bg-foreground ml-0.5 inline-block h-4 w-0.5 translate-y-0.5" />
        </span>
      </div>
      <div className="flex min-h-[68px] flex-wrap items-center gap-2 px-1 pt-3" aria-hidden>
        {title && (
          <span className="text-caption mr-1 font-semibold">
            <span className="text-muted-strong font-light">Title </span>
            {title}
          </span>
        )}
        {chips.map((c) => (
          <span
            key={c}
            className="lp-pop bg-band text-caption rounded-full px-3 py-1 font-semibold"
          >
            {c}
          </span>
        ))}
        {done && chips.length === 0 && (
          <span className="text-caption text-muted-strong">Just a title</span>
        )}
      </div>
    </div>
  );
}
