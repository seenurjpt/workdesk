import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-surface shadow-float mx-auto my-12 max-w-xl rounded-[40px] rounded-br-xl border p-8 text-center sm:p-12">
      <h2 className="font-heading text-3xl font-bold">{title}</h2>
      <p className="text-muted-strong mt-3 mb-6 text-lg font-light">{body}</p>
      {action}
    </div>
  );
}
