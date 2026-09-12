import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotDetailPanel } from "./SlotDetailPanel";

const BASE_PROPS = {
  title: "Texas",
  subtitle: "TX",
  subtitleClassName: "text-sm text-su-muted font-mono",
  status: "confirmed" as const,
  fields: [
    { label: "QSOs", value: 12 },
    { label: "Status", value: "Confirmed", tone: "status" as const },
  ],
  bands: ["20m"],
  modes: ["SSB"],
  ariaLabel: "Details for Texas",
};

describe("SlotDetailPanel", () => {
  it("renders a WAS-shaped slot: title, subtitle, status wording and bands", () => {
    render(
      <SlotDetailPanel
        title="Texas"
        subtitle="TX"
        subtitleClassName="text-sm text-su-muted font-mono"
        status="confirmed"
        fields={[
          { label: "QSOs", value: 12 },
          { label: "Status", value: "Confirmed", tone: "status" },
        ]}
        bands={["20m", "40m"]}
        modes={["SSB"]}
        ariaLabel="Details for Texas"
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Details for Texas" }),
    ).toBeTruthy();
    expect(screen.getByText("Texas")).toBeTruthy();
    expect(screen.getByText("TX")).toBeTruthy();
    // Status wording appears twice: the header badge and the "Status" field.
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("20m")).toBeTruthy();
    expect(screen.getByText("40m")).toBeTruthy();
    expect(screen.getByText("SSB")).toBeTruthy();
  });

  it("renders a WAZ-shaped slot with no subtitle", () => {
    render(
      <SlotDetailPanel
        title="CQ Zone 5"
        status="worked_unconfirmed"
        fields={[
          { label: "QSOs", value: 3 },
          { label: "Status", value: "Worked", tone: "status" },
        ]}
        bands={["15m"]}
        modes={[]}
        ariaLabel="Details for CQ Zone 5"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("CQ Zone 5")).toBeTruthy();
    expect(screen.getAllByText("Worked").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("15m")).toBeTruthy();
    expect(screen.queryByText("Modes")).toBeNull();
  });

  it("renders a DXCC-shaped slot: continent/zone/entity fields, no duplicated Status field", () => {
    render(
      <SlotDetailPanel
        title="Japan"
        subtitle="JA"
        status="needed"
        fields={[
          { label: "Continent", value: "AS" },
          { label: "CQ Zone", value: 25 },
          { label: "QSOs", value: 0 },
          { label: "Entity ID", value: 339 },
        ]}
        bands={[]}
        modes={[]}
        ariaLabel="Details for Japan"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Japan")).toBeTruthy();
    expect(screen.getByText("JA")).toBeTruthy();
    expect(screen.getByText("AS")).toBeTruthy();
    expect(screen.getByText("339")).toBeTruthy();
    // The DXCC field set has no explicit "Status" field; wording still shows
    // once, in the header badge.
    expect(screen.getAllByText("Needed")).toHaveLength(1);
    expect(screen.queryByText("Bands")).toBeNull();
  });

  it("colours a tone: 'status' field with the status ink class, and leaves a plain field untouched", () => {
    render(
      <SlotDetailPanel
        title="Test Slot"
        status="confirmed"
        fields={[
          { label: "Plain", value: "Plain value" },
          { label: "Status", value: "Confirmed", tone: "status" },
        ]}
        bands={[]}
        modes={[]}
        ariaLabel="Details for Test Slot"
        onClose={vi.fn()}
      />,
    );

    const plainValue = screen.getByText("Plain value");
    expect(plainValue.className).toBe("text-su-text");

    const statusValue = screen.getByText("Confirmed", { selector: "p" });
    expect(statusValue.className).toBe("text-signal-green");
  });

  it("closes on Escape and restores focus to the element that was active when it opened", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Texas cell";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <SlotDetailPanel {...BASE_PROPS} onClose={onClose} />,
    );

    expect(
      screen.getByRole("dialog", { name: "Details for Texas" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<></>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });
});
