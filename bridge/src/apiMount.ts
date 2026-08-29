/**
 * LAN mount for the portable /api/* handlers.
 *
 * The bridge build bundles api/_lib/portableRoutes.ts — the same pure
 * (Request) => Response functions Vercel serves in the cloud — into
 * dist/portableRoutes.mjs next to the compiled server. This module lazily
 * loads that bundle and adapts Node's http primitives to the Web
 * Request/Response the handlers expect.
 *
 * Cloud-bound routes (auth, sync, billing, display pairing) are absent from
 * the manifest by design; they answer 404 here.
 */

import http from "http";

type EdgeHandler = (request: Request) => Promise<Response>;
type RouteTable = Readonly<Record<string, EdgeHandler>>;

let routesPromise: Promise<RouteTable | null> | null = null;
let loadErrorLogged = false;

/** Injected by server.ts so this module stays free of logger wiring. */
export interface ApiMountLogger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function loadRoutes(logger: ApiMountLogger): Promise<RouteTable | null> {
  if (!routesPromise) {
    const bundleUrl = new URL("./portableRoutes.mjs", import.meta.url).href;
    routesPromise = import(bundleUrl).then(
      (mod: { PORTABLE_ROUTES?: RouteTable }) => {
        const routes = mod.PORTABLE_ROUTES ?? null;
        if (routes) {
          logger.info("Portable API routes mounted", {
            routeCount: Object.keys(routes).length,
          });
        }
        return routes;
      },
      (error: unknown) => {
        if (!loadErrorLogged) {
          loadErrorLogged = true;
          logger.error(
            "portableRoutes.mjs missing — /api/* disabled (run `npm run build` in bridge/)",
            { error: error instanceof Error ? error.message : String(error) },
          );
        }
        return null;
      },
    );
  }
  return routesPromise;
}

/** Mounted handlers are small-payload proxies — cap request bodies hard. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Sentinel: request body exceeded MAX_BODY_BYTES. */
class BodyTooLargeError extends Error {}

function toWebRequest(req: http.IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = `http://${host}${req.url ?? "/"}`;
  const method = req.method ?? "GET";

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      headers.set(name, value);
    } else {
      for (const item of value) headers.append(name, item);
    }
  }

  // The rate limiter derives client identity from these headers. Behind
  // Vercel's edge they are trustworthy; here the client writes them itself,
  // so pin them to the actual socket address to prevent limit evasion.
  const remote = req.socket.remoteAddress;
  if (remote) {
    headers.set("x-forwarded-for", remote);
    headers.set("x-real-ip", remote);
  } else {
    headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");
  }

  if (method === "GET" || method === "HEAD") {
    return Promise.resolve(new Request(url, { method, headers }));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size <= MAX_BODY_BYTES) {
        resolve(
          new Request(url, { method, headers, body: Buffer.concat(chunks) }),
        );
      }
    });
    req.on("error", reject);
  });
}

async function writeNodeResponse(
  res: http.ServerResponse,
  response: Response,
): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
  res.end(body);
}

function jsonError(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

/**
 * Serve a portable API route if the path matches one.
 * Returns false when the request is not an /api/* path (caller falls through
 * to static file serving); every /api/* request is answered here.
 */
export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  logger: ApiMountLogger,
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://bridge.invalid").pathname;
  if (!pathname.startsWith("/api/")) return false;

  const routes = await loadRoutes(logger);
  if (!routes) {
    jsonError(res, 503, "API routes not built — run `npm run build` in bridge/");
    return true;
  }

  const handler = routes[pathname];
  if (!handler) {
    jsonError(res, 404, "Route not available on the bridge (cloud-only or unknown)");
    return true;
  }

  try {
    const request = await toWebRequest(req);
    const response = await handler(request);
    await writeNodeResponse(res, response);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      // Answer first, then drop the still-uploading connection
      res.writeHead(413, {
        "Content-Type": "application/json; charset=utf-8",
        Connection: "close",
      });
      res.end(JSON.stringify({ error: "Request body too large" }), () =>
        req.destroy(),
      );
      return true;
    }
    logger.error("Portable API route failed", {
      pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      jsonError(res, 500, "Internal bridge API error");
    } else {
      res.end();
    }
  }
  return true;
}
