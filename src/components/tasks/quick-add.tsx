"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Calendar, Flag, FolderPlus, Hash, Hourglass, Plus, Repeat, Tag } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApp } from "@/components/shared/user-context";
import { VIEW_KEY } from "@/hooks/use-task-mutations";
import { formatDue } from "@/lib/format";
import { describeOffset } from "@/lib/reminders";
import { parseQuickAdd } from "@/lib/quick-add-parser";
import { cn } from "@/lib/utils";
import { useOffline } from "@/components/shared/offline-provider";
import { isNetworkError } from "@/lib/offline-queue";
import { quickAddAction } from "@/server/actions";
import { isTypingTarget } from "@/lib/typing-target";

interface QuickAddContextValue {
  open: () => void;
}
const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside QuickAddProvider");
  return ctx;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "q" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QuickAddContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          title="Quick add"
          description="Try: Send report tomorrow 5pm #clientA @report !high every monday"
          className="top-[20%] max-w-2xl translate-y-0"
        >
          <QuickAddInput autoFocus onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </QuickAddContext.Provider>
  );
}

function Chip({
  icon: Icon,
  children,
  tone,
}: {
  icon: typeof Tag;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <li
      className={cn(
        "text-caption bg-surface-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </li>
  );
}

const PRIORITY_LABEL = { 1: "P1 Urgent", 2: "P2 High", 3: "P3 Medium", 4: "P4 Low" } as const;

export function QuickAddInput({
  autoFocus = false,
  onDone,
  placeholder = "Add a task… e.g. Send report tomorrow 5pm #clientA @report !high",
  floatingPreview = false,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
  placeholder?: string;
  floatingPreview?: boolean;
}) {
  const { user, projects } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();

  const parsed = useMemo(
    () => parseQuickAdd(text, { timezone: user.timezone }),
    [text, user.timezone],
  );
  const existingProject = parsed.projectName
    ? projects.find((p) => p.name.toLowerCase() === parsed.projectName?.toLowerCase())
    : undefined;
  const due = parsed.dueAt
    ? formatDue(parsed.dueAt.toISOString(), parsed.allDay, user.timezone)
    : null;
  const hasChips = Boolean(
    due ||
    parsed.priority ||
    parsed.projectName ||
    parsed.tags.length ||
    parsed.recurrence ||
    parsed.waitingOn ||
    parsed.remindOffsetMin !== undefined,
  );

  async function submit() {
    if (busy || !parsed.title) {
      if (!parsed.title && text.trim()) toast.error("Add a title for the task");
      return;
    }
    setBusy(true);
    const saveOffline = () => {
      offline.queue({ type: "quickAdd", text });
      toast("Saved offline", { description: "It will be added when you're back online." });
      setText("");
      onDone?.();
    };
    if (!offline.online) {
      setBusy(false);
      return saveOffline();
    }
    let res;
    try {
      res = await quickAddAction({ text });
    } catch (error) {
      setBusy(false);
      if (isNetworkError(error)) return saveOffline();
      throw error;
    }
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Task added", { description: res.data.title });
    setText("");
    void qc.invalidateQueries({ queryKey: [VIEW_KEY] });
    router.refresh();
    onDone?.();
  }

  return (
    <div className="relative">
      <Plus
        className={cn(
          "text-muted-strong pointer-events-none absolute left-4 z-10 size-4",
          floatingPreview ? "top-3" : "top-4",
        )}
        aria-hidden
      />
      <input
        type="text"
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        maxLength={500}
        placeholder={placeholder}
        aria-label="Quick add task"
        aria-describedby="quick-add-preview"
        className={cn(
          "border-border placeholder:text-muted-strong focus-visible:outline-ring w-full rounded-2xl border pr-4 pl-10 transition-colors duration-150",
          "hover:border-muted-strong focus-visible:border-transparent focus-visible:outline-2 focus-visible:-outline-offset-2",
          floatingPreview
            ? "bg-surface-soft focus-visible:bg-surface h-10 py-0 text-sm"
            : "bg-surface py-3 text-base",
        )}
      />
      <div
        id="quick-add-preview"
        aria-live="polite"
        className={cn(
          floatingPreview &&
            text.trim() &&
            "border-border bg-surface shadow-float absolute inset-x-0 top-full z-40 mt-2 animate-[pop-in_0.16s_cubic-bezier(0.16,1,0.3,1)] rounded-2xl border p-3 motion-reduce:animate-none",
          !floatingPreview && "mt-3",
        )}
      >
        {text.trim() ? (
          <>
            <p className="text-body-sm mb-2 truncate">
              <span className="text-muted-strong">Title: </span>
              <span className="font-semibold">{parsed.title || "—"}</span>
            </p>
            {hasChips && (
              <ul className="flex flex-wrap gap-2">
                {due && (
                  <Chip icon={Calendar} tone={due.overdue ? "text-danger" : undefined}>
                    {due.label}
                  </Chip>
                )}
                {parsed.priority && <Chip icon={Flag}>{PRIORITY_LABEL[parsed.priority]}</Chip>}
                {parsed.projectName && (
                  <Chip icon={existingProject ? Hash : FolderPlus}>
                    {existingProject ? existingProject.name : `${parsed.projectName} (new project)`}
                  </Chip>
                )}
                {parsed.tags.map((t) => (
                  <Chip key={t} icon={Tag}>
                    {t}
                  </Chip>
                ))}
                {parsed.recurrence && <Chip icon={Repeat}>{parsed.recurrence.label}</Chip>}
                {parsed.remindOffsetMin !== undefined && (
                  <Chip icon={Bell}>
                    Remind {describeOffset(parsed.remindOffsetMin).toLowerCase()}
                  </Chip>
                )}
                {parsed.waitingOn && (
                  <Chip icon={Hourglass}>Waiting on {parsed.waitingOn.person}</Chip>
                )}
              </ul>
            )}
            <p className="text-caption text-muted-strong mt-2">Enter to add · Esc to cancel</p>
          </>
        ) : (
          !floatingPreview && (
            <p className="text-caption text-muted-strong">
              Use #project, @tag, !p1–!p4, “tomorrow 5pm”, “every monday”, remind:15m, wait:person
            </p>
          )
        )}
      </div>
    </div>
  );
}
