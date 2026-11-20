"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Live microphone loudness (0–1) for voice visuals. Opens its own mic stream
 * while `active`, so it works with both speech engines.
 *
 * Android Chrome's speech service fails when another stream holds the mic, so
 * there it doesn't open one and `getLevel()` returns -1 ("unknown": visuals
 * fall back to a gentle synthetic motion).
 */
export function useMicLevel(active: boolean): () => number {
  const levelRef = useRef(-1);

  useEffect(() => {
    if (!active) {
      levelRef.current = -1;
      return;
    }
    if (typeof navigator === "undefined" || /Android/i.test(navigator.userAgent)) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        return; // no permission yet / no mic: visuals use synthetic motion
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let smooth = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        // Speech RMS is roughly 0.01–0.2; map to 0–1 with a soft curve.
        const target = Math.min(1, Math.sqrt(Math.max(0, rms - 0.004) * 9));
        // Fast attack, slower release, so it feels lively but not jittery.
        smooth += (target - smooth) * (target > smooth ? 0.5 : 0.12);
        levelRef.current = smooth;
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      levelRef.current = -1;
    };
  }, [active]);

  return useCallback(() => levelRef.current, []);
}

/** Reads a CSS custom property from :root (e.g. "--accent"). */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
