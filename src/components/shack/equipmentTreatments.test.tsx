import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StationProvider } from "@/components/station-ui/StationProvider";
import { EquipmentDetailModal } from "./EquipmentDetailModal";
import { EquipmentHeroCard } from "./EquipmentHeroCard";

vi.mock("@/hooks/useImageUrl", () => ({ useImageUrl: () => ({ url: null }) }));
vi.mock("@/hooks/useOperatorRank", () => ({
  useOperatorRank: () => ({
    rank: "novice",
    hasChromaticEffects: false,
    hasParticles: false,
    preferences: { enableParticles: false },
  }),
}));
vi.mock("./EquipmentCard", () => ({
  ArtZonePattern: () => <svg />,
  StatIconSvg: () => <svg />,
}));
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each([
  ["Detail", EquipmentDetailModal, "success"],
  ["Hero", EquipmentHeroCard, "neutral"],
] as const)("%s equipment treatments", (_name, Component, inactiveTone) => {
  it("preserves activation callbacks and exposes active state without relying on color", () => {
    const activate = vi.fn();
    const props = {
      open: true,
      fields: [],
      title: "Field radio",
      onClose: vi.fn(),
      onSetActive: activate,
    };
    const { rerender } = render(<Component {...props} isActive={false} />);
    const inactive = screen.getByRole("button", {
      name: "Set Active",
      pressed: false,
    });
    expect(inactive.classList.contains(`su-tone-${inactiveTone}`)).toBe(true);
    expect(inactive.classList.contains("border")).toBe(true);
    expect(inactive.classList.contains("su-treatment--interactive")).toBe(true);
    fireEvent.click(inactive);
    expect(activate).toHaveBeenCalledOnce();
    rerender(<Component {...props} isActive />);
    const active = screen.getByRole("button", {
      name: "Active",
      pressed: true,
    });
    expect(active.classList.contains("su-tone-success")).toBe(true);
    expect(active.querySelector(".animate-pulse.bg-current")).not.toBeNull();
    fireEvent.click(active);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("bridges changing scoped tokens outside the intentional fixed-dark reading body", () => {
    const props = {
      open: true,
      fields: [],
      title: "Field radio",
      onClose: vi.fn(),
      onSetActive: vi.fn(),
    };
    const { rerender, container } = render(
      <StationProvider theme="light" accent="#9944cc">
        <Component {...props} />
      </StationProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Field radio" });
    expect(container.contains(dialog)).toBe(false);
    const body = document.body.querySelector<HTMLElement>(".su-fixed-dark")!;
    const outer = body.parentElement!;
    const provider = container.querySelector<HTMLElement>(".station-ui")!;
    expect(outer.style.getPropertyValue("--su-text")).toBe(
      provider.style.getPropertyValue("--su-text"),
    );
    expect(outer.style.getPropertyValue("--su-text")).not.toBe("");
    expect(body.style.getPropertyValue("--su-text")).toBe("");
    expect(outer.classList.contains("su-fixed-dark")).toBe(false);
    const previousAccent = outer.style.getPropertyValue(
      "--su-solid-accent-fill",
    );
    rerender(
      <StationProvider theme="midnight" accent="#22aa99">
        <Component {...props} />
      </StationProvider>,
    );
    expect(outer.style.getPropertyValue("--su-solid-accent-fill")).not.toBe(
      previousAccent,
    );
    for (const token of [
      "--su-text",
      "--su-solid-accent-fill",
      "--su-solid-accent-ink",
    ]) {
      expect(outer.style.getPropertyValue(token)).toBe(
        provider.style.getPropertyValue(token),
      );
      expect(body.style.getPropertyValue(token)).toBe("");
    }
  });

  it("does not inject the default context into unscoped portals", () => {
    render(
      <Component
        fields={[]}
        open
        title="Field radio"
        onClose={vi.fn()}
        onSetActive={vi.fn()}
      />,
    );
    const body = document.body.querySelector<HTMLElement>(".su-fixed-dark")!;
    expect(body).not.toBeNull();
    expect(body.parentElement!.style.getPropertyValue("--su-text")).toBe("");
    expect(body.style.getPropertyValue("--su-text")).toBe("");
  });
});
