import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createProject, listProjects } from "@/server/projects";
import { countGeneralTasks, createTask, listTagCounts, setTaskDone } from "@/server/tasks";
import { getSidebarData } from "@/server/sidebar";

let mongod: MongoMemoryServer;
let uid: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("sidebar-test");
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

describe("getSidebarData (one query for the sidebar)", () => {
  it("returns exactly what the three separate queries returned", async () => {
    const p1 = await createProject(uid, { name: "Alpha", color: "#00b97a" });
    await createProject(uid, { name: "Beta", color: "#3b82f6" });
    await createTask(uid, { title: "a", projectId: p1.id, tags: ["x", "y"] });
    await createTask(uid, { title: "b", projectId: p1.id, tags: ["x"] });
    await createTask(uid, { title: "c", tags: ["y"] });
    await createTask(uid, { title: "d" });
    const done = await createTask(uid, { title: "e", tags: ["x"] });
    await setTaskDone(uid, done.id, true);

    const fast = await getSidebarData(uid);
    expect(fast.projects).toEqual(await listProjects(uid));
    expect(fast.tags).toEqual(await listTagCounts(uid));
    expect(fast.generalCount).toBe(await countGeneralTasks(uid));
    expect(fast.generalCount).toBe(2);
  });

  it("is empty and zero for a brand-new account", async () => {
    expect(await getSidebarData(uid)).toEqual({ projects: [], tags: [], generalCount: 0 });
  });
});
