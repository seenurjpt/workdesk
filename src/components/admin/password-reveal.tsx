"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shows a one-time password with a Copy button. It is not stored anywhere after this closes. */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the password is selectable */
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-body-sm">
        Temporary password for <strong className="break-all">{email}</strong>. It is shown{" "}
        <strong>only once</strong>: copy it now and send it to them privately.
      </p>
      <div className="border-border bg-surface-soft flex items-center gap-2 rounded-2xl border p-2 pl-4">
        <code
          className="min-w-0 flex-1 font-mono text-base break-all select-all"
          data-testid="one-time-password"
        >
          {password}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void copy()}
          aria-label="Copy password"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
