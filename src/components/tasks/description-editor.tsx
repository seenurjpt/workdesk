"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { Bold, Italic, List, ListChecks, ListOrdered } from "lucide-react";
import { useEvent } from "@/hooks/use-event";
import { plainJson } from "@/lib/tiptap";
import { cn } from "@/lib/utils";
import type { MentionItem } from "@/lib/types";
import { buildExtensions, mentionClickProps } from "@/components/notes/editor-extensions";

interface Props {
  value: Record<string, unknown> | null;
  onChange: (json: Record<string, unknown>) => void;
  label: string;
  /** A [[note]] mention was chosen: link that note to this task. */
  onNotePick?: (item: MentionItem) => void;
  /** Called before navigating to a mentioned note (e.g. to close a dialog). */
  onNavigate?: () => void;
}

export function DescriptionEditor({ value, onChange, label, onNotePick, onNavigate }: Props) {
  const router = useRouter();
  const handleChange = useEvent(onChange);
  const handlePick = useEvent((item: MentionItem) => onNotePick?.(item));
  const handleOpen = useEvent((kind: "task" | "note", id: string) => {
    if (kind !== "note") return;
    onNavigate?.();
    router.push(`/notes/${id}`);
  });

  const editor = useEditor({
    extensions: buildExtensions({
      placeholder: "Add details, links, a checklist, or [[ to link a note…",
      mentions: ["note"],
      mentionHandlers: { onPick: (_kind, item) => handlePick(item) },
    }),
    content: value ?? undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" },
      ...mentionClickProps(() => handleOpen),
    },
    onUpdate: ({ editor: e }) => handleChange(plainJson(e.getJSON()) as Record<string, unknown>),
  });

  if (!editor)
    return <div className="border-border bg-surface min-h-32 rounded-2xl border" aria-hidden />;

  const tools = [
    {
      name: "Bold",
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      name: "Italic",
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      name: "Bullet list",
      icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      name: "Numbered list",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      name: "Checklist",
      icon: ListChecks,
      active: editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
  ];

  return (
    <div className="border-border bg-surface focus-within:outline-ring overflow-hidden rounded-2xl border focus-within:outline-2 focus-within:outline-offset-2">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="border-border flex flex-wrap gap-1 border-b p-1"
      >
        {tools.map(({ name, icon: Icon, active, run }) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={active}
            onClick={run}
            className={cn(
              "hover:bg-surface-soft inline-flex size-9 items-center justify-center rounded-xl",
              active && "bg-accent text-on-accent hover:bg-accent",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="px-4 py-3 text-base" />
    </div>
  );
}
