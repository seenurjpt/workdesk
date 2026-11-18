import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/shared/auth-forms";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if ((await auth())?.user?.id) redirect("/today");
  return (
    <Suspense>
      <LoginForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}
