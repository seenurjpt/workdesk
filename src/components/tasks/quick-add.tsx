"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Calendar,
  Flag,
  FolderPlus,
  Hash,
  Hourglass,
  Loader2,
  Mic,
  Plus,
  Repeat,
  Square,
  Tag,
} from "lucide-react";
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
import { hasSpeechRecognition, useSpeechInput } from "@/hooks/use-speech-input";
import { SpeechNotice } from "@/components/voice/speech-notice";
import { LiveWaveform } from "@/components/voice/voice-visuals";
import { useMicLevel } from "@/hooks/use-mic-level";
import { normalizeName, pickBestTranscript, spokenToQuickAdd } from "@/lib/voice-input";

interface QuickAddContextValue {
  open: () => void;
  /** Opens quick add and starts listening straight away. */
  openVoice: () => void;
}
const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside QuickAddProvider");
  return ctx;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const open = useCallback(() => {
    setVoice(false);
    setOpen(true);
  }, []);
  const openVoice = useCallback(() => {
    setVoice(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if ((key !== "q" && key !== "v") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
      // V = quick add by voice (only where the browser supports it).
      if (key === "v" && !hasSpeechRecognition()) return;
      e.preventDefault();
      setVoice(key === "v");
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QuickAddContext.Provider value={{ open, openVoice }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          title="Quick add"
          description="Try: Send report tomorrow 5pm #clientA @report !high every monday"
          className="top-[20%] max-w-2xl translate-y-0"
        >
          <QuickAddInput autoFocus startListening={voice} onDone={() => setOpen(false)} />
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
  startListening = false,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
  placeholder?: string;
  floatingPreview?: boolean;
  /** Start voice input as soon as the field mounts. */
  startListening?: boolean;
}) {
  const { user, projects, tags } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice input: spoken words are appended to whatever was already typed,
  // shown live, and never saved until the user presses Enter.
  // The user's own names help pick the right guess and fix misheard ones.
  const vocab = { projects: projects.map((p) => p.name), tags: tags.map((t) => t.tag) };
  const baseRef = useRef("");
  const joinSpoken = (spoken: string) => {
    const base = baseRef.current.trimEnd();
    const words = spokenToQuickAdd(spoken, vocab);
    return (base && words ? `${base} ${words}` : base || words).slice(0, 500);
  };
  const speech = useSpeechInput({
    choose: (alternatives) => pickBestTranscript(alternatives, vocab),
    onText: (finalText, interim) => setText(joinSpoken(`${finalText} ${interim}`)),
    onEnd: (finalText) => {
      setText(joinSpoken(finalText));
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    },
    onError: (message) => toast.error(message),
  });
  const getLevel = useMicLevel(speech.listening);
  const toggleVoice = () => {
    if (speech.transcribing) return;
    if (speech.listening) return speech.stop();
    baseRef.current = text;
    speech.start();
  };
  const { supported: speechSupported, start: startSpeech } = speech;
  useEffect(() => {
    if (!startListening || !speechSupported) return;
    baseRef.current = "";
    startSpeech();
  }, [startListening, speechSupported, startSpeech]);

  const parsed = useMemo(
    () => parseQuickAdd(text, { timezone: user.timezone }),
    [text, user.timezone],
  );
  // Same matching as the server: ignore case, spaces and punctuation ("#clientA" = "Client A").
  const existingProject = parsed.projectName
    ? projects.find((p) => normalizeName(p.name) === normalizeName(parsed.projectName ?? ""))
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

  // Something voice-related to show under the field (listening, download, consent…).
  const voiceActive = speech.listening || speech.transcribing || speech.needsConsent;

  async function submit() {
    if (speech.listening) speech.stop();
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
        ref={inputRef}
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
          "border-border placeholder:text-muted-strong focus-visible:outline-ring w-full rounded-2xl border pl-10 transition-colors duration-150",
          speech.supported ? "pr-12" : "pr-4",
          "hover:border-muted-strong focus-visible:border-transparent focus-visible:outline-2 focus-visible:-outline-offset-2",
          floatingPreview
            ? "bg-surface-soft focus-visible:bg-surface h-10 py-0 text-sm"
            : "bg-surface py-3 text-base",
          speech.listening && "border-danger/60",
        )}
      />
      {speech.supported && (
        <button
          type="button"
          onClick={toggleVoice}
          disabled={speech.transcribing}
          aria-busy={speech.transcribing}
          aria-pressed={speech.listening}
          aria-label={
            speech.transcribing
              ? "Turning speech into text"
              : speech.listening
                ? "Stop voice input"
                : "Add task by voice"
          }
          title={
            speech.listening
              ? "Listening… click to stop"
              : speech.engine === "local"
                ? "Speak your task. It's turned into text on this device."
                : "Speak your task. Your browser's speech service turns it into text."
          }
          className={cn(
            "focus-visible:outline-ring absolute right-1.5 z-10 grid place-items-center rounded-xl transition-colors duration-150 focus-visible:outline-2",
            floatingPreview ? "top-1 size-8" : "top-1.5 size-9",
            speech.listening
              ? "bg-danger text-white"
              : "text-muted-strong hover:bg-surface-soft hover:text-foreground",
          )}
        >
          {speech.transcribing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : speech.listening ? (
            <span className="relative grid place-items-center">
              <span
                className="bg-danger absolute size-6 animate-ping rounded-full opacity-40 motion-reduce:hidden"
                aria-hidden
              />
              <Square className="relative size-3.5 fill-current" aria-hidden />
            </span>
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
        </button>
      )}
      <div
        id="quick-add-preview"
        aria-live="polite"
        className={cn(
          floatingPreview &&
            (text.trim() || voiceActive) &&
            "border-border bg-surface shadow-float absolute inset-x-0 top-full z-40 mt-2 animate-[pop-in_0.16s_cubic-bezier(0.16,1,0.3,1)] rounded-2xl border p-3 motion-reduce:animate-none",
          !floatingPreview && "mt-3",
        )}
      >
        {speech.listening && (
          <LiveWaveform active getLevel={getLevel} height={24} className="mb-2" />
        )}
        <SpeechNotice speech={speech} className={text.trim() ? "mb-3" : undefined} />
        {speech.engine === "local" && voiceActive && !text.trim() ? null : speech.listening &&
          !text.trim() ? (
          <p className="text-caption text-muted-strong">
            Listening… try “call Priya tomorrow at 4 pm high priority”
          </p>
        ) : text.trim() ? (
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
            <p className="text-caption text-muted-strong mt-2">
              {speech.listening
                ? "Listening… click the mic to stop"
                : "Enter to add · Esc to cancel"}
            </p>
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
