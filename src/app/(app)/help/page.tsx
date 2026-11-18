import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { SHORTCUTS } from "@/lib/shortcuts";

export const metadata: Metadata = { title: "Help and guide" };

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="text-caption border-border bg-surface-soft rounded-md border px-1.5 py-0.5 font-semibold">
      {children}
    </kbd>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-surface-soft rounded-md px-1.5 py-0.5 text-[0.9em] font-semibold">
      {children}
    </code>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-border scroll-mt-20 border-t pt-6">
      <h2 id={id} className="font-heading mb-3 text-2xl font-bold">
        {title}
      </h2>
      <div className="text-body-sm space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

const SYNTAX: { token: string; meaning: string; example: string }[] = [
  {
    token: "tomorrow, friday, 25 dec, in 2 hours",
    meaning: "Due date",
    example: "Call Sam friday",
  },
  {
    token: "5pm, 17:30",
    meaning: "Due time (no time means all day)",
    example: "Standup tomorrow 9:30am",
  },
  {
    token: "#project",
    meaning:
      "Put the task in a project. Case, spaces and punctuation are ignored (#clientA finds “Client A”); no match creates a new project",
    example: "Quote #clientA",
  },
  { token: "@tag", meaning: "Add a tag (use as many as you like)", example: "Draft @docs @q4" },
  {
    token: "!p1 … !p4, !urgent !high !medium !low",
    meaning: "Priority",
    example: "Fix login !urgent",
  },
  {
    token: "every day / weekday / week / month / monday",
    meaning: "Repeat",
    example: "Water plants every week",
  },
  {
    token: 'wait:Priya, wait:"Priya Shah"',
    meaning: "Waiting on someone",
    example: "Contract wait:Priya",
  },
  {
    token: "remind:15m, remind:2h, remind:1d",
    meaning: "Reminder before the due time",
    example: "Demo 3pm remind:30m",
  },
  {
    token: "a Jira or Confluence link",
    meaning: "Recognised and attached as a link",
    example: "Review https://…atlassian.net/browse/ABC-12",
  },
];

export default function HelpPage() {
  return (
    <PageContainer className="max-w-[860px]">
      <PageHeader
        title="Help and guide"
        subtitle="Shortcuts, quick-add commands and the small tricks that save clicks."
      />

      <nav aria-label="On this page" className="mb-8 flex flex-wrap gap-2">
        {[
          ["add", "Adding things"],
          ["quick-add", "Quick-add commands"],
          ["keys", "Keyboard shortcuts"],
          ["tasks", "Working with tasks"],
          ["notes", "Notes"],
          ["reminders", "Reminders"],
          ["more", "More tools"],
          ["offline", "Offline and your data"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="text-nav border-border hover:border-muted-strong hover:bg-surface-soft min-h-9 rounded-full border px-4 py-1.5 transition-colors duration-150"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        <Section id="add" title="Adding things">
          <p>The top bar box is only one way in. Every way to add a task:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Press <Kbd>Q</Kbd> anywhere, or use the top bar box, or the Add button on phones.
            </li>
            <li>
              Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> (<Kbd>⌘</Kbd> <Kbd>K</Kbd> on Mac) and choose “New
              task”.
            </li>
            <li>Use the “Add task” button at the bottom of any task list.</li>
            <li>
              Calendar: click an empty part of a day, or the + that appears on hover. The date is
              filled in for you.
            </li>
            <li>Board: use the “Add task” button in a column.</li>
          </ul>
          <p>Notes:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Press <Kbd>N</Kbd> anywhere, or open Notes and use “New note” or “New meeting note”.
            </li>
            <li>Command palette: “New note” or “New meeting note”.</li>
            <li>Templates page: start a note or checklist from a reusable template.</li>
          </ul>
        </Section>

        <Section id="quick-add" title="Quick-add commands">
          <p>
            Type a sentence and WorkDesk picks the details out of it. A live preview shows what it
            understood before you press Enter. Everything is optional and the order does not matter.
          </p>
          <p>
            Example: <Code>Send report tomorrow 5pm #clientA @report !high every monday</Code>
          </p>
          <div className="border-border overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[560px] text-left">
              <caption className="sr-only">Quick-add syntax</caption>
              <thead className="bg-surface-soft text-caption text-muted-strong">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    What it does
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Example
                  </th>
                </tr>
              </thead>
              <tbody>
                {SYNTAX.map((row) => (
                  <tr key={row.token} className="border-border border-t align-top">
                    <td className="px-3 py-2">
                      <Code>{row.token}</Code>
                    </td>
                    <td className="px-3 py-2">{row.meaning}</td>
                    <td className="text-muted-strong px-3 py-2">{row.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Tip: if a word like “friday” should stay in the title, edit the task afterwards. The
            preview shows the title it will save.
          </p>
        </Section>

        <Section id="keys" title="Keyboard shortcuts">
          <p>
            Shortcuts work when you are not typing in a box. Press <Kbd>?</Kbd> at any time to see
            this list in a popup.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {SHORTCUTS.map((group) => (
              <div key={group.group}>
                <h3 className="text-caption text-muted-strong mb-2 font-semibold">{group.group}</h3>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-4">
                      <span>{item.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {item.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && group.group === "Go to" && (
                              <span className="text-caption text-muted-strong">then</span>
                            )}
                            <Kbd>{k}</Kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="tasks" title="Working with tasks">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Tabs:</strong> All, Today, Upcoming and Overdue are tabs of one page. All
              groups every open task by when it is due. Today also shows what slipped and a few
              suggestions.
            </li>
            <li>
              <strong>General tasks:</strong> a task does not need a project. Tasks without one live
              in General.
            </li>
            <li>
              <strong>Complete and undo:</strong> tick the circle or press <Kbd>Space</Kbd> on a
              focused row. A toast lets you undo it, and deleting works the same way.
            </li>
            <li>
              <strong>Recurring:</strong> completing a repeating task creates the next one.
              Reopening it removes that copy.
            </li>
            <li>
              <strong>Reschedule by dragging:</strong> drag a task to another day on the Calendar.
              It keeps its time of day.
            </li>
            <li>
              <strong>Board:</strong> drag cards between columns, or use the ⋮ menu on a card. With
              the keyboard, press <Kbd>Space</Kbd> to lift a card and the arrow keys to move it.
            </li>
            <li>
              <strong>Waiting on:</strong> mark a task as waiting on a person with a follow-up date,
              then push it out a day or three from the Waiting on page.
            </li>
            <li>
              <strong>Timer:</strong> start a stopwatch or a Pomodoro from the ⋮ menu or the clock
              on a task. Time adds up per task and project and shows in the weekly review.
            </li>
            <li>
              <strong>Subtasks and links:</strong> add subtasks in the editor, and paste a link to
              attach it. Jira and Confluence links are recognised.
            </li>
          </ul>
        </Section>

        <Section id="notes" title="Notes">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Type <Code>/</Code> on an empty line for the block menu: headings, lists, checklist,
              quote, code, table and divider.
            </li>
            <li>
              Type <Code>@</Code> to link a task and <Code>[[</Code> to link a note. Links show on
              both sides, in “Linked tasks” and “Linked notes”.
            </li>
            <li>
              Notes save themselves. “Saved” appears when it is done, and “Save version now” keeps a
              snapshot you can restore later from the history.
            </li>
            <li>
              <strong>Meeting notes:</strong> select action-item lines (or put the cursor on one)
              and press “Convert to task”. Each becomes a task linked back to the note.
            </li>
            <li>
              Export a note as Markdown or print it to PDF from its menu. Pin a note to keep it at
              the top of the list.
            </li>
          </ul>
        </Section>

        <Section id="reminders" title="Reminders">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Add reminders in the task editor, or type <Code>remind:15m</Code> when adding a task.
            </li>
            <li>
              <strong>They only fire while WorkDesk is open</strong> in a browser tab or an
              installed app window. There is no email or push. Anything missed while closed is
              summarised the next time you open the app and stays in the bell.
            </li>
            <li>
              Turn on browser notifications from the bell or in Settings, and use “Send a test” to
              check. Snooze for 10 minutes, 1 hour or until tomorrow.
            </li>
            <li>Settings also has the sound, quiet hours and a morning summary.</li>
          </ul>
        </Section>

        <Section id="more" title="More tools">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Command palette</strong> (<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>): go anywhere, create
              things, switch theme, export, and search tasks and notes. Pick a task to change its
              status or priority, move it to tomorrow, start a timer or delete it.
            </li>
            <li>
              <strong>Daily and weekly review:</strong> carry over, reschedule or drop slipped
              tasks, and copy a weekly report as Markdown for standups.
            </li>
            <li>
              <strong>Templates:</strong> save a note or a task&apos;s subtasks as a template, or
              write your own checklist.
            </li>
            <li>
              <strong>Trash:</strong> deleted tasks and notes stay for 30 days. Restore them or
              delete forever.
            </li>
          </ul>
        </Section>

        <Section id="offline" title="Offline and your data">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Install WorkDesk from Settings or your browser&apos;s install button. Pages you have
              already opened can be read offline.
            </li>
            <li>
              Offline, you can add a task or complete one and it syncs when you reconnect. Other
              changes need a connection. Notes keep a local draft and retry.
            </li>
            <li>Signing out removes the saved pages and any unsent changes from the device.</li>
            <li>
              Settings → Your data exports everything as JSON, tasks as CSV, and each note as
              Markdown.
            </li>
          </ul>
        </Section>
      </div>
    </PageContainer>
  );
}
