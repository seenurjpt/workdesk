"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "./editor-extensions";

/** Read-only rendering of a Tiptap document (version previews). */
export function NotePreview({ content }: { content: Record<string, unknown> }) {
  const editor = useEditor({
    extensions: buildExtensions({ placeholder: "", mentions: [], full: true }),
    content,
    editable: false,
    immediatelyRender: false,
  });
  return <EditorContent editor={editor} className="text-base" />;
}
