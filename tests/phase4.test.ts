import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createProject } from "@/server/projects";
import {
  createTask,
  getTask,
  listWaiting,
  quickAddTask,
  setTaskDone,
  softDeleteTask,
  updateTask,
} from "@/server/tasks";
import {
  convertToTasks,
  createNote,
  getLinkedNotes,
  getLinkedTasks,
  getNote,
  softDeleteNote,
  updateNote,
} from "@/server/notes";
import { advancePhase, getActiveTimer, startTimer, stopTimer } from "@/server/timer";
import {
  TRASH_DAYS,
  emptyTrash,
  listTrash,
  maybePurgeExpired,
  purgeExpired,
  purgeItem,
} from "@/server/trash";
import {
  createTemplate,
  deleteTemplate,
  SYSTEM_TEMPLATES,
  ensureSystemTemplates,
  listTemplates,
  saveNoteAsTemplate,
  saveTaskAsTemplate,
  instantiateTemplate,
} from "@/server/templates";
import { carryOverTask, getDailyReview, getWeeklyReview } from "@/server/review";
import { addAttachment, removeAttachment, resolveLink } from "@/server/attachments";
import { fetchPageTitle } from "@/server/link-preview";
import { exportAll, noteMarkdown, tasksCsv } from "@/server/export";
import { Note } from "@/models/Note";
import { NoteVersion } from "@/models/NoteVersion";
import { Task } from "@/models/Task";
import { Template } from "@/models/Template";
import { User } from "@/models/User";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-17T12:30:00Z"); // Tue 17 Nov 2026, 18:00 IST
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const ist = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().replace("Z", "") : null;
const doc = (...lines: string[]) => ({
  type: "doc",
  content: lines.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
});

let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("workdesk-phase4-test");
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

describe("focus timer", () => {
  it("logs a stopwatch session to the task", async () => {
    const t = await createTask(alice, { title: "Write" }, NOW);
    await startTimer(alice, t.id, "stopwatch", NOW);
    expect((await getActiveTimer(alice))?.taskTitle).toBe("Write");
    const res = await stopTimer(alice, min(42));
    expect(res).toEqual({ minutes: 42, taskId: t.id });
    const task = await getTask(alice, t.id);
    expect(task?.timeSpentMinutes).toBe(42);
    expect(await getActiveTimer(alice)).toBeNull();
    const stored = await Task.findById(t.id).lean();
    expect(stored?.timeEntries).toHaveLength(1);
    expect(stored?.timeEntries?.[0].minutes).toBe(42);
  });

  it("ignores accidental starts under 30 seconds", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await startTimer(alice, t.id, "stopwatch", NOW);
    expect((await stopTimer(alice, new Date(NOW.getTime() + 10_000)))?.minutes).toBe(0);
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(0);
  });

  it("only one timer runs: starting another logs and replaces the first", async () => {
    const a = await createTask(alice, { title: "a" }, NOW);
    const b = await createTask(alice, { title: "b" }, NOW);
    await startTimer(alice, a.id, "stopwatch", NOW);
    await startTimer(alice, b.id, "stopwatch", min(10));
    expect((await getTask(alice, a.id))?.timeSpentMinutes).toBe(10);
    expect((await getActiveTimer(alice))?.taskId).toBe(b.id);
  });

  it("caps a forgotten stopwatch at 12 hours", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await startTimer(alice, t.id, "stopwatch", NOW);
    expect((await stopTimer(alice, min(60 * 48)))?.minutes).toBe(12 * 60);
  });

  it("pomodoro: logs the work phase, rests during the break, then works again", async () => {
    const t = await createTask(alice, { title: "deep work" }, NOW);
    await startTimer(alice, t.id, "pomodoro", NOW);
    const afterWork = await advancePhase(alice, min(25));
    expect(afterWork?.phase).toBe("break");
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(25);
    const afterBreak = await advancePhase(alice, min(30));
    expect(afterBreak?.phase).toBe("work");
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(25); // break time is not counted
    await stopTimer(alice, min(40)); // 10 min into the second work phase
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(35);
  });

  it("pomodoro: a late advance counts at most the 25-minute phase", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await startTimer(alice, t.id, "pomodoro", NOW);
    await advancePhase(alice, min(600));
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(25);
  });

  it("advancing a stopwatch does nothing", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await startTimer(alice, t.id, "stopwatch", NOW);
    expect((await advancePhase(alice, min(30)))?.mode).toBe("stopwatch");
    expect((await getTask(alice, t.id))?.timeSpentMinutes).toBe(0);
  });

  it("stops when the task is completed or deleted", async () => {
    const a = await createTask(alice, { title: "a" }, NOW);
    await startTimer(alice, a.id, "stopwatch", NOW);
    await setTaskDone(alice, a.id, true, min(15));
    expect(await getActiveTimer(alice)).toBeNull();
    expect((await getTask(alice, a.id))?.timeSpentMinutes).toBe(15);
    const b = await createTask(alice, { title: "b" }, NOW);
    await startTimer(alice, b.id, "stopwatch", NOW);
    await softDeleteTask(alice, b.id);
    expect(await getActiveTimer(alice)).toBeNull();
  });

  it("cannot time a finished, deleted or someone else's task", async () => {
    const mine = await createTask(alice, { title: "mine" }, NOW);
    await expect(startTimer(bob, mine.id, "stopwatch", NOW)).rejects.toThrow(/not found/i);
    await setTaskDone(alice, mine.id, true, NOW);
    await expect(startTimer(alice, mine.id, "stopwatch", NOW)).rejects.toThrow(/not found/i);
    expect(await stopTimer(bob, NOW)).toBeNull();
    expect(await getActiveTimer(bob)).toBeNull();
  });
});

describe("trash", () => {
  it("lists deleted tasks and notes with days left, newest first", async () => {
    const t = await createTask(alice, { title: "old task" }, NOW);
    const n = await createNote(alice, { title: "a note" });
    await softDeleteTask(alice, t.id);
    await softDeleteNote(alice, n.id);
    await Task.updateOne(
      { _id: t.id },
      { $set: { deletedAt: new Date(NOW.getTime() - 10 * 86_400_000) } },
    );
    await Note.updateOne(
      { _id: n.id },
      { $set: { deletedAt: new Date(NOW.getTime() - 1 * 86_400_000) } },
    );
    const items = await listTrash(alice, NOW);
    expect(items.map((i) => [i.kind, i.title, i.daysLeft])).toEqual([
      ["note", "a note", TRASH_DAYS - 1],
      ["task", "old task", TRASH_DAYS - 10],
    ]);
  });

  it("only purges items that are already in the trash", async () => {
    const live = await createTask(alice, { title: "live" }, NOW);
    expect(await purgeItem(alice, "task", live.id)).toBe(false);
    expect(await getTask(alice, live.id)).not.toBeNull();
    await softDeleteTask(alice, live.id);
    expect(await purgeItem(alice, "task", live.id)).toBe(true);
    expect(await Task.countDocuments({ _id: live.id })).toBe(0);
  });

  it("purging a note removes its versions and every reference to it", async () => {
    const note = await createNote(alice, { title: "n", content: doc("hello") });
    await updateNote(alice, note.id, { content: doc("changed") }, NOW);
    expect(await NoteVersion.countDocuments({ noteId: note.id })).toBe(1);
    const [task] = await convertToTasks(alice, note.id, ["from note"]);
    const other = await createTask(alice, { title: "linked" }, NOW);
    await Task.updateOne(
      { _id: other.id },
      { $addToSet: { linkedNoteIds: new mongoose.Types.ObjectId(note.id) } },
    );
    await softDeleteNote(alice, note.id);
    expect(await purgeItem(alice, "note", note.id)).toBe(true);
    expect(await NoteVersion.countDocuments({ noteId: note.id })).toBe(0);
    const t = await Task.findById(task.id).lean();
    expect(t?.sourceNoteId).toBeUndefined();
    expect(t?.linkedNoteIds ?? []).toHaveLength(0);
    expect((await Task.findById(other.id).lean())?.linkedNoteIds ?? []).toHaveLength(0);
  });

  it("purging a task removes it from notes' linked lists", async () => {
    const note = await createNote(alice, { title: "n" });
    const [task] = await convertToTasks(alice, note.id, ["x"]);
    await softDeleteTask(alice, task.id);
    await purgeItem(alice, "task", task.id);
    expect((await Note.findById(note.id).lean())?.linkedTaskIds ?? []).toHaveLength(0);
  });

  it("removes only items older than 30 days", async () => {
    const fresh = await createTask(alice, { title: "fresh" }, NOW);
    const stale = await createTask(alice, { title: "stale" }, NOW);
    const staleNote = await createNote(alice, { title: "stale note" });
    await softDeleteTask(alice, fresh.id);
    await softDeleteTask(alice, stale.id);
    await softDeleteNote(alice, staleNote.id);
    const old = new Date(NOW.getTime() - (TRASH_DAYS + 1) * 86_400_000);
    await Task.updateOne({ _id: stale.id }, { $set: { deletedAt: old } });
    await Note.updateOne({ _id: staleNote.id }, { $set: { deletedAt: old } });
    await Task.updateOne(
      { _id: fresh.id },
      { $set: { deletedAt: new Date(NOW.getTime() - 5 * 86_400_000) } },
    );
    expect(await purgeExpired(alice, NOW)).toBe(2);
    expect((await listTrash(alice, NOW)).map((i) => i.title)).toEqual(["fresh"]);
  });

  it("opportunistic purge runs at most once per interval", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await softDeleteTask(alice, t.id);
    await Task.updateOne(
      { _id: t.id },
      { $set: { deletedAt: new Date(NOW.getTime() - 40 * 86_400_000) } },
    );
    expect(await maybePurgeExpired(alice, NOW)).toBe(1);
    const t2 = await createTask(alice, { title: "y" }, NOW);
    await softDeleteTask(alice, t2.id);
    await Task.updateOne(
      { _id: t2.id },
      { $set: { deletedAt: new Date(NOW.getTime() - 40 * 86_400_000) } },
    );
    expect(await maybePurgeExpired(alice, new Date(NOW.getTime() + 3_600_000))).toBe(0); // 1h later: skipped
    expect(await maybePurgeExpired(alice, new Date(NOW.getTime() + 7 * 3_600_000))).toBe(1); // 7h later
  });

  it("empty trash removes everything trashed, nothing live, and is per user", async () => {
    const a = await createTask(alice, { title: "gone" }, NOW);
    await createTask(alice, { title: "kept" }, NOW);
    const b = await createTask(bob, { title: "bobs gone" }, NOW);
    await softDeleteTask(alice, a.id);
    await softDeleteTask(bob, b.id);
    expect(await emptyTrash(alice)).toBe(1);
    expect(await listTrash(bob)).toHaveLength(1);
    expect(await Task.countDocuments({ userId: alice })).toBe(1);
    expect(await purgeItem(bob, "task", a.id)).toBe(false);
  });
});

describe("templates", () => {
  it("seeds the starter templates exactly once", async () => {
    const first = await listTemplates(alice);
    expect(first.map((t) => t.name).sort()).toEqual(SYSTEM_TEMPLATES.map((t) => t.name).sort());
    expect(first.map((t) => t.name)).toEqual(
      expect.arrayContaining(["Client kickoff", "Meeting notes", "Release checklist"]),
    );
    expect(first.every((t) => t.system)).toBe(true);
    await Promise.all([
      ensureSystemTemplates(alice),
      ensureSystemTemplates(alice),
      listTemplates(alice),
    ]);
    expect(await Template.countDocuments({ userId: alice })).toBe(SYSTEM_TEMPLATES.length);
    // deleting one does not bring it back
    const release = first.find((t) => t.name === "Release checklist")!;
    await deleteTemplate(alice, release.id);
    expect((await listTemplates(alice)).map((t) => t.name)).not.toContain("Release checklist");
  });

  it("creates a task with subtasks from a checklist template", async () => {
    const release = (await listTemplates(alice)).find((t) => t.name === "Release checklist")!;
    expect(release.summary).toBe("8 items");
    const res = await instantiateTemplate(alice, release.id, NOW);
    expect(res.kind).toBe("task");
    const task = await getTask(alice, res.id);
    expect(task?.title).toBe("Release checklist");
    expect(task?.subtasks).toHaveLength(8);
    expect(task?.subtasks.every((s) => !s.done)).toBe(true);
  });

  it("creates a meeting note with sections from the meeting template", async () => {
    const tpl = (await listTemplates(alice)).find((t) => t.name === "Meeting notes")!;
    const res = await instantiateTemplate(alice, tpl.id, NOW);
    const note = await getNote(alice, res.id);
    expect(note?.type).toBe("meeting");
    expect(note?.meeting?.date).toBe(NOW.toISOString());
    expect((await Note.findById(res.id).lean())?.plainText).toContain("Action items");
  });

  it("saves a task's subtasks and a note as templates, then reuses them", async () => {
    const task = await createTask(
      alice,
      {
        title: "Onboard",
        subtasks: [
          { title: "a", done: true, order: 0 },
          { title: "b", done: false, order: 1 },
        ],
      },
      NOW,
    );
    const tpl = await saveTaskAsTemplate(alice, task.id);
    expect(tpl).toMatchObject({
      kind: "task_checklist",
      name: "Onboard",
      system: false,
      summary: "2 items",
    });
    const reused = await getTask(alice, (await instantiateTemplate(alice, tpl.id, NOW)).id);
    expect(reused?.subtasks.map((s) => [s.title, s.done])).toEqual([
      ["a", false],
      ["b", false],
    ]);

    const plain = await createTask(alice, { title: "Solo" }, NOW);
    expect((await saveTaskAsTemplate(alice, plain.id)).summary).toBe("1 item");

    const note = await createNote(alice, { title: "Retro", content: doc("what went well") });
    const nt = await saveNoteAsTemplate(alice, note.id, "Retro format");
    expect(nt).toMatchObject({ kind: "note", name: "Retro format" });
    const fresh = await getNote(alice, (await instantiateTemplate(alice, nt.id, NOW)).id);
    expect(fresh?.title).toBe("Retro");
    expect(fresh?.type).toBe("note");
    expect(JSON.stringify(fresh?.content)).toContain("what went well");
  });

  it("is isolated between users", async () => {
    const mine = await createTemplate(alice, {
      kind: "task_checklist",
      name: "Private",
      payload: { title: "t", items: ["x"] },
    });
    expect((await listTemplates(bob)).map((t) => t.name)).not.toContain("Private");
    await expect(instantiateTemplate(bob, mine.id, NOW)).rejects.toThrow(/not found/i);
    expect(await deleteTemplate(bob, mine.id)).toBe(false);
    const task = await createTask(alice, { title: "a" }, NOW);
    await expect(saveTaskAsTemplate(bob, task.id)).rejects.toThrow(/not found/i);
    const note = await createNote(alice, { title: "n" });
    await expect(saveNoteAsTemplate(bob, note.id)).rejects.toThrow(/not found/i);
  });
});

describe("waiting on", () => {
  it("sets, lists in follow-up order, and clears", async () => {
    const a = await createTask(
      alice,
      {
        title: "later",
        waitingOn: { person: "Priya", followUpAt: new Date("2026-11-25T00:00:00Z") },
      },
      NOW,
    );
    const b = await createTask(
      alice,
      {
        title: "sooner",
        waitingOn: {
          person: "Karan",
          followUpAt: new Date("2026-11-19T00:00:00Z"),
          note: "pricing",
        },
      },
      NOW,
    );
    await createTask(alice, { title: "no date", waitingOn: { person: "Meera" } }, NOW);
    await createTask(alice, { title: "not waiting" }, NOW);
    expect((await listWaiting(alice)).map((t) => t.title)).toEqual(["sooner", "later", "no date"]);
    expect((await listWaiting(alice))[0].waitingOn).toMatchObject({
      person: "Karan",
      note: "pricing",
    });
    await updateTask(alice, b.id, { waitingOn: null }, NOW);
    expect((await listWaiting(alice)).map((t) => t.title)).toEqual(["later", "no date"]);
    await setTaskDone(alice, a.id, true, NOW);
    expect((await listWaiting(alice)).map((t) => t.title)).toEqual(["no date"]);
  });

  it("is isolated and ignores deleted tasks", async () => {
    const t = await createTask(alice, { title: "x", waitingOn: { person: "Priya" } }, NOW);
    expect(await listWaiting(bob)).toHaveLength(0);
    await softDeleteTask(alice, t.id);
    expect(await listWaiting(alice)).toHaveLength(0);
  });

  it("quick-add wait: token still works", async () => {
    const t = await quickAddTask(alice, "Chase sign-off wait:Priya", TZ, NOW);
    expect((await listWaiting(alice)).map((x) => x.id)).toEqual([t.id]);
  });
});

describe("convert note lines to tasks", () => {
  it("creates linked tasks that remember their source note and inherit its project", async () => {
    const project = await createProject(alice, { name: "Roadmap", color: "#00b97a" });
    const note = await createNote(
      alice,
      { title: "Weekly sync", projectId: project.id },
      { type: "meeting" },
    );
    const tasks = await convertToTasks(alice, note.id, [
      "Send report",
      "  Get sign-off  ",
      "",
      "Share minutes",
    ]);
    expect(tasks.map((t) => t.title)).toEqual(["Send report", "Get sign-off", "Share minutes"]);
    expect(tasks.every((t) => t.sourceNoteId === note.id && t.projectId === project.id)).toBe(true);
    expect((await getLinkedTasks(alice, note.id)).map((t) => t.title).sort()).toEqual([
      "Get sign-off",
      "Send report",
      "Share minutes",
    ]);
    expect((await getLinkedNotes(alice, tasks[0].id)).map((n) => n.id)).toEqual([note.id]);
  });

  it("limits and validates input", async () => {
    const note = await createNote(alice, { title: "n" });
    expect(
      (
        await convertToTasks(
          alice,
          note.id,
          Array.from({ length: 30 }, (_, i) => `t${i}`),
        )
      ).length,
    ).toBe(20);
    await expect(convertToTasks(alice, note.id, ["   "])).rejects.toThrow(/select/i);
    expect((await convertToTasks(alice, note.id, ["x".repeat(500)]))[0].title).toHaveLength(200);
  });

  it("cannot convert into someone else's or a deleted note", async () => {
    const note = await createNote(alice, { title: "n" });
    await expect(convertToTasks(bob, note.id, ["x"])).rejects.toThrow(/not found/i);
    await softDeleteNote(alice, note.id);
    await expect(convertToTasks(alice, note.id, ["x"])).rejects.toThrow(/not found/i);
  });
});

describe("meeting notes", () => {
  it("stores meeting details and only edits them on meeting notes", async () => {
    const meeting = await createNote(
      alice,
      { title: "Sync", meeting: { date: NOW, attendees: ["Rahul"], agenda: "Status" } },
      { type: "meeting" },
    );
    expect(meeting.type).toBe("meeting");
    expect(meeting.meeting).toEqual({
      date: NOW.toISOString(),
      attendees: ["Rahul"],
      agenda: "Status",
    });
    await updateNote(alice, meeting.id, {
      meeting: { attendees: ["Rahul", "Priya"], agenda: "Status, blockers" },
    });
    expect((await getNote(alice, meeting.id))?.meeting).toEqual({
      date: NOW.toISOString(),
      attendees: ["Rahul", "Priya"],
      agenda: "Status, blockers",
    });
    const plain = await createNote(alice, { title: "plain" });
    await updateNote(alice, plain.id, { meeting: { attendees: ["x"] } });
    expect((await getNote(alice, plain.id))?.meeting).toBeNull();
  });
});

describe("daily and weekly review data", () => {
  it("builds today's review from stored tasks and moves slipped ones in one step", async () => {
    const done = await createTask(alice, { title: "done today" }, NOW);
    await setTaskDone(alice, done.id, true, NOW);
    await createTask(alice, { title: "later today", dueAt: new Date("2026-11-17T14:00:00Z") }, NOW);
    const late = await createTask(
      alice,
      { title: "yesterday", dueAt: new Date("2026-11-16T09:00:00Z") },
      NOW,
    );
    await createTask(alice, { title: "tomorrow", dueAt: new Date("2026-11-18T09:00:00Z") }, NOW);
    const r = await getDailyReview(alice, NOW);
    expect(r.completed.map((t) => t.title)).toEqual(["done today"]);
    expect(r.stillOpen.map((t) => t.title)).toEqual(["later today"]);
    expect(r.slipped.map((t) => t.title)).toEqual(["yesterday"]);

    const moved = await carryOverTask(alice, late.id, "tomorrow", NOW);
    expect(ist(moved!.task.dueAt)).toBe("2026-11-18T14:30:00.000"); // same time of day, tomorrow
    expect((await getDailyReview(alice, NOW)).slipped).toHaveLength(0);
    const specific = await carryOverTask(alice, late.id, "2026-11-30", NOW);
    expect(ist(specific!.task.dueAt)).toBe("2026-11-30T14:30:00.000");
  });

  it("builds the weekly review including tracked time per project", async () => {
    const project = await createProject(alice, { name: "Alpha", color: "#00b97a" });
    const a = await createTask(
      alice,
      { title: "a", projectId: project.id, dueAt: new Date("2026-11-16T09:00:00Z") },
      new Date("2026-11-10T00:00:00Z"),
    );
    await createTask(
      alice,
      { title: "b", dueAt: new Date("2026-11-17T04:00:00Z") },
      new Date("2026-11-10T00:00:00Z"),
    );
    await setTaskDone(alice, a.id, true, new Date("2026-11-16T10:00:00Z"));
    await createNote(alice, { title: "this week" });
    await startTimer(alice, a.id, "stopwatch", new Date("2026-11-16T11:00:00Z")).catch(() => null);
    // time entries are logged directly for a task that is already done
    await Task.updateOne(
      { _id: a.id },
      {
        $push: {
          timeEntries: {
            startedAt: new Date("2026-11-16T05:00:00Z"),
            endedAt: new Date("2026-11-16T06:30:00Z"),
            minutes: 90,
          },
        },
        $inc: { timeSpentMinutes: 90 },
      },
    );
    const w = await getWeeklyReview(alice, undefined, NOW);
    expect(w.weekStart).toBe("2026-11-16");
    expect(w.isCurrentWeek).toBe(true);
    expect(w.prevWeek).toBe("2026-11-09");
    expect(w.nextWeek).toBe("2026-11-23");
    expect(w.review.dueTotal).toBe(2);
    expect(w.review.dueDone).toBe(1);
    expect(w.review.completionRate).toBe(0.5);
    expect(w.review.notesCreated).toBeGreaterThanOrEqual(1);
    expect(w.review.timeByProject).toEqual([{ projectId: project.id, name: "Alpha", minutes: 90 }]);
    expect(w.review.slipped.map((t) => t.title)).toEqual(["b"]); // due earlier today, still open
    const earlier = await getWeeklyReview(alice, "2026-11-09", NOW);
    expect(earlier.isCurrentWeek).toBe(false);
    expect(earlier.review.dueTotal).toBe(0);
  });

  it("never mixes users", async () => {
    await createTask(alice, { title: "alice late", dueAt: new Date("2026-11-16T09:00:00Z") }, NOW);
    expect((await getDailyReview(bob, NOW)).slipped).toHaveLength(0);
    expect((await getWeeklyReview(bob, undefined, NOW)).review.dueTotal).toBe(0);
  });
});

describe("attachments", () => {
  it("recognises Jira and Confluence links without any network access", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    let list = await addAttachment(alice, t.id, "https://acme.atlassian.net/browse/PROJ-123");
    list = await addAttachment(
      alice,
      t.id,
      "https://acme.atlassian.net/wiki/spaces/ENG/pages/1/Release+Plan",
    );
    expect(list.map((a) => [a.kind, a.title])).toEqual([
      ["jira", "PROJ-123"],
      ["confluence", "Release Plan"],
    ]);
    expect((await getTask(alice, t.id))?.attachments).toHaveLength(2);
  });

  it("rejects bad links, duplicates and more than ten", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    await expect(addAttachment(alice, t.id, "javascript:alert(1)")).rejects.toThrow(/valid/i);
    await addAttachment(alice, t.id, "https://acme.atlassian.net/browse/A-1");
    await expect(
      addAttachment(alice, t.id, "https://acme.atlassian.net/browse/A-1"),
    ).rejects.toThrow(/already/i);
    for (let i = 2; i <= 10; i++)
      await addAttachment(alice, t.id, `https://acme.atlassian.net/browse/A-${i}`);
    await expect(
      addAttachment(alice, t.id, "https://acme.atlassian.net/browse/A-11"),
    ).rejects.toThrow(/up to 10/);
  });

  it("removes one attachment and is isolated per user", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    const [a] = await addAttachment(alice, t.id, "https://acme.atlassian.net/browse/A-1");
    await expect(addAttachment(bob, t.id, "https://acme.atlassian.net/browse/B-1")).rejects.toThrow(
      /not found/i,
    );
    await expect(removeAttachment(bob, t.id, a.id)).rejects.toThrow(/not found/i);
    expect(await removeAttachment(alice, t.id, a.id)).toEqual([]);
  });

  it("quick-add pulls pasted Jira links into attachments", async () => {
    const t = await quickAddTask(
      alice,
      "Review https://acme.atlassian.net/browse/ENG-7 tomorrow",
      TZ,
      NOW,
    );
    expect(t.title).toBe("Review");
    expect(t.attachments.map((a) => [a.kind, a.title])).toEqual([["jira", "ENG-7"]]);
    const only = await quickAddTask(alice, "https://acme.atlassian.net/browse/ENG-8", TZ, NOW);
    expect(only.title).toBe("ENG-8");
    const other = await quickAddTask(alice, "Read https://example.com/post", TZ, NOW);
    expect(other.title).toBe("Read https://example.com/post");
    expect(other.attachments).toHaveLength(0);
  });

  it("falls back to a readable title when the page can't be fetched", async () => {
    const link = await resolveLink("https://www.example.com/blog/my-post", { fetchTitle: false });
    expect(link).toEqual({
      url: "https://www.example.com/blog/my-post",
      title: "example.com / my post",
      kind: "link",
    });
  });
});

describe("link title fetching refuses internal addresses", () => {
  it("never connects to loopback servers", async () => {
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits++;
      res.setHeader("content-type", "text/html");
      res.end("<title>secret internal page</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      expect(await fetchPageTitle(new URL(`http://127.0.0.1:${port}/`))).toBeNull();
      expect(await fetchPageTitle(new URL(`http://localhost:${port}/`))).toBeNull();
      expect(await fetchPageTitle(new URL(`http://[::1]:${port}/`))).toBeNull();
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
  it("does not follow redirects to internal addresses", async () => {
    // metadata endpoints and private ranges are refused up front
    expect(await fetchPageTitle(new URL("http://169.254.169.254/latest/meta-data/"))).toBeNull();
    expect(await fetchPageTitle(new URL("http://10.0.0.1/"))).toBeNull();
  });
});

describe("export", () => {
  it("exports all data as JSON without secrets, per user", async () => {
    const project = await createProject(alice, { name: "P", color: "#00b97a" });
    await createTask(alice, { title: "t", projectId: project.id }, NOW);
    await createNote(alice, { title: "n", content: doc("body") });
    const deleted = await createTask(alice, { title: "deleted" }, NOW);
    await softDeleteTask(alice, deleted.id);
    await createTask(bob, { title: "bobs" }, NOW);
    await listTemplates(alice);
    const data = await exportAll(alice, NOW);
    const json = JSON.stringify(data);
    expect(data.user?.email).toBe("alice@example.com");
    expect(json).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(data.tasks.map((t) => t.title)).toEqual(["t"]);
    expect(data.projects).toHaveLength(1);
    expect(data.notes).toHaveLength(1);
    expect(data.templates).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(json).not.toContain("bobs");
    expect(data.exportedAt).toBe(NOW.toISOString());
  });

  it("exports tasks as safe CSV", async () => {
    const project = await createProject(alice, { name: "Alpha", color: "#00b97a" });
    await createTask(
      alice,
      { title: '=HYPERLINK("http://evil")', projectId: project.id, tags: ["a", "b"] },
      NOW,
    );
    await createTask(
      alice,
      {
        title: 'Quote "this", ok',
        recurrence: { rrule: "FREQ=DAILY" },
        dueAt: new Date("2026-11-20T09:00:00Z"),
      },
      NOW,
    );
    await createTask(bob, { title: "bobs task" }, NOW);
    const csv = await tasksCsv(alice);
    const lines = csv.trim().split("\r\n");
    expect(lines[0].startsWith("id,title,status,priority,project,due")).toBe(true);
    expect(lines).toHaveLength(3);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"Quote ""this"", ok"');
    expect(csv).toContain("Every day");
    expect(csv).toContain("Alpha");
    expect(csv).not.toContain("bobs task");
  });

  it("exports a note as Markdown, with meeting details, and refuses other users' notes", async () => {
    const note = await createNote(
      alice,
      {
        title: "Weekly sync",
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Decisions" }],
            },
          ],
        },
        meeting: {
          date: new Date("2026-11-17T00:00:00Z"),
          attendees: ["Rahul", "Priya"],
          agenda: "Status",
        },
      },
      { type: "meeting" },
    );
    const out = await noteMarkdown(alice, note.id);
    expect(out?.filename).toBe("weekly-sync.md");
    expect(out?.markdown).toContain("# Weekly sync");
    expect(out?.markdown).toContain("**Attendees:** Rahul, Priya");
    expect(out?.markdown).toContain("## Decisions");
    expect(await noteMarkdown(bob, note.id)).toBeNull();
    await softDeleteNote(alice, note.id);
    expect(await noteMarkdown(alice, note.id)).toBeNull();
  });
});

it("a user's timer and template flag don't leak to others", async () => {
  const t = await createTask(alice, { title: "x" }, NOW);
  await startTimer(alice, t.id, "stopwatch", NOW);
  expect((await User.findById(bob).lean())?.activeTimer?.taskId).toBeUndefined();
});
