"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { PublicThemeToggle } from "@/components/shared/public-theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "keyboard", label: "Keyboard" },
] as const;

const DOCK_AT = 48;
const UNDOCK_AT = 16;

/** A full-width bar at the top of the page that becomes a floating dock once you scroll. */
export function LandingNav() {
  const [docked, setDocked] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      // Two thresholds so it does not flicker when resting near the edge.
      setDocked((d) => (d ? y > UNDOCK_AT : y > DOCK_AT));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Highlight the section in view.
  useEffect(() => {
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        const top = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        setActive(top ? top[0] : null);
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const { id } of LINKS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    // Zero height: the bar floats over the page instead of taking up space above the hero, so
    // nothing but the hero background ever shows behind the dock.
    <header className="sticky top-0 z-40 h-0">
      <div
        className={cn(
          "transition-[padding] duration-300 motion-reduce:transition-none",
          docked ? "px-3 pt-3" : "px-0 pt-0",
        )}
      >
        <div
          data-docked={docked}
          className={cn(
            "mx-auto w-full backdrop-blur-xl transition-[max-width,border-radius,background-color,box-shadow,border-color] duration-300 ease-out motion-reduce:transition-none",
            docked
              ? "border-border bg-surface/80 shadow-float max-w-[780px] rounded-full border"
              : "border-border bg-background/85 border-b-border max-w-full rounded-none border-b border-transparent",
          )}
        >
          <div
            className={cn(
              "mx-auto flex items-center gap-3 transition-[max-width,padding,height] duration-300 ease-out motion-reduce:transition-none",
              docked ? "h-14 max-w-full pr-2 pl-4" : "h-16 max-w-[1200px] px-4 md:px-8",
            )}
          >
            <Logo href="/" compactOnSmall />
            <nav aria-label="Sections" className="ml-4 hidden items-center gap-1 md:flex">
              {LINKS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={active === id ? "location" : undefined}
                  className={cn(
                    "text-nav rounded-full px-3 py-1.5 transition-colors duration-150",
                    active === id
                      ? "bg-band text-foreground"
                      : "text-muted-strong hover:text-foreground hover:bg-surface-soft",
                  )}
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <PublicThemeToggle
                className={cn("transition-[width,height] duration-300", docked && "size-9")}
              />
              {/* On the very narrowest screens Sign in lives in the hero and footer instead. */}
              <Button
                asChild
                variant="utility"
                size="sm"
                className="rounded-full max-[359px]:hidden"
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
