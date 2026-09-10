// ─── Dev session identity endpoint ────────────────────────────────────────
// Builds the `/__propulse_dev_session` response served by the Vite plugin in
// vite.config.ts (both `configureServer` and `configurePreviewServer`).
//
// Extracted out of vite.config.ts so the payload can be unit-tested against a
// fake address without loading the whole Vite config (which pulls in the PWA
// plugin and every edge handler). Nothing in the app bundle imports this
// module — it is dev/preview tooling only.
//
// The bound host/port are read from the live http server at REQUEST time via
// `getAddress`, not captured once at plugin-setup time: by the time any
// request reaches the handler the server is guaranteed to be listening, so
// this always reports what Vite actually bound — including when
// DEV_SERVER_ALLOW_EXTRA moved the shared server to another port, or `--host`
// changed the bind address — rather than a hard-coded 5173/127.0.0.1 that
// could silently disagree with reality (scripts/check-appearance-effects.mjs
// compares `identity.url` against the origin it was given, so a lying URL
// rejects a perfectly good server).

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const DEV_SESSION_IDENTITY_PATH = "/__propulse_dev_session";

// Fallback only for the (unreachable in practice) case where the http server
// reports no address: a request cannot arrive before `listen` resolves.
export const DEV_SESSION_FALLBACK_HOST = "127.0.0.1";
export const DEV_SESSION_FALLBACK_PORT = 5173;

// Wildcard binds are not dialable as-is, so they are reported as 127.0.0.1:
// `0.0.0.0` accepts every IPv4 interface including loopback, and node binds
// `::` dual-stack by default, so 127.0.0.1 reaches both.
//
// `::1` is deliberately NOT in this set. A socket bound explicitly to the IPv6
// loopback refuses connections to 127.0.0.1 — rewriting it would advertise an
// unreachable URL. It is reported as-is (and bracketed in the url), which is
// truthful: consumers that require a literal 127.0.0.1 origin then refuse it,
// which is the correct outcome for a server they genuinely cannot reach.
const WILDCARD_BIND = new Set(["::", "0.0.0.0"]);

// RFC 3986 requires an IPv6 literal to be bracketed in a URL authority.
function formatIdentityOrigin(host: string, port: number): string {
  return host.includes(":")
    ? `http://[${host}]:${port}`
    : `http://${host}:${port}`;
}

/**
 * `profile` is deliberately never "local"/"connected" here: those are reserved
 * for a managed `dev:session` server, and consumers that require a managed
 * session must keep refusing a plain `npm run dev` / `npm run preview`.
 */
export type ManualDevSessionProfile = "manual" | "manual-preview";

export interface ManualDevSessionIdentity {
  id: null;
  owner: "manual";
  task: null;
  profile: ManualDevSessionProfile;
  root: string;
  pid: number;
  port: number;
  url: string;
  startedAt: null;
}

/**
 * Normalizes a node `server.address()` result into a dialable host/port, or
 * null when the server is not listening on a TCP socket (a unix socket
 * returns a plain string, which has no port to report).
 */
export function resolveIdentityAddress(
  address: AddressInfo | string | null | undefined,
): { host: string; port: number } | null {
  if (!address || typeof address !== "object") return null;
  const host = WILDCARD_BIND.has(address.address)
    ? DEV_SESSION_FALLBACK_HOST
    : address.address;
  return { host, port: address.port };
}

/** Builds the manual (unmanaged) identity payload for a resolved address. */
export function buildManualDevSessionIdentity(options: {
  address: AddressInfo | string | null | undefined;
  root: string;
  profile: ManualDevSessionProfile;
  pid: number;
}): ManualDevSessionIdentity {
  const resolved = resolveIdentityAddress(options.address) ?? {
    host: DEV_SESSION_FALLBACK_HOST,
    port: DEV_SESSION_FALLBACK_PORT,
  };
  return {
    id: null,
    owner: "manual",
    task: null,
    profile: options.profile,
    root: options.root,
    pid: options.pid,
    port: resolved.port,
    url: formatIdentityOrigin(resolved.host, resolved.port),
    startedAt: null,
  };
}

/**
 * Connect middleware answering the identity path. A managed session's own
 * record (set in PROPULSE_DEV_SESSION by scripts/dev-session.mjs before it
 * imports vite) is passed through verbatim; anything else gets the manual
 * payload built from the live address.
 */
export function createDevSessionIdentityHandler(options: {
  getAddress: () => AddressInfo | string | null | undefined;
  root: string;
  profile: ManualDevSessionProfile;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void {
  return (req, res, next) => {
    if (req.url !== DEV_SESSION_IDENTITY_PATH) return next();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const managed = process.env.PROPULSE_DEV_SESSION;
    if (managed) {
      res.end(managed);
      return;
    }
    res.end(
      JSON.stringify(
        buildManualDevSessionIdentity({
          address: options.getAddress(),
          root: options.root,
          profile: options.profile,
          pid: process.pid,
        }),
      ),
    );
  };
}
