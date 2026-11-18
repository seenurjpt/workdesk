import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { WaitingList } from "@/components/waiting/waiting-list";
import { requireUserId } from "@/server/session";
import { listWaiting } from "@/server/tasks";

export const metadata: Metadata = { title: "Waiting on" };

export default async function WaitingPage() {
  const userId = await requireUserId();
  const tasks = await listWaiting(userId);
  return (
    <PageContainer>
      <PageHeader
        title="Waiting on"
        subtitle="Tasks that depend on someone else, soonest follow-up first."
      />
      <WaitingList tasks={tasks} />
    </PageContainer>
  );
}
