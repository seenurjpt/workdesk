import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import {
  SYSTEM_TEMPLATES,
  deleteTemplate,
  instantiateTemplate,
  listTemplates,
} from "@/server/templates";
import { Template } from "@/models/Template";
import { User } from "@/models/User";
import { templateInputSchema } from "@/schemas";

let mongod: MongoMemoryServer;
let uid: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("tpl-test");
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  uid = (await registerUser({ name: "A", email: "a@x.com", password: "password-123" })).id;
});

describe("starter templates", () => {
  it("every starter is valid and names are unique", () => {
    const names = SYSTEM_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(SYSTEM_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    for (const { since, ...t } of SYSTEM_TEMPLATES) {
      expect(since).toBeGreaterThan(0);
      expect(templateInputSchema.safeParse(t).success, t.name).toBe(true);
    }
  });

  it("a new account gets all starters once, however often the list is opened", async () => {
    await listTemplates(uid);
    await Promise.all([listTemplates(uid), listTemplates(uid)]);
    const all = await listTemplates(uid);
    expect(all.length).toBe(SYSTEM_TEMPLATES.length);
    expect(all.every((t) => t.system)).toBe(true);
  });

  it("an account from before versions existed gets only the new starters", async () => {
    const original = SYSTEM_TEMPLATES.filter((t) => t.since === 1);
    await Template.insertMany(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only `since` is dropped
      original.map(({ since, ...t }) => ({
        ...t,
        userId: new mongoose.Types.ObjectId(uid),
        system: true,
      })),
    );
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(uid) },
      { $set: { templatesSeeded: true } },
      { upsert: false },
    );
    const all = await listTemplates(uid);
    expect(all.length).toBe(SYSTEM_TEMPLATES.length);
    expect(all.filter((t) => t.name === "Release checklist")).toHaveLength(1);
  });

  it("a starter someone deleted does not come back", async () => {
    const first = await listTemplates(uid);
    const victim = first.find((t) => t.name === "Daily plan")!;
    await deleteTemplate(uid, victim.id);
    const again = await listTemplates(uid);
    expect(again.some((t) => t.name === "Daily plan")).toBe(false);
  });

  it("creates a task with subtasks, and notes with sections", async () => {
    const all = await listTemplates(uid);
    const daily = all.find((t) => t.name === "Daily plan")!;
    const brief = all.find((t) => t.name === "Project brief")!;
    expect(daily.summary).toMatch(/items/);
    expect(brief.summary).toMatch(/sections/);
    expect((await instantiateTemplate(uid, daily.id)).kind).toBe("task");
    expect((await instantiateTemplate(uid, brief.id)).kind).toBe("note");
  });
});
