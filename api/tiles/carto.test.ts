// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./carto";
import { checkRateLimit } from "../_lib/rateLimit";

vi.mock("../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ success: true, remaining: 599, reset: 60 })),
  getClientIP: () => "test-client",
}));
const fetchMock = vi.fn<typeof fetch>();
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const query = "style=dark_all&z=2&x=1&y=1";
const request = (params = query, method = "GET") =>
  new Request(`https://app.example/api/tiles/carto?${params}`, { method });

beforeEach(() => {
  vi.stubEnv("CARTO_BASEMAPS_API_KEY", "test-only-secret&part");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(checkRateLimit).mockReturnValue({
    success: true,
    remaining: 599,
    reset: 60,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("public CARTO tile proxy", () => {
  it.each(["dark_all", "dark_only_labels", "light_only_labels"])(
    "preserves %s retina PNGs without leaking upstream secrets or headers",
    async (style) => {
      fetchMock.mockResolvedValue(
        new Response(png, {
          headers: {
            "Content-Type": "image/png",
            "Set-Cookie": "secret",
            Location: "https://secret.example",
          },
        }),
      );
      const result = await handler(request(query.replace("dark_all", style)));
      expect(result.status).toBe(200);
      expect(new Uint8Array(await result.arrayBuffer())).toEqual(png);
      const [url, options] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        `https://basemaps.cartocdn.com/${style}/2/1/1@2x.png?key=test-only-secret%26part`,
      );
      expect(options).toMatchObject({
        redirect: "error",
        headers: { Accept: "image/png" },
      });
      expect(result.headers.get("Content-Type")).toBe("image/png");
      expect(result.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, s-maxage=86400",
      );
      expect(result.headers.has("Set-Cookie")).toBe(false);
      expect(result.headers.has("Location")).toBe(false);
      expect(JSON.stringify([...result.headers])).not.toContain("secret");
    },
  );

  it.each([
    "style=../dark_all&z=2&x=1&y=1",
    "style=https://evil.test&z=2&x=1&y=1",
    "style=voyager&z=2&x=1&y=1",
    "style=dark_all&z=2&x=1",
    `${query}&url=https://evil.test`,
    `${query}&key=injected`,
    `${query}&style=dark_all`,
    "style=dark_all&z=2abc&x=1&y=1",
    "style=dark_all&z=21&x=1&y=1",
    "style=dark_all&z=2&x=4&y=1",
    "style=dark_all&z=2&x=1&y=4",
    "style=dark_all&z=2&x=-1&y=1",
    "style=dark_all&z=2&x=1.5&y=1",
    "style=dark_all&z=2&x=1e0&y=1",
    "style=dark_all&z=02&x=1&y=1",
    "style=dark_all&z=2&x=1&y=1&z=2",
  ])(
    "rejects malformed, duplicate or arbitrary upstream inputs: %s",
    async (params) => {
      const result = await handler(request(params));
      expect(result.status).toBe(400);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    "style=dark_all&z=0&x=0&y=0",
    "style=dark_all&z=20&x=1048575&y=1048575",
  ])("accepts coordinate boundaries %s", async (params) => {
    fetchMock.mockResolvedValue(
      new Response(png, {
        headers: { "Content-Type": "image/png; charset=binary" },
      }),
    );
    expect((await handler(request(params))).status).toBe(200);
  });

  it("fails closed without a server key or with an unsupported method", async () => {
    vi.stubEnv("CARTO_BASEMAPS_API_KEY", "");
    expect((await handler(request())).status).toBe(503);
    const method = await handler(request(query, "POST"));
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache throttling responses", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      success: false,
      remaining: 0,
      reset: 42,
    });
    const result = await handler(request());
    expect(result.status).toBe(429);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Retry-After")).toBe("42");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([301, 302, 403, 404, 429, 500, 206])(
    "never returns or caches upstream status %s or its credential-bearing body",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response("test-only-secret", {
          status,
          headers: {
            "Content-Type": "image/png",
            Location: "https://evil.test",
          },
        }),
      );
      const result = await handler(request());
      expect(result.status).toBe(502);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(await result.text()).not.toContain("test-only-secret");
    },
  );

  it.each(["text/html", "application/json", "image/svg+xml", ""])(
    "rejects non-PNG content type %s",
    async (contentType) => {
      fetchMock.mockResolvedValue(
        new Response(png, { headers: { "Content-Type": contentType } }),
      );
      expect((await handler(request())).status).toBe(502);
    },
  );

  it("rejects empty/fake PNG content and both declared and undeclared oversized bodies", async () => {
    for (const response of [
      new Response("not png", { headers: { "Content-Type": "image/png" } }),
      new Response(png, {
        headers: { "Content-Type": "image/png", "Content-Length": "2097153" },
      }),
      new Response(new Uint8Array(2097153), {
        headers: { "Content-Type": "image/png" },
      }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      const result = await handler(request());
      expect(result.status).toBe(502);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("does not log or reveal a credential-bearing fetch exception", async () => {
    const log = vi.spyOn(console, "error");
    fetchMock.mockRejectedValue(
      new Error("https://provider.test?key=test-only-secret"),
    );
    const result = await handler(request());
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("secret");
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(["headers", "body"])(
    "aborts a stalled upstream %s and never caches the timeout",
    async (phase) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation((_url, options) => {
        const signal = options!.signal!;
        if (phase === "headers")
          return new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          );
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                signal.addEventListener("abort", () =>
                  controller.error(new Error("aborted")),
                );
              },
            }),
            { headers: { "Content-Type": "image/png" } },
          ),
        );
      });
      const pending = handler(request());
      await vi.advanceTimersByTimeAsync(8000);
      const result = await pending;
      expect(result.status).toBe(504);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    },
  );
});
