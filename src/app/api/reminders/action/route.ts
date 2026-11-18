import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { reminderActionSchema } from "@/schemas";
import { applyReminderAction } from "@/server/reminders";

/**
 * Notification buttons (Snooze, Done) are handled by the service worker, which can't call
 * server actions. It posts here with the session cookie.
 */
export async function POST(request: Request) {
  // Same-origin only: reject cross-site form posts even though cookies are SameSite.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "Signed out" }, { status: 401 });
  if (!rateLimit(`reminder-action:${userId}`, { capacity: 30, refillPerSec: 1 })) {
    return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = reminderActionSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });

  try {
    const res = await applyReminderAction(userId, parsed.data);
    return Response.json(
      { ok: res.ok, next: res.result?.next?.dueAt ?? null },
      { status: res.ok ? 200 : 404 },
    );
  } catch (error) {
    console.error("[reminder-action]", error);
    return Response.json({ ok: false, error: "Something went wrong" }, { status: 500 });
  }
}
