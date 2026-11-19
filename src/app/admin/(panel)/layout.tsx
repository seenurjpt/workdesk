import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminId } from "@/server/session";
import { requireUser } from "@/server/session";

/** Everything under /admin except the sign-in page: only active administrators get past this. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminId();
  const me = await requireUser();
  return <AdminShell email={me.email}>{children}</AdminShell>;
}
