import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TemplatesView } from "@/components/templates/templates-view";
import { requireUserId } from "@/server/session";
import { listTemplates } from "@/server/templates";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const userId = await requireUserId();
  const templates = await listTemplates(userId);
  return (
    <PageContainer>
      <PageHeader
        title="Templates"
        subtitle="Start tasks and notes from a reusable checklist or note."
      />
      <TemplatesView templates={templates} />
    </PageContainer>
  );
}
