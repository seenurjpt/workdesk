"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApp } from "@/components/shared/user-context";
import { cn } from "@/lib/utils";
import type { NoteDTO } from "@/lib/types";
import { restoreVersionAction, saveVersionAction } from "@/server/actions";
import { getVersionAction, listVersionsAction } from "@/server/queries";
import { NotePreview } from "./note-preview";

interface Props {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persist any unsaved edits first so the snapshot reflects what the user sees. */
  beforeAction: () => Promise<void>;
  onRestored: (note: NoteDTO) => void;
}

export function VersionHistory({ noteId, open, onOpenChange, beforeAction, onRestored }: Props) {
  const { user } = useApp();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: versions = [], isFetching } = useQuery({
    queryKey: ["versions", noteId],
    enabled: open,
    queryFn: async () => {
      const res = await listVersionsAction(noteId);
      return res.ok ? res.data : [];
    },
  });

  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ["version", noteId, selected],
    enabled: open && selected !== null,
    queryFn: async () => {
      const res = await getVersionAction(noteId, selected as string);
      return res.ok ? res.data : null;
    },
  });

  const fmt = (iso: string) => formatInTimeZone(new Date(iso), user.timezone, "d MMM yyyy, h:mm a");

  async function saveNow() {
    setBusy(true);
    await beforeAction();
    const res = await saveVersionAction(noteId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Version saved");
    void qc.invalidateQueries({ queryKey: ["versions", noteId] });
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    await beforeAction();
    const res = await restoreVersionAction(noteId, selected);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onRestored(res.data);
    void qc.invalidateQueries({ queryKey: ["versions", noteId] });
    toast.success("Version restored", {
      description: "Your previous text was saved as a version.",
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Version history"
        description="Pick a version to preview it. Restoring keeps your current text as a version too."
        className="max-w-4xl"
      >
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div>
            <Button
              variant="secondary"
              size="sm"
              className="mb-3 w-full"
              onClick={saveNow}
              disabled={busy}
            >
              <History className="size-4" aria-hidden /> Save version now
            </Button>
            <ul aria-label="Versions" className="max-h-80 space-y-1 overflow-y-auto">
              {versions.length === 0 && (
                <li className="text-caption text-muted-strong">
                  {isFetching ? "Loading…" : "No versions yet. They are saved as you edit."}
                </li>
              )}
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.id)}
                    aria-pressed={selected === v.id}
                    className={cn(
                      "hover:bg-surface-soft w-full rounded-xl px-3 py-2 text-left",
                      selected === v.id && "bg-surface-soft ring-accent ring-2 ring-inset",
                    )}
                  >
                    <span className="text-body-sm block truncate font-semibold">
                      {v.title || "Untitled note"}
                    </span>
                    <span className="text-caption text-muted-strong">{fmt(v.savedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border min-h-48 rounded-2xl border p-4">
            {!selected && (
              <p className="text-body-sm text-muted-strong">Select a version to preview it.</p>
            )}
            {selected && loadingDetail && (
              <p className="text-body-sm text-muted-strong">Loading preview…</p>
            )}
            {selected && detail && (
              <div>
                <p className="text-caption text-muted-strong mb-1">Saved {fmt(detail.savedAt)}</p>
                <h3 className="font-heading mb-2 text-2xl font-bold">
                  {detail.title || "Untitled note"}
                </h3>
                <div className="max-h-72 overflow-y-auto">
                  <NotePreview key={detail.id} content={detail.content} />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="accent" onClick={restore} disabled={busy}>
                    Restore this version
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
