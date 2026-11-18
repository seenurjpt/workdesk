import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/layout/logo";

export const metadata: Metadata = { title: "Offline" };

// Static on purpose: the service worker keeps a copy to show when there is no connection.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-14" />
      <h1 className="text-page-title">You&apos;re offline</h1>
      <p className="text-muted-strong max-w-md text-lg font-light">
        This page isn&apos;t saved on your device yet. Pages you opened recently can still be read,
        and tasks you add or complete will sync when you&apos;re back online.
      </p>
      <Link
        href="/today"
        className="text-nav bg-btn-primary text-btn-primary-fg rounded-[28px] px-5 py-3"
      >
        Try Today
      </Link>
    </main>
  );
}
