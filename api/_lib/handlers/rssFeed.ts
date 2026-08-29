/**
 * Vercel Edge Function: User RSS/Atom Feed Proxy
 * Fetches a user-configured news feed (club announcements, contest
 * calendars, blogs) that browsers can't reach directly because feed
 * hosts rarely send CORS headers. The feed URL is untrusted input, so
 * this is an SSRF boundary: scheme/port/hostname classes are validated,
 * redirects are re-validated hop by hop, and the body read is capped.
 *
 * Residual risk (documented, accepted): a public DNS name that resolves
 * to a private address can't be detected portably — the edge runtime has
 * no resolver API, and on the bridge the clients are trusted shack
 * devices (see docs/guides/SELF-HOSTING.md LAN trust model).
 *
 * Response is normalized JSON (never raw XML) so no third-party markup
 * passes through: tags stripped, entities decoded, links re-validated.
 *
 * Cache: 10 minutes with 20-minute stale-while-revalidate, keyed by the
 * full request URL (per-feed at the CDN).
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 50;
const MAX_SUMMARY_CHARS = 500;

// ─── URL validation (the SSRF gate) ─────────────────────────────────────────

/** Hostname suffixes that name link-local / internal resolution zones */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
];

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isIpLiteral(host: string): boolean {
  // URL.hostname wraps IPv6 in brackets; also catch bare hex-ish forms
  if (host.startsWith("[") || host.includes(":")) return true;
  if (isIpv4Literal(host)) return true;
  // Rare but valid: decimal/octal/hex single-integer IPv4 (http://2130706433/)
  return /^(0x[0-9a-f]+|\d+)$/i.test(host);
}

export type FeedUrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Accept only plain http(s) URLs on default ports pointing at public DNS
 * names. IP literals and internal-zone names are rejected outright.
 */
export function validateFeedUrl(raw: string): FeedUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http(s) feeds are supported" };
  }
  if (url.port !== "") {
    return { ok: false, reason: "Non-default ports are not allowed" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "Credentials in the URL are not allowed" };
  }
  // Strip trailing dots first: "localhost." and "printer.local." resolve
  // like their dotless forms but would slip past every check below
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (isIpLiteral(host)) {
    return { ok: false, reason: "IP-literal hosts are not allowed" };
  }
  if (host === "localhost" || !host.includes(".")) {
    return { ok: false, reason: "Host must be a public DNS name" };
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "Internal hostnames are not allowed" };
  }
  return { ok: true, url };
}

// ─── Feed parsing (regex-based — the edge runtime has no DOMParser) ─────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (whole, entity: string) => {
      const lower = entity.toLowerCase();
      // fromCodePoint throws RangeError above 0x10FFFF — finite isn't enough
      if (lower.startsWith("#x")) {
        const code = parseInt(lower.slice(2), 16);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      if (lower.startsWith("#")) {
        const code = parseInt(lower.slice(1), 10);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[lower] ?? whole;
    },
  );
}

export function stripTags(html: string): string {
  // Decode BEFORE stripping so entity-encoded markup (&lt;script&gt;)
  // can't survive as live tags in the plain-text output
  return decodeEntities(html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:!?])/g, "$1")
    .trim();
}

/** First match of a simple <tag>…</tag> inside a block, CDATA unwrapped */
function tagText(block: string, tag: string): string | null {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "i",
  ).exec(block);
  if (!match) return null;
  const inner = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  return inner === "" ? null : inner;
}

/** Atom-style <link href="…"/> — prefers rel="alternate", else first */
function atomLinkHref(block: string): string | null {
  const links = block.match(/<link\s[^>]*\/?>(?:<\/link>)?/gi) ?? [];
  let first: string | null = null;
  for (const link of links) {
    const href = /href\s*=\s*"([^"]+)"/i.exec(link)?.[1] ?? null;
    if (!href) continue;
    if (first === null) first = href;
    if (/rel\s*=\s*"alternate"/i.test(link)) return href;
  }
  return first;
}

export interface FeedItem {
  id: string | null;
  title: string;
  link: string | null;
  publishedAt: string | null;
  summary: string;
}

export interface ParsedFeed {
  title: string;
  link: string | null;
  items: FeedItem[];
}

function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(decodeEntities(raw).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Item links pass the same gate as the feed URL itself */
function safeLink(raw: string | null): string | null {
  if (!raw) return null;
  const checked = validateFeedUrl(decodeEntities(raw).trim());
  return checked.ok ? checked.url.toString() : null;
}

/**
 * Normalize an RSS 2.0 or Atom document. Malformed entries are skipped
 * rather than failing the whole feed.
 */
export function parseFeed(xml: string): ParsedFeed {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const entryTag = isAtom ? "entry" : "item";
  const blocks =
    xml.match(
      new RegExp(`<${entryTag}[\\s>][\\s\\S]*?</${entryTag}>`, "gi"),
    ) ?? [];

  const head = xml.slice(
    0,
    blocks.length > 0 ? xml.indexOf(blocks[0]) : xml.length,
  );
  const feedTitle = stripTags(tagText(head, "title") ?? "").slice(0, 200);
  const feedLink = isAtom
    ? safeLink(atomLinkHref(head))
    : safeLink(tagText(head, "link"));

  const items: FeedItem[] = [];
  for (const block of blocks) {
    if (items.length >= MAX_ITEMS) break;
    const title = stripTags(tagText(block, "title") ?? "");
    if (title === "") continue;
    const link = isAtom
      ? safeLink(atomLinkHref(block))
      : safeLink(tagText(block, "link"));
    const summarySource = isAtom
      ? (tagText(block, "summary") ?? tagText(block, "content") ?? "")
      : (tagText(block, "description") ?? "");
    const publishedAt = isAtom
      ? toIsoDate(tagText(block, "published") ?? tagText(block, "updated"))
      : toIsoDate(tagText(block, "pubDate"));
    const id = isAtom
      ? (tagText(block, "id") ?? link)
      : (stripTags(tagText(block, "guid") ?? "") || link);
    items.push({
      id: id ? id.slice(0, 500) : null,
      title: title.slice(0, 300),
      link,
      publishedAt,
      summary: stripTags(summarySource).slice(0, MAX_SUMMARY_CHARS),
    });
  }

  return { title: feedTitle, link: feedLink, items };
}

// ─── Fetch with capped body + manually re-validated redirects ───────────────

class FeedTooLargeError extends Error {}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new FeedTooLargeError();
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new FeedTooLargeError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

async function fetchFeed(startUrl: URL): Promise<string> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/rss+xml, application/atom+xml, " +
          "application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent": "(Propulse feed reader, contact@propulse.app)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirect without Location");
      const next = validateFeedUrl(new URL(location, current).toString());
      if (!next.ok) throw new Error(`Redirect blocked: ${next.reason}`);
      current = next.url;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Upstream ${response.status}`);
    }
    return readCapped(response);
  }
  throw new Error("Too many redirects");
}

// ─── GET /api/feeds/rss?url=… ───────────────────────────────────────────────

function degradedResponse(
  corsHeaders: Record<string, string>,
  status: "unreachable" | "too_large" | "empty",
): Response {
  return new Response(
    JSON.stringify({ status, feed: null, items: [] }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=120, stale-while-revalidate=240",
      },
    },
  );
}

export async function handleFeedsRss(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "feeds/rss", 10, 60);
  if (limited) return limited;

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return new Response(
      JSON.stringify({ error: "Missing url parameter" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const checked = validateFeedUrl(raw);
  if (!checked.ok) {
    return new Response(JSON.stringify({ error: checked.reason }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const xml = await fetchFeed(checked.url);
    const feed = parseFeed(xml);
    if (feed.items.length === 0) {
      return degradedResponse(corsHeaders, "empty");
    }
    return new Response(
      JSON.stringify({
        status: "ok",
        feed: { title: feed.title, link: feed.link },
        items: feed.items,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=600, stale-while-revalidate=1200",
        },
      },
    );
  } catch (error) {
    if (error instanceof FeedTooLargeError) {
      return degradedResponse(corsHeaders, "too_large");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`RSS feed fetch failed: ${message}`);
    return degradedResponse(corsHeaders, "unreachable");
  }
}
