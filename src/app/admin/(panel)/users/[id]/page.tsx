import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, formatWhen, Stat } from "@/components/admin/admin-bits";
import { UserActions } from "@/components/admin/user-actions";
import { getUserDetail } from "@/server/admin";
import { requireUser } from "@/server/session";
import { objectId } from "@/schemas";

export const metadata: Metadata = { title: "Admin · User" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const me = await requireUser();
  const u = await getUserDetail(me.id, id);
  if (!u) notFound();
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-2 py-2.5">
      <dt className="text-body-sm text-muted-strong">{k}</dt>
      <dd className="text-body-sm min-w-0 font-semibold break-words">{v}</dd>
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="User" subtitle="Account details and actions." />
      <Link href="/admin/users" className="text-nav text-muted-strong inline-block hover:underline">
        ← All users
      </Link>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading min-w-0 text-2xl font-bold break-words">{u.name}</h2>
          <Badge tone={u.role === "admin" ? "admin" : "neutral"}>
            {u.role === "admin" ? "Admin" : "User"}
          </Badge>
          {u.status === "suspended" && <Badge tone="suspended">Suspended</Badge>}
        </div>
        <p className="text-body-sm text-muted-strong mt-1 break-all">{u.email}</p>
        <dl className="divide-border mt-4 divide-y">
          {row("Joined", formatWhen(u.createdAt, me.timezone))}
          {row("Last sign-in", formatWhen(u.lastLoginAt, me.timezone))}
          {row("Timezone", u.timezone)}
          {row("Sign-in method", u.hasPassword ? "Password" : "Google only")}
          {u.status === "suspended" &&
            row(
              "Suspended",
              `${formatWhen(u.suspendedAt, me.timezone)}${u.suspendedReason ? ` — ${u.suspendedReason}` : ""}`,
            )}
        </dl>
      </Card>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Open tasks" value={u.openTasks} />
        <Stat label="Done tasks" value={u.doneTasks} />
        <Stat label="Notes" value={u.notes} />
        <Stat label="Projects" value={u.projects} />
      </div>
      <p className="text-caption text-muted-strong">
        Only counts are shown. Administrators cannot read anyone&apos;s tasks or notes.
      </p>
      <Card title="Actions">
        <UserActions
          id={u.id}
          email={u.email}
          role={u.role}
          status={u.status}
          isSelf={u.id === me.id}
        />
      </Card>
    </div>
  );
}
