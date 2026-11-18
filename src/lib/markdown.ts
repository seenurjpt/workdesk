/** Converts a Tiptap/ProseMirror document to Markdown (used for note export). */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
}

const cellText = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

function applyMarks(text: string, marks: Mark[] = []): string {
  let out = text;
  const has = (t: string) => marks.find((m) => m.type === t);
  if (has("code")) out = `\`${out}\``;
  if (has("bold")) out = `**${out}**`;
  if (has("italic")) out = `*${out}*`;
  if (has("strike")) out = `~~${out}~~`;
  const link = has("link");
  const href = typeof link?.attrs?.href === "string" ? link.attrs.href : null;
  if (href) out = `[${out}](${href})`;
  return out;
}

function inline(nodes: Node[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks);
      if (n.type === "hardBreak") return "  \n";
      if (n.type === "mention") {
        const label = String(n.attrs?.label ?? "");
        return n.attrs?.mentionSuggestionChar === "[[" ? `[[${label}]]` : `@${label}`;
      }
      return inline(n.content);
    })
    .join("");
}

function indentLines(lines: string[], prefix: string, firstPrefix = prefix): string[] {
  return lines.map((l, i) => (l === "" ? "" : `${i === 0 ? firstPrefix : prefix}${l}`));
}

function listItem(item: Node, marker: string): string[] {
  const parts: string[][] = (item.content ?? []).map((c) => blockLines(c));
  const flat = parts.flatMap((p, i) => (i === 0 ? p : p));
  const lines = flat.filter((l, i) => !(l === "" && i === flat.length - 1));
  if (lines.length === 0) return [marker.trimEnd()];
  const pad = " ".repeat(marker.length);
  return lines.map((l, i) => (i === 0 ? `${marker}${l}` : l === "" ? "" : `${pad}${l}`));
}

function blockLines(node: Node): string[] {
  switch (node.type) {
    case "paragraph":
      return [inline(node.content)];
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return [`${"#".repeat(level)} ${inline(node.content)}`];
    }
    case "bulletList":
      return (node.content ?? []).flatMap((i) => listItem(i, "- "));
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? []).flatMap((item, i) => listItem(item, `${start + i}. `));
    }
    case "taskList":
      return (node.content ?? []).flatMap((item) =>
        listItem(item, item.attrs?.checked ? "- [x] " : "- [ ] "),
      );
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const body = (node.content ?? []).map((c) => c.text ?? "").join("");
      return ["```" + lang, ...body.split("\n"), "```"];
    }
    case "blockquote":
      return indentLines(blocks(node.content), "> ");
    case "horizontalRule":
      return ["---"];
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) =>
          cellText(inline((cell.content ?? []).flatMap((p) => p.content ?? []))),
        ),
      );
      if (rows.length === 0) return [];
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
      return [
        line(rows[0]),
        `| ${Array(width).fill("---").join(" | ")} |`,
        ...rows.slice(1).map(line),
      ];
    }
    default:
      return node.content ? blocks(node.content) : [];
  }
}

function blocks(nodes: Node[] = []): string[] {
  const out: string[] = [];
  nodes.forEach((n, i) => {
    const lines = blockLines(n);
    if (lines.length === 0) return;
    // tight spacing between consecutive list items is handled inside lists; blocks get a blank line
    if (i > 0 && out.length > 0) out.push("");
    out.push(...lines);
  });
  return out;
}

export function docToMarkdown(doc: unknown, title?: string): string {
  const root = doc && typeof doc === "object" ? (doc as Node) : {};
  const body = blocks(root.content).join("\n").trim();
  const head = title?.trim() ? `# ${title.trim()}\n\n` : "";
  return `${head}${body}${body ? "\n" : ""}`;
}

export function slugify(value: string, fallback = "note"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}
