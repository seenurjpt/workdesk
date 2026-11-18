"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, ListChecks, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import type { TemplateDTO } from "@/lib/types";
import {
  createTemplateAction,
  deleteTemplateAction,
  instantiateTemplateAction,
} from "@/server/actions";
import { getTaskAction } from "@/server/queries";

const ICON = { task_checklist: ListChecks, meeting_note: CalendarClock, note: FileText } as const;
const KIND = { task_checklist: "Checklist", meeting_note: "Meeting note", note: "Note" } as const;

export function TemplatesView({ templates }: { templates: TemplateDTO[] }) {
  const router = useRouter();
  const { open } = useTaskEditor();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TemplateDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function use(t: TemplateDTO) {
    setBusyId(t.id);
    const res = await instantiateTemplateAction(t.id);
    setBusyId(null);
    if (!res.ok) return void toast.error(res.error);
    if (res.data.kind === "note") return void router.push(`/notes/${res.data.id}`);
    toast.success("Task created from template", { description: t.name });
    const task = await getTaskAction(res.data.id);
    if (task.ok) open(task.data);
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    const res = await deleteTemplateAction(deleting.id);
    setDeleting(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Template deleted");
    router.refresh();
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button variant="accent" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New checklist template
        </Button>
      </div>
      <ul aria-label="Templates" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <li
              key={t.id}
              className="border-border bg-surface flex flex-col rounded-3xl border p-5"
            >
              <div className="mb-3 flex items-start gap-3">
                <span className="bg-band inline-flex size-10 shrink-0 items-center justify-center rounded-2xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading truncate text-xl font-semibold">{t.name}</h2>
                  <p className="text-caption text-muted-strong">
                    {KIND[t.kind]} · {t.summary}
                    {t.system && " · starter"}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex gap-2 pt-2">
                <Button size="sm" disabled={busyId === t.id} onClick={() => void use(t)}>
                  {t.kind === "task_checklist" ? "Create task" : "Create note"}
                </Button>
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => setDeleting(t)}
                  aria-label={`Delete template ${t.name}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {templates.length === 0 && (
        <p className="text-body-sm text-muted-strong">
          No templates. Save any note from its page, or any task&apos;s subtasks from the task
          editor.
        </p>
      )}
      <NewChecklistDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this template?"
        body={`“${deleting?.name ?? ""}” will be removed. Tasks and notes already made from it are not affected.`}
        confirmLabel="Delete template"
        onConfirm={remove}
      />
    </>
  );
}

function NewChecklistDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [items, setItems] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = items
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!name.trim()) return setError("Give the template a name");
    if (list.length === 0) return setError("Add at least one item, one per line");
    setBusy(true);
    const res = await createTemplateAction({
      kind: "task_checklist",
      name,
      payload: { title: name, items: list },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Template created");
    setName("");
    setItems("");
    setError(undefined);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New checklist template"
        description="Each line becomes a subtask when you create a task from it."
        className="max-w-lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="tpl-items">Items (one per line)</Label>
            <Textarea
              id="tpl-items"
              rows={7}
              value={items}
              onChange={(e) => setItems(e.target.value)}
            />
          </div>
          <FieldError message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create template
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
