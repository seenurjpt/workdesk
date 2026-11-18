import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { BoardView } from "@/components/board/board-view";
import type { GroupBy } from "@/components/board/board-model";
import { requireUserId } from "@/server/session";
import { listBoardTasks } from "@/server/tasks";

export const metadata: Metadata = { title: "Board" };

const GROUPS: GroupBy[] = ["status", "project", "priority"];

export default async function BoardPage(props: PageProps<"/board">) {
  const raw = (await props.searchParams).group;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const group = GROUPS.find((g) => g === value) ?? "status";
  const userId = await requireUserId();
  const tasks = await listBoardTasks(userId);
  return (
    <PageContainer>
      <PageHeader
        title="Board"
        subtitle="Drag cards between columns, or use the ⋮ menu on a card."
      />
      <BoardView key={group} initial={tasks} group={group} />
    </PageContainer>
  );
}
