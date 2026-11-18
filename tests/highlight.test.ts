import { describe, expect, it } from "vitest";
import { highlight, makeSnippet, scoreMatch, tokenize } from "@/lib/highlight";
import { extractPlainText, plainJson } from "@/lib/tiptap";

describe("highlight", () => {
  it("marks all occurrences, case-insensitively", () => {
    expect(highlight("Report on the report", ["report"])).toEqual([
      { text: "Report", hit: true },
      { text: " on the ", hit: false },
      { text: "report", hit: true },
    ]);
  });
  it("treats regex characters literally", () => {
    expect(highlight("a.b (c)", ["."])).toEqual([
      { text: "a", hit: false },
      { text: ".", hit: true },
      { text: "b (c)", hit: false },
    ]);
  });
  it("returns plain text when there are no tokens", () => {
    expect(highlight("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
  it("builds a windowed snippet with ellipses", () => {
    const text = `${"lorem ".repeat(40)}needle${" ipsum".repeat(40)}`;
    const parts = makeSnippet(text, ["needle"]);
    expect(parts[0].text).toBe("…");
    expect(parts.at(-1)?.text).toBe("…");
    expect(parts.find((p) => p.hit)?.text).toBe("needle");
    expect(parts.map((p) => p.text).join("").length).toBeLessThan(220);
  });
  it("tokenizes uniquely and caps the count", () => {
    expect(tokenize("Foo foo  BAR")).toEqual(["foo", "bar"]);
    expect(tokenize("a b c d e f g h")).toHaveLength(6);
  });
});

describe("scoreMatch", () => {
  it("ranks exact > prefix > contains > body-only", () => {
    const q = ["plan"];
    const exact = scoreMatch("Plan", "", q);
    const prefix = scoreMatch("Planning week", "", q);
    const contains = scoreMatch("Team plan", "", q);
    const body = scoreMatch("Other", "we plan", q);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(body);
  });
});

describe("extractPlainText", () => {
  it("flattens blocks, tables and mentions", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Ask " },
            { type: "mention", attrs: { id: "1", label: "Rahul" } },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Do it" }] }],
            },
          ],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe("Title\nAsk Rahul\nDo it");
  });
  it("handles junk input", () => {
    expect(extractPlainText(null)).toBe("");
    expect(extractPlainText("nope")).toBe("");
    expect(extractPlainText({})).toBe("");
  });
});

describe("plainJson", () => {
  it("turns null-prototype attrs (ProseMirror) into plain objects", () => {
    const attrs = Object.create(null) as Record<string, unknown>;
    attrs.level = 2;
    const out = plainJson({ type: "heading", attrs });
    expect(Object.getPrototypeOf(out.attrs)).toBe(Object.prototype);
    expect(out.attrs).toEqual({ level: 2 });
  });
});
