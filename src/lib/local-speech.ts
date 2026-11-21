"use client";

/**
 * Talks to `public/speech-worker.js` (on-device Moonshine). One worker per tab,
 * created on first use; the model stays loaded for the rest of the session.
 */

export const LOCAL_MODEL_MB = 63;
const CONSENT_KEY = "workdesk:voice-model-ok";

export interface DownloadProgress {
  loaded: number;
  total: number;
}

type Listener = (p: DownloadProgress | null) => void;

let worker: Worker | null = null;
let ready = false;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<Listener>();
let loadReject: ((e: Error) => void) | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("/speech-worker.js", { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    if (msg.type === "progress") {
      progressListeners.forEach((l) => l({ loaded: msg.loaded, total: msg.total }));
    } else if (msg.type === "ready") {
      ready = true;
      progressListeners.forEach((l) => l(null));
    } else if (msg.type === "result") {
      pending.get(msg.id)?.resolve(msg.text);
      pending.delete(msg.id);
    } else if (msg.type === "error") {
      const error = new Error(msg.message);
      if (msg.id !== undefined) {
        pending.get(msg.id)?.reject(error);
        pending.delete(msg.id);
      } else {
        loadReject?.(error);
      }
    }
  };
  worker.onerror = () => {
    const error = new Error("The speech worker failed to start.");
    loadReject?.(error);
    pending.forEach((p) => p.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
    readyPromise = null;
  };
  return worker;
}

/** True when this browser can record audio (all the cloud engine needs). */
export function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined"
  );
}

/** True when this browser can record audio and run the on-device model. */
export function canUseLocalSpeech(): boolean {
  return canRecordAudio() && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

export function hasModelConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function giveModelConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* storage blocked: we'll just ask again next time */
  }
}

export function onDownloadProgress(listener: Listener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function isModelReady(): boolean {
  return ready;
}

/** Starts (or joins) the model download/load. Resolves when it can transcribe. */
export function loadModel(): Promise<void> {
  if (ready) return Promise.resolve();
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve, reject) => {
    const off = onDownloadProgress((p) => {
      if (p === null) {
        off();
        loadReject = null;
        resolve();
      }
    });
    loadReject = (e) => {
      off();
      loadReject = null;
      readyPromise = null;
      reject(e);
    };
    getWorker().postMessage({ type: "load" });
  });
  return readyPromise;
}

/** Transcribes 16 kHz mono audio. */
export async function transcribe(audio: Float32Array): Promise<string> {
  await loadModel();
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}

/* ---------- recording with silence detection ---------- */

const TARGET_RATE = 16_000;

export interface Recording {
  /** Stops recording; resolves with 16 kHz audio (or null if no speech was heard). */
  stop: () => Promise<Float32Array | null>;
  /** Discards everything. */
  cancel: () => void;
}

/**
 * Records from the microphone. Calls `onAutoStop` after ~1.5 s of silence
 * following speech, after 7 s with no speech, or after `maxMs`.
 */
export async function startRecording({
  onAutoStop,
  silenceMs = 1_500,
  noSpeechMs = 7_000,
  maxMs = 30_000,
}: {
  onAutoStop: () => void;
  silenceMs?: number;
  noSpeechMs?: number;
  maxMs?: number;
}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext();
  // Can start suspended under autoplay rules, and then no audio would ever arrive.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works everywhere and needs no extra module file.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  /** Per chunk: was it louder than the background? Used to trim silence before transcribing. */
  const voiced: boolean[] = [];
  const startedAt = performance.now();
  let noiseFloor = 0;
  let noiseSamples = 0;
  let heardSpeech = false;
  let lastVoiceAt = startedAt;
  let autoStopped = false;

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = performance.now();
    // First ~300 ms: learn the room's background level.
    if (now - startedAt < 300) {
      noiseFloor = (noiseFloor * noiseSamples + rms) / ++noiseSamples;
      // Calibration chunks may already hold speech; mark loud ones so trimming keeps them.
      voiced.push(rms > 0.02);
      return;
    }
    // Capped: someone who starts talking straight away would otherwise teach it that their voice
    // is the background, and nothing after would count as speech.
    const threshold = Math.max(0.012, Math.min(noiseFloor, 0.01) * 2.5);
    voiced.push(rms > threshold);
    if (rms > threshold) {
      heardSpeech = true;
      lastVoiceAt = now;
    }
    const elapsed = now - startedAt;
    const shouldStop =
      elapsed > maxMs ||
      (heardSpeech && now - lastVoiceAt > silenceMs) ||
      (!heardSpeech && elapsed > noSpeechMs);
    if (shouldStop && !autoStopped) {
      autoStopped = true;
      onAutoStop();
    }
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  const teardown = () => {
    processor.onaudioprocess = null;
    try {
      source.disconnect();
      processor.disconnect();
    } catch {
      /* already disconnected */
    }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    cancel: teardown,
    stop: async () => {
      const rate = ctx.sampleRate;
      teardown();
      if (!heardSpeech || chunks.length === 0) return null;
      // Keep only the speech, plus ~0.35 s either side so soft first and last sounds survive.
      // Less audio is a smaller upload and a faster transcription.
      const pad = Math.ceil((0.35 * rate) / (chunks[0]?.length || 4096));
      const first = Math.max(0, voiced.indexOf(true) - pad);
      const last = Math.min(chunks.length - 1, voiced.lastIndexOf(true) + pad);
      const kept = first <= last ? chunks.slice(first, last + 1) : chunks;
      const length = kept.reduce((n, c) => n + c.length, 0);
      const joined = new Float32Array(length);
      let offset = 0;
      for (const c of kept) {
        joined.set(c, offset);
        offset += c.length;
      }
      if (rate === TARGET_RATE) return joined;
      // Resample to 16 kHz with the browser's own (good quality) resampler.
      const frames = Math.ceil((length * TARGET_RATE) / rate);
      const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
      const buffer = offline.createBuffer(1, length, rate);
      buffer.copyToChannel(joined, 0);
      const node = offline.createBufferSource();
      node.buffer = buffer;
      node.connect(offline.destination);
      node.start();
      const rendered = await offline.startRendering();
      return new Float32Array(rendered.getChannelData(0));
    },
  };
}
