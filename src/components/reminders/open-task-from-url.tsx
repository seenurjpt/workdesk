"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReminders } from "./reminder-provider";

/** `?openTask=<id>` (from a notification click in a closed app) opens that task, then cleans the URL. */
export function OpenTaskFromUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { openTask } = useReminders();
  const taskId = params.get("openTask");

  useEffect(() => {
    if (!taskId) return;
    void openTask(taskId);
    router.replace(pathname);
  }, [taskId, openTask, pathname, router]);

  return null;
}
