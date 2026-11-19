import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import type { TrashItemDTO } from "@/lib/types";
import { Note } from "@/models/Note";
import { NoteVersion } from "@/models/NoteVersion";
import { Task } from "@/models/Task";
import { User } from "@/models/User";

export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;
const PURGE_CHECK_MS = 6 * 3_600_000;

const uid = (userId: string) => new Types.ObjectId(userId);
const daysLeft = (deletedAt: Date, now: Date) =>
  Math.max(0, Math.ceil((deletedAt.getTime() + TRASH_DAYS * DAY_MS - now.getTime()) / DAY_MS));

export async function listTrash(userId: string, now = new Date()): Promise<TrashItemDTO[]> {
  await connectDb();
  const [tasks, notes] = await Promise.all([
    Task.find({ userId: uid(userId), deletedAt: { $ne: null } })
      .select("title deletedAt")
      .limit(500)
      .lean(),
    Note.find({ userId: uid(userId), deletedAt: { $ne: null } })
      .select("title deletedAt")
      .limit(500)
      .lean(),
  ]);
  const items: TrashItemDTO[] = [
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: String(t._id),
      title: t.title,
      deletedAt: (t.deletedAt as Date).toISOString(),
      daysLeft: daysLeft(t.deletedAt as Date, now),
    })),
    ...notes.map((n) => ({
      kind: "note" as const,
      id: String(n._id),
      title: n.title || "Untitled note",
      deletedAt: (n.deletedAt as Date).toISOString(),
      daysLeft: daysLeft(n.deletedAt as Date, now),
    })),
  ];
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Removes tasks for good, and every reference to them. Only trashed tasks can be purged. */
async function purgeTasks(userId: string, ids: Types.ObjectId[]): Promise<number> {
  if (ids.length === 0) return 0;
  const owner = uid(userId);
  const res = await Task.deleteMany({ _id: { $in: ids }, userId: owner, deletedAt: { $ne: null } });
  await Promise.all([
    Note.updateMany(
      { userId: owner, linkedTaskIds: { $in: ids } },
      { $pull: { linkedTaskIds: { $in: ids } } },
    ),
    User.updateOne(
      { _id: owner, "activeTimer.taskId": { $in: ids } },
      { $unset: { activeTimer: 1 } },
    ),
  ]);
  return res.deletedCount;
}

async function purgeNotes(userId: string, ids: Types.ObjectId[]): Promise<number> {
  if (ids.length === 0) return 0;
  const owner = uid(userId);
  const res = await Note.deleteMany({ _id: { $in: ids }, userId: owner, deletedAt: { $ne: null } });
  await Promise.all([
    NoteVersion.deleteMany({ noteId: { $in: ids }, userId: owner }),
    Task.updateMany(
      { userId: owner, linkedNoteIds: { $in: ids } },
      { $pull: { linkedNoteIds: { $in: ids } } },
    ),
    Task.updateMany({ userId: owner, sourceNoteId: { $in: ids } }, { $unset: { sourceNoteId: 1 } }),
  ]);
  return res.deletedCount;
}

export async function purgeItem(
  userId: string,
  kind: "task" | "note",
  id: string,
): Promise<boolean> {
  await connectDb();
  const oid = new Types.ObjectId(id);
  return (
    (kind === "task" ? await purgeTasks(userId, [oid]) : await purgeNotes(userId, [oid])) === 1
  );
}

export async function emptyTrash(userId: string): Promise<number> {
  await connectDb();
  const [tasks, notes] = await Promise.all([
    Task.find({ userId: uid(userId), deletedAt: { $ne: null } })
      .select("_id")
      .lean(),
    Note.find({ userId: uid(userId), deletedAt: { $ne: null } })
      .select("_id")
      .lean(),
  ]);
  const [t, n] = await Promise.all([
    purgeTasks(
      userId,
      tasks.map((x) => x._id),
    ),
    purgeNotes(
      userId,
      notes.map((x) => x._id),
    ),
  ]);
  return t + n;
}

export async function purgeExpired(userId: string, now = new Date()): Promise<number> {
  await connectDb();
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
  const [tasks, notes] = await Promise.all([
    Task.find({ userId: uid(userId), deletedAt: { $ne: null, $lt: cutoff } })
      .select("_id")
      .lean(),
    Note.find({ userId: uid(userId), deletedAt: { $ne: null, $lt: cutoff } })
      .select("_id")
      .lean(),
  ]);
  const [t, n] = await Promise.all([
    purgeTasks(
      userId,
      tasks.map((x) => x._id),
    ),
    purgeNotes(
      userId,
      notes.map((x) => x._id),
    ),
  ]);
  return t + n;
}

/**
 * No cron: expired items are removed opportunistically while the person is using the app,
 * at most once every few hours. Returns how many were removed.
 */
/** True when the last tidy-up was long enough ago to run another. */
export function purgeDue(lastPurgeAt: Date | null | undefined, now = new Date()): boolean {
  return !lastPurgeAt || now.getTime() - lastPurgeAt.getTime() >= PURGE_CHECK_MS;
}

export async function maybePurgeExpired(userId: string, now = new Date()): Promise<number> {
  await connectDb();
  const user = await User.findById(userId).select("lastPurgeAt").lean();
  if (user?.lastPurgeAt && now.getTime() - user.lastPurgeAt.getTime() < PURGE_CHECK_MS) return 0;
  // claim the slot first so concurrent requests don't all purge
  const claim = await User.updateOne(
    {
      _id: userId,
      $or: [
        { lastPurgeAt: null },
        { lastPurgeAt: { $lt: new Date(now.getTime() - PURGE_CHECK_MS) } },
      ],
    },
    { $set: { lastPurgeAt: now } },
  );
  return claim.modifiedCount === 1 ? purgeExpired(userId, now) : 0;
}
