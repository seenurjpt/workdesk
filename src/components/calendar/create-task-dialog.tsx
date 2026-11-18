"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { dayLabel } from "@/lib/calendar";
import { quickAddAction } from "@/server/actions";

interface Props {
  dayKey: string | null;
  onClose: () => void;
}

export function CreateTaskDialog({ dayKey, onClose }: Props) {
  return (
    <Dialog open={dayKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="New task"
        description={
          dayKey
            ? `Due ${dayLabel(dayKey)}. Quick-add tokens like #project, @tag, !p1 and 5pm work here.`
            : undefined
        }
        className="max-w-md"
      >
        {dayKey && <Form key={dayKey} dayKey={dayKey} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ dayKey, onClose }: { dayKey: string; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await quickAddAction({ text, dayKey });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Task added", { description: res.data.title });
    invalidateTaskQueries(qc);
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="calendar-new-task">Task</Label>
        <Input
          id="calendar-new-task"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="What needs doing?"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={busy || !text.trim()}>
          Add task
        </Button>
      </div>
    </form>
  );
}
