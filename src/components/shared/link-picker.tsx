"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";
import type { MentionItem } from "@/lib/types";
import { lookupAction } from "@/server/queries";

interface Props {
  kind: "task" | "note";
  onPick: (item: MentionItem) => void;
  excludeIds?: string[];
}

/** Inline "find and link" control (avoids nesting dialogs). */
export function LinkPicker({ kind, onPick, excludeIds = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 150);

  const { data = [], isFetching } = useQuery({
    queryKey: ["lookup", kind, debounced],
    enabled: open,
    queryFn: async () => {
      const res = await lookupAction(kind, debounced);
      return res.ok ? res.data : [];
    },
  });
  const items = data.filter((i) => !excludeIds.includes(i.id));

  if (!open) {
    return (
      <Button variant="utility" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="size-4" aria-hidden /> Link a {kind}
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface mt-2 overflow-hidden rounded-2xl border">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
            setQuery("");
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (items[0]) {
              onPick(items[0]);
              setOpen(false);
              setQuery("");
            }
          }
        }}
        placeholder={`Search ${kind}s…`}
        aria-label={`Search ${kind}s to link`}
        className="border-border placeholder:text-muted-strong focus-visible:outline-ring w-full border-b bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
      />
      <ul className={cn("max-h-48 overflow-y-auto p-1", isFetching && "opacity-70")}>
        {items.length === 0 && (
          <li className="text-caption text-muted-strong px-3 py-2">
            {isFetching ? "Searching…" : `No ${kind}s found`}
          </li>
        )}
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                onPick(item);
                setOpen(false);
                setQuery("");
              }}
              className="text-body-sm hover:bg-surface-soft flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150"
            >
              <span className="truncate">{item.label}</span>
              {item.hint && <span className="text-caption text-muted-strong">{item.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="border-border border-t p-1">
        <Button variant="utility" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
