import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BandActivityTile } from "../tiles/BandActivityTile";
import { BandActivityReport } from "./BandActivityReport";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", () => ({ useBandActivity: mocks.activity }));

function activitySnapshot() {
  const map = new Map([
    ["20m", { band: "20m", count60m: 470 }],
    ["40m", { band: "40m", count60m: 416 }],
  ]);
  return Object.assign(map, { fetchedAt: Date.parse("2026-09-05T13:00:00Z") });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verdicts.mockReturnValue({
    bands: [],
    ready: true,
    scope: { id: "regional:NA", label: "North America" },
    activityScope: { type: "regional", continent: "NA" },
  });
  mocks.activity.mockReturnValue({
    data: activitySnapshot(),
    isPending: false,
    isError: false,
  });
});

describe("wall reports", () => {
  it("renders the report shell as a modal dialog", () => {
    render(<BandActivityReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("hcr");
    // Hero, verdict and one fact, at report size.
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("470");
    expect(screen.getByText("886")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const close = vi.fn();
    render(<BandActivityReport open onClose={close} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(close).toHaveBeenCalledOnce();
  });

  it("opens from its tile and hands focus back on close", async () => {
    const user = userEvent.setup();
    render(<BandActivityTile />);

    const trigger = screen.getByRole("button", {
      name: /open the band activity report/i,
    });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");

    await user.click(screen.getByRole("button", { name: /esc/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
