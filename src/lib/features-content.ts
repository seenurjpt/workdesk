/**
 * Everything WorkDesk does, in plain words, for the public Features page. Keep it truthful: if a
 * feature changes, change it here too (and the limits under `LIMITS`).
 */

export type IconName =
  "zap" | "tasks" | "layout" | "notes" | "bell" | "command" | "phone" | "shield";

export interface FeatureItem {
  title: string;
  body: string;
  /** Short examples or keys shown as chips. */
  chips?: string[];
}

export interface FeatureSection {
  id: string;
  icon: IconName;
  title: string;
  intro: string;
  items: FeatureItem[];
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "capture",
    icon: "zap",
    title: "Capture",
    intro: "Get a task down the moment it comes up, without stopping to fill in a form.",
    items: [
      {
        title: "Quick add from one sentence",
        body: "Type it the way you would say it. WorkDesk picks out the date, time, project, tags, priority, repeat, who you are waiting on and a reminder, and shows what it understood before you press Enter.",
        chips: ["Send report tomorrow 5pm #clientA @report !high every monday"],
      },
      {
        title: "Add from anywhere",
        body: "Press Q, use the top bar, tap Add on a phone, use the Add task button at the bottom of any list, click a day on the calendar, or use a column on the board. Each one opens the same quick add.",
        chips: ["Q"],
      },
      {
        title: "Works with no connection",
        body: "Tasks you add while offline are kept on your device and sent when you are back online.",
      },
      {
        title: "Paste a link",
        body: "Paste any link onto a task. Jira and Confluence links are recognised straight away, and the title of other pages is fetched safely.",
      },
      {
        title: "Templates",
        body: "Start a checklist or a note from a reusable template. Nineteen starters are included, from Daily plan, Weekly review and Bug triage to One-on-one, Retrospective and Project brief, and you can save your own from any note or a task's subtasks.",
      },
    ],
  },
  {
    id: "tasks",
    icon: "tasks",
    title: "Tasks",
    intro: "Everything you need on a task, and nothing you have to fill in.",
    items: [
      {
        title: "Priority, dates and times",
        body: "Four priority levels (P1 to P4), a due date, and an optional time. A task with a date but no time is an all-day task.",
      },
      {
        title: "Projects are optional",
        body: "A task does not need a project. Tasks without one live in General, and you can move them into a project any time.",
      },
      {
        title: "Tags, subtasks and descriptions",
        body: "Tag tasks, split them into subtasks (the row shows progress such as 1/3), and add a rich-text description with lists, checklists and links.",
      },
      {
        title: "Recurring tasks",
        body: "Repeat daily, on weekdays, weekly, monthly, or on your own rule (every N days, weeks, months or years, chosen weekdays, an end date). Completing one creates the next occurrence once, in your timezone, and a 9:30 stand-up stays at 9:30 across daylight-saving changes. Reopening it removes the copy.",
        chips: ["every weekday", "every monday", "every 2 weeks"],
      },
      {
        title: "Waiting on",
        body: "Mark a task as waiting on a person, with a follow-up date. A dedicated page lists them by follow-up date, highlights overdue ones, and lets you push a date out a day or three.",
        chips: ["wait:Priya"],
      },
      {
        title: "Status",
        body: "To do, In progress, Blocked and Done are built in. Add up to six statuses of your own (for example In review or Waiting for QA) from the Board (Manage statuses) or Settings, and drag them into the order you want, and they become columns between Blocked and Done. Change a task's status by dragging it on the board or from the command palette.",
      },
      {
        title: "Undo and Trash",
        body: "Completing and deleting both come with Undo. Deleted items go to Trash, where you can restore them. They are removed for good after 30 days.",
      },
      {
        title: "Links on tasks",
        body: "Attach links to a task. Jira and Confluence links get a recognisable label.",
      },
    ],
  },
  {
    id: "views",
    icon: "layout",
    title: "Views and planning",
    intro: "See your work the way the moment needs: now, this week, or everything at once.",
    items: [
      {
        title: "Today, with four tabs",
        body: "One page, four tabs, each with a count. All shows every open task grouped as Overdue, Today, Upcoming, Later and No date. Today shows today's tasks plus what slipped. Upcoming is the next two weeks. Overdue is what you missed. The counts and the lists always agree.",
        chips: ["All", "Today", "Upcoming", "Overdue"],
      },
      {
        title: "Inbox, General, projects and tags",
        body: "An Inbox for new items, General for tasks with no project, a page for every project, and a page for every tag.",
      },
      {
        title: "Board",
        body: "Columns by status, by project or by priority. Drag a card to another column (empty columns too), reorder inside a column, or use the card's menu. On a phone, press and hold a card, then drag. With a keyboard, press Space to lift a card and the arrow keys to move it.",
      },
      {
        title: "Calendar",
        body: "Month and week views. Drag a task to another day to reschedule it (its time of day is kept), or click a day to add one. On a phone, tap a day to see its tasks.",
      },
      {
        title: "Daily review",
        body: "Completed today, still open, and slipped. Carry over, reschedule or drop slipped tasks in one click, each with Undo. After your work hours end, Today offers to start it.",
      },
      {
        title: "Weekly review",
        body: "Tasks completed, completion rate, time per project as a chart, slipped tasks and notes created, week by week. One button copies a Markdown weekly report for stand-ups and appraisals.",
      },
    ],
  },
  {
    id: "notes",
    icon: "notes",
    title: "Notes and meetings",
    intro: "Notes that stay connected to the work they came from.",
    items: [
      {
        title: "A real editor",
        body: "Headings, bold and italic, lists, checklists, quotes, code blocks, tables and links, with a toolbar and a slash menu. Type / and a block name (spaces work: /heading 1).",
        chips: ["/"],
      },
      {
        title: "Autosave and version history",
        body: "Notes save themselves and show Saved. If something goes wrong, unsaved text is recovered next time. Automatic snapshots plus Save version now give you a history you can preview and restore, and a restore can be undone.",
      },
      {
        title: "Link tasks and notes both ways",
        body: "Type @ to mention a task and [[ to link another note. A note lists its linked tasks, and a task lists its linked notes.",
        chips: ["@task", "[[note]]"],
      },
      {
        title: "Meeting notes",
        body: "A meeting note has a date, attendees and an agenda, with Agenda, Discussion, Decisions and Action items already laid out. Put the cursor on an action line (or select several) and press Convert to task: each becomes a task linked back to the note.",
      },
      {
        title: "Organise and find",
        body: "Pin notes, file them in folders, add tags and a project, and search or filter the list.",
      },
      {
        title: "Take it with you",
        body: "Export a note as Markdown, or as a PDF through your browser's print dialog. Save any note as a template.",
      },
    ],
  },
  {
    id: "focus",
    icon: "bell",
    title: "Reminders and focus",
    intro: "Be told at the right time, then protect the time you work.",
    items: [
      {
        title: "Reminders",
        body: "Remind yourself at the due time, 15 minutes, 1 hour or 1 day before, or at a custom time. Timed tasks get a default reminder you can change, and all-day tasks remind you when your work hours start.",
        chips: ["remind:15m"],
      },
      {
        title: "Notifications you can act on",
        body: "Browser notifications with Done and Snooze buttons, an in-app card when WorkDesk is in front, and a bell that keeps a history. Snooze for 10 minutes, 1 hour or until tomorrow.",
      },
      {
        title: "Calm settings",
        body: "Quiet hours that hold reminders until they end, an optional morning summary, and a soft chime you can switch off (Chime, Bell or Pop, with a volume slider).",
      },
      {
        title: "Stopwatch and Pomodoro",
        body: "Start a stopwatch or a 25/5 Pomodoro on any task. One timer runs at a time, shown in a floating dock at the bottom of the screen. It is saved on the server, so it survives a reload.",
      },
      {
        title: "Focus mode",
        body: "Open the full-screen timer from the dock: just the task, the time, and buttons to complete the task, stop, or go back.",
      },
      {
        title: "Time tracking",
        body: "Time rolls up per task, per project and into the weekly review. Completing or deleting a task stops its timer.",
      },
    ],
  },
  {
    id: "speed",
    icon: "command",
    title: "Speed",
    intro: "Keyboard first, mouse friendly. Everything has both.",
    items: [
      {
        title: "Command palette",
        body: "Press Ctrl/Cmd+K to go anywhere, create things, switch theme, export, and search all your tasks and notes with highlighted matches. Pick a task to change its status or priority, move it to tomorrow, start a timer, or delete it.",
        chips: ["Ctrl K", "/"],
      },
      {
        title: "Shortcuts",
        body: "Create, jump between pages, and act on the focused task without leaving the keyboard. The full list is below, and press ? in the app to see it any time.",
      },
      {
        title: "Instant feedback",
        body: "Completing, deleting and moving happen immediately, with Undo, so the app never makes you wait for the server.",
      },
    ],
  },
  {
    id: "everywhere",
    icon: "phone",
    title: "On every device",
    intro: "The same app on a desktop, a tablet and a phone, online or off.",
    items: [
      {
        title: "Made for phones too",
        body: "A bottom tab bar, a floating Add button, touch dragging on the board and calendar, and layouts that work from 280 pixels wide.",
      },
      {
        title: "Install it, and use it offline",
        body: "Install WorkDesk like an app. Pages you have visited can be read offline, and adding or completing tasks while offline syncs when you reconnect. An Offline indicator in the top bar tells you what state you are in.",
      },
      {
        title: "Light and dark",
        body: "Light, dark, or follow your device, with a smooth switch and no flash when a page loads. Your choice is saved to your account.",
      },
      {
        title: "Accessible and calm",
        body: "Clear keyboard focus, labelled buttons and fields, page landmarks, and motion that switches off when you ask your device to reduce it.",
      },
      {
        title: "Your layout, your way",
        body: "Collapse the sidebar to icons, fold Projects and Tags away, and set your timezone, week start and work hours.",
      },
    ],
  },
  {
    id: "data",
    icon: "shield",
    title: "Your data",
    intro: "It is yours: easy to take out, and kept apart from everyone else's.",
    items: [
      {
        title: "Export anything",
        body: "All your data as JSON, your tasks as CSV, and each note as Markdown or PDF.",
      },
      {
        title: "Private to your account",
        body: "Every request is checked against the signed-in account, so one person can never read or change another's data. Passwords are stored hashed.",
      },
      {
        title: "Safe link previews",
        body: "When WorkDesk fetches a page title for a link, it refuses private and internal addresses, follows redirects carefully, and gives up quickly on slow pages.",
      },
      {
        title: "Sign in",
        body: "Email and password. Google sign-in appears when the host has set it up.",
      },
    ],
  },
];

/** The honest list: what WorkDesk does not do, or only does within limits. */
export const LIMITS: FeatureItem[] = [
  {
    title: "Reminders need WorkDesk open",
    body: "Reminders are browser notifications. They fire while WorkDesk is open in a browser tab or an installed app window. There is no email or push service. Anything that came due while it was closed is shown as one summary the next time you open it.",
  },
  {
    title: "Offline has limits",
    body: "Only pages you have already opened can be read offline, and only adding a task and completing or reopening one are kept for later. Everything else needs a connection.",
  },
  {
    title: "Built for one person",
    body: "There is no team sharing, assigning, commenting, calendar sync, email-to-task, chat or Jira integration, or AI features yet.",
  },
  {
    title: "Big lists",
    body: "A single list shows up to 500 tasks, and the notes list up to 200. Search and filters find the rest.",
  },
];
