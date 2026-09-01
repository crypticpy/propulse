import { afterEach, describe, expect, it, vi } from "vitest";
import { hasProEntitlement } from "./entitlements";

describe("hasProEntitlement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the auth bypass only during local development", async () => {
    vi.stubEnv("VERCEL_ENV", "");

    await expect(hasProEntitlement("local-dev")).resolves.toBe(true);
  });

  it("fails closed for an unauthenticated hosted deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    await expect(hasProEntitlement("local-dev")).resolves.toBeNull();
  });
});
