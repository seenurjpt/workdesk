"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, User } from "lucide-react";
import {
  FormError,
  IconField,
  PasswordField,
  StrengthMeter,
  SubmitLabel,
} from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { googleLoginAction, loginAction, registerAction } from "@/server/actions";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@/schemas";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.17a5.27 5.27 0 0 1-2.29 3.46v2.87h3.7C21.74 18.63 23 15.7 23 12.27Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.1 0 5.7-1.03 7.58-2.77l-3.7-2.87c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.78v2.96A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.24a6.9 6.9 0 0 1 0-4.48V6.8H1.78a11.5 11.5 0 0 0 0 10.4l3.82-2.96Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.04c1.69 0 3.2.58 4.39 1.72l3.29-3.29A11.04 11.04 0 0 0 12 .5 11.5 11.5 0 0 0 1.78 6.8L5.6 9.76C6.5 7.05 9.02 5.04 12 5.04Z"
      />
    </svg>
  );
}

function GoogleButton() {
  return (
    <form action={googleLoginAction}>
      <Button type="submit" variant="secondary" className="h-12 w-full gap-3 rounded-2xl">
        <GoogleIcon /> Continue with Google
      </Button>
    </form>
  );
}

function Divider() {
  return (
    <div className="text-caption text-muted-strong my-5 flex items-center gap-3" aria-hidden>
      <span className="bg-border h-px flex-1" />
      or
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

function Heading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mb-7">
      <p className="text-caption text-accent-text mb-2 font-semibold tracking-wide uppercase">
        {eyebrow}
      </p>
      <h1 className="font-heading text-[34px] leading-[1.05] font-bold tracking-[-0.5px] sm:text-[40px]">
        {title}
      </h1>
      <p className="text-muted-strong mt-2 font-light">{sub}</p>
    </div>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setError(null);
    const res = await loginAction(values);
    if (!res.ok) return setError(res.error);
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      <Heading eyebrow="Sign in" title="Welcome back" sub="Pick up where you left off." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <IconField
          id="email"
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          autoFocus
          error={errors.email?.message}
          {...register("email")}
        />
        <PasswordField
          id="password"
          label="Password"
          icon={Lock}
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register("password")}
        />
        <FormError message={error} />
        <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
          <SubmitLabel pending={isSubmitting} idle="Sign in" busy="Signing in…" />
        </Button>
      </form>
      {googleEnabled && (
        <>
          <Divider />
          <GoogleButton />
        </>
      )}
      <p className="text-body-sm text-muted-strong mt-7 text-center">
        New to WorkDesk?{" "}
        <Link href="/register" className="text-accent-text font-semibold hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const password = useWatch({ control, name: "password", defaultValue: "" });

  async function onSubmit(values: RegisterInput) {
    setError(null);
    const res = await registerAction(values);
    if (!res.ok) return setError(res.error);
    router.push("/today");
    router.refresh();
  }

  return (
    <div>
      <Heading
        eyebrow="Create account"
        title="Create your desk"
        sub="It takes under a minute. No card needed."
      />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <IconField
          id="name"
          label="Name"
          icon={User}
          autoComplete="name"
          placeholder="Your name"
          autoFocus
          error={errors.name?.message}
          {...register("name")}
        />
        <IconField
          id="email"
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <PasswordField
            id="password"
            label="Password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            {...register("password")}
          />
          <StrengthMeter password={password ?? ""} />
        </div>
        <FormError message={error} />
        <Button type="submit" variant="accent" className="h-12 w-full" disabled={isSubmitting}>
          <SubmitLabel pending={isSubmitting} idle="Create account" busy="Creating…" />
        </Button>
      </form>
      {googleEnabled && (
        <>
          <Divider />
          <GoogleButton />
        </>
      )}
      <p className="text-body-sm text-muted-strong mt-7 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-accent-text font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
