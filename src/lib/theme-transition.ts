type ThemeChoice = "light" | "dark" | "system";

/** Applies the theme class straight away so the browser can snapshot the "after" state. */
function paint(choice: ThemeChoice): void {
  const root = document.documentElement;
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Switches theme with a crossfade. The browser takes one picture of the old page, we change the
 * theme, and it fades to the new one on the GPU. That is far cheaper than animating the colours of
 * every element. Browsers without View Transitions, and reduced-motion users, switch instantly.
 */
export function withThemeTransition(choice: ThemeChoice, change: () => void): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof document.startViewTransition !== "function") {
    change();
    return;
  }
  document.startViewTransition(() => {
    paint(choice);
    change();
  });
}
