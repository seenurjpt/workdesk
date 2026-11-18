"use client";

import { useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TrashBinProvider } from "@/components/shared/trash-bin";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
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
          position="bottom-right"
          // Higher than the corner, which is where the bin appears (above the tab bar on phones).
          offset={{ right: 24, bottom: 96 }}
          mobileOffset={{ right: 16, bottom: 168 }}
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
