"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, FileText, Hourglass, Plus, Timer, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useApp } from "@/components/shared/user-context";
import { useTaskMutations } from "@/hooks/use-task-mutations";
import { parseLocalInput, toDateInput, toTimeInput } from "@/lib/format";
import { repeatEndsAt, repeatFromTask, repeatToRrule, type RepeatState } from "@/lib/repeat-state";
import { RemindersField, reminderRowTime, type ReminderRow } from "./reminders-field";
import { RepeatField } from "./repeat-field";
import { AttachmentsField } from "./attachments-field";
import { StartTimerMenu } from "@/components/focus/start-timer-menu";
import { formatMinutes } from "@/lib/review";
import { saveTaskAsTemplateAction } from "@/server/actions";
import type { TaskDTO } from "@/lib/types";
import type { TaskUpdate } from "@/schemas";
import { LinkPicker } from "@/components/shared/link-picker";
import { getLinkedNotesAction } from "@/server/queries";
import { linkTaskNoteAction, unlinkTaskNoteAction } from "@/server/actions";
import { DescriptionEditor } from "./description-editor";

const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
  projectId: z.string(),
  priority: z.enum(["1", "2", "3", "4"]),
  date: z.string(),
  time: z.string(),
  tags: z.string().max(400),
  subtasks: z
    .array(
      z.object({ id: z.string().optional(), title: z.string().trim().max(200), done: z.boolean() }),
    )
    .max(100),
});
type FormValues = z.infer<typeof formSchema>;

export function TaskEditor({ task, onClose }: { task: TaskDTO | null; onClose: () => void }) {
  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Edit task" className="max-w-2xl">
        {task && <EditorForm key={task.id} task={task} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({ task, onClose }: { task: TaskDTO; onClose: () => void }) {
  const { user, projects } = useApp();
  const { update } = useTaskMutations();
  const [description, setDescription] = useState<Record<string, unknown> | null>(task.description);
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  const [repeat, setRepeat] = useState<RepeatState>(() =>
    repeatFromTask(task.recurrence, user.timezone),
  );
  const [repeatDirty, setRepeatDirty] = useState(false);
  const [reminderRows, setReminderRows] = useState<ReminderRow[]>(() =>
    task.reminders.map((r) => ({
      key: r.id,
      id: r.id,
      offsetMin: r.offsetMin,
      customDate: r.offsetMin === null ? toDateInput(r.at, user.timezone) : "",
      customTime: r.offsetMin === null ? toTimeInput(r.at, false, user.timezone) : "",
    })),
  );
  const [remindersDirty, setRemindersDirty] = useState(false);
  const [waiting, setWaiting] = useState({
    person: task.waitingOn?.person ?? "",
    date: toDateInput(task.waitingOn?.followUpAt ?? null, user.timezone),
    note: task.waitingOn?.note ?? "",
  });
  const [waitingDirty, setWaitingDirty] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: task.title,
      projectId: task.projectId ?? "",
      priority: String(task.priority) as FormValues["priority"],
      date: toDateInput(task.dueAt, user.timezone),
      time: toTimeInput(task.dueAt, task.allDay, user.timezone),
      tags: task.tags.join(", "),
      subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "subtasks" });
  const qc = useQueryClient();

  async function linkNote(noteId: string) {
    const res = await linkTaskNoteAction({ taskId: task.id, noteId });
    if (!res.ok) return toast.error(res.error);
    void qc.invalidateQueries({ queryKey: ["links"] });
  }

  const watchedDate = useWatch({ control, name: "date" });
  const watchedTime = useWatch({ control, name: "time" });
  const dueForReminders = watchedDate
    ? parseLocalInput(watchedDate, watchedTime, user.timezone)
    : null;

  function onSubmit(v: FormValues) {
    if (repeat.mode !== "none" && !v.date) {
      return setError("date", { message: "Pick a due date to repeat this task" });
    }
    const patch: TaskUpdate = {
      title: v.title,
      projectId: v.projectId || null,
      priority: Number(v.priority) as 1 | 2 | 3 | 4,
      dueAt: v.date ? parseLocalInput(v.date, v.time, user.timezone) : null,
      allDay: v.date ? !v.time : false,
      tags: v.tags
        .split(/[,\s]+/)
        .map((t) => t.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
      subtasks: v.subtasks.filter((s) => s.title.trim()).map((s, order) => ({ ...s, order })),
      ...(descriptionDirty ? { description } : {}),
      ...(repeatDirty
        ? {
            recurrence:
              repeat.mode === "none"
                ? null
                : {
                    rrule: repeatToRrule(repeat) as string,
                    endsAt: repeatEndsAt(repeat, user.timezone),
                  },
          }
        : {}),
      ...(waitingDirty
        ? {
            waitingOn: waiting.person.trim()
              ? {
                  person: waiting.person.trim(),
                  followUpAt: waiting.date
                    ? parseLocalInput(waiting.date, undefined, user.timezone)
                    : null,
                  note: waiting.note.trim() || null,
                }
              : null,
          }
        : {}),
      ...(remindersDirty
        ? {
            reminders: reminderRows.flatMap((r) => {
              const at = reminderRowTime(r, {
                due: dueForReminders,
                allDay: !v.time,
                timezone: user.timezone,
                workStart: user.workHours.start,
              });
              if (!at) return [];
              return [
                r.offsetMin === null
                  ? { id: r.id, offsetMin: null, at }
                  : { id: r.id, offsetMin: r.offsetMin },
              ];
            }),
          }
        : {}),
    };
    update.mutate({ id: task.id, patch: patch }, { onSuccess: onClose });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <Label htmlFor="task-title">Title</Label>
        <Input id="task-title" autoFocus {...register("title")} />
        <FieldError message={errors.title?.message} />
      </div>

      <div>
        <span className="text-body-sm mb-1 block font-semibold">Description</span>
        <DescriptionEditor
          label="Task description"
          value={task.description}
          onChange={(json) => {
            setDescription(json);
            setDescriptionDirty(true);
          }}
          onNotePick={(item) => linkNote(item.id)}
          onNavigate={onClose}
        />
      </div>

      <LinkedNotes taskId={task.id} onNavigate={onClose} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="task-project">Project</Label>
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <Select id="task-project" value={field.value} onValueChange={field.onChange}>
                <option value="">No project (general)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>
        <div>
          <Label htmlFor="task-priority">Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select id="task-priority" value={field.value} onValueChange={field.onChange}>
                <option value="1">P1 · Urgent</option>
                <option value="2">P2 · High</option>
                <option value="3">P3 · Medium</option>
                <option value="4">P4 · Low</option>
              </Select>
            )}
          />
        </div>
        <div>
          <Label htmlFor="task-date">Due date</Label>
          <Input id="task-date" type="date" {...register("date")} />
        </div>
        <div>
          <Label htmlFor="task-time">Time (optional)</Label>
          <Input id="task-time" type="time" {...register("time")} />
        </div>
      </div>

      <RepeatField
        value={repeat}
        onChange={(next) => {
          setRepeat(next);
          setRepeatDirty(true);
        }}
        hasDueDate={Boolean(watchedDate)}
        error={errors.date?.message}
      />

      <RemindersField
        rows={reminderRows}
        onChange={(rows) => {
          setReminderRows(rows);
          setRemindersDirty(true);
        }}
        due={dueForReminders}
        allDay={!watchedTime}
        timezone={user.timezone}
        workStart={user.workHours.start}
      />

      <fieldset className="space-y-2">
        <legend className="text-body-sm mb-1 flex items-center gap-2 font-semibold">
          <Hourglass className="size-4" aria-hidden /> Waiting on
        </legend>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            aria-label="Waiting on (person)"
            placeholder="Who are you waiting on?"
            maxLength={80}
            value={waiting.person}
            onChange={(e) => {
              setWaiting({ ...waiting, person: e.target.value });
              setWaitingDirty(true);
            }}
          />
          <Input
            type="date"
            aria-label="Follow-up date"
            value={waiting.date}
            onChange={(e) => {
              setWaiting({ ...waiting, date: e.target.value });
              setWaitingDirty(true);
            }}
          />
        </div>
        {waiting.person.trim() && (
          <Input
            aria-label="Waiting note"
            placeholder="Note (optional)"
            maxLength={300}
            value={waiting.note}
            onChange={(e) => {
              setWaiting({ ...waiting, note: e.target.value });
              setWaitingDirty(true);
            }}
          />
        )}
        <p className="text-caption text-muted-strong">
          Waiting tasks appear in the Waiting on list, sorted by follow-up date.
        </p>
      </fieldset>

      <AttachmentsField taskId={task.id} initial={task.attachments} />

      <div className="bg-surface-soft flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <Timer className="size-4 shrink-0" aria-hidden />
        <span className="text-body-sm flex-1 font-semibold">
          Time tracked:{" "}
          {task.timeSpentMinutes > 0 ? formatMinutes(task.timeSpentMinutes) : "none yet"}
        </span>
        <StartTimerMenu task={{ id: task.id, title: task.title }} size="sm" label="Timer" />
      </div>

      <div>
        <Label htmlFor="task-tags">Tags</Label>
        <Input id="task-tags" placeholder="report, clientA" {...register("tags")} />
      </div>

      <fieldset>
        <legend className="text-body-sm mb-1 font-semibold">Subtasks</legend>
        <ul className="space-y-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <label className="inline-flex shrink-0 items-center justify-center pointer-coarse:size-11">
                <input
                  type="checkbox"
                  aria-label={`Subtask ${index + 1} done`}
                  className="size-5 accent-[var(--accent)]"
                  {...register(`subtasks.${index}.done`)}
                />
              </label>
              <Input
                aria-label={`Subtask ${index + 1}`}
                className="py-2"
                {...register(`subtasks.${index}.title`)}
              />
              <Button
                variant="utility"
                size="iconSm"
                aria-label={`Remove subtask ${index + 1}`}
                onClick={() => remove(index)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="utility"
          size="sm"
          className="mt-2"
          onClick={() => append({ title: "", done: false })}
        >
          <Plus className="size-4" aria-hidden /> Add subtask
        </Button>
        <Button
          variant="utility"
          size="sm"
          className="mt-2"
          onClick={async () => {
            const res = await saveTaskAsTemplateAction(task.id);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved as a template", { description: "Find it under Templates." });
          }}
        >
          <Copy className="size-4" aria-hidden /> Save as template
        </Button>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save task"}
        </Button>
      </div>
    </form>
  );
}

function LinkedNotes({ taskId, onNavigate }: { taskId: string; onNavigate: () => void }) {
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["links", "task", taskId],
    queryFn: async () => {
      const res = await getLinkedNotesAction(taskId);
      return res.ok ? res.data : [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["links"] });

  async function link(noteId: string) {
    const res = await linkTaskNoteAction({ taskId, noteId });
    if (!res.ok) return toast.error(res.error);
    void refresh();
  }
  async function unlink(noteId: string) {
    const res = await unlinkTaskNoteAction({ taskId, noteId });
    if (!res.ok) return toast.error(res.error);
    void refresh();
  }

  return (
    <section aria-labelledby="linked-notes-heading">
      <h3 id="linked-notes-heading" className="text-body-sm mb-1 font-semibold">
        Linked notes
      </h3>
      {notes.length === 0 ? (
        <p className="text-caption text-muted-strong">No notes linked yet.</p>
      ) : (
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <FileText className="text-muted-strong size-4 shrink-0" aria-hidden />
              <Link
                href={`/notes/${n.id}`}
                onClick={onNavigate}
                className="text-body-sm text-accent-text min-w-0 flex-1 truncate font-semibold hover:underline"
              >
                {n.title || "Untitled note"}
              </Link>
              <Button
                variant="utility"
                size="iconSm"
                aria-label={`Unlink ${n.title || "note"}`}
                onClick={() => unlink(n.id)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <LinkPicker
        kind="note"
        excludeIds={notes.map((n) => n.id)}
        onPick={(item) => link(item.id)}
      />
    </section>
  );
}
