import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectActions } from "@/components/layout/project-actions";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { objectId } from "@/schemas";
import { listProjects } from "@/server/projects";
import { requireUser } from "@/server/session";
import { formatMinutes } from "@/lib/review";
import { getViewData, sumProjectMinutes } from "@/server/tasks";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  if (!objectId.safeParse(id).success) notFound();
  const user = await requireUser();
  const project = (await listProjects(user.id, true)).find((p) => p.id === id);
  if (!project) notFound();
  const view = { kind: "project", projectId: id } as const;
  const [data, minutes] = await Promise.all([
    getViewData(user.id, view, user.timezone),
    sumProjectMinutes(user.id, id),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        subtitle={
          project.archived
            ? "Archived project"
            : `${project.openCount} open ${project.openCount === 1 ? "task" : "tasks"}${minutes > 0 ? ` · ${formatMinutes(minutes)} tracked` : ""}`
        }
        leading={
          <span
            className="mt-3 size-4 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden
          />
        }
        actions={<ProjectActions project={project} />}
      />
      <TaskList
        view={view}
        initial={data}
        mode="flat"
        emptyTitle="No tasks here yet"
        emptyBody={`Add one with #${project.name.replace(/\s+/g, "")} in quick-add, or pick this project when editing a task.`}
      />
    </PageContainer>
  );
}
