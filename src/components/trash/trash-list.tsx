"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { FileText, RotateCcw, SquareCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/components/shared/user-context";
import type { TrashItemDTO } from "@/lib/types";
import {
  emptyTrashAction,
  purgeItemAction,
  restoreNoteAction,
  restoreTaskAction,
} from "@/server/actions";

export function TrashList({ items }: { items: TrashItemDTO[] }) {
  const router = useRouter();
  const { user } = useApp();
  const [pending, setPending] = useState<TrashItemDTO | "all" | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore(item: TrashItemDTO) {
    const res =
      item.kind === "task" ? await restoreTaskAction(item.id) : await restoreNoteAction(item.id);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${item.kind === "task" ? "Task" : "Note"} restored`, {
      description: item.title,
    });
    router.refresh();
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    const res =
      pending === "all"
        ? await emptyTrashAction()
        : await purgeItemAction(pending.kind, pending.id);
    setBusy(false);
    setPending(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(pending === "all" ? "Trash emptied" : "Deleted forever");
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        body="Deleted tasks and notes wait here for 30 days before they are removed for good."
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="danger" size="sm" onClick={() => setPending("all")}>
          <Trash2 className="size-4" aria-hidden /> Empty trash
        </Button>
      </div>
      <ul aria-label="Deleted items" className="border-border border-t">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.id}`}
            className="border-border flex flex-wrap items-center gap-3 border-b px-1 py-3"
          >
            {item.kind === "task" ? (
              <SquareCheck className="text-muted-strong size-5 shrink-0" aria-label="Task" />
            ) : (
              <FileText className="text-muted-strong size-5 shrink-0" aria-label="Note" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body-sm truncate font-semibold">{item.title}</p>
              <p className="text-caption text-muted-strong">
                Deleted {formatInTimeZone(new Date(item.deletedAt), user.timezone, "d MMM, h:mm a")}{" "}
                ·{" "}
                <span className={item.daysLeft <= 3 ? "text-danger font-semibold" : undefined}>
                  {item.daysLeft === 0
                    ? "removed today"
                    : `${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"} left`}
                </span>
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void restore(item)}>
              <RotateCcw className="size-4" aria-hidden /> Restore
            </Button>
            <Button
              variant="utility"
              size="sm"
              onClick={() => setPending(item)}
              aria-label={`Delete "${item.title}" forever`}
            >
              <Trash2 className="size-4" aria-hidden /> Delete forever
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === "all" ? "Empty the trash?" : "Delete forever?"}
        body={
          pending === "all"
            ? `All ${items.length} items will be permanently deleted. This cannot be undone.`
            : "This item will be permanently deleted. This cannot be undone."
        }
        confirmLabel={pending === "all" ? "Empty trash" : "Delete forever"}
        busy={busy}
        onConfirm={confirm}
      />
    </>
  );
}
