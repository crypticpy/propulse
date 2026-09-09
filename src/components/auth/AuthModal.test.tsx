import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseConfigured, signInWithPasswordMock, getSupabaseMock } =
  vi.hoisted(() => ({
    supabaseConfigured: { value: true },
    signInWithPasswordMock: vi.fn().mockResolvedValue({ error: null }),
    getSupabaseMock: vi.fn(),
  }));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return supabaseConfigured.value;
  },
  getSupabase: getSupabaseMock,
}));

import { AuthModal } from "./AuthModal";
import { useAuthStore } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";

function resetAuthState() {
  useAuthStore.setState({
    user: null,
    session: null,
    initialized: false,
    loading: false,
    error: null,
    isRecoveryMode: false,
    sessionExpired: false,
  });
  useAuthUIStore.setState({
    isOpen: false,
    prompt: null,
    pendingCallback: null,
  });
}

beforeEach(() => {
  resetAuthState();
  // Reset here (not just at the end of the test that flips it) so a failed
  // assertion in that test can never leak `false` into every test after it.
  supabaseConfigured.value = true;
  signInWithPasswordMock.mockClear().mockResolvedValue({ error: null });
  getSupabaseMock.mockReset().mockReturnValue({
    auth: { signInWithPassword: signInWithPasswordMock },
  });
});
afterEach(resetAuthState);

describe("AuthModal", () => {
  it("has exactly one accessible name, and the contextual prompt as its description, wired to its own header", () => {
    useAuthUIStore.getState().openAuthModal("Sign in to follow operators");
    render(<AuthModal />);

    const headings = screen.getAllByRole("heading", { name: "Sign In" });
    expect(headings).toHaveLength(1);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(headings[0].id);

    const description = screen.getByText("Sign in to follow operators");
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
  });

  it("is a modal dialog that closes via the shared Escape handler", async () => {
    useAuthUIStore.getState().openAuthModal();
    const user = userEvent.setup();
    render(<AuthModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await user.keyboard("{Escape}");
    expect(useAuthUIStore.getState().isOpen).toBe(false);
  });

  it("never opens when Supabase is not configured, even if the UI store says open (kept guard)", () => {
    supabaseConfigured.value = false;

    useAuthUIStore.getState().openAuthModal();
    render(<AuthModal />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("focuses the email input 80ms after opening, past both AccessibleDialog's rAF and its own setTimeout", () => {
    useAuthUIStore.getState().openAuthModal();
    vi.useFakeTimers();
    render(<AuthModal />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const input = screen.getByLabelText("Email address");
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();
  });

  it("refocuses the new view's input after switching views (kept behavior, not covered by AccessibleDialog's one-time open rAF)", () => {
    useAuthUIStore.getState().openAuthModal();
    vi.useFakeTimers();
    render(<AuthModal />);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.click(screen.getByText("Create account"));
    // Two separate advances: the first flips displayView (150ms fade delay)
    // and, on returning, lets React commit + flush the effect that schedules
    // the *new* 80ms focus timeout for the freshly-mounted signup input; the
    // second advance lets that new timeout actually fire.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    const signupEmailInput = screen.getByLabelText("Email address");
    expect(signupEmailInput.id).toBe("signup-email");
    expect(document.activeElement).toBe(signupEmailInput);
    vi.useRealTimers();
  });

  it("sign-in: submits email/password through the real auth store to Supabase (kept behavior)", async () => {
    useAuthUIStore.getState().openAuthModal();

    const user = userEvent.setup();
    render(<AuthModal />);

    await user.type(screen.getByLabelText("Email address"), "op@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "op@example.com",
        password: "hunter22",
      });
    });
  });

  it("recovery mode auto-opens the modal on the reset_password view (kept behavior)", async () => {
    render(<AuthModal />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      useAuthStore.setState({ isRecoveryMode: true });
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole("heading", { name: "Set New Password" }),
      ).toHaveLength(1);
    });
    expect(useAuthUIStore.getState().isOpen).toBe(true);
  });
});
