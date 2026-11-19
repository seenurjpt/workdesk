"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TrashBinProvider } from "@/components/shared/trash-bin";
import { TooltipProvider } from "@/components/ui/tooltip";

const PHONE_QUERY = "(max-width: 767px)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function Providers({ children }: { children: ReactNode }) {
  // Toasts live at the top, just under the top bar, on every screen size: the bottom is taken by
  // the tab bar, the add button, the timer dock and the delete bin, and mid-screen toasts covered
  // the list. Phones: centred and full width. Larger screens: top right.
  // PREVIOUS (desktop): position "bottom-right" with offset { right: 24, bottom: 96 } (above the bin).
  const phone = useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <TrashBinProvider>{children}</TrashBinProvider>
        </TooltipProvider>
        <Toaster
          position={phone ? "top-center" : "top-right"}
          offset={phone ? { top: 72, left: 12, right: 12 } : { top: 76, right: 24 }}
          mobileOffset={{ top: 72, left: 12, right: 12 }}
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
