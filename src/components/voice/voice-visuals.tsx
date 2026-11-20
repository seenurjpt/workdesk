"use client";

import { useEffect, useRef } from "react";
import { cssVar, prefersReducedMotion } from "@/hooks/use-mic-level";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

/* ---------- colour helpers ---------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 240, 160];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;
const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

interface Palette {
  accent: [number, number, number];
  deep: [number, number, number];
  danger: [number, number, number];
  dark: boolean;
}

function readPalette(): Palette {
  return {
    accent: hexToRgb(cssVar("--accent", "#00f0a0")),
    deep: hexToRgb(cssVar("--accent-text", "#007a4d")),
    danger: hexToRgb(cssVar("--danger", "#e5484d")),
    dark: document.documentElement.classList.contains("dark"),
  };
}

/** Re-reads theme colours when the theme class on <html> changes. */
function usePalette() {
  const ref = useRef<Palette | null>(null);
  useEffect(() => {
    ref.current = readPalette();
    const obs = new MutationObserver(() => {
      ref.current = readPalette();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return ref;
}

/** Sizes a canvas for the device pixel ratio; returns the 2D context in CSS pixels. */
function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* ---------- the orb ---------- */

/**
 * WorkDesk's assistant orb: a soft mint blob that breathes when idle, swells
 * with your voice while listening, swirls while thinking and pulses while
 * speaking. Colours come from the theme tokens (--accent, --accent-text).
 */
export function VoiceOrb({
  state,
  getLevel,
  size = 64,
  className,
}: {
  state: OrbState;
  /** 0–1 mic loudness, or -1 when unknown. */
  getLevel?: () => number;
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();
  const stateRef = useRef(state);
  const levelRef = useRef(getLevel);
  const motion = useRef({ energy: 0.1, spin: 0 });
  useEffect(() => {
    stateRef.current = state;
    levelRef.current = getLevel;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = prefersReducedMotion();
    // Leave room around the blob for its glow.
    const box = size * 1.5;
    let raf = 0;
    let { energy, spin } = motion.current;
    let last = performance.now();

    const draw = (now: number) => {
      const ctx = setupCanvas(canvas, box, box);
      const p = palette.current ?? readPalette();
      if (!ctx) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = reduced ? 0 : now / 1000;
      const s = stateRef.current;

      // How "alive" the orb is right now.
      let target = 0.12 + Math.sin(t * 1.6) * 0.04; // idle breathing
      if (s === "listening") {
        const lvl = levelRef.current?.() ?? -1;
        target = lvl >= 0 ? 0.18 + lvl * 0.82 : 0.3 + Math.sin(t * 5) * 0.12;
      } else if (s === "thinking") target = 0.32;
      else if (s === "speaking") target = 0.35 + Math.abs(Math.sin(t * 7.5)) * 0.35;
      else if (s === "error") target = 0.15;
      energy += (target - energy) * (reduced ? 1 : Math.min(1, dt * 10));
      spin += dt * (s === "thinking" ? 3.2 : 0.6 + energy);

      const base = s === "error" ? p.danger : p.accent;
      const deep = s === "error" ? mix(p.danger, [0, 0, 0], 0.35) : p.deep;
      const light = mix(base, [255, 255, 255], p.dark ? 0.45 : 0.6);
      const cx = box / 2;
      const cy = box / 2;
      const r = (size / 2) * (0.9 + energy * 0.12);

      ctx.clearRect(0, 0, box, box);

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, box / 2);
      glow.addColorStop(0, rgba(base, (p.dark ? 0.35 : 0.28) * (0.4 + energy)));
      glow.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, box, box);

      // Wobbly blob outline: a few slow sine waves around the circle.
      const blob = (radius: number, wobble: number, phase: number) => {
        ctx.beginPath();
        const steps = 72;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const w =
            Math.sin(a * 3 + t * 1.7 + phase) * 0.5 +
            Math.sin(a * 5 - t * 2.3 + phase * 2) * 0.3 +
            Math.sin(a * 2 + t * 1.1 - phase) * 0.2;
          const rr = radius * (1 + w * wobble);
          const x = cx + Math.cos(a + spin * 0.15) * rr;
          const y = cy + Math.sin(a + spin * 0.15) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      };

      // Body
      blob(r, 0.018 + energy * 0.06, 0);
      const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
      body.addColorStop(0, rgba(light, 1));
      body.addColorStop(0.45, rgba(base, 1));
      body.addColorStop(1, rgba(deep, 1));
      ctx.fillStyle = body;
      ctx.fill();

      // Inner swirl for depth
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      blob(r * 0.62, 0.08 + energy * 0.12, 2.1);
      ctx.translate(Math.cos(spin) * r * 0.18, Math.sin(spin) * r * 0.18);
      ctx.fillStyle = rgba(light, 0.35 + energy * 0.2);
      ctx.fill();
      ctx.restore();

      // Highlight
      const hl = ctx.createRadialGradient(
        cx - r * 0.38,
        cy - r * 0.45,
        0,
        cx - r * 0.38,
        cy - r * 0.45,
        r * 0.5,
      );
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      blob(r, 0.018 + energy * 0.06, 0);
      ctx.fill();

      // Thinking: a thin arc travelling round the orb
      if (s === "thinking") {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.22, spin, spin + Math.PI * 0.7);
        ctx.strokeStyle = rgba(base, 0.9);
        ctx.lineWidth = Math.max(1.5, size / 28);
        ctx.lineCap = "round";
        ctx.stroke();
      }

      motion.current = { energy, spin };
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // Re-render a still frame when the state changes under reduced motion.
  }, [size, palette, state]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none shrink-0", className)}
      style={{ width: size * 1.5, height: size * 1.5, margin: -size * 0.25 }}
    />
  );
}

/* ---------- live waveform ---------- */

/**
 * Scrolling bars of recent loudness, like a voice-memo recorder. Falls back to
 * a gentle synthetic wave when the level is unknown (-1).
 */
export function LiveWaveform({
  active,
  getLevel,
  height = 28,
  className,
}: {
  active: boolean;
  getLevel: () => number;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const reduced = prefersReducedMotion();
    const BAR = 3;
    const GAP = 2;
    const history: number[] = [];
    let raf = 0;
    let lastPush = 0;

    const draw = (now: number) => {
      const width = canvas.clientWidth || 200;
      const ctx = setupCanvas(canvas, width, height);
      if (!ctx) return;
      const p = palette.current ?? readPalette();
      const count = Math.max(8, Math.floor(width / (BAR + GAP)));

      // ~30 samples a second keeps the scroll speed calm.
      if (now - lastPush > 33) {
        lastPush = now;
        const lvl = getLevel();
        const v = lvl >= 0 ? lvl : 0.25 + Math.sin(now / 180) * 0.15 + Math.sin(now / 77) * 0.08; // synthetic
        history.push(Math.max(0.06, Math.min(1, v)));
        while (history.length > count) history.shift();
      }

      ctx.clearRect(0, 0, width, height);
      const color = p.dark ? p.accent : p.deep;
      const start = width - history.length * (BAR + GAP);
      history.forEach((v, i) => {
        const h = Math.max(2, v * (height - 2));
        const x = start + i * (BAR + GAP);
        // Older bars fade out on the left.
        const age = (i + 1) / history.length;
        ctx.fillStyle = rgba(color, 0.25 + age * 0.75);
        ctx.beginPath();
        ctx.roundRect(x, (height - h) / 2, BAR, h, BAR / 2);
        ctx.fill();
      });

      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevel, height, palette]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("block w-full", className)}
      style={{ height }}
    />
  );
}
