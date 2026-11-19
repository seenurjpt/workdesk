"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminPurgeTrashAction, adminSetRegistrationAction } from "@/server/admin-actions";

export function RegistrationToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-body-sm max-w-md">
        {open
          ? "Anyone can create an account from the sign-up page."
          : "Sign-up is closed. Only administrators can add people (Admin → Users → Add user)."}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label="Allow new sign-ups"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await adminSetRegistrationAction({ open: !open });
            if (!r.ok) return void toast.error(r.error);
            toast.success(open ? "Sign-ups closed" : "Sign-ups opened");
            router.refresh();
          })
        }
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-60 ${open ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform duration-200 ${open ? "translate-x-6" : ""}`}
        />
      </button>
    </div>
  );
}

export function PurgeTrash() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="space-y-3">
      <p className="text-body-sm max-w-md">
        Trash is cleared per account when its owner uses the app. Run this to remove everything that
        has been in Trash for more than 30 days, for all accounts.
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await adminPurgeTrashAction();
            if (!r.ok) return void toast.error(r.error);
            setMsg(
              `${r.data.tasks} task${r.data.tasks === 1 ? "" : "s"} and ${r.data.notes} note${r.data.notes === 1 ? "" : "s"} removed`,
            );
            toast.success("Expired Trash purged");
            router.refresh();
          })
        }
      >
        {pending ? "Purging…" : "Purge expired Trash"}
      </Button>
      {msg && (
        <p className="text-caption text-muted-strong" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
