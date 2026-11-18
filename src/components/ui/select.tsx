"use client";

import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Radix does not allow an item with value "", so the empty choice uses this stand-in. */
const EMPTY = "__empty__";

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

function readOptions(children: React.ReactNode): Option[] {
  const out: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (
      !React.isValidElement<{
        value?: string | number;
        disabled?: boolean;
        children?: React.ReactNode;
      }>(child)
    )
      return;
    const { value, disabled, children: label } = child.props;
    out.push({
      value: value === undefined ? "" : String(value),
      label: React.Children.toArray(label).join(""),
      disabled: Boolean(disabled),
    });
  });
  return out;
}

export interface SelectProps {
  id?: string;
  value: string | number;
  onValueChange: (value: string) => void;
  /** `<option value="…">Label</option>` elements, as with a native select. */
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  "aria-label"?: string;
}

/**
 * The app's dropdown: a styled, animated replacement for the native select. Keyboard support
 * (arrows, type-ahead, Home/End, Escape) and screen-reader roles come from Radix.
 */
export function Select({
  id,
  value,
  onValueChange,
  children,
  className,
  disabled,
  name,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options = readOptions(children);
  const current = String(value);

  return (
    <RadixSelect.Root
      value={current === "" ? EMPTY : current}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
      disabled={disabled}
      name={name}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group border-border bg-surface text-foreground flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-base transition-colors duration-150",
          "hover:border-muted-strong data-[state=open]:border-accent",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown
            className="text-muted-strong size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="border-border bg-surface shadow-float z-[100] flex max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-2xl border"
        >
          <RadixSelect.ScrollUpButton className="text-muted-strong flex h-6 shrink-0 items-center justify-center">
            <ChevronUp className="size-4" aria-hidden />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-1.5">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value === "" ? EMPTY : o.value}
                disabled={o.disabled}
                className={cn(
                  "text-body-sm relative flex cursor-pointer items-center gap-3 rounded-xl py-2 pr-3 pl-3 outline-none select-none",
                  "data-[highlighted]:bg-surface-soft data-[state=checked]:font-semibold",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 pointer-coarse:min-h-11",
                )}
              >
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="text-accent-text ml-auto">
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="text-muted-strong flex h-6 shrink-0 items-center justify-center">
            <ChevronDown className="size-4" aria-hidden />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
