import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  supabaseConfigured,
  signInWithPasswordMock,
  signUpMock,
  updateUserMock,
  getSupabaseMock,
} = vi.hoisted(() => ({
  supabaseConfigured: { value: true },
  signInWithPasswordMock: vi.fn().mockResolvedValue({ error: null }),
  signUpMock: vi.fn().mockResolvedValue({ error: null }),
  updateUserMock: vi.fn().mockResolvedValue({ error: null }),
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

/**
 * The modal focuses the active view's first input 80ms after `isOpen` or
 * `displayView` changes (AuthModal.tsx, "Focus first input on open"), and
 * AccessibleDialog focuses the panel's first focusable on the open frame.
 * user-event resolves the target of every keystroke from
 * `document.activeElement`, so a test that starts typing before that timer has
 * fired loses the rest of what it types to the auto-focused field — the
 * password ends up empty or truncated, which disables the submit button and
 * sends the submit handlers down their early-return paths. The timer is
 * scheduled once per view, so waiting for the focus to land first makes every
 * later keystroke deterministic.
 */
async function waitForAutoFocus(inputId: string) {
  await waitFor(
    () => {
      expect(document.activeElement?.id).toBe(inputId);
    },
    { timeout: 2000 },
  );
}

beforeEach(() => {
  resetAuthState();
  // Reset here (not just at the end of the test that flips it) so a failed
  // assertion in that test can never leak `false` into every test after it.
  supabaseConfigured.value = true;
  signInWithPasswordMock.mockClear().mockResolvedValue({ error: null });
  signUpMock.mockClear().mockResolvedValue({ error: null });
  updateUserMock.mockClear().mockResolvedValue({ error: null });
  getSupabaseMock.mockReset().mockReturnValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      updateUser: updateUserMock,
    },
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

  it("emits no aria-describedby when there is no contextual prompt", () => {
    // `openAuthModal()` with no argument is the common path — the header's
    // Sign In button. The prompt paragraph is the only element carrying the
    // description id, so a `describedBy` that ignored the prompt would leave
    // `aria-describedby` pointing at nothing at all.
    useAuthUIStore.getState().openAuthModal();
    render(<AuthModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
  });

  it("drops aria-describedby when a prompted dialog switches off the sign-in view", async () => {
    // The prompt renders only on `signin`, so every other view is the same
    // dangling-reference hazard as the no-prompt case, reached from a state
    // where the description genuinely existed a moment earlier.
    useAuthUIStore.getState().openAuthModal("Sign in to follow operators");
    const user = userEvent.setup();
    render(<AuthModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Create Account" }),
      ).toBeTruthy();
    });
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
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
    await waitForAutoFocus("auth-email");

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

  describe("sign-up: account password policy gate", () => {
    async function openSignUpView(user: ReturnType<typeof userEvent.setup>) {
      useAuthUIStore.getState().openAuthModal();
      render(<AuthModal />);
      await user.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Create Account" }),
        ).toBeTruthy();
      });
      await waitForAutoFocus("signup-email");
    }

    it("disables Create Account for a password missing a special character, and enables it once the policy is met", async () => {
      const user = userEvent.setup();
      await openSignUpView(user);

      await user.type(screen.getByLabelText("Email address"), "op@example.com");
      await user.type(screen.getByLabelText("Password"), "password1");
      await user.type(screen.getByLabelText("Confirm password"), "password1");

      const submit = screen.getByRole("button", {
        name: "Create Account",
      }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      await user.clear(screen.getByLabelText("Password"));
      await user.type(screen.getByLabelText("Password"), "Password1!");
      await user.clear(screen.getByLabelText("Confirm password"));
      await user.type(screen.getByLabelText("Confirm password"), "Password1!");

      expect(submit.disabled).toBe(false);
    });

    it("renders the strength meter once a password is typed", async () => {
      const user = userEvent.setup();
      await openSignUpView(user);

      await user.type(screen.getByLabelText("Password"), "password1");

      await waitFor(() => {
        expect(screen.getByText("Fair")).toBeTruthy();
      });
    });

    it("rejects a too-weak password on submit even when the disabled button is bypassed, and never calls Supabase sign-up", async () => {
      // The Create Account button has no <form> to submit — Enter in the
      // password field calls handleSignUp() directly via handleKeyDown,
      // regardless of the button's disabled state. That's the bypass path.
      const user = userEvent.setup();
      await openSignUpView(user);

      await user.type(screen.getByLabelText("Email address"), "op@example.com");
      const passwordInput = screen.getByLabelText("Password");
      await user.type(passwordInput, "password1");
      await user.type(screen.getByLabelText("Confirm password"), "password1");

      fireEvent.keyDown(passwordInput, { key: "Enter" });

      expect(
        await screen.findByText(
          "Password is too weak. Add numbers and special characters.",
          {},
          { timeout: 5000 },
        ),
      ).toBeTruthy();
      expect(signUpMock).not.toHaveBeenCalled();
    });
  });

  describe("reset_password view: account password policy gate", () => {
    async function openResetView() {
      render(<AuthModal />);
      act(() => {
        useAuthStore.setState({ isRecoveryMode: true });
      });
      await waitFor(() => {
        expect(
          screen.getAllByRole("heading", { name: "Set New Password" }),
        ).toHaveLength(1);
      });
      await waitForAutoFocus("reset-password");
    }

    it("disables Update Password for a password missing a special character, and enables it once the policy is met", async () => {
      await openResetView();
      const user = userEvent.setup();

      await user.type(screen.getByLabelText("New password"), "password1");
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "password1",
      );

      const submit = screen.getByRole("button", {
        name: "Update Password",
      }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      await user.clear(screen.getByLabelText("New password"));
      await user.type(screen.getByLabelText("New password"), "Password1!");
      await user.clear(screen.getByLabelText("Confirm new password"));
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "Password1!",
      );

      expect(submit.disabled).toBe(false);
    });

    it("rejects a too-weak password on submit even when the disabled button is bypassed, and never calls Supabase updateUser", async () => {
      await openResetView();
      const user = userEvent.setup();

      const passwordInput = screen.getByLabelText("New password");
      await user.type(passwordInput, "password1");
      await user.type(
        screen.getByLabelText("Confirm new password"),
        "password1",
      );

      fireEvent.keyDown(passwordInput, { key: "Enter" });

      expect(
        await screen.findByText(
          "Password is too weak. Add numbers and special characters.",
          {},
          { timeout: 5000 },
        ),
      ).toBeTruthy();
      expect(updateUserMock).not.toHaveBeenCalled();
    });
  });
});
