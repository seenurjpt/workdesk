import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TrashList } from "@/components/trash/trash-list";
import { requireUserId } from "@/server/session";
import { listTrash, purgeExpired } from "@/server/trash";

export const metadata: Metadata = { title: "Trash" };

export default async function TrashPage() {
  const userId = await requireUserId();
  // Remove anything past 30 days first, so the list never shows items that are already due to go.
  await purgeExpired(userId);
  const items = await listTrash(userId);
  return (
    <PageContainer>
      <PageHeader
        title="Trash"
        subtitle="Restore anything you deleted by mistake. Items are removed for good after 30 days."
      />
      <TrashList items={items} />
    </PageContainer>
  );
}
