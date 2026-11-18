"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SHORTCUTS, stepSequence, type SequenceState } from "@/lib/shortcuts";
import { createNoteAction } from "@/server/actions";
import { isTypingTarget } from "@/lib/typing-target";

interface ShortcutContextValue {
  openHelp: () => void;
}
const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function useShortcutHelp(): ShortcutContextValue {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error("useShortcutHelp must be used inside ShortcutProvider");
  return ctx;
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const sequence = useRef<SequenceState>({ pendingSince: null });

  const newNote = useCallback(async () => {
    const res = await createNoteAction({});
    if (!res.ok) return void toast.error(res.error);
    router.push(`/notes/${res.data.id}`);
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));

      if (e.key === "?") {
        if (dialogOpen) return;
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (dialogOpen) return;
      if (e.key.length !== 1) return;

      if (e.key.toLowerCase() === "n" && sequence.current.pendingSince === null) {
        e.preventDefault();
        void newNote();
        return;
      }
      const result = stepSequence(sequence.current, e.key, Date.now());
      sequence.current = result.state;
      if (result.consumed) e.preventDefault();
      if (result.navigate) router.push(result.navigate);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, router]);

  return (
    <ShortcutContext.Provider value={{ openHelp: () => setHelpOpen(true) }}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          title="Keyboard shortcuts"
          description="Shortcuts work when you are not typing in a field."
          className="max-w-xl"
        >
          <div className="space-y-5">
            {SHORTCUTS.map((group) => (
              <section key={group.group} aria-label={group.group}>
                <h3 className="text-caption text-muted-strong mb-2 font-semibold">{group.group}</h3>
                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item.label}
                      className="text-body-sm flex items-center justify-between gap-4"
                    >
                      <span>{item.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {item.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && item.keys.length === 2 && group.group === "Go to" && (
                              <span className="text-caption text-muted-strong">then</span>
                            )}
                            <kbd className="text-caption border-border bg-surface-soft min-w-6 rounded-md border px-1.5 py-0.5 text-center font-semibold">
                              {k}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="text-body-sm mt-4">
            <Link
              href="/help"
              onClick={() => setHelpOpen(false)}
              className="text-accent-text font-semibold underline underline-offset-2"
            >
              Open the full guide
            </Link>{" "}
            for quick-add commands and tips.
          </p>
        </DialogContent>
      </Dialog>
    </ShortcutContext.Provider>
  );
}
