import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/shared/settings-form";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(user.timezone)) timezones.unshift(user.timezone);
  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Profile, timezone and appearance." />
      <SettingsForm user={user} timezones={timezones} />
    </PageContainer>
  );
}
