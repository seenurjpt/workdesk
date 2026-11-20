/**
 * Understands spoken commands for the voice assistant. Rule based, no AI:
 * a handful of verbs ("open", "add a task", "search", "mark … done", …)
 * plus the user's own project and tag names.
 */

import { normalizeName } from "@/lib/voice-input";

export interface CommandVocabulary {
  projects: { id: string; name: string }[];
  tags: string[];
}

export type VoiceCommand =
  | { type: "navigate"; path: string; label: string }
  | { type: "addTask"; text: string }
  | { type: "newNote"; title: string }
  | { type: "newMeeting" }
  | { type: "search"; query: string }
  | { type: "complete"; query: string }
  | { type: "theme"; value: "light" | "dark" | "system" }
  | { type: "stopTimer" }
  | { type: "help" }
  | { type: "cancel" }
  | { type: "unknown"; heard: string };

/** Spoken page names → route. Longest phrases first so "weekly review" beats "review". */
const PAGES: { words: string[]; path: string; label: string }[] = [
  { words: ["weekly review", "week review"], path: "/review?tab=weekly", label: "Weekly review" },
  { words: ["daily review", "review"], path: "/review", label: "Daily review" },
  {
    words: ["all tasks", "all my tasks", "everything"],
    path: "/today?tab=all",
    label: "All tasks",
  },
  {
    words: ["upcoming", "upcoming tasks", "this week"],
    path: "/today?tab=upcoming",
    label: "Upcoming",
  },
  {
    words: ["overdue", "overdue tasks", "late tasks"],
    path: "/today?tab=overdue",
    label: "Overdue",
  },
  {
    words: ["today", "my day", "home", "dashboard", "tasks", "my tasks"],
    path: "/today",
    label: "Today",
  },
  { words: ["inbox"], path: "/inbox", label: "Inbox" },
  { words: ["board", "kanban", "kanban board"], path: "/board", label: "Board" },
  { words: ["calendar", "schedule", "my calendar"], path: "/calendar", label: "Calendar" },
  { words: ["notes", "my notes", "note", "notebook"], path: "/notes", label: "Notes" },
  {
    words: ["waiting on", "waiting", "waiting for", "waiting list"],
    path: "/waiting",
    label: "Waiting on",
  },
  { words: ["templates", "template"], path: "/templates", label: "Templates" },
  { words: ["trash", "bin", "recycle bin", "deleted items"], path: "/trash", label: "Trash" },
  { words: ["activity", "activity log", "logs", "history"], path: "/activity", label: "Activity" },
  {
    words: ["settings", "preferences", "account", "profile"],
    path: "/settings",
    label: "Settings",
  },
  { words: ["help", "guide", "help page"], path: "/help", label: "Help" },
  { words: ["general", "general project", "no project"], path: "/general", label: "General" },
];

const FILLER =
  /^(?:(?:hey|ok|okay|so|um+|uh+|please|can you|could you|would you|will you|i want to|i'd like to|i would like to|let's|lets|just)\s+)+/i;
const TRAILING = /\s+(?:please|for me|now|thanks|thank you)$/i;

function clean(text: string): string {
  let t = text
    .trim()
    .replace(/[.!?。]+$/, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ");
  for (let i = 0; i < 3; i++) t = t.replace(FILLER, "").replace(TRAILING, "");
  return t.trim();
}

function stripArticles(s: string): string {
  return s
    .replace(/^(?:the|my|a|an)\s+/i, "")
    .replace(/\s+(?:page|screen|tab|view|section)$/i, "")
    .trim();
}

function findPage(target: string) {
  const t = stripArticles(target).toLowerCase();
  for (const page of PAGES) {
    if (page.words.includes(t)) return page;
  }
  return undefined;
}

function findProject(target: string, vocab: CommandVocabulary) {
  const t = normalizeName(
    stripArticles(target)
      .replace(/^project\s+/i, "")
      .replace(/\s+project$/i, ""),
  );
  if (!t) return undefined;
  return vocab.projects.find((p) => normalizeName(p.name) === t);
}

function findTag(target: string, vocab: CommandVocabulary) {
  const m = stripArticles(target).match(/^(?:tag|label|hashtag)\s+(.+)$|^(.+?)\s+tag$/i);
  if (!m) return undefined;
  const key = normalizeName(m[1] ?? m[2]);
  return vocab.tags.find((t) => normalizeName(t) === key);
}

export function parseVoiceCommand(raw: string, vocab: CommandVocabulary): VoiceCommand {
  const text = clean(raw);
  if (!text) return { type: "unknown", heard: raw };
  const lower = text.toLowerCase();

  if (/^(?:cancel|stop|never ?mind|nothing|forget it|close|exit|bye)$/i.test(lower)) {
    return { type: "cancel" };
  }
  if (
    /^(?:help|what can you do|what can i say|what do you do|how do(?:es)? (?:this|you|it) work|commands)/i.test(
      lower,
    )
  ) {
    return { type: "help" };
  }

  // Theme
  const theme = lower.match(
    /^(?:(?:switch|change|turn|set|go)\s+(?:on\s+|to\s+|the\s+)?(?:theme\s+to\s+)?)?(dark|light|system)\s*(?:mode|theme)?(?:\s+on)?$/,
  );
  if (theme || /^(?:enable|turn on)\s+(dark|light)\s+mode$/.test(lower)) {
    const value = (theme?.[1] ?? lower.match(/(dark|light)/)?.[1]) as "light" | "dark" | "system";
    return { type: "theme", value };
  }
  if (/^(?:turn off|disable)\s+dark\s+mode$/.test(lower)) return { type: "theme", value: "light" };

  // Timer
  if (
    /^(?:stop|end|pause|finish)\s+(?:the\s+|my\s+)?(?:focus\s+)?(?:timer|focus|session)/.test(lower)
  ) {
    return { type: "stopTimer" };
  }

  // New note / meeting note
  if (
    /^(?:create|start|make|add|new|open|take|write)\s+(?:a\s+|new\s+)*meeting\s+notes?$/.test(lower)
  ) {
    return { type: "newMeeting" };
  }
  const note = text.match(
    /^(?:create|start|make|add|new|take|write|jot down)\s+(?:a\s+|an\s+|new\s+)*notes?(?:\s+(?:called|named|titled|about|for|on)\s+(.+))?$/i,
  );
  if (note) return { type: "newNote", title: (note[1] ?? "").trim() };

  // Add a task: "add a task call Priya…", "add task to call Priya…", "create a to-do …",
  // "remind me to …", "I need to …", "add call Priya to my tasks"
  const task =
    text.match(
      /^(?:add|create|make|new|put|set up|schedule)\s+(?:a\s+|an\s+|new\s+)*(?:task|to-?do|to do|reminder|item)s?(?:\s+(?:to|for|called|named|titled|that says|saying|:))?\s*:?\s+(.+)$/i,
    ) ??
    text.match(
      /^(?:remind me to|remember to|don't forget to|do not forget to|i need to|i have to|i must|i should|note to self)\s+(.+)$/i,
    ) ??
    text.match(
      /^(?:add|put)\s+(.+?)\s+(?:to|on|in)\s+(?:my\s+)?(?:tasks|task list|to-?do(?: list)?|list|inbox)$/i,
    );
  if (task) {
    const body = task[1].trim();
    // "remind me to X" keeps its meaning as a task title.
    return body ? { type: "addTask", text: body } : { type: "unknown", heard: raw };
  }

  // Complete a task
  const done =
    text.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/i) ??
    text.match(/^(?:complete|finish|tick off|check off|close)\s+(?:the\s+)?(?:task\s+)?(.+)$/i) ??
    text.match(/^i(?:'ve| have)?\s+(?:finished|completed|done)\s+(?:the\s+task\s+)?(.+)$/i);
  if (done) {
    const query = done[1].replace(/^(?:the\s+)?task\s+/i, "").trim();
    if (query) return { type: "complete", query };
  }

  // Search
  const search = text.match(
    /^(?:search|find|look up|look for|show me|where is|where's)\s+(?:for\s+)?(?:my\s+)?(.+)$/i,
  );

  // Navigate: "open notes", "go to the board", "show me my calendar", "take me to settings"
  const nav = text.match(
    /^(?:take me to|navigate to|switch to|bring up|jump to|show me|go to|goto|open|show|view|display|go)\s+(?:up\s+)?(.+)$/i,
  );
  const target = nav?.[1] ?? search?.[1] ?? text;
  const page = findPage(target);
  if (
    page &&
    (nav || search || PAGES.some((p) => p.words.includes(stripArticles(text).toLowerCase())))
  ) {
    return { type: "navigate", path: page.path, label: page.label };
  }
  const project = findProject(target, vocab);
  if (project && (nav || search || /project/i.test(text))) {
    return { type: "navigate", path: `/projects/${project.id}`, label: project.name };
  }
  const tag = findTag(target, vocab);
  if (tag && (nav || search)) {
    return { type: "navigate", path: `/tags/${encodeURIComponent(tag)}`, label: `#${tag}` };
  }

  if (search) return { type: "search", query: search[1].trim() };

  return { type: "unknown", heard: raw };
}

export const VOICE_EXAMPLES = [
  "Open notes",
  "Add a task call Priya tomorrow at 5 pm",
  "Remind me to send the report on Friday",
  "Mark call Priya as done",
  "Search for invoice",
  "New note called Sprint ideas",
  "Switch to dark mode",
];
