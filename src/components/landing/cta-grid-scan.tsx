"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// The WebGL code is only fetched once the card is about to scroll into view.
const GridScan = dynamic(() => import("./grid-scan"), { ssr: false });

/**
 * Grid Scan background (reactbits.dev) for the closing call-to-action card.
 * The card is always dark, in light and dark mode alike, so the effect never changes with the theme.
 * The solid card colour is painted first, so nothing flashes while the canvas starts up.
 */
export function CtaGridScan() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0">
      {near && (
        <GridScan
          lightMode={false}
          linesColor="#33423b"
          scanColor="#00f0a0"
          cells={9}
          dpr={1.5}
          interactive={false}
          clickEffect="none"
        />
      )}
      {/* Keeps the copy readable over the grid. */}
      <div className="absolute inset-0 [background:radial-gradient(ellipse_55%_60%_at_50%_50%,rgba(5,8,7,0.82)_0%,rgba(5,8,7,0.45)_60%,transparent_100%)]" />
    </div>
  );
}
