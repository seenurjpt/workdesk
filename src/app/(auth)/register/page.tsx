import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/shared/auth-forms";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { getRegistrationOpen } from "@/server/settings";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if ((await auth())?.user?.id) redirect("/today");
  if (!(await getRegistrationOpen())) {
    return (
      <div>
        <p className="text-caption text-muted-strong mb-2 font-semibold tracking-wide uppercase">
          Create account
        </p>
        <h1 className="font-heading text-3xl font-bold">Sign-ups are closed</h1>
        <p className="text-body-sm text-muted-strong mt-3">
          New accounts are not being accepted right now. Ask an administrator to add you.
        </p>
        <p className="text-body-sm text-muted-strong mt-7">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-text font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }
  return <RegisterForm googleEnabled={googleEnabled} />;
}
