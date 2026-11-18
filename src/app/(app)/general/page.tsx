import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { requireUser } from "@/server/session";
import { getViewData } from "@/server/tasks";

export const metadata: Metadata = { title: "General" };

export default async function GeneralPage() {
  const user = await requireUser();
  const data = await getViewData(user.id, { kind: "general" }, user.timezone);
  return (
    <PageContainer>
      <PageHeader
        title="General"
        subtitle="Everyday tasks that don't belong to a project, with or without a date."
      />
      <TaskList
        view={{ kind: "general" }}
        initial={data}
        mode="flat"
        emptyTitle="No general tasks"
        emptyBody="Tasks without a project show up here. Not every task needs one."
      />
    </PageContainer>
  );
}
