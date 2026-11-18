"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// The last control that had focus outside any overlay. Dialogs autofocus their own input before
// Radix can record what had focus, so we track it ourselves and return there when a dialog closes
// (shortcut-opened dialogs have no trigger for Radix to return to).
const OVERLAY =
  '[role="dialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]';
let lastOutsideFocus: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && !t.closest(OVERLAY)) lastOutsideFocus = t;
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      // focus left to nothing (a click on blank space): there is nothing sensible to return to
      if (
        e.relatedTarget === null &&
        e.target instanceof HTMLElement &&
        !e.target.closest(OVERLAY)
      ) {
        lastOutsideFocus = null;
      }
    },
    true,
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideTitle = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  hideTitle?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "border-border bg-surface shadow-float fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 scroll-py-4 overflow-y-auto rounded-3xl border p-6",
          className,
        )}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const target = lastOutsideFocus;
          if (!event.defaultPrevented && target && target !== document.body && target.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        {...props}
      >
        <DialogPrimitive.Title
          className={cn("font-heading mb-1 text-2xl font-bold", hideTitle && "sr-only")}
        >
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description
          className={cn(
            "text-body-sm text-muted-strong mb-4",
            (!description || hideTitle) && "sr-only",
          )}
        >
          {description ?? title}
        </DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="text-muted-strong hover:bg-surface-soft absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-full"
        >
          <X className="size-5" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
