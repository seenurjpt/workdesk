import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createProject, listProjects, updateProject } from "@/server/projects";
import {
  countGeneralTasks,
  countTabs,
  createTask,
  getTask,
  getViewData,
  listTasks,
  quickAddTask,
  restoreTask,
  setTaskDone,
  softDeleteTask,
  updateTask,
} from "@/server/tasks";

const TZ = "Asia/Kolkata";
// Tue 17 Nov 2026, 10:00 IST
const NOW = new Date("2026-11-17T04:30:00Z");
let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("workdesk-test");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  alice = (
    await registerUser({ name: "Alice", email: "alice@example.com", password: "password123" })
  ).id;
  bob = (await registerUser({ name: "Bob", email: "bob@example.com", password: "password123" })).id;
});

describe("users", () => {
  it("rejects duplicate emails and hashes passwords", async () => {
    await expect(
      registerUser({ name: "Alice 2", email: "alice@example.com", password: "password123" }),
    ).rejects.toThrow(/already exists/);
    const { User } = await import("@/models/User");
    const u = await User.findById(alice).select("+passwordHash").lean();
    expect(u?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe("task views", () => {
  it("places tasks in the right views", async () => {
    const project = await createProject(alice, { name: "Alpha", color: "#00b97a" });
    await createTask(alice, { title: "inbox task" });
    await createTask(alice, { title: "project task", projectId: project.id });
    await createTask(alice, { title: "today", dueAt: new Date("2026-11-17T09:00:00Z") });
    await createTask(alice, { title: "overdue", dueAt: new Date("2026-11-15T09:00:00Z") });
    await createTask(alice, { title: "later", dueAt: new Date("2026-11-20T09:00:00Z") });
    await createTask(alice, { title: "far", dueAt: new Date("2027-02-20T09:00:00Z") });

    const titles = async (kind: "inbox" | "today" | "upcoming" | "overdue") =>
      (await listTasks(alice, { kind }, TZ, NOW)).map((t) => t.title).sort();

    expect(await titles("inbox")).toEqual(["inbox task"]);
    expect(await titles("today")).toEqual(["overdue", "today"]);
    expect(await titles("overdue")).toEqual(["overdue"]);
    expect(await titles("upcoming")).toEqual(["later"]); // from tomorrow; today is on the Today tab
    expect(
      (await listTasks(alice, { kind: "project", projectId: project.id }, TZ, NOW)).map(
        (t) => t.title,
      ),
    ).toEqual(["project task"]);
  });

  it("tab counts use the same rules as the lists", async () => {
    await createTask(alice, { title: "today", dueAt: new Date("2026-11-17T09:00:00Z") });
    await createTask(alice, { title: "overdue", dueAt: new Date("2026-11-15T09:00:00Z") });
    await createTask(alice, { title: "later", dueAt: new Date("2026-11-20T09:00:00Z") });
    await createTask(alice, { title: "far", dueAt: new Date("2027-02-20T09:00:00Z") });
    const done = await createTask(alice, {
      title: "done",
      dueAt: new Date("2026-11-20T09:00:00Z"),
    });
    await setTaskDone(alice, done.id, true);
    const counts = await countTabs(alice, TZ, NOW);
    expect(counts).toEqual({ all: 4, today: 1, upcoming: 1, overdue: 1 }); // all = every open task (done excluded)
    for (const kind of ["upcoming", "overdue"] as const) {
      expect((await listTasks(alice, { kind }, TZ, NOW)).length).toBe(counts[kind]);
    }
    expect(await countTabs(bob, TZ, NOW)).toEqual({ all: 0, today: 0, upcoming: 0, overdue: 0 });
  });

  it("All lists every open task: dated first in date order, undated last, nothing done or deleted", async () => {
    await createTask(alice, { title: "undated low", priority: 4 });
    await createTask(alice, { title: "undated urgent", priority: 1 });
    await createTask(alice, { title: "later", dueAt: new Date("2026-12-30T09:00:00Z") });
    await createTask(alice, { title: "overdue", dueAt: new Date("2026-11-10T09:00:00Z") });
    await createTask(alice, { title: "today", dueAt: new Date("2026-11-17T09:00:00Z") });
    const done = await createTask(alice, { title: "done" });
    await setTaskDone(alice, done.id, true);
    const gone = await createTask(alice, { title: "deleted" });
    await softDeleteTask(alice, gone.id);
    await createTask(bob, { title: "bobs" });
    expect((await listTasks(alice, { kind: "all" }, TZ, NOW)).map((t) => t.title)).toEqual([
      "overdue",
      "today",
      "later",
      "undated urgent",
      "undated low",
    ]);
  });

  it("an all-day task due today is not overdue", async () => {
    // IST midnight today = 2026-11-16T18:30:00Z
    await createTask(alice, {
      title: "all day",
      dueAt: new Date("2026-11-16T18:30:00Z"),
      allDay: true,
    });
    expect(await listTasks(alice, { kind: "overdue" }, TZ, NOW)).toHaveLength(0);
    expect(await listTasks(alice, { kind: "today" }, TZ, NOW)).toHaveLength(1);
  });

  it("a timed task due earlier today is overdue; a later one is not", async () => {
    await createTask(alice, { title: "earlier", dueAt: new Date("2026-11-17T02:00:00Z") }); // 07:30 IST
    await createTask(alice, { title: "later", dueAt: new Date("2026-11-17T09:00:00Z") }); // 14:30 IST
    expect((await listTasks(alice, { kind: "overdue" }, TZ, NOW)).map((t) => t.title)).toEqual([
      "earlier",
    ]);
  });

  it("completing moves a task to completed-today; uncompleting restores it", async () => {
    const t = await createTask(alice, { title: "x", dueAt: new Date("2026-11-17T09:00:00Z") });
    await setTaskDone(alice, t.id, true);
    let data = await getViewData(alice, { kind: "today" }, TZ);
    expect(data.tasks).toHaveLength(0);
    expect(data.completed.map((c) => c.id)).toEqual([t.id]);
    await setTaskDone(alice, t.id, false);
    data = await getViewData(alice, { kind: "today" }, TZ);
    expect(data.tasks.map((c) => c.id)).toEqual([t.id]);
    expect((await getTask(alice, t.id))?.completedAt).toBeNull();
  });

  it("General lists every open task without a project, dated or not", async () => {
    const project = await createProject(alice, { name: "P", color: "#00b97a" });
    await createTask(alice, { title: "undated" });
    await createTask(alice, { title: "dated", dueAt: new Date("2026-11-20T09:00:00Z") });
    await createTask(alice, { title: "in project", projectId: project.id });
    const done = await createTask(alice, { title: "finished" });
    await setTaskDone(alice, done.id, true);
    const titles = (await listTasks(alice, { kind: "general" }, TZ, NOW))
      .map((t) => t.title)
      .sort();
    expect(titles).toEqual(["dated", "undated"]);
    expect(await countGeneralTasks(alice)).toBe(2);
    expect(await countGeneralTasks(bob)).toBe(0);
  });

  it("filters by tag", async () => {
    await createTask(alice, { title: "Quarterly report", tags: ["finance"] });
    await createTask(alice, { title: "Lunch", tags: ["fun"] });
    expect(
      (await listTasks(alice, { kind: "tag", tag: "finance" }, TZ)).map((t) => t.title),
    ).toEqual(["Quarterly report"]);
  });
});

describe("quick add", () => {
  it("creates a task with project, tags, priority, recurrence and waiting-on", async () => {
    const t = await quickAddTask(
      alice,
      "Send report to Rahul tomorrow 5pm #clientA @report !high every monday wait:Priya",
      TZ,
      NOW,
    );
    expect(t).toMatchObject({
      title: "Send report to Rahul",
      priority: 2,
      tags: ["report"],
      allDay: false,
      dueAt: "2026-11-18T11:30:00.000Z",
      recurrence: { rrule: "FREQ=WEEKLY;BYDAY=MO", timezone: TZ },
      waitingOn: { person: "Priya" },
    });
    const projects = await listProjects(alice);
    expect(projects.map((p) => p.name)).toEqual(["clientA"]);
    expect(t.projectId).toBe(projects[0].id);
  });

  it("reuses an existing project case-insensitively", async () => {
    await createProject(alice, { name: "ClientA", color: "#3b82f6" });
    await quickAddTask(alice, "a #clienta", TZ, NOW);
    expect(await listProjects(alice)).toHaveLength(1);
  });

  it("matches #project names ignoring case, spaces and punctuation", async () => {
    await createProject(alice, { name: "Client A", color: "#3b82f6" });
    await quickAddTask(alice, "a #ClientA", TZ, NOW);
    await quickAddTask(alice, "b #client-a", TZ, NOW);
    expect(await listProjects(alice)).toHaveLength(1);
    const general = await quickAddTask(alice, "c plain", TZ, NOW);
    expect(general.projectId).toBeNull();
  });

  it("rejects an empty title", async () => {
    await expect(quickAddTask(alice, "#x !p1", TZ, NOW)).rejects.toThrow();
  });
});

describe("task updates", () => {
  it("updates fields, clears due date and soft deletes/restores", async () => {
    const t = await createTask(alice, {
      title: "a",
      dueAt: new Date("2026-11-20T00:00:00Z"),
      tags: ["x"],
    });
    const updated = await updateTask(alice, t.id, {
      title: "b",
      dueAt: null,
      priority: 1,
      tags: [],
    });
    expect(updated).toMatchObject({ title: "b", dueAt: null, priority: 1, tags: [] });

    expect(await softDeleteTask(alice, t.id)).toBe(true);
    expect(await getTask(alice, t.id)).toBeNull();
    expect(await restoreTask(alice, t.id)).toBe(true);
    expect(await getTask(alice, t.id)).not.toBeNull();
  });

  it("persists subtasks in order", async () => {
    const t = await createTask(alice, {
      title: "with subtasks",
      subtasks: [
        { title: "one", done: false, order: 0 },
        { title: "two", done: true, order: 1 },
      ],
    });
    expect(t.subtasks.map((s) => [s.title, s.done])).toEqual([
      ["one", false],
      ["two", true],
    ]);
  });
});

describe("per-user data isolation", () => {
  it("never exposes or mutates another user's data", async () => {
    const project = await createProject(alice, { name: "Secret", color: "#e5484d" });
    const task = await createTask(alice, { title: "private", projectId: project.id });

    expect(await getTask(bob, task.id)).toBeNull();
    expect(await updateTask(bob, task.id, { title: "hacked" })).toBeNull();
    expect(await setTaskDone(bob, task.id, true)).toBeNull();
    expect(await softDeleteTask(bob, task.id)).toBe(false);
    expect(await updateProject(bob, project.id, { name: "hacked" })).toBeNull();
    expect(await listProjects(bob)).toHaveLength(0);
    expect(await listTasks(bob, { kind: "inbox" }, TZ)).toHaveLength(0);
    expect(await listTasks(bob, { kind: "project", projectId: project.id }, TZ)).toHaveLength(0);

    await expect(createTask(bob, { title: "sneaky", projectId: project.id })).rejects.toThrow(
      /Project not found/,
    );
    await expect(
      updateTask(bob, (await createTask(bob, { title: "mine" })).id, { projectId: project.id }),
    ).rejects.toThrow(/Project not found/);

    expect(await getTask(alice, task.id)).toMatchObject({ title: "private", status: "todo" });
  });
});
