/**
 * The contract between Gemini and the voice assistant: the JSON shape Gemini must answer with,
 * and the step that turns that answer into a `VoiceCommand`. Pure and shared, so it can be unit
 * tested without a key. The model's output is untrusted: every page, project and tag it names is
 * checked against the real lists, and anything else becomes "unknown".
 */

import { z } from "zod";
import { PAGES, type CommandVocabulary, type VoiceCommand } from "@/lib/voice-commands";

export const AI_ACTIONS = [
  "navigate",
  "add_task",
  "new_note",
  "new_meeting",
  "search",
  "complete_task",
  "theme",
  "stop_timer",
  "help",
  "cancel",
  "reply",
  "unknown",
] as const;

export const aiResultSchema = z.object({
  transcript: z.string().max(2000).default(""),
  action: z.enum(AI_ACTIONS).default("unknown"),
  target: z.string().max(300).optional(),
  task_text: z.string().max(500).optional(),
  title: z.string().max(200).optional(),
  query: z.string().max(200).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  reply: z.string().max(400).optional(),
});
export type AiResult = z.infer<typeof aiResultSchema>;

/** JSON Schema sent to Gemini as `responseJsonSchema`. Keep in step with `aiResultSchema`. */
export const AI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string", description: "Exactly what the user said, verbatim." },
    action: { type: "string", enum: [...AI_ACTIONS] },
    target: {
      type: "string",
      description: "navigate only: a page path, 'project:<id>' or 'tag:<name>' from the lists.",
    },
    task_text: { type: "string", description: "add_task only: the task in quick-add syntax." },
    title: { type: "string", description: "new_note only: the note title, or empty." },
    query: {
      type: "string",
      description: "search / complete_task only: the words to look for.",
    },
    theme: { type: "string", enum: ["light", "dark", "system"] },
    reply: {
      type: "string",
      description: "reply only: a short, friendly spoken answer (one or two sentences).",
    },
  },
  required: ["transcript", "action"],
} as const;

/** JSON Schema for transcription only (quick add, search box). */
export const TRANSCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: { transcript: { type: "string" } },
  required: ["transcript"],
} as const;

const PAGE_PATHS = new Set(PAGES.map((p) => p.path));

function navigateTo(target: string | undefined, vocab: CommandVocabulary): VoiceCommand | null {
  const t = target?.trim();
  if (!t) return null;
  if (PAGE_PATHS.has(t)) {
    const page = PAGES.find((p) => p.path === t)!;
    return { type: "navigate", path: page.path, label: page.label };
  }
  const project = t.match(/^project:(.+)$/i);
  if (project) {
    const hit = vocab.projects.find((p) => p.id === project[1].trim());
    return hit ? { type: "navigate", path: `/projects/${hit.id}`, label: hit.name } : null;
  }
  const tag = t.match(/^tag:#?(.+)$/i);
  if (tag) {
    const name = tag[1].trim().toLowerCase();
    const hit = vocab.tags.find((x) => x.toLowerCase() === name);
    return hit
      ? { type: "navigate", path: `/tags/${encodeURIComponent(hit)}`, label: `#${hit}` }
      : null;
  }
  return null;
}

export function toVoiceCommand(result: AiResult, vocab: CommandVocabulary): VoiceCommand {
  const unknown: VoiceCommand = { type: "unknown", heard: result.transcript };
  const text = (s: string | undefined) => s?.trim() ?? "";
  switch (result.action) {
    case "navigate":
      return navigateTo(result.target, vocab) ?? unknown;
    case "add_task": {
      const body = text(result.task_text);
      return body ? { type: "addTask", text: body, formatted: true } : unknown;
    }
    case "new_note":
      return { type: "newNote", title: text(result.title) };
    case "new_meeting":
      return { type: "newMeeting" };
    case "search": {
      const query = text(result.query);
      return query ? { type: "search", query } : unknown;
    }
    case "complete_task": {
      const query = text(result.query);
      return query ? { type: "complete", query } : unknown;
    }
    case "theme":
      return result.theme ? { type: "theme", value: result.theme } : unknown;
    case "stop_timer":
      return { type: "stopTimer" };
    case "help":
      return { type: "help" };
    case "cancel":
      return { type: "cancel" };
    case "reply": {
      const reply = text(result.reply);
      return reply ? { type: "reply", text: reply } : unknown;
    }
    default:
      return unknown;
  }
}
