import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary, isStaleChunkError } from "./ErrorBoundary";

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe("ErrorBoundary stale-chunk handling", () => {
  it("recognises the errors a deploy-under-an-open-tab produces", () => {
    expect(
      isStaleChunkError(new Error("Failed to fetch dynamically imported module: /assets/x.js")),
    ).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of null"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });

  it("offers a reload rather than a dead-end retry when a chunk is stale", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("Failed to fetch dynamically imported module: /assets/x.js")} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "A newer version is available" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    vi.restoreAllMocks();
  });

  it("keeps the in-place retry for ordinary errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("something unrelated broke")} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(screen.getByText("something unrelated broke")).toBeTruthy();
    vi.restoreAllMocks();
  });
});
