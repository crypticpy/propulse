import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StationProvider } from "@/components/station-ui/StationProvider";
import { copyToClipboard, type ShareState } from "@/lib/utils/shareState";
import { ShareModal } from "./ShareModal";

vi.mock("@/lib/utils/shareState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils/shareState")>()),
  copyToClipboard: vi.fn(),
}));

const state: ShareState = {
  viewMode: "globe",
  target: null,
  timeOffset: 0,
  pathMode: "short",
  layers: {
    terminator: true,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    nightLights: false,
    labels: true,
  },
};
const props = { isOpen: true, onClose: vi.fn(), state };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(copyToClipboard).mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function portalRoot() {
  const root = screen
    .getByRole("heading", { name: "Share" })
    .closest<HTMLElement>(".fixed");
  expect(root).not.toBeNull();
  return root!;
}

it("bridges scoped tokens to the real portal and updates them when the provider changes", () => {
  const { container, rerender } = render(
    <StationProvider theme="light" accent="#9944cc">
      <ShareModal {...props} />
    </StationProvider>,
  );
  const portal = portalRoot();
  const provider = container.querySelector<HTMLElement>(".station-ui")!;
  expect(container.contains(portal)).toBe(false);
  expect(portal.dataset.stationTheme).toBe("light");
  expect(portal.querySelector(".su-fixed-dark")).toBeNull();
  const previousAccent = portal.style.getPropertyValue(
    "--su-solid-accent-fill",
  );
  for (const token of [
    "--su-panel",
    "--su-text",
    "--su-solid-accent-fill",
    "--su-solid-accent-ink",
  ]) {
    expect(portal.style.getPropertyValue(token)).not.toBe("");
    expect(portal.style.getPropertyValue(token)).toBe(
      provider.style.getPropertyValue(token),
    );
  }
  rerender(
    <StationProvider theme="midnight" accent="#22aa99">
      <ShareModal {...props} />
    </StationProvider>,
  );
  expect(portal.dataset.stationTheme).toBe("midnight");
  expect(portal.style.getPropertyValue("--su-solid-accent-fill")).not.toBe(
    previousAccent,
  );
  expect(portal.style.getPropertyValue("--su-text")).toBe(
    provider.style.getPropertyValue("--su-text"),
  );
});

it("leaves unscoped portal tokens unset so the document remains the authority", () => {
  const previous =
    document.documentElement.style.getPropertyValue("--su-panel");
  document.documentElement.style.setProperty("--su-panel", "#abcdef");
  try {
    render(<ShareModal {...props} />);
    const portal = portalRoot();
    expect(portal.style.getPropertyValue("--su-panel")).toBe("");
    expect(portal.style.getPropertyValue("--su-text")).toBe("");
    expect(portal.hasAttribute("data-station-theme")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--su-panel")).toBe(
      "#abcdef",
    );
  } finally {
    if (previous)
      document.documentElement.style.setProperty("--su-panel", previous);
    else document.documentElement.style.removeProperty("--su-panel");
  }
});

it("changes navigation content and exposes one pressed choice with a visible underline", () => {
  render(<ShareModal {...props} />);
  for (const name of ["Link", "Social", "QR Code", "Link"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    const selected = screen.getByRole("button", {
      name,
      pressed: true,
    });
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(selected.classList.contains("su-tone-accent")).toBe(true);
    expect(selected.querySelector(".underline")).not.toBeNull();
    if (name === "Link")
      expect(
        screen.getByRole("button", { name: "Copy" }),
      ).toBeTruthy();
    if (name === "Social")
      expect(
        screen.getByText("Share your propagation analysis on social media"),
      ).toBeTruthy();
    if (name === "QR Code")
      expect(
        screen.getByText("Scan this code to open the shared view"),
      ).toBeTruthy();
  }
});

it("shows copy success as feedback rather than a pressed state and resets after two seconds", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(true);
  render(<ShareModal {...props} />);
  const url = screen.getByRole("textbox") as HTMLInputElement;
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(copyToClipboard).toHaveBeenCalledWith(url.value);
  const copied = screen.getByRole("button", { name: "Copied" });
  for (const className of [
    "su-treatment",
    "su-treatment--subtle",
    "su-treatment--interactive",
    "su-tone-success",
  ]) expect(copied.classList.contains(className)).toBe(true);
  expect(copied.hasAttribute("aria-pressed")).toBe(false);
  act(() => vi.advanceTimersByTime(2000));
  const copy = screen.getByRole("button", { name: "Copy" });
  for (const className of [
    "su-treatment",
    "su-treatment--subtle",
    "su-treatment--interactive",
    "su-tone-accent",
  ]) expect(copy.classList.contains(className)).toBe(true);
  expect(copy.hasAttribute("aria-pressed")).toBe(false);
});

it("keeps failed copying actionable and clears its feedback when reopened", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(false);
  const { rerender } = render(<ShareModal {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(screen.getByText("Failed to copy to clipboard")).toBeTruthy();
  const copy = screen.getByRole("button", { name: "Copy" });
  expect(copy.hasAttribute("aria-pressed")).toBe(false);
  expect(copy.classList.contains("su-tone-accent")).toBe(true);
  rerender(<ShareModal {...props} isOpen={false} />);
  expect(screen.queryByRole("heading", { name: "Share" })).toBeNull();
  rerender(<ShareModal {...props} />);
  expect(screen.queryByText("Failed to copy to clipboard")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Copy" }),
  ).toBeTruthy();
});

it("clears successful copy feedback on reopen", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(true);
  const { rerender } = render(<ShareModal {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(
    screen.getByRole("button", { name: "Copied" }),
  ).toBeTruthy();
  rerender(<ShareModal {...props} isOpen={false} />);
  rerender(<ShareModal {...props} />);
  expect(
    screen.getByRole("button", { name: "Copy" }),
  ).toBeTruthy();
});
