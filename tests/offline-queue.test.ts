import { describe, expect, it } from "vitest";
import {
  MAX_QUEUE,
  QUEUE_KEY,
  enqueue,
  isNetworkError,
  loadQueue,
  parseQueue,
  replayQueue,
  saveQueue,
  type OfflineOp,
  type QueueStorage,
} from "@/lib/offline-queue";

const NOW = new Date("2026-11-17T10:00:00Z");
const memory = (): QueueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
let n = 0;
const id = () => `op${++n}`;

describe("offline queue", () => {
  it("round-trips through storage and clears when empty", () => {
    const s = memory();
    const ops = enqueue([], { type: "quickAdd", text: "Buy milk" }, NOW, id());
    saveQueue(s, ops);
    expect(loadQueue(s)).toEqual(ops);
    saveQueue(s, []);
    expect(s.data.has(QUEUE_KEY)).toBe(false);
  });

  it("keeps operations in order, and the last toggle of a task wins", () => {
    let ops: OfflineOp[] = [];
    ops = enqueue(ops, { type: "toggleDone", taskId: "a", done: true }, NOW, id());
    ops = enqueue(ops, { type: "quickAdd", text: "x" }, NOW, id());
    ops = enqueue(ops, { type: "toggleDone", taskId: "b", done: true }, NOW, id());
    ops = enqueue(ops, { type: "toggleDone", taskId: "a", done: false }, NOW, id());
    expect(ops.map((o) => (o.type === "toggleDone" ? `${o.taskId}:${o.done}` : o.type))).toEqual([
      "quickAdd",
      "b:true",
      "a:false",
    ]);
  });

  it("caps the queue size", () => {
    let ops: OfflineOp[] = [];
    for (let i = 0; i < MAX_QUEUE + 20; i++)
      ops = enqueue(ops, { type: "quickAdd", text: `t${i}` }, NOW, id());
    expect(ops).toHaveLength(MAX_QUEUE);
    expect(ops.at(-1)).toMatchObject({ text: `t${MAX_QUEUE + 19}` });
  });

  it("ignores malformed or tampered storage", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    const good = enqueue([], { type: "quickAdd", text: "ok" }, NOW, id());
    const mixed = JSON.stringify([
      ...good,
      { type: "quickAdd", text: "" },
      { type: "evil", id: "x", at: "y" },
      5,
      null,
      { id: "z", at: "t", type: "toggleDone", taskId: 1, done: true },
    ]);
    expect(parseQueue(mixed)).toEqual(good);
    expect(
      parseQueue(JSON.stringify([{ id: "a", at: "t", type: "quickAdd", text: "x".repeat(501) }])),
    ).toEqual([]);
  });

  it("survives a storage that throws", () => {
    const bad: QueueStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadQueue(bad)).toEqual([]);
    expect(() =>
      saveQueue(bad, enqueue([], { type: "quickAdd", text: "x" }, NOW, id())),
    ).not.toThrow();
  });
});

describe("replay", () => {
  const ops: OfflineOp[] = [
    { id: "1", at: "t", type: "quickAdd", text: "a" },
    { id: "2", at: "t", type: "toggleDone", taskId: "x", done: true },
    { id: "3", at: "t", type: "quickAdd", text: "c" },
  ];
  it("runs everything in order", async () => {
    const seen: string[] = [];
    const r = await replayQueue(ops, async (op) => (seen.push(op.id), "done"));
    expect(seen).toEqual(["1", "2", "3"]);
    expect(r).toEqual({ remaining: [], synced: 3, dropped: 0 });
  });
  it("stops at the first retry and keeps the rest", async () => {
    const r = await replayQueue(ops, async (op) => (op.id === "2" ? "retry" : "done"));
    expect(r.synced).toBe(1);
    expect(r.remaining.map((o) => o.id)).toEqual(["2", "3"]);
  });
  it("drops rejected operations without blocking the rest", async () => {
    const r = await replayQueue(ops, async (op) => (op.id === "1" ? "drop" : "done"));
    expect(r).toMatchObject({ synced: 2, dropped: 1, remaining: [] });
  });
});

describe("isNetworkError", () => {
  it("recognises failed fetches only", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(
      true,
    );
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(false);
    expect(isNetworkError(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkError("Failed to fetch")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
