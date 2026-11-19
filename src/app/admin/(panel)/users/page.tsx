import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { AddUserDialog } from "@/components/admin/add-user-dialog";
import { Badge, formatWhen, Pager } from "@/components/admin/admin-bits";
import { cn } from "@/lib/utils";
import { listUsers, type Role, type Status, type UserQuery } from "@/server/admin";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Admin · Users" };

type Search = { q?: string; role?: string; status?: string; sort?: string; page?: string };
const SORTS = ["newest", "oldest", "name", "active"] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const role = sp.role === "admin" || sp.role === "user" ? (sp.role as Role) : undefined;
  const status =
    sp.status === "active" || sp.status === "suspended" ? (sp.status as Status) : undefined;
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as UserQuery["sort"])
    : "newest";
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const data = await listUsers(me.id, { q, role, status, sort, page });

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, role, status, sort: sort === "newest" ? undefined : sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const pill = (active: boolean) =>
    cn(
      "text-nav inline-flex min-h-9 items-center rounded-full border px-3.5 transition-colors",
      active
        ? "bg-btn-primary text-btn-primary-fg border-transparent"
        : "border-border hover:bg-surface-soft",
    );
  const th = "text-caption text-muted-strong px-4 py-3 text-left font-semibold whitespace-nowrap";

  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle="Find, add and manage accounts." />
      <div className="flex flex-wrap items-center gap-3">
        <form
          action="/admin/users"
          method="get"
          role="search"
          className="flex min-w-0 flex-1 gap-2 sm:max-w-md"
        >
          {role && <input type="hidden" name="role" value={role} />}
          {status && <input type="hidden" name="status" value={status} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
          <input
            name="q"
            defaultValue={q}
            type="search"
            aria-label="Search users by name or email"
            placeholder="Search users"
            className="border-border bg-surface placeholder:text-muted-strong h-11 min-w-0 flex-1 rounded-2xl border px-4 text-base"
          />
          <button
            type="submit"
            className="text-nav border-border hover:bg-surface-soft h-11 rounded-2xl border px-4"
          >
            Search
          </button>
        </form>
        <div className="ml-auto">
          <AddUserDialog />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href({ role: undefined, status: undefined, page: undefined })}
          className={pill(!role && !status)}
        >
          All
        </Link>
        <Link
          href={href({ role: "admin", status: undefined, page: undefined })}
          className={pill(role === "admin")}
        >
          Admins
        </Link>
        <Link
          href={href({ role: undefined, status: "suspended", page: undefined })}
          className={pill(status === "suspended")}
        >
          Suspended
        </Link>
        <span className="text-caption text-muted-strong ml-auto" role="status">
          {data.total} {data.total === 1 ? "user" : "users"}
        </span>
      </div>

      <div className="border-border bg-surface overflow-x-auto rounded-3xl border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={th}>
                <Link
                  href={href({ sort: sort === "name" ? undefined : "name" })}
                  className="underline-offset-2 hover:underline"
                >
                  Name
                </Link>
              </th>
              <th scope="col" className={th}>
                Role
              </th>
              <th scope="col" className={th}>
                <Link
                  href={href({ sort: sort === "newest" ? "oldest" : undefined })}
                  className="underline-offset-2 hover:underline"
                >
                  Joined
                </Link>
              </th>
              <th scope="col" className={th}>
                <Link
                  href={href({ sort: "active" })}
                  className="underline-offset-2 hover:underline"
                >
                  Last sign-in
                </Link>
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Tasks
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {data.users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-soft">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="block min-w-0 font-semibold hover:underline"
                  >
                    {u.name}
                    <span className="text-caption text-muted-strong block font-normal">
                      {u.email}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={u.role === "admin" ? "admin" : "neutral"}>
                      {u.role === "admin" ? "Admin" : "User"}
                    </Badge>
                    {u.status === "suspended" && <Badge tone="suspended">Suspended</Badge>}
                  </span>
                </td>
                <td className="text-muted-strong px-4 py-3 whitespace-nowrap">
                  {formatWhen(u.createdAt, me.timezone)}
                </td>
                <td className="text-muted-strong px-4 py-3 whitespace-nowrap">
                  {formatWhen(u.lastLoginAt, me.timezone)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{u.tasks}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u.notes}</td>
              </tr>
            ))}
            {data.users.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-strong px-4 py-10 text-center">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} hrefFor={(p) => href({ page: String(p) })} />
    </div>
  );
}
