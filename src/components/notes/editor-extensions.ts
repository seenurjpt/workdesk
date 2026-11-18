import { Extension, mergeAttributes, type AnyExtension, type Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Mention, { type MentionNodeAttrs } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import { lookupAction } from "@/server/queries";
import type { MentionItem } from "@/lib/types";
import { suggestionRender, type SuggestionEntry } from "./suggestion-list";

type MentionKind = "task" | "note";

export interface MentionHandlers {
  /** Called when the user picks an item from an @task or [[note]] menu. */
  onPick?: (kind: MentionKind, item: MentionItem) => void;
  /** Called when a rendered mention is clicked. */
  onOpen?: (kind: MentionKind, id: string) => void;
}

async function lookup(kind: MentionKind, query: string): Promise<SuggestionEntry[]> {
  const res = await lookupAction(kind, query);
  return res.ok ? res.data : [];
}

function mentionExtension(kinds: MentionKind[], handlers: MentionHandlers) {
  const config = {
    task: { char: "@", title: "Link a task", emptyText: "No matching tasks" },
    note: { char: "[[", title: "Link a note", emptyText: "No matching notes" },
  } as const;

  return Mention.configure({
    deleteTriggerWithBackspace: true,
    renderText: ({ node }) =>
      node.attrs.mentionSuggestionChar === "[["
        ? `[[${node.attrs.label}]]`
        : `@${node.attrs.label}`,
    renderHTML: ({ options, node }) => {
      const isNote = node.attrs.mentionSuggestionChar === "[[";
      return [
        "span",
        mergeAttributes(options.HTMLAttributes, {
          class: isNote ? "mention mention-note" : "mention mention-task",
          tabindex: "0",
        }),
        isNote ? String(node.attrs.label) : `@${node.attrs.label}`,
      ];
    },
    suggestions: kinds.map((kind) => ({
      char: config[kind].char,
      pluginKey: new PluginKey(`mention-${kind}`),
      allowSpaces: kind === "note",
      debounce: 120,
      items: ({ query }: { query: string }) => lookup(kind, query),
      command: ({
        editor,
        range,
        props,
      }: {
        editor: Editor;
        range: { from: number; to: number };
        props: MentionNodeAttrs;
      }) => {
        if (!props.id) return;
        const label = props.label ?? "";
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "mention",
              attrs: { id: props.id, label, mentionSuggestionChar: config[kind].char },
            },
            { type: "text", text: " " },
          ])
          .run();
        handlers.onPick?.(kind, { id: props.id, label });
      },
      render: suggestionRender({ title: config[kind].title, emptyText: config[kind].emptyText }),
    })),
  });
}

interface SlashItem extends SuggestionEntry {
  run: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    label: "Text",
    hint: "Plain paragraph",
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Large",
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Medium",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "Small",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  { id: "bullet", label: "Bullet list", run: (e) => e.chain().focus().toggleBulletList().run() },
  {
    id: "numbered",
    label: "Numbered list",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "checklist",
    label: "Checklist",
    hint: "Tasks",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  { id: "quote", label: "Quote", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "code", label: "Code block", run: (e) => e.chain().focus().toggleCodeBlock().run() },
  {
    id: "table",
    label: "Table",
    hint: "3 × 3",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  { id: "divider", label: "Divider", run: (e) => e.chain().focus().setHorizontalRule().run() },
];

function matchSlash(q: string) {
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q));
}

const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SuggestionEntry, SuggestionEntry>({
        editor: this.editor,
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        allowedPrefixes: [" ", "\n"],
        // Spaces are allowed so "/heading 1" and "/code block" work. A "/" in ordinary prose
        // ("yes / no") would otherwise keep the menu open, so it closes once the text after the
        // slash contains a space and matches no block.
        allowSpaces: true,
        allow: ({ state, range }) => {
          if (state.doc.resolve(range.from).parent.type.spec.code) return false;
          const typed = state.doc.textBetween(range.from + 1, range.to, "\n").toLowerCase();
          return !typed.includes(" ") || matchSlash(typed).length > 0;
        },
        items: ({ query }) =>
          matchSlash(query.toLowerCase()).map(({ id, label, hint }) => ({ id, label, hint })),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          SLASH_ITEMS.find((i) => i.id === props.id)?.run(editor);
        },
        render: suggestionRender({ title: "Insert block", emptyText: "No matching blocks" }),
      }),
    ];
  },
});

export interface ExtensionOptions {
  placeholder: string;
  mentions: MentionKind[];
  mentionHandlers?: MentionHandlers;
  /** Slash menu, tables and typography. Off for the compact task description editor. */
  full?: boolean;
}

export function buildExtensions({
  placeholder,
  mentions,
  mentionHandlers = {},
  full = false,
}: ExtensionOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    mentionExtension(mentions, mentionHandlers),
    ...(full
      ? [TableKit.configure({ table: { resizable: false } }), Typography, SlashCommand]
      : []),
  ];
}

/** Click handling for rendered mentions (open the linked note or task). */
export function mentionClickProps(getOpen: () => MentionHandlers["onOpen"]) {
  return {
    handleDOMEvents: {
      click: (_view: unknown, event: Event) => {
        const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          '[data-type="mention"]',
        );
        const id = el?.getAttribute("data-id");
        if (!el || !id) return false;
        const kind: MentionKind =
          el.getAttribute("data-mention-suggestion-char") === "[[" ? "note" : "task";
        getOpen()?.(kind, id);
        return true;
      },
    },
  };
}
