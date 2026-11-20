"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bounce Cards (reactbits.dev), rebuilt for arbitrary content and for production use.
 *
 * - Below the `lg` breakpoint it is a plain responsive grid and no JavaScript runs.
 * - From `lg` up the cards fan out and spring apart on hover.
 * - The resting fan is pure CSS, so the server HTML, the first paint and the animated state all
 *   share the same geometry. Nothing jumps or pops in after hydration.
 * - The entrance animation only runs for cards that are still below the fold when the page loads.
 * - Only the mouse drives hover (touch never leaves a card stuck pushed), and reduced motion is
 *   respected. The animation loop sleeps once everything has settled.
 */

const GAP = 20; // px between cards at rest (matches the CSS below)
const ROTATE = [-3, 1.5, -1.5, 3];
const ARC = 14; // outer cards sit this much lower than the middle ones
const PUSH = 26; // how far neighbours move away from a hovered card
const STIFFNESS = 210;
const POP_STIFFNESS = 170;

interface Body {
  x: number;
  y: number;
  r: number;
  s: number;
  o: number;
  vx: number;
  vy: number;
  vr: number;
  vs: number;
  vo: number;
  showAt: number;
}

const offsetOf = (i: number, count: number) => i - (count - 1) / 2;
const slotY = (i: number, count: number) => {
  const reach = Math.max(1, (count - 1) / 2);
  return ARC * (offsetOf(i, count) / reach) ** 2;
};

function spring(value: number, velocity: number, target: number, k: number, c: number, dt: number) {
  const v = velocity + ((target - value) * k - velocity * c) * dt;
  return [value + v * dt, v] as const;
}

export function BounceCards({
  items,
  className,
  cardClassName,
}: {
  items: ReactNode[];
  className?: string;
  cardClassName?: string;
}) {
  const rootRef = useRef<HTMLUListElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const count = items.length;

  // Before the first paint: if the section is still below the fold, tuck the cards away so the
  // entrance can play when it scrolls into view. Cards already on screen are never touched.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!desktop || reduce || root.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    cardRefs.current.forEach((el) => {
      if (!el) return;
      el.style.setProperty("--o", "0");
      el.style.setProperty("--s", "0.92");
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bodies: Body[] = [];
    let step = 0; // card width + gap, measured
    let height = 0;
    let hovered = -1;
    let time = 0;
    let revealed = false;
    let raf = 0;
    let last = 0;
    let alive = true;
    let lastLayer = -2;

    const els = () => cardRefs.current.filter((el): el is HTMLLIElement => el !== null);

    const write = (i: number) => {
      const el = cardRefs.current[i];
      const b = bodies[i];
      if (!el || !b) return;
      el.style.setProperty("--x", `${b.x.toFixed(2)}px`);
      el.style.setProperty("--y", `${b.y.toFixed(2)}px`);
      el.style.setProperty("--r", `${b.r.toFixed(3)}deg`);
      el.style.setProperty("--s", Math.max(0, b.s).toFixed(4));
      el.style.setProperty("--o", Math.min(1, Math.max(0, b.o)).toFixed(3));
    };

    const slot = (i: number) => ({
      x: offsetOf(i, count) * step,
      y: slotY(i, count),
      r: ROTATE[i % ROTATE.length],
    });

    // Reads layout. Only ever called on resize, never inside the animation frame.
    const measure = () => {
      const first = cardRefs.current[0];
      if (!first) return;
      step = first.offsetWidth + GAP;
      height = first.offsetHeight;
      for (let i = 0; i < count; i++) {
        const target = slot(i);
        const hiddenNow = bodies[i] && !revealed && bodies[i].o < 1;
        bodies[i] = {
          x: target.x,
          y: target.y,
          r: target.r,
          s: hiddenNow ? 0.92 : 1,
          o: hiddenNow ? 0 : 1,
          vx: 0,
          vy: 0,
          vr: 0,
          vs: 0,
          vo: 0,
          showAt: bodies[i]?.showAt ?? 0,
        };
        write(i);
      }
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      els().forEach((el) => (el.style.willChange = ""));
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      time += dt;
      const sub = Math.ceil(dt * 240);
      const h = dt / sub;
      const c = 2 * Math.sqrt(STIFFNESS) * 0.72;
      const cPop = 2 * Math.sqrt(POP_STIFFNESS) * 0.3;
      let energy = 0;

      for (let i = 0; i < count; i++) {
        const b = bodies[i];
        if (!b) continue;
        const base = slot(i);
        const visible = revealed && time >= b.showAt;
        let tx = base.x;
        let ty = base.y;
        let tr = base.r;
        let ts = visible ? 1 : 0.92;
        if (hovered >= 0 && visible) {
          if (i === hovered) {
            ty = base.y - 8;
            tr = 0;
            ts = 1.04;
          } else {
            tx = base.x + Math.sign(i - hovered) * PUSH;
          }
        }
        const to = visible ? 1 : 0;
        for (let k = 0; k < sub; k++) {
          [b.x, b.vx] = spring(b.x, b.vx, tx, STIFFNESS, c, h);
          [b.y, b.vy] = spring(b.y, b.vy, ty, STIFFNESS, c, h);
          [b.r, b.vr] = spring(b.r, b.vr, tr, STIFFNESS, c, h);
          [b.s, b.vs] = spring(b.s, b.vs, ts, POP_STIFFNESS, cPop, h);
          [b.o, b.vo] = spring(b.o, b.vo, to, 260, 2 * Math.sqrt(260), h);
        }
        energy +=
          Math.abs(b.vx) +
          Math.abs(b.vy) +
          Math.abs(b.vr) +
          Math.abs(b.vs) * 100 +
          Math.abs(b.vo) * 100 +
          Math.abs(tx - b.x) +
          Math.abs(ty - b.y) +
          Math.abs(tr - b.r) +
          Math.abs(ts - b.s) * 100 +
          Math.abs(to - b.o) * 100;
        write(i);
      }

      if (lastLayer !== hovered) {
        lastLayer = hovered;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.zIndex = i === hovered ? String(count + 1) : "";
          el.toggleAttribute("data-active", i === hovered);
        });
      }

      if (energy > 0.02) raf = requestAnimationFrame(frame);
      else {
        // Snap to the exact resting pose so text is crisp, then sleep.
        for (let i = 0; i < count; i++) {
          const b = bodies[i];
          if (!b) continue;
          const base = slot(i);
          if (hovered < 0 && revealed) {
            Object.assign(b, {
              x: base.x,
              y: base.y,
              r: base.r,
              s: 1,
              o: 1,
              vx: 0,
              vy: 0,
              vr: 0,
              vs: 0,
              vo: 0,
            });
            write(i);
          }
        }
        stop();
      }
    };

    const wake = () => {
      if (raf || !alive || !desktopQuery.matches) return;
      els().forEach((el) => (el.style.willChange = "transform"));
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const pick = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      let best = -1;
      let dist = Infinity;
      for (let i = 0; i < count; i++) {
        const d = Math.abs(px - slot(i).x);
        if (d < dist) {
          dist = d;
          best = i;
        }
      }
      if (best < 0 || dist > step / 2 || Math.abs(py - slot(best).y) > height / 2 + 12) return -1;
      // A little hysteresis so the pushed neighbours do not steal the hover at the seams.
      if (hovered >= 0 && hovered !== best && Math.abs(px - slot(hovered).x) - dist < 8)
        return hovered;
      return best;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const next = pick(event);
      if (next !== hovered) {
        hovered = next;
        wake();
      }
    };
    const onLeave = () => {
      if (hovered !== -1) {
        hovered = -1;
        wake();
      }
    };

    const setup = () => {
      stop();
      hovered = -1;
      if (!desktopQuery.matches) {
        // Grid layout: hand control back to CSS entirely.
        els().forEach((el) => {
          ["--x", "--y", "--r", "--s", "--o"].forEach((p) => el.style.removeProperty(p));
          el.style.zIndex = "";
          el.removeAttribute("data-active");
        });
        return;
      }
      measure();
      wake();
    };

    // Entrance: only for cards that were tucked away before first paint.
    const hiddenAtStart = cardRefs.current[0]?.style.getPropertyValue("--o") === "0";
    let io: IntersectionObserver | undefined;
    if (hiddenAtStart && !reduce) {
      for (let i = 0; i < count; i++) bodies[i] = { o: 0, showAt: 0 } as Body;
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          io?.disconnect();
          revealed = true;
          for (let i = 0; i < count; i++) if (bodies[i]) bodies[i].showAt = time + i * 0.08;
          wake();
        },
        { threshold: 0.2 },
      );
      io.observe(root);
    } else {
      revealed = true;
    }

    const ro = new ResizeObserver(() => {
      if (desktopQuery.matches) {
        measure();
        wake();
      }
    });
    ro.observe(root);
    desktopQuery.addEventListener("change", setup);
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    setup();

    return () => {
      alive = false;
      stop();
      io?.disconnect();
      ro.disconnect();
      desktopQuery.removeEventListener("change", setup);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [count]);

  return (
    <ul
      ref={rootRef}
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:relative lg:block lg:h-[21rem] lg:[perspective:none]",
        className,
      )}
    >
      {items.map((item, i) => (
        <li
          key={i}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          style={
            {
              // Resting pose, written as CSS so it is identical before and after hydration.
              // A percentage inside translate is relative to the card's own width.
              "--x": `calc(${offsetOf(i, count)} * (100% + ${GAP}px))`,
              "--y": `${slotY(i, count)}px`,
              "--r": `${ROTATE[i % ROTATE.length]}deg`,
              "--s": 1,
              "--o": 1,
            } as CSSProperties
          }
          className={cn(
            "lg:absolute lg:top-1/2 lg:left-1/2 lg:h-[17.5rem] lg:w-[min(18.75rem,calc((100%-3.75rem)/4))]",
            "lg:[opacity:var(--o)] lg:[backface-visibility:hidden]",
            "lg:[transform:translate(-50%,-50%)_translate3d(var(--x),var(--y),0)_rotate(var(--r))_scale(var(--s))]",
            "lg:shadow-float lg:data-active:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.35)]",
            cardClassName,
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
