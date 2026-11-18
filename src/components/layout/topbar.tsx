"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, PanelLeft, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { useGlobalSearch } from "@/components/shared/global-search";
import { NotificationBell } from "@/components/reminders/notification-bell";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useApp } from "@/components/shared/user-context";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { QuickAddInput, useQuickAdd } from "@/components/tasks/quick-add";
import { logoutAction } from "@/server/actions";

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user } = useApp();
  const quickAdd = useQuickAdd();
  const globalSearch = useGlobalSearch();

  return (
    <header className="border-border bg-background sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 pb-px print:hidden">
      <Button
        variant="utility"
        size="iconSm"
        className="max-md:hidden"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <PanelLeft className="size-5" aria-hidden />
      </Button>
      <Logo compactOnSmall className="md:hidden" />

      <button
        type="button"
        onClick={globalSearch.open}
        aria-label="Search tasks and notes (Ctrl K)"
        className="border-border bg-surface-soft text-muted-strong hover:bg-surface hover:border-muted-strong hidden h-10 w-56 items-center gap-2 rounded-2xl border px-3.5 text-left text-sm transition-colors duration-150 lg:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1">Search</span>
        <kbd className="text-caption border-border rounded border px-1.5">Ctrl K</kbd>
      </button>

      <div className="mx-auto hidden w-full max-w-xl md:block">
        <QuickAddInput floatingPreview />
      </div>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <Button
          variant="utility"
          size="icon"
          className="lg:hidden"
          aria-label="Search tasks and notes"
          onClick={globalSearch.open}
        >
          <Search className="size-5" aria-hidden />
        </Button>
        <Button
          size="sm"
          className="max-[359px]:w-11 max-[359px]:px-0 md:hidden"
          onClick={quickAdd.open}
          aria-label="Quick add task (Q)"
        >
          <Plus className="size-4" aria-hidden />
          <span className="max-[359px]:sr-only">Add</span>
        </Button>
        <ConnectionStatus />
        <NotificationBell />
        <ThemeToggle />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Account menu"
            className="bg-surface-soft inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold hover:opacity-80 max-md:hidden"
          >
            {user.name.slice(0, 1).toUpperCase()}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="border-border bg-surface shadow-float z-50 min-w-48 rounded-xl border p-1"
            >
              <div className="px-3 py-2">
                <p className="text-nav truncate">{user.name}</p>
                <p className="text-caption text-muted-strong truncate">{user.email}</p>
              </div>
              <DropdownMenu.Separator className="bg-border my-1 h-px" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/settings"
                  className="text-nav data-[highlighted]:bg-surface-soft flex items-center gap-2 rounded-lg px-3 py-2 outline-none"
                >
                  <Settings className="size-4" aria-hidden /> Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => void logoutAction()}
                className="text-nav data-[highlighted]:bg-surface-soft flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none"
              >
                <LogOut className="size-4" aria-hidden /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
