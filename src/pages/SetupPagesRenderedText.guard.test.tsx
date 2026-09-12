/**
 * Rendered-text regression guard for #1097 (shared setup-page toolkit).
 *
 * BridgeInfoPage and SetupGuidePage used to each define their own copy of
 * `Platform`/`detectPlatform`/`platformLabel`/`CommandBlock`/`Step`/
 * `ConnectionDot`/`FAQItem`/architecture-diagram. #1097 moved all seven into
 * `src/components/setup/`. The issue's Out section forbids changing any
 * install command, script URL, or FAQ wording in the process — this test
 * freezes the full rendered text of both pages, per platform tab, so any
 * future change to that content (accidental or not) shows up as an explicit
 * snapshot diff in review instead of silently drifting.
 *
 * This snapshot was captured *after* the #1097 refactor, but only once its
 * text was diffed platform-by-platform against the pre-refactor pages (via a
 * throwaway parity test against `git show HEAD:src/pages/*.tsx` copies) and
 * found identical except for the architecture diagram — which #1097
 * intentionally unifies onto one treatment. SetupGuidePage does not lose its
 * "UDP 2237" WSJT-X subtitle (it keeps it) but gains the "Transceiver"
 * subtitle under "Your Radio" that only BridgeInfoPage had; BridgeInfoPage in
 * turn gains "2237" — main's bridge diagram read a bare "UDP" (see the PR
 * body). So this snapshot is a faithful baseline of "today's" commands and
 * FAQ answers, not just whatever the refactor happened to produce.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PLATFORM_STORAGE_KEY } from "@/components/setup";
import { BridgeInfoPage } from "@/pages/BridgeInfoPage";
import { SetupGuidePage } from "@/pages/SetupGuidePage";

const PLATFORM_LABELS = ["Windows", "macOS", "Linux"] as const;
const LEGACY_PLATFORM_STORAGE_KEY = "propulse-bridge-setup-platform";

function renderOnPlatform(Page: React.ComponentType, platformLabel: string) {
  localStorage.clear();
  const { container } = render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
  const tab = screen.getAllByRole("button", { name: platformLabel })[0];
  fireEvent.click(tab);
  const hrefs = [...container.querySelectorAll("a")].map((a) =>
    a.getAttribute("href"),
  );
  // Appended (not interleaved) so the diff from adding href pinning is
  // additive-only against the pre-existing text-content snapshots.
  return `${container.textContent ?? ""}\n\n[hrefs]\n${JSON.stringify(hrefs)}`;
}

describe("BridgeInfoPage rendered text is unchanged by the #1097 toolkit extraction", () => {
  it.each(PLATFORM_LABELS)("matches the frozen baseline for %s", (label) => {
    expect(renderOnPlatform(BridgeInfoPage, label)).toMatchSnapshot();
  });
});

describe("SetupGuidePage rendered text is unchanged by the #1097 toolkit extraction", () => {
  it.each(PLATFORM_LABELS)("matches the frozen baseline for %s", (label) => {
    expect(renderOnPlatform(SetupGuidePage, label)).toMatchSnapshot();
  });
});

describe("legacy platform key is copied forward on mount", () => {
  it("persists the legacy BridgeInfoPage value under the canonical key once mounted", async () => {
    localStorage.clear();
    localStorage.setItem(LEGACY_PLATFORM_STORAGE_KEY, "linux");

    render(
      <MemoryRouter>
        <BridgeInfoPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(localStorage.getItem(PLATFORM_STORAGE_KEY)).toBe("linux");
    });
  });
});
