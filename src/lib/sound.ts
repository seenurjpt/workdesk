export type Tone = "chime" | "bell" | "pop";

export const TONES: { value: Tone; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "pop", label: "Pop" },
];

export interface SoundPrefs {
  enabled: boolean;
  tone: Tone;
  /** 0.1 – 1 */
  volume: number;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true, tone: "chime", volume: 0.6 };

export interface NoteSpec {
  /** Hz */
  freq: number;
  /** seconds from the start of the sound */
  start: number;
  /** seconds */
  duration: number;
  /** 0 – 1, relative loudness before master volume */
  gain: number;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUND_PREFS.volume;
  return Math.min(1, Math.max(0.1, value));
}

/** The notes that make up each tone. Pure data, so it is easy to test and tune. */
export function toneSpec(tone: Tone): NoteSpec[] {
  switch (tone) {
    case "chime":
      // two rising notes (E5, A5)
      return [
        { freq: 659.25, start: 0, duration: 0.55, gain: 0.9 },
        { freq: 880, start: 0.16, duration: 0.8, gain: 0.8 },
      ];
    case "bell":
      // a struck bell: fundamental plus inharmonic partials, long decay
      return [
        { freq: 880, start: 0, duration: 1.4, gain: 0.8 },
        { freq: 880 * 2.76, start: 0, duration: 0.9, gain: 0.35 },
        { freq: 880 * 5.4, start: 0, duration: 0.5, gain: 0.18 },
      ];
    case "pop":
      // a short soft blip
      return [
        { freq: 520, start: 0, duration: 0.12, gain: 0.9 },
        { freq: 780, start: 0.07, duration: 0.14, gain: 0.7 },
      ];
  }
}

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * Browsers only allow sound after the person has interacted with the page. Call this from a
 * click or key handler so a later reminder can play without being blocked.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
}

/** Plays a tone. Resolves to false when the browser blocked it or audio is unavailable. */
export async function playTone(tone: Tone, volume: number): Promise<boolean> {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  if (ctx.state !== "running") return false;

  const master = ctx.createGain();
  master.gain.value = clampVolume(volume) * 0.35;
  master.connect(ctx.destination);
  const now = ctx.currentTime;

  for (const note of toneSpec(tone)) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    const t0 = now + note.start;
    // fast attack, exponential release: no clicks
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + note.duration + 0.05);
  }
  return true;
}
