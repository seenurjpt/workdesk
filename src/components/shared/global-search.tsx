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
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  Keyboard,
  Pin,
  Search,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useFocus } from "@/components/focus/focus-provider";
import { useQuickAdd } from "@/components/tasks/quick-add";
import { useShortcutHelp } from "@/components/shared/keyboard-shortcuts";
import { useThemeChoice } from "@/components/shared/theme-toggle";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { useDebounced } from "@/hooks/use-debounced";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { statusList, statusName, type CustomStatus } from "@/lib/statuses";
import type { PriorityValue, SnippetPart, TaskDTO, TaskStatus } from "@/lib/types";
import {
  createMeetingNoteAction,
  createNoteAction,
  deleteTaskAction,
  restoreTaskAction,
  rescheduleTaskAction,
} from "@/server/actions";
import { globalSearchAction } from "@/server/queries";
import { dayKey, dayRange } from "@/lib/dates";
import { useApp } from "@/components/shared/user-context";
import { cn } from "@/lib/utils";
import { useTrashFx } from "@/components/shared/trash-bin";
import { isTypingTarget } from "@/lib/typing-target";

interface GlobalSearchContextValue {
  open: () => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}
const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) throw new Error("useGlobalSearch must be used inside GlobalSearchProvider");
  return ctx;
}

/** Starts a file download without leaving the page. */
function downloadFile(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Holds the open state and the shortcuts (Ctrl/Cmd+K, `/`). The dialog itself is `GlobalSearchHost`. */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <GlobalSearchContext.Provider value={{ open, isOpen, setOpen }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

function Highlighted({ parts }: { parts: SnippetPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="hit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

interface Cmd {
  id: string;
  label: string;
  group: "Go to" | "Create" | "Appearance" | "Timer" | "Export" | "Help";
  keywords?: string;
  run: () => void | Promise<void>;
}

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-strong";
const ITEM_CLASS =
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 data-[selected=true]:bg-surface-soft";

const PRIORITIES: { value: PriorityValue; label: string }[] = [
  { value: 1, label: "P1 · Urgent" },
  { value: 2, label: "P2 · High" },
  { value: 3, label: "P3 · Medium" },
  { value: 4, label: "P4 · Low" },
];

export function GlobalSearchHost() {
  const router = useRouter();
  const { isOpen, setOpen } = useGlobalSearch();
  const { user } = useApp();
  const { open: openTask } = useTaskEditor();
  const quickAdd = useQuickAdd();
  const { openHelp } = useShortcutHelp();
  const { choose } = useThemeChoice();
  const { timer, start, stop } = useFocus();
  const { update } = useTaskMutations();
  const fx = useTrashFx();

  const [query, setQuery] = useState("");
  const [task, setTask] = useState<TaskDTO | null>(null); // the task whose actions are shown
  const debounced = useDebounced(query.trim(), 120);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setTask(null);
  }, [setOpen]);

  const go = useCallback(
    (path: string) => () => {
      close();
      router.push(path);
    },
    [close, router],
  );

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: "go-today", label: "Go to Today", group: "Go to", keywords: "home", run: go("/today") },
      { id: "go-inbox", label: "Go to Inbox", group: "Go to", run: go("/inbox") },
      { id: "go-all", label: "Go to All tasks", group: "Go to", run: go("/today?tab=all") },
      {
        id: "go-upcoming",
        label: "Go to Upcoming",
        group: "Go to",
        run: go("/today?tab=upcoming"),
      },
      {
        id: "go-help",
        label: "Help and guide",
        group: "Go to",
        keywords: "commands shortcuts syntax how",
        run: go("/help"),
      },
      { id: "go-overdue", label: "Go to Overdue", group: "Go to", run: go("/today?tab=overdue") },
      {
        id: "go-general",
        label: "Go to General (no project)",
        group: "Go to",
        run: go("/general"),
      },
      {
        id: "go-board",
        label: "Go to Board",
        group: "Go to",
        keywords: "kanban",
        run: go("/board"),
      },
      { id: "go-calendar", label: "Go to Calendar", group: "Go to", run: go("/calendar") },
      { id: "go-notes", label: "Go to Notes", group: "Go to", run: go("/notes") },
      { id: "go-waiting", label: "Go to Waiting on", group: "Go to", run: go("/waiting") },
      { id: "go-review", label: "Go to Daily review", group: "Go to", run: go("/review") },
      {
        id: "go-weekly",
        label: "Go to Weekly review",
        group: "Go to",
        keywords: "report",
        run: go("/review?tab=weekly"),
      },
      { id: "go-templates", label: "Go to Templates", group: "Go to", run: go("/templates") },
      { id: "go-trash", label: "Go to Trash", group: "Go to", run: go("/trash") },
      {
        id: "go-activity",
        label: "Go to Activity",
        group: "Go to",
        keywords: "history log",
        run: go("/activity"),
      },
      {
        id: "go-settings",
        label: "Go to Settings",
        group: "Go to",
        keywords: "preferences",
        run: go("/settings"),
      },
      {
        id: "new-task",
        label: "New task",
        group: "Create",
        keywords: "add quick",
        run: () => {
          close();
          setTimeout(quickAdd.open, 0);
        },
      },
      {
        id: "new-note",
        label: "New note",
        group: "Create",
        run: async () => {
          const res = await createNoteAction({});
          if (!res.ok) return void toast.error(res.error);
          close();
          router.push(`/notes/${res.data.id}`);
        },
      },
      {
        id: "new-meeting",
        label: "New meeting note",
        group: "Create",
        run: async () => {
          const res = await createMeetingNoteAction();
          if (!res.ok) return void toast.error(res.error);
          close();
          router.push(`/notes/${res.data.id}`);
        },
      },
      {
        id: "theme-light",
        label: "Switch to light theme",
        group: "Appearance",
        keywords: "theme",
        run: () => (choose("light"), close()),
      },
      {
        id: "theme-dark",
        label: "Switch to dark theme",
        group: "Appearance",
        keywords: "theme",
        run: () => (choose("dark"), close()),
      },
      {
        id: "theme-system",
        label: "Use system theme",
        group: "Appearance",
        keywords: "theme",
        run: () => (choose("system"), close()),
      },
      {
        id: "export-json",
        label: "Export all data (JSON)",
        group: "Export",
        keywords: "download backup",
        run: () => {
          close();
          downloadFile("/api/export?type=json");
        },
      },
      {
        id: "export-csv",
        label: "Export tasks (CSV)",
        group: "Export",
        keywords: "download spreadsheet",
        run: () => {
          close();
          downloadFile("/api/export?type=tasks-csv");
        },
      },
      {
        id: "help",
        label: "Keyboard shortcuts",
        group: "Help",
        keywords: "help ?",
        run: () => (close(), openHelp()),
      },
    ];
    if (timer)
      list.splice(17, 0, {
        id: "stop-timer",
        label: `Stop timer (${timer.taskTitle})`,
        group: "Timer",
        run: async () => (close(), await stop()),
      });
    return list;
  }, [go, close, quickAdd.open, router, choose, openHelp, timer, stop]);

  // Commands filter on every keystroke; only the server search waits for the debounce.
  const q = query.trim().toLowerCase();
  const matching = useMemo(
    () =>
      q
        ? commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q))
        : commands,
    [commands, q],
  );

  const { data: fetched, isFetching } = useQuery({
    queryKey: ["search", debounced],
    enabled: isOpen && !task && debounced.length > 0,
    queryFn: async () => {
      const res = await globalSearchAction(debounced);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 5_000,
  });

  // Results belong to the debounced text. While you are still typing they are stale, and Enter must
  // never pick one of them over what is on screen for what you just typed.
  const data = debounced === query.trim() ? fetched : undefined;
  const hasQuery = debounced.length > 0;
  const noResults =
    hasQuery &&
    data &&
    !isFetching &&
    data.tasks.length === 0 &&
    data.notes.length === 0 &&
    matching.length === 0;
  const groups = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    for (const c of matching) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [matching]);

  // ---- task actions page ----

  async function setStatus(t: TaskDTO, status: TaskStatus) {
    update.mutate({ id: t.id, patch: { status } });
    toast.success(`Status: ${statusName(status, user.customStatuses, user.statusOrder)}`, {
      description: t.title,
    });
    close();
  }
  function setPriority(t: TaskDTO, priority: PriorityValue) {
    update.mutate({ id: t.id, patch: { priority } });
    toast.success(`Priority: P${priority}`, { description: t.title });
    close();
  }
  async function tomorrow(t: TaskDTO) {
    const key = dayKey(dayRange(new Date(), user.timezone, 1).start, user.timezone);
    const res = await rescheduleTaskAction({ taskId: t.id, dayKey: key });
    if (!res.ok) return void toast.error(res.error);
    toast.success("Moved to tomorrow", { description: t.title });
    close();
    router.refresh();
  }
  function trash(t: TaskDTO) {
    fx.fly(t.id, t.title);
    void deleteTaskAction(t.id).then((res) => {
      if (!res.ok) return void toast.error(res.error);
      toast("Task deleted", {
        description: t.title,
        action: {
          label: "Undo",
          onClick: () => void restoreTaskAction(t.id).then(() => router.refresh()),
        },
      });
      router.refresh();
    });
    close();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        title="Command palette"
        description="Search tasks and notes, or run a command"
        hideTitle
        className="top-[15%] max-w-2xl translate-y-0 p-0"
      >
        <Command
          shouldFilter={false}
          label="Command palette"
          loop
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !query && task) {
              e.preventDefault();
              setTask(null);
            }
          }}
        >
          <div className="border-border border-b p-3">
            <div className="border-border focus-within:outline-focus flex items-center gap-3 rounded-xl border px-3 focus-within:outline-2 focus-within:-outline-offset-2">
              {task ? (
                <Terminal className="text-muted-strong size-5 shrink-0" aria-hidden />
              ) : (
                <Search className="text-muted-strong size-5 shrink-0" aria-hidden />
              )}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={
                  task
                    ? `Actions for “${task.title}”`
                    : "Search tasks and notes, or type a command…"
                }
                className="placeholder:text-muted-strong w-full bg-transparent py-3 pr-10 text-base focus-visible:outline-none"
              />
            </div>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {task ? (
              <TaskActions
                task={task}
                query={query}
                onBack={() => {
                  setTask(null);
                  setQuery("");
                }}
                onOpen={() => {
                  close();
                  openTask(task);
                }}
                onDone={() => {
                  update.mutate({
                    id: task.id,
                    patch: { status: task.status === "done" ? "todo" : "done" },
                  });
                  close();
                }}
                customStatuses={user.customStatuses}
                statusOrder={user.statusOrder}
                onStatus={(s) => void setStatus(task, s)}
                onPriority={(p) => setPriority(task, p)}
                onTomorrow={() => void tomorrow(task)}
                timerTaskId={timer?.taskId ?? null}
                onStopTimer={() => {
                  close();
                  void stop();
                }}
                onTimer={(mode) => {
                  close();
                  void start({ id: task.id, title: task.title }, mode);
                }}
                onDelete={() => trash(task)}
              />
            ) : (
              <>
                {hasQuery && !data && matching.length === 0 && (
                  <p className="text-body-sm text-muted-strong px-3 py-6 text-center">Searching…</p>
                )}
                {noResults && (
                  <p className="text-body-sm text-muted-strong px-3 py-6 text-center">
                    No results for “{debounced}”.
                  </p>
                )}

                {data && data.notes.length > 0 && (
                  <Command.Group heading="Notes" className={GROUP_CLASS}>
                    {data.notes.map((n) => (
                      <Command.Item
                        key={n.id}
                        value={`note-${n.id}`}
                        onSelect={() => {
                          close();
                          router.push(`/notes/${n.id}`);
                        }}
                        className={cn(ITEM_CLASS, "items-start")}
                      >
                        <FileText
                          className="text-muted-strong mt-0.5 size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-body-sm flex items-center gap-1.5 font-semibold">
                            <span className="truncate">
                              <Highlighted parts={n.titleParts} />
                            </span>
                            {n.pinned && (
                              <Pin
                                className="text-accent-text size-3 shrink-0"
                                aria-label="Pinned"
                              />
                            )}
                          </span>
                          {n.snippet.length > 0 &&
                            n.snippet
                              .map((p) => p.text)
                              .join("")
                              .trim() !== "" && (
                              <span className="text-caption text-muted-strong line-clamp-2 block">
                                <Highlighted parts={n.snippet} />
                              </span>
                            )}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {data && data.tasks.length > 0 && (
                  <Command.Group heading="Tasks (Enter for actions)" className={GROUP_CLASS}>
                    {data.tasks.map(({ task: t, titleParts }) => (
                      <Command.Item
                        key={t.id}
                        value={`task-${t.id}`}
                        onSelect={() => {
                          setTask(t);
                          setQuery("");
                        }}
                        className={ITEM_CLASS}
                      >
                        {t.status === "done" ? (
                          <CheckCircle2
                            className="text-accent-text size-4 shrink-0"
                            aria-label="Done"
                          />
                        ) : (
                          <Circle className="text-muted-strong size-4 shrink-0" aria-label="Open" />
                        )}
                        <span className="text-body-sm truncate">
                          <Highlighted parts={titleParts} />
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {groups.map(([heading, cmds]) => (
                  <Command.Group key={heading} heading={heading} className={GROUP_CLASS}>
                    {cmds.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`cmd-${c.id}`}
                        onSelect={() => void c.run()}
                        className={ITEM_CLASS}
                      >
                        {c.id === "help" ? (
                          <Keyboard className="text-muted-strong size-4 shrink-0" aria-hidden />
                        ) : (
                          <span className="size-4 shrink-0" aria-hidden />
                        )}
                        <span className="text-body-sm">{c.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </>
            )}
          </Command.List>
          <div className="text-caption border-border text-muted-strong flex gap-4 border-t px-5 py-2">
            <span>↑↓ navigate</span>
            <span>Enter select</span>
            <span>{task ? "Backspace back" : "Esc close"}</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function TaskActions({
  task,
  query,
  onBack,
  onOpen,
  onDone,
  customStatuses,
  statusOrder,
  onStatus,
  onPriority,
  onTomorrow,
  onTimer,
  timerTaskId,
  onStopTimer,
  onDelete,
}: {
  task: TaskDTO;
  query: string;
  onBack: () => void;
  onOpen: () => void;
  onDone: () => void;
  customStatuses: CustomStatus[];
  statusOrder: string[];
  onStatus: (s: TaskStatus) => void;
  onPriority: (p: PriorityValue) => void;
  onTomorrow: () => void;
  onTimer: (mode: "stopwatch" | "pomodoro") => void;
  /** The task the running timer belongs to, if any. */
  timerTaskId: string | null;
  onStopTimer: () => void;
  onDelete: () => void;
}) {
  const q = query.trim().toLowerCase();
  const show = (label: string) => !q || label.toLowerCase().includes(q);
  const items: { id: string; label: string; run: () => void; group: string }[] = [
    { id: "open", label: "Open task", group: "Task", run: onOpen },
    {
      id: "done",
      label: task.status === "done" ? "Reopen" : "Mark done",
      group: "Task",
      run: onDone,
    },
    ...statusList(customStatuses, statusOrder)
      .filter((s) => s.value !== task.status && s.value !== "done")
      .map((s) => ({
        id: `status-${s.value}`,
        label: `Set status: ${s.title}`,
        group: "Status",
        run: () => onStatus(s.value),
      })),
    ...PRIORITIES.filter((p) => p.value !== task.priority).map((p) => ({
      id: `prio-${p.value}`,
      label: `Set priority: ${p.label}`,
      group: "Priority",
      run: () => onPriority(p.value),
    })),
    { id: "tomorrow", label: "Move to tomorrow", group: "Schedule", run: onTomorrow },
    // One timer at a time: start options only when nothing is running; on the running task, offer Stop.
    ...(timerTaskId === task.id
      ? [{ id: "stop-timer", label: "Stop timer", group: "Timer", run: onStopTimer }]
      : timerTaskId
        ? []
        : [
            {
              id: "stopwatch",
              label: "Start stopwatch",
              group: "Timer",
              run: () => onTimer("stopwatch"),
            },
            {
              id: "pomodoro",
              label: "Start Pomodoro (25 / 5)",
              group: "Timer",
              run: () => onTimer("pomodoro"),
            },
          ]),
    { id: "delete", label: "Delete task", group: "Danger", run: onDelete },
  ].filter((i) => show(i.label));
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <>
      <Command.Item value="back" onSelect={onBack} className={ITEM_CLASS}>
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        <span className="text-body-sm">Back to search</span>
      </Command.Item>
      {groups.map((g) => (
        <Command.Group key={g} heading={g} className={GROUP_CLASS}>
          {items
            .filter((i) => i.group === g)
            .map((i) => (
              <Command.Item
                key={i.id}
                value={`action-${i.id}`}
                onSelect={i.run}
                className={ITEM_CLASS}
              >
                <span className="size-4 shrink-0" aria-hidden />
                <span className="text-body-sm">{i.label}</span>
              </Command.Item>
            ))}
        </Command.Group>
      ))}
    </>
  );
}
