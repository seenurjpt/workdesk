"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useTheme } from "@/components/shared/theme-provider";
import type { ProjectDTO, UserSettingsDTO } from "@/lib/types";

interface AppContextValue {
  user: UserSettingsDTO;
  projects: ProjectDTO[];
  tags: { tag: string; count: number }[];
  /** Open tasks with no project. */
  generalCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  const { setTheme } = useTheme();
  const preferred = value.user.theme;
  // First visit on this device: adopt the theme saved on the account.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("theme") === null) setTheme(preferred);
    } catch {
      /* storage unavailable: keep system default */
    }
  }, [preferred, setTheme]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
