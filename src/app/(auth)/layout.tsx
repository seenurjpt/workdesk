import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { TypingBar } from "@/components/landing/typing-bar";
import { Logo } from "@/components/layout/logo";
import { ClearPrivateCache } from "@/components/shared/clear-private-cache";
import { PublicThemeToggle } from "@/components/shared/public-theme-toggle";

const POINTS = [
  "Type a task the way you say it",
  "Notes linked to the work they came from",
  "Reminders, board, calendar and weekly review",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <ClearPrivateCache />

      <aside className="bg-band relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="lp-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_90%)] opacity-60"
        />
        <div
          aria-hidden
          className="lp-blob bg-accent/40 absolute -top-24 -left-24 size-[28rem] rounded-full blur-3xl"
        />
        <div
          aria-hidden
          className="lp-blob bg-info/20 absolute -right-24 bottom-0 size-[28rem] rounded-full blur-3xl [animation-delay:-6s]"
        />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Logo href="/" />
          <div>
            <h2 className="font-heading max-w-xl text-[52px] leading-[1.04] font-bold tracking-[-0.8px] xl:text-[60px]">
              Tasks and notes, one{" "}
              <span className="lp-mark box-decoration-clone px-1">calm desk</span>.
            </h2>
            <ul className="mt-8 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-3 text-lg font-light">
                  <span className="bg-accent text-on-accent inline-flex size-6 shrink-0 items-center justify-center rounded-full">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-10 max-w-xl">
              <TypingBar />
            </div>
          </div>
          <p className="text-caption text-muted-strong">Built for the office day</p>
        </div>
      </aside>

      <main className="relative flex flex-col px-5 py-5 sm:px-8">
        <header className="flex h-12 items-center justify-between gap-3">
          <Logo href="/" compactOnSmall className="lg:invisible" />
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-nav text-muted-strong hover:text-foreground hover:bg-surface-soft inline-flex h-10 items-center gap-1.5 rounded-full px-3 transition-colors duration-150"
            >
              <ArrowLeft className="size-4" aria-hidden /> Home
            </Link>
            <PublicThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="border-border bg-surface shadow-float w-full max-w-[26rem] rounded-[28px] border p-6 sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
