import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { MAX_ATTACHMENTS_PER_TASK } from "@/lib/limits";
import { classifyUrl, parseHttpUrl, titleFromUrl, type LinkKind } from "@/lib/url-links";
import type { AttachmentDTO } from "@/lib/types";
import { Task } from "@/models/Task";
import { fetchPageTitle } from "./link-preview";

export const MAX_ATTACHMENTS = MAX_ATTACHMENTS_PER_TASK;

const uid = (userId: string) => new Types.ObjectId(userId);

export interface ResolvedLink {
  url: string;
  title: string;
  kind: LinkKind;
}

/** Jira/Confluence titles come from the URL itself; other links get their page title (guarded fetch). */
export async function resolveLink(raw: string, { fetchTitle = true } = {}): Promise<ResolvedLink> {
  const url = parseHttpUrl(raw);
  if (!url) throw new Error("Enter a valid http(s) link");
  const { kind, title } = classifyUrl(url);
  if (title) return { url: url.toString(), title, kind };
  const fetched = fetchTitle ? await fetchPageTitle(url) : null;
  return { url: url.toString(), title: fetched ?? titleFromUrl(url), kind };
}

export async function addAttachment(
  userId: string,
  taskId: string,
  raw: string,
): Promise<AttachmentDTO[]> {
  await connectDb();
  const task = await Task.findOne({ _id: taskId, userId: uid(userId), deletedAt: null })
    .select("attachments")
    .lean();
  if (!task) throw new Error("Task not found");
  const existing = task.attachments ?? [];
  if (existing.length >= MAX_ATTACHMENTS)
    throw new Error(`A task can have up to ${MAX_ATTACHMENTS} links`);
  const link = await resolveLink(raw);
  if (existing.some((a) => a.url === link.url)) throw new Error("That link is already attached");
  const updated = await Task.findOneAndUpdate(
    { _id: taskId, userId: uid(userId), deletedAt: null, "attachments.url": { $ne: link.url } },
    { $push: { attachments: link } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new Error("That link is already attached");
  return toAttachments(updated.attachments);
}

export async function removeAttachment(
  userId: string,
  taskId: string,
  attachmentId: string,
): Promise<AttachmentDTO[]> {
  await connectDb();
  const updated = await Task.findOneAndUpdate(
    { _id: taskId, userId: uid(userId), deletedAt: null },
    { $pull: { attachments: { _id: new Types.ObjectId(attachmentId) } } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw new Error("Task not found");
  return toAttachments(updated.attachments);
}

function toAttachments(
  list:
    { _id: Types.ObjectId; url: string; title?: string | null; kind?: string | null }[] | undefined,
): AttachmentDTO[] {
  return (list ?? []).map((a) => ({
    id: String(a._id),
    url: a.url,
    title: a.title || a.url,
    kind: a.kind === "jira" || a.kind === "confluence" ? a.kind : "link",
  }));
}
