"use client";

import { useEffect } from "react";
import { QUEUE_KEY } from "@/lib/offline-queue";

/**
 * Shown on the sign-in pages. Arriving here means nobody is signed in, so the copies of private
 * pages kept for offline use and any unsent offline changes are removed from this device.
 */
export function ClearPrivateCache() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(QUEUE_KEY);
    } catch {
      /* storage unavailable */
    }
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
  }, []);
  return null;
}
