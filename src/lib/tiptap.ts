/** Minimal structural type for Tiptap/ProseMirror JSON. */
export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "codeBlock",
  "blockquote",
  "tableRow",
  "horizontalRule",
]);

export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

/** Flattens a Tiptap document to searchable text. Mentions contribute their label. */
export function extractPlainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === "text" && node.text) out.push(node.text);
    else if (node.type === "mention") out.push(String(node.attrs?.label ?? ""));
    else if (node.type === "tableCell" || node.type === "tableHeader") out.push(" ");
    node.content?.forEach(walk);
    if (node.type && BLOCKS.has(node.type)) out.push("\n");
  };
  if (doc && typeof doc === "object") walk(doc as DocNode);
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ProseMirror builds node `attrs` with a null prototype, which React's server-action
 * serializer rejects. Round-trip through JSON so the editor output is plain data.
 */
export function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
