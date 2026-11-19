import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import {
  DEFAULT_STATUS_KEYS,
  MAX_CUSTOM_STATUSES,
  MAX_STATUS_NAME,
  statusList,
  type CustomStatus,
} from "@/lib/statuses";
import { Task } from "@/models/Task";
import { User } from "@/models/User";

/** The person's own statuses, in the order they chose. */
export async function getCustomStatuses(userId: string): Promise<CustomStatus[]> {
  await connectDb();
  const u = await User.findById(userId).select("customStatuses").lean();
  return (u?.customStatuses ?? []).map((s) => ({ key: s.key, name: s.name }));
}

/** Throws unless `status` is a built-in status or one of this person's own. */
export async function assertStatus(userId: string, status: string): Promise<void> {
  if (DEFAULT_STATUS_KEYS.includes(status)) return;
  const custom = await getCustomStatuses(userId);
  if (!custom.some((s) => s.key === status)) throw new Error("Unknown status");
}

function cleanName(raw: string, existing: readonly CustomStatus[], exceptKey?: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Give the status a name");
  if (name.length > MAX_STATUS_NAME) throw new Error(`Keep it under ${MAX_STATUS_NAME} characters`);
  const taken = statusList(existing.filter((s) => s.key !== exceptKey)).some(
    (s) => s.title.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new Error("You already have a status with that name");
  return name;
}

export async function addStatus(userId: string, rawName: string): Promise<CustomStatus[]> {
  const current = await getCustomStatuses(userId);
  if (current.length >= MAX_CUSTOM_STATUSES) {
    throw new Error(`You can add up to ${MAX_CUSTOM_STATUSES} statuses`);
  }
  const name = cleanName(rawName, current);
  const next = [...current, { key: `s_${randomBytes(4).toString("hex")}`, name }];
  await User.updateOne({ _id: userId }, { $set: { customStatuses: next } });
  return next;
}

export async function renameStatus(
  userId: string,
  key: string,
  rawName: string,
): Promise<CustomStatus[]> {
  const current = await getCustomStatuses(userId);
  if (!current.some((s) => s.key === key)) throw new Error("Status not found");
  const name = cleanName(rawName, current, key);
  const next = current.map((s) => (s.key === key ? { key, name } : s));
  await User.updateOne({ _id: userId }, { $set: { customStatuses: next } });
  return next;
}

/** Saves a new order. `keys` must be exactly the person's current statuses, each once. */
export async function reorderStatuses(userId: string, keys: string[]): Promise<string[]> {
  const custom = await getCustomStatuses(userId);
  // Every status except Done, each exactly once. Done cannot be moved.
  const expected = statusList(custom)
    .map((s) => s.value)
    .filter((k) => k !== "done");
  const same =
    keys.length === expected.length &&
    new Set(keys).size === keys.length &&
    keys.every((k) => expected.includes(k));
  if (!same) throw new Error("Your statuses changed. Reload and try again.");
  await User.updateOne({ _id: userId }, { $set: { statusOrder: keys } });
  return keys;
}

/** Removes a status. Its tasks go back to "To do", so nothing is lost or hidden. */
export async function removeStatus(
  userId: string,
  key: string,
): Promise<{ statuses: CustomStatus[]; moved: number }> {
  const current = await getCustomStatuses(userId);
  const target = current.find((s) => s.key === key);
  if (!target) throw new Error("Status not found");
  const res = await Task.updateMany(
    { userId: new Types.ObjectId(userId), status: key },
    { $set: { status: "todo" } },
  );
  const next = current.filter((s) => s.key !== key);
  await User.updateOne(
    { _id: userId },
    { $set: { customStatuses: next }, $pull: { statusOrder: key } },
  );
  return { statuses: next, moved: res.modifiedCount };
}
