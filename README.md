<div align="center">

# WorkDesk

**One calm desk for your tasks, notes and meeting notes.**

Capture a task in three seconds, keep notes linked to the work they came from, and start every morning with a plan.

![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-47a248?logo=mongodb&logoColor=white)
![Tests](https://img.shields.io/badge/tests-246_unit_%C2%B7_60_e2e-00b97a)

<img src="docs/screenshots/today.png" alt="The Today view in WorkDesk" width="900">

</div>

---

## Contents

- [Why WorkDesk](#why-workdesk)
- [Screenshots](#screenshots)
- [Features](#features)
- [Quick add syntax](#quick-add-syntax)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Deployment](#deployment)
- [Project status and roadmap](#project-status-and-roadmap)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Why WorkDesk

Most to-do apps and note apps live apart. In an office day they are the same thing: a meeting produces notes, the notes produce tasks, and the tasks need to point back at the notes. WorkDesk keeps them in one place and linked both ways.

- **Fast.** Type a sentence and it becomes a dated, tagged, prioritised task.
- **Connected.** Mention a task with `@` or a note with `[[` and each side links back to the other.
- **Quiet.** Reminders use your browser's own notifications. There is no email, no push server and no background job to run.
- **Keyboard-first, mouse-friendly.** Every action has a shortcut and a button, and everything works on a phone.
- **Yours.** Export everything as JSON, CSV or Markdown at any time. Deleted items stay in Trash for 30 days.

## Screenshots

| Today, grouped and counted                                          | Board with drag and drop                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| <img src="docs/screenshots/today.png" alt="Today view" width="440"> | <img src="docs/screenshots/board.png" alt="Board view" width="440"> |

| Calendar                                                                  | Notes with linked tasks                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| <img src="docs/screenshots/calendar.png" alt="Calendar view" width="440"> | <img src="docs/screenshots/note.png" alt="Note editor" width="440"> |

| Dark mode                                                                             | Settings                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| <img src="docs/screenshots/today-dark.png" alt="Today view in dark mode" width="440"> | <img src="docs/screenshots/settings.png" alt="Settings" width="440"> |

| Landing page                                                                       |
| ---------------------------------------------------------------------------------- |
| <img src="docs/screenshots/landing.png" alt="The public landing page" width="900"> |

## Features

### Tasks

- Create, edit, complete and delete, with **undo** for both. Completing and deleting are optimistic, so the list responds instantly.
- Priority (P1 to P4), due date and time, tags, subtasks, a rich-text description and link attachments.
- **Projects are optional.** A task without one lives in **General**.
- One **Today** page with four tabs, each with its own count: **All** (every open task grouped into Overdue, Today, Upcoming, Later and No date), **Today**, **Upcoming** (the next two weeks) and **Overdue**. Counts and lists share one filter, so they cannot disagree.
- **Recurring tasks**: daily, weekdays, weekly, monthly, or a custom rule (every N days, weeks, months or years, chosen weekdays, optional end date). Completing one creates the next occurrence exactly once, in your timezone and correctly across daylight-saving changes.
- **Waiting on**: mark a task as waiting on a person with a follow-up date. A dedicated view is sorted by follow-up, highlights overdue ones and lets you push a date out.
- **Focus and time tracking**: a stopwatch or Pomodoro (25/5) on any task. The timer survives reloads, shows in a strip at the top, and time rolls up per task, per project and into the weekly review.
- Deleting throws the task into an animated bin at the bottom right, with an Undo toast.

### Notes

- A rich editor (Tiptap): headings, lists, checklists, quotes, code blocks, tables, links, and a `/` slash menu that accepts spaces (`/heading 1`).
- **Autosave** with a "Saved" indicator, flush-on-leave and local draft recovery.
- **Linking both ways**: `@` mentions a task, `[[` links a note. A note shows its linked tasks, and a task shows its linked notes.
- **Version history**: automatic snapshots, "Save version now", preview and restore (undoable).
- **Meeting notes**: date, attendees and agenda, with Agenda / Discussion / Decisions / Action items pre-filled. Select lines and press **Convert to task**: each becomes a task linked back to the note.
- Pin, folders, tags, project, search and filters. Export a note as Markdown, or as PDF through the print dialog.

### Planning

- **Board**: columns by status, project or priority. Drag cards between columns (empty ones included), reorder them, or use the card's menu. It is fully keyboard-accessible: `Space` lifts a card and the arrows move it.
- **Calendar**: month and week views. Drag a task to another day to reschedule it (its time of day is kept), or click a day to add one. On phones, tap a day to see its tasks.
- **Daily review**: completed today, still open, and slipped tasks with one-click Carry over, Reschedule and Drop. After your work hours end, Today offers to start it.
- **Weekly review**: completed count, completion rate, time per project, slipped tasks, notes created, week-by-week navigation, and a **Copy weekly report** button that produces Markdown for stand-ups.
- **Templates**: three starters (Meeting notes, Release checklist, Client kickoff). Save any note or a task's subtasks as a template.

### Reminders

- Add reminders in the task editor (at the due time, 15 minutes, 1 hour or 1 day before, or a custom time), or with `remind:15m` in quick add.
- Browser notifications with Done and Snooze actions, an in-app card when the tab is in front, a bell with history, a soft chime, quiet hours and an optional morning summary.
- **Reminders only fire while WorkDesk is open** in a browser tab or an installed app window. Anything that came due while it was closed is shown as one summary next time you open it. See [How reminders work](#reminders).

### Everywhere

- **Command palette** (`Ctrl/Cmd+K`): go anywhere, create things, switch theme, export, and search tasks and notes with highlighted snippets. Pick a task to change its status or priority, move it to tomorrow, start a timer or delete it.
- **Light and dark mode** (and "system"), with a smooth crossfade and no flash on load. The landing, sign-in and sign-up pages have a simple light/dark switch.
- **Installable PWA** that can be read offline. Adding and completing tasks offline syncs when you reconnect.
- An **offline indicator** in the top bar: an amber "Offline" pill (with a count of changes waiting to sync) that turns green for a moment when the connection returns. It also catches "connected to Wi-Fi but no internet", by checking quietly with backoff only after a request fails. Nothing polls while you are online.
- **Export**: everything as JSON, tasks as CSV, each note as Markdown.
- **Trash** with restore and automatic purge after 30 days.
- **Responsive** down to 280 px wide, with a bottom tab bar on phones. Motion respects `prefers-reduced-motion`.
- A public **Features** page (`/features`, no sign-in needed) that lists every feature, the quick-add syntax, all shortcuts and the limits, linked from the landing page.
- A built-in **Help and guide** page (`/help`) documents the commands and shortcuts.

## Quick add syntax

Type a sentence in the top bar (or press `Q`). A live preview shows what was understood before you press Enter. Everything is optional and the order does not matter.

```text
Send report tomorrow 5pm #clientA @report !high every monday wait:Priya remind:15m
```

| Type                                                                      | Meaning                                                                                                                                          | Example                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `tomorrow`, `friday`, `25 dec`, `in 2 hours`                              | Due date                                                                                                                                         | `Call Sam friday`                             |
| `5pm`, `17:30`                                                            | Due time (no time means all day)                                                                                                                 | `Standup tomorrow 9:30am`                     |
| `#project`                                                                | Project. The name is matched ignoring case, spaces and punctuation, so `#clientA` finds "Client A". If nothing matches, a new project is created | `Quote #clientA`                              |
| `@tag`                                                                    | Tag, as many as you like                                                                                                                         | `Draft @docs @q4`                             |
| `!p1` to `!p4`, `!urgent` `!high` `!medium` `!low`                        | Priority                                                                                                                                         | `Fix login !urgent`                           |
| `every day`, `every weekday`, `every week`, `every month`, `every monday` | Repeat                                                                                                                                           | `Water plants every week`                     |
| `wait:Priya`, `wait:"Priya Shah"`                                         | Waiting on someone                                                                                                                               | `Contract wait:Priya`                         |
| `remind:15m`, `remind:2h`, `remind:1d`                                    | Reminder before the due time                                                                                                                     | `Demo 3pm remind:30m`                         |
| A Jira or Confluence link                                                 | Recognised and attached                                                                                                                          | `Review https://…atlassian.net/browse/ABC-12` |

## Keyboard shortcuts

Shortcuts work when you are not typing in a field (and not while a dropdown or menu is open). Press `?` in the app to see the list.

| Keys                                 | Action                                         |
| ------------------------------------ | ---------------------------------------------- |
| `Q`                                  | Quick add a task                               |
| `N`                                  | New note                                       |
| `Ctrl/Cmd` + `K`, or `/`             | Command palette and search                     |
| `G` then `T` / `A` / `I` / `U` / `O` | Today / All tasks / Inbox / Upcoming / Overdue |
| `G` then `N` / `B` / `C` / `W` / `R` | Notes / Board / Calendar / Waiting on / Review |
| `E`                                  | Edit the focused task                          |
| `Space`                              | Complete or reopen the focused task            |
| `1` to `4`                           | Set the focused task's priority                |
| `?`                                  | Show all shortcuts                             |

## Tech stack

| Area          | Choice                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Framework     | [Next.js 16](https://nextjs.org) (App Router, server components, server actions, Turbopack) and React 19 |
| Language      | TypeScript (strict)                                                                                      |
| Styling       | Tailwind CSS 4 with design tokens, Radix UI primitives (dialog, dropdown, select, popover, tooltip)      |
| Database      | MongoDB through Mongoose 9                                                                               |
| Auth          | Auth.js v5 (credentials, with optional Google), JWT sessions, bcrypt password hashing                    |
| Data fetching | TanStack Query on the client, server actions on the server, Zod validation on both sides                 |
| Rich text     | Tiptap 3                                                                                                 |
| Dates         | date-fns and date-fns-tz, `chrono-node` for natural language, `rrule` for recurrence                     |
| Drag and drop | dnd-kit                                                                                                  |
| UI            | `cmdk` (palette), `sonner` (toasts), `lucide-react` (icons)                                              |
| Tests         | Vitest with `mongodb-memory-server` (unit and service), Playwright (end to end)                          |

## Getting started

### Prerequisites

- **Node.js 20.9 or newer** (22 or later recommended) and npm
- A **MongoDB** database: either a free [Atlas](https://www.mongodb.com/atlas) cluster or a local `mongod`

### Install and run

```bash
git clone <your-repo-url> workdesk
cd workdesk
npm install
cp .env.example .env.local     # then fill in the values below
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable                               | Required    | Notes                                                                                                                                                       |
| -------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`                          | Yes         | Connection string **including a database name**, for example `mongodb+srv://user:pass@cluster.mongodb.net/workdesk` or `mongodb://127.0.0.1:27017/workdesk` |
| `AUTH_SECRET`                          | Yes         | A long random string. Generate one with `npx auth secret` or `openssl rand -base64 32`                                                                      |
| `NEXT_PUBLIC_APP_URL`                  | Recommended | The public address of the app (for share cards). Defaults to `http://localhost:3000`                                                                        |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | No          | Google sign-in appears only when both are set                                                                                                               |

With Atlas, add your IP address under **Network Access** so the app can connect.

### Admin panel

Administrators sign in on their own page, `/admin/login`, and get an **Admin** link in the sidebar (`/admin`): overview, user management (add,
suspend, promote, reset password, delete), an audit log, and a switch to close sign-ups. Admins only
see counts, never anyone's tasks or notes. Make the first admin with either:

```bash
npm run make-admin -- you@example.com     # add --revoke to undo
# or set ADMIN_EMAILS=you@example.com in .env (those emails are admins when they sign in or register)
```

### Using a local MongoDB

If you have no Atlas cluster, run a local database with data kept in `.data/mongo`:

```bash
npm run db:local               # starts mongod on 127.0.0.1:27017
```

Then set `MONGODB_URI=mongodb://127.0.0.1:27017/workdesk`. (If no `mongod` is found, run `npm test` once: it downloads one.)

### Try it with demo data

```bash
npm run seed
```

This creates `demo@workdesk.app` with the password `demo-password-1`, three projects, tags, about 30 tasks (some overdue, some recurring, one waiting on someone) and five notes.

### Open it on your phone during development

Run `npm run dev` and open `http://<your-computer's-ip>:3000` on a phone on the same Wi-Fi. The config already allows private network addresses in development (`allowedDevOrigins` in `next.config.ts`). If it does not load, check that your computer's firewall allows the port.

## Scripts

| Script                        | What it does                          |
| ----------------------------- | ------------------------------------- |
| `npm run dev`                 | Start the dev server                  |
| `npm run build` / `npm start` | Production build and serve            |
| `npm run lint`                | ESLint                                |
| `npm run typecheck`           | TypeScript in strict mode             |
| `npm test`                    | Unit and service tests (Vitest)       |
| `npm run e2e`                 | Browser end-to-end tests (Playwright) |
| `npm run ci`                  | lint, typecheck, test and build       |
| `npm run seed`                | Create the demo account and data      |
| `npm run db:local`            | Run a local MongoDB                   |
| `npm run format`              | Prettier                              |

## Testing

WorkDesk is tested at two levels, and neither needs a database you manage yourself.

**Unit and service tests (`npm test`)** run 246 tests in Vitest against an in-memory MongoDB. They cover the quick-add parser, recurrence across daylight-saving changes, reminders, the review maths, the board model, offline queueing, exports, the SSRF guard for link previews, and the services themselves, including that **one user can never read or change another user's data**.

**End-to-end tests (`npm run e2e`)** run 60 Playwright tests in a real browser. The script starts its own in-memory MongoDB, builds the app into `.next-e2e` (so a running dev server is not disturbed), serves it on port 3200 and runs every flow:

- the landing page, sign up, sign in, sign out and protected redirects
- quick add, editing every task field, undo, Trash, recurring tasks, waiting on, tabs and counts, and keyboard shortcuts
- the board (including real mouse drags into empty columns), the calendar, projects, tags and templates
- notes: autosave, the slash menu, `@` and `[[` links, version history, export, meeting notes
- Settings, the slider, dropdowns, themes (including no flash on load), and the collapsing sidebar
- going offline and coming back (including a server that cannot be reached while the browser thinks it is online)
- access control between users
- a **health sweep of every page at 1280, 768, 375 and 280 px** that checks for sideways scrolling, unnamed buttons, unlabelled fields and landmarks

Every end-to-end test also fails if the browser logs an error. To run one test: `npm run e2e -- -g "moves a card"`.

## Project structure

```text
src/
  app/                  Routes (App Router)
    (app)/              The signed-in app: today, inbox, board, calendar, notes, ...
    (auth)/             Sign in and sign up
    api/                Auth, export and reminder endpoints
    page.tsx            The public landing page
  components/           UI, grouped by area: tasks, notes, board, calendar, layout, ...
    ui/                 Buttons, dialog, select, tooltip, elastic slider
  server/               Server actions and services. Every function takes a userId
  models/               Mongoose models: User, Project, Task, Note, NoteVersion, Template
  schemas/              Zod schemas shared by client and server
  lib/                  Pure logic: quick-add parser, recurrence, dates, reminders, review, ...
  hooks/                React hooks
  proxy.ts              Optimistic sign-in check (replaces middleware in Next 16)
tests/                  Vitest unit and service tests
e2e/                    Playwright end-to-end tests
scripts/                seed.ts, local-db.sh, e2e.mjs
public/                 PWA manifest, service worker, icons
docs/DECISIONS.md       The decisions made along the way, with reasons
scope.md                The original product specification
```

## How it works

### Data and security

- **Every query is scoped to the signed-in user.** Services take a `userId` and never trust one from the client. This is tested.
- Server actions return `{ ok, data }` or `{ ok: false, error }`. A single wrapper authenticates, validates input with Zod and revalidates the page.
- Deletes are **soft** (`deletedAt`), which is what makes Undo and Trash possible.
- Passwords are hashed with bcrypt. Sign-up, quick add and link attachments are rate limited.
- Link titles are fetched through an **SSRF guard**: private and loopback addresses are refused (including through DNS and redirects), with a timeout and a size cap.
- Security headers include a Content Security Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

### Dates and recurrence

Times are stored in UTC and shown in the user's timezone. Recurrence rules run on "floating" wall-clock times, so a 9:30 stand-up stays at 9:30 across daylight-saving changes. Spawning the next occurrence is idempotent, so double clicks and retries cannot create duplicates.

### Reminders

There is **no server-side scheduler, email or push service**, by design. A small scheduler runs in the open app: it keeps the next 48 hours of reminders in memory, checks the clock every 30 seconds (no network), and when one is due it makes a single call to claim it, so several tabs or devices never show the same reminder twice. If the tab is in front you get an in-app card, otherwise a browser notification. Missed reminders appear as one summary on the next visit.

### Offline

A service worker caches the app's static files and the pages you have visited. Only two actions queue for later: adding a task and completing or reopening one. Everything else needs a connection, and notes keep a local draft and retry. Signing out clears the saved pages and any unsent changes from the device. The worker caches nothing in development; test offline with `npm run build && npm start`.

### Theming

Colours are design tokens that change under a `dark` class. A small inline script sets the saved theme before first paint, so there is no flash. Switching uses the browser's View Transitions for a smooth crossfade (instant with reduced motion).

## Deployment

WorkDesk deploys to **Vercel with MongoDB Atlas**:

1. Create an Atlas cluster and a database user.
2. Import the repository into Vercel and set `MONGODB_URI`, `AUTH_SECRET` and `NEXT_PUBLIC_APP_URL` (plus the Google variables if you use them).
3. In Atlas **Network Access**, allow Vercel's egress (or `0.0.0.0/0` with a strong database password).
4. Deploy. No cron job or scheduler is needed, because reminders run in the browser.

Any Node host that can run `npm run build && npm start` works too.

## Project status and roadmap

| Phase | Scope                                                                                   | Status      |
| ----- | --------------------------------------------------------------------------------------- | ----------- |
| 1     | Accounts, projects, tasks, quick add, Today and Inbox                                   | Done        |
| 2     | Notes, linking, version history, global search                                          | Done        |
| 3     | Board, calendar, recurring tasks, reminders                                             | Done        |
| 4     | Meeting notes, waiting on, reviews, focus timer, templates, palette, export, Trash, PWA | Done        |
| 5     | Polish                                                                                  | In progress |

Phase 5 so far: the end-to-end suite, the landing page, responsive and keyboard-focus audits, and many empty and error states. Still to do:

- skeleton loaders for every view
- list virtualisation and cursor pagination (lists currently stop at 500 tasks and 200 notes)
- a screen-reader pass and a formal accessibility audit
- a Lighthouse performance pass

**Deliberately out of scope for v1:** team sharing, assignments, comments, calendar sync, email-to-task, Slack, Jira or Teams integrations, and AI features. The schema is designed so these can be added later.

## Documentation

- [scope.md](scope.md): the original product specification
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions made per phase, with the reasons
- The in-app **Help and guide** page (`/help`) covers commands, quick add and shortcuts for end users

## Contributing

1. Fork the repository and create a branch.
2. Make your change, with a test for it where it makes sense.
3. Run `npm run ci` (lint, typecheck, unit tests and a production build). For anything that touches the interface, also run `npm run e2e`.
4. Open a pull request describing what changed and why.

**A note on Next.js 16:** this project uses Next.js 16, which has breaking changes from earlier versions (for example `proxy.ts` instead of middleware, and `params` and `searchParams` as promises). Read the relevant guide in `node_modules/next/dist/docs/` before changing routing code.

## License

No license has been chosen yet. Add a `LICENSE` file before publishing if you want others to use or contribute to the code.
