export interface ShortcutGroup {
  group: string;
  items: { keys: string[]; label: string }[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    group: "Create",
    items: [
      { keys: ["Q"], label: "Quick add a task" },
      { keys: ["N"], label: "New note" },
    ],
  },
  {
    group: "Go to",
    items: [
      { keys: ["G", "T"], label: "Today" },
      { keys: ["G", "A"], label: "All tasks" },
      { keys: ["G", "I"], label: "Inbox" },
      { keys: ["G", "U"], label: "Upcoming" },
      { keys: ["G", "O"], label: "Overdue" },
      { keys: ["G", "N"], label: "Notes" },
      { keys: ["G", "B"], label: "Board" },
      { keys: ["G", "C"], label: "Calendar" },
      { keys: ["G", "W"], label: "Waiting on" },
      { keys: ["G", "R"], label: "Review" },
    ],
  },
  {
    group: "Search and commands",
    items: [
      { keys: ["Ctrl", "K"], label: "Open the command palette (⌘K on Mac)" },
      { keys: ["/"], label: "Search tasks and notes" },
    ],
  },
  {
    group: "On a task (focus its row with Tab first)",
    items: [
      { keys: ["E"], label: "Edit" },
      { keys: ["Space"], label: "Complete / reopen" },
      { keys: ["1", "–", "4"], label: "Set priority P1 to P4" },
    ],
  },
  { group: "Help", items: [{ keys: ["?"], label: "Show this list" }] },
];

export const GO_TARGETS: Record<string, string> = {
  t: "/today",
  a: "/today?tab=all",
  i: "/inbox",
  u: "/today?tab=upcoming",
  o: "/today?tab=overdue",
  n: "/notes",
  b: "/board",
  c: "/calendar",
  w: "/waiting",
  r: "/review",
};

export const SEQUENCE_WINDOW_MS = 1200;

export interface SequenceState {
  /** When `g` was pressed, or null. */
  pendingSince: number | null;
}

export interface SequenceResult {
  state: SequenceState;
  /** Where to navigate, when a `g` + key sequence completed. */
  navigate?: string;
  /** True when the key press was part of a sequence and should not do anything else. */
  consumed: boolean;
}

/** `g` then a letter, within a short window, jumps to a page. Pure so it can be tested. */
export function stepSequence(state: SequenceState, key: string, now: number): SequenceResult {
  const lower = key.toLowerCase();
  const waiting = state.pendingSince !== null && now - state.pendingSince <= SEQUENCE_WINDOW_MS;
  if (waiting) {
    const target = GO_TARGETS[lower];
    if (target) return { state: { pendingSince: null }, navigate: target, consumed: true };
    // any other key cancels the sequence; `g` again restarts it
    if (lower === "g") return { state: { pendingSince: now }, consumed: true };
    return { state: { pendingSince: null }, consumed: false };
  }
  if (lower === "g") return { state: { pendingSince: now }, consumed: true };
  return { state: { pendingSince: null }, consumed: false };
}
