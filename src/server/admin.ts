import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";
import { Note } from "@/models/Note";
import { ActivityLog } from "@/models/ActivityLog";
import { NoteVersion } from "@/models/NoteVersion";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import { Template } from "@/models/Template";
import { User } from "@/models/User";
import { getRegistrationOpen, setRegistrationOpen } from "./settings";

/**
 * The admin panel's service layer. Every function takes the id of the signed-in person and checks
 * in the database that they are an active administrator, so the panel is safe even if a page or an
 * action forgets to check. It manages accounts: it shows counts and settings, never the content
 * (task titles, notes) of anyone's account.
 */

export class AdminError extends Error {}

export type Role = "user" | "admin";
export type Status = "active" | "suspended";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  createdAt: string;
  lastLoginAt: string | null;
  tasks: number;
  notes: number;
  projects: number;
}

export interface AdminUserDetail extends AdminUserRow {
  timezone: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  openTasks: number;
  doneTasks: number;
  templates: number;
  /** Items in the account's Trash (tasks and notes). */
  trashed: number;
  /** False for accounts that only sign in with Google. */
  hasPassword: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  adminEmail: string;
  action: string;
  targetEmail: string | null;
  detail: string | null;
}

interface Admin {
  id: string;
  email: string;
}

const oid = (id: string) => new Types.ObjectId(id);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function assertAdmin(userId: string): Promise<Admin> {
  await connectDb();
  const u = await User.findById(userId).select("email role status").lean();
  if (!u || u.role !== "admin" || u.status === "suspended") throw new AdminError("Not allowed");
  return { id: String(u._id), email: u.email };
}

async function audit(
  admin: Admin,
  action: string,
  target?: { id: string; email: string },
  detail?: string,
): Promise<void> {
  await AuditLog.create({
    adminId: oid(admin.id),
    adminEmail: admin.email,
    action,
    targetId: target ? oid(target.id) : undefined,
    targetEmail: target?.email,
    detail: detail?.slice(0, 300),
  });
}

/** How many other active administrators exist besides `exceptId`. */
async function otherActiveAdmins(exceptId: string): Promise<number> {
  return User.countDocuments({ role: "admin", status: "active", _id: { $ne: oid(exceptId) } });
}

/** A readable one-time password with no look-alike characters. */
export function generatePassword(length = 14): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ---- overview ----

export interface AdminOverview {
  users: {
    total: number;
    admins: number;
    suspended: number;
    newThisWeek: number;
    activeThisWeek: number;
  };
  content: { tasks: number; notes: number; projects: number; templates: number; trashed: number };
  registrationOpen: boolean;
  /** Sign-ups per day for the last 14 days, oldest first. */
  signups: { day: string; count: number }[];
  recentUsers: AdminUserRow[];
  recentActivity: AuditEntry[];
}

export async function getAdminOverview(adminId: string, now = new Date()): Promise<AdminOverview> {
  await assertAdmin(adminId);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const since = new Date(now.getTime() - 13 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [total, admins, suspended, newThisWeek, activeThisWeek] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ status: "suspended" }),
    User.countDocuments({ createdAt: { $gte: week } }),
    User.countDocuments({ lastLoginAt: { $gte: week } }),
  ]);
  const [tasks, notes, projects, templates, trashedTasks, trashedNotes] = await Promise.all([
    Task.countDocuments({ deletedAt: null }),
    Note.countDocuments({ deletedAt: null }),
    Project.countDocuments(),
    Template.countDocuments(),
    Task.countDocuments({ deletedAt: { $ne: null } }),
    Note.countDocuments({ deletedAt: { $ne: null } }),
  ]);
  const grouped = await User.aggregate<{ _id: string; n: number }>([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        n: { $sum: 1 },
      },
    },
  ]);
  const byDay = new Map(grouped.map((g) => [g._id, g.n]));
  const signups = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000);
    const day = d.toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });

  const recent = await User.find().sort({ createdAt: -1 }).limit(5).lean();
  const recentUsers = await withCounts(recent);
  const recentActivity = await recentAudit(6);

  return {
    users: { total, admins, suspended, newThisWeek, activeThisWeek },
    content: { tasks, notes, projects, templates, trashed: trashedTasks + trashedNotes },
    registrationOpen: await getRegistrationOpen(),
    signups,
    recentUsers,
    recentActivity,
  };
}

// ---- users ----

type LeanUser = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role?: string | null;
  status?: string | null;
  createdAt?: Date;
  lastLoginAt?: Date | null;
};

async function countsFor(ids: Types.ObjectId[]) {
  const group = (m: typeof Task | typeof Note | typeof Project, filter: object) =>
    (m as typeof Task).aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { userId: { $in: ids }, ...filter } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ]);
  const [t, n, p] = await Promise.all([
    group(Task, { deletedAt: null }),
    group(Note, { deletedAt: null }),
    group(Project, {}),
  ]);
  const map = (rows: { _id: Types.ObjectId; n: number }[]) =>
    new Map(rows.map((r) => [String(r._id), r.n]));
  return { tasks: map(t), notes: map(n), projects: map(p) };
}

async function withCounts(users: LeanUser[]): Promise<AdminUserRow[]> {
  const counts = await countsFor(users.map((u) => u._id));
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : "user",
    status: u.status === "suspended" ? "suspended" : "active",
    createdAt: iso(u.createdAt) ?? "",
    lastLoginAt: iso(u.lastLoginAt),
    tasks: counts.tasks.get(String(u._id)) ?? 0,
    notes: counts.notes.get(String(u._id)) ?? 0,
    projects: counts.projects.get(String(u._id)) ?? 0,
  }));
}

export interface UserQuery {
  q?: string;
  role?: Role;
  status?: Status;
  sort?: "newest" | "oldest" | "name" | "active";
  page?: number;
  pageSize?: number;
}

export interface UserPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  pages: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listUsers(adminId: string, query: UserQuery = {}): Promise<UserPage> {
  await assertAdmin(adminId);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = {};
  const q = query.q?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q.slice(0, 100)), "i");
    filter.$or = [{ name: re }, { email: re }];
  }
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;

  const sort: Record<string, 1 | -1> =
    query.sort === "oldest"
      ? { createdAt: 1 }
      : query.sort === "name"
        ? { name: 1 }
        : query.sort === "active"
          ? { lastLoginAt: -1, createdAt: -1 }
          : { createdAt: -1 };

  const total = await User.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pages);
  const docs = await User.find(filter)
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  return { users: await withCounts(docs), total, page, pages };
}

export async function getUserDetail(
  adminId: string,
  targetId: string,
): Promise<AdminUserDetail | null> {
  await assertAdmin(adminId);
  const u = await User.findById(targetId).select("+passwordHash").lean();
  if (!u) return null;
  const id = u._id;
  const [row] = await withCounts([u]);
  const [openTasks, doneTasks, templates, trashedTasks, trashedNotes] = await Promise.all([
    Task.countDocuments({ userId: id, deletedAt: null, status: { $ne: "done" } }),
    Task.countDocuments({ userId: id, deletedAt: null, status: "done" }),
    Template.countDocuments({ userId: id }),
    Task.countDocuments({ userId: id, deletedAt: { $ne: null } }),
    Note.countDocuments({ userId: id, deletedAt: { $ne: null } }),
  ]);
  return {
    ...row,
    timezone: u.timezone ?? "Asia/Kolkata",
    suspendedAt: iso(u.suspendedAt),
    suspendedReason: u.suspendedReason ?? null,
    openTasks,
    doneTasks,
    templates,
    trashed: trashedTasks + trashedNotes,
    hasPassword: Boolean(u.passwordHash),
  };
}

// ---- changes ----

async function target(targetId: string) {
  const t = await User.findById(targetId).select("email role status").lean();
  if (!t) throw new AdminError("User not found");
  return t;
}

export async function setUserStatus(
  adminId: string,
  targetId: string,
  status: Status,
  reason?: string,
): Promise<void> {
  const admin = await assertAdmin(adminId);
  const t = await target(targetId);
  if (status === "suspended") {
    if (targetId === admin.id) throw new AdminError("You cannot suspend your own account");
    if (t.role === "admin" && (await otherActiveAdmins(targetId)) === 0) {
      throw new AdminError("That is the last active administrator");
    }
    await User.updateOne(
      { _id: t._id },
      {
        $set: {
          status: "suspended",
          suspendedAt: new Date(),
          suspendedReason: reason?.slice(0, 200),
        },
      },
    );
    await audit(admin, "user.suspend", { id: targetId, email: t.email }, reason);
  } else {
    await User.updateOne(
      { _id: t._id },
      { $set: { status: "active" }, $unset: { suspendedAt: "", suspendedReason: "" } },
    );
    await audit(admin, "user.reactivate", { id: targetId, email: t.email });
  }
}

export async function setUserRole(adminId: string, targetId: string, role: Role): Promise<void> {
  const admin = await assertAdmin(adminId);
  const t = await target(targetId);
  if (targetId === admin.id) throw new AdminError("You cannot change your own role");
  if (t.role === role) return;
  if (role === "user" && t.role === "admin" && (await otherActiveAdmins(targetId)) === 0) {
    throw new AdminError("That is the last active administrator");
  }
  await User.updateOne({ _id: t._id }, { $set: { role } });
  await audit(admin, role === "admin" ? "user.promote" : "user.demote", {
    id: targetId,
    email: t.email,
  });
}

/** Sets a new random password and returns it. This is the only time it can be seen. */
export async function resetUserPassword(adminId: string, targetId: string): Promise<string> {
  const admin = await assertAdmin(adminId);
  const t = await target(targetId);
  const password = generatePassword();
  await User.updateOne({ _id: t._id }, { $set: { passwordHash: await bcrypt.hash(password, 12) } });
  await audit(admin, "user.reset-password", { id: targetId, email: t.email });
  return password;
}

export async function createUserByAdmin(
  adminId: string,
  input: { name: string; email: string; role?: Role },
): Promise<{ id: string; password: string }> {
  const admin = await assertAdmin(adminId);
  const email = input.email.trim().toLowerCase();
  if (await User.exists({ email }))
    throw new AdminError("An account with this email already exists");
  const password = generatePassword();
  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: input.role === "admin" ? "admin" : "user",
  });
  await audit(
    admin,
    "user.create",
    { id: String(user._id), email },
    input.role === "admin" ? "as admin" : undefined,
  );
  return { id: String(user._id), password };
}

/** Deletes the account and everything it owns. The email must be typed to confirm. */
export async function deleteUser(
  adminId: string,
  targetId: string,
  confirmEmail: string,
): Promise<void> {
  const admin = await assertAdmin(adminId);
  const t = await target(targetId);
  if (targetId === admin.id) throw new AdminError("You cannot delete your own account");
  if (confirmEmail.trim().toLowerCase() !== t.email)
    throw new AdminError("The email does not match");
  if (t.role === "admin" && (await otherActiveAdmins(targetId)) === 0) {
    throw new AdminError("That is the last active administrator");
  }
  const userId = t._id;
  const [tasks, notes] = await Promise.all([
    Task.deleteMany({ userId }),
    Note.deleteMany({ userId }),
    NoteVersion.deleteMany({ userId }),
    Project.deleteMany({ userId }),
    Template.deleteMany({ userId }),
    ActivityLog.deleteMany({ userId }),
  ]).then(([a, b]) => [a.deletedCount, b.deletedCount]);
  await User.deleteOne({ _id: userId });
  await audit(
    admin,
    "user.delete",
    { id: targetId, email: t.email },
    `${tasks} tasks, ${notes} notes removed`,
  );
}

// ---- site settings and upkeep ----

export async function setRegistration(adminId: string, open: boolean): Promise<void> {
  const admin = await assertAdmin(adminId);
  await setRegistrationOpen(open);
  await audit(admin, open ? "settings.registration-open" : "settings.registration-closed");
}

/** Permanently removes anything that has sat in Trash for longer than `days`, for every account. */
export async function purgeExpiredTrash(
  adminId: string,
  days = 30,
  now = new Date(),
): Promise<{ tasks: number; notes: number }> {
  const admin = await assertAdmin(adminId);
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const oldNotes = await Note.find({ deletedAt: { $lt: cutoff } })
    .select("_id")
    .lean();
  await NoteVersion.deleteMany({ noteId: { $in: oldNotes.map((n) => n._id) } });
  const [t, n] = await Promise.all([
    Task.deleteMany({ deletedAt: { $lt: cutoff } }),
    Note.deleteMany({ deletedAt: { $lt: cutoff } }),
  ]);
  await audit(
    admin,
    "maintenance.purge-trash",
    undefined,
    `${t.deletedCount} tasks, ${n.deletedCount} notes`,
  );
  return { tasks: t.deletedCount, notes: n.deletedCount };
}

// ---- audit log ----

async function recentAudit(limit: number): Promise<AuditEntry[]> {
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map(toEntry);
}

function toEntry(r: {
  _id: Types.ObjectId;
  createdAt?: Date;
  adminEmail: string;
  action: string;
  targetEmail?: string | null;
  detail?: string | null;
}): AuditEntry {
  return {
    id: String(r._id),
    at: iso(r.createdAt) ?? "",
    adminEmail: r.adminEmail,
    action: r.action,
    targetEmail: r.targetEmail ?? null,
    detail: r.detail ?? null,
  };
}

export async function listAudit(
  adminId: string,
  page = 1,
  pageSize = 25,
): Promise<{ entries: AuditEntry[]; total: number; page: number; pages: number }> {
  await assertAdmin(adminId);
  const total = await AuditLog.countDocuments();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(page, 1), pages);
  const rows = await AuditLog.find()
    .sort({ createdAt: -1 })
    .skip((p - 1) * pageSize)
    .limit(pageSize)
    .lean();
  return { entries: rows.map(toEntry), total, page: p, pages };
}
