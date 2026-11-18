"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const MAX_STRETCH_PX = 56;

/** Eases a drag distance into 0..1 so the stretch gets harder the further you pull. */
function resist(distance: number): number {
  return 2 / (1 + Math.exp(-distance / MAX_STRETCH_PX)) - 1;
}

export interface ElasticSliderProps {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Text shown after the slider, e.g. "70%". */
  display?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * A slider with no thumb: you grab the bar itself. It grows under the pointer, and when you drag
 * past either end the bar stretches and springs back. Keyboard (arrows, Home, End, Page keys) and
 * screen-reader roles are built in. Colours come from the theme tokens.
 */
export function ElasticSlider({
  id,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  leftIcon,
  rightIcon,
  display,
  className,
  ...aria
}: ElasticSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  // Signed stretch, -1..1: negative is pulling past the left end, positive past the right.
  const [stretch, setStretch] = React.useState(0);
  const [trackWidth, setTrackWidth] = React.useState(200);

  const pct = ((value - min) / (max - min)) * 100;

  const snap = (n: number) => {
    const stepped = Math.round((n - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  };

  const fromPointer = (e: React.PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTrackWidth(rect.width);
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onValueChange(snap(min + ratio * (max - min)));
    if (e.clientX < rect.left) setStretch(-resist(rect.left - e.clientX));
    else if (e.clientX > rect.right) setStretch(resist(e.clientX - rect.right));
    else setStretch(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = (max - min) / 10;
    const next: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    onValueChange(snap(next[e.key]));
  };

  const active = hovering || dragging;
  const amount = Math.abs(stretch);
  const scaleX = (active ? 1.03 : 1) * (1 + (amount * MAX_STRETCH_PX) / trackWidth);
  const scaleY = (active ? 1.12 : 1) * (1 - amount * 0.25);

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {leftIcon && (
        <span
          aria-hidden
          className="text-muted-strong relative z-10 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
          style={{ transform: `scale(${stretch < 0 ? 1 + amount * 0.6 : 1})` }}
        >
          {leftIcon}
        </span>
      )}

      <div
        ref={trackRef}
        id={id}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        aria-orientation="horizontal"
        {...aria}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging && fromPointer(e)}
        onPointerUp={() => {
          setDragging(false);
          setStretch(0);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setStretch(0);
        }}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        className="focus-visible:outline-ring flex h-8 min-w-0 flex-1 cursor-pointer items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-full",
            !dragging &&
              "transition-[transform,height] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
            dragging && "transition-[height] duration-150",
            active ? "h-3" : "h-2",
          )}
          style={{
            background: "color-mix(in srgb, var(--text) 16%, transparent)",
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: stretch < 0 ? "right center" : "left center",
          }}
        >
          <div
            className="bg-accent absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {rightIcon && (
        <span
          aria-hidden
          className="text-muted-strong relative z-10 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
          style={{ transform: `scale(${stretch > 0 ? 1 + amount * 0.6 : 1})` }}
        >
          {rightIcon}
        </span>
      )}
      {display && (
        <output className="text-caption text-muted-strong w-10 shrink-0 text-right font-semibold tabular-nums">
          {display}
        </output>
      )}
    </div>
  );
}
