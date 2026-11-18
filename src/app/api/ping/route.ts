/**
 * A tiny "can I reach the server?" endpoint. The app only calls it while it believes it is offline
 * (with backoff), to find out when the connection is back. Nothing polls while you are online.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export function GET() {
  return new Response(null, { status: 204, headers });
}

export function HEAD() {
  return new Response(null, { status: 204, headers });
}
