export type LinkKind = "link" | "jira" | "confluence";

const MAX_URL = 2000;

/** http(s) only, no embedded credentials. */
export function parseHttpUrl(raw: string): URL | null {
  if (raw.length > MAX_URL) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const JIRA_KEY = /\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/;

/** Recognises Jira and Confluence links without any network access. */
export function classifyUrl(url: URL): { kind: LinkKind; title: string | null } {
  const host = url.hostname.toLowerCase();
  const path = decodeURIComponent(url.pathname);
  const atlassian = host.endsWith(".atlassian.net");

  const isConfluence =
    host.includes("confluence") ||
    (atlassian && path.startsWith("/wiki")) ||
    /^\/(wiki|display)\//.test(path);
  if (isConfluence) {
    const page =
      path.match(/\/pages\/\d+\/([^/]+)/)?.[1] ?? path.match(/\/display\/[^/]+\/([^/]+)/)?.[1];
    return {
      kind: "confluence",
      title: page ? page.replace(/\+/g, " ").replace(/_/g, " ") : "Confluence page",
    };
  }

  const isJira = host.includes("jira") || atlassian;
  if (isJira) {
    const key =
      path.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)?.[1] ??
      url.searchParams.get("selectedIssue") ??
      path.match(JIRA_KEY)?.[0] ??
      null;
    return { kind: "jira", title: key ?? "Jira issue" };
  }
  return { kind: "link", title: null };
}

/** A readable fallback title: `example.com / page-name`. */
export function titleFromUrl(url: URL): string {
  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  const pretty = last
    .replace(/[-_+]+/g, " ")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .trim();
  const host = url.hostname.replace(/^www\./, "");
  return pretty ? `${host} / ${pretty}`.slice(0, 200) : host;
}

/** Pulls Jira/Confluence links out of free text (e.g. quick-add); other URLs stay in the text. */
export function extractAtlassianLinks(text: string): { text: string; urls: URL[] } {
  const urls: URL[] = [];
  const rest = text.replace(/https?:\/\/[^\s]+/g, (match) => {
    const url = parseHttpUrl(match);
    if (url && classifyUrl(url).kind !== "link") {
      urls.push(url);
      return " ";
    }
    return match;
  });
  return { text: rest.replace(/\s+/g, " ").trim(), urls };
}

/** Reads the <title> of an HTML document (first 100 KB is enough). */
export function extractTitle(html: string): string | null {
  const m = html.slice(0, 100_000).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const decoded = m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return decoded ? decoded.slice(0, 200) : null;
}
