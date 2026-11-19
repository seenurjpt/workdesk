"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  adminDeleteUserAction,
  adminResetPasswordAction,
  adminSetRoleAction,
  adminSetStatusAction,
} from "@/server/admin-actions";
import { PasswordReveal } from "./password-reveal";

type Dlg = null | "suspend" | "reset" | "delete" | "password";

export function UserActions({
  id,
  email,
  role,
  status,
  isSelf,
}: {
  id: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  const close = () => {
    setDlg(null);
    setReason("");
    setConfirm("");
    setError(undefined);
    setPassword("");
  };

  function run(
    fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>,
    done: string,
    after?: () => void,
  ) {
    setError(undefined);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(done);
      if (after) after();
      else close();
      router.refresh();
    });
  }

  const selfNote = "You cannot do this to your own account.";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isSelf}
            title={isSelf ? selfNote : undefined}
            onClick={() => setDlg("suspend")}
          >
            Suspend
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => adminSetStatusAction({ id, status: "active" }), "Account reactivated")
            }
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={isSelf || pending}
          title={isSelf ? selfNote : undefined}
          onClick={() =>
            run(
              () => adminSetRoleAction({ id, role: role === "admin" ? "user" : "admin" }),
              role === "admin" ? "Administrator rights removed" : "Now an administrator",
            )
          }
        >
          {role === "admin" ? "Remove admin rights" : "Make administrator"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDlg("reset")}>
          Reset password
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={isSelf}
          title={isSelf ? selfNote : undefined}
          onClick={() => setDlg("delete")}
        >
          Delete account
        </Button>
      </div>
      {isSelf && (
        <p className="text-caption text-muted-strong">
          This is you, so suspending, demoting and deleting are switched off.
        </p>
      )}

      <Dialog open={dlg === "suspend"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title="Suspend this account?"
          description={`${email} will be signed out within a minute and cannot sign in until reactivated. Nothing is deleted.`}
          className="max-w-md"
        >
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Reason (optional, only admins see it)</Label>
            <Input
              id="suspend-reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <FieldError message={error} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => adminSetStatusAction({ id, status: "suspended", reason }),
                  "Account suspended",
                )
              }
            >
              Suspend
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "reset"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title="Reset password?"
          description={`This replaces the password for ${email} with a new random one that you will see once. Their old password stops working immediately.`}
          className="max-w-md"
        >
          <FieldError message={error} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(undefined);
                  const r = await adminResetPasswordAction({ id });
                  if (!r.ok) return setError(r.error);
                  setPassword(r.data.password);
                  setDlg("password");
                  router.refresh();
                })
              }
            >
              Reset password
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "password"} onOpenChange={(o) => !o && close()}>
        <DialogContent title="New password" className="max-w-md">
          <PasswordReveal email={email} password={password} />
          <div className="mt-4 flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "delete"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title="Delete this account?"
          description="This permanently removes the account and all of its tasks, notes, projects and templates. It cannot be undone."
          className="max-w-md"
        >
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <span className="break-all">{email}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <FieldError message={error} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() =>
                run(
                  () => adminDeleteUserAction({ id, confirmEmail: confirm }),
                  "Account deleted",
                  () => router.push("/admin/users"),
                )
              }
            >
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
