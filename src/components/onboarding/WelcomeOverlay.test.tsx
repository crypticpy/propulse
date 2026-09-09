import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/stores/authStore";
import { useKioskStore } from "@/stores/kioskStore";
import { WelcomeOverlay } from "./WelcomeOverlay";

const user = { id: "returning-operator" } as User;
const session = { user } as Session;
const renderWelcome = () =>
  render(
    <MemoryRouter initialEntries={["/map"]}>
      <WelcomeOverlay />
    </MemoryRouter>,
  );
const welcome = () =>
  screen.queryByRole("dialog", { name: "Welcome to Propulse" });

beforeEach(() => {
  localStorage.removeItem("propulse-welcome-seen");
  useAuthStore.setState({ initialized: true, user: null, session: null });
  useKioskStore.setState({ active: false });
});

describe("Welcome overlay", () => {
  it("waits for restored authentication and stays hidden for signed-in users", () => {
    useAuthStore.setState({ initialized: false });
    renderWelcome();
    expect(welcome()).toBeNull();
    act(() => useAuthStore.setState({ initialized: true, user, session }));
    expect(welcome()).toBeNull();
    expect(localStorage.getItem("propulse-welcome-seen")).toBe("true");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("shows for a guest and remembers dismissal", () => {
    const first = renderWelcome();
    expect(welcome()).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Close welcome overlay" }),
    );
    expect(localStorage.getItem("propulse-welcome-seen")).toBe("true");
    first.unmount();
    renderWelcome();
    expect(welcome()).toBeNull();
  });

  it("is a modal dialog that AccessibleDialog closes on Escape, persisting dismissal (#773)", () => {
    renderWelcome();
    const panel = welcome();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(welcome()).toBeNull();
    // The overlay's own Escape branch was removed in the AccessibleDialog
    // migration (#773); this only passes if AccessibleDialog's own Escape
    // handler is now calling `dismiss` (which persists to localStorage).
    expect(localStorage.getItem("propulse-welcome-seen")).toBe("true");
  });

  it("still navigates slides with ArrowRight, unaffected by the migration", async () => {
    renderWelcome();
    expect(screen.getByText("See What's Inside")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByText("Your Radio Command Center")).toBeTruthy(),
    );
  });
});
