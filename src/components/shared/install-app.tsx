"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const subscribeDisplay = (cb: () => void) => {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** The body of the Install card: an Install button when the browser offers one, or a note. */
export function InstallApp() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const installed = useSyncExternalStore(
    subscribeDisplay,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <div className="space-y-4">
      {installed ? (
        <p className="text-body-sm">WorkDesk is installed on this device.</p>
      ) : event ? (
        <>
          <p className="text-body-sm text-muted-strong">
            Opens in its own window, works offline for recently viewed pages, and keeps reminders
            running in the background window.
          </p>
          <Button
            variant="accent"
            onClick={async () => {
              await event.prompt();
              setEvent(null);
            }}
          >
            <Download className="size-4" aria-hidden /> Install WorkDesk
          </Button>
        </>
      ) : (
        <p className="text-body-sm text-muted-strong">
          Your browser will offer to install WorkDesk from the address bar (or “Add to Home Screen”
          on a phone) once it has been used a little.
        </p>
      )}
    </div>
  );
}
