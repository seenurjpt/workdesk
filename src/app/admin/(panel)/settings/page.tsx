import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/admin/admin-bits";
import { PurgeTrash, RegistrationToggle } from "@/components/admin/settings-controls";
import { getRegistrationOpen } from "@/server/settings";
import { assertAdmin } from "@/server/admin";
import { requireAdminId } from "@/server/session";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const id = await requireAdminId();
  await assertAdmin(id);
  const open = await getRegistrationOpen();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Site-wide controls." />
      <Card title="Sign-ups">
        <RegistrationToggle open={open} />
      </Card>
      <Card title="Maintenance">
        <PurgeTrash />
      </Card>
    </div>
  );
}
