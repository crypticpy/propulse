import { describe, expect, it, vi, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  DEV_SESSION_IDENTITY_PATH,
  buildManualDevSessionIdentity,
  createDevSessionIdentityHandler,
  resolveIdentityAddress,
} from "./devSessionIdentity";

const tcp = (address: string, port: number): AddressInfo => ({
  address,
  port,
  family: address.includes(":") ? "IPv6" : "IPv4",
});

/** Minimal fake of the bits of the connect req/res pair the handler touches. */
function invoke(
  handler: ReturnType<typeof createDevSessionIdentityHandler>,
  url: string,
) {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  const next = vi.fn();
  handler(
    { url } as IncomingMessage,
    {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      end: (chunk?: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse,
    next,
  );
  return { headers, body, next };
}

afterEach(() => {
  delete process.env.PROPULSE_DEV_SESSION;
});

describe("resolveIdentityAddress", () => {
  it("reports the real bound port, not a hard-coded 5173", () => {
    expect(resolveIdentityAddress(tcp("127.0.0.1", 5180))).toEqual({
      host: "127.0.0.1",
      port: 5180,
    });
  });

  it("normalizes wildcard binds to a dialable 127.0.0.1", () => {
    // `0.0.0.0` accepts every IPv4 interface and node binds `::` dual-stack,
    // so 127.0.0.1 genuinely reaches both.
    for (const wildcard of ["::", "0.0.0.0"]) {
      expect(resolveIdentityAddress(tcp(wildcard, 5173))).toEqual({
        host: "127.0.0.1",
        port: 5173,
      });
    }
  });

  it("preserves an explicit ::1 bind, which 127.0.0.1 cannot reach", () => {
    expect(resolveIdentityAddress(tcp("::1", 5173))).toEqual({
      host: "::1",
      port: 5173,
    });
  });

  it("passes an explicit non-loopback bind address through unchanged", () => {
    expect(resolveIdentityAddress(tcp("192.168.1.20", 5173))).toEqual({
      host: "192.168.1.20",
      port: 5173,
    });
  });

  it("returns null when there is no TCP address to report", () => {
    expect(resolveIdentityAddress(null)).toBeNull();
    expect(resolveIdentityAddress(undefined)).toBeNull();
    expect(resolveIdentityAddress("/tmp/vite.sock")).toBeNull();
  });
});

describe("buildManualDevSessionIdentity", () => {
  it("derives port and url from the supplied address", () => {
    const identity = buildManualDevSessionIdentity({
      address: tcp("127.0.0.1", 5180),
      root: "/repo",
      profile: "manual",
      pid: 4242,
    });
    expect(identity).toEqual({
      id: null,
      owner: "manual",
      task: null,
      profile: "manual",
      root: "/repo",
      pid: 4242,
      port: 5180,
      url: "http://127.0.0.1:5180",
      startedAt: null,
    });
  });

  it("brackets an IPv6 literal in the url, per RFC 3986", () => {
    const identity = buildManualDevSessionIdentity({
      address: tcp("::1", 5180),
      root: "/repo",
      profile: "manual",
      pid: 7,
    });
    expect(identity.url).toBe("http://[::1]:5180");
    // Round-trips through WHATWG URL, which is what every consumer parses with.
    expect(new URL(identity.url).port).toBe("5180");
    expect(new URL(identity.url).hostname).toBe("[::1]");
  });

  it("falls back to 5173 only when the server reports no address", () => {
    const identity = buildManualDevSessionIdentity({
      address: null,
      root: "/repo",
      profile: "manual-preview",
      pid: 1,
    });
    expect(identity.port).toBe(5173);
    expect(identity.url).toBe("http://127.0.0.1:5173");
    expect(identity.profile).toBe("manual-preview");
  });
});

describe("createDevSessionIdentityHandler", () => {
  it("passes non-identity requests straight through", () => {
    const handler = createDevSessionIdentityHandler({
      getAddress: () => tcp("127.0.0.1", 5173),
      root: "/repo",
      profile: "manual",
    });
    const { next, body } = invoke(handler, "/index.html");
    expect(next).toHaveBeenCalledOnce();
    expect(body).toBeUndefined();
  });

  it("answers with the live address, re-read on every request", () => {
    let port = 5173;
    const handler = createDevSessionIdentityHandler({
      getAddress: () => tcp("127.0.0.1", port),
      root: "/repo",
      profile: "manual",
    });

    const first = invoke(handler, DEV_SESSION_IDENTITY_PATH);
    expect(first.next).not.toHaveBeenCalled();
    expect(first.headers["Content-Type"]).toBe("application/json");
    expect(first.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(first.body!)).toMatchObject({
      port: 5173,
      url: "http://127.0.0.1:5173",
    });

    port = 5180;
    expect(
      JSON.parse(invoke(handler, DEV_SESSION_IDENTITY_PATH).body!),
    ).toMatchObject({ port: 5180, url: "http://127.0.0.1:5180" });
  });

  it("reports the preview profile so managed-session consumers still refuse it", () => {
    const handler = createDevSessionIdentityHandler({
      getAddress: () => tcp("127.0.0.1", 4173),
      root: "/repo",
      profile: "manual-preview",
    });
    expect(
      JSON.parse(invoke(handler, DEV_SESSION_IDENTITY_PATH).body!),
    ).toMatchObject({
      profile: "manual-preview",
      port: 4173,
      url: "http://127.0.0.1:4173",
    });
  });

  it("passes a managed session record through verbatim", () => {
    const managed = JSON.stringify({
      id: "abc",
      owner: "orchestrator",
      profile: "local",
      port: 5173,
      url: "http://127.0.0.1:5173",
    });
    process.env.PROPULSE_DEV_SESSION = managed;
    const handler = createDevSessionIdentityHandler({
      getAddress: () => tcp("127.0.0.1", 5173),
      root: "/repo",
      profile: "manual",
    });
    expect(invoke(handler, DEV_SESSION_IDENTITY_PATH).body).toBe(managed);
  });
});
