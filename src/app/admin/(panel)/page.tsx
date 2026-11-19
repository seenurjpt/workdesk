import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { actionLabel, Badge, Card, formatWhen, Stat } from "@/components/admin/admin-bits";
import { getAdminOverview } from "@/server/admin";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const me = await requireUser();
  const o = await getAdminOverview(me.id);
  const max = Math.max(1, ...o.signups.map((d) => d.count));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Accounts and activity across the site. Counts only, never anyone's tasks or notes."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Users"
          value={o.users.total}
          hint={`${o.users.admins} admin${o.users.admins === 1 ? "" : "s"}`}
        />
        <Stat label="New this week" value={o.users.newThisWeek} />
        <Stat label="Active this week" value={o.users.activeThisWeek} hint="signed in" />
        <Stat label="Suspended" value={o.users.suspended} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Tasks" value={o.content.tasks} />
        <Stat label="Notes" value={o.content.notes} />
        <Stat label="Projects" value={o.content.projects} />
        <Stat label="Templates" value={o.content.templates} />
        <Stat label="In Trash" value={o.content.trashed} hint="tasks and notes" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Sign-ups, last 14 days">
          <div
            role="img"
            aria-label={`Sign-ups per day for the last 14 days: ${o.signups.map((d) => d.count).join(", ")}`}
            className="flex h-40 items-end gap-1.5"
          >
            {o.signups.map((d) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${d.day}: ${d.count}`}
              >
                <div
                  className="bg-accent rounded-t-md"
                  style={{
                    height: `${d.count === 0 ? 2 : Math.max(6, (d.count / max) * 100)}%`,
                    opacity: d.count === 0 ? 0.35 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="text-caption text-muted-strong mt-2 flex justify-between">
            <span>{o.signups[0]?.day}</span>
            <span>{o.signups.at(-1)?.day}</span>
          </div>
        </Card>

        <Card title="Sign-ups">
          <p className="text-body-sm">
            New accounts can be created:{" "}
            <Badge tone={o.registrationOpen ? "admin" : "suspended"}>
              {o.registrationOpen ? "Open" : "Closed"}
            </Badge>
          </p>
          <p className="text-caption text-muted-strong mt-3">
            Change this in{" "}
            <Link
              href="/admin/settings"
              className="text-accent-text font-semibold underline underline-offset-2"
            >
              Settings
            </Link>
            .
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Newest accounts">
          <ul className="divide-border divide-y">
            {o.recentUsers.map((u) => (
              <li key={u.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="hover:bg-surface-soft -mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-1 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-body-sm block truncate font-semibold">{u.name}</span>
                    <span className="text-caption text-muted-strong block truncate">{u.email}</span>
                  </span>
                  <span className="text-caption text-muted-strong shrink-0">
                    {formatWhen(u.createdAt, me.timezone)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/users"
            className="text-nav text-accent-text mt-3 inline-block font-semibold underline underline-offset-2"
          >
            All users
          </Link>
        </Card>
        <Card title="Recent admin activity">
          {o.recentActivity.length === 0 ? (
            <p className="text-body-sm text-muted-strong">Nothing yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {o.recentActivity.map((e) => (
                <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-body-sm font-semibold">
                    {actionLabel(e.action)}
                    {e.targetEmail && (
                      <span className="text-muted-strong font-normal"> · {e.targetEmail}</span>
                    )}
                  </p>
                  <p className="text-caption text-muted-strong">
                    {e.adminEmail} · {formatWhen(e.at, me.timezone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/audit"
            className="text-nav text-accent-text mt-3 inline-block font-semibold underline underline-offset-2"
          >
            Full audit log
          </Link>
        </Card>
      </div>
    </div>
  );
}
