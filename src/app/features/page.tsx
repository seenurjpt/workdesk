import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Command,
  Info,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  ShieldCheck,
  Smartphone,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LandingNav, type NavItem } from "@/components/landing/landing-nav";
import { Reveal } from "@/components/landing/reveal";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { FEATURE_SECTIONS, LIMITS, type FeatureItem, type IconName } from "@/lib/features-content";
import { QUICK_ADD_SYNTAX } from "@/lib/quick-add-syntax";
import { SHORTCUTS } from "@/lib/shortcuts";

export const metadata: Metadata = {
  title: { absolute: "All features · WorkDesk" },
  description:
    "Every WorkDesk feature in plain words: quick add, tasks, board, calendar, notes, meeting notes, reminders, focus timer, shortcuts, offline use and exports. Read it all before you sign up.",
  alternates: { canonical: "/features" },
};

const ICONS: Record<IconName, LucideIcon> = {
  zap: Zap,
  tasks: ListChecks,
  layout: LayoutDashboard,
  notes: NotebookPen,
  bell: BellRing,
  command: Command,
  phone: Smartphone,
  shield: ShieldCheck,
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview" },
  { id: "quick-add", href: "#quick-add", label: "Quick add" },
  { id: "shortcuts", href: "#shortcuts", label: "Shortcuts" },
  { id: "good-to-know", href: "#good-to-know", label: "Good to know" },
];

const TOTAL = FEATURE_SECTIONS.reduce((n, s) => n + s.items.length, 0);

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="text-caption border-border bg-surface min-w-6 rounded-md border px-1.5 py-0.5 text-center font-semibold">
      {children}
    </kbd>
  );
}

function FeatureCard({ item }: { item: FeatureItem }) {
  return (
    <li className="border-border bg-surface hover:border-muted-strong rounded-3xl border p-5 transition-colors duration-150">
      <h3 className="font-heading text-lg leading-snug font-bold">{item.title}</h3>
      <p className="text-body-sm text-muted-strong mt-2 leading-relaxed">{item.body}</p>
      {item.chips && (
        <p className="mt-3 flex flex-wrap gap-2">
          {item.chips.map((c) => (
            <code
              key={c}
              className="bg-band text-caption rounded-full px-2.5 py-1 font-semibold break-words"
            >
              {c}
            </code>
          ))}
        </p>
      )}
    </li>
  );
}

export default function FeaturesPage() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="bg-btn-primary text-btn-primary-fg sr-only z-50 rounded-xl px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <LandingNav links={NAV} />

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
          <div className="relative mx-auto w-full max-w-[1200px] px-4 pt-[7.5rem] pb-14 md:px-8 md:pt-[9.5rem] md:pb-20">
            <p className="text-caption text-accent-text mb-4 font-semibold tracking-wide uppercase">
              All features
            </p>
            <h1 className="font-heading max-w-3xl text-[42px] leading-[1.05] font-bold tracking-[-1px] sm:text-[64px]">
              Everything WorkDesk does, in plain words.
            </h1>
            <p className="text-muted-strong mt-6 max-w-2xl text-lg font-light">
              {TOTAL} features, the keyboard shortcuts and the limits, all written down so you know
              exactly what you are getting before you create an account. Nothing here needs you to
              sign in.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" className="px-7">
                <Link href="/register">
                  Create your account <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="bg-surface px-7">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>

            <nav aria-label="Jump to a topic" className="mt-10 flex flex-wrap gap-2">
              {[
                ...FEATURE_SECTIONS.map((s) => ({ id: s.id, label: s.title, icon: s.icon })),
                { id: "quick-add", label: "Quick add syntax", icon: "zap" as IconName },
                { id: "shortcuts", label: "Shortcuts", icon: "command" as IconName },
                { id: "good-to-know", label: "Good to know", icon: "shield" as IconName },
              ].map(({ id, label, icon }) => {
                const Icon = ICONS[icon];
                return (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="text-nav border-border bg-surface hover:border-muted-strong hover:bg-surface-soft inline-flex min-h-10 items-center gap-2 rounded-full border px-4 transition-colors duration-150"
                  >
                    <Icon className="size-4" aria-hidden /> {label}
                  </a>
                );
              })}
            </nav>
          </div>
        </section>

        {FEATURE_SECTIONS.map((section, i) => {
          const Icon = ICONS[section.icon];
          return (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className={`scroll-mt-20 py-16 md:py-20 ${i % 2 === 1 ? "bg-surface-soft/60" : ""}`}
            >
              <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
                <Reveal>
                  <div className="flex items-start gap-4">
                    <span className="bg-band inline-flex size-12 shrink-0 items-center justify-center rounded-2xl">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <div>
                      <h2
                        id={`${section.id}-title`}
                        className="font-heading text-[30px] leading-tight font-bold sm:text-[40px]"
                      >
                        {section.title}
                      </h2>
                      <p className="text-muted-strong mt-2 max-w-2xl text-lg font-light">
                        {section.intro}
                      </p>
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <ul className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
                    {section.items.map((item) => (
                      <FeatureCard key={item.title} item={item} />
                    ))}
                  </ul>
                </Reveal>
              </div>
            </section>
          );
        })}

        <section
          id="quick-add"
          aria-labelledby="quick-add-title"
          className="bg-band scroll-mt-20 py-16 md:py-20"
        >
          <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
            <h2
              id="quick-add-title"
              className="font-heading text-[30px] leading-tight font-bold sm:text-[40px]"
            >
              Quick add syntax
            </h2>
            <p className="text-muted-strong mt-2 max-w-2xl text-lg font-light">
              Everything is optional and the order does not matter. A live preview shows what it
              understood before you press Enter.
            </p>
            <p className="bg-surface border-border mt-6 max-w-3xl rounded-2xl border px-4 py-3 text-base font-semibold break-words">
              Send report tomorrow 5pm #clientA @report !high every monday wait:Priya remind:15m
            </p>
            <div className="border-border bg-surface mt-6 overflow-x-auto rounded-3xl border">
              <table className="w-full min-w-[620px] text-left">
                <caption className="sr-only">Quick add syntax</caption>
                <thead className="bg-surface-soft text-caption text-muted-strong">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      What it does
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Example
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {QUICK_ADD_SYNTAX.map((row) => (
                    <tr key={row.token} className="border-border border-t align-top">
                      <td className="text-body-sm px-4 py-3">
                        <code className="bg-surface-soft rounded-md px-1.5 py-0.5 font-semibold">
                          {row.token}
                        </code>
                      </td>
                      <td className="text-body-sm px-4 py-3">{row.meaning}</td>
                      <td className="text-body-sm text-muted-strong px-4 py-3">{row.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section
          id="shortcuts"
          aria-labelledby="shortcuts-title"
          className="scroll-mt-20 py-16 md:py-20"
        >
          <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
            <h2
              id="shortcuts-title"
              className="font-heading text-[30px] leading-tight font-bold sm:text-[40px]"
            >
              Keyboard shortcuts
            </h2>
            <p className="text-muted-strong mt-2 max-w-2xl text-lg font-light">
              They work when you are not typing in a field. Press <Kbd>?</Kbd> inside the app to see
              this list any time.
            </p>
            <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
              {SHORTCUTS.map((group) => (
                <div key={group.group} className="border-border bg-surface rounded-3xl border p-5">
                  <h3 className="font-heading text-lg font-bold">{group.group}</h3>
                  <ul className="mt-3 space-y-2.5">
                    {group.items.map((item) => (
                      <li
                        key={item.label}
                        className="text-body-sm flex items-center justify-between gap-4"
                      >
                        <span>{item.label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {item.keys.map((k, idx) => (
                            <span key={idx} className="flex items-center gap-1">
                              {idx > 0 && group.group === "Go to" && (
                                <span className="text-caption text-muted-strong">then</span>
                              )}
                              <Kbd>{k}</Kbd>
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="good-to-know"
          aria-labelledby="good-to-know-title"
          className="bg-surface-soft/60 scroll-mt-20 py-16 md:py-20"
        >
          <div className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
            <div className="flex items-start gap-4">
              <span className="bg-band inline-flex size-12 shrink-0 items-center justify-center rounded-2xl">
                <Info className="size-6" aria-hidden />
              </span>
              <div>
                <h2
                  id="good-to-know-title"
                  className="font-heading text-[30px] leading-tight font-bold sm:text-[40px]"
                >
                  Good to know
                </h2>
                <p className="text-muted-strong mt-2 max-w-2xl text-lg font-light">
                  What WorkDesk does not do, or only does within limits, so there are no surprises.
                </p>
              </div>
            </div>
            <ul className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {LIMITS.map((item) => (
                <FeatureCard key={item.title} item={item} />
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-16 md:px-8 md:py-20">
          <div className="bg-ticker text-ticker-fg mx-auto max-w-[1200px] rounded-[36px] px-6 py-14 text-center sm:py-20">
            <h2 className="font-heading mx-auto max-w-2xl text-[34px] leading-tight font-bold sm:text-[48px]">
              Like what you read?
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
          <nav aria-label="Footer" className="text-nav ml-auto flex flex-wrap gap-5">
            <Link href="/" className="hover:underline">
              Home
            </Link>
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
