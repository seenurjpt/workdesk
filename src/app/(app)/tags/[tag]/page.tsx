import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { requireUser } from "@/server/session";
import { getViewData } from "@/server/tasks";

export const metadata: Metadata = { title: "Tag" };

export default async function TagPage(props: PageProps<"/tags/[tag]">) {
  const tag = decodeURIComponent((await props.params).tag).slice(0, 40);
  const user = await requireUser();
  const view = { kind: "tag", tag } as const;
  const data = await getViewData(user.id, view, user.timezone);
  return (
    <PageContainer>
      <PageHeader title={`@${tag}`} subtitle="Open tasks with this tag." />
      <TaskList
        view={view}
        initial={data}
        mode="flat"
        emptyTitle="Nothing tagged"
        emptyBody={`Add @${tag} to a task in quick-add to see it here.`}
      />
    </PageContainer>
  );
}
