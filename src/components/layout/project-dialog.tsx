"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { PROJECT_COLORS } from "@/lib/project-colors";
import { cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/types";
import { projectInputSchema } from "@/schemas";
import { createProjectAction, updateProjectAction } from "@/server/actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectDTO;
}

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? "Edit project" : "New project"} className="max-w-md">
        {open && (
          <ProjectForm
            key={project?.id ?? "new"}
            project={project}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onClose }: { project?: ProjectDTO; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState<string>(project?.color ?? PROJECT_COLORS[0]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = projectInputSchema.safeParse({ name, color });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setBusy(true);
    const res = project
      ? await updateProjectAction(project.id, parsed.data)
      : await createProjectAction(parsed.data);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(project ? "Project updated" : "Project created");
    onClose();
    router.refresh();
    if (!project) router.push(`/projects/${res.data.id}`);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </div>
      <fieldset>
        <legend className="text-body-sm mb-2 font-semibold">Colour</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Project colour">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-8 rounded-full border-2 border-transparent pointer-coarse:size-11",
                color === c && "border-foreground ring-surface ring-2 ring-inset",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      <FieldError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {project ? "Save" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
