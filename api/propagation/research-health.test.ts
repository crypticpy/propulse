import { afterEach, describe, expect, it } from "vitest";
import handler from "./research-health";

const ORIGINAL_VIEW_FLAG = process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
const ORIGINAL_INGEST_SECRET = process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;

afterEach(() => {
  if (ORIGINAL_VIEW_FLAG === undefined) {
    delete process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
  } else {
    process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED = ORIGINAL_VIEW_FLAG;
  }
  if (ORIGINAL_INGEST_SECRET === undefined) {
    delete process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
  } else {
    process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET = ORIGINAL_INGEST_SECRET;
  }
});

describe("research health endpoint gates", () => {
  it("keeps the coarse view unavailable until the server gate is enabled", async () => {
    delete process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health"),
    );
    expect(response.status).toBe(404);
  });

  it("rejects unsigned ingest when server configuration is absent", async () => {
    delete process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(response.status).toBe(503);
  });

  it("answers preflight without a response body", async () => {
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health", {
        method: "OPTIONS",
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
