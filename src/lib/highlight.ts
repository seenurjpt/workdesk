import type { SnippetPart } from "@/lib/types";

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits a query into unique, lower-cased search tokens. */
export function tokenize(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 6);
}

function tokenRegex(tokens: string[]): RegExp | null {
  if (!tokens.length) return null;
  return new RegExp(
    `(${[...tokens]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join("|")})`,
    "gi",
  );
}

/** Marks every token occurrence. Returned as parts so UIs never need raw HTML. */
export function highlight(text: string, tokens: string[]): SnippetPart[] {
  const re = tokenRegex(tokens);
  if (!re || !text) return [{ text, hit: false }];
  const parts: SnippetPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

/** A short excerpt around the first match, with matches marked. */
export function makeSnippet(
  text: string,
  tokens: string[],
  before = 50,
  after = 110,
): SnippetPart[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const re = tokenRegex(tokens);
  const first = re ? flat.search(re) : -1;
  const start = first > before ? first - before : 0;
  const end = Math.min(flat.length, (first === -1 ? 0 : start) + before + after);
  const slice = flat.slice(start, end);
  const parts = highlight(slice, tokens);
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < flat.length) parts.push({ text: "…", hit: false });
  return parts;
}

/** Higher is better. Title matches dominate body matches. */
export function scoreMatch(title: string, body: string, tokens: string[]): number {
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  const phrase = tokens.join(" ");
  let score = 0;
  if (t === phrase) score += 100;
  else if (t.startsWith(phrase)) score += 80;
  else if (t.includes(phrase)) score += 60;
  for (const token of tokens) {
    if (t.includes(token)) score += 10;
    if (t.split(/\W+/).some((w) => w.startsWith(token))) score += 5;
    if (b.includes(token)) score += 3;
  }
  return score;
}
