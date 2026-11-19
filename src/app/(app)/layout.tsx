import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AppProvider } from "@/components/shared/user-context";
import { GlobalSearchHost, GlobalSearchProvider } from "@/components/shared/global-search";
import { OfflineProvider } from "@/components/shared/offline-provider";
import { ShortcutProvider } from "@/components/shared/keyboard-shortcuts";
import { QuickAddProvider } from "@/components/tasks/quick-add";
import { TaskEditorHost, TaskEditorProvider } from "@/components/tasks/task-editor-context";
import { Suspense } from "react";
import { OfflineCacheRecorder } from "@/components/shared/offline-cache-recorder";
import { OpenTaskFromUrl } from "@/components/reminders/open-task-from-url";
import { ReminderProvider } from "@/components/reminders/reminder-provider";
import { FocusMode } from "@/components/focus/focus-mode";
import { FocusProvider } from "@/components/focus/focus-provider";
import { getReminderBundle } from "@/server/reminders";
import { getActiveTimer } from "@/server/timer";
import { after } from "next/server";
import { getSidebarData } from "@/server/sidebar";
import { loadUserDoc, requireUser } from "@/server/session";
import { maybePurgeExpired, purgeDue } from "@/server/trash";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const doc = await loadUserDoc(user.id); // already read by requireUser, so this costs nothing
  // No cron: tidy the trash opportunistically, at most every few hours, after the page is sent so
  // it never delays the response.
  if (purgeDue(doc?.lastPurgeAt)) after(() => maybePurgeExpired(user.id));
  const [{ projects, tags, generalCount }, reminders, activeTimer] = await Promise.all([
    getSidebarData(user.id),
    getReminderBundle(user.id, new Date(), user),
    getActiveTimer(user.id, doc),
  ]);

  return (
    <AppProvider value={{ user, projects, tags, generalCount }}>
      <OfflineProvider>
        <TaskEditorProvider>
          <QuickAddProvider>
            <GlobalSearchProvider>
              <a
                href="#main"
                className="focus:bg-btn-primary focus:text-btn-primary-fg sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:px-4 focus:py-2"
              >
                Skip to content
              </a>
              <ReminderProvider bundle={reminders}>
                <Suspense>
                  <OpenTaskFromUrl />
                  <OfflineCacheRecorder />
                </Suspense>
                <FocusProvider initial={activeTimer}>
                  <ShortcutProvider>
                    <AppShell>{children}</AppShell>
                    <TaskEditorHost />
                    <GlobalSearchHost />
                    <FocusMode />
                  </ShortcutProvider>
                </FocusProvider>
              </ReminderProvider>
            </GlobalSearchProvider>
          </QuickAddProvider>
        </TaskEditorProvider>
      </OfflineProvider>
    </AppProvider>
  );
}
