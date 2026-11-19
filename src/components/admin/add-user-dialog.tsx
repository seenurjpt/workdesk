"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { adminCreateUserAction } from "@/server/admin-actions";
import { PasswordReveal } from "./password-reveal";

export function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ email: string; password: string; id: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setAdmin(false);
    setError(undefined);
    setCreated(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await adminCreateUserAction({ name, email, role: admin ? "admin" : "user" });
      if (!r.ok) return setError(r.error);
      setCreated({ email: email.trim().toLowerCase(), password: r.data.password, id: r.data.id });
      toast.success("Account created");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          <UserPlus className="size-4" /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent
        title={created ? "Account created" : "Add a user"}
        description={created ? undefined : "They get a temporary password to sign in with."}
        className="max-w-md"
      >
        {created ? (
          <div className="space-y-4">
            <PasswordReveal email={created.email} password={created.password} />
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <label className="text-body-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={admin}
                onChange={(e) => setAdmin(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              Make this person an administrator
            </label>
            <FieldError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
