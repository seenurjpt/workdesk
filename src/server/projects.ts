import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import type { ProjectInput } from "@/schemas";
import type { ProjectDTO } from "@/lib/types";
import { toProjectDTO } from "./serialize";

const PALETTE = ["#00b97a", "#3b82f6", "#f59e0b", "#e5484d", "#8b5cf6", "#06b6d4", "#ec4899"];

export async function listProjects(userId: string, includeArchived = false): Promise<ProjectDTO[]> {
  await connectDb();
  const uid = new Types.ObjectId(userId);
  const projects = await Project.find({
    userId: uid,
    ...(includeArchived ? {} : { archived: false }),
  })
    .sort({ order: 1, _id: 1 })
    .lean();
  const counts = await Task.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { userId: uid, deletedAt: null, status: { $ne: "done" }, projectId: { $ne: null } } },
    { $group: { _id: "$projectId", n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return projects.map((p) => toProjectDTO(p, byId.get(String(p._id)) ?? 0));
}

export async function createProject(userId: string, input: ProjectInput): Promise<ProjectDTO> {
  await connectDb();
  const uid = new Types.ObjectId(userId);
  const last = await Project.findOne({ userId: uid }).sort({ order: -1 }).lean();
  const doc = await Project.create({
    userId: uid,
    name: input.name,
    color: input.color,
    order: (last?.order ?? 0) + 1,
  });
  return toProjectDTO(doc);
}

export async function updateProject(
  userId: string,
  id: string,
  patch: Partial<ProjectInput> & { archived?: boolean },
): Promise<ProjectDTO | null> {
  await connectDb();
  const doc = await Project.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: patch },
    { returnDocument: "after" },
  ).lean();
  return doc ? toProjectDTO(doc) : null;
}

export async function reorderProjects(userId: string, ids: string[]): Promise<void> {
  await connectDb();
  const uid = new Types.ObjectId(userId);
  await Project.bulkWrite(
    ids.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id), userId: uid },
        update: { $set: { order: index } },
      },
    })),
  );
}

/** "Client A", "client-a" and "ClientA" are the same project: a #tag can't contain spaces. */
export function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/** Finds a project by name (ignoring case, spaces and punctuation), creating it when missing. */
export async function findOrCreateProjectByName(userId: string, name: string): Promise<ProjectDTO> {
  await connectDb();
  const uid = new Types.ObjectId(userId);
  const key = normalizeProjectName(name);
  const projects = await Project.find({ userId: uid, archived: false }).lean();
  const existing = key ? projects.find((p) => normalizeProjectName(p.name) === key) : undefined;
  if (existing) return toProjectDTO(existing);
  const count = await Project.countDocuments({ userId: uid });
  return createProject(userId, { name: name.slice(0, 80), color: PALETTE[count % PALETTE.length] });
}
