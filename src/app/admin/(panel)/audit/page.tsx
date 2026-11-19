import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { actionLabel, formatWhen, Pager } from "@/components/admin/admin-bits";
import { listAudit } from "@/server/admin";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Admin · Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const me = await requireUser();
  const data = await listAudit(me.id, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const th = "text-caption text-muted-strong px-4 py-3 text-left font-semibold whitespace-nowrap";
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every change an administrator makes is recorded here and cannot be edited."
      />
      <p className="text-body-sm text-muted-strong mb-3">
        Every change an administrator makes is recorded here and cannot be edited. {data.total}{" "}
        entries.
      </p>
      <div className="border-border bg-surface overflow-x-auto rounded-3xl border">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Audit log</caption>
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className={th}>
                When
              </th>
              <th scope="col" className={th}>
                Administrator
              </th>
              <th scope="col" className={th}>
                Action
              </th>
              <th scope="col" className={th}>
                Account
              </th>
              <th scope="col" className={th}>
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td className="text-muted-strong px-4 py-3 whitespace-nowrap">
                  {formatWhen(e.at, me.timezone)}
                </td>
                <td className="px-4 py-3 break-all">{e.adminEmail}</td>
                <td className="px-4 py-3 font-semibold">{actionLabel(e.action)}</td>
                <td className="px-4 py-3 break-all">{e.targetEmail ?? "—"}</td>
                <td className="text-muted-strong px-4 py-3">{e.detail ?? "—"}</td>
              </tr>
            ))}
            {data.entries.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-strong px-4 py-10 text-center">
                  Nothing recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} hrefFor={(p) => `/admin/audit?page=${p}`} />
    </div>
  );
}
