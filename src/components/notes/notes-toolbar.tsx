"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createMeetingNoteAction, createNoteAction } from "@/server/actions";

export function NewMeetingNoteButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await createMeetingNoteAction();
    if (!res.ok) {
      setBusy(false);
      return void toast.error(res.error);
    }
    router.push(`/notes/${res.data.id}`);
  }
  return (
    <Button variant="secondary" onClick={create} disabled={busy}>
      <CalendarClock className="size-4" aria-hidden /> New meeting note
    </Button>
  );
}

export function NewNoteButton({ variant = "accent" }: { variant?: "accent" | "primary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await createNoteAction({});
    if (!res.ok) {
      setBusy(false);
      return toast.error(res.error);
    }
    router.push(`/notes/${res.data.id}`);
  }
  return (
    <Button variant={variant} onClick={create} disabled={busy}>
      <Plus className="size-4" aria-hidden /> New note
    </Button>
  );
}

interface Facet {
  name: string;
  count: number;
}

export function NotesFilters({ tags, folders }: { tags: Facet[]; folders: Facet[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const activeTag = params.get("tag");
  const activeFolder = params.get("folder");

  const urlFor = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) router.replace(urlFor({ q: q.trim() || null }));
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (active: boolean) =>
    cn(
      "text-caption rounded-full border px-3 py-1 font-semibold",
      active
        ? "border-transparent bg-btn-primary text-btn-primary-fg"
        : "border-border hover:bg-surface-soft",
    );

  return (
    <div className="mb-6 space-y-3">
      <div role="search" className="relative max-w-md">
        <Search
          className="text-muted-strong pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search notes"
          placeholder="Search notes"
          className="border-border bg-surface placeholder:text-muted-strong focus-visible:outline-ring w-full rounded-2xl border py-2.5 pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
        />
      </div>
      {(tags.length > 0 || folders.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {folders.length > 0 && (
            <>
              <span className="text-caption text-muted-strong font-semibold">Folders</span>
              {folders.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  aria-pressed={activeFolder === f.name}
                  onClick={() =>
                    router.replace(urlFor({ folder: activeFolder === f.name ? null : f.name }))
                  }
                  className={chip(activeFolder === f.name)}
                >
                  {f.name} · {f.count}
                </button>
              ))}
            </>
          )}
          {tags.length > 0 && (
            <>
              <span className="text-caption text-muted-strong ml-2 font-semibold">Tags</span>
              {tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  aria-pressed={activeTag === t.name}
                  onClick={() =>
                    router.replace(urlFor({ tag: activeTag === t.name ? null : t.name }))
                  }
                  className={chip(activeTag === t.name)}
                >
                  @{t.name} · {t.count}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
