"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { cn } from "@/lib/utils";

export interface SuggestionEntry {
  id: string;
  label: string;
  hint?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface ListProps {
  items: SuggestionEntry[];
  command: (item: SuggestionEntry) => void;
  emptyText: string;
  title: string;
}

const SuggestionList = forwardRef<SuggestionListHandle, ListProps>(function SuggestionList(
  { items, command, emptyText, title },
  ref,
) {
  const [selected, setSelected] = useState(0);

  // Keep the highlighted row in range whenever the result set changes.
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      aria-label={title}
      className="border-border bg-surface shadow-float z-50 max-h-72 w-72 overflow-y-auto rounded-2xl border p-1"
    >
      {items.length === 0 ? (
        <p className="text-caption text-muted-strong px-3 py-2">{emptyText}</p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={cn(
              "text-body-sm flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left",
              index === selected && "bg-surface-soft",
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.hint && (
              <span className="text-caption text-muted-strong shrink-0">{item.hint}</span>
            )}
          </button>
        ))
      )}
    </div>
  );
});

/** Suggestion `render` factory shared by the slash menu and mentions. */
export function suggestionRender(options: { emptyText: string; title: string }) {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, ListProps> | null = null;
    let unmount: (() => void) | null = null;

    const toProps = (props: SuggestionProps<SuggestionEntry, SuggestionEntry>): ListProps => ({
      items: props.items,
      command: props.command,
      ...options,
    });

    return {
      onStart(props: SuggestionProps<SuggestionEntry, SuggestionEntry>) {
        renderer = new ReactRenderer(SuggestionList, {
          props: toProps(props),
          editor: props.editor,
        });
        unmount = props.mount(renderer.element as HTMLElement);
      },
      onUpdate(props: SuggestionProps<SuggestionEntry, SuggestionEntry>) {
        renderer?.updateProps(toProps(props));
      },
      onKeyDown({ event }: { event: KeyboardEvent }) {
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit() {
        unmount?.();
        renderer?.destroy();
        renderer = null;
        unmount = null;
      },
    };
  };
}
