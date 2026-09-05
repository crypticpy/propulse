import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: vi.fn(),
}));

import { AuthGate } from "@/components/auth/AuthGate";
import { useAuthStore } from "@/stores/authStore";
import { useDisplayStore } from "@/stores/displayStore";

const user = { id: "owner" } as User;
const session = { user } as Session;

function renderGate(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthGate>
        <div>Protected application</div>
      </AuthGate>
    </MemoryRouter>,
  );
}

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
  useDisplayStore.getState().clearIdentity();
}

afterEach(resetAuthState);

describe("AuthGate", () => {
  it("allows a first-time guest onto Home while keeping private tools gated", async () => {
    resetAuthState();
    useAuthStore.setState({ initialized: true });
    const home = renderGate("/");
    expect(screen.getByText("Protected application")).toBeTruthy();
    home.unmount();
    renderGate("/log");
    expect(screen.queryByText("Protected application")).toBeNull();
  });

  it("shows the password form during an authenticated recovery session", async () => {
    useAuthStore.setState({
      user,
      session,
      initialized: true,
      isRecoveryMode: true,
    });

    renderGate();

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

    renderGate();

    expect(screen.getByText("Protected application")).toBeTruthy();
  });

  it("lets an anonymous wall device through on /display/* routes", () => {
    // Unauthenticated, auth not even initialized — the device doesn't care.
    renderGate("/display/pair");

    expect(screen.getByText("Protected application")).toBeTruthy();
  });

  it("lets a synced display device through on any route", () => {
    useDisplayStore.getState().setIdentity("display-1", "device-token");
    useDisplayStore.setState({ syncActive: true });
    useAuthStore.setState({ initialized: true });

    renderGate("/map");

    expect(screen.getByText("Protected application")).toBeTruthy();
  });

  it("ignores syncActive without a registered identity", () => {
    useDisplayStore.setState({ syncActive: true }); // no displayId/token
    useAuthStore.setState({ initialized: true });

    renderGate("/map");

    expect(screen.queryByText("Protected application")).toBeNull();
  });
});
