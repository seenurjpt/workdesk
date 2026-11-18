import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { escapeRegex, highlight, makeSnippet, scoreMatch, tokenize } from "@/lib/highlight";
import type { MentionItem, SearchHitNote, SearchHitTask, SearchResults } from "@/lib/types";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";
import { toTaskDTO } from "./serialize";

const CANDIDATES = 40;

function allTokensFilter(tokens: string[], fields: string[]) {
  return tokens.map((t) => {
    const re = new RegExp(escapeRegex(t), "i");
    return { $or: fields.map((f) => ({ [f]: re })) };
  });
}

/** Ranked search across tasks and notes with highlighted snippets. */
export async function globalSearch(
  userId: string,
  query: string,
  limit = 8,
): Promise<SearchResults> {
  const tokens = tokenize(query);
  if (!tokens.length) return { tasks: [], notes: [] };
  await connectDb();
  const owner = { userId: new Types.ObjectId(userId), deletedAt: null };

  const [taskDocs, noteDocs] = await Promise.all([
    Task.find({ ...owner, $and: allTokensFilter(tokens, ["title"]) })
      .sort({ updatedAt: -1 })
      .limit(CANDIDATES)
      .lean(),
    Note.find({ ...owner, $and: allTokensFilter(tokens, ["title", "plainText"]) })
      .select("title plainText pinned updatedAt")
      .sort({ updatedAt: -1 })
      .limit(CANDIDATES)
      .lean(),
  ]);

  const tasks: SearchHitTask[] = taskDocs
    .map((doc) => {
      const task = toTaskDTO(doc);
      // open tasks outrank completed ones
      const score = scoreMatch(task.title, "", tokens) + (task.status === "done" ? 0 : 5);
      return {
        kind: "task" as const,
        id: task.id,
        task,
        titleParts: highlight(task.title, tokens),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const notes: SearchHitNote[] = noteDocs
    .map((n) => {
      const title = n.title || "Untitled note";
      const body = n.plainText ?? "";
      const score = scoreMatch(n.title ?? "", body, tokens) + (n.pinned ? 4 : 0);
      return {
        kind: "note" as const,
        id: String(n._id),
        title,
        titleParts: highlight(title, tokens),
        snippet: makeSnippet(body, tokens),
        pinned: Boolean(n.pinned),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { tasks, notes };
}

/** Lightweight lookups for @task / [[note]] mentions and link pickers. */
export async function lookupTasks(
  userId: string,
  query: string,
  limit = 8,
): Promise<MentionItem[]> {
  await connectDb();
  const tokens = tokenize(query);
  const docs = await Task.find({
    userId: new Types.ObjectId(userId),
    deletedAt: null,
    ...(tokens.length ? { $and: allTokensFilter(tokens, ["title"]) } : {}),
  })
    .select("title status")
    .sort({ status: 1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((t) => ({
    id: String(t._id),
    label: t.title,
    hint: t.status === "done" ? "Done" : undefined,
  }));
}

export async function lookupNotes(
  userId: string,
  query: string,
  limit = 8,
): Promise<MentionItem[]> {
  await connectDb();
  const tokens = tokenize(query);
  const docs = await Note.find({
    userId: new Types.ObjectId(userId),
    deletedAt: null,
    ...(tokens.length ? { $and: allTokensFilter(tokens, ["title"]) } : {}),
  })
    .select("title")
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((n) => ({ id: String(n._id), label: n.title || "Untitled note" }));
}
