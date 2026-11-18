import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { isPrivateAddress } from "@/lib/ip-guard";
import { docToMarkdown, slugify } from "@/lib/markdown";
import {
  classifyUrl,
  extractAtlassianLinks,
  extractTitle,
  parseHttpUrl,
  titleFromUrl,
} from "@/lib/url-links";

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: "text",
  text,
  marks,
});
const p = (...c: unknown[]) => ({ type: "paragraph", content: c });

describe("docToMarkdown", () => {
  it("renders headings, paragraphs and marks", () => {
    const md = docToMarkdown(
      {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [t("Goals")] },
          p(
            t("Ship "),
            t("fast", [{ type: "bold" }]),
            t(" and "),
            t("safe", [{ type: "italic" }]),
            t(" see "),
            t("docs", [{ type: "link", attrs: { href: "https://x.dev" } }]),
          ),
        ],
      },
      "Plan",
    );
    expect(md).toBe("# Plan\n\n## Goals\n\nShip **fast** and *safe* see [docs](https://x.dev)\n");
  });
  it("renders lists, nested lists and checklists", () => {
    const md = docToMarkdown({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                p(t("a")),
                { type: "bulletList", content: [{ type: "listItem", content: [p(t("a1"))] }] },
              ],
            },
            { type: "listItem", content: [p(t("b"))] },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            { type: "listItem", content: [p(t("x"))] },
            { type: "listItem", content: [p(t("y"))] },
          ],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p(t("done"))] },
            { type: "taskItem", attrs: { checked: false }, content: [p(t("todo"))] },
          ],
        },
      ],
    });
    expect(md).toBe("- a\n  - a1\n- b\n\n3. x\n4. y\n\n- [x] done\n- [ ] todo\n");
  });
  it("renders code, quotes, rules, tables and mentions", () => {
    const md = docToMarkdown({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [t("const a = 1;\nconst b = 2;")],
        },
        { type: "blockquote", content: [p(t("wise"))] },
        { type: "horizontalRule" },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [p(t("Owner"))] },
                { type: "tableHeader", content: [p(t("Due | when"))] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [p(t("Ana"))] },
                { type: "tableCell", content: [p(t("Fri"))] },
              ],
            },
          ],
        },
        p(
          { type: "mention", attrs: { label: "Ship it", mentionSuggestionChar: "@" } },
          t(" and "),
          { type: "mention", attrs: { label: "Retro", mentionSuggestionChar: "[[" } },
        ),
      ],
    });
    expect(md).toContain("```ts\nconst a = 1;\nconst b = 2;\n```");
    expect(md).toContain("> wise");
    expect(md).toContain("---");
    expect(md).toContain("| Owner | Due \\| when |\n| --- | --- |\n| Ana | Fri |");
    expect(md).toContain("@Ship it and [[Retro]]");
  });
  it("handles empty and junk input", () => {
    expect(docToMarkdown(null)).toBe("");
    expect(docToMarkdown({ type: "doc", content: [] }, "Only title")).toBe("# Only title\n\n");
    expect(docToMarkdown("nope")).toBe("");
  });
  it("slugifies filenames", () => {
    expect(slugify("Q4 Planning: Goals & Risks!")).toBe("q4-planning-goals-risks");
    expect(slugify("")).toBe("note");
    expect(slugify("日本語のノート")).toBe("日本語のノート");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-11-17T00:00:00Z"))).toBe("2026-11-17T00:00:00.000Z");
  });
  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tx", '=HYPERLINK("http://evil")']) {
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell("-")).toBe("'-");
    expect(csvCell(-5)).toBe("'-5");
  });
  it("builds rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

describe("link detection", () => {
  const u = (s: string) => parseHttpUrl(s)!;
  it("accepts only plain http(s) URLs", () => {
    expect(parseHttpUrl("https://example.com/a?b=1")).not.toBeNull();
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("file:///etc/passwd")).toBeNull();
    expect(parseHttpUrl("https://user:pw@example.com")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
    expect(parseHttpUrl("https://example.com/" + "a".repeat(2100))).toBeNull();
  });
  it("recognises Jira links", () => {
    expect(classifyUrl(u("https://acme.atlassian.net/browse/PROJ-123"))).toEqual({
      kind: "jira",
      title: "PROJ-123",
    });
    expect(classifyUrl(u("https://jira.acme.com/browse/ABC-9?focusedId=1"))).toEqual({
      kind: "jira",
      title: "ABC-9",
    });
    expect(
      classifyUrl(
        u("https://acme.atlassian.net/jira/software/projects/X/boards/1?selectedIssue=X-42"),
      ).title,
    ).toBe("X-42");
  });
  it("recognises Confluence links", () => {
    expect(
      classifyUrl(u("https://acme.atlassian.net/wiki/spaces/ENG/pages/12345/Release+Plan+Q4")),
    ).toEqual({ kind: "confluence", title: "Release Plan Q4" });
    expect(classifyUrl(u("https://confluence.acme.com/display/ENG/Onboarding_Guide")).title).toBe(
      "Onboarding Guide",
    );
    expect(classifyUrl(u("https://acme.atlassian.net/wiki/home")).kind).toBe("confluence");
  });
  it("leaves ordinary links alone", () => {
    expect(classifyUrl(u("https://example.com/blog/post")).kind).toBe("link");
    expect(titleFromUrl(u("https://www.example.com/blog/my-first_post.html"))).toBe(
      "example.com / my first post",
    );
    expect(titleFromUrl(u("https://example.com/"))).toBe("example.com");
  });
  it("extracts Atlassian links from text but keeps other URLs", () => {
    const r = extractAtlassianLinks(
      "Fix https://acme.atlassian.net/browse/ENG-7 and read https://example.com/x",
    );
    expect(r.urls.map((x) => x.href)).toEqual(["https://acme.atlassian.net/browse/ENG-7"]);
    expect(r.text).toBe("Fix and read https://example.com/x");
  });
});

describe("SSRF guard", () => {
  it("blocks private, loopback, link-local and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.1.1.1",
      "ff02::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "172.15.0.1",
      "172.32.0.1",
      "93.184.216.34",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
  it("refuses anything that is not an IP", () => {
    expect(isPrivateAddress("localhost")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("extractTitle", () => {
  it("reads and cleans the title", () => {
    expect(extractTitle("<html><head><title> Hello &amp; welcome \n </title></head>")).toBe(
      "Hello & welcome",
    );
    expect(extractTitle("<TITLE lang='en'>Caps</TITLE>")).toBe("Caps");
    expect(extractTitle("<html></html>")).toBeNull();
    expect(extractTitle("<title>   </title>")).toBeNull();
  });
});
