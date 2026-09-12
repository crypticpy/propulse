import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  supabaseConfigured,
  signInWithPasswordMock,
  signUpMock,
  resetPasswordForEmailMock,
  updateUserMock,
  getSupabaseMock,
} = vi.hoisted(() => ({
  supabaseConfigured: { value: true },
  signInWithPasswordMock: vi.fn().mockResolvedValue({ error: null }),
  signUpMock: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmailMock: vi.fn().mockResolvedValue({ error: null }),
  updateUserMock: vi.fn().mockResolvedValue({ error: null }),
  getSupabaseMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  get isSupabaseConfigured() {
    return supabaseConfigured.value;
  },
  getSupabase: getSupabaseMock,
}));

import { useAuthForm } from "./useAuthForm";
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

beforeEach(() => {
  resetAuthState();
  supabaseConfigured.value = true;
  signInWithPasswordMock.mockClear().mockResolvedValue({ error: null });
  signUpMock.mockClear().mockResolvedValue({ error: null });
  resetPasswordForEmailMock.mockClear().mockResolvedValue({ error: null });
  updateUserMock.mockClear().mockResolvedValue({ error: null });
  getSupabaseMock.mockReset().mockReturnValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      resetPasswordForEmail: resetPasswordForEmailMock,
      updateUser: updateUserMock,
    },
  });
});
afterEach(resetAuthState);

describe("useAuthForm", () => {
  it("sign-in calls signInWithPassword with the trimmed email and password, in that order", async () => {
    const { result } = renderHook(() => useAuthForm());

    act(() => {
      result.current.setEmail("  op@example.com  ");
      result.current.setPassword("hunter22");
    });

    await act(async () => {
      await result.current.handleSignIn();
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "op@example.com",
      password: "hunter22",
    });
  });

  it("forgot-password records where the link was sent, fires the success callback once, and leaves password fields untouched", async () => {
    const onForgotPasswordSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAuthForm({ onForgotPasswordSuccess }),
    );

    act(() => {
      result.current.setEmail("op@example.com");
      result.current.setPassword("should-not-move");
    });

    await act(async () => {
      await result.current.handleForgotPassword();
    });

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "op@example.com",
      expect.objectContaining({ redirectTo: expect.any(String) }),
    );
    expect(result.current.sentTo).toBe("op@example.com");
    expect(onForgotPasswordSuccess).toHaveBeenCalledTimes(1);
    // Neither field the handler doesn't own moves on success.
    expect(result.current.email).toBe("op@example.com");
    expect(result.current.password).toBe("should-not-move");
  });

  it("sign-up calls signUp with the trimmed email and password, records where the account was created, fires the success callback once, and leaves confirmError untouched", async () => {
    const onSignUpSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ onSignUpSuccess }));

    act(() => {
      result.current.setEmail("  op@example.com  ");
      result.current.setPassword("Password1!");
      result.current.setConfirmPassword("Password1!");
    });

    await act(async () => {
      await result.current.handleSignUp();
    });

    expect(signUpMock).toHaveBeenCalledWith({
      email: "op@example.com",
      password: "Password1!",
    });
    expect(result.current.sentTo).toBe("op@example.com");
    expect(onSignUpSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.confirmError).toBe("");
  });

  it("sign-up does not fire the success callback when Supabase sign-up returns an error", async () => {
    signUpMock.mockResolvedValueOnce({
      error: { message: "Email already registered" },
    });
    const onSignUpSuccess = vi.fn();
    const { result } = renderHook(() => useAuthForm({ onSignUpSuccess }));

    act(() => {
      result.current.setEmail("op@example.com");
      result.current.setPassword("Password1!");
      result.current.setConfirmPassword("Password1!");
    });

    await act(async () => {
      await result.current.handleSignUp();
    });

    await waitFor(() => {
      expect(useAuthStore.getState().error).toBe("Email already registered");
    });
    expect(onSignUpSuccess).not.toHaveBeenCalled();
  });

  describe("update-password: account password policy gate", () => {
    it("a mismatched confirm sets the confirm error and never calls updatePassword", async () => {
      const { result } = renderHook(() => useAuthForm());

      act(() => {
        result.current.setPassword("Password1!");
        result.current.setConfirmPassword("Password2!");
      });

      await act(async () => {
        await result.current.handleUpdatePassword();
      });

      expect(result.current.confirmError).toBe("Passwords do not match.");
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    it("a policy-failing password (password1) sets the policy error and never calls updatePassword", async () => {
      const { result } = renderHook(() => useAuthForm());

      act(() => {
        result.current.setPassword("password1");
        result.current.setConfirmPassword("password1");
      });

      await act(async () => {
        await result.current.handleUpdatePassword();
      });

      expect(result.current.confirmError).toBe(
        "Password is too weak. Add numbers and special characters.",
      );
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    it("a matching, policy-passing password (Password1!) calls updatePassword exactly once", async () => {
      const onUpdatePasswordSuccess = vi.fn();
      const { result } = renderHook(() =>
        useAuthForm({ onUpdatePasswordSuccess }),
      );

      act(() => {
        result.current.setPassword("Password1!");
        result.current.setConfirmPassword("Password1!");
      });

      await act(async () => {
        await result.current.handleUpdatePassword();
      });

      expect(updateUserMock).toHaveBeenCalledTimes(1);
      expect(updateUserMock).toHaveBeenCalledWith({ password: "Password1!" });
      await waitFor(() => {
        expect(onUpdatePasswordSuccess).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("confirm-blur mismatch rule", () => {
    it("sets the mismatch error when confirm is non-empty and differs from password", () => {
      const { result } = renderHook(() => useAuthForm());

      act(() => {
        result.current.setPassword("Password1!");
        result.current.setConfirmPassword("Password2!");
      });
      act(() => {
        result.current.handleConfirmBlur();
      });

      expect(result.current.confirmError).toBe("Passwords do not match.");
    });

    it("clears the mismatch error once confirm matches password", () => {
      const { result } = renderHook(() => useAuthForm());

      act(() => {
        result.current.setPassword("Password1!");
        result.current.setConfirmPassword("Password2!");
      });
      act(() => {
        result.current.handleConfirmBlur();
      });
      expect(result.current.confirmError).toBe("Passwords do not match.");

      act(() => {
        result.current.setConfirmPassword("Password1!");
      });
      act(() => {
        result.current.handleConfirmBlur();
      });

      expect(result.current.confirmError).toBe("");
    });

    it("leaves the error clear when confirm is empty (no premature mismatch on an untouched field)", () => {
      const { result } = renderHook(() => useAuthForm());

      act(() => {
        result.current.setPassword("Password1!");
      });
      act(() => {
        result.current.handleConfirmBlur();
      });

      expect(result.current.confirmError).toBe("");
    });
  });
});
