import { describe, expect, it, vi } from "vitest";
import {
  nodeRequestToWebRequest,
  writeWebResponse,
  type NodeApiRequest,
  type NodeApiResponse,
} from "./nodePropagationHandler";

function request(overrides: Partial<NodeApiRequest> = {}): NodeApiRequest {
  return {
    method: "POST",
    url: "/api/propagation/path?source=test",
    headers: {
      host: "preview.propulse.test",
      "x-forwarded-proto": "https",
      origin: "https://preview.propulse.test",
      "content-type": "application/json",
      authorization: "Bearer test-token",
    },
    body: { hello: "world" },
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: true as const, value: undefined }),
      };
    },
    ...overrides,
  };
}

describe("nodeRequestToWebRequest", () => {
  it("preserves URL, headers, method, and parsed JSON bodies", async () => {
    const converted = await nodeRequestToWebRequest(request());

    expect(converted.url).toBe(
      "https://preview.propulse.test/api/propagation/path?source=test",
    );
    expect(converted.method).toBe("POST");
    expect(converted.headers.get("authorization")).toBe("Bearer test-token");
    await expect(converted.json()).resolves.toEqual({ hello: "world" });
  });

  it("omits bodies for GET requests", async () => {
    const converted = await nodeRequestToWebRequest(request({
      method: "GET",
      body: undefined,
    }));

    expect(converted.body).toBeNull();
  });
});

describe("writeWebResponse", () => {
  it("copies status, headers, and body to the Node response", async () => {
    const headers = new Map<string, string | readonly string[]>();
    let body = Buffer.alloc(0);
    const response: NodeApiResponse = {
      statusCode: 0,
      setHeader: vi.fn((name, value) => {
        headers.set(name.toLowerCase(), value);
      }),
      end: vi.fn((value) => {
        body = Buffer.isBuffer(value) ? value : Buffer.from(value ?? "");
      }),
    };

    await writeWebResponse(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "X-Propulse-Trace-Id": "trace-1",
        },
      }),
      response,
    );

    expect(response.statusCode).toBe(202);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-propulse-trace-id")).toBe("trace-1");
    expect(JSON.parse(body.toString("utf8"))).toEqual({ ok: true });
  });
});
