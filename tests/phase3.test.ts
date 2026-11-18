import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerUser } from "@/server/users";
import { createProject } from "@/server/projects";
import {
  createTask,
  getTask,
  listBoardTasks,
  listCalendarTasks,
  listTasks,
  moveTask,
  quickAddTask,
  rescheduleTask,
  setTaskDone,
  softDeleteTask,
  updateTask,
} from "@/server/tasks";
import {
  applyReminderAction,
  claimReminders,
  dismissReminder,
  getReminderBundle,
  snoozeReminder,
} from "@/server/reminders";
import { Task } from "@/models/Task";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-17T04:30:00Z"); // Tue 17 Nov 2026, 10:00 IST
const ist = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().replace("Z", "") : null;
const at = (iso: string) => new Date(iso);
const mins = (n: number) => new Date(NOW.getTime() + n * 60_000);

let mongod: MongoMemoryServer;
let alice: string;
let bob: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("workdesk-phase3-test");
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

const openTasks = async (userId: string) =>
  (await Task.find({ userId, deletedAt: null, status: { $ne: "done" } })
    .sort({ dueAt: 1 })
    .lean()) ?? [];

describe("recurring tasks", () => {
  const daily = { rrule: "FREQ=DAILY" };
  const base = { title: "Standup", dueAt: at("2026-11-17T09:00:00Z"), recurrence: daily }; // 14:30 IST

  it("completing creates exactly the next occurrence, keeping the details", async () => {
    const project = await createProject(alice, { name: "P", color: "#00b97a" });
    const t = await createTask(
      alice,
      {
        ...base,
        projectId: project.id,
        priority: 2,
        tags: ["ops"],
        subtasks: [{ title: "agenda", done: true, order: 0 }],
      },
      NOW,
    );
    const res = await setTaskDone(alice, t.id, true, NOW);
    expect(res?.task.status).toBe("done");
    expect(res?.next).toMatchObject({
      title: "Standup",
      status: "todo",
      priority: 2,
      tags: ["ops"],
      projectId: project.id,
      dueAt: "2026-11-18T09:00:00.000Z",
    });
    expect(res?.next?.subtasks.map((s) => [s.title, s.done])).toEqual([["agenda", false]]);
    expect(res?.next?.recurrence?.rrule).toBe("FREQ=DAILY");
    const stored = await Task.findOne({ _id: res?.next?.id }).lean();
    expect(String(stored?.recurrenceParentId)).toBe(t.id);
    expect((await openTasks(alice)).map((x) => String(x._id))).toEqual([res?.next?.id]);
  });

  it("is idempotent: reopening removes the copy and completing again makes exactly one", async () => {
    const t = await createTask(alice, base, NOW);
    const first = await setTaskDone(alice, t.id, true, NOW);
    expect(first?.next).not.toBeNull();
    await setTaskDone(alice, t.id, false, NOW);
    expect(await openTasks(alice)).toHaveLength(1); // only the reopened original
    const again = await setTaskDone(alice, t.id, true, NOW);
    expect(again?.next).not.toBeNull();
    expect(await openTasks(alice)).toHaveLength(1);
    expect(await Task.countDocuments({ userId: alice })).toBe(3); // original + 2 copies (one soft-deleted)
  });

  it("completing an already-completed task does not spawn again", async () => {
    const t = await createTask(alice, base, NOW);
    await setTaskDone(alice, t.id, true, NOW);
    const second = await setTaskDone(alice, t.id, true, NOW);
    expect(second?.next).toBeNull();
    expect(await openTasks(alice)).toHaveLength(1);
  });

  it("concurrent completions create a single copy", async () => {
    const t = await createTask(alice, base, NOW);
    const results = await Promise.all([
      setTaskDone(alice, t.id, true, NOW),
      setTaskDone(alice, t.id, true, NOW),
    ]);
    expect(results.filter((r) => r?.next).length).toBe(1);
    expect(await openTasks(alice)).toHaveLength(1);
  });

  it("does not spawn after the end date, or for non-repeating tasks", async () => {
    const limited = await createTask(
      alice,
      { ...base, recurrence: { rrule: "FREQ=DAILY", endsAt: at("2026-11-17T20:00:00Z") } },
      NOW,
    );
    expect((await setTaskDone(alice, limited.id, true, NOW))?.next).toBeNull();
    const plain = await createTask(
      alice,
      { title: "once", dueAt: at("2026-11-17T09:00:00Z") },
      NOW,
    );
    expect((await setTaskDone(alice, plain.id, true, NOW))?.next).toBeNull();
  });

  it("a late completion jumps past today's already-missed occurrences", async () => {
    const t = await createTask(alice, { ...base, dueAt: at("2026-11-10T09:00:00Z") }, NOW); // a week old
    const res = await setTaskDone(alice, t.id, true, NOW);
    expect(res?.next?.dueAt).toBe("2026-11-17T09:00:00.000Z"); // later today, not 11 Nov
  });

  it("requires a due date and a valid rule", async () => {
    await expect(createTask(alice, { title: "x", recurrence: daily }, NOW)).rejects.toThrow(
      /due date/,
    );
    const t = await createTask(alice, { title: "plain" }, NOW);
    await expect(updateTask(alice, t.id, { recurrence: daily }, NOW)).rejects.toThrow(/due date/);
    const ok = await updateTask(
      alice,
      t.id,
      { dueAt: at("2026-11-20T04:00:00Z"), recurrence: daily },
      NOW,
    );
    expect(ok?.recurrence?.rrule).toBe("FREQ=DAILY");
    const cleared = await updateTask(alice, t.id, { recurrence: null }, NOW);
    expect(cleared?.recurrence).toBeNull();
  });

  it("carries relative reminders to the next occurrence", async () => {
    const t = await createTask(alice, base, NOW); // default 15-min reminder at 14:15 IST
    expect(t.reminders).toHaveLength(1);
    const res = await setTaskDone(alice, t.id, true, NOW);
    expect(res?.next?.reminders.map((r) => [r.offsetMin, r.at])).toEqual([
      [15, "2026-11-18T08:45:00.000Z"],
    ]);
  });

  it("quick-add `every day` without a date starts today; `every monday` starts next Monday", async () => {
    const d = await quickAddTask(alice, "Water plants every day", TZ, NOW);
    expect(ist(d.dueAt)).toBe("2026-11-17T00:00:00.000");
    expect(d.allDay).toBe(true);
    const m = await quickAddTask(alice, "Weekly sync every monday", TZ, NOW);
    expect(ist(m.dueAt)).toBe("2026-11-23T00:00:00.000");
  });
});

describe("reminder rules", () => {
  it("timed tasks get the default 15-minute reminder; past ones are skipped", async () => {
    const future = await createTask(alice, { title: "a", dueAt: at("2026-11-17T09:00:00Z") }, NOW);
    expect(future.reminders.map((r) => [r.offsetMin, r.at])).toEqual([
      [15, "2026-11-17T08:45:00.000Z"],
    ]);
    const soon = await createTask(alice, { title: "b", dueAt: mins(5) }, NOW); // reminder would be 10 min ago
    expect(soon.reminders).toHaveLength(0);
    const none = await createTask(alice, { title: "c" }, NOW);
    expect(none.reminders).toHaveLength(0);
  });

  it("all-day tasks remind at the start of work hours on the due day", async () => {
    // Wed 18 Nov, all-day
    const t = await createTask(
      alice,
      { title: "a", dueAt: at("2026-11-17T18:30:00Z"), allDay: true },
      NOW,
    );
    expect(t.reminders.map((r) => ist(r.at))).toEqual(["2026-11-18T09:30:00.000"]);
    // all-day today: 09:30 already passed, so nothing is scheduled
    const today = await createTask(
      alice,
      { title: "b", dueAt: at("2026-11-16T18:30:00Z"), allDay: true },
      NOW,
    );
    expect(today.reminders).toHaveLength(0);
  });

  it("explicit reminders replace the defaults and stop automatic ones", async () => {
    const due = at("2026-11-18T09:00:00Z");
    const t = await createTask(
      alice,
      {
        title: "x",
        dueAt: due,
        reminders: [
          { offsetMin: 60 },
          { offsetMin: 1440 },
          { offsetMin: null, at: at("2026-11-18T07:00:00Z") },
        ],
      },
      NOW,
    );
    expect(t.reminders.map((r) => r.offsetMin)).toEqual([1440, null, 60]); // ordered by time
    const cleared = await updateTask(alice, t.id, { reminders: [] }, NOW);
    expect(cleared?.reminders).toHaveLength(0);
    // moving the date later does not bring the default back: the user customised reminders
    const moved = await updateTask(alice, t.id, { dueAt: at("2026-11-19T09:00:00Z") }, NOW);
    expect(moved?.reminders).toHaveLength(0);
  });

  it("caps reminders per task and removes duplicate times", async () => {
    const t = await createTask(
      alice,
      {
        title: "x",
        dueAt: at("2026-11-25T09:00:00Z"),
        reminders: [0, 5, 10, 15, 30, 60, 120].map((offsetMin) => ({ offsetMin })),
      },
      NOW,
    );
    expect(t.reminders).toHaveLength(5);
    const dup = await createTask(
      alice,
      {
        title: "y",
        dueAt: at("2026-11-25T09:00:00Z"),
        reminders: [{ offsetMin: 15 }, { offsetMin: 15 }],
      },
      NOW,
    );
    expect(dup.reminders).toHaveLength(1);
  });

  it("moving the due date moves relative reminders, resets notified state, keeps custom ones", async () => {
    const t = await createTask(
      alice,
      {
        title: "x",
        dueAt: at("2026-11-18T09:00:00Z"),
        reminders: [{ offsetMin: 15 }, { offsetMin: null, at: at("2026-11-18T03:00:00Z") }],
      },
      NOW,
    );
    const relative = t.reminders.find((r) => r.offsetMin === 15)!;
    await claimReminders(alice, [{ taskId: t.id, reminderId: relative.id }], NOW);
    const moved = await updateTask(alice, t.id, { dueAt: at("2026-11-19T09:00:00Z") }, NOW);
    const rel = moved?.reminders.find((r) => r.offsetMin === 15);
    expect(rel?.at).toBe("2026-11-19T08:45:00.000Z");
    expect(rel?.sentAt).toBeNull();
    expect(moved?.reminders.find((r) => r.offsetMin === null)?.at).toBe("2026-11-18T03:00:00.000Z");
  });

  it("keeps notified state when a reminder is re-saved unchanged", async () => {
    const t = await createTask(alice, { title: "x", dueAt: at("2026-11-18T09:00:00Z") }, NOW);
    const r = t.reminders[0];
    await claimReminders(alice, [{ taskId: t.id, reminderId: r.id }], NOW);
    const resaved = await updateTask(
      alice,
      t.id,
      { reminders: [{ id: r.id, offsetMin: r.offsetMin }] },
      NOW,
    );
    expect(resaved?.reminders[0].sentAt).not.toBeNull();
  });

  it("clearing the due date drops relative reminders but keeps custom ones", async () => {
    const t = await createTask(
      alice,
      {
        title: "x",
        dueAt: at("2026-11-18T09:00:00Z"),
        reminders: [{ offsetMin: 15 }, { offsetMin: null, at: at("2026-11-18T03:00:00Z") }],
      },
      NOW,
    );
    const cleared = await updateTask(alice, t.id, { dueAt: null }, NOW);
    expect(cleared?.reminders.map((r) => r.offsetMin)).toEqual([null]);
  });

  it("quick-add remind token overrides the default", async () => {
    const t = await quickAddTask(alice, "Send deck tomorrow 5pm remind:2h", TZ, NOW);
    expect(t.reminders.map((r) => r.offsetMin)).toEqual([120]);
    expect(t.title).toBe("Send deck");
  });

  it("quick-add on a calendar day puts the task on that day, all-day", async () => {
    const t = await quickAddTask(alice, "Plan #Roadmap", TZ, NOW, { dayKey: "2026-11-25" });
    expect(ist(t.dueAt)).toBe("2026-11-25T00:00:00.000");
    expect(t.allDay).toBe(true);
    // a bare time applies to the chosen day
    const timed = await quickAddTask(alice, "Dentist 4pm", TZ, NOW, { dayKey: "2026-11-25" });
    expect(ist(timed.dueAt)).toBe("2026-11-25T16:00:00.000");
    expect(timed.allDay).toBe(false);
    // a day named in the text wins over the chosen one
    const named = await quickAddTask(alice, "Call vendor tomorrow", TZ, NOW, {
      dayKey: "2026-11-25",
    });
    expect(ist(named.dueAt)).toBe("2026-11-18T00:00:00.000");
  });
});

describe("reminder bundle, claiming, snooze", () => {
  async function task(title: string, due: Date, offsetMin: number) {
    return createTask(
      alice,
      { title, dueAt: due, reminders: [{ offsetMin }] },
      new Date("2026-11-01T00:00:00Z"),
    );
  }

  it("classifies pending, missed and recent, and ignores done/deleted/dismissed", async () => {
    const pending = await task("pending", mins(60), 0);
    const missed = await task("missed", mins(-30), 0);
    const recent = await task("recent", mins(-20), 0);
    await claimReminders(
      alice,
      [{ taskId: recent.id, reminderId: recent.reminders[0].id }],
      mins(-19),
    );
    const done = await task("done", mins(-10), 0);
    await setTaskDone(alice, done.id, true, NOW);
    const deleted = await task("deleted", mins(10), 0);
    await softDeleteTask(alice, deleted.id);
    const dismissed = await task("dismissed", mins(-15), 0);
    await dismissReminder(alice, dismissed.id, dismissed.reminders[0].id, NOW);
    const tooOld = await task("old", mins(-60 * 30), 0); // 30h ago

    const bundle = await getReminderBundle(alice, NOW);
    expect(bundle.pending.map((i) => i.title)).toEqual(["pending"]);
    expect(bundle.missed.map((i) => i.title)).toEqual(["missed"]);
    expect(bundle.recent.map((i) => i.title)).toEqual(["recent"]);
    expect(bundle.pending[0]).toMatchObject({
      taskId: pending.id,
      reminderId: pending.reminders[0].id,
    });
    expect(bundle.summary).toBeNull();
    void missed;
    void tooOld;
  });

  it("includes the morning summary counts only when enabled", async () => {
    await createTask(alice, { title: "today", dueAt: at("2026-11-17T09:00:00Z") }, NOW);
    await createTask(alice, { title: "late", dueAt: at("2026-11-15T09:00:00Z") }, NOW);
    const { updateUserSettings } = await import("@/server/users");
    await updateUserSettings(alice, {
      reminderPrefs: {
        defaultOffsetMin: 15,
        quietHours: { enabled: false, start: "22:00", end: "07:00" },
        morningSummary: true,
      },
    });
    expect((await getReminderBundle(alice, NOW)).summary).toEqual({ dueToday: 1, overdue: 1 });
  });

  it("only one of several concurrent claimers wins", async () => {
    const t = await task("race", mins(1), 0);
    const ref = { taskId: t.id, reminderId: t.reminders[0].id };
    const results = await Promise.all([1, 2, 3, 4].map(() => claimReminders(alice, [ref], NOW)));
    expect(results.flat()).toHaveLength(1);
    expect(await claimReminders(alice, [ref], NOW)).toEqual([]);
  });

  it("does not claim reminders on completed or deleted tasks", async () => {
    const t = await task("x", mins(1), 0);
    await setTaskDone(alice, t.id, true, NOW);
    expect(
      await claimReminders(alice, [{ taskId: t.id, reminderId: t.reminders[0].id }], NOW),
    ).toEqual([]);
  });

  it("snooze re-arms a reminder as a custom time; tomorrow uses work-start", async () => {
    const t = await task("x", mins(-5), 0);
    const ref = { taskId: t.id, reminderId: t.reminders[0].id };
    await claimReminders(alice, [ref], NOW);
    expect(await snoozeReminder(alice, ref.taskId, ref.reminderId, "10m", NOW)).toBe(true);
    let r = (await getTask(alice, t.id))!.reminders[0];
    expect(r).toMatchObject({ at: mins(10).toISOString(), offsetMin: null, sentAt: null });
    await snoozeReminder(alice, ref.taskId, ref.reminderId, "tomorrow", NOW);
    r = (await getTask(alice, t.id))!.reminders[0];
    expect(ist(r.at)).toBe("2026-11-18T09:30:00.000");
    // a snoozed reminder no longer follows due-date edits
    const moved = await updateTask(alice, t.id, { dueAt: at("2026-11-30T09:00:00Z") }, NOW);
    expect(ist(moved!.reminders[0].at)).toBe("2026-11-18T09:30:00.000");
  });

  it("applyReminderAction handles done (spawning the next repeat), snooze and dismiss", async () => {
    const t = await createTask(
      alice,
      {
        title: "rep",
        dueAt: at("2026-11-17T09:00:00Z"),
        recurrence: { rrule: "FREQ=DAILY" },
        reminders: [{ offsetMin: 15 }],
      },
      NOW,
    );
    const ref = { taskId: t.id, reminderId: t.reminders[0].id };
    const done = await applyReminderAction(alice, { ...ref, action: "done" }, NOW);
    expect(done.ok).toBe(true);
    expect(done.result?.next).not.toBeNull();
    const other = await task("o", mins(5), 0);
    expect(
      (
        await applyReminderAction(
          alice,
          { taskId: other.id, reminderId: other.reminders[0].id, action: "snooze60" },
          NOW,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await applyReminderAction(
          alice,
          { taskId: other.id, reminderId: other.reminders[0].id, action: "dismiss" },
          NOW,
        )
      ).ok,
    ).toBe(true);
    expect(
      (await getReminderBundle(alice, NOW)).pending.find((i) => i.taskId === other.id),
    ).toBeUndefined();
    expect(
      (
        await applyReminderAction(
          alice,
          {
            taskId: other.id,
            reminderId: new mongoose.Types.ObjectId().toString(),
            action: "snooze10",
          },
          NOW,
        )
      ).ok,
    ).toBe(false);
  });
});

describe("sound preferences", () => {
  it("defaults to a chime, and saves and clamps what the user picks", async () => {
    const { getUserSettings, updateUserSettings } = await import("@/server/users");
    expect((await getUserSettings(alice))?.reminderPrefs.sound).toEqual({
      enabled: true,
      tone: "chime",
      volume: 0.6,
    });
    const prefs = (await getUserSettings(alice))!.reminderPrefs;
    await updateUserSettings(alice, {
      reminderPrefs: { ...prefs, sound: { enabled: false, tone: "bell", volume: 0.3 } },
    });
    expect((await getUserSettings(alice))?.reminderPrefs.sound).toEqual({
      enabled: false,
      tone: "bell",
      volume: 0.3,
    });
    // another user is unaffected
    expect((await getUserSettings(bob))?.reminderPrefs.sound.enabled).toBe(true);
  });
});

describe("board moves", () => {
  async function mk(title: string, order: number, extra: Record<string, unknown> = {}) {
    const t = await createTask(alice, { title, ...extra }, NOW);
    await Task.updateOne({ _id: t.id }, { $set: { order } });
    return t;
  }

  it("changes status and places the card between its neighbours", async () => {
    const a = await mk("a", 1000);
    const b = await mk("b", 2000);
    const c = await mk("c", 3000);
    const res = await moveTask(
      alice,
      {
        taskId: c.id,
        column: { kind: "status", value: "in_progress" },
        prevId: a.id,
        nextId: b.id,
      },
      NOW,
    );
    expect(res?.task.status).toBe("in_progress");
    expect(res?.task.order).toBe(1500);
    const board = await listBoardTasks(alice, NOW);
    expect(board.map((t) => t.title)).toEqual(["a", "c", "b"]);
  });

  it("places at the top, bottom, or keeps order in an empty column", async () => {
    const a = await mk("a", 1000);
    const b = await mk("b", 2000);
    expect(
      (
        await moveTask(
          alice,
          { taskId: b.id, column: { kind: "status", value: "todo" }, prevId: null, nextId: a.id },
          NOW,
        )
      )?.task.order,
    ).toBe(0);
    expect(
      (
        await moveTask(
          alice,
          { taskId: a.id, column: { kind: "status", value: "todo" }, prevId: b.id, nextId: null },
          NOW,
        )
      )?.task.order,
    ).toBe(1000);
    const empty = await moveTask(
      alice,
      { taskId: a.id, column: { kind: "status", value: "blocked" }, prevId: null, nextId: null },
      NOW,
    );
    expect(empty?.task.order).toBe(1000);
    expect(empty?.task.status).toBe("blocked");
  });

  it("renumbers when midpoints run out of precision", async () => {
    const a = await mk("a", 1);
    const b = await mk("b", 1 + 1e-9);
    const c = await mk("c", 5000);
    const res = await moveTask(
      alice,
      { taskId: c.id, column: { kind: "status", value: "todo" }, prevId: a.id, nextId: b.id },
      NOW,
    );
    const board = await listBoardTasks(alice, NOW);
    expect(board.map((t) => t.title)).toEqual(["a", "c", "b"]);
    expect(res?.task.order).toBeGreaterThan(0);
  });

  it("moves between projects and priorities; rejects someone else's project", async () => {
    const mine = await createProject(alice, { name: "Mine", color: "#00b97a" });
    const theirs = await createProject(bob, { name: "Theirs", color: "#3b82f6" });
    const t = await mk("t", 1000);
    expect(
      (
        await moveTask(
          alice,
          { taskId: t.id, column: { kind: "project", value: mine.id }, prevId: null, nextId: null },
          NOW,
        )
      )?.task.projectId,
    ).toBe(mine.id);
    expect(
      (
        await moveTask(
          alice,
          { taskId: t.id, column: { kind: "project", value: null }, prevId: null, nextId: null },
          NOW,
        )
      )?.task.projectId,
    ).toBeNull();
    expect(
      (
        await moveTask(
          alice,
          { taskId: t.id, column: { kind: "priority", value: 1 }, prevId: null, nextId: null },
          NOW,
        )
      )?.task.priority,
    ).toBe(1);
    await expect(
      moveTask(
        alice,
        { taskId: t.id, column: { kind: "project", value: theirs.id }, prevId: null, nextId: null },
        NOW,
      ),
    ).rejects.toThrow(/Project not found/);
  });

  it("dropping a repeating task into Done spawns the next occurrence", async () => {
    const t = await createTask(
      alice,
      { title: "rep", dueAt: at("2026-11-17T09:00:00Z"), recurrence: { rrule: "FREQ=DAILY" } },
      NOW,
    );
    const res = await moveTask(
      alice,
      { taskId: t.id, column: { kind: "status", value: "done" }, prevId: null, nextId: null },
      NOW,
    );
    expect(res?.task.status).toBe("done");
    expect(res?.next?.dueAt).toBe("2026-11-18T09:00:00.000Z");
  });

  it("shows only recently completed tasks in Done", async () => {
    const recent = await createTask(alice, { title: "recent" }, NOW);
    const old = await createTask(alice, { title: "old" }, NOW);
    await setTaskDone(alice, recent.id, true, NOW);
    await setTaskDone(alice, old.id, true, new Date(NOW.getTime() - 30 * 86_400_000));
    expect((await listBoardTasks(alice, NOW)).map((t) => t.title)).toEqual(["recent"]);
  });

  it("cannot move another user's task or anchor to their cards", async () => {
    const t = await mk("t", 1000);
    expect(
      await moveTask(
        bob,
        { taskId: t.id, column: { kind: "status", value: "done" }, prevId: null, nextId: null },
        NOW,
      ),
    ).toBeNull();
    const bobTask = await createTask(bob, { title: "b" }, NOW);
    await Task.updateOne({ _id: bobTask.id }, { $set: { order: 5 } });
    const res = await moveTask(
      alice,
      { taskId: t.id, column: { kind: "status", value: "todo" }, prevId: bobTask.id, nextId: null },
      NOW,
    );
    expect(res?.task.order).toBe(1000); // the foreign neighbour is ignored
    expect((await listBoardTasks(bob, NOW)).map((x) => x.title)).toEqual(["b"]);
  });
});

describe("calendar", () => {
  it("lists tasks in range (including done) and reschedules keeping the time of day", async () => {
    const timed = await createTask(
      alice,
      { title: "timed", dueAt: at("2026-11-17T09:00:00Z") },
      NOW,
    ); // 14:30 IST
    const allDay = await createTask(
      alice,
      { title: "allday", dueAt: at("2026-11-17T18:30:00Z"), allDay: true },
      NOW,
    ); // 18 Nov
    await createTask(alice, { title: "outside", dueAt: at("2026-12-20T09:00:00Z") }, NOW);
    const list = await listCalendarTasks(
      alice,
      at("2026-11-01T00:00:00Z"),
      at("2026-12-01T00:00:00Z"),
    );
    expect(list.map((t) => t.title)).toEqual(["timed", "allday"]);

    const moved = await rescheduleTask(alice, timed.id, "2026-11-25", NOW);
    expect(ist(moved!.task.dueAt)).toBe("2026-11-25T14:30:00.000");
    expect(moved!.task.allDay).toBe(false);
    // its relative reminder moved with it
    expect(ist(moved!.task.reminders[0].at)).toBe("2026-11-25T14:15:00.000");

    const movedAllDay = await rescheduleTask(alice, allDay.id, "2026-11-30", NOW);
    expect(ist(movedAllDay!.task.dueAt)).toBe("2026-11-30T00:00:00.000");
    expect(movedAllDay!.task.allDay).toBe(true);
  });

  it("scheduling an undated task makes it all-day on that day", async () => {
    const t = await createTask(alice, { title: "x" }, NOW);
    const res = await rescheduleTask(alice, t.id, "2026-11-20", NOW);
    expect(ist(res!.task.dueAt)).toBe("2026-11-20T00:00:00.000");
    expect(res!.task.allDay).toBe(true);
  });

  it("is isolated per user", async () => {
    const t = await createTask(alice, { title: "mine", dueAt: at("2026-11-17T09:00:00Z") }, NOW);
    expect(
      await listCalendarTasks(bob, at("2026-11-01T00:00:00Z"), at("2026-12-01T00:00:00Z")),
    ).toHaveLength(0);
    expect(await rescheduleTask(bob, t.id, "2026-11-25", NOW)).toBeNull();
    expect((await getReminderBundle(bob, NOW)).pending).toHaveLength(0);
    expect(
      await claimReminders(bob, [{ taskId: t.id, reminderId: t.reminders[0].id }], NOW),
    ).toEqual([]);
    expect(await snoozeReminder(bob, t.id, t.reminders[0].id, "10m", NOW)).toBe(false);
    expect((await listTasks(bob, { kind: "today" }, TZ, NOW)).length).toBe(0);
  });
});
