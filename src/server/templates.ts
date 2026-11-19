import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { EMPTY_DOC } from "@/lib/tiptap";
import type { TemplateDTO, TemplateKind } from "@/lib/types";
import { Note } from "@/models/Note";
import { Task } from "@/models/Task";
import { Template } from "@/models/Template";
import { User } from "@/models/User";
import type { TemplateInput } from "@/schemas";
import { createNote } from "./notes";
import { createTask } from "./tasks";

const uid = (userId: string) => new Types.ObjectId(userId);

type Block = Record<string, unknown>;
const text = (t: string): Block => ({ type: "text", text: t });
const p = (t?: string): Block =>
  t ? { type: "paragraph", content: [text(t)] } : { type: "paragraph" };
const h2 = (t: string): Block => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const checklist = (...items: string[]): Block => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [p(i)] })),
});
const bullets = (...items: string[]): Block => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});

const doc = (...content: Block[]) => ({ type: "doc", content });
const note = (name: string, title: string, ...content: Block[]): StarterTemplate => ({
  since: 2,
  kind: "note",
  name,
  payload: { title, content: doc(...content) },
});
const meeting = (name: string, title: string, ...content: Block[]): StarterTemplate => ({
  since: 2,
  kind: "meeting_note",
  name,
  payload: { title, meeting: { attendees: [], agenda: "" }, content: doc(...content) },
});
const list = (name: string, title: string, ...items: string[]): StarterTemplate => ({
  since: 2,
  kind: "task_checklist",
  name,
  payload: { title, items },
});

/** A starter template. `since` is the starter-set version that introduced it (see ensureSystemTemplates). */
type StarterTemplate = TemplateInput & { since: number };

/** Bump when starters are added: people who already have the older set get only the new ones. */
const STARTER_VERSION = 2;

export const SYSTEM_TEMPLATES: StarterTemplate[] = [
  {
    since: 1,
    kind: "meeting_note",
    name: "Meeting notes",
    payload: {
      title: "Meeting notes",
      meeting: { attendees: [], agenda: "" },
      content: {
        type: "doc",
        content: [
          h2("Agenda"),
          bullets("Topic one", "Topic two"),
          h2("Discussion"),
          p(),
          h2("Decisions"),
          bullets("Decision"),
          h2("Action items"),
          checklist("Action item, owner, due date"),
        ],
      },
    },
  },
  {
    since: 1,
    kind: "task_checklist",
    name: "Release checklist",
    payload: {
      title: "Release checklist",
      items: [
        "Freeze scope and cut the release branch",
        "Run the full test suite",
        "Update the changelog and version number",
        "Smoke-test on staging",
        "Get sign-off from product and QA",
        "Deploy to production",
        "Watch errors and metrics for 30 minutes",
        "Announce the release",
      ],
    },
  },
  {
    since: 1,
    kind: "task_checklist",
    name: "Client kickoff",
    payload: {
      title: "Client kickoff",
      items: [
        "Send the welcome email and agenda",
        "Confirm goals, scope and success criteria",
        "Agree contacts and communication cadence",
        "Share the timeline and milestones",
        "Collect access and assets",
        "Book the first weekly sync",
        "Write up and share the kickoff notes",
      ],
    },
  },
  // ---- added in starter version 2 ----
  list(
    "Daily plan",
    "Daily plan",
    "Check calendar, messages and email",
    "Pick the top 3 priorities for today",
    "Block time for the hardest task first",
    "Clear anything that takes under 2 minutes",
    "Note what you are waiting on from others",
    "End of day: move unfinished tasks and write tomorrow's top 3",
  ),
  list(
    "Weekly review",
    "Weekly review",
    "Clear your inbox and loose notes",
    "Review last week's completed tasks",
    "Move or drop everything that slipped",
    "Check the calendar for the coming week",
    "Follow up on every task you are waiting on",
    "Choose the 3 outcomes that matter most next week",
  ),
  list(
    "New joiner onboarding",
    "New joiner onboarding",
    "Send the welcome message and first-week plan",
    "Set up laptop, accounts and access",
    "Add them to team channels and calendars",
    "Introduce them to the team and their buddy",
    "Walk through tools, processes and documentation",
    "Agree goals for the first 30, 60 and 90 days",
    "Book a check-in at the end of week 1",
  ),
  list(
    "Bug triage",
    "Bug triage",
    "Reproduce the problem and note the steps",
    "Record version, browser or device, and logs",
    "Set severity and who is affected",
    "Find the cause and link the related change",
    "Fix it and add a test that fails without the fix",
    "Verify on staging, then release",
    "Tell the reporter it is fixed",
  ),
  list(
    "Code review",
    "Code review",
    "Read the description and understand the goal",
    "Check the logic and edge cases",
    "Look for security and privacy issues",
    "Confirm tests cover the change",
    "Check naming, comments and readability",
    "Leave clear, kind feedback and decide: approve or request changes",
  ),
  list(
    "Sprint planning",
    "Sprint planning",
    "Review last sprint's outcome and carry-overs",
    "Confirm the sprint goal",
    "Check team capacity and time off",
    "Pick and size the work",
    "Flag dependencies and risks",
    "Share the plan with stakeholders",
  ),
  list(
    "Interview day",
    "Interview day",
    "Share the schedule and panel with the candidate",
    "Re-read the CV and prepare questions",
    "Book the room or video link",
    "Collect feedback from every interviewer the same day",
    "Hold the debrief and decide",
    "Reply to the candidate within two working days",
  ),
  list(
    "Business trip",
    "Business trip",
    "Book travel and accommodation",
    "Share the itinerary with the team",
    "Check the passport, visa and ID",
    "Pack chargers, laptop and documents",
    "Plan how to claim expenses and keep receipts",
    "Set an out-of-office reply",
  ),
  list(
    "Month-end close",
    "Month-end close",
    "Collect invoices and receipts",
    "Reconcile bank and card statements",
    "Chase outstanding payments",
    "Review expenses against budget",
    "Prepare and send the monthly report",
    "Archive documents for the month",
  ),
  meeting(
    "One-on-one",
    "One-on-one",
    h2("How are you doing?"),
    p(),
    h2("Since last time"),
    bullets("Wins", "Challenges"),
    h2("Topics to discuss"),
    bullets("Topic"),
    h2("Feedback and growth"),
    p(),
    h2("Action items"),
    checklist("Action item, owner, due date"),
  ),
  meeting(
    "Daily stand-up",
    "Stand-up",
    h2("Yesterday"),
    bullets("What got done"),
    h2("Today"),
    bullets("What is planned"),
    h2("Blockers"),
    bullets("Anything in the way"),
  ),
  meeting(
    "Retrospective",
    "Retrospective",
    h2("What went well"),
    bullets("Item"),
    h2("What did not go well"),
    bullets("Item"),
    h2("What we will change"),
    bullets("Idea"),
    h2("Action items"),
    checklist("Action item, owner, due date"),
  ),
  note(
    "Project brief",
    "Project brief",
    h2("Goal"),
    p("What are we trying to achieve, and why now?"),
    h2("Scope"),
    bullets("In scope", "Out of scope"),
    h2("Success measures"),
    bullets("How we will know it worked"),
    h2("People"),
    bullets("Owner", "Stakeholders", "Team"),
    h2("Timeline"),
    bullets("Milestone and date"),
    h2("Risks and open questions"),
    bullets("Risk or question"),
  ),
  note(
    "Weekly status report",
    "Weekly status report",
    h2("Highlights"),
    bullets("Done this week"),
    h2("Next week"),
    bullets("Planned"),
    h2("Risks and blockers"),
    bullets("Item and what is needed"),
    h2("Numbers"),
    p(),
  ),
  note(
    "Decision log",
    "Decision",
    h2("Decision"),
    p(),
    h2("Context"),
    p("What led to this?"),
    h2("Options considered"),
    bullets("Option and trade-off"),
    h2("Why we chose this"),
    p(),
    h2("Who needs to know"),
    bullets("Person or team"),
  ),
  note(
    "Interview feedback",
    "Interview feedback",
    h2("Candidate and role"),
    p(),
    h2("Strengths"),
    bullets("Strength with an example"),
    h2("Concerns"),
    bullets("Concern with an example"),
    h2("Recommendation"),
    p("Strong yes, yes, no or strong no, and why."),
  ),
];

/**
 * Gives every account the starter templates, once. The version claim is atomic, so two requests
 * cannot both seed. When new starters are added later (a higher STARTER_VERSION), an account gets
 * only the ones it has not seen, so a starter someone deleted does not come back.
 */
export async function ensureSystemTemplates(userId: string): Promise<void> {
  await connectDb();
  const before = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { templatesSeedVersion: { $exists: false } },
        { templatesSeedVersion: { $lt: STARTER_VERSION } },
      ],
    },
    { $set: { templatesSeedVersion: STARTER_VERSION, templatesSeeded: true } },
    { returnDocument: "before" },
  )
    .select("templatesSeeded templatesSeedVersion")
    .lean();
  if (!before) return; // already up to date
  // Accounts from before versions existed carry only the old on/off flag, meaning version 1.
  const had = before.templatesSeedVersion ?? (before.templatesSeeded ? 1 : 0);
  const fresh = SYSTEM_TEMPLATES.filter((t) => t.since > had);
  if (fresh.length === 0) return;
  await Template.insertMany(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `since` is only bookkeeping
    fresh.map(({ since, ...t }) => ({ ...t, userId: uid(userId), system: true })),
  );
}

function summary(kind: TemplateKind, payload: unknown): string {
  if (kind === "task_checklist") {
    const n = (payload as { items?: unknown[] }).items?.length ?? 0;
    return `${n} item${n === 1 ? "" : "s"}`;
  }
  const sections = (
    (payload as { content?: { content?: { type?: string }[] } }).content?.content ?? []
  ).filter((b) => b.type === "heading").length;
  return sections ? `${sections} section${sections === 1 ? "" : "s"}` : "Blank";
}

export async function listTemplates(userId: string): Promise<TemplateDTO[]> {
  await ensureSystemTemplates(userId);
  const docs = await Template.find({ userId: uid(userId) })
    .sort({ system: -1, name: 1 })
    .limit(200)
    .lean();
  return docs.map((t) => ({
    id: String(t._id),
    name: t.name,
    kind: t.kind,
    system: Boolean(t.system),
    summary: summary(t.kind, t.payload),
  }));
}

export async function createTemplate(userId: string, input: TemplateInput): Promise<TemplateDTO> {
  await connectDb();
  const doc = await Template.create({ ...input, userId: uid(userId), system: false });
  return {
    id: String(doc._id),
    name: doc.name,
    kind: doc.kind,
    system: false,
    summary: summary(doc.kind, doc.payload),
  };
}

export async function deleteTemplate(userId: string, id: string): Promise<boolean> {
  await connectDb();
  const res = await Template.deleteOne({ _id: id, userId: uid(userId) });
  return res.deletedCount === 1;
}

/** Saves a task's subtasks (or the task itself) as a reusable checklist. */
export async function saveTaskAsTemplate(
  userId: string,
  taskId: string,
  name?: string,
): Promise<TemplateDTO> {
  await connectDb();
  const task = await Task.findOne({ _id: taskId, userId: uid(userId), deletedAt: null }).lean();
  if (!task) throw new Error("Task not found");
  const items = (task.subtasks ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => s.title);
  return createTemplate(userId, {
    kind: "task_checklist",
    name: (name?.trim() || task.title).slice(0, 100),
    payload: { title: task.title, items: items.length ? items : [task.title] },
  });
}

export async function saveNoteAsTemplate(
  userId: string,
  noteId: string,
  name?: string,
): Promise<TemplateDTO> {
  await connectDb();
  const note = await Note.findOne({ _id: noteId, userId: uid(userId), deletedAt: null }).lean();
  if (!note) throw new Error("Note not found");
  const title = note.title || "Untitled note";
  const payload = {
    title: note.title ?? "",
    content: (note.content as Record<string, unknown>) ?? { ...EMPTY_DOC },
    ...(note.type === "meeting"
      ? {
          meeting: { attendees: note.meeting?.attendees ?? [], agenda: note.meeting?.agenda ?? "" },
        }
      : {}),
  };
  return createTemplate(userId, {
    kind: note.type === "meeting" ? "meeting_note" : "note",
    name: (name?.trim() || title).slice(0, 100),
    payload,
  });
}

/** Creates a task (checklist templates) or a note (note templates) from a template. */
export async function instantiateTemplate(
  userId: string,
  id: string,
  now = new Date(),
): Promise<{ kind: "task" | "note"; id: string }> {
  await connectDb();
  const t = await Template.findOne({ _id: id, userId: uid(userId) }).lean();
  if (!t) throw new Error("Template not found");

  if (t.kind === "task_checklist") {
    const payload = t.payload as { title?: string; items?: string[] };
    const task = await createTask(
      userId,
      {
        title: (payload.title || t.name).slice(0, 200),
        subtasks: (payload.items ?? []).map((title, order) => ({ title, done: false, order })),
      },
      now,
    );
    return { kind: "task", id: task.id };
  }

  const payload = t.payload as {
    title?: string;
    content?: Record<string, unknown>;
    meeting?: { attendees?: string[]; agenda?: string };
  };
  const note = await createNote(
    userId,
    {
      title: payload.title ?? "",
      content: payload.content,
      ...(t.kind === "meeting_note"
        ? {
            meeting: {
              date: now,
              attendees: payload.meeting?.attendees ?? [],
              agenda: payload.meeting?.agenda ?? "",
            },
          }
        : {}),
    },
    { type: t.kind === "meeting_note" ? "meeting" : "note" },
  );
  return { kind: "note", id: note.id };
}

/** A new meeting note pre-filled from the "Meeting notes" template (or blank if it was deleted). */
export async function createMeetingNote(userId: string, now = new Date()): Promise<{ id: string }> {
  await ensureSystemTemplates(userId);
  const tpl = await Template.findOne({ userId: uid(userId), kind: "meeting_note" })
    .sort({ system: -1, createdAt: 1 })
    .lean();
  if (tpl) return { id: (await instantiateTemplate(userId, String(tpl._id), now)).id };
  const note = await createNote(
    userId,
    { meeting: { date: now, attendees: [], agenda: "" } },
    { type: "meeting" },
  );
  return { id: note.id };
}
