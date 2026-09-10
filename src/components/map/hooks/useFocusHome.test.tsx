import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MapSurfaceContext } from "../MapSurfaceContext";
import { useFocusHome } from "./useFocusHome";

function Overlay({ open }: { open: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusHome(open, rootRef);
  if (!open) return null;
  return (
    <div ref={rootRef} data-testid="overlay">
      <button type="button">inside</button>
    </div>
  );
}

function Host({
  startOpen = false,
  strict = false,
}: {
  startOpen?: boolean;
  strict?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [triggerMounted, setTriggerMounted] = useState(true);
  const tree = (
    <MapSurfaceContext.Provider
      value={() => document.getElementById("map-surface")?.focus()}
    >
      <button type="button" id="map-surface" tabIndex={-1}>
        surface
      </button>
      {triggerMounted ? (
        <button type="button" data-testid="trigger">
          trigger
        </button>
      ) : null}
      <Overlay open={open} />
      <button type="button" data-testid="other">
        other
      </button>
      <span data-testid="open" onClick={() => setOpen(true)}>
        open
      </span>
      <span data-testid="close" onClick={() => setOpen(false)}>
        close
      </span>
      <span
        data-testid="unmount-trigger"
        onClick={() => setTriggerMounted(false)}
      >
        unmount trigger
      </span>
    </MapSurfaceContext.Provider>
  );
  return strict ? <StrictMode>{tree}</StrictMode> : tree;
}

function enterOverlay() {
  screen.getByRole("button", { name: "inside" }).focus();
}

/**
 * jsdom does not always move focus to `<body>` when the focused overlay
 * unmounts. Real browsers do, and the hook's cleanup is written for that
 * (see #824). Stand in for it the same way `MapSurface.focusHome.test.tsx`
 * uses an explicit `.blur()` for pointer-only close.
 */
function dropFocusToBody() {
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.focus();
}

describe("useFocusHome (#848)", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not capture document.body as the restore target", async () => {
    render(<Host />);
    document.body.focus();
    fireEvent.click(screen.getByTestId("open"));
    enterOverlay();
    dropFocusToBody();
    fireEvent.click(screen.getByTestId("close"));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("map-surface"),
      ),
    );
  });

  it("restores focus to a still-connected opener", async () => {
    render(<Host />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(screen.getByTestId("open"));
    enterOverlay();
    dropFocusToBody();
    fireEvent.click(screen.getByTestId("close"));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("does not steal focus from a live control that still owns it", async () => {
    render(<Host />);
    screen.getByTestId("trigger").focus();
    fireEvent.click(screen.getByTestId("open"));
    enterOverlay();
    const other = screen.getByTestId("other");
    other.focus();
    fireEvent.click(screen.getByTestId("close"));
    expect(document.activeElement).toBe(other);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(document.activeElement).toBe(other);
  });

  it("defers fallback to the map surface when the opener is gone", async () => {
    render(<Host />);
    screen.getByTestId("trigger").focus();
    fireEvent.click(screen.getByTestId("open"));
    enterOverlay();
    fireEvent.click(screen.getByTestId("unmount-trigger"));
    dropFocusToBody();
    const surface = document.getElementById("map-surface");
    fireEvent.click(screen.getByTestId("close"));
    expect(document.activeElement).not.toBe(surface);
    await waitFor(() => expect(document.activeElement).toBe(surface));
  });

  it("does not fall back when focus never entered the overlay", async () => {
    render(<Host />);
    document.body.focus();
    fireEvent.click(screen.getByTestId("open"));
    fireEvent.click(screen.getByTestId("close"));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(document.activeElement).not.toBe(
      document.getElementById("map-surface"),
    );
  });

  it("cancels a pending fallback when setup runs again under StrictMode", async () => {
    render(<Host startOpen strict />);
    document.body.focus();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(document.activeElement).not.toBe(
      document.getElementById("map-surface"),
    );
  });
});
