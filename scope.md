# AGENTS.md — "WorkDesk": Office To-Do + Notes App

> Instructions for the AI coding agent. Read this entire file before writing code.
> Build the app end-to-end, phase by phase, in the order given in §12.
> Where this file is silent, choose the simplest sensible option and note it in `docs/DECISIONS.md`.

---

## 1. Product summary

WorkDesk is a personal productivity app for office work: **tasks + notes + meeting notes**, tightly linked, fast, keyboard-friendly, with **light and dark mode**.

Primary user: a single office professional (multi-user ready via `userId` scoping, but no team features in v1).

Core promises:
1. Capture a task in under 3 seconds (quick-add with natural language).
2. Never lose a note (autosave + version history).
3. Turn meeting notes into action items in one click.
4. Start each day with a clear Today view, end each week with an auto-generated review.

---

## 2. Tech stack (use these; do not substitute without a reason in DECISIONS.md)

| Concern | Choice |
|---|---|
| Framework | Next.js (latest stable, App Router), TypeScript strict mode |
| Styling | Tailwind CSS + CSS variables for theme tokens, shadcn/ui as the component base (restyled to §5) |
| Fonts | `next/font/google`: **Titillium Web** (headings, weights 600/700) and **Inter** (UI/body, weights 300/500/600) |
| Theme switching | `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) |
| DB | **MongoDB** (Atlas or local) via **Mongoose** |
| Auth | Auth.js (next-auth v5) — Credentials (email+password, bcrypt) and Google; MongoDB adapter |
| Validation | Zod (shared schemas for client forms and server actions/route handlers) |
| Forms | react-hook-form + @hookform/resolvers/zod |
| Data fetching/cache | TanStack Query for client interactions; server components for initial loads |
| Rich text | Tiptap (StarterKit, TaskList/TaskItem, Link, Placeholder, Typography, CodeBlock, Table, slash-command menu) |
| Drag & drop | dnd-kit |
| Dates | date-fns + date-fns-tz; natural-language parsing with chrono-node |
| Recurrence | `rrule` |
| Calendar view | Build custom month/week grid (no heavy calendar lib) |
| Command palette | `cmdk` |
| Reminders | Browser Notification API + a small service worker (no email, no push server, no cron). Fires while the app is open; missed ones are summarised on next open. |
| Icons | lucide-react |
| Toasts | sonner |
| Testing | Vitest (unit), Playwright (e2e smoke), MongoDB Memory Server for DB tests |
| Lint/format | ESLint, Prettier, Husky + lint-staged |

PWA: installable (manifest + service worker via `serwist` or hand-written SW), offline shell.

---

## 3. Project structure

```
workdesk/
├─ AGENTS.md
├─ DESIGN.md                    # optional: from `npx getdesign@latest add jobright`
├─ docs/DECISIONS.md            # log of any choices you made
├─ .env.example
├─ public/ (manifest.webmanifest, sw.js, icons/)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login, register
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx          # sidebar + topbar + command palette
│  │  │  ├─ today/ upcoming/ overdue/ inbox/
│  │  │  ├─ projects/[id]/
│  │  │  ├─ board/              # kanban
│  │  │  ├─ calendar/
│  │  │  ├─ notes/ notes/[id]/
│  │  │  ├─ waiting/
│  │  │  ├─ review/             # daily & weekly review
│  │  │  ├─ templates/
│  │  │  ├─ trash/
│  │  │  └─ settings/
│  │  ├─ api/
│  │  │  ├─ auth/[...nextauth]/
│  │  │  ├─ reminders/action/   # snooze/done from notification buttons (service worker)
│  │  │  └─ export/
│  │  ├─ globals.css            # theme tokens (§5)
│  │  └─ layout.tsx
│  ├─ components/ (ui/, tasks/, notes/, layout/, review/, shared/)
│  ├─ lib/
│  │  ├─ db.ts                  # cached Mongoose connection (global for dev HMR)
│  │  ├─ auth.ts
│  │  ├─ quick-add-parser.ts
│  │  ├─ recurrence.ts
│  │  ├─ review.ts
│  │  ├─ reminders.ts, recurrence.ts (pure date maths)
│  │  └─ utils.ts
│  ├─ models/ (User, Project, Task, Note, NoteVersion, Template)
│  ├─ schemas/                  # Zod
│  ├─ server/                   # server actions & services (tasks.ts, notes.ts, ...)
│  └─ hooks/
└─ tests/
```

Rules:
- All DB access goes through `src/server/*` services. **Every query is scoped by `userId` from the session.** Never trust a `userId` from the client.
- Server actions or route handlers validate input with Zod before touching the DB.
- No `any`. No unused code left behind.

---

## 4. Environment variables (`.env.example`)

```
MONGODB_URI=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 5. Design system

Source of inspiration: the **Jobright** design language (independent analysis from getdesign.md — not official; do **not** use Jobright's name, logo or copy). Character: energetic spring-mint accent on black and white, pale-mint section bands, bold condensed headings over clean Inter UI, high-contrast **pill buttons**, rounded cards, generous whitespace, friendly and high-energy.

Tokens marked **(derived)** are not in the source and were added for dark mode and accessibility.

### 5.1 Color tokens

Define as CSS variables in `globals.css`, map to Tailwind (`bg-background`, `text-foreground`, etc.). Components must use semantic tokens only, never raw hex.

```css
:root {
  /* brand (from source) */
  --accent: #00f0a0;            /* spring-mint */
  --on-accent: #000000;

  /* surfaces */
  --bg: #ffffff;                /* canvas */
  --band: #ecffe0;              /* pale spring-mint section band */
  --surface: #ffffff;           /* cards */
  --surface-soft: #f2f4f5;      /* utility fill */

  /* text */
  --text: #000000;
  --text-muted: #86909c;        /* decorative/secondary only: ~3.2:1 on white */
  --text-muted-strong: #5f6b76; /* (derived) use for any muted text users must read, 5.4:1 */
  --accent-text: #007a4d;       /* (derived) mint text/links on light bg, 5.4:1; raw #00f0a0 fails on white */

  /* lines */
  --border: #e5e7eb;            /* 1px hairline */

  /* primary button = black pill */
  --btn-primary-bg: #000000;
  --btn-primary-fg: #ffffff;

  /* semantic (derived) */
  --danger: #e5484d;
  --warning: #f59e0b;
  --info: #3b82f6;
  --success: #00b97a;

  /* priority (derived) */
  --p1: #e5484d; --p2: #f59e0b; --p3: #3b82f6; --p4: #86909c;

  --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.06);
  --ring: #00f0a0;
}

.dark {
  /* all (derived): keep the same personality, invert the surfaces */
  --bg: #0a0d0c;
  --band: #0e1f17;             /* deep mint-tinted band */
  --surface: #121715;
  --surface-soft: #1a211e;
  --text: #f5f7f6;
  --text-muted: #9aa6a0;
  --text-muted-strong: #b4beb9;
  --accent: #00f0a0;           /* accent stays identical */
  --on-accent: #000000;
  --accent-text: #00f0a0;      /* mint reads well on dark */
  --border: #26302b;
  --btn-primary-bg: #ffffff;   /* black pill inverts to white pill */
  --btn-primary-fg: #000000;
  --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.45);
}
```

Rules:
- Mint `#00f0a0` is a **fill** (buttons, active indicators, progress, highlights) always paired with **black** text. Never use raw mint as text on a light background; use `--accent-text`.
- Never convey meaning by color alone (priority and status also get an icon or label).
- Meet WCAG AA for all text; focus ring is 2px `--ring` with 2px offset on every interactive element.

### 5.2 Typography

| Token | Font | Size / weight / line-height / tracking | App usage |
|---|---|---|---|
| display | Titillium Web | 80 / 700 / 1.05 / -1px | Landing/login hero only |
| h1 | Titillium Web | 60 / 700 / 1.1 / -0.5px | Login/empty-state hero |
| h2 | Titillium Web | 48 / 700 / 1.15 | Rare; marketing-style panels |
| **page-title** | Titillium Web | 38 / 700 / 1.2 | Page titles ("Today", "Notes") |
| **section-title** | Titillium Web | 32 / 600 / 1.25 | Big stat numbers, review headings |
| body-lg | Inter | 18 / 300 / 1.6 | Intro/description text |
| body | Inter | 16 / 500 / 1.6 | Default body, note content |
| body-sm | Inter | 14 / 500 / 1.5 | Task rows, metadata |
| button | Inter | 16 / 600 / 1 | Buttons |
| nav-link | Inter | 14 / 600 / 1.4 | Sidebar and topbar items |
| caption | Inter | 13 / 500 / 1.4 | Timestamps, badges |

On mobile, scale display/h1/h2 down but keep weight. Task lists and tables stay dense (body-sm).

### 5.3 Spacing, radius, elevation, layout

- 8px base. Scale: `xxs 4, xs 8, sm 12, md 16, lg 24, xl 32, xxl 48, section 96`.
- Radius: `0` inputs · `12` small buttons/menus · `16` task cards · `24` columns/testimonial-style cards · `28` black/white pill · `36` mint pill · `40` hero feature card (one corner reduced to 12px for the asymmetric look, derived) · `9999` avatars, progress rings, toggles.
- Elevation: Level 0 = 1px hairline or nothing (rows, inputs, bands). Level 2 = `--shadow-float` for floating cards over bands, popovers, command palette. Do not add more levels.
- Breakpoints: Mobile `<576`, Tablet `576–991`, Laptop `992–1199`, Desktop `≥1200`. Content column max ~1200px; full-bleed bands allowed.
- Mobile: sidebar becomes a bottom tab bar (Today, Tasks, Notes, Calendar, More) plus a floating quick-add button; pills go full width in forms; touch targets ≥ 44×44.

### 5.4 Component styles

- **button-primary:** pill, radius 28, `--btn-primary-bg` / `--btn-primary-fg`, Inter 600 16px, height 44, padding 0 20px.
- **button-accent (signature):** mint pill, radius 36, `--accent` fill, black label, 1px black border (light mode) / no border (dark). Use for the single most important action per screen (e.g., "Add task", "Convert to tasks").
- **button-secondary:** pill, transparent, 1px `--border`, `--text` label.
- **button-utility:** radius 12, for dense toolbars.
- **link:** `--accent-text`, underline on hover.
- **input / textarea / select:** square corners (0), `--surface` bg, 1px `--border`, 12px/16px padding, focus = 2px `--ring`. Compact inline editors in task rows may use radius 12.
- **task row:** no card; 1px bottom hairline; checkbox (round, mint fill + black check when done), title (body-sm), priority dot + label, due-date chip, project tag. Hover shows quick actions.
- **task card (kanban):** `--surface`, radius 16, 1px border, padding 16; drag shadow = Level 2.
- **kanban column:** `--surface-soft`, radius 24, padding 12.
- **badge/tag:** radius 9999, caption text, `--surface-soft` fill; project color shown as a 8px dot.
- **band:** use `--band` full-bleed behind dashboard hero/summary (Today header, Weekly Review).
- **Today ticker (signature element):** a full-width black band (in dark: `--surface-soft`) with a slow marquee of today's/overdue task titles. Pauses on hover, static list when `prefers-reduced-motion: reduce`.
- **stat-item:** Titillium Web 32–38 / 700 number with caption label (used in Review and Today header).
- **empty states:** hero feature card (40px asymmetric corner, Level 2 shadow) with short Titillium heading, one line of body-lg, and a mint pill CTA.
- **command palette:** `cmdk`, radius 24, Level 2 shadow, centered.

### 5.5 Dark/light mode implementation

- `next-themes` with `class` strategy; theme toggle (System / Light / Dark) in the topbar and in Settings.
- No flash of wrong theme (use `suppressHydrationWarning` on `<html>`).
- Tiptap, calendar, drag overlays, toasts, and popovers must all respect tokens in both themes.
- Persist the preference locally; also store `theme` on the user document.

### 5.6 Do / Don't

- Do keep pages airy; mint is an accent, not a background for large text areas (use `--band` for large mint areas).
- Do use pills for buttons, square inputs, rounded cards.
- Do use Titillium Web only for headings and numbers; Inter everywhere else.
- Don't use more than one mint pill per view.
- Don't use gradients, glassmorphism, or heavy shadows.
- Don't put `#00f0a0` text on white.

---

## 6. Data model (Mongoose)

All collections have `timestamps: true`. All user-owned documents have `userId: ObjectId` (indexed). Soft delete with `deletedAt` for tasks and notes (Trash view, 30-day purge job).

**User**
```ts
{ name, email (unique), passwordHash?, image?, timezone: string (default "Asia/Kolkata"),
  theme: "system"|"light"|"dark", weekStartsOn: 0|1 (default 1),
  workHours: { start: "09:30", end: "18:00" },
  reminderPrefs: { defaultOffsetMin: number|null (15), quietHours: { enabled, start, end }, morningSummary: bool } }
```

**Project**
```ts
{ userId, name, color (hex), icon?, archived: bool, order: number }
```

**Task**
```ts
{
  userId, projectId?, title (≤200), description? (Tiptap JSON),
  status: "todo"|"in_progress"|"blocked"|"done",
  priority: 1|2|3|4,                       // 1 = urgent
  dueAt?: Date, startAt?: Date, allDay: bool,
  reminders: [{ _id, at: Date, offsetMin: number|null, sentAt?: Date, dismissedAt?: Date }],  // browser reminders only
  tags: string[],
  subtasks: [{ _id, title, done: bool, order }],
  recurrence?: { rrule: string, timezone: string, endsAt?: Date },
  recurrenceParentId?: ObjectId,
  waitingOn?: { person: string, followUpAt?: Date, note?: string },
  linkedNoteIds: ObjectId[],
  sourceNoteId?: ObjectId,                 // set when created from a meeting note
  timeSpentMinutes: number (default 0),
  timeEntries: [{ startedAt, endedAt?, minutes }],
  order: number,                           // position within board column / list
  completedAt?: Date, deletedAt?: Date
}
```
Indexes: `{userId, status, dueAt}`, `{userId, projectId, order}`, `{userId, tags}`, `{userId, "waitingOn.followUpAt"}`, `{userId, deletedAt}`, text index on `title`.

**Note**
```ts
{
  userId, projectId?, title, content (Tiptap JSON), plainText (for search),
  tags: string[], pinned: bool, folder?: string,
  type: "note"|"meeting",
  meeting?: { date: Date, attendees: string[], agenda?: string },
  linkedTaskIds: ObjectId[], deletedAt?: Date
}
```
Indexes: `{userId, updatedAt: -1}`, `{userId, pinned: -1, updatedAt: -1}`, text index on `title` + `plainText`.

**NoteVersion** (separate collection): `{ noteId, userId, title, content, savedAt }`. Keep at most 50 per note; snapshot at most once per 5 minutes of editing (and on explicit "Save version").

**Template**: `{ userId, name, kind: "task_checklist"|"meeting_note", payload }` plus 3 seeded system templates on first login (Meeting notes, Release checklist, Client kickoff).

---

## 7. Features and acceptance criteria

### Phase 1: Foundation (MVP core)
1. **Auth**: register, login, logout, Google login, protected routes, per-user data isolation.
2. **Projects**: create, edit (name, color), archive, reorder; sidebar list.
3. **Tasks CRUD**: create/edit/delete (soft), complete/uncomplete with optimistic UI, subtasks, priority, due date/time, tags, project, description editor.
4. **Views**: Inbox (no project/date), **Today** (due today + overdue + "Plan for today" suggestions), **Upcoming** (grouped by day, next 14 days), **Overdue**, project view, tag view.
5. **Quick add** (see §8): global shortcut `Q`, topbar input, mobile floating button.
6. **Theme**: light/dark/system fully working across every screen.
7. **App shell**: sidebar (collapsible), topbar with search + theme toggle + quick-add, responsive layouts per §5.3.

*Done when:* a user can sign up, add tasks via quick-add, see them in correct views, complete them, switch theme with no visual bugs, and data persists in MongoDB.

### Phase 2: Notes
1. Tiptap editor with headings, lists, checklists, links, code blocks, tables, slash menu (`/`), and **autosave** (debounced 800ms, "Saved" indicator).
2. Notes list with search, pinned notes first, tag/folder filters.
3. **Bidirectional linking**: link tasks to notes and notes to tasks (picker + `@task` / `[[note]]` mentions); show "Linked tasks" panel in a note and "Linked notes" in a task.
4. **Version history**: list, preview, restore.
5. **Global search** (`Ctrl/Cmd+K` and `/`): tasks and notes, ranked, highlighted snippet, keyboard navigation.

*Done when:* editing never loses content, links work both ways, search returns relevant results in <300ms on 5k docs.

### Phase 3: Planning views
1. **Kanban board** (columns = status; also group by project/priority), drag-and-drop with persisted `order`, keyboard-accessible moves.
2. **Calendar** (month and week): tasks by due date, drag a task to reschedule, click empty day to create.
3. **Recurring tasks**: UI to set daily/weekdays/weekly/monthly/custom; completing an instance generates the next one (no duplicates, timezone-aware).
4. **Reminders (browser notifications only)**: per-task reminders (at time, 15 min / 1 hr / 1 day before, or custom); snooze (10 min, 1 hr, tomorrow) from the notification; in-app bell with recent reminders. A client-side scheduler fires them while the app is open (no cron, no email, no push server). Reminders that came due while closed are summarised on next open. See `docs/DECISIONS.md` (Phase 3).

### Phase 4: Office power features
1. **Meeting notes**: template with date, attendees, agenda, discussion, decisions, action items. Select any line or checklist item and press **"Convert to task"**; the task gets `sourceNoteId` and appears linked in the note.
2. **Waiting-on tracker**: any task can be marked "Waiting on <person>" with follow-up date; dedicated `/waiting` view sorted by follow-up; overdue follow-ups highlighted.
3. **Daily review** (shown after work hours or on demand): completed today, still open, slipped (carry over / reschedule / drop in one click).
4. **Weekly review**: completed count, completion rate, time per project (bar chart using tokens), slipped tasks, notes created, copy-as-Markdown "Weekly report" button for standups/appraisals.
5. **Focus mode + time tracking**: start/stop timer on a task, Pomodoro option (25/5), running timer persisted across reloads, `timeSpentMinutes` rolled up per project.
6. **Templates**: save any checklist or note as a template; create from template.
7. **Command palette** (`Ctrl/Cmd+K`): navigate, create task/note, toggle theme, change task status/priority.
8. **Keyboard shortcuts** (listed in a `?` help dialog): `Q` quick add, `N` new note, `G then T` Today, `G then U` Upcoming, `G then N` Notes, `E` edit, `Space` complete, `1-4` set priority.
9. **Attachments & links**: URL attachments on tasks (with favicon/title), plus paste-detection for Jira/Confluence links. (File uploads are optional in v1; if added, use S3-compatible storage, 10MB limit, never store blobs in MongoDB.)
10. **Export**: all data as JSON; tasks as CSV; each note as Markdown/PDF (print stylesheet).
11. **Trash**: restore or permanently delete; auto-purge after 30 days.
12. **PWA**: installable, offline shell, offline read of recently viewed items; queue simple writes offline and sync on reconnect (best effort).

### Phase 5: Polish
Accessibility audit (keyboard + screen reader), empty/loading/error states for every view, skeleton loaders, performance pass, e2e tests, README, seed script.

### Out of scope for v1 (do not build)
Team sharing, assignments, comments, calendar sync, email-to-task, Slack/Jira/Teams integrations, AI features. Design the schema so these can be added later.

---

## 8. Quick-add parser spec (`src/lib/quick-add-parser.ts`)

Input example: `Send report to Rahul tomorrow 5pm #clientA @report !high every monday`

Parse with chrono-node (use the user's timezone) plus these tokens:
- `#name` → project (create-if-missing prompt)
- `@name` → tag
- `!p1..!p4`, `!urgent`, `!high`, `!medium`, `!low` → priority
- Natural dates/times: today, tomorrow, next friday, in 3 days, 25 dec, 5pm
- `every <weekday|day|week|month>` → recurrence
- `wait:<person>` → waitingOn

Behavior: show a **live preview** of the parsed chips under the input; remove recognized tokens from the title; Enter creates; Esc cancels. Unit-test at least 25 phrases including edge cases (past times roll to next occurrence, "tomorrow" near midnight, IST timezone).

---

## 9. API and server logic guidelines

- Prefer **server actions** for mutations from the UI and **route handlers** for reminder actions, export, and auth.
- Every mutation: authenticate → validate (Zod) → authorize by `userId` → execute → `revalidatePath`/invalidate query.
- Pagination: cursor-based (`_id` + sort field), page size 50.
- Return typed results `{ ok: true, data } | { ok: false, error }`; never leak stack traces.
- Rate-limit auth endpoints and quick-add (simple in-memory/Mongo token bucket is fine).
- `lib/db.ts` must cache the Mongoose connection on `globalThis` to avoid connection storms in dev and serverless.

---

## 10. Security and quality

- Hash passwords with bcrypt (cost ≥ 12). Never log secrets or password hashes.
- Sanitize rendered rich-text/URLs (no raw `dangerouslySetInnerHTML` of user content).
- CSRF-safe by using Auth.js sessions + same-site cookies; set security headers (CSP, X-Frame-Options, Referrer-Policy) in `next.config`.
- Validate and cap sizes: title 200, note content 500KB, tags ≤ 20 per item.
- All dates stored in UTC; displayed in the user's timezone (default `Asia/Kolkata`).
- Performance targets: Lighthouse ≥ 90 on Today and Notes; no layout shift when toggling theme; list virtualization when > 200 items.

---

## 11. Testing requirements

- **Unit (Vitest):** quick-add parser, recurrence next-date logic, review aggregation, permission scoping.
- **Integration:** task/note services against MongoDB Memory Server; verify cross-user access is impossible.
- **E2E (Playwright, smoke):** register → add task by quick-add → see in Today → complete → create note → convert meeting line to task → toggle dark mode → logout.
- CI script: `lint`, `typecheck`, `test`, `build` must all pass before a phase is considered done.

---

## 12. Build order and working agreement

Work phase by phase (§7). For each phase:
1. Write a short plan (files to create, models touched).
2. Implement, then run lint, typecheck, and tests.
3. Manually verify in **both themes** and at **375px and 1280px** widths.
4. Commit with a clear message (`feat(tasks): ...`), update `docs/DECISIONS.md` if you deviated.
5. Only then start the next phase.

Also provide:
- `README.md` with setup (`pnpm install`, `.env`, `pnpm dev`), scripts, and how to deploy (Vercel + MongoDB Atlas; no cron needed).
- `scripts/seed.ts` creating a demo user, 3 projects, ~30 tasks (mixed priorities/dates, some recurring, some waiting-on), 5 notes (including 2 meeting notes).

**Definition of done (whole app):** every feature in Phases 1–4 works with real MongoDB data, passes AA contrast in both themes, is usable by keyboard, is responsive down to 375px, installs as a PWA, and the e2e smoke test passes.

**Never:** hard-code colors outside tokens, skip userId scoping, store secrets in code, add features from the "out of scope" list, or use a UI/brand asset from Jobright.
