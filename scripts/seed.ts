/* Creates a demo user with projects and tasks. Usage: npm run seed */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const DEMO_EMAIL = "demo@workdesk.app";
const DEMO_PASSWORD = "demo-password-1";
const TZ = "Asia/Kolkata";

async function main() {
  const { connectDb } = await import("../src/lib/db");
  const { User } = await import("../src/models/User");
  const { Project } = await import("../src/models/Project");
  const { Task } = await import("../src/models/Task");
  const { Note } = await import("../src/models/Note");
  const { NoteVersion } = await import("../src/models/NoteVersion");
  const { extractPlainText } = await import("../src/lib/tiptap");
  const { linkTaskNote } = await import("../src/server/notes");
  const { listTemplates } = await import("../src/server/templates");
  const { Template } = await import("../src/models/Template");
  const { registerUser } = await import("../src/server/users");
  const { quickAddTask, createTask } = await import("../src/server/tasks");
  const { createProject } = await import("../src/server/projects");
  const mongoose = (await import("mongoose")).default;

  await connectDb();
  await Promise.all([
    User.syncIndexes(),
    Project.syncIndexes(),
    Task.syncIndexes(),
    Note.syncIndexes(),
    NoteVersion.syncIndexes(),
    Template.syncIndexes(),
  ]);
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Promise.all([
      Task.deleteMany({ userId: existing._id }),
      Note.deleteMany({ userId: existing._id }),
      Template.deleteMany({ userId: existing._id }),
      NoteVersion.deleteMany({ userId: existing._id }),
      Project.deleteMany({ userId: existing._id }),
      User.deleteOne({ _id: existing._id }),
    ]);
  }
  const { id: userId } = await registerUser({
    name: "Demo User",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  await createProject(userId, { name: "Client A", color: "#00b97a" });
  await createProject(userId, { name: "Internal", color: "#3b82f6" });
  await createProject(userId, { name: "Hiring", color: "#f59e0b" });

  const phrases = [
    "Send weekly report to Rahul today 5pm #ClientA @report !high",
    "Prepare standup notes today 9:30am #Internal !p2",
    "Review contract draft tomorrow #ClientA @legal !p1",
    "Book meeting room for retro tomorrow 11am #Internal",
    "Reply to recruiter emails in 2 days #Hiring @email",
    "Schedule interviews next monday #Hiring !high",
    "Update onboarding doc in 3 days #Internal @docs remind:1h",
    "Prepare board update tomorrow 10am #Internal !p2 remind:30m",
    "Quarterly planning deck next friday #Internal !p1 @planning",
    "Submit expense report 25 dec @finance",
    "Weekly sync every monday 10am #ClientA",
    "Daily standup every weekday 9:30am #Internal",
    "Monthly invoice run every month @finance #ClientA !p2",
    "Water the office plants every week",
    "Get sign-off on pricing wait:Priya #ClientA !high",
    "Waiting for design assets wait:Karan #Internal",
    "Legal review feedback wait:Meera @legal",
    "Buy printer cartridges",
    "Read onboarding feedback",
    "Clean up shared drive @docs",
    "Draft job description for QA #Hiring @docs !p3",
    "Fix typo on pricing page #Internal !p4",
    "Archive old tickets @admin",
    "Set up 1:1 with Ananya next tuesday 3pm !p2",
    "Collect timesheets in 4 days @admin",
    "Test backup restore in 5 days #Internal !p3",
    "Plan team offsite in 10 days !p2",
    "Order welcome kits for new joiners tomorrow #Hiring",
    "Share meeting minutes today 6pm #ClientA @report",
  ];
  for (const text of phrases) await quickAddTask(userId, text, TZ);

  // a few overdue tasks
  const day = 86_400_000;
  await createTask(userId, {
    title: "Renew software licence",
    dueAt: new Date(Date.now() - 2 * day),
    priority: 1,
  });
  await createTask(userId, {
    title: "Follow up on vendor quote",
    dueAt: new Date(Date.now() - day),
    priority: 2,
  });

  // ---- notes (3 regular, 2 meeting) ----
  type Block = Record<string, unknown>;
  const text = (t: string): Block => ({ type: "text", text: t });
  const p = (t: string): Block => ({ type: "paragraph", content: [text(t)] });
  const h = (level: number, t: string): Block => ({
    type: "heading",
    attrs: { level },
    content: [text(t)],
  });
  const bullets = (...items: string[]): Block => ({
    type: "bulletList",
    content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
  });
  const checklist = (...items: string[]): Block => ({
    type: "taskList",
    content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [p(i)] })),
  });
  const doc = (...blocks: Block[]) => ({ type: "doc", content: blocks });

  const seedNotes = [
    {
      title: "Q4 planning",
      pinned: true,
      folder: "Planning",
      tags: ["planning", "q4"],
      content: doc(
        h(2, "Goals"),
        p("Ship the roadmap with client review and lock the Q4 budget."),
        bullets("Confirm scope with Client A", "Freeze the hiring plan", "Publish the roadmap"),
        h(2, "Risks"),
        p("Design assets are late; legal review is still pending."),
      ),
    },
    {
      title: "Onboarding checklist",
      folder: "Hiring",
      tags: ["hiring", "docs"],
      content: doc(
        h(2, "Before day one"),
        checklist("Laptop and accounts ready", "Buddy assigned", "Welcome kit ordered"),
        h(2, "First week"),
        bullets("Team intro lunch", "Product walkthrough", "First small task"),
      ),
    },
    {
      title: "Ideas parking lot",
      tags: ["ideas"],
      content: doc(
        p("Loose ideas to revisit."),
        bullets("Weekly digest email", "Shared client dashboard", "Meeting-notes templates"),
      ),
    },
    {
      title: "Weekly sync with Client A",
      type: "meeting" as const,
      folder: "Meetings",
      tags: ["meeting", "client-a"],
      meeting: {
        date: new Date(Date.now() - 2 * 86_400_000),
        attendees: ["Rahul", "Priya", "Demo User"],
        agenda: "Status, blockers, next steps",
      },
      content: doc(
        h(2, "Agenda"),
        bullets("Status update", "Blockers", "Next steps"),
        h(2, "Discussion"),
        p(
          "Rahul asked for the weekly report earlier in the day. Pricing feedback is still pending.",
        ),
        h(2, "Decisions"),
        bullets("Send the report by 5pm every Monday", "Pricing sign-off goes through Priya"),
        h(2, "Action items"),
        checklist(
          "Send weekly report to Rahul",
          "Get sign-off on pricing",
          "Share meeting minutes",
        ),
      ),
    },
    {
      title: "Hiring sync",
      type: "meeting" as const,
      folder: "Meetings",
      tags: ["meeting", "hiring"],
      meeting: {
        date: new Date(Date.now() - 5 * 86_400_000),
        attendees: ["Ananya", "Karan", "Demo User"],
        agenda: "Pipeline review",
      },
      content: doc(
        h(2, "Agenda"),
        bullets("Pipeline review", "Interview panel"),
        h(2, "Discussion"),
        p("Two strong QA candidates; need a panel for next week."),
        h(2, "Action items"),
        checklist("Schedule interviews", "Draft job description for QA"),
      ),
    },
  ];
  const createdNotes: Record<string, string> = {};
  for (const n of seedNotes) {
    const doc = await Note.create({ userId, ...n, plainText: extractPlainText(n.content) });
    createdNotes[n.title] = String(doc._id);
  }
  const linkPairs: [string, string][] = [
    ["Q4 planning", "Quarterly planning deck"],
    ["Q4 planning", "Plan team offsite"],
    ["Weekly sync with Client A", "Send weekly report"],
    ["Weekly sync with Client A", "Get sign-off on pricing"],
    ["Hiring sync", "Schedule interviews"],
    ["Onboarding checklist", "Order welcome kits"],
  ];
  for (const [noteTitle, taskPrefix] of linkPairs) {
    const task = await Task.findOne({ userId, title: new RegExp(`^${taskPrefix}`, "i") }).lean();
    if (task) await linkTaskNote(userId, String(task._id), createdNotes[noteTitle]);
  }

  // ---- Phase 4 sample data ----
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const byTitle = (prefix: string) =>
    Task.findOne({ userId, title: new RegExp(`^${prefix}`, "i") });

  // a few tasks completed this week, with tracked time, for the weekly review
  for (const [prefix, h, minutes] of [
    ["Send weekly report", 5, 50],
    ["Prepare standup notes", 8, 25],
    ["Reply to recruiter", 30, 40],
  ] as const) {
    const t = await byTitle(prefix);
    if (!t) continue;
    await Task.updateOne(
      { _id: t._id },
      {
        $set: { status: "done", completedAt: hoursAgo(h) },
        $push: {
          timeEntries: {
            startedAt: hoursAgo(h + 1),
            endedAt: hoursAgo(h + 1 - minutes / 60),
            minutes,
          },
        },
        $inc: { timeSpentMinutes: minutes },
      },
    );
  }

  // links on a task
  const withLinks = await byTitle("Review contract draft");
  if (withLinks) {
    await Task.updateOne(
      { _id: withLinks._id },
      {
        $set: {
          attachments: [
            { url: "https://acme.atlassian.net/browse/ENG-142", title: "ENG-142", kind: "jira" },
            {
              url: "https://acme.atlassian.net/wiki/spaces/ENG/pages/9001/Contract+Review+Checklist",
              title: "Contract Review Checklist",
              kind: "confluence",
            },
          ],
        },
      },
    );
  }

  // something in the trash
  const gone = await createTask(userId, { title: "Obsolete: rebook the old venue" });
  await Task.updateOne({ _id: gone.id }, { $set: { deletedAt: hoursAgo(26) } });
  await Note.create({
    userId,
    title: "Old draft (deleted)",
    plainText: "Superseded.",
    deletedAt: hoursAgo(80),
  });

  await listTemplates(userId); // creates the three starter templates

  const count = await Task.countDocuments({ userId, deletedAt: null });
  const noteCount = await Note.countDocuments({ userId, deletedAt: null });
  console.log(
    `Seeded ${count} tasks and ${noteCount} notes. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
