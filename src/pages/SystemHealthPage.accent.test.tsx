import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SystemHealthPage } from "./SystemHealthPage";

// #789: SystemHealthPage used to keep a `accentHex` literal beside the
// tailwind `accentColor` token per category, and the two drifted (the
// literal for `nebula-blue` didn't match its class, `aurora-purple` had
// gone stale). Both the 2px accent rule and the category icon must now
// read the same station-token colour as the class-driven styling — no
// literal hex anywhere.

const HEX_COLOR = /#[0-9a-fA-F]{3,8}/;
const STATION_TOKEN_COLOR = /^rgb\(var\(--su-[a-z]+-rgb\)\)$/;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SystemHealthPage accent tokens (#789)", () => {
  it("renders every category's accent rule and icon from a station-token colour, never a hex literal", () => {
    renderPage();

    // The real category cards the real component renders — not a copy of
    // the source data. `.overflow-hidden` is unique to the five category
    // cards (checked against the other <Card> usages on this page).
    const cards = document.querySelectorAll(".overflow-hidden");
    expect(cards.length).toBeGreaterThanOrEqual(5);

    for (const card of Array.from(cards)) {
      const rule = card.querySelector(".h-\\[2px\\]") as HTMLElement | null;
      expect(rule).not.toBeNull();
      const bg = rule!.style.background;
      expect(bg).not.toMatch(HEX_COLOR);
      expect(bg).toMatch(STATION_TOKEN_COLOR);

      // The category icon is the first <svg> in the card header.
      const icon = card.querySelector("svg");
      expect(icon).not.toBeNull();
      const stroke = icon!.getAttribute("stroke") ?? "";
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_TOKEN_COLOR);
    }
  });

  it("renders the Satellite Data card's accent rule and icon from --su-purple-rgb, not #aa44ff", () => {
    renderPage();

    const title = screen.getByText("Satellite Data");
    const card = title.closest(".overflow-hidden");
    expect(card).not.toBeNull();

    const rule = card!.querySelector(".h-\\[2px\\]") as HTMLElement | null;
    expect(rule).not.toBeNull();
    expect(rule!.style.background).toBe("rgb(var(--su-purple-rgb))");

    const icon = card!.querySelector("svg") as SVGSVGElement | null;
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("stroke")).toBe("rgb(var(--su-purple-rgb))");
  });
});
