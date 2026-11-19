import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createTask, moveTask, updateTaskWithNext } from "@/server/tasks";
import {
  addStatus,
  assertStatus,
  removeStatus,
  renameStatus,
  reorderStatuses,
} from "@/server/statuses";
import { MAX_CUSTOM_STATUSES, statusList } from "@/lib/statuses";
import { buildColumns } from "@/components/board/board-model";

let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("status-test");
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  alice = (await registerUser({ name: "A", email: "a@x.com", password: "password-123" })).id;
  bob = (await registerUser({ name: "B", email: "b@x.com", password: "password-123" })).id;
});

describe("custom statuses", () => {
  it("adds, renames and lists statuses in order", async () => {
    await addStatus(alice, "In review");
    const list = await addStatus(alice, "  Waiting   for QA ");
    expect(list.map((s) => s.name)).toEqual(["In review", "Waiting for QA"]);
    const renamed = await renameStatus(alice, list[0].key, "Code review");
    expect(renamed[0].name).toBe("Code review");
    expect(renamed[0].key).toBe(list[0].key);
  });

  it("rejects empty, long, duplicate (any case) and built-in names, and caps the count", async () => {
    await expect(addStatus(alice, "   ")).rejects.toThrow();
    await expect(addStatus(alice, "x".repeat(25))).rejects.toThrow();
    await expect(addStatus(alice, "BLOCKED")).rejects.toThrow(/already/);
    await expect(addStatus(alice, "done")).rejects.toThrow(/already/);
    await addStatus(alice, "Review");
    await expect(addStatus(alice, "review")).rejects.toThrow(/already/);
    for (let i = 1; i < MAX_CUSTOM_STATUSES; i++) await addStatus(alice, `S${i}`);
    await expect(addStatus(alice, "One too many")).rejects.toThrow(/up to/);
  });

  it("lets a task use a status only if it is built in or that person's own", async () => {
    const [s] = await addStatus(alice, "In review");
    await assertStatus(alice, "in_progress");
    await assertStatus(alice, s.key);
    await expect(assertStatus(bob, s.key)).rejects.toThrow("Unknown status");
    await expect(assertStatus(alice, "nonsense")).rejects.toThrow("Unknown status");

    const t = await createTask(alice, { title: "Draft" });
    const moved = await updateTaskWithNext(alice, t.id, { status: s.key });
    expect(moved?.task.status).toBe(s.key);
    await expect(updateTaskWithNext(alice, t.id, { status: "nonsense" })).rejects.toThrow();
    const bobTask = await createTask(bob, { title: "Mine" });
    await expect(updateTaskWithNext(bob, bobTask.id, { status: s.key })).rejects.toThrow();
  });

  it("counts a custom status as open work and moves with a board drop", async () => {
    const [s] = await addStatus(alice, "In review");
    const t = await createTask(alice, { title: "Draft" });
    const res = await moveTask(alice, {
      taskId: t.id,
      column: { kind: "status", value: s.key },
      prevId: null,
      nextId: null,
    });
    expect(res?.task.status).toBe(s.key);
    expect(res?.task.completedAt).toBeNull();
  });

  it("removing a status sends its tasks back to To do", async () => {
    const [s] = await addStatus(alice, "In review");
    const t = await createTask(alice, { title: "Draft", status: s.key });
    const { statuses, moved } = await removeStatus(alice, s.key);
    expect(statuses).toEqual([]);
    expect(moved).toBe(1);
    const after = await updateTaskWithNext(alice, t.id, { priority: 2 });
    expect(after?.task.status).toBe("todo");
  });

  it("builds board columns: built-in, then custom, then Done", async () => {
    const [s] = await addStatus(alice, "In review");
    const t = await createTask(alice, { title: "Draft", status: s.key });
    const cols = buildColumns([t], "status", [], [s]);
    expect(cols.map((c) => c.title)).toEqual([
      "To do",
      "In progress",
      "Blocked",
      "In review",
      "Done",
    ]);
    expect(cols[3].tasks.map((x) => x.id)).toEqual([t.id]);
    expect(statusList().map((x) => x.title)).toEqual(["To do", "In progress", "Blocked", "Done"]);
  });
});

describe("reordering statuses", () => {
  const BUILT = ["todo", "in_progress", "blocked"];

  it("lets any status except Done be moved, and the board follows", async () => {
    const added = await addStatus(alice, "One");
    const key = added[0].key;
    const out = await reorderStatuses(alice, [key, "blocked", "todo", "in_progress"]);
    expect(out).toEqual([key, "blocked", "todo", "in_progress"]);
    expect(buildColumns([], "status", [], added, out).map((c) => c.title)).toEqual([
      "One",
      "Blocked",
      "To do",
      "In progress",
      "Done",
    ]);
  });

  it("puts a status added later after the ordered ones, and Done always last", async () => {
    await reorderStatuses(alice, ["blocked", "in_progress", "todo"]);
    const added = await addStatus(alice, "Later");
    const titles = statusList(added, ["blocked", "in_progress", "todo"]).map((s) => s.title);
    expect(titles).toEqual(["Blocked", "In progress", "To do", "Later", "Done"]);
  });

  it("refuses anything that is not each current status exactly once", async () => {
    const added = await addStatus(alice, "One");
    const k = added[0].key;
    await expect(reorderStatuses(alice, BUILT)).rejects.toThrow(); // missing one
    await expect(reorderStatuses(alice, [...BUILT, k, k])).rejects.toThrow(); // duplicate
    await expect(reorderStatuses(alice, [...BUILT, "done"])).rejects.toThrow(); // Done cannot move
    await expect(reorderStatuses(alice, [...BUILT, "zzz"])).rejects.toThrow(); // unknown
    await expect(reorderStatuses(bob, [...BUILT, k])).rejects.toThrow(); // not bob's
  });

  it("forgets a removed status in the saved order", async () => {
    const added = await addStatus(alice, "One");
    const k = added[0].key;
    await reorderStatuses(alice, [k, ...BUILT]);
    await removeStatus(alice, k);
    const { User } = await import("@/models/User");
    const u = await User.findById(alice).lean();
    expect(u?.statusOrder).toEqual(BUILT);
  });
});
