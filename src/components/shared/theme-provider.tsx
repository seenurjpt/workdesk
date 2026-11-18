"use client";

import { THEME_KEY } from "@/lib/theme-init";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
const EVENT = "workdesk:theme";

function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemQuery().matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribeTheme(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
function subscribeSystem(cb: () => void) {
  const mq = systemQuery();
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

interface ThemeContextValue {
  /** What the person chose: light, dark or system. */
  theme: Theme;
  /** What is actually showing: light or dark. Undefined on the server. */
  resolvedTheme: "light" | "dark" | undefined;
  setTheme: (theme: Theme) => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, readTheme, () => "system");
  const systemDark = useSyncExternalStore<boolean | undefined>(
    subscribeSystem,
    () => systemQuery().matches,
    () => undefined,
  );

  // Keep the page in step when the choice changes, or the device theme changes under "system".
  useEffect(() => apply(theme), [theme, systemDark]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the choice just will not persist */
    }
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedTheme =
      theme === "system"
        ? systemDark === undefined
          ? undefined
          : systemDark
            ? "dark"
            : "light"
        : theme;
    return { theme, resolvedTheme, setTheme };
  }, [theme, systemDark, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
