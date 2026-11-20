"use client";

import { Download, Loader2, ShieldCheck } from "lucide-react";
import type { SpeechInput } from "@/hooks/use-speech-input";
import { LOCAL_MODEL_MB } from "@/lib/local-speech";
import { cn } from "@/lib/utils";

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

/**
 * Status for the on-device speech engine (Brave, Firefox): the one-time
 * download prompt, download progress and "turning speech into text".
 * Renders nothing for the browser's built-in speech service.
 */
export function SpeechNotice({ speech, className }: { speech: SpeechInput; className?: string }) {
  if (speech.engine !== "local") return null;

  if (speech.needsConsent) {
    return (
      <div
        className={cn("text-body-sm space-y-2", className)}
        role="alertdialog"
        aria-label="Download speech model"
      >
        <p className="flex items-start gap-2">
          <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            In this browser, voice input runs <strong>on your device</strong>. It needs a one-time{" "}
            {LOCAL_MODEL_MB} MB download, and your audio never leaves this computer.
          </span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={speech.acceptDownload}
            className="bg-btn-primary text-btn-primary-fg focus-visible:outline-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Download className="size-3.5" aria-hidden />
            Download and start
          </button>
          <button
            type="button"
            onClick={speech.declineDownload}
            className="text-muted-strong hover:text-foreground h-8 rounded-full px-3 text-sm transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  const busy = speech.listening || speech.transcribing;
  if (busy && speech.download) {
    const { loaded, total } = speech.download;
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    return (
      <div className={cn("text-caption space-y-1.5", className)} aria-live="polite">
        <p className="text-muted-strong">
          Downloading speech model… {pct}% ({mb(loaded)} of {mb(total) || LOCAL_MODEL_MB} MB, one
          time).
          {speech.listening ? " Keep talking, it will catch up." : ""}
        </p>
        <div
          className="bg-surface-soft h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Speech model download"
        >
          <div
            className="bg-btn-primary h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (speech.transcribing) {
    return (
      <p
        className={cn("text-caption text-muted-strong flex items-center gap-1.5", className)}
        aria-live="polite"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Turning speech into text…
      </p>
    );
  }

  if (speech.listening) {
    return (
      <p className={cn("text-caption text-muted-strong", className)} aria-live="polite">
        Listening on this device… the text appears when you stop talking.
      </p>
    );
  }

  return null;
}
