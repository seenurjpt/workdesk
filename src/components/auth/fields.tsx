"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass =
  "h-12 w-full rounded-2xl border border-border bg-surface pr-4 pl-11 text-base text-foreground placeholder:text-muted-strong transition-colors duration-150 hover:border-muted-strong focus-visible:border-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger";

/** A labelled input with a leading icon. `trailing` is for things like a show/hide button. */
export const IconField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    icon: LucideIcon;
    error?: string;
    trailing?: React.ReactNode;
  }
>(({ label, icon: Icon, error, trailing, id, className, ...props }, ref) => {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-body-sm mb-1.5 block font-semibold">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="text-muted-strong pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(inputClass, trailing && "pr-12", className)}
          {...props}
        />
        {trailing && <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-caption text-danger mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
});
IconField.displayName = "IconField";

/** Password input with a show/hide button. */
export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof IconField>, "type" | "trailing" | "icon"> & { icon: LucideIcon }
>((props, ref) => {
  const [shown, setShown] = React.useState(false);
  return (
    <IconField
      ref={ref}
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="text-muted-strong hover:text-foreground hover:bg-surface-soft inline-flex size-9 items-center justify-center rounded-xl transition-colors duration-150"
        >
          {shown ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      }
    />
  );
});
PasswordField.displayName = "PasswordField";

const LEVELS = [
  { label: "Too short", color: "bg-danger" },
  { label: "Okay", color: "bg-warning" },
  { label: "Good", color: "bg-info" },
  { label: "Strong", color: "bg-success" },
] as const;

/** Advisory only: the only rule the server enforces is 8 characters. */
function score(pw: string): number {
  if (pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 10) s += 1;
  return Math.min(s, 3);
}

export function StrengthMeter({ password }: { password: string }) {
  if (!password) {
    return <p className="text-caption text-muted-strong mt-2">Use at least 8 characters.</p>;
  }
  const level = score(password);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i <= level ? LEVELS[level].color : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-caption text-muted-strong mt-1.5">
        Password strength:{" "}
        <span className="text-foreground font-semibold">{LEVELS[level].label}</span>
      </p>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-danger/40 bg-danger/10 text-body-sm flex items-start gap-2.5 rounded-2xl border px-4 py-3"
    >
      <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function SubmitLabel({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? busy : idle}
    </>
  );
}
