import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import type { ProjectDTO } from "@/lib/types";
import { Project } from "@/models/Project";
import { Task } from "@/models/Task";
import { toProjectDTO } from "./serialize";

/**
 * Everything the sidebar shows, loaded on every page: the project list with open-task counts, the
 * tag list with counts, and the count of tasks with no project. One pass over the person's open
 * tasks (a $facet) replaces what used to be three separate queries.
 */
export async function getSidebarData(userId: string): Promise<{
  projects: ProjectDTO[];
  tags: { tag: string; count: number }[];
  generalCount: number;
}> {
  await connectDb();
  const uid = new Types.ObjectId(userId);
  const [projects, [facets]] = await Promise.all([
    Project.find({ userId: uid, archived: false }).sort({ order: 1, _id: 1 }).lean(),
    Task.aggregate<{
      tags: { _id: string; count: number }[];
      projects: { _id: Types.ObjectId; n: number }[];
      general: { n: number }[];
    }>([
      { $match: { userId: uid, deletedAt: null, status: { $ne: "done" } } },
      {
        $facet: {
          tags: [
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 },
          ],
          projects: [
            { $match: { projectId: { $ne: null } } },
            { $group: { _id: "$projectId", n: { $sum: 1 } } },
          ],
          general: [{ $match: { projectId: null } }, { $count: "n" }],
        },
      },
    ]),
  ]);
  const byId = new Map((facets?.projects ?? []).map((c) => [String(c._id), c.n]));
  return {
    projects: projects.map((p) => toProjectDTO(p, byId.get(String(p._id)) ?? 0)),
    tags: (facets?.tags ?? []).map((r) => ({ tag: r._id, count: r.count })),
    generalCount: facets?.general[0]?.n ?? 0,
  };
}
