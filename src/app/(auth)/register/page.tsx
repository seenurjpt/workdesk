import type { Metadata } from "next";
import { RegisterForm } from "@/components/shared/auth-forms";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if ((await auth())?.user?.id) redirect("/today");
  return <RegisterForm googleEnabled={googleEnabled} />;
}
