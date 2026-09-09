import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary, isStaleChunkError } from "./ErrorBoundary";
import * as staleChunkRecovery from "@/lib/pwa/staleChunkRecovery";

function Boom({ error }: { error: Error }): never {
  throw error;
}

describe("ErrorBoundary stale-chunk handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recognises the errors a deploy-under-an-open-tab produces", () => {
    expect(
      isStaleChunkError(new Error("Failed to fetch dynamically imported module: /assets/x.js")),
    ).toBe(true);
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
    const chunkLoadError = new Error("Loading chunk 2 failed.");
    chunkLoadError.name = "ChunkLoadError";
    expect(isStaleChunkError(chunkLoadError)).toBe(true);
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
  });

  it("does not demote a stale-chunk error whose message mentions 'database'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom
          error={new Error("Failed to fetch dynamically imported module: /assets/database-a1b2c3.js")}
        />
      </ErrorBoundary>,
    );

    // Must stay on the stale-chunk path, not fall into the generic
    // database-error branch, which would strand the user on "Try Again".
    expect(screen.getByRole("heading", { name: "A newer version is available" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("routes the reload button through the shared recovery path", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverSpy = vi
      .spyOn(staleChunkRecovery, "recoverFromStaleChunk")
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom error={new Error("Failed to fetch dynamically imported module: /assets/x.js")} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(recoverSpy).toHaveBeenCalledTimes(1);
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
  });
});
