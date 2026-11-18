/**
 * Best-effort offline writes. Only two simple actions are queued (adding a task and
 * completing/reopening one); everything else needs a connection. The queue lives in
 * localStorage and replays in order when the browser is back online.
 */

export type OfflineOp = { id: string; at: string } & (
  | { type: "quickAdd"; text: string; dayKey?: string }
  | { type: "toggleDone"; taskId: string; done: boolean }
);

export type NewOfflineOp =
  | { type: "quickAdd"; text: string; dayKey?: string }
  | { type: "toggleDone"; taskId: string; done: boolean };

export const QUEUE_KEY = "workdesk:offline-queue";
export const MAX_QUEUE = 100;

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isOp(value: unknown): value is OfflineOp {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.at !== "string") return false;
  if (v.type === "quickAdd")
    return typeof v.text === "string" && v.text.length > 0 && v.text.length <= 500;
  if (v.type === "toggleDone") return typeof v.taskId === "string" && typeof v.done === "boolean";
  return false;
}

/** Reads the queue, ignoring anything malformed (the storage can be edited or corrupted). */
export function parseQueue(raw: string | null): OfflineOp[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOp).slice(0, MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

export function loadQueue(storage: QueueStorage): OfflineOp[] {
  try {
    return parseQueue(storage.getItem(QUEUE_KEY));
  } catch {
    return [];
  }
}

export function saveQueue(storage: QueueStorage, ops: OfflineOp[]): void {
  try {
    if (ops.length === 0) storage.removeItem(QUEUE_KEY);
    else storage.setItem(QUEUE_KEY, JSON.stringify(ops.slice(0, MAX_QUEUE)));
  } catch {
    /* storage full or unavailable: the change simply isn't kept */
  }
}

/** Adds an operation. Toggling the same task again replaces the earlier toggle: last one wins. */
export function enqueue(ops: OfflineOp[], op: NewOfflineOp, now: Date, id: string): OfflineOp[] {
  const next = [...ops];
  if (op.type === "toggleDone") {
    const i = next.findIndex((o) => o.type === "toggleDone" && o.taskId === op.taskId);
    if (i >= 0) next.splice(i, 1);
  }
  next.push({ ...op, id, at: now.toISOString() } as OfflineOp);
  return next.slice(-MAX_QUEUE);
}

export type ReplayOutcome = "done" | "drop" | "retry";

/**
 * Runs queued operations in order. `retry` (still offline, signed out) stops the run and keeps
 * the rest; `drop` discards an operation the server rejected so it can't block the queue.
 */
export async function replayQueue(
  ops: OfflineOp[],
  run: (op: OfflineOp) => Promise<ReplayOutcome>,
): Promise<{ remaining: OfflineOp[]; synced: number; dropped: number }> {
  let synced = 0;
  let dropped = 0;
  for (let i = 0; i < ops.length; i++) {
    const outcome = await run(ops[i]);
    if (outcome === "retry") return { remaining: ops.slice(i), synced, dropped };
    if (outcome === "done") synced++;
    else dropped++;
  }
  return { remaining: [], synced, dropped };
}

/** A failed `fetch` (no connection, DNS, CORS): as opposed to the server answering with an error. */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TypeError" && /fetch|network|load failed|connection/i.test(error.message);
}
