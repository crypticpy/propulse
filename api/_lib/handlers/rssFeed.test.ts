import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  parseFeed,
  stripTags,
  validateFeedUrl,
} from "./rssFeed";

describe("validateFeedUrl", () => {
  it("accepts a plain https feed URL", () => {
    const result = validateFeedUrl("https://www.arrl.org/news/rss");
    expect(result.ok).toBe(true);
  });

  it("accepts http on the default port", () => {
    expect(validateFeedUrl("http://example.com/feed.xml").ok).toBe(true);
  });

  it("rejects non-http schemes", () => {
    expect(validateFeedUrl("ftp://example.com/feed").ok).toBe(false);
    expect(validateFeedUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateFeedUrl("gopher://example.com/").ok).toBe(false);
  });

  it("rejects explicit ports", () => {
    expect(validateFeedUrl("https://example.com:8443/feed").ok).toBe(false);
    expect(validateFeedUrl("http://example.com:9867/feed").ok).toBe(false);
  });

  it("rejects IP literals in every spelling", () => {
    expect(validateFeedUrl("http://192.168.1.1/feed").ok).toBe(false);
    expect(validateFeedUrl("http://10.0.0.5/feed").ok).toBe(false);
    expect(validateFeedUrl("http://[::1]/feed").ok).toBe(false);
    expect(validateFeedUrl("http://2130706433/feed").ok).toBe(false);
    expect(validateFeedUrl("http://0x7f000001/feed").ok).toBe(false);
  });

  it("rejects localhost and internal-zone names", () => {
    expect(validateFeedUrl("http://localhost/feed").ok).toBe(false);
    expect(validateFeedUrl("https://bridge.local/feed").ok).toBe(false);
    expect(validateFeedUrl("https://db.internal/feed").ok).toBe(false);
    expect(validateFeedUrl("https://nas.home.arpa/feed").ok).toBe(false);
    expect(validateFeedUrl("http://intranet/feed").ok).toBe(false);
  });

  it("rejects credentials in the URL", () => {
    expect(validateFeedUrl("https://user:pw@example.com/feed").ok).toBe(
      false,
    );
  });

  it("reports a reason on rejection", () => {
    const result = validateFeedUrl("http://127.0.0.1/feed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/IP-literal/);
  });
});

describe("decodeEntities / stripTags", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(decodeEntities("K7RA &amp; friends &#8212; &#x2600;")).toBe(
      "K7RA & friends — ☀",
    );
  });

  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&bogus;")).toBe("&bogus;");
  });

  it("strips tags and CDATA, collapsing whitespace", () => {
    expect(
      stripTags("<![CDATA[<p>Solar <b>flux</b> is\n  up</p>]]>"),
    ).toBe("Solar flux is up");
  });
});

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Club News</title>
  <link>https://example.com/news</link>
  <item>
    <title>Field Day &amp; Picnic</title>
    <link>https://example.com/news/field-day</link>
    <guid>fd-2026</guid>
    <pubDate>Fri, 28 Aug 2026 12:00:00 GMT</pubDate>
    <description><![CDATA[<p>Join us <b>Saturday</b>!</p>]]></description>
  </item>
  <item>
    <title>Evil Link</title>
    <link>http://192.168.0.10/admin</link>
    <description>link should be nulled</description>
  </item>
  <item>
    <title></title>
    <link>https://example.com/skipped</link>
  </item>
</channel></rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>DX Blog</title>
  <link rel="self" href="https://example.com/atom.xml"/>
  <link rel="alternate" href="https://example.com/blog"/>
  <entry>
    <title>3Y0K Update</title>
    <link rel="alternate" href="https://example.com/blog/3y0k"/>
    <id>urn:entry:3y0k</id>
    <published>2026-08-20T08:30:00Z</published>
    <summary>Bouvet team QRV on 20m.</summary>
  </entry>
</feed>`;

describe("parseFeed — RSS 2.0", () => {
  const feed = parseFeed(RSS_FIXTURE);

  it("extracts the channel title and link", () => {
    expect(feed.title).toBe("Club News");
    expect(feed.link).toBe("https://example.com/news");
  });

  it("normalizes items with ISO dates and stripped summaries", () => {
    expect(feed.items[0]).toEqual({
      id: "fd-2026",
      title: "Field Day & Picnic",
      link: "https://example.com/news/field-day",
      publishedAt: "2026-08-28T12:00:00.000Z",
      summary: "Join us Saturday!",
    });
  });

  it("nulls item links that fail the SSRF gate", () => {
    expect(feed.items[1].link).toBeNull();
  });

  it("skips items without a title", () => {
    expect(feed.items).toHaveLength(2);
  });
});

describe("parseFeed — Atom", () => {
  const feed = parseFeed(ATOM_FIXTURE);

  it("prefers the rel=alternate feed link", () => {
    expect(feed.title).toBe("DX Blog");
    expect(feed.link).toBe("https://example.com/blog");
  });

  it("normalizes entries", () => {
    expect(feed.items[0]).toEqual({
      id: "urn:entry:3y0k",
      title: "3Y0K Update",
      link: "https://example.com/blog/3y0k",
      publishedAt: "2026-08-20T08:30:00.000Z",
      summary: "Bouvet team QRV on 20m.",
    });
  });
});

describe("parseFeed — hostile/degenerate input", () => {
  it("returns zero items for non-feed HTML", () => {
    const feed = parseFeed("<html><body><h1>404</h1></body></html>");
    expect(feed.items).toHaveLength(0);
  });

  it("caps items at 50", () => {
    const items = Array.from(
      { length: 80 },
      (_, i) =>
        `<item><title>Post ${i}</title><link>https://example.com/${i}</link></item>`,
    ).join("");
    const feed = parseFeed(
      `<rss version="2.0"><channel><title>Big</title>${items}</channel></rss>`,
    );
    expect(feed.items).toHaveLength(50);
  });

  it("survives script tags in descriptions", () => {
    const feed = parseFeed(
      `<rss version="2.0"><channel><title>X</title><item><title>t</title>` +
        `<description>&lt;script&gt;alert(1)&lt;/script&gt;hello</description>` +
        `</item></channel></rss>`,
    );
    expect(feed.items[0].summary).not.toContain("<script>");
    expect(feed.items[0].summary).toContain("hello");
  });
});
