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
import { maybePurgeExpired } from "@/server/trash";
import { listProjects } from "@/server/projects";
import { requireUser } from "@/server/session";
import { countGeneralTasks, listTagCounts } from "@/server/tasks";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // No cron: tidy the trash opportunistically, at most every few hours.
  await maybePurgeExpired(user.id);
  const [projects, tags, reminders, generalCount, activeTimer] = await Promise.all([
    listProjects(user.id),
    listTagCounts(user.id),
    getReminderBundle(user.id),
    countGeneralTasks(user.id),
    getActiveTimer(user.id),
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
