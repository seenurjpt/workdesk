import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { objectId } from "@/schemas";
import { exportAll, noteMarkdown, tasksCsv } from "@/server/export";

const stamp = () => new Date().toISOString().slice(0, 10);

/** GET /api/export?type=json | tasks-csv | note&id=<noteId> */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "Signed out" }, { status: 401 });
  if (!rateLimit(`export:${userId}`, { capacity: 10, refillPerSec: 1 / 6 })) {
    return Response.json(
      { ok: false, error: "Too many exports. Try again in a minute." },
      { status: 429 },
    );
  }

  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const headers = (filename: string, contentType: string) => ({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    if (type === "json") {
      const body = JSON.stringify(await exportAll(userId), null, 2);
      return new Response(body, {
        headers: headers(`workdesk-export-${stamp()}.json`, "application/json; charset=utf-8"),
      });
    }
    if (type === "tasks-csv") {
      return new Response("﻿" + (await tasksCsv(userId)), {
        headers: headers(`workdesk-tasks-${stamp()}.csv`, "text/csv; charset=utf-8"),
      });
    }
    if (type === "note") {
      const id = objectId.safeParse(params.get("id"));
      if (!id.success) return Response.json({ ok: false, error: "Invalid note" }, { status: 400 });
      const out = await noteMarkdown(userId, id.data);
      if (!out) return Response.json({ ok: false, error: "Note not found" }, { status: 404 });
      return new Response(out.markdown, {
        headers: headers(out.filename, "text/markdown; charset=utf-8"),
      });
    }
    return Response.json({ ok: false, error: "Unknown export type" }, { status: 400 });
  } catch (error) {
    console.error("[export]", error);
    return Response.json({ ok: false, error: "Something went wrong" }, { status: 500 });
  }
}
