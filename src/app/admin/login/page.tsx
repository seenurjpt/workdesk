import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { Logo } from "@/components/layout/logo";
import { ClearPrivateCache } from "@/components/shared/clear-private-cache";
import { PublicThemeToggle } from "@/components/shared/public-theme-toggle";
import { auth } from "@/lib/auth";
import { assertAdmin } from "@/server/admin";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

/** The one place administrators sign in. Signed-in administrators go straight to the panel. */
export default async function AdminLoginPage() {
  const id = (await auth())?.user?.id;
  if (id) {
    const isAdmin = await assertAdmin(id).then(
      () => true,
      () => false,
    );
    if (isAdmin) redirect("/admin");
  }
  return (
    <main className="bg-band flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {!id && <ClearPrivateCache />}
      <div className="absolute top-4 right-4">
        <PublicThemeToggle />
      </div>
      <div className="mb-6">
        <Logo href="/" />
      </div>
      <div className="border-border bg-surface w-full max-w-md rounded-3xl border p-6 shadow-sm sm:p-8">
        <div className="bg-accent text-on-accent mb-4 grid size-12 place-items-center rounded-2xl">
          <ShieldCheck className="size-6" aria-hidden />
        </div>
        <h1 className="font-heading text-[32px] leading-[1.05] font-bold">Admin sign in</h1>
        <p className="text-body-sm text-muted-strong mt-2 mb-6">
          For administrators only. Everyone else signs in from the normal page.
        </p>
        <AdminLoginForm />
      </div>
      <p className="text-body-sm text-muted-strong mt-6">
        <Link href="/login" className="text-accent-text font-semibold hover:underline">
          ← Back to normal sign in
        </Link>
      </p>
    </main>
  );
}
