"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProjectDTO } from "@/lib/types";
import { updateProjectAction } from "@/server/actions";
import { ProjectDialog } from "./project-dialog";

export function ProjectActions({ project }: { project: ProjectDTO }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  async function toggleArchive() {
    const res = await updateProjectAction(project.id, { archived: !project.archived });
    if (!res.ok) return toast.error(res.error);
    toast.success(project.archived ? "Project restored" : "Project archived");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" aria-hidden /> Edit
      </Button>
      <Button variant="secondary" size="sm" onClick={toggleArchive}>
        {project.archived ? (
          <ArchiveRestore className="size-4" aria-hidden />
        ) : (
          <Archive className="size-4" aria-hidden />
        )}
        {project.archived ? "Restore" : "Archive"}
      </Button>
      <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
    </div>
  );
}
