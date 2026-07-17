import {
  handlePropagationProxy,
  type PropagationProxyRoute,
} from "./propagationProxy.js";

type NodeHeader = string | readonly string[] | undefined;

export interface NodeApiRequest extends AsyncIterable<Uint8Array | string> {
  method?: string;
  url?: string;
  headers: Record<string, NodeHeader>;
  body?: unknown;
}

export interface NodeApiResponse {
  statusCode: number;
  setHeader(name: string, value: string | readonly string[]): void;
  end(body?: Uint8Array | string): void;
}

function firstHeader(value: NodeHeader): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return value[0];
}

function forwardedValue(value: NodeHeader): string | undefined {
  return firstHeader(value)?.split(",", 1)[0]?.trim();
}

function webHeaders(request: NodeApiRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      headers.set(name, value);
    } else {
      for (const item of value) headers.append(name, item);
    }
  }
  return headers;
}

async function nodeRequestBody(request: NodeApiRequest): Promise<string | undefined> {
  const method = request.method?.toUpperCase() ?? "GET";
  if (method === "GET" || method === "HEAD") return undefined;

  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") return request.body;
    if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");
    if (request.body instanceof Uint8Array) {
      return Buffer.from(request.body).toString("utf8");
    }
    return JSON.stringify(request.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
}

export async function nodeRequestToWebRequest(
  request: NodeApiRequest,
): Promise<Request> {
  const protocol = forwardedValue(request.headers["x-forwarded-proto"]) ?? "https";
  const host =
    forwardedValue(request.headers["x-forwarded-host"]) ??
    firstHeader(request.headers.host) ??
    "localhost";
  const url = new URL(request.url ?? "/", `${protocol}://${host}`);
  const body = await nodeRequestBody(request);
  return new Request(url, {
    method: request.method ?? "GET",
    headers: webHeaders(request),
    body,
  });
}

export async function writeWebResponse(
  source: Response,
  target: NodeApiResponse,
): Promise<void> {
  target.statusCode = source.status;
  source.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(Buffer.from(await source.arrayBuffer()));
}

function errorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name.slice(0, 64);
  }
  return "unknown";
}

export function nodePropagationHandler(route: PropagationProxyRoute) {
  return async function handler(
    request: NodeApiRequest,
    response: NodeApiResponse,
  ): Promise<void> {
    try {
      const webRequest = await nodeRequestToWebRequest(request);
      const webResponse = await handlePropagationProxy(webRequest, route);
      await writeWebResponse(webResponse, response);
    } catch (error) {
      console.error("Propagation Node adapter failed", {
        route,
        errorName: errorName(error),
      });
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.end(JSON.stringify({ error: "Propagation proxy failed" }));
    }
  };
}
