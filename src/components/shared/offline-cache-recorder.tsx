"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tells the service worker to keep a copy of each page you view, so recently viewed pages
 * (tasks, notes, boards) can be read when you are offline. Skipped when offline.
 */
export function OfflineCacheRecorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.onLine) return;
    const timer = setTimeout(() => {
      // wait for the page to settle, then ask the worker to save it
      navigator.serviceWorker.controller?.postMessage({
        type: "cache-url",
        url: pathname + (search ? `?${search}` : ""),
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [pathname, search]);

  return null;
}
