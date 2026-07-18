import { render, screen } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: vi.fn(),
}));

import { AuthGate } from "@/components/auth/AuthGate";
import { useAuthStore } from "@/stores/authStore";

const user = { id: "owner" } as User;
const session = { user } as Session;

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

afterEach(resetAuthState);

describe("AuthGate", () => {
  it("shows the password form during an authenticated recovery session", async () => {
    useAuthStore.setState({
      user,
      session,
      initialized: true,
      isRecoveryMode: true,
    });

    render(
      <AuthGate>
        <div>Protected application</div>
      </AuthGate>,
    );

    expect(await screen.findByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(screen.queryByText("Protected application")).toBeNull();
  });

  it("renders the application for a normal authenticated session", () => {
    useAuthStore.setState({
      user,
      session,
      initialized: true,
      isRecoveryMode: false,
    });

    render(
      <AuthGate>
        <div>Protected application</div>
      </AuthGate>,
    );

    expect(screen.getByText("Protected application")).toBeTruthy();
  });
});
