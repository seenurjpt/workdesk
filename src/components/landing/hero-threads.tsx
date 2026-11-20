"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@/components/shared/theme-provider";

// WebGL only runs in the browser; load it after the hero text so it never blocks first paint.
const WebThreads = dynamic(() => import("./web-threads"), { ssr: false });

/** Web Threads hero background (reactbits.dev), tuned to the WorkDesk green and the active theme. */
export function HeroThreads() {
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme !== "dark";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
    >
      <WebThreads
        colors={light ? ["#00b87c", "#00f0a0"] : ["#ecffe0", "#00f0a0"]}
        lightMode={light}
        position={0.3}
        brightness={0.5}
      />
    </div>
  );
}
