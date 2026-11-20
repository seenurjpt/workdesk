# WorkDesk work log

A dated log of what was done each day, newest first. Ask for an **"EOD update"** and the latest
day's section (the summary at the top of it) is what gets reported.

How entries are written: a short **summary**, then the **details** (what changed and where), then
**open items**. New days are added at the top, under this heading.

---

## Fri 20 Nov 2026

### Summary (for an EOD update)

- **Reminder buttons** (bell list and in-app reminder card): pressing Done, 10 min, 1 hr, Tomorrow or
  Clear now shows a spinner on that button and disables the rest of the row until the server
  answers, so one reminder cannot be actioned twice. The in-app card closes only if it worked.
- **Voice input for tasks**: a mic button in quick add (topbar, Q dialog, mobile "+"), the `V`
  shortcut and an "Add task by voice" palette command. Speech fills the field live and is never
  saved until Enter. Spoken phrases like "high priority", "4 p.m.", "remind me 15 minutes
  before", "hashtag clientA" and "waiting on Rahul" are turned into quick-add syntax.
- **Voice assistant** (rule based, no AI): topbar sound-wave button, `M` shortcut or "Voice
  assistant" in the palette. Say "open notes", "add a task call Priya tomorrow 5 pm", "remind me to
  …", "mark call Priya as done", "search for invoice", "new note called …", "dark mode", "stop the
  timer". It shows what it heard, does it, and answers out loud (mute button remembered).

### Details

1. Files: `src/components/reminders/notification-bell.tsx`, `reminder-toast.tsx`,
   `reminder-provider.tsx` (`act` now reports success). tsc and eslint clean; not run in a browser.
2. Voice input uses the browser's Web Speech API (no server or DB changes). The mic button is hidden
   where unsupported (Firefox, and Brave, which blocks the speech service). It stops after a pause or 30 s, and errors (mic blocked, no speech,
   offline) show a toast. In Chrome the audio goes to Google's speech service. Files:
   `src/hooks/use-speech-input.ts`, `src/lib/voice-input.ts`, `src/components/tasks/quick-add.tsx`,
   `global-search.tsx`, `src/lib/shortcuts.ts`; tests `tests/voice-input.test.ts` (5). Not tried with
   a real microphone yet.
3. Voice accuracy pass (free, browser speech only): asks the engine for 5 guesses per phrase and picks
   the one naming the user's projects/tags; keeps listening through short pauses (stops after ~2 s
   of silence; Android keeps the engine's own stop because continuous mode repeats words there);
   understands spoken times ("four thirty pm", "10 30", "half past four", "quarter to five", "at
   four" → 4pm), parts of day ("tomorrow morning" → 9am, "tonight" → 8pm, "end of the day" → 5pm),
   "for/in project <name>" with one-letter typo tolerance for existing projects, "tagged <tag>".
   Quick-add preview now matches projects like the server does ("#clientA" = "Client A"). Brave is
   treated as unsupported (it blocks the speech service). Tests: `tests/voice-input.test.ts` (10).
4. Voice assistant: `src/lib/voice-commands.ts` (pure intent parser: navigate incl. the user's projects
   and tags, addTask, complete, newNote/newMeeting, search, theme, stopTimer, help, cancel; never
   guesses), `src/components/voice/voice-assistant.tsx` (provider + floating panel, spoken replies
   via speechSynthesis, example chips you can tap, auto-close after success). The palette's query
   moved into `GlobalSearchProvider` so "search for X" opens it pre-filled. "Mark X as done" uses
   global search and completes the first open match (toast has Undo). `useSpeechInput.start()` now
   replaces a running round, so dev Strict Mode double-mounting doesn't kill auto-listening.
   Tests: `tests/voice-commands.test.ts` (26). Not tried with a real microphone.
5. Brave and Firefox voice support: on-device Whisper (`onnx-community/whisper-base.en`, 8-bit, ~77 MB,
   downloaded once from Hugging Face after the user agrees, cached by the browser; audio never leaves
   the device). `public/speech-worker.js` (transformers.js 3.7.6 from jsDelivr),
   `src/lib/local-speech.ts` (worker client, mic recording with silence detection, 16 kHz
   resampling), `useSpeechInput` picks "native" (Chrome/Edge/Safari) or "local" (Brave/Firefox),
   `src/components/voice/speech-notice.tsx` (consent, download progress, transcribing). CSP now
   allows jsDelivr + Hugging Face (connect/script), 'wasm-unsafe-eval' and blob: workers (old policy
   kept as a comment in `next.config.ts`). Checked in headless Chromium under the same CSP: JFK
   sample transcribed word-perfect; model load ~25–40 s first time; warm transcription of a 3 s
   clip ~10 s single-threaded on this machine (tiny.en: ~3 s but misheard). Multi-threading
   (COOP/COEP credentialless + blob: scripts) halved it to ~5 s; not enabled (app-wide headers).
   Safari uses its built-in recognition (needs Siri/Dictation enabled); not tested on a Mac.
6. Own voice visuals (no library): `src/components/voice/voice-visuals.tsx` with a canvas `VoiceOrb`
   (mint blob from --accent/--accent-text with glow; idle breathes, listening follows the mic,
   thinking shows a travelling arc, speaking pulses while replies are read out, error turns red;
   follows theme changes, still under reduced motion) and `LiveWaveform` (scrolling level bars in
   the quick-add preview while listening). `src/hooks/use-mic-level.ts` measures mic loudness with
   its own stream (skipped on Android, where it would break Chrome's speech service; visuals fall
   back to synthetic motion). Old CSS bars kept commented in globals.css. Screenshots checked in
   light and dark from a scratch build.
7. On-device speech was too slow (~10 s "Transcribing…" in Brave). Switched Whisper base.en → Moonshine
   base (`onnx-community/moonshine-base-ONNX`, 8-bit, 63 MB): Whisper always processes a 30 s
   window, Moonshine only what was said. Headless benchmark, warm, 3 s command: Whisper 4.3 s →
   Moonshine 0.45 s (11 s speech: 5.2 s → 1.7 s), same words. Worker now runs a warm-up after
   loading, caps output tokens by audio length, and the app preloads the cached model 4 s after
   opening once the user has agreed to the download.
8. Assistant panel glow: rotating conic-gradient border (mint → blue → violet → deep green), blurred
   halo behind it and an inner-edge glow (`.voice-glow` / `.voice-glow-inner` in globals.css,
   `@property --voice-angle`). `--voice-level`, set every frame from the mic level, brightens it as
   you talk; spin is 7 s idle, 4 s listening, 3 s speaking, 1.4 s thinking. Static under reduced
   motion. Old frame classes kept as a comment in `voice-assistant.tsx`. Screenshots checked in light
   and dark.
   Fix: `.voice-glow { position: relative }` (unlayered CSS) beat Tailwind's `fixed`, so the panel
   fell to the bottom of the page. Position now comes from the classes; non-fixed uses get
   `position: relative` via `:not(.fixed, .absolute, .sticky)`. The inner card also carries its own
   bg/border/radius classes as a fallback. Turbopack dev stopped reloading `globals.css` (seen on
   :3000 and a scratch dev server); restart dev, `rm -rf .next` if needed.
9. The assistant panel now closes when you click or tap anywhere outside it (Esc and the X still work).
   The top-bar voice button and toasts are excluded (`data-voice-trigger` / sonner toast), so the
   button still toggles instead of closing and reopening. Not tried in a browser.
10. The assistant panel zooms in (0.78 → 1, 0.3 s, fading in) and zooms out on every close (outside
    click, Esc, X, auto-close after an action). `VoiceAssistantHost` keeps it mounted for 200 ms
    after closing (`data-closing`), ignores late microphone results meanwhile, and gives each opening
    a fresh panel. `.voice-zoom` in globals.css; reduced motion = no zoom. Measured on a scratch
    build: width 380 → 448 px opening, 447 → 349 px closing.
11. Assistant panel redesigned, then simplified to a minimal layout and moved: bottom-right on desktop
    (md and up), centred on the screen on phones (zoom origin follows). Contents: a 64 px orb that is
    the only button (tap to finish speaking / speak again), one line of live text or result, one muted
    caption, tiny mute + close icons, and up to 5 example chips only when a command wasn't understood
    or on "what can you do". No header, status chip, rotating hints, big buttons or footer; the
    mint wash was dropped, the glowing border kept. `useSpeechInput` gained `cancel()` (stop without
    callbacks; fixes a false "Didn't catch that" toast when tapping an example while the on-device
    engine was listening, and stops the mic as soon as the panel starts closing). Checked with a
    scripted fake speech engine on a scratch build, light/dark and a 390 px phone.

### Open items

- See the open items under Thu 19 Nov (e2e not rerun, passwords to change, scratch servers).

---

## Thu 19 Nov 2026

### Summary (for an EOD update)

A big feature day on top of mobile polish.

- **Admin panel** (`/admin`, own sign-in page `/admin/login`, own shell with no app navigation):
  overview, user management (add, suspend, promote, reset password, delete), audit log, and a switch
  to close sign-ups. Admins see counts only, never anyone's tasks or notes.
- **Per-user Activity log** (`/activity`): what you did in the last 7 days, in plain words.
- **Custom task statuses**: add up to 6 of your own, rename, remove, and drag any status (except
  Done) into the order you want; the Board follows.
- **19 starter templates** (16 new), added to existing accounts without bringing back deleted ones.
- **Faster pages**: roughly half the database queries per page load.
- **Mobile and polish**: new bottom navigation, touch dragging on the board, toasts moved off the
  middle of the screen, the running timer as a floating dock (light in dark mode) that grows into the
  full-screen focus view, one timer at a time, a short animated offline message, and a public
  **Features** page linked from the landing page. Demo data was loaded into the real Atlas database.

Unit suite: 290 tests pass. The browser (e2e) suite was not rerun today.

### Details

1. **Mobile bottom navigation redesigned**
   - Active tab has a green pill behind its icon and a bolder icon; "More" lights up on pages that
     live under it (Board, Settings, Projects, Tags, and so on).
   - Even spacing, 22px icons, 11px labels, 56px-tall tap targets, press feedback, safe-area padding.
   - The black "+" button sits above the bar without overlapping it; pages get more bottom space.
   - Files: `src/components/layout/mobile-nav.tsx`, `src/components/layout/app-shell.tsx`.

2. **Offline message: short and animated**
   - The explanation at the bottom ("You're offline. Adding or completing tasks still works.") now
     shows for 3 seconds, then fades out with an exit animation. It ignores taps while showing.
     The amber "Offline" pill in the top bar stays as the lasting indicator.
   - Files: `src/components/shared/offline-provider.tsx`, `src/app/globals.css` (`lp-pop-out`).

3. **Hydration warning explained (no code change)**
   - The `pb-24` vs `pb-28` warning came from testing with DevTools set to Offline: the service worker
     showed a saved copy of the page from before a code change. Reloading online clears it.

4. **Demo data seeded into the real Atlas database**
   - `npm run seed` against the `workdesk` database in `.env`: 31 tasks, 5 notes, 3 projects.
     Sign in with `demo@workdesk.app` / `demo-password-1`.
   - Only the demo account is touched. Delete that account before real users sign up.

5. **Board: press-and-hold dragging on touch screens**
   - Mouse drag unchanged; touch needs a 250 ms press-and-hold, so normal swipes still scroll.
     A small vibration on pick-up, and no text selection or copy menu on long press.
   - Dragging near the left or right edge slides the board, now slowed to a controllable speed
     (it used to cross a phone-sized board in under half a second).
   - The calendar uses the same touch handling.
   - Verified with an emulated touchscreen: swipe scrolls, hold-and-drag moves a card into
     "In progress", and it persists after a reload.
   - Files: `src/components/board/board-view.tsx`, `src/components/calendar/calendar-view.tsx`.

6. **Toasts moved on phones**
   - Phones (under 768px): toasts appear at the top, below the top bar. Larger screens: bottom right,
     above the delete-bin corner. Before this, phone toasts floated mid-screen.
   - File: `src/components/shared/providers.tsx`.

7. **Running timer is now a floating dock**
   - Bottom-centre dark pill (above the tab bar on phones) with the task name, a large time readout,
     a focus-mode button and Stop. The phone "+" button lifts above it while a timer runs; pages get
     extra bottom space.
   - **The previous full-width strip under the top bar is kept as comments**, with restore steps:
     `src/components/focus/focus-strip.tsx` (bottom of file), `src/components/layout/app-shell.tsx`,
     `src/components/layout/mobile-nav.tsx`.

8. **Focus screen opens by growing out of the dock**
   - The full-screen timer expands from the dock's position (dark to page colour, content fades in)
     and shrinks back into it on close. Instant with reduced motion.
   - Verified on desktop with slowed-down frames. The phone run of the check script failed while
     starting a timer, so the phone animation was not seen.
   - Files: `src/lib/focus-morph.ts` (new), `src/components/focus/focus-mode.tsx` (previous lines
     left as comments), `src/components/focus/focus-strip.tsx`, `src/app/globals.css`.

9. **Toasts on desktop** moved to the top right under the top bar (previous bottom-right position left in a comment): `src/components/shared/providers.tsx`.

10. **One timer at a time**
    - While a timer runs, no other task offers a start option: row play buttons, the phone ⋮ menu,
      the command palette and the task editor all hide it; the running task shows Stop. A second
      start attempt gets a "A timer is already running" toast.
    - Files: `src/components/focus/start-timer-menu.tsx`, `task-row-menu.tsx`, `focus-provider.tsx`,
      `src/components/shared/global-search.tsx`.

11. **Public Features page** at `/features` (works signed out)
    - Every feature in plain words across 8 topic sections (43 features), plus the quick-add syntax
      table, all keyboard shortcuts, and a "Good to know" list of limits. Linked from the landing
      page navigation, a "See every feature" button and the footer.
    - Content lives in `src/lib/features-content.ts` (edit there when features change); syntax table
      shared with the Help page in `src/lib/quick-add-syntax.ts`.
    - Files: `src/app/features/page.tsx`, `src/components/landing/landing-nav.tsx` (now takes a list
      of links), `src/app/page.tsx`, `src/proxy.ts` (route made public).
    - Navbar dock fix: labels no longer wrap onto two lines; the dock is wider (900px) and "Sign in"
      is hidden between tablet and laptop widths where there is no room (it is in the hero and footer).
      File: `src/components/landing/landing-nav.tsx`.
    - e2e: the landing "Features" link test now matches exactly, and a new Features page test was
      added, **neither run yet**.

12. **Admin panel** (`/admin`, administrators only; everyone else gets the normal "not found")
    - Overview (user and content counts, 14-day sign-up chart, newest accounts, recent admin
      activity), Users (search, filters, sort, paging, Add user with a one-time password), a user
      page (suspend with reason / reactivate, make or remove administrator, reset password, delete by
      typing the email), Audit log (every admin change, paged) and Settings (sign-ups open/closed,
      purge Trash older than 30 days).
    - Privacy: admins see counts only, never anyone's tasks, notes or password hashes. Admins cannot
      suspend, demote or delete themselves; the last active admin is protected.
    - Suspended people are signed out within about 30 seconds and cannot sign in. Closed sign-ups
      show a notice on the register page and block Google sign-up too.
    - Becoming admin: `npm run make-admin -- you@example.com` (add `--revoke` to undo), or list
      emails in `ADMIN_EMAILS` in `.env`. Existing sessions pick it up within ~30 s.
    - 21 unit tests (`tests/admin.test.ts`) pass. Checked in a scratch build at desktop and 375px:
      pages load with no sideways scroll, add user and suspend work. Admin e2e tests not written.
    - **Admin sign-in page** at `/admin/login` (own page, no app shell): only active administrators
      get in; anyone else sees the same "Incorrect email or password". Signed-out visits to any
      `/admin` page go there; signed-in admins visiting it go straight to `/admin`. Rate limited.
    - **Separate admin shell**: the panel has its own layout (sidebar with Overview, Users, Audit log,
      Settings, plus theme and Sign out), with none of the task/notes navigation, search or quick add.
      The Admin link was removed from the normal app menus. Lives in `src/app/admin/(panel)/`,
      `src/components/admin/admin-shell.tsx`.
    - Files: `src/server/admin.ts`, `admin-actions.ts`, `settings.ts`, `src/models/AuditLog.ts`,
      `AppSetting.ts`, `src/app/(app)/admin/**`, `src/components/admin/**`, sidebar/mobile menu link.

13. **Activity log for each user** (`/activity`, in the sidebar, phone More menu and command palette)
    - Shows what you did in the last 7 days, grouped by day in your timezone: sign-ins, tasks added,
      edited, moved, completed, reopened, trashed or restored, notes and projects created, timer
      start/stop, templates, settings changes, Trash emptied. Private to the account.
    - Capped at 7 days twice over: the database deletes entries after 7 days (TTL index) and the page
      only reads the last 7 days. Deleting an account removes its entries. Note autosave is not logged.
    - Files: `src/models/ActivityLog.ts`, `src/server/activity.ts`, `run()` in
      `src/server/actions.ts` (new `log` option), `src/app/(app)/activity/page.tsx`,
      `tests/activity.test.ts` (4 tests pass).

14. **Activity lines made clearer**: moves say where ("Moved "X" to In progress"), edits list the
    fields changed, timers name the task and time, Trash and restore name the item.
15. **Custom task statuses**
    - The four built-in statuses stay. Each person can add up to 6 of their own (name 1 to 24
      characters, no duplicates of any status, case ignored), rename them, and remove them. They sit
      between Blocked and Done on the Board, and appear in the command palette's status list.
    - A custom status counts as open work like To do; only Done means finished. Removing one moves
      its tasks back to To do. Renaming keeps its tasks (tasks store a stable key, not the name).
    - Manage them from **Board → Manage statuses** (dialog; drag to reorder) or **Settings → Task statuses**.
    - The server rejects a status that is not built in or the person's own.
    - Files: `src/lib/statuses.ts`, `src/server/statuses.ts`, `src/components/statuses/status-manager.tsx`,
      `board-model.ts`, `board-view.tsx`, `global-search.tsx`, `settings-form.tsx`; `tests/statuses.test.ts`
      (6 tests). Whole unit suite passes (279). e2e not rerun.

16. **Status dragging fixes**: every status except Done can now be dragged into any position
    (built-in ones too; they still cannot be renamed or removed). The order is saved per account and
    used by the Board and the command palette. The drag is kept inside the list and moves up and down
    only, which fixes the dialog growing endlessly when a row was dragged past the bottom.
    Tests: `tests/statuses.test.ts` (10 pass).

17. **Fewer database queries per page** (measured with a query counter in a scratch build)
    - The signed-in user and session are now read once per request and shared by the layout and the
      page (React `cache`), instead of 4 to 5 separate reads.
    - The sidebar's projects, tags and no-project count come from one query (`src/server/sidebar.ts`)
      instead of three; the four tab counts on Today come from one query instead of four (same
      filters as the lists, so counts and lists still agree).
    - The trash tidy-up now runs after the page is sent, not before it.
    - Queries per page load: Today 17 to 8, Inbox 11 to 5, Board 10 to 5, Settings 10 to 4,
      Notes 13 to 7. Against the remote Atlas database each query is a network round trip, so this
      should be felt more there than on a local database. Not timed on Atlas.
    - Checked that link prefetching (about 30 background requests per page) does not run queries.
    - Files: `src/server/session.ts`, `sidebar.ts`, `tasks.ts` (countTabs), `reminders.ts`, `timer.ts`,
      `trash.ts`, `src/app/(app)/layout.tsx`; `tests/sidebar.test.ts`. Unit suite passes (285).

18. **16 more starter templates** (19 in all; first opening Templates adds them)
    - Checklists: Daily plan, Weekly review, New joiner onboarding, Bug triage, Code review, Sprint
      planning, Interview day, Business trip, Month-end close.
    - Meeting notes: One-on-one, Daily stand-up, Retrospective. Notes: Project brief, Weekly status
      report, Decision log, Interview feedback.
    - Existing accounts get only the new ones (starter-set version, atomic); a starter someone
      deleted does not come back. Note cards now say "N sections" instead of repeating the kind.
    - Files: `src/server/templates.ts`, `User.templatesSeedVersion`; `tests/starter-templates.test.ts`
      (5 tests); two old tests that hard-coded "3 starters" updated. Unit suite passes (290).

### Open items

- The browser end-to-end suite has **not been rerun** since the touch drag, toast, timer dock,
  focus-morph, admin, activity, status and template changes (testing was paused on request). There
  are no e2e tests for the admin panel yet; the board drag test may need a small adjustment.
- **Security housekeeping:** the admin account `admin@workdesk.app` in the real database has a
  password that appeared in chat, so change it; the demo account (`demo@workdesk.app`) has a published
  password and is not an admin; delete it before real users sign up.
- The query savings were measured by counting queries on a local database, not timed against Atlas.
- Scratch test servers (ports 3100 to 3118) and a scratch database (27018) were left running because
  stopping them was blocked; they do not touch your dev server or data.
- One Settings test ("dropdowns work by keyboard...") fails about one full run in four: an arrow key
  is sometimes lost. Undecided whether it is test timing or a real keyboard issue in the dropdown.
- The dock, toast and focus-morph changes were seen on desktop and one phone size; real devices have
  not been tried.
- Phone access over Wi-Fi: the phone could not reach this PC on the local network (cause not found:
  phone settings, router, or firewall). Not resolved.

---

## Wed 18 Nov 2026

### Summary (for an EOD update)

A very large day. WorkDesk went from the working app to a finished-looking product: public landing
page, redesigned sign-in and sign-up, a smooth light/dark switch, redesigned sidebar and settings,
custom dropdowns and slider, tooltips, an animated delete bin, an offline indicator, and a
60-test browser suite plus a full README with screenshots. Several real bugs were found and fixed
by the tests.

### Details

- **New All tab** on the Today page (every open task grouped Overdue / Today / Upcoming / Later /
  No date), with `G` `A` shortcut and palette entry; "Add task" button at the bottom of every list.
- **Hover and rounding polish**: rounded hover on task rows, notes, calendar, board and link picker;
  all fields, dropdowns, editors and the calendar days rounded; calendar weekday labels redesigned.
- **Help page** (`/help`): quick-add syntax, shortcuts and tips, linked from sidebar, phone menu,
  palette and the `?` dialog.
- **Landing page** at `/` (typed quick-add demo, scrolling ticker, live "try it" box running the real
  parser, feature cards, scroll reveals) with a navbar that turns into a floating dock on scroll.
- **Sign-in and sign-up redesign**: brand panel, icon fields, show/hide password, strength meter,
  error box, spinner, Google icon; light/dark switch (no "system") on the public pages.
- **Theme**: smooth crossfade switch via the View Transitions API; replaced `next-themes` with a small
  own provider (also fixed the dev "1 Issue" badge); no flash on load.
- **Sidebar**: collapsible Projects and Tags with slide animation, icon-only rail aligned and fitted
  without a scrollbar, scrollbar space always reserved, smooth open/close, tooltips (warm group,
  with shortcut keys and counts).
- **Settings**: split into separate cards; custom animated dropdown (Radix Select) everywhere;
  elastic slider for volume.
- **Quick add box** rounded and the same height as Search (fixed a half-pixel misalignment).
- **Delete bin**: deleted items fly into a bin at the bottom right with Undo.
- **Offline indicator**: top-bar pill with queued-change count, "Back online" confirmation, and
  detection of "Wi-Fi but no internet" (probes with backoff, only after a failure).
- **Board**: fixed dropping into empty columns (drop target now follows the pointer); four equal
  columns that fit side by side, no scrolling inside a column; scrolls sideways beyond four.
- **Bugs fixed (found by tests)**: command palette Enter picking a stale result; global shortcuts
  firing inside open dropdowns; slash menu ignoring spaces; board toolbar overflow at 280px.
- **Dev setup**: `allowedDevOrigins` so a phone on the same Wi-Fi can load the dev server.
- **Testing and docs**: Playwright suite (`npm run e2e`, 60 tests, own in-memory database and build
  folder); README rewritten for GitHub with screenshots in `docs/screenshots/`; `.gitignore`,
  ESLint and Prettier ignores for build output; `docs/DECISIONS.md` extended.

### Open items

- Phase 5 still to do: skeleton loaders, list virtualisation and pagination, screen-reader pass and
  formal accessibility audit, Lighthouse performance pass.
- The Settings dropdown keyboard test is intermittent (see above).

---

<!-- Add the next day above this line, newest first. -->
