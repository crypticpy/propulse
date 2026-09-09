import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NCSLiveDashboard } from "./NCSLiveDashboard";
import type { Net, NetCheckin, NetSession } from "@/types/net";

// Composition guard for #817: the dashboard's window keydown handler must
// yield to ANY open modal (not just NCSKeyboardHints), so it uses the same
// `[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]`
// predicate as useFullscreenEscape.ts (#804). NCSKeyboardHints and its
// AccessibleDialog wrapper are left un-mocked so this test exercises the real
// DOM the guard queries against, not a hand-built stand-in.

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: false,
  getSupabase: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  selectIsAuthenticated: (state: { authenticated: boolean }) =>
    state.authenticated,
  useAuthStore: (selector: (state: { authenticated: boolean }) => unknown) =>
    selector({ authenticated: true }),
}));

const netFixture = vi.hoisted(() => {
  const net: Record<string, unknown> = {
    id: "net-1",
    name: "Test Net",
    type: "ragchew",
    description: "Test net for composition guard",
    frequency: "146.520",
    mode: "FM",
    band: "2m",
    tags: [],
    visibility: "public",
    newcomerFriendly: true,
    subscriberCount: 0,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const session: Record<string, unknown> = {
    id: "session-1",
    netId: "net-1",
    ncsUserId: "user-1",
    ncsCallsign: "W1AW",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "live",
    checkinCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const checkin: Record<string, unknown> = {
    id: "checkin-1",
    sessionId: "session-1",
    callsign: "K1ABC",
    checkedInAt: "2026-01-01T00:01:00.000Z",
    // "had_turn" puts the dashboard's own phase-detection effect into
    // "rounds" on mount, which is where s/space are live.
    status: "had_turn",
    isRelay: false,
    queuePosition: 0,
    createdAt: "2026-01-01T00:01:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
  };
  return {
    state: {
      currentNet: net as unknown as Net,
      currentSession: session as unknown as NetSession,
      checkins: [checkin as unknown as NetCheckin],
      managers: [],
      isLoading: false,
      isLoadingSession: false,
      fetchNet: vi.fn(),
      fetchManagers: vi.fn(),
      fetchSessions: vi.fn(),
      fetchCheckins: vi.fn(),
      startSession: vi.fn(),
      endSession: vi.fn(),
      addCheckin: vi.fn(),
      updateCheckin: vi.fn(),
      removeCheckin: vi.fn(),
      reorderQueue: vi.fn(),
      updateNet: vi.fn(),
      updateSession: vi.fn(),
      isManager: vi.fn(() => true),
    },
  };
});

vi.mock("@/stores/netStore", () => ({
  useNetStore: (selector: (state: typeof netFixture.state) => unknown) =>
    selector(netFixture.state),
}));

// Phase components not under test -- stubbed to keep the fixture small.
vi.mock("@/components/nets/SessionControls", () => ({
  SessionControls: () => <div>SessionControls</div>,
}));
vi.mock("@/components/nets/PreambleEditor", () => ({
  PreambleEditor: () => <div>PreambleEditor</div>,
}));
vi.mock("@/components/nets/NetLiveIndicator", () => ({
  NetLiveIndicator: () => <span>LIVE</span>,
}));
vi.mock("@/components/nets/TuneToNetButton", () => ({
  default: () => <button type="button">Tune</button>,
}));
vi.mock("@/components/nets/PhaseIndicator", () => ({
  PhaseIndicator: () => <div>PhaseIndicator</div>,
}));
vi.mock("@/components/nets/PreamblePhase", () => ({
  PreamblePhase: () => <div>PreamblePhase</div>,
}));
vi.mock("@/components/nets/CheckinPhase", () => ({
  CheckinPhase: () => <div>CheckinPhase</div>,
}));
vi.mock("@/components/nets/CloseoutPhase", () => ({
  CloseoutPhase: () => <div>CloseoutPhase</div>,
}));

// RoundsPhase is stubbed with the two DOM hooks the real keyboard handler
// looks up by attribute (`[data-advance-queue]`, `[data-skip-station]`), each
// wired to its own spy -- the natural probe per the issue brief.
const roundsFixture = vi.hoisted(() => ({
  advanceSpy: vi.fn(),
  skipSpy: vi.fn(),
}));
vi.mock("@/components/nets/RoundsPhase", () => ({
  RoundsPhase: () => (
    <div>
      RoundsPhase
      <button
        type="button"
        data-advance-queue
        onClick={roundsFixture.advanceSpy}
      >
        Advance
      </button>
      <button type="button" data-skip-station onClick={roundsFixture.skipSpy}>
        Skip
      </button>
    </div>
  ),
}));

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/ncs/net-1/live"]}>
      <Routes>
        <Route path="/ncs/:netId/live" element={<NCSLiveDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NCSLiveDashboard keyboard shortcuts vs. open modal (#817)", () => {
  beforeEach(() => {
    roundsFixture.advanceSpy.mockClear();
    roundsFixture.skipSpy.mockClear();
  });

  it("does not skip the current station while the keyboard-hints modal is open", async () => {
    renderDashboard();
    await screen.findByText("RoundsPhase");

    // Open the hints modal the same way an operator would.
    fireEvent.keyDown(document, { key: "?" });
    await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });

    fireEvent.keyDown(document, { key: "s" });

    expect(roundsFixture.skipSpy).not.toHaveBeenCalled();
  });

  it("does not advance the queue while the keyboard-hints modal is open", async () => {
    renderDashboard();
    await screen.findByText("RoundsPhase");

    fireEvent.keyDown(document, { key: "?" });
    await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });

    fireEvent.keyDown(document, { key: " " });

    expect(roundsFixture.advanceSpy).not.toHaveBeenCalled();
  });

  // Positive control. Without this, a guard that returned early on EVERY
  // keypress would pass both tests above. This is the test that fails if the
  // guard is ever broadened past "a modal is open".
  it("still skips the current station when no modal is open", async () => {
    renderDashboard();
    await screen.findByText("RoundsPhase");

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "s" });

    expect(roundsFixture.skipSpy).toHaveBeenCalledTimes(1);
  });

  // The dashboard used to carry its own `case "Escape"` closing the hints.
  // The modal guard made that branch unreachable, so it was deleted; this
  // proves the behaviour survives the deletion because AccessibleDialog owns
  // Escape via its document capture-phase listener.
  it("closes the hints modal on Escape with no dashboard Escape branch", async () => {
    renderDashboard();
    await screen.findByText("RoundsPhase");

    fireEvent.keyDown(document, { key: "?" });
    await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  // Codex caught this on PR #820: the dialog's own body advertises
  // "? - Toggle this overlay", and the modal guard blocks the dashboard from
  // seeing the second press. NCSKeyboardHints now owns the closing half, so
  // the advertised toggle still works end to end.
  it("closes the hints modal on a second ? press", async () => {
    renderDashboard();
    await screen.findByText("RoundsPhase");

    fireEvent.keyDown(document, { key: "?" });
    await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });

    fireEvent.keyDown(document, { key: "?" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
