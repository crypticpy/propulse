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
  updateUserMock,
  getSupabaseMock,
} = vi.hoisted(() => ({
  supabaseConfigured: { value: true },
  signInWithPasswordMock: vi.fn().mockResolvedValue({ error: null }),
  updateUserMock: vi.fn().mockResolvedValue({ error: null }),
  getSupabaseMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return supabaseConfigured.value;
  },
  getSupabase: getSupabaseMock,
}));

import { LoginPage } from "./LoginPage";
import { useAuthStore } from "@/stores/authStore";

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
}

/**
 * The page focuses the active view's first input 80ms after `view` changes
 * (LoginPage.tsx, "Focus first input on view change"). user-event resolves the
 * target of every keystroke from `document.activeElement`, so a test that
 * starts typing before that timer has fired loses the rest of what it types to
 * the auto-focused field — the password ends up empty or truncated, which
 * disables the submit button and sends the submit handler down an
 * early-return path. The timer is scheduled once per view, so waiting for the
 * focus to land first makes every later keystroke deterministic.
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
  supabaseConfigured.value = true;
  signInWithPasswordMock.mockClear().mockResolvedValue({ error: null });
  updateUserMock.mockClear().mockResolvedValue({ error: null });
  getSupabaseMock.mockReset().mockReturnValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      updateUser: updateUserMock,
    },
  });
});
afterEach(resetAuthState);

describe("LoginPage", () => {
  it("renders the sign-in password input with the page's own background class (bg-void-black/50, not the modal's bg-su-line/10)", () => {
    render(<LoginPage />);
    const input = screen.getByLabelText("Password");
    expect(input.className).toContain("bg-void-black/50");
  });

  describe("reset_password view: account password policy gate", () => {
    async function openResetView() {
      render(<LoginPage />);
      act(() => {
        useAuthStore.setState({ isRecoveryMode: true });
      });
      await waitFor(() => {
        expect(screen.getByLabelText("New password")).toBeTruthy();
      });
      await waitForAutoFocus("reset-new-password");
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
      // No <form> exists to submit — Enter in the password field calls
      // handleUpdatePassword() directly via handleKeyDown, regardless of the
      // button's disabled state. That's the bypass path.
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
          { timeout: 2000 },
        ),
      ).toBeTruthy();
      expect(updateUserMock).not.toHaveBeenCalled();
    });
  });
});
