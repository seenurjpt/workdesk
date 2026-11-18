import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TaskList } from "@/components/tasks/task-list";
import { requireUser } from "@/server/session";
import { getViewData } from "@/server/tasks";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page() {
  const user = await requireUser();
  const data = await getViewData(user.id, { kind: "inbox" }, user.timezone);
  return (
    <PageContainer>
      <PageHeader title="Inbox" subtitle="Tasks with no project and no date." />
      <TaskList
        view={{ kind: "inbox" }}
        initial={data}
        mode="flat"
        emptyTitle="Inbox zero"
        emptyBody="Tasks without a project or date land here. Quick-add one to get started."
      />
    </PageContainer>
  );
}
