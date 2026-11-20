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
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Volume2, VolumeOff, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/shared/user-context";
import { useGlobalSearch } from "@/components/shared/global-search";
import { useThemeChoice } from "@/components/shared/theme-toggle";
import { useFocus } from "@/components/focus/focus-provider";
import { useOffline } from "@/components/shared/offline-provider";
import { hasSpeechRecognition, speechEngine, useSpeechInput } from "@/hooks/use-speech-input";
import { hasModelConsent, loadModel } from "@/lib/local-speech";
import { usePersistentBool } from "@/hooks/use-persistent-bool";
import { useTaskMutations, VIEW_KEY } from "@/hooks/use-task-mutations";
import { formatDue } from "@/lib/format";
import { isNetworkError } from "@/lib/offline-queue";
import { parseQuickAdd } from "@/lib/quick-add-parser";
import { isTypingTarget } from "@/lib/typing-target";
import { cn } from "@/lib/utils";
import { parseVoiceCommand, VOICE_EXAMPLES, type VoiceCommand } from "@/lib/voice-commands";
import { pickBestTranscript, spokenToQuickAdd } from "@/lib/voice-input";
import { SpeechNotice } from "@/components/voice/speech-notice";
import { VoiceOrb, type OrbState } from "@/components/voice/voice-visuals";
import { useMicLevel } from "@/hooks/use-mic-level";
import { createMeetingNoteAction, createNoteAction, quickAddAction } from "@/server/actions";
import { globalSearchAction } from "@/server/queries";

/* ---------- open / close ---------- */

interface VoiceAssistantContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}
const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null);

export function useVoiceAssistant(): VoiceAssistantContextValue {
  const ctx = useContext(VoiceAssistantContext);
  if (!ctx) throw new Error("useVoiceAssistant must be used inside VoiceAssistantProvider");
  return ctx;
}

/** Holds the open state and the `M` shortcut. The panel itself is `VoiceAssistantHost`. */
export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return;
      if (!hasSpeechRecognition()) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // On-device speech (Brave, Firefox): once the user has agreed to the download, load the
  // already-cached model in the background a few seconds after the app opens, so the first
  // command doesn't wait for it.
  useEffect(() => {
    if (speechEngine() !== "local" || !hasModelConsent()) return;
    const timer = setTimeout(() => {
      loadModel().catch(() => {
        /* it will retry (and report errors) when the mic is used */
      });
    }, 4_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <VoiceAssistantContext.Provider value={{ isOpen, open, close }}>
      {children}
    </VoiceAssistantContext.Provider>
  );
}

/* ---------- speaking back ---------- */

function speak(text: string, onSpeaking?: (speaking: boolean) => void) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || "en-US";
    u.rate = 1.05;
    u.onstart = () => onSpeaking?.(true);
    u.onend = u.onerror = () => onSpeaking?.(false);
    synth.speak(u);
  } catch {
    /* no speech synthesis: the reply is still shown */
  }
}

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/* ---------- the panel ---------- */

type Phase = "listening" | "working" | "done" | "confused" | "help";

interface Reply {
  text: string;
  /** Shorter line read aloud; defaults to `text`. */
  say?: string;
}

/** How long the zoom-out takes; the panel stays mounted this long after closing. */
const ZOOM_OUT_MS = 200;

export function VoiceAssistantHost() {
  const { isOpen, close } = useVoiceAssistant();
  // The panel stays mounted briefly after closing so it can zoom out, and each opening gets a
  // fresh panel (new key) so a quick re-open never inherits the old one's state.
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [mounted, setMounted] = useState(isOpen);
  const [openId, setOpenId] = useState(0);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMounted(true);
      setOpenId((n) => n + 1);
    }
  }
  useEffect(() => {
    if (isOpen || !mounted) return;
    const timer = setTimeout(() => setMounted(false), ZOOM_OUT_MS);
    return () => clearTimeout(timer);
  }, [isOpen, mounted]);

  if (!mounted) return null;
  return <VoicePanel key={openId} closing={!isOpen} onClose={close} />;
}

function VoicePanel({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, projects, tags } = useApp();
  const globalSearch = useGlobalSearch();
  const { choose: chooseTheme } = useThemeChoice();
  const { timer, stop: stopTimer } = useFocus();
  const { toggleDone } = useTaskMutations();
  const offline = useOffline();
  const [muted, setMuted] = usePersistentBool("workdesk:voice-replies-muted");

  const [phase, setPhase] = useState<Phase>("listening");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when the end of this listening round should be ignored (closed, error, example tapped). */
  const skipEnd = useRef(false);
  const closed = useRef(false);

  const names = { projects: projects.map((p) => p.name), tags: tags.map((t) => t.tag) };
  const vocab = { projects: projects.map((p) => ({ id: p.id, name: p.name })), tags: names.tags };

  const finish = useCallback(
    (next: Phase, r: Reply, autoClose: boolean) => {
      if (closed.current) return;
      setPhase(next);
      setReply(r);
      if (!muted) speak(r.say ?? r.text, setSpeaking);
      if (autoClose) closeTimer.current = setTimeout(onClose, 2400);
    },
    [muted, onClose],
  );

  async function addTask(spoken: string) {
    const text = spokenToQuickAdd(spoken, names);
    const parsed = parseQuickAdd(text, { timezone: user.timezone });
    if (!parsed.title) {
      return finish("confused", { text: "What should the task be called?" }, false);
    }
    const due = parsed.dueAt
      ? formatDue(parsed.dueAt.toISOString(), parsed.allDay, user.timezone).label
      : null;
    const summary = due ? `“${parsed.title}”, ${due}` : `“${parsed.title}”`;
    const saveOffline = () => {
      offline.queue({ type: "quickAdd", text });
      finish(
        "done",
        { text: `Saved ${summary} offline. It will sync when you're back online.` },
        true,
      );
    };
    if (!offline.online) return saveOffline();
    let res;
    try {
      res = await quickAddAction({ text });
    } catch (error) {
      if (isNetworkError(error)) return saveOffline();
      throw error;
    }
    if (!res.ok) return finish("confused", { text: res.error }, false);
    void qc.invalidateQueries({ queryKey: [VIEW_KEY] });
    router.refresh();
    finish(
      "done",
      { text: `Added ${summary}`, say: `Added ${parsed.title}${due ? `, ${due}` : ""}` },
      true,
    );
  }

  async function complete(query: string) {
    const res = await globalSearchAction(query);
    if (!res.ok) return finish("confused", { text: res.error }, false);
    const match = res.data.tasks.map((h) => h.task).find((t) => t.status !== "done");
    if (!match) {
      return finish(
        "confused",
        { text: `I couldn't find an open task matching “${query}”.` },
        false,
      );
    }
    toggleDone.mutate({ task: match, done: true });
    finish("done", { text: `Marked “${match.title}” as done` }, true);
  }

  async function run(cmd: VoiceCommand) {
    switch (cmd.type) {
      case "navigate":
        router.push(cmd.path);
        return finish("done", { text: `Opening ${cmd.label}` }, true);
      case "addTask":
        return addTask(cmd.text);
      case "newNote": {
        const res = await createNoteAction(cmd.title ? { title: cmd.title.slice(0, 200) } : {});
        if (!res.ok) return finish("confused", { text: res.error }, false);
        router.push(`/notes/${res.data.id}`);
        return finish(
          "done",
          { text: cmd.title ? `Created the note “${cmd.title}”` : "Created a new note" },
          true,
        );
      }
      case "newMeeting": {
        const res = await createMeetingNoteAction();
        if (!res.ok) return finish("confused", { text: res.error }, false);
        router.push(`/notes/${res.data.id}`);
        return finish("done", { text: "Started a meeting note" }, true);
      }
      case "search":
        stopSpeaking();
        if (!muted) speak(`Searching for ${cmd.query}`);
        onClose();
        globalSearch.openWith(cmd.query);
        return;
      case "complete":
        return complete(cmd.query);
      case "theme":
        chooseTheme(cmd.value);
        return finish(
          "done",
          {
            text:
              cmd.value === "system"
                ? "Following your system theme"
                : `Switched to ${cmd.value} mode`,
          },
          true,
        );
      case "stopTimer":
        if (!timer) return finish("done", { text: "No timer is running" }, true);
        await stopTimer();
        return finish("done", { text: "Timer stopped" }, true);
      case "help":
        return finish(
          "help",
          {
            text: "Try one of these:",
            say: "You can open pages, add tasks, search, or mark tasks done.",
          },
          false,
        );
      case "cancel":
        stopSpeaking();
        return onClose();
      case "unknown":
        return finish(
          "confused",
          {
            text: "I didn’t catch a command for that. Try one of these:",
            say: "Sorry, I didn't get that. Try again.",
          },
          false,
        );
    }
  }

  async function handle(spoken: string) {
    if (!spoken.trim()) {
      return finish(
        "confused",
        { text: "I didn't hear anything. Try again:", say: "I didn't hear anything." },
        false,
      );
    }
    setPhase("working");
    try {
      await run(parseVoiceCommand(spoken, vocab));
    } catch {
      finish("confused", { text: "Something went wrong. Please try again." }, false);
    }
  }

  const speech = useSpeechInput({
    choose: (alternatives) => pickBestTranscript(alternatives, names),
    onText: (finalText, interim) => setHeard(`${finalText} ${interim}`.trim()),
    onEnd: (finalText) => {
      if (skipEnd.current || closed.current) return;
      void handle(finalText);
    },
    onError: (message) => {
      skipEnd.current = true;
      toast.error(message);
      setPhase("confused");
      setReply({ text: message });
    },
  });

  const listen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    stopSpeaking();
    setHeard("");
    setReply(null);
    setPhase("listening");
    skipEnd.current = false;
    speech.start();
  };

  const runExample = (example: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    skipEnd.current = true;
    speech.cancel();
    setHeard(example);
    void handle(example);
  };

  // Start listening as soon as the panel opens.
  const { start: startListening } = speech;
  useEffect(() => {
    startListening();
  }, [startListening]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [onClose]);

  // Clicking or tapping anywhere outside the panel closes it. The top-bar button toggles the
  // panel itself, so it is left alone (otherwise it would close here and reopen on click).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || glowRef.current?.contains(target)) return;
      if (target.closest("[data-voice-trigger], [data-sonner-toast]")) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);

  // While zooming out: ignore whatever the microphone still delivers and don't act on it.
  const { cancel: cancelSpeech } = speech;
  useEffect(() => {
    if (!closing) return;
    closed.current = true;
    skipEnd.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    cancelSpeech(); // the microphone stops the moment the panel starts to close
  }, [closing, cancelSpeech]);

  const listening = speech.listening;
  const getLevel = useMicLevel(listening);
  const transcribing = speech.transcribing;

  // Feeds the border glow: brighter while you talk (follows your voice), pulsing while it speaks.
  const glowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = glowRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let level = 0;
    const tick = (now: number) => {
      let target = 0;
      if (listening) {
        const l = getLevel();
        target = l >= 0 ? l : 0.35 + Math.sin(now / 220) * 0.2;
      } else if (speaking) {
        target = 0.3 + Math.abs(Math.sin(now / 140)) * 0.4;
      } else if (transcribing || phase === "working") {
        target = 0.45;
      }
      level += (target - level) * 0.18;
      el.style.setProperty("--voice-level", level.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening, speaking, transcribing, phase, getLevel]);
  const waitingForConsent = speech.needsConsent;
  const thinking = transcribing || phase === "working";
  const glowState = orbState(listening, thinking, speaking);
  const showResult = Boolean(reply) && !listening && !thinking && !waitingForConsent;
  const showExamples =
    !waitingForConsent && !listening && !thinking && (phase === "help" || phase === "confused");

  // The orb is the one button: tap it to finish speaking, or to speak again.
  const orbEnabled = listening || !(thinking || waitingForConsent || phase === "done");
  const caption = waitingForConsent
    ? "One-time setup"
    : transcribing
      ? "Transcribing…"
      : listening
        ? "Listening · tap the orb when you’re done"
        : phase === "working"
          ? "Working on it…"
          : phase === "done"
            ? "Done"
            : phase === "confused" || phase === "help"
              ? "Tap the orb to speak again"
              : "";
  const line = showResult && reply ? reply.text : heard ? `“${heard}”` : "";

  const iconButton =
    "text-muted-strong hover:bg-surface-soft hover:text-foreground focus-visible:outline-ring grid size-7 place-items-center rounded-full transition-colors focus-visible:outline-2";

  return (
    // Placement: bottom-right on desktop (md and up), centred on the screen on phones.
    // (Before: bottom-centre everywhere, `fixed inset-x-4 bottom-6 mx-auto max-w-md sm:inset-x-0`.)
    // Earlier layouts (side-by-side orb + chips + full-width button; then a hero orb with a status
    // chip, rotating hints, example cards and footer links) were replaced by this minimal one.
    <div
      role="dialog"
      aria-label="Voice assistant"
      data-state={glowState}
      data-closing={closing ? "" : undefined}
      ref={glowRef}
      className="voice-glow voice-zoom fixed inset-x-4 top-1/2 z-50 mx-auto max-w-[20rem] -translate-y-1/2 md:top-auto md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-[20rem] md:translate-y-0 print:hidden"
    >
      <div className="voice-glow-inner bg-surface border-border shadow-float max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border px-5 pt-5 pb-4 text-center">
        <div className="absolute top-2 right-2 flex">
          <button
            type="button"
            onClick={() => {
              if (!muted) stopSpeaking();
              setMuted(!muted);
            }}
            aria-pressed={!muted}
            aria-label={muted ? "Turn on spoken replies" : "Turn off spoken replies"}
            title={muted ? "Spoken replies are off" : "Spoken replies are on"}
            className={iconButton}
          >
            {muted ? (
              <VolumeOff className="size-3.5" aria-hidden />
            ) : (
              <Volume2 className="size-3.5" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice assistant (Esc)"
            className={iconButton}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={() => (listening ? speech.stop() : listen())}
          disabled={!orbEnabled}
          aria-label={listening ? "Finish speaking" : "Speak"}
          className="focus-visible:outline-ring mx-auto grid size-16 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-default"
        >
          <VoiceOrb size={64} getLevel={getLevel} state={glowState} />
        </button>

        <p
          key={line}
          className={cn(
            "voice-fade mt-4 line-clamp-3 min-h-6 text-base leading-snug font-medium",
            !line && "text-muted-strong",
          )}
          aria-live="polite"
        >
          {line || (listening ? (speech.engine === "local" ? "Speak now…" : "Say a command…") : "")}
        </p>
        <p className="text-caption text-muted-strong mt-1 min-h-4">{caption}</p>

        <SpeechNotice
          speech={{
            ...speech,
            // "Not now" on the download prompt closes the assistant.
            declineDownload: () => {
              speech.declineDownload();
              onClose();
            },
          }}
          className="mt-3 text-left"
        />

        {showExamples && (
          <ul
            className="mt-3 flex flex-wrap justify-center gap-1.5"
            aria-label="Things you can say"
          >
            {VOICE_EXAMPLES.slice(0, 5).map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => runExample(ex)}
                  className="text-caption bg-surface-soft hover:bg-border focus-visible:outline-ring rounded-full px-2.5 py-1 transition-colors focus-visible:outline-2"
                >
                  “{ex}”
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function orbState(listening: boolean, thinking: boolean, speaking: boolean): OrbState {
  if (listening) return "listening";
  if (thinking) return "thinking";
  if (speaking) return "speaking";
  return "idle";
}
