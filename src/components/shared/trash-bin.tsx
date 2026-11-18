"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Where the bin sits: its centre is this far from the right and bottom edges of the screen. */
const BIN_SIZE = 56;
const FLIGHT_MS = 650;
const LINGER_MS = 1100;

interface Ghost {
  id: number;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where it flies to, relative to its own centre. */
  dx: number;
  dy: number;
}

interface TrashFx {
  /**
   * Plays the "thrown in the bin" animation for something just deleted. `source` is the element
   * that was on screen (or the `data-fx-id` of one). Call it before the element is removed.
   */
  fly: (source: Element | string | null, label: string) => void;
}

const TrashFxContext = createContext<TrashFx>({ fly: () => {} });

export function useTrashFx(): TrashFx {
  return useContext(TrashFxContext);
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TrashBinProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [lidOpen, setLidOpen] = useState(false);
  const [gulp, setGulp] = useState(0);
  const [count, setCount] = useState(0);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const binRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(1);
  const inFlight = useRef(0);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setLeaving(true);
      exitTimer.current = setTimeout(() => {
        setShow(false);
        setLeaving(false);
        setCount(0);
      }, 280);
    }, LINGER_MS);
  }, []);

  const fly = useCallback<TrashFx["fly"]>((source, label) => {
    if (typeof window === "undefined" || reducedMotion()) return;
    const el =
      typeof source === "string"
        ? document.querySelector(`[data-fx-id="${CSS.escape(source)}"]`)
        : source;
    const r = el?.getBoundingClientRect();
    const width = Math.min(r?.width ?? 260, 440);
    const height = Math.min(r?.height ?? 52, 72);
    const left = r ? r.left : window.innerWidth / 2 - width / 2;
    const top = r ? r.top : window.innerHeight / 3;

    clearTimeout(hideTimer.current);
    clearTimeout(exitTimer.current);
    setLeaving(false);
    setShow(true);

    // The bin is placed by CSS; wait a frame for it, then aim at its real centre.
    requestAnimationFrame(() => {
      const b = binRef.current?.getBoundingClientRect();
      const cx = b ? b.left + b.width / 2 : window.innerWidth - 24 - BIN_SIZE / 2;
      const cy = b ? b.top + b.height / 2 : window.innerHeight - 24 - BIN_SIZE / 2;
      inFlight.current += 1;
      setLidOpen(true);
      setGhosts((g) => [
        ...g,
        {
          id: nextId.current++,
          label,
          left,
          top,
          width,
          height,
          dx: cx - (left + width / 2),
          dy: cy - (top + height / 2),
        },
      ]);
    });
  }, []);

  const landed = useCallback(
    (id: number) => {
      setGhosts((g) => g.filter((x) => x.id !== id));
      inFlight.current -= 1;
      setCount((c) => c + 1);
      setGulp((n) => n + 1);
      if (inFlight.current <= 0) {
        inFlight.current = 0;
        // Let the lid snap shut, then wait a moment before the bin leaves.
        setTimeout(() => setLidOpen(false), 120);
        scheduleHide();
      }
    },
    [scheduleHide],
  );

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      clearTimeout(exitTimer.current);
    },
    [],
  );

  const value = useMemo(() => ({ fly }), [fly]);

  return (
    <TrashFxContext.Provider value={value}>
      {children}
      {show && (
        <div
          ref={binRef}
          aria-hidden
          data-testid="trash-bin"
          className="pointer-events-none fixed right-6 bottom-24 z-[115] md:bottom-6"
          style={{
            animation: leaving
              ? "bin-out 0.28s ease-in forwards"
              : "bin-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}
        >
          <div
            key={gulp}
            className="bg-ticker text-ticker-fg shadow-float relative flex items-center justify-center rounded-2xl ring-1 ring-white/10"
            style={{
              width: BIN_SIZE,
              height: BIN_SIZE,
              animation: gulp ? "bin-gulp 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)" : undefined,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <g
                style={{
                  transformOrigin: "4px 6px",
                  transform: lidOpen ? "rotate(-32deg) translateY(-1px)" : "rotate(0deg)",
                  transition: "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </g>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            {count > 0 && (
              <span className="bg-accent text-on-accent absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-bold">
                {count}
              </span>
            )}
          </div>
        </div>
      )}
      {ghosts.map((g) => (
        <GhostCard key={g.id} ghost={g} onLanded={() => landed(g.id)} />
      ))}
    </TrashFxContext.Provider>
  );
}

function GhostCard({ ghost, onLanded }: { ghost: Ghost; onLanded: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onLanded);
  useEffect(() => {
    done.current = onLanded;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { dx, dy } = ghost;
    const anim = el.animate(
      [
        { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
        {
          transform: `translate(${dx * 0.03}px, ${dy * 0.03 - 10}px) scale(1.04) rotate(-2deg)`,
          opacity: 1,
          offset: 0.2,
          easing: "cubic-bezier(0.55, 0.05, 0.85, 0.45)",
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.08) rotate(16deg)`,
          opacity: 0.25,
          offset: 1,
        },
      ],
      { duration: FLIGHT_MS, fill: "forwards" },
    );
    anim.onfinish = () => done.current();
    return () => anim.cancel();
  }, [ghost]);

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="trash-ghost"
      className="border-border bg-surface shadow-float pointer-events-none fixed z-[120] flex items-center overflow-hidden rounded-xl border px-4 will-change-transform"
      style={{ left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height }}
    >
      <span className="text-body-sm truncate font-semibold">{ghost.label}</span>
    </div>
  );
}
