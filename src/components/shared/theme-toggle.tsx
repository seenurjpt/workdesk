"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/shared/theme-provider";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { withThemeTransition } from "@/lib/theme-transition";
import { updateSettingsAction } from "@/server/actions";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

const subscribe = () => () => {};

export function useThemeChoice() {
  const { theme = "system", setTheme } = useTheme();
  const choose = (value: ThemeValue) => {
    withThemeTransition(value, () => setTheme(value));
    void updateSettingsAction({ theme: value });
  };
  return { theme: theme as ThemeValue, choose };
}

export function ThemeToggle() {
  const { theme, choose } = useThemeChoice();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const Current = OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Change theme"
        className="text-foreground hover:bg-surface-soft inline-flex size-11 items-center justify-center rounded-full md:size-9"
      >
        {mounted ? (
          <Current className="size-5" aria-hidden />
        ) : (
          <span className="size-5" aria-hidden />
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-border bg-surface shadow-float z-50 min-w-40 rounded-xl border p-1"
        >
          <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => choose(v as ThemeValue)}>
            {OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="text-nav data-[highlighted]:bg-surface-soft data-[state=checked]:text-accent-text flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none"
              >
                <Icon className="size-4" aria-hidden />
                {label}
                <DropdownMenu.ItemIndicator className="text-caption ml-auto">
                  ✓
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
