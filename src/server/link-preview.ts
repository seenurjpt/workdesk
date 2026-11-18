import dns from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as guardedFetch } from "undici";
import { isPrivateAddress } from "@/lib/ip-guard";
import { extractTitle, parseHttpUrl } from "@/lib/url-links";

const MAX_BYTES = 100_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 4000;

type LookupCallback = (
  err: Error | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * Link titles are fetched by the server, so the target must never be an internal address.
 * The check runs inside the socket's own DNS lookup, so a hostname cannot resolve to a safe
 * address for the check and a private one for the connection (DNS rebinding).
 */
const agent = new Agent({
  connect: {
    lookup: (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "");
        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
          return callback(new Error("Blocked address"), "");
        }
        if (options.all) return callback(null, list);
        return callback(null, list[0].address, list[0].family);
      });
    },
  },
});

/** Returns the page's <title>, or null if it can't be fetched safely. Never throws. */
export async function fetchPageTitle(start: URL): Promise<string | null> {
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // IP-literal hosts skip DNS, so the lookup guard below never sees them: check them here.
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(host) && isPrivateAddress(host)) return null;
      const res = await guardedFetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/html", "User-Agent": "WorkDeskLinkPreview/1.0" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        const next = location ? parseHttpUrl(new URL(location, url).toString()) : null;
        await res.body?.cancel().catch(() => {});
        if (!next) return null;
        url = next;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html") || !res.body) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
      }
      await reader.cancel().catch(() => {});
      return extractTitle(Buffer.concat(chunks).toString("utf8"));
    }
    return null;
  } catch {
    return null;
  }
}
