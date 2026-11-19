"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  Clock,
  Database,
  Download,
  ListChecks,
  LogOut,
  Palette,
  User,
  Volume1,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDivider, SettingsCard } from "@/components/shared/settings-card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ElasticSlider } from "@/components/ui/elastic-slider";
import { useThemeChoice } from "@/components/shared/theme-toggle";
import { InstallApp } from "@/components/shared/install-app";
import { StatusManager } from "@/components/statuses/status-manager";
import { useReminders } from "@/components/reminders/reminder-provider";
import type { ReminderPrefs } from "@/lib/reminders";
import { TONES, playTone, type Tone } from "@/lib/sound";
import type { UserSettingsDTO } from "@/lib/types";
import { logoutAction, updateSettingsAction } from "@/server/actions";

export function SettingsForm({ user, timezones }: { user: UserSettingsDTO; timezones: string[] }) {
  const router = useRouter();
  const { theme, choose } = useThemeChoice();
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(user.weekStartsOn);
  const [workStart, setWorkStart] = useState(user.workHours.start);
  const [workEnd, setWorkEnd] = useState(user.workHours.end);
  const [prefs, setPrefs] = useState<ReminderPrefs>(user.reminderPrefs);
  const [busy, setBusy] = useState(false);
  const { permission, requestPermission, sendTest } = useReminders();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await updateSettingsAction({
      name,
      timezone,
      weekStartsOn,
      workHours: { start: workStart, end: workEnd },
      reminderPrefs: prefs,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Settings saved");
    router.refresh();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <form onSubmit={save} className="space-y-6">
        <SettingsCard
          id="profile"
          icon={User}
          title="Profile"
          description="Your name, and the timezone and week your dates use."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="s-name">Name</Label>
              <Input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" value={user.email} readOnly disabled />
            </div>
            <div>
              <Label htmlFor="s-tz">Timezone</Label>
              <Select id="s-tz" value={timezone} onValueChange={setTimezone}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-week">Week starts on</Label>
              <Select
                id="s-week"
                value={weekStartsOn}
                onValueChange={(v) => setWeekStartsOn(v === "0" ? 0 : 1)}
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </Select>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          id="notifications"
          icon={Clock}
          title="Work hours and reminders"
          description="When your day starts and how reminders behave."
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="s-work-start">Work starts</Label>
              <Input
                id="s-work-start"
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="s-work-end">Work ends</Label>
              <Input
                id="s-work-end"
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <p className="text-caption text-muted-strong">
            All-day tasks remind you when work starts, and &ldquo;Tomorrow&rdquo; snoozes to that
            time.
          </p>
          <CardDivider />
          <div className="grid items-start gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="s-default-reminder">Default reminder for timed tasks</Label>
              <Select
                id="s-default-reminder"
                value={prefs.defaultOffsetMin === null ? "none" : String(prefs.defaultOffsetMin)}
                onValueChange={(v) =>
                  setPrefs({
                    ...prefs,
                    defaultOffsetMin: v === "none" ? null : Number(v),
                  })
                }
              >
                <option value="none">No automatic reminder</option>
                <option value="0">At due time</option>
                <option value="5">5 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </Select>
            </div>
            <div>
              <label className="text-body-sm flex items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--accent)]"
                  checked={prefs.quietHours.enabled}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      quietHours: { ...prefs.quietHours, enabled: e.target.checked },
                    })
                  }
                />
                Quiet hours (hold reminders until they end)
              </label>
              {prefs.quietHours.enabled && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="s-quiet-start">From</Label>
                    <Input
                      id="s-quiet-start"
                      type="time"
                      value={prefs.quietHours.start}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          quietHours: { ...prefs.quietHours, start: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="s-quiet-end">Until</Label>
                    <Input
                      id="s-quiet-end"
                      type="time"
                      value={prefs.quietHours.end}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          quietHours: { ...prefs.quietHours, end: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <CardDivider />
          <div className="space-y-3">
            <label className="text-body-sm flex items-center gap-3 font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={prefs.sound.enabled}
                onChange={(e) =>
                  setPrefs({ ...prefs, sound: { ...prefs.sound, enabled: e.target.checked } })
                }
              />
              Play a sound when a reminder fires
            </label>
            {prefs.sound.enabled && (
              <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="s-tone">Sound</Label>
                  <Select
                    id="s-tone"
                    value={prefs.sound.tone}
                    onValueChange={(v) =>
                      setPrefs({
                        ...prefs,
                        sound: { ...prefs.sound, tone: v as Tone },
                      })
                    }
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label id="s-volume-label">Volume</Label>
                  <ElasticSlider
                    id="s-volume"
                    aria-labelledby="s-volume-label"
                    leftIcon={<Volume1 className="size-5" />}
                    rightIcon={<Volume2 className="size-5" />}
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={prefs.sound.volume}
                    display={`${Math.round(prefs.sound.volume * 100)}%`}
                    onValueChange={(volume) =>
                      setPrefs({ ...prefs, sound: { ...prefs.sound, volume } })
                    }
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const ok = await playTone(prefs.sound.tone, prefs.sound.volume);
                    if (!ok)
                      toast.error(
                        "Your browser blocked the sound. Click anywhere on the page and try again.",
                      );
                  }}
                >
                  Play
                </Button>
              </div>
            )}
          </div>
          <CardDivider />
          <label className="text-body-sm flex items-center gap-3 font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={prefs.morningSummary}
              onChange={(e) => setPrefs({ ...prefs, morningSummary: e.target.checked })}
            />
            Morning summary when work starts (&ldquo;5 tasks due today&rdquo;)
          </label>
        </SettingsCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <span className="text-caption text-muted-strong">
            Saves your profile and reminder settings.
          </span>
        </div>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        <SettingsCard
          id="browser-notifications"
          icon={Bell}
          title="Browser notifications"
          description="How reminders reach you."
        >
          <p role="status" className="text-body-sm">
            {permission === "granted" && "Enabled. Reminders will appear as browser notifications."}
            {permission === "default" &&
              "Not enabled yet. Reminders appear inside WorkDesk until you turn this on."}
            {permission === "denied" &&
              "Blocked in your browser. Allow notifications for this site in your browser settings, then reload."}
            {permission === "unsupported" &&
              "This browser does not support notifications. Reminders appear inside WorkDesk."}
          </p>
          <p className="text-caption text-muted-strong">
            Reminders can only fire while WorkDesk is open in a browser tab or an installed app
            window. Anything that came due while it was closed is shown as a summary the next time
            you open it.
          </p>
          <div className="flex flex-wrap gap-2">
            {permission === "default" && (
              <Button variant="accent" onClick={() => void requestPermission()}>
                Enable notifications
              </Button>
            )}
            <Button variant="secondary" onClick={() => void sendTest()}>
              Send a test
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          id="install"
          icon={Download}
          title="Install the app"
          description="Use WorkDesk in its own window."
        >
          <InstallApp />
        </SettingsCard>

        <SettingsCard
          id="appearance"
          icon={Palette}
          title="Appearance"
          description="Light, dark, or follow your device."
        >
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as const).map((value) => (
              <Button
                key={value}
                role="radio"
                aria-checked={theme === value}
                variant={theme === value ? "primary" : "secondary"}
                size="sm"
                onClick={() => choose(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard
          id="statuses"
          icon={ListChecks}
          title="Task statuses"
          description="The columns on your Board. Keep the four built-in ones and add your own."
        >
          <StatusManager />
        </SettingsCard>

        <SettingsCard
          id="your-data"
          icon={Database}
          title="Your data"
          description="Take everything with you, any time."
        >
          <p className="text-caption text-muted-strong">
            Download everything you own. Each note can also be exported as Markdown or PDF from its
            own page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href="/api/export?type=json" download>
                Export all data (JSON)
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/api/export?type=tasks-csv" download>
                Export tasks (CSV)
              </a>
            </Button>
          </div>
        </SettingsCard>
      </div>

      <SettingsCard
        id="account"
        icon={LogOut}
        title="Account"
        description="Sign out of WorkDesk on this device."
      >
        <div>
          <Button variant="danger" onClick={() => void logoutAction()}>
            Sign out
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
