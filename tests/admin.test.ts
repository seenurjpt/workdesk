import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createProject } from "@/server/projects";
import { createTask, softDeleteTask } from "@/server/tasks";
import { createNote } from "@/server/notes";
import {
  AdminError,
  assertAdmin,
  createUserByAdmin,
  deleteUser,
  generatePassword,
  getAdminOverview,
  getUserDetail,
  listAudit,
  listUsers,
  purgeExpiredTrash,
  resetUserPassword,
  setRegistration,
  setUserRole,
  setUserStatus,
} from "@/server/admin";
import { adminEmailsFromEnv, getRegistrationOpen } from "@/server/settings";

let mongod: MongoMemoryServer;
let root: string; // an administrator
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("workdesk-admin-test");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeAdmin(id: string) {
  const { User } = await import("@/models/User");
  await User.updateOne({ _id: id }, { $set: { role: "admin" } });
}

beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  const make = async (name: string) =>
    (
      await registerUser({
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: "password123",
      })
    ).id;
  root = await make("Root");
  alice = await make("Alice");
  bob = await make("Bob");
  await makeAdmin(root);
});

describe("who counts as an administrator", () => {
  it("accepts an active admin and rejects everyone else", async () => {
    await expect(assertAdmin(root)).resolves.toMatchObject({ email: "root@example.com" });
    await expect(assertAdmin(alice)).rejects.toThrow(AdminError);
    await expect(assertAdmin(new mongoose.Types.ObjectId().toString())).rejects.toThrow(AdminError);
  });

  it("rejects a suspended admin", async () => {
    await makeAdmin(bob);
    await setUserStatus(root, bob, "suspended");
    await expect(assertAdmin(bob)).rejects.toThrow(AdminError);
  });

  it("every admin function refuses a normal user", async () => {
    const calls: Array<() => Promise<unknown>> = [
      () => getAdminOverview(alice),
      () => listUsers(alice),
      () => getUserDetail(alice, bob),
      () => setUserStatus(alice, bob, "suspended"),
      () => setUserRole(alice, bob, "admin"),
      () => resetUserPassword(alice, bob),
      () => createUserByAdmin(alice, { name: "X", email: "x@example.com" }),
      () => deleteUser(alice, bob, "bob@example.com"),
      () => setRegistration(alice, false),
      () => purgeExpiredTrash(alice),
      () => listAudit(alice),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow(AdminError);
    // and nothing was changed by the attempts
    const { User } = await import("@/models/User");
    expect((await User.findById(bob).lean())?.status).toBe("active");
    expect(await getRegistrationOpen()).toBe(true);
  });
});

describe("the user list", () => {
  it("shows per-account counts and never any content", async () => {
    const p = await createProject(alice, { name: "Secret project name", color: "#00b97a" });
    await createTask(alice, { title: "Private task title", projectId: p.id });
    await createNote(alice, { title: "Private note title" });
    const page = await listUsers(root, { q: "alice" });
    expect(page.users).toHaveLength(1);
    expect(page.users[0]).toMatchObject({
      email: "alice@example.com",
      tasks: 1,
      notes: 1,
      projects: 1,
    });
    const detail = await getUserDetail(root, alice);
    expect(detail).toMatchObject({ openTasks: 1, doneTasks: 0, hasPassword: true });
    const everything = JSON.stringify([page, detail]);
    expect(everything).not.toMatch(/Private task title|Private note title|Secret project name/);
    expect(everything).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("searches name and email, is case-insensitive and safe with special characters", async () => {
    expect((await listUsers(root, { q: "ALI" })).users.map((u) => u.name)).toEqual(["Alice"]);
    expect((await listUsers(root, { q: "@example.com" })).total).toBe(3);
    expect((await listUsers(root, { q: "a.*" })).total).toBe(0); // a literal, not a pattern
    expect((await listUsers(root, { q: "(" })).total).toBe(0);
  });

  it("filters by role and status, sorts and paginates", async () => {
    expect((await listUsers(root, { role: "admin" })).users.map((u) => u.name)).toEqual(["Root"]);
    await setUserStatus(root, bob, "suspended");
    expect((await listUsers(root, { status: "suspended" })).users.map((u) => u.name)).toEqual([
      "Bob",
    ]);
    expect((await listUsers(root, { sort: "name" })).users.map((u) => u.name)).toEqual([
      "Alice",
      "Bob",
      "Root",
    ]);
    const p1 = await listUsers(root, { sort: "name", pageSize: 2 });
    expect(p1).toMatchObject({ total: 3, page: 1, pages: 2 });
    const p2 = await listUsers(root, { sort: "name", pageSize: 2, page: 2 });
    expect(p2.users.map((u) => u.name)).toEqual(["Root"]);
    expect((await listUsers(root, { pageSize: 2, page: 99 })).page).toBe(2); // clamped
  });
});

describe("suspending and role changes", () => {
  it("suspends and reactivates, and records both", async () => {
    await setUserStatus(root, alice, "suspended", "left the company");
    const d = await getUserDetail(root, alice);
    expect(d).toMatchObject({ status: "suspended", suspendedReason: "left the company" });
    expect(d?.suspendedAt).toBeTruthy();
    await setUserStatus(root, alice, "active");
    expect(await getUserDetail(root, alice)).toMatchObject({
      status: "active",
      suspendedReason: null,
    });
    const log = await listAudit(root);
    expect(log.entries.map((e) => e.action)).toEqual(["user.reactivate", "user.suspend"]);
    expect(log.entries[1]).toMatchObject({
      adminEmail: "root@example.com",
      targetEmail: "alice@example.com",
      detail: "left the company",
    });
  });

  it("will not let an admin suspend themselves", async () => {
    await expect(setUserStatus(root, root, "suspended")).rejects.toThrow(/own account/);
    await makeAdmin(alice);
    await setUserStatus(root, alice, "suspended");
    await setUserStatus(root, alice, "active");
  });

  it("promotes and demotes, never yourself and never the last admin", async () => {
    await setUserRole(root, alice, "admin");
    expect((await listUsers(root, { role: "admin" })).total).toBe(2);
    await expect(setUserRole(root, root, "user")).rejects.toThrow(/own role/);
    await setUserRole(root, alice, "user");
    await makeAdmin(alice);
    await setUserRole(alice, root, "user"); // root is no longer an admin...
    await expect(setUserRole(root, alice, "user")).rejects.toThrow(AdminError); // ...so cannot act
    await expect(setUserRole(alice, bob, "user")).resolves.toBeUndefined(); // no-op, already a user
  });

  it("an admin can demote or suspend another admin, and stays an admin themselves", async () => {
    await makeAdmin(bob);
    await setUserRole(root, bob, "user");
    await makeAdmin(bob);
    await setUserStatus(root, bob, "suspended");
    expect((await getUserDetail(root, root))?.role).toBe("admin");
    // the acting admin can never be the one left out: nobody can act on themselves
    await expect(setUserRole(root, root, "user")).rejects.toThrow(/own role/);
    await expect(setUserStatus(root, root, "suspended")).rejects.toThrow(/own account/);
  });
});

describe("passwords and new accounts", () => {
  it("resets to a one-time password that works, and does not log it", async () => {
    const { User } = await import("@/models/User");
    const before = (await User.findById(alice).select("+passwordHash").lean())?.passwordHash;
    const temp = await resetUserPassword(root, alice);
    expect(temp).toHaveLength(14);
    const after = (await User.findById(alice).select("+passwordHash").lean())?.passwordHash;
    expect(after).not.toBe(before);
    expect(await bcrypt.compare(temp, after!)).toBe(true);
    expect(await bcrypt.compare("password123", after!)).toBe(false);
    expect(JSON.stringify(await listAudit(root))).not.toContain(temp);
  });

  it("creates an account with a one-time password, and refuses a duplicate email", async () => {
    const made = await createUserByAdmin(root, {
      name: "Dana",
      email: " Dana@Example.com ",
      role: "admin",
    });
    const d = await getUserDetail(root, made.id);
    expect(d).toMatchObject({ email: "dana@example.com", role: "admin", status: "active" });
    const { User } = await import("@/models/User");
    const hash = (await User.findById(made.id).select("+passwordHash").lean())?.passwordHash;
    expect(await bcrypt.compare(made.password, hash!)).toBe(true);
    await expect(
      createUserByAdmin(root, { name: "Dana 2", email: "dana@example.com" }),
    ).rejects.toThrow(/already exists/);
  });

  it("generates passwords from clear characters only", () => {
    for (let i = 0; i < 50; i++)
      expect(generatePassword()).toMatch(/^[a-hj-km-np-zA-HJ-NP-Z2-9]{14}$/);
  });
});

describe("deleting an account", () => {
  it("needs the email typed, then removes the account and everything it owns", async () => {
    const p = await createProject(alice, { name: "P", color: "#00b97a" });
    await createTask(alice, { title: "t", projectId: p.id });
    await createNote(alice, { title: "n" });
    await createTask(bob, { title: "bobs task" });
    await expect(deleteUser(root, alice, "wrong@example.com")).rejects.toThrow(/does not match/);
    await deleteUser(root, alice, " ALICE@example.com ");
    const { User } = await import("@/models/User");
    const { Task } = await import("@/models/Task");
    const { Note } = await import("@/models/Note");
    const { Project } = await import("@/models/Project");
    expect(await User.countDocuments({ email: "alice@example.com" })).toBe(0);
    expect(await Task.countDocuments({ userId: alice })).toBe(0);
    expect(await Note.countDocuments({ userId: alice })).toBe(0);
    expect(await Project.countDocuments({ userId: alice })).toBe(0);
    // another account's data is untouched
    expect(await Task.countDocuments({ userId: bob })).toBe(1);
    const last = (await listAudit(root)).entries[0];
    expect(last).toMatchObject({ action: "user.delete", targetEmail: "alice@example.com" });
    expect(last.detail).toMatch(/1 tasks, 1 notes/);
  });

  it("never deletes yourself, but can delete another admin", async () => {
    await expect(deleteUser(root, root, "root@example.com")).rejects.toThrow(/own account/);
    await makeAdmin(alice);
    await deleteUser(root, alice, "alice@example.com");
    expect((await listUsers(root, { role: "admin" })).users.map((u) => u.name)).toEqual(["Root"]);
  });
});

describe("site settings and upkeep", () => {
  it("sign-ups are open until an admin closes them", async () => {
    expect(await getRegistrationOpen()).toBe(true);
    await setRegistration(root, false);
    expect(await getRegistrationOpen()).toBe(false);
    await setRegistration(root, true);
    expect(await getRegistrationOpen()).toBe(true);
    expect((await listAudit(root)).entries.map((e) => e.action)).toEqual([
      "settings.registration-open",
      "settings.registration-closed",
    ]);
  });

  it("purges only what has been in Trash too long, across accounts", async () => {
    const old = await createTask(alice, { title: "old" });
    const fresh = await createTask(bob, { title: "fresh" });
    const live = await createTask(bob, { title: "live" });
    await softDeleteTask(alice, old.id);
    await softDeleteTask(bob, fresh.id);
    const { Task } = await import("@/models/Task");
    await Task.updateOne({ _id: old.id }, { $set: { deletedAt: new Date("2026-01-01") } });
    const out = await purgeExpiredTrash(root, 30, new Date("2026-11-17"));
    expect(out).toEqual({ tasks: 1, notes: 0 });
    expect(await Task.countDocuments({ _id: old.id })).toBe(0);
    expect(await Task.countDocuments({ _id: fresh.id })).toBe(1);
    expect(await Task.countDocuments({ _id: live.id })).toBe(1);
  });

  it("builds the overview", async () => {
    await createTask(alice, { title: "a" });
    await createNote(bob, { title: "b" });
    const { User } = await import("@/models/User");
    await User.updateOne({ _id: alice }, { $set: { lastLoginAt: new Date() } });
    const o = await getAdminOverview(root);
    expect(o.users).toMatchObject({
      total: 3,
      admins: 1,
      suspended: 0,
      newThisWeek: 3,
      activeThisWeek: 1,
    });
    expect(o.content).toMatchObject({ tasks: 1, notes: 1 });
    expect(o.signups).toHaveLength(14);
    expect(o.signups.reduce((n, d) => n + d.count, 0)).toBe(3);
    expect(o.registrationOpen).toBe(true);
    expect(o.recentUsers).toHaveLength(3);
  });

  it("pages the audit log, newest first", async () => {
    for (let i = 0; i < 3; i++) {
      await setUserStatus(root, alice, "suspended");
      await setUserStatus(root, alice, "active");
    }
    const first = await listAudit(root, 1, 4);
    expect(first).toMatchObject({ total: 6, page: 1, pages: 2 });
    expect(first.entries[0].action).toBe("user.reactivate");
    expect((await listAudit(root, 2, 4)).entries).toHaveLength(2);
  });
});

describe("admin emails from the environment", () => {
  it("parses a comma separated list", () => {
    expect(adminEmailsFromEnv(" A@x.com, b@y.com ,, ")).toEqual(["a@x.com", "b@y.com"]);
    expect(adminEmailsFromEnv(undefined)).toEqual([]);
  });

  it("makes a listed email an admin when the account is created", async () => {
    const old = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "boss@example.com";
    try {
      const boss = await registerUser({
        name: "Boss",
        email: "boss@example.com",
        password: "password123",
      });
      const normal = await registerUser({
        name: "Pat",
        email: "pat@example.com",
        password: "password123",
      });
      expect((await getUserDetail(root, boss.id))?.role).toBe("admin");
      expect((await getUserDetail(root, normal.id))?.role).toBe("user");
    } finally {
      process.env.ADMIN_EMAILS = old;
    }
  });
});
