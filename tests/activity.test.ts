import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import {
  ACTIVITY_DAYS,
  changedFields,
  listActivity,
  minutesWords,
  quoted,
  recordActivity,
  titleOf,
} from "@/server/activity";
import { createTask, softDeleteTask } from "@/server/tasks";
import { ActivityLog } from "@/models/ActivityLog";

let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("activity-test");
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  alice = (await registerUser({ name: "Alice", email: "alice@x.com", password: "password-123" }))
    .id;
  bob = (await registerUser({ name: "Bob", email: "bob@x.com", password: "password-123" })).id;
});

describe("activity log", () => {
  it("lists a person's own entries, newest first, and never someone else's", async () => {
    await recordActivity(alice, "first");
    await new Promise((r) => setTimeout(r, 5));
    await recordActivity(alice, "second");
    await recordActivity(bob, "bob's thing");
    const mine = await listActivity(alice);
    expect(mine.map((e) => e.summary)).toEqual(["second", "first"]);
    expect((await listActivity(bob)).map((e) => e.summary)).toEqual(["bob's thing"]);
  });

  it("only shows the last 7 days", async () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const old = new Date(now.getTime() - (ACTIVITY_DAYS * 86_400_000 + 60_000));
    const fresh = new Date(now.getTime() - 6 * 86_400_000);
    await ActivityLog.collection.insertMany([
      { userId: new mongoose.Types.ObjectId(alice), summary: "too old", createdAt: old },
      { userId: new mongoose.Types.ObjectId(alice), summary: "recent", createdAt: fresh },
    ]);
    expect((await listActivity(alice, now)).map((e) => e.summary)).toEqual(["recent"]);
  });

  it("has a database rule that deletes entries after 7 days", async () => {
    await ActivityLog.init();
    const idx = await ActivityLog.collection.indexes();
    expect(idx.some((i) => i.expireAfterSeconds === ACTIVITY_DAYS * 86_400)).toBe(true);
  });

  it("never throws, and keeps titles on one short line", async () => {
    await expect(recordActivity("not-an-id", "x")).resolves.toBeUndefined();
    expect(quoted("a\n  b")).toBe('"a b"');
    expect(quoted("x".repeat(200)).length).toBeLessThanOrEqual(72);
    expect(quoted("   ")).toBe('"Untitled"');
  });

  it("describes edits and timers in words", () => {
    expect(changedFields(["title"])).toBe("title");
    expect(changedFields(["title", "dueAt", "priority"])).toBe("title, due date and priority");
    expect(minutesWords(0)).toBe("less than a minute");
    expect(minutesWords(12)).toBe("12 min");
  });

  it("finds a task title for its owner only, also in Trash", async () => {
    const t = await createTask(alice, { title: "Review contract draft" });
    expect(await titleOf(alice, "task", t.id)).toBe('"Review contract draft"');
    await softDeleteTask(alice, t.id);
    expect(await titleOf(alice, "task", t.id)).toBe('"Review contract draft"');
    expect(await titleOf(bob, "task", t.id)).toBe("a task");
  });
});
