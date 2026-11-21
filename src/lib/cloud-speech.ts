"use client";

/**
 * Browser side of voice input through Gemini (`/api/voice`). The key stays on the server; this
 * only knows whether the server has one (`setCloudSpeech`, set from the app layout).
 */

import type { VoiceCommand } from "@/lib/voice-commands";

let enabled = false;

/** Called by `AppProvider` with whether the server has GEMINI_API_KEY. */
export function setCloudSpeech(on: boolean) {
  enabled = on;
}

export function isCloudSpeechEnabled(): boolean {
  return enabled;
}

/** 16 kHz mono float samples → 16-bit PCM WAV (half the size of float, which Gemini accepts). */
export function encodeWav(samples: Float32Array, sampleRate = 16_000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

interface VoiceResponse {
  ok: boolean;
  error?: string;
  transcript?: string;
  command?: VoiceCommand;
}

let lastWarmUp = 0;

/**
 * Call when the voice panel opens: the server connects to Google and the database while the user
 * is still speaking. At most once a minute; never throws.
 */
export function warmUpCloudSpeech() {
  if (!enabled || Date.now() - lastWarmUp < 60_000) return;
  lastWarmUp = Date.now();
  fetch("/api/voice", { method: "GET", cache: "no-store" }).catch(() => {});
}

async function post(form: FormData): Promise<{ transcript: string; command?: VoiceCommand }> {
  const res = await fetch("/api/voice", {
    method: "POST",
    body: form,
    // The server gives up after two ~6 s attempts; this is only a backstop.
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as VoiceResponse | null;
  if (!res.ok || !body?.ok) throw new Error(body?.error || `Voice AI failed (${res.status})`);
  return { transcript: body.transcript ?? "", command: body.command };
}

/** Recording → text. */
export async function cloudTranscribe(audio: Float32Array): Promise<string> {
  const form = new FormData();
  form.set("mode", "transcribe");
  form.set("audio", encodeWav(audio));
  return (await post(form)).transcript;
}

/** Recording or text → what the user said, and the command Gemini understood. */
export async function cloudCommand(
  input: { audio: Float32Array } | { text: string },
): Promise<{ transcript: string; command?: VoiceCommand }> {
  const form = new FormData();
  form.set("mode", "command");
  if ("audio" in input) form.set("audio", encodeWav(input.audio));
  else form.set("text", input.text);
  return post(form);
}
