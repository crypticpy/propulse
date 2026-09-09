import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVisualEffectsStore, DEFAULT_VISUAL_EFFECTS } from "@/stores/visualEffectsStore";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { EquipmentHeroCard } from "./EquipmentHeroCard";
vi.mock("@/hooks/useImageUrl", () => ({ useImageUrl: () => ({ url: null }) }));
vi.mock("@/hooks/useOperatorRank", () => ({ useOperatorRank: () => ({ rank: "ethereal", hasChromaticEffects: true, hasParticles: true, preferences: { enableParticles: true } }) }));
vi.mock("./EquipmentCard", () => ({ ArtZonePattern: () => <svg />, StatIconSvg: () => <svg /> }));
beforeEach(() => {
  useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS, level: "full" });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("stops each decorative loop at its individual gate while keeping equipment and controls focused", () => {
  render(<EquipmentHeroCard open title="Portable station radio" subtitle="Operator-owned equipment" onClose={vi.fn()} onEdit={vi.fn()} />);
  const dialog = screen.getByRole("dialog");
  const close = screen.getByRole("button", { name: "Close" });
  close.focus();
  const animations = (selector: string) => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).map((node) => node.style.animation);
  expect(animations(".hero-shimmer").every((value) => value.includes("heroShimmer"))).toBe(true);
  expect(animations(".hero-drift").every((value) => value.includes("heroDrift"))).toBe(true);
  act(() => useVisualEffectsStore.setState({ animatedBadges: false }));
  expect(animations(".hero-shimmer")).toEqual(["none", "none"]);
  act(() => useVisualEffectsStore.setState({ particles: false }));
  expect(animations(".hero-drift")).toEqual(["none", "none"]);
  act(() => useVisualEffectsStore.setState({ glow: false }));
  expect(animations(".hero-pulse")).toEqual(["none"]);
  expect(screen.getByRole("heading", { name: "Portable station radio" })).toBeTruthy();
  expect(screen.getByText("Operator-owned equipment")).toBeTruthy();
  expect(document.activeElement).toBe(close);
});

it("routes Escape to the hero card when it opens above a registered dialog, leaving the dialog beneath open (#727)", () => {
  // Mirrors the real reproduction from issue #727: RadioPickerModal (a
  // registered AccessibleDialog) hosts RadioManager's Manage tab, which opens
  // EquipmentHeroCard on top when a radio is clicked. Before this card was
  // routed through AccessibleDialog, it rendered a bare `createPortal` that
  // never joined the stack, so `isTopmostOpen` still resolved to the outer
  // dialog's token and Escape closed the picker instead of the card.
  const closeOuter = vi.fn();
  const closeHero = vi.fn();
  // Mount sequentially, like the real flow: the picker is already open (its
  // stack-registration effect has already run) before the hero card opens in
  // a later render. Mounting both in the same commit would register them in
  // the opposite order (child effects fire before parent effects), which
  // doesn't reflect how the two dialogs actually come into existence.
  const { rerender } = render(
    <AccessibleDialog open onClose={closeOuter} title="Radio picker">
      <EquipmentHeroCard
        open={false}
        title="Portable station radio"
        onClose={closeHero}
        onEdit={vi.fn()}
      />
    </AccessibleDialog>,
  );
  rerender(
    <AccessibleDialog open onClose={closeOuter} title="Radio picker">
      <EquipmentHeroCard
        open
        title="Portable station radio"
        onClose={closeHero}
        onEdit={vi.fn()}
      />
    </AccessibleDialog>,
  );
  // The picker is now the *background* dialog: AccessibleDialog inerts every
  // stack entry except the topmost, so it's correctly unreachable by role
  // query while the hero card is on top of it — that's existing, intentional
  // stacking behavior, not what this test is proving.
  expect(
    screen.queryByRole("dialog", { name: "Radio picker" }),
  ).toBeNull();
  expect(
    screen.getByRole("dialog", { name: "Portable station radio" }),
  ).toBeTruthy();

  fireEvent.keyDown(document, { key: "Escape" });

  // The regression this guards: before EquipmentHeroCard joined the stack,
  // it never registered a token, so `isTopmostOpen` resolved to the picker's
  // token and Escape closed the picker instead of the card sitting on top.
  expect(closeHero).toHaveBeenCalledOnce();
  expect(closeOuter).not.toHaveBeenCalled();

  rerender(
    <AccessibleDialog open onClose={closeOuter} title="Radio picker">
      <EquipmentHeroCard
        open={false}
        title="Portable station radio"
        onClose={closeHero}
        onEdit={vi.fn()}
      />
    </AccessibleDialog>,
  );
  expect(
    screen.queryByRole("dialog", { name: "Portable station radio" }),
  ).toBeNull();
  expect(screen.getByRole("dialog", { name: "Radio picker" })).toBeTruthy();
});
