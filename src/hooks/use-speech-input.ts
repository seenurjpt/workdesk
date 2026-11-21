"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cloudTranscribe, isCloudSpeechEnabled } from "@/lib/cloud-speech";
import {
  canRecordAudio,
  canUseLocalSpeech,
  giveModelConsent,
  hasModelConsent,
  isModelReady,
  loadModel,
  onDownloadProgress,
  startRecording,
  transcribe,
  type DownloadProgress,
  type Recording,
} from "@/lib/local-speech";

/* Minimal Web Speech API types (not in every TS DOM lib). */
interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechResult extends ArrayLike<SpeechAlternative> {
  isFinal: boolean;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface SpeechErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  // Brave exposes the API but blocks the speech service behind it, so every
  // attempt fails with a "network" error. Treat it as unsupported.
  if ((navigator as Navigator & { brave?: unknown }).brave) return null;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
/**
 * "native": the browser's own speech service (Chrome, Edge, Safari) — instant, live text.
 * "cloud": recorded here, turned into text by Gemini on the server (Brave, Firefox, when the
 *          server has GEMINI_API_KEY) — no download, text after you stop.
 * "local": on-device Moonshine (Brave, Firefox, no Gemini) — one-time model download, text after
 *          you stop.
 */
export type SpeechEngine = "native" | "cloud" | "local";

export function speechEngine(): SpeechEngine | null {
  if (getCtor()) return "native";
  if (isCloudSpeechEnabled() && canRecordAudio()) return "cloud";
  if (canUseLocalSpeech()) return "local";
  return null;
}

export function hasSpeechRecognition(): boolean {
  return speechEngine() !== null;
}

const noop = () => () => {};

/** True when the browser can do speech-to-text (false during SSR). */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    noop,
    () => speechEngine() !== null,
    () => false,
  );
}

function useSpeechEngine(): SpeechEngine | null {
  return useSyncExternalStore(noop, speechEngine, () => null);
}

/**
 * The rules and replies are English, so recognition stays English: the browser's own English
 * variant (en-IN, en-GB …) when it has one, else US English. A Hindi or German browser would
 * otherwise hear everything in that language and no command would ever match.
 */
export function recognitionLang(): string {
  const lang = typeof navigator === "undefined" ? "" : navigator.language || "";
  return /^en\b/i.test(lang) ? lang : "en-US";
}

const MAX_LISTEN_MS = 30_000;
/** Stop after this much silence once something has been heard. */
const SILENCE_MS = 1_500;
/** Guesses to ask the engine for per phrase. */
const ALTERNATIVES = 5;

export type SpeechAlternatives = { transcript: string; confidence: number }[];

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser's site settings.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs an internet connection.",
  "service-unavailable":
    "This browser's speech service isn't available. Voice input works in Chrome, Edge and Safari.",
  "no-speech": "Didn't catch that. Try again.",
  download: "Couldn't download the speech model. Check your connection and try again.",
  transcribe: "Couldn't turn that into text. Please try again.",
  cloud: "Couldn't reach the speech service. Check your connection and try again.",
};

export interface SpeechInput {
  supported: boolean;
  engine: SpeechEngine | null;
  listening: boolean;
  /** Cloud and on-device engines: turning the recording into text. */
  transcribing: boolean;
  /** On-device engine only: model download progress while it downloads. */
  download: DownloadProgress | null;
  /** On-device engine only: waiting for the user to allow the one-time download. */
  needsConsent: boolean;
  acceptDownload: () => void;
  declineDownload: () => void;
  start: () => void;
  /** Stops and delivers what was heard (`onEnd`). */
  stop: () => void;
  /** Stops and throws everything away: no `onEnd`, no errors. */
  cancel: () => void;
}

/**
 * Speech-to-text via the browser's Web Speech API.
 * `onText(final, interim)` fires as words arrive. Listening carries on through
 * short pauses and stops after ~2 s of silence (or 30 s); `onError` gets a
 * readable message. `choose` picks between the engine's guesses for each phrase.
 */
export function useSpeechInput({
  onText,
  onEnd,
  onError,
  choose,
  cloud,
}: {
  onText: (finalText: string, interimText: string) => void;
  onEnd?: (finalText: string) => void;
  onError?: (message: string) => void;
  choose?: (alternatives: SpeechAlternatives) => string;
  /** Cloud engine: turns the recording into text. Defaults to plain Gemini transcription. */
  cloud?: (audio: Float32Array) => Promise<string>;
}): SpeechInput {
  const engine = useSpeechEngine();
  const supported = engine !== null;
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const localRef = useRef<Recording | null>(null);
  const roundRef = useRef(0);
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onText, onEnd, onError, choose, cloud });
  useEffect(() => {
    handlers.current = { onText, onEnd, onError, choose, cloud };
  });

  useEffect(() => onDownloadProgress((p) => setDownload(p)), []);

  /* ---------- recorded engines: cloud (Gemini) and on-device ---------- */

  const stopLocal = useCallback(async () => {
    const rec = localRef.current;
    if (!rec) return;
    localRef.current = null;
    const round = roundRef.current;
    setListening(false);
    const fail = (code: string) => {
      setTranscribing(false);
      handlers.current.onError?.(ERROR_TEXT[code]);
      handlers.current.onEnd?.("");
    };
    let audio: Float32Array | null;
    try {
      audio = await rec.stop();
    } catch {
      return fail("transcribe");
    }
    if (round !== roundRef.current) return;
    if (!audio) return fail("no-speech");
    setTranscribing(true);
    const viaCloud = speechEngine() === "cloud";
    let text: string;
    try {
      text = viaCloud
        ? (await (handlers.current.cloud ?? cloudTranscribe)(audio)).trim()
        : await transcribe(audio);
    } catch {
      if (round !== roundRef.current) return;
      if (viaCloud) fail(navigator.onLine ? "cloud" : "network");
      else fail(isModelReady() ? "transcribe" : "download");
      return;
    }
    if (round !== roundRef.current) return;
    setTranscribing(false);
    if (!text) return fail("no-speech");
    handlers.current.onText(text, "");
    handlers.current.onEnd?.(text);
  }, []);

  const startLocal = useCallback(async () => {
    const viaCloud = speechEngine() === "cloud";
    if (!viaCloud && !hasModelConsent()) {
      setNeedsConsent(true);
      return;
    }
    const round = ++roundRef.current;
    localRef.current?.cancel();
    localRef.current = null;
    setTranscribing(false);
    setListening(true);
    // On-device: download/load the model while the user talks.
    if (!viaCloud) loadModel().catch(() => {
      if (round !== roundRef.current) return;
      localRef.current?.cancel();
      localRef.current = null;
      setListening(false);
      setTranscribing(false);
      handlers.current.onError?.(ERROR_TEXT.download);
    });
    try {
      const rec = await startRecording({
        onAutoStop: () => void stopLocal(),
        // Gemini copes with a natural pause, so stop sooner: every 100 ms here is 100 ms of waiting.
        silenceMs: viaCloud ? 1_000 : 1_500,
      });
      if (round !== roundRef.current) return rec.cancel();
      localRef.current = rec;
    } catch (error) {
      if (round !== roundRef.current) return;
      setListening(false);
      const name = (error as DOMException)?.name;
      handlers.current.onError?.(
        ERROR_TEXT[name === "NotFoundError" ? "audio-capture" : "not-allowed"],
      );
    }
  }, [stopLocal]);

  const acceptDownload = useCallback(() => {
    giveModelConsent();
    setNeedsConsent(false);
    void startLocal();
  }, [startLocal]);
  const declineDownload = useCallback(() => setNeedsConsent(false), []);

  /* ---------- browser speech service ---------- */

  const cancel = useCallback(() => {
    roundRef.current++;
    localRef.current?.cancel();
    localRef.current = null;
    const rec = recRef.current;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      rec.abort();
      recRef.current = null;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (silenceRef.current) clearTimeout(silenceRef.current);
    setListening(false);
    setTranscribing(false);
  }, []);

  const stop = useCallback(() => {
    if (localRef.current) return void stopLocal();
    recRef.current?.stop();
  }, [stopLocal]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      if (speechEngine()) void startLocal();
      return;
    }
    if (recRef.current) {
      // A round is already running (or still shutting down): drop it quietly.
      const old = recRef.current;
      old.onresult = old.onerror = old.onend = null;
      old.abort();
      recRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (silenceRef.current) clearTimeout(silenceRef.current);
    }
    const rec = new Ctor();
    rec.lang = recognitionLang();
    // Android Chrome repeats words in continuous mode, so there we let the
    // engine stop on its own after a pause; elsewhere we keep listening
    // through short pauses and stop on our own silence timer.
    const android = /Android/i.test(navigator.userAgent);
    rec.continuous = !android;
    rec.interimResults = true;
    rec.maxAlternatives = ALTERNATIVES;

    const finals: string[] = [];
    let finalText = "";
    let lastInterim = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          if (finals[i] === undefined) {
            const alts: SpeechAlternatives = Array.from({ length: r.length }, (_, k) => ({
              transcript: r[k].transcript,
              confidence: r[k].confidence,
            }));
            finals[i] = (handlers.current.choose?.(alts) ?? alts[0]?.transcript ?? "").trim();
          }
        } else {
          interim += `${r[0]?.transcript ?? ""} `;
        }
      }
      finalText = finals.filter(Boolean).join(" ");
      lastInterim = interim.trim();
      handlers.current.onText(finalText, lastInterim);
      if (!android) {
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(() => rec.stop(), SILENCE_MS);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      // A "network" error while the device is online means the browser's
      // speech service itself is blocked or missing, not the connection.
      const code = e.error === "network" && navigator.onLine ? "service-unavailable" : e.error;
      handlers.current.onError?.(ERROR_TEXT[code] ?? "Voice input stopped unexpectedly.");
    };
    rec.onend = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (silenceRef.current) clearTimeout(silenceRef.current);
      timerRef.current = null;
      if (recRef.current !== rec) return; // replaced by a newer round
      recRef.current = null;
      setListening(false);
      // Chrome sometimes ends without turning the last words into a final result; what the user
      // saw on screen is still what they said.
      const said = [finalText, lastInterim].filter(Boolean).join(" ").trim();
      handlers.current.onEnd?.(said);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      handlers.current.onError?.("Voice input couldn't start. Try again.");
      return;
    }
    setListening(true);
    timerRef.current = setTimeout(() => rec.stop(), MAX_LISTEN_MS);
  }, [startLocal]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (silenceRef.current) clearTimeout(silenceRef.current);
      const rec = recRef.current;
      if (rec) {
        rec.onresult = rec.onerror = rec.onend = null;
        rec.abort();
        recRef.current = null;
      }
      roundRef.current++;
      localRef.current?.cancel();
      localRef.current = null;
    },
    [],
  );

  return {
    supported,
    engine,
    listening,
    transcribing,
    download,
    needsConsent,
    acceptDownload,
    declineDownload,
    start,
    stop,
    cancel,
  };
}
