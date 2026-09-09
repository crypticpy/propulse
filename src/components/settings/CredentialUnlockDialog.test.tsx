import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProfileStore } from "@/stores/profileStore";
import { CredentialUnlockDialog } from "./CredentialUnlockDialog";

const { setupPassphraseMock, unlockMock, deleteAllCredentialsMock, isUnlockedMock } =
  vi.hoisted(() => ({
    setupPassphraseMock: vi.fn(),
    unlockMock: vi.fn(),
    deleteAllCredentialsMock: vi.fn(),
    isUnlockedMock: vi.fn(() => false),
  }));

vi.mock("@/lib/db/credentialStore", () => ({
  setupPassphrase: setupPassphraseMock,
  unlock: unlockMock,
  deleteAllCredentials: deleteAllCredentialsMock,
  isUnlocked: isUnlockedMock,
}));

function resetProfileState() {
  useProfileStore.setState({ credentialStoreSetup: false, lastCredentialUnlock: 0 });
}

beforeEach(() => {
  resetProfileState();
  setupPassphraseMock.mockReset().mockResolvedValue(undefined);
  unlockMock.mockReset().mockResolvedValue(true);
  deleteAllCredentialsMock.mockReset().mockResolvedValue(undefined);
  isUnlockedMock.mockReset().mockReturnValue(false);
});

afterEach(resetProfileState);

describe("CredentialUnlockDialog", () => {
  it("has exactly one accessible name and description, wired to its own header (unlock mode)", () => {
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={vi.fn()}
        onUnlocked={vi.fn()}
        mode="unlock"
        requestingService="lotw"
      />,
    );

    const headings = screen.getAllByRole("heading", {
      name: "Unlock Credential Vault",
    });
    expect(headings).toHaveLength(1);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(headings[0].id);

    const subtitle = screen.getByText(
      (_, node) =>
        node?.tagName === "P" &&
        node.textContent === "Unlock to access Logbook of The World (LoTW) credentials",
    );
    expect(dialog.getAttribute("aria-describedby")).toBe(subtitle.id);
  });

  it("is a modal dialog that closes via the shared Escape handler", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={onClose}
        onUnlocked={vi.fn()}
        mode="unlock"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the passphrase input after opening, past both AccessibleDialog's rAF and its own", () => {
    vi.useFakeTimers();
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={vi.fn()}
        onUnlocked={vi.fn()}
        mode="unlock"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    const input = screen.getByLabelText("Passphrase");
    expect(document.activeElement).toBe(input);
    vi.useRealTimers();
  });

  it("moves the shake class onto the dialog panel after a failed unlock (panelProps className, kept behavior)", async () => {
    unlockMock.mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={vi.fn()}
        onUnlocked={vi.fn()}
        mode="unlock"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("animate-shake");

    await user.type(screen.getByLabelText("Passphrase"), "wrong-pass");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(dialog.className).toContain("animate-shake");
    });
    expect(await screen.findByText("Incorrect passphrase")).toBeTruthy();
  });

  it("setup mode: submits a valid passphrase, marks the store as set up, and calls onUnlocked (kept behavior)", async () => {
    const onUnlocked = vi.fn();
    const user = userEvent.setup();
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={vi.fn()}
        onUnlocked={onUnlocked}
        mode="setup"
      />,
    );

    await user.type(
      screen.getByLabelText("Passphrase"),
      "a-Strong-Passphrase-1",
    );
    await user.type(
      screen.getByLabelText("Confirm Passphrase"),
      "a-Strong-Passphrase-1",
    );

    const submit = screen.getByRole("button", {
      name: "Create Passphrase & Encrypt",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);

    await waitFor(() => {
      expect(setupPassphraseMock).toHaveBeenCalledWith(
        "a-Strong-Passphrase-1",
      );
    });
    expect(useProfileStore.getState().credentialStoreSetup).toBe(true);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it("forgot passphrase: confirms, deletes all credentials, resets setup flag, and closes (kept behavior)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CredentialUnlockDialog
        isOpen
        onClose={onClose}
        onUnlocked={vi.fn()}
        mode="unlock"
      />,
    );

    await user.click(
      screen.getByText(
        "Forgot passphrase? You'll need to re-enter your service credentials.",
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Yes, Reset Everything" }),
    );

    await waitFor(() => {
      expect(deleteAllCredentialsMock).toHaveBeenCalledTimes(1);
    });
    expect(useProfileStore.getState().credentialStoreSetup).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
