"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  ClipboardCheck,
  Columns3,
  FileText,
  Hourglass,
  Inbox,
  LayoutTemplate,
  LogOut,
  MoreHorizontal,
  Plus,
  HelpCircle,
  History,
  Settings,
  Sun,
  Tag,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApp } from "@/components/shared/user-context";
import { useFocus } from "@/components/focus/focus-provider";
import { useQuickAdd } from "@/components/tasks/quick-add";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions";

const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Tasks", icon: Inbox },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();
  const { projects, tags } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  // The timer dock sits just above the tab bar, so the add button rides above it while it runs.
  const { timer } = useFocus();

  const onTab = TABS.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  // Anything that lives under "More" (board, projects, settings, ...) lights up the More tab.
  const moreActive = !onTab && !pathname.startsWith("/notes/");

  const tabClass = (active: boolean) =>
    cn(
      "group flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-[11px] leading-none font-semibold transition-colors duration-200 active:scale-95 motion-reduce:transition-none [@media(max-height:500px)]:min-h-12",
      active ? "text-foreground" : "text-muted-strong",
    );
  // The pill behind the icon is what shows the active tab.
  const pillClass = (active: boolean) =>
    cn(
      "inline-flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 motion-reduce:transition-none",
      active ? "bg-band text-accent-text" : "group-active:bg-surface-soft",
    );

  return (
    <>
      {!pathname.startsWith("/notes/") && (
        <button
          type="button"
          onClick={quickAdd.open}
          aria-label="Quick add task"
          className={cn(
            "bg-btn-primary text-btn-primary-fg shadow-float fixed right-4 z-40 inline-flex size-14 items-center justify-center rounded-full transition-[transform,bottom] duration-200 active:scale-95 md:hidden",
            // previous (before the timer dock): always "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
            timer
              ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
              : "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]",
          )}
        >
          <Plus className="size-6" aria-hidden />
        </button>
      )}

      <nav
        aria-label="Primary"
        className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] backdrop-blur-xl md:hidden print:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              <span className={pillClass(active)}>
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={tabClass(moreActive)}
        >
          <span className={pillClass(moreActive)}>
            <MoreHorizontal
              className="size-[22px]"
              strokeWidth={moreActive ? 2.4 : 2}
              aria-hidden
            />
          </span>
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="More" className="max-w-md">
          <div
            className="space-y-5"
            onClick={(e) =>
              e.target instanceof HTMLElement && e.target.closest("a") && setMoreOpen(false)
            }
          >
            <ul className="space-y-1">
              <li>
                <Link
                  href="/board"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <Columns3 className="size-5" aria-hidden /> Board
                </Link>
              </li>
              <li>
                <Link
                  href="/general"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <span
                    className="border-muted-strong mx-[3px] size-3.5 rounded-full border-2"
                    aria-hidden
                  />{" "}
                  General (no project)
                </Link>
              </li>
              <li>
                <Link
                  href="/waiting"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <Hourglass className="size-5" aria-hidden /> Waiting on
                </Link>
              </li>
              <li>
                <Link
                  href="/review"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <ClipboardCheck className="size-5" aria-hidden /> Review
                </Link>
              </li>
              <li>
                <Link
                  href="/templates"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <LayoutTemplate className="size-5" aria-hidden /> Templates
                </Link>
              </li>
              <li>
                <Link
                  href="/trash"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <Trash2 className="size-5" aria-hidden /> Trash
                </Link>
              </li>
              <li>
                <Link
                  href="/activity"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <History className="size-5" aria-hidden /> Activity
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <Settings className="size-5" aria-hidden /> Settings
                </Link>
              </li>
              <li>
                <Link
                  href="/help"
                  className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                >
                  <HelpCircle className="size-5" aria-hidden /> Help
                </Link>
              </li>
            </ul>
            {projects.length > 0 && (
              <section>
                <h3 className="text-caption text-muted-strong mb-1 px-3 font-semibold">Projects</h3>
                <ul>
                  {projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                          aria-hidden
                        />
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {tags.length > 0 && (
              <section>
                <h3 className="text-caption text-muted-strong mb-1 px-3 font-semibold">Tags</h3>
                <ul>
                  {tags.slice(0, 10).map(({ tag }) => (
                    <li key={tag}>
                      <Link
                        href={`/tags/${encodeURIComponent(tag)}`}
                        className="text-nav hover:bg-surface-soft flex min-h-11 items-center gap-3 rounded-xl px-3"
                      >
                        <Tag className="size-4" aria-hidden /> {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button
              type="button"
              onClick={() => void logoutAction()}
              className="text-nav hover:bg-surface-soft flex min-h-11 w-full items-center gap-3 rounded-xl px-3"
            >
              <LogOut className="size-5" aria-hidden /> Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
