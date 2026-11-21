import { auth } from "@/lib/auth";
import { formatDue } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { getSidebarData } from "@/server/sidebar";
import { countTabs, listTasks } from "@/server/tasks";
import { getUserSettings } from "@/server/users";
import {
  interpretVoiceCommand,
  isVoiceAiEnabled,
  transcribeVoice,
  warmUpVoiceAi,
  type DaySnapshot,
  type VoiceContext,
} from "@/server/voice-ai";

/** 30 s of 16 kHz 16-bit mono WAV is ~960 KB. */
const MAX_AUDIO_BYTES = 1_500_000;
const MAX_TEXT = 1_000;
/** Tasks listed in the day snapshot sent to Gemini. */
const SNAPSHOT_TASKS = 12;
const FALLBACK_TZ = "Asia/Kolkata";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

/** Everything Gemini needs to know about this user right now, read in one parallel batch. */
async function loadContext(userId: string): Promise<VoiceContext> {
  const settings = await getUserSettings(userId);
  const timezone = settings?.timezone ?? FALLBACK_TZ;
  const now = new Date();
  const [{ projects, tags }, counts, today, overdue] = await Promise.all([
    getSidebarData(userId),
    countTabs(userId, timezone, now),
    listTasks(userId, { kind: "today" }, timezone, now),
    listTasks(userId, { kind: "overdue" }, timezone, now),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const open = [
    ...overdue.map((t) => ({ t, overdue: true })),
    ...today.filter((t) => !overdue.some((o) => o.id === t.id)).map((t) => ({ t, overdue: false })),
  ]
    .filter(({ t }) => t.status !== "done")
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.t.priority - b.t.priority)
    .slice(0, SNAPSHOT_TASKS);
  const day: DaySnapshot = {
    counts,
    tasks: open.map(({ t, overdue: late }) => ({
      title: t.title.slice(0, 120),
      due: t.dueAt ? formatDue(t.dueAt, t.allDay, timezone).label : null,
      priority: t.priority,
      overdue: late,
      project: t.projectId ? projectName.get(t.projectId) : undefined,
    })),
  };
  return {
    timezone,
    now,
    firstName: settings?.name?.trim().split(/\s+/)[0],
    vocab: {
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      tags: tags.map((t) => t.tag),
    },
    day,
  };
}

/**
 * Warm-up, sent when the voice panel opens: opens the connection to Google and the database
 * while the user is still talking, so the real request doesn't pay for it.
 */
export async function GET(request: Request) {
  if (!sameOrigin(request) || !isVoiceAiEnabled()) return new Response(null, { status: 204 });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 204 });
  await Promise.all([warmUpVoiceAi(), getUserSettings(userId).catch(() => null)]);
  return new Response(null, { status: 204 });
}

/**
 * Voice input through Gemini. A route handler rather than a server action because recordings
 * can go over the 1 MB server-action body limit.
 *
 * multipart/form-data: mode = "command" | "transcribe", plus `audio` (audio/wav) or `text`.
 * → { ok: true, transcript, command? } | { ok: false, error }
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!isVoiceAiEnabled()) {
    return Response.json({ ok: false, error: "Voice AI is not configured" }, { status: 503 });
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "You are signed out" }, { status: 401 });
  if (!rateLimit(`voice-ai:${userId}`, { capacity: 20, refillPerSec: 0.25 })) {
    return Response.json({ ok: false, error: "Slow down a little" }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const mode = form.get("mode") === "transcribe" ? "transcribe" : "command";
  const file = form.get("audio");
  const text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";

  if (file instanceof Blob && (file.size === 0 || file.size > MAX_AUDIO_BYTES || file.type !== "audio/wav")) {
    return Response.json({ ok: false, error: "Invalid recording" }, { status: 400 });
  }
  const hasAudio = file instanceof Blob;
  if (!hasAudio && (!text || text.length > MAX_TEXT || mode === "transcribe")) {
    return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  try {
    // Read the recording and the user's context at the same time.
    const [audio, ctx] = await Promise.all([
      hasAudio
        ? file.arrayBuffer().then((b) => ({
            mimeType: "audio/wav",
            data: Buffer.from(b).toString("base64"),
          }))
        : undefined,
      mode === "command" ? loadContext(userId) : undefined,
    ]);
    if (mode === "transcribe") {
      return Response.json({ ok: true, transcript: await transcribeVoice(audio!) });
    }
    const result = await interpretVoiceCommand(audio ? { audio } : { text }, ctx!);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[voice-ai]", error);
    return Response.json({ ok: false, error: "Voice AI didn't answer" }, { status: 502 });
  }
}
