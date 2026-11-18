import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Check,
  CalendarDays,
  Download,
  Keyboard,
  Link2,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LandingNav } from "@/components/landing/landing-nav";
import { Bento } from "@/components/landing/bento";
import { ProductPreview } from "@/components/landing/product-preview";
import { Reveal } from "@/components/landing/reveal";
import { TryIt } from "@/components/landing/try-it";
import { TypingBar } from "@/components/landing/typing-bar";
import { ClearPrivateCache } from "@/components/shared/clear-private-cache";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: { absolute: "WorkDesk · Tasks and notes for your workday" },
  description:
    "One calm desk for your tasks, notes and meeting notes. Capture in seconds, link everything together and start every day with a plan.",
  alternates: { canonical: "/" },
};

const TICKER = [
  "Quick add in 3 seconds",
  "Notes linked to tasks",
  "Meeting notes to action items",
  "Board and calendar",
  "Reminders in your browser",
  "Focus timer",
  "Works offline",
  "Weekly review",
];

const STEPS = [
  [
    "Capture",
    "Add it the moment it comes up. A shortcut, the top bar or a calendar click, whichever is nearest.",
  ],
  ["Plan", "Open All or Today. Overdue work, today and what is next are already grouped for you."],
  ["Review", "Carry over, reschedule or drop what slipped, and close the day with a clear head."],
] as const;

const KEYS: [string[], string][] = [
  [["Q"], "Quick add"],
  [["N"], "New note"],
  [["Ctrl", "K"], "Command palette"],
  [["G", "T"], "Go to Today"],
  [["?"], "All shortcuts"],
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="text-caption border-border bg-surface min-w-6 rounded-md border px-1.5 py-0.5 text-center font-semibold">
      {children}
    </kbd>
  );
}

export default async function LandingPage() {
  if ((await auth())?.user?.id) redirect("/today");

  return (
    <div className="min-h-dvh">
      <ClearPrivateCache />
      <a
        href="#main"
        className="bg-btn-primary text-btn-primary-fg sr-only z-50 rounded-xl px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <section className="bg-band relative overflow-hidden">
          <div
            aria-hidden
            className="lp-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)] opacity-60"
          />
          <div
            aria-hidden
            className="lp-blob bg-accent/40 absolute -top-24 -left-24 size-96 rounded-full blur-3xl"
          />
          <div
            aria-hidden
            className="lp-blob bg-info/20 absolute top-40 -right-24 size-96 rounded-full blur-3xl [animation-delay:-6s]"
          />

          {/* Top padding includes the 65px the floating navbar covers. */}
          <div className="relative mx-auto w-full max-w-[1200px] px-4 pt-[7.5rem] text-center md:px-8 md:pt-[10.5rem]">
            <p className="text-caption border-border bg-surface/80 mx-auto mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-semibold">
              <span className="bg-accent size-2 rounded-full" /> Tasks · Notes · Meeting notes
            </p>
            <h1 className="font-heading mx-auto max-w-4xl text-[44px] leading-[1.02] font-bold tracking-[-1px] sm:text-[76px]">
              Your whole workday, on one{" "}
              <span className="lp-mark box-decoration-clone px-1">calm desk</span>.
            </h1>
            <p className="text-muted-strong mx-auto mt-6 max-w-xl text-lg font-light">
              Say it like you would to a colleague. WorkDesk turns it into a dated, tagged task and
              keeps your notes linked to the work they came from.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                variant="accent"
                className="px-7 shadow-[0_8px_24px_-8px_var(--accent)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Link href="/register">
                  Create your account <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="bg-surface px-7">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>

            <div className="mt-12">
              <TypingBar />
            </div>

            <div className="relative mx-auto mt-10 max-w-4xl">
              <div
                aria-hidden
                className="lp-float bg-surface border-border shadow-float absolute -top-6 -left-4 z-10 hidden items-center gap-3 rounded-2xl border px-4 py-3 text-left lg:flex"
                style={{ "--r": "-4deg" } as React.CSSProperties}
              >
                <span className="bg-warning/20 text-warning inline-flex size-9 items-center justify-center rounded-xl">
                  <Bell className="size-4" />
                </span>
                <span>
                  <span className="text-body-sm block font-semibold">Send Q4 report</span>
                  <span className="text-caption text-muted-strong">Due in 15 minutes</span>
                </span>
              </div>
              <div
                aria-hidden
                className="lp-float bg-surface border-border shadow-float absolute top-1/3 -right-6 z-10 hidden items-center gap-3 rounded-2xl border px-4 py-3 text-left [animation-delay:-2s] lg:flex"
                style={{ "--r": "3deg" } as React.CSSProperties}
              >
                <span className="bg-accent text-on-accent inline-flex size-9 items-center justify-center rounded-xl">
                  <Check className="size-4" strokeWidth={3} />
                </span>
                <span>
                  <span className="text-body-sm block font-semibold">Task completed</span>
                  <span className="text-caption text-accent-text font-semibold">Undo</span>
                </span>
              </div>
              <ProductPreview className="rounded-b-none border-b-0" />
            </div>
          </div>
        </section>

        <div aria-hidden className="lp-marquee-wrap bg-ticker text-ticker-fg overflow-hidden py-4">
          <div className="lp-marquee flex w-max gap-10 pr-10">
            {[0, 1].map((k) => (
              <ul key={k} className="flex shrink-0 gap-10">
                {TICKER.map((t) => (
                  <li
                    key={t}
                    className="font-heading flex items-center gap-10 text-lg font-bold whitespace-nowrap"
                  >
                    {t}
                    <span className="bg-accent size-2 rounded-full" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <section
          aria-labelledby="quick-heading"
          className="mx-auto w-full max-w-[1200px] px-4 py-24 md:px-8"
        >
          <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <h2
                id="quick-heading"
                className="font-heading text-[30px] leading-tight font-bold min-[400px]:text-[36px] sm:text-[52px]"
              >
                Write it the way{" "}
                <span className="lp-mark box-decoration-clone px-1 whitespace-nowrap">
                  you say it
                </span>
                .
              </h2>
              <p className="text-muted-strong mt-5 max-w-md text-lg font-light">
                No forms and no date pickers. Dates, times, projects, tags, priority, repeats,
                reminders and who you are waiting on, all from one sentence.
              </p>
              <p className="text-caption text-muted-strong mt-4">
                This box runs the same parser as the app, right in your browser.
              </p>
            </Reveal>
            <Reveal delay={100}>
              <TryIt />
            </Reveal>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          className="bg-surface-soft/60 scroll-mt-16 py-24"
        >
          <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
            <Reveal>
              <h2
                id="features-heading"
                className="font-heading max-w-2xl text-[30px] leading-tight font-bold min-[400px]:text-[36px] sm:text-[52px]"
              >
                Everything a working day asks of you.
              </h2>
            </Reveal>
            <div className="mt-12">
              <Bento />
            </div>
          </div>
        </section>

        <section
          id="how"
          aria-labelledby="how-heading"
          className="mx-auto w-full max-w-[1200px] scroll-mt-16 px-4 py-20 md:px-8"
        >
          <h2
            id="how-heading"
            className="font-heading text-[34px] leading-tight font-bold sm:text-[44px]"
          >
            A day in three moves.
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="border-border border-t pt-5">
                <span className="font-heading text-accent-text text-[40px] leading-none font-bold">
                  {i + 1}
                </span>
                <h3 className="font-heading mt-3 text-2xl font-bold">{title}</h3>
                <p className="text-body-sm text-muted-strong mt-2 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="keyboard"
          aria-labelledby="keys-heading"
          className="bg-band scroll-mt-16 py-20"
        >
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 md:px-8 lg:grid-cols-2">
            <div>
              <h2
                id="keys-heading"
                className="font-heading text-[34px] leading-tight font-bold sm:text-[44px]"
              >
                Built for the keyboard, kind to the mouse.
              </h2>
              <p className="text-muted-strong mt-4 max-w-md text-lg font-light">
                Add, jump, search and triage without leaving the home row. Prefer clicking? Every
                action has a button too, and it works on your phone.
              </p>
            </div>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              {KEYS.map(([keys, label]) => (
                <li
                  key={label}
                  className="border-border bg-surface flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                >
                  <span className="text-body-sm font-semibold">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="trust-heading"
          className="mx-auto w-full max-w-[1200px] px-4 py-20 md:px-8"
        >
          <h2
            id="trust-heading"
            className="font-heading max-w-2xl text-[34px] leading-tight font-bold sm:text-[44px]"
          >
            Quiet by design, and your data stays yours.
          </h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                Bell,
                "Reminders in your browser",
                "Notifications and a soft chime while WorkDesk is open. No email, no push, no noise.",
              ],
              [
                WifiOff,
                "Works offline",
                "Install it as an app. Pages you have opened stay readable, and added or completed tasks sync later.",
              ],
              [
                Link2,
                "Everything connected",
                "Paste a link, including Jira and Confluence, and it attaches to the task.",
              ],
              [
                Download,
                "Take it with you",
                "Export all your data as JSON, tasks as CSV and notes as Markdown at any time.",
              ],
            ].map(([Icon, title, body]) => {
              const I = Icon as LucideIcon;
              return (
                <li key={title as string} className="border-border rounded-3xl border p-6">
                  <I className="text-accent-text mb-3 size-6" aria-hidden />
                  <h3 className="font-heading text-xl font-bold">{title as string}</h3>
                  <p className="text-body-sm text-muted-strong mt-2 leading-relaxed">
                    {body as string}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="px-4 pb-20 md:px-8">
          <div className="bg-ticker text-ticker-fg mx-auto max-w-[1200px] rounded-[36px] px-6 py-14 text-center sm:py-20">
            <CalendarDays className="mx-auto mb-4 size-8" aria-hidden />
            <h2 className="font-heading mx-auto max-w-2xl text-[34px] leading-tight font-bold sm:text-[48px]">
              Start tomorrow with a plan.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg font-light opacity-80">
              Make an account, add your first task, and see your day at a glance.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild variant="accent" className="px-7">
                <Link href="/register">
                  Create your account <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Link
                href="/login"
                className="text-nav inline-flex h-11 items-center rounded-[28px] px-6 underline underline-offset-4 hover:opacity-80"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 md:px-8">
          <Logo href="/" />
          <span className="text-caption text-muted-strong flex items-center gap-1.5">
            <Keyboard className="size-4" aria-hidden /> Press ? inside the app for shortcuts
          </span>
          <nav aria-label="Account" className="text-nav ml-auto flex gap-5">
            <Link href="/login" className="hover:underline">
              Sign in
            </Link>
            <Link href="/register" className="hover:underline">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
