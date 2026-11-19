"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { adminLoginAction } from "@/server/actions";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await adminLoginAction({ email, password });
      if (!r.ok) return setError(r.error);
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <Label htmlFor="admin-email">Email</Label>
        <div className="relative">
          <Mail
            aria-hidden
            className="text-muted-strong pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          />
          <Input
            id="admin-email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-2xl pl-12"
            placeholder="admin@company.com"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="admin-password">Password</Label>
        <div className="relative">
          <Lock
            aria-hidden
            className="text-muted-strong pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
          />
          <Input
            id="admin-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-2xl pr-12 pl-12"
            placeholder="Your password"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
            className="text-muted-strong hover:text-foreground absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-xl"
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      <FieldError message={error} />
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in to admin"}
      </Button>
    </form>
  );
}
