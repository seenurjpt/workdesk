import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createTask } from "@/server/tasks";
import { createProject } from "@/server/projects";
import {
  MAX_VERSIONS,
  VERSION_INTERVAL_MS,
  createNote,
  getLinkedNotes,
  getLinkedTasks,
  getNote,
  getNoteFacets,
  getVersion,
  linkTaskNote,
  listNotes,
  listVersions,
  restoreNote,
  restoreVersion,
  saveVersion,
  softDeleteNote,
  unlinkTaskNote,
  updateNote,
} from "@/server/notes";
import { globalSearch, lookupNotes, lookupTasks } from "@/server/search";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";

let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

const doc = (...lines: string[]) => ({
  type: "doc",
  content: lines.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("workdesk-notes-test");
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

describe("notes CRUD", () => {
  it("creates with plain text and lists pinned first, newest next", async () => {
    const a = await createNote(alice, { title: "A", content: doc("alpha body") });
    await createNote(alice, { title: "B", content: doc("beta body"), pinned: true });
    const c = await createNote(alice, { title: "C" });
    expect((await Note.findById(a.id).lean())?.plainText).toBe("alpha body");
    const list = await listNotes(alice);
    expect(list.map((n) => n.title)).toEqual(["B", "C", "A"]);
    expect(list[0].pinned).toBe(true);
    expect(list.find((n) => n.id === a.id)?.excerpt).toBe("alpha body");
    expect(c.title).toBe("C");
  });

  it("filters by text, tag and folder", async () => {
    await createNote(alice, {
      title: "Budget",
      content: doc("quarterly numbers"),
      tags: ["finance"],
      folder: "Work",
    });
    await createNote(alice, { title: "Trip", content: doc("flights"), tags: ["travel"] });
    expect((await listNotes(alice, { q: "quarterly" })).map((n) => n.title)).toEqual(["Budget"]);
    expect((await listNotes(alice, { q: "budget numbers" })).map((n) => n.title)).toEqual([
      "Budget",
    ]);
    expect((await listNotes(alice, { tag: "travel" })).map((n) => n.title)).toEqual(["Trip"]);
    expect((await listNotes(alice, { folder: "Work" })).map((n) => n.title)).toEqual(["Budget"]);
    expect(await listNotes(alice, { q: ".*" })).toHaveLength(0);
    const facets = await getNoteFacets(alice);
    expect(facets.tags.map((t) => t.name).sort()).toEqual(["finance", "travel"]);
    expect(facets.folders).toEqual([{ name: "Work", count: 1 }]);
  });

  it("updates fields, clears folder/project, and recomputes plain text", async () => {
    const project = await createProject(alice, { name: "P", color: "#00b97a" });
    const n = await createNote(alice, { title: "x", folder: "F", projectId: project.id });
    await updateNote(alice, n.id, {
      content: doc("new text"),
      folder: null,
      projectId: null,
      pinned: true,
    });
    const got = await getNote(alice, n.id);
    expect(got).toMatchObject({ pinned: true, folder: null, projectId: null });
    expect((await Note.findById(n.id).lean())?.plainText).toBe("new text");
  });

  it("soft deletes and restores", async () => {
    const n = await createNote(alice, { title: "gone" });
    expect(await softDeleteNote(alice, n.id)).toBe(true);
    expect(await getNote(alice, n.id)).toBeNull();
    expect(await listNotes(alice)).toHaveLength(0);
    expect(await restoreNote(alice, n.id)).toBe(true);
    expect(await getNote(alice, n.id)).not.toBeNull();
  });
});

describe("version history", () => {
  const T0 = new Date("2026-11-17T10:00:00Z");
  const at = (ms: number) => new Date(T0.getTime() + ms);

  it("snapshots the previous state at most once per 5 minutes", async () => {
    const n = await createNote(alice, { title: "Doc", content: doc("v1") });
    await updateNote(alice, n.id, { content: doc("v2") }, at(0)); // snapshot of v1
    await updateNote(alice, n.id, { content: doc("v3") }, at(60_000)); // too soon
    await updateNote(alice, n.id, { content: doc("v4") }, at(120_000)); // too soon
    expect(await listVersions(alice, n.id)).toHaveLength(1);
    await updateNote(alice, n.id, { content: doc("v5") }, at(VERSION_INTERVAL_MS + 1000)); // snapshot of v4
    const versions = await listVersions(alice, n.id);
    expect(versions).toHaveLength(2);
    const oldest = await getVersion(alice, n.id, versions[1].id);
    expect(JSON.stringify(oldest?.content)).toContain("v1");
    const newest = await getVersion(alice, n.id, versions[0].id);
    expect(JSON.stringify(newest?.content)).toContain("v4");
  });

  it("does not snapshot when nothing changed or the note was empty", async () => {
    const n = await createNote(alice, {});
    await updateNote(alice, n.id, { content: doc("first words") }, at(0));
    expect(await listVersions(alice, n.id)).toHaveLength(0);
    await updateNote(alice, n.id, { content: doc("first words") }, at(VERSION_INTERVAL_MS * 3));
    expect(await listVersions(alice, n.id)).toHaveLength(0);
  });

  it("explicit save version always snapshots", async () => {
    const n = await createNote(alice, { title: "T", content: doc("body") });
    await saveVersion(alice, n.id, at(0));
    await saveVersion(alice, n.id, at(1000));
    expect(await listVersions(alice, n.id)).toHaveLength(2);
  });

  it("keeps at most 50 versions", async () => {
    const n = await createNote(alice, { title: "T", content: doc("body") });
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await saveVersion(alice, n.id, at(i * 1000));
    expect(await listVersions(alice, n.id)).toHaveLength(MAX_VERSIONS);
  });

  it("restore brings the content back and is itself undoable", async () => {
    const n = await createNote(alice, { title: "Original", content: doc("good text") });
    await updateNote(alice, n.id, { title: "Broken", content: doc("oops") }, at(0));
    const [version] = await listVersions(alice, n.id);
    const restored = await restoreVersion(alice, n.id, version.id, at(1000));
    expect(restored?.title).toBe("Original");
    expect(JSON.stringify(restored?.content)).toContain("good text");
    expect((await Note.findById(n.id).lean())?.plainText).toBe("good text");
    // the broken state was snapshotted before restoring
    const after = await listVersions(alice, n.id);
    expect(after).toHaveLength(2);
    expect(after[0].title).toBe("Broken");
  });
});

describe("task <-> note links", () => {
  it("links both ways, is idempotent, and unlinks both sides", async () => {
    const t = await createTask(alice, { title: "Write spec" });
    const n = await createNote(alice, { title: "Spec notes" });
    await linkTaskNote(alice, t.id, n.id);
    await linkTaskNote(alice, t.id, n.id);
    expect((await getLinkedNotes(alice, t.id)).map((x) => x.title)).toEqual(["Spec notes"]);
    expect((await getLinkedTasks(alice, n.id)).map((x) => x.title)).toEqual(["Write spec"]);
    expect((await Task.findById(t.id).lean())?.linkedNoteIds).toHaveLength(1);

    await unlinkTaskNote(alice, t.id, n.id);
    expect(await getLinkedNotes(alice, t.id)).toHaveLength(0);
    expect(await getLinkedTasks(alice, n.id)).toHaveLength(0);
  });

  it("hides links to deleted notes and tasks", async () => {
    const t = await createTask(alice, { title: "T" });
    const n = await createNote(alice, { title: "N" });
    await linkTaskNote(alice, t.id, n.id);
    await softDeleteNote(alice, n.id);
    expect(await getLinkedNotes(alice, t.id)).toHaveLength(0);
  });
});

describe("search", () => {
  it("ranks title matches above body matches and highlights", async () => {
    await createNote(alice, { title: "Other", content: doc("we need a launch plan soon") });
    await createNote(alice, { title: "Launch plan", content: doc("details") });
    await createTask(alice, { title: "Review launch checklist" });
    const res = await globalSearch(alice, "launch");
    expect(res.notes.map((n) => n.title)).toEqual(["Launch plan", "Other"]);
    expect(res.notes[0].titleParts.some((p) => p.hit && p.text.toLowerCase() === "launch")).toBe(
      true,
    );
    expect(res.notes[1].snippet.some((p) => p.hit)).toBe(true);
    expect(res.tasks).toHaveLength(1);
  });

  it("requires every word and matches prefixes", async () => {
    await createNote(alice, { title: "Onboarding", content: doc("checklist for new hires") });
    expect((await globalSearch(alice, "onboard check")).notes).toHaveLength(1);
    expect((await globalSearch(alice, "onboard zebra")).notes).toHaveLength(0);
    expect(await globalSearch(alice, "   ")).toEqual({ tasks: [], notes: [] });
  });

  it("treats regex characters literally and skips deleted items", async () => {
    const n = await createNote(alice, { title: "price (draft)" });
    expect((await globalSearch(alice, "(draft")).notes).toHaveLength(1);
    expect((await globalSearch(alice, ".*")).notes).toHaveLength(0);
    await softDeleteNote(alice, n.id);
    expect((await globalSearch(alice, "draft")).notes).toHaveLength(0);
  });

  it("mention lookups return recent items for an empty query", async () => {
    await createTask(alice, { title: "Ship it" });
    await createNote(alice, { title: "Retro" });
    expect((await lookupTasks(alice, "")).map((t) => t.label)).toEqual(["Ship it"]);
    expect((await lookupNotes(alice, "ret")).map((t) => t.label)).toEqual(["Retro"]);
  });

  it("answers in under 300ms on 5,000 documents", async () => {
    const owner = new mongoose.Types.ObjectId(alice);
    const words = [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "report",
      "budget",
      "client",
      "launch",
      "review",
      "plan",
    ];
    const pick = (i: number) =>
      Array.from({ length: 60 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" ");
    await Note.insertMany(
      Array.from({ length: 2500 }, (_, i) => ({
        userId: owner,
        title: `Note ${i} ${words[i % 10]}`,
        plainText: pick(i),
        content: doc("x"),
      })),
    );
    await Task.insertMany(
      Array.from({ length: 2500 }, (_, i) => ({
        userId: owner,
        title: `Task ${i} ${words[i % 10]} ${words[(i + 3) % 10]}`,
      })),
    );
    await globalSearch(alice, "warm"); // warm connection and query planner
    const started = performance.now();
    const res = await globalSearch(alice, "report budget");
    const elapsed = performance.now() - started;
    expect(res.notes.length + res.tasks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});

describe("per-user isolation", () => {
  it("never exposes or changes another user's notes", async () => {
    const n = await createNote(alice, { title: "private", content: doc("secret sauce") });
    const t = await createTask(alice, { title: "private task" });
    const bobTask = await createTask(bob, { title: "bob task" });

    expect(await getNote(bob, n.id)).toBeNull();
    expect(await updateNote(bob, n.id, { title: "hacked" })).toBeNull();
    expect(await softDeleteNote(bob, n.id)).toBe(false);
    expect(await listNotes(bob)).toHaveLength(0);
    expect(await listVersions(bob, n.id)).toHaveLength(0);
    expect(await saveVersion(bob, n.id)).toBe(false);
    expect((await globalSearch(bob, "secret")).notes).toHaveLength(0);
    expect((await globalSearch(bob, "private")).tasks).toHaveLength(0);
    expect(await lookupNotes(bob, "")).toHaveLength(0);
    expect(await getLinkedTasks(bob, n.id)).toHaveLength(0);

    await expect(linkTaskNote(bob, t.id, n.id)).rejects.toThrow();
    await expect(linkTaskNote(bob, bobTask.id, n.id)).rejects.toThrow(/Note not found/);
    await expect(
      createNote(bob, { projectId: new mongoose.Types.ObjectId().toString() }),
    ).rejects.toThrow(/Project not found/);

    expect((await getNote(alice, n.id))?.title).toBe("private");
  });
});
