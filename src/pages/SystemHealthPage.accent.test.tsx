import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SystemHealthPage } from "./SystemHealthPage";

// #789/#796: SystemHealthPage used to keep an `accentHex` literal beside the
// tailwind `accentColor` token per category, and the two drifted (the
// literal for `nebula-blue` didn't match its class, `aurora-purple` had
// gone stale). The card rule, the category icon, the architecture diagram's
// upstream boxes, and the healthy-count pill must all read from the single
// ACCENT_TOKEN_COLORS / status-token map — no literal hex anywhere in the
// accent surfaces.
//
// The donut segments and `lineColor` in the same file are *status* colours,
// not accents, and are read by a `s.color === "#ff4455"` string
// discriminator (SystemHealthPage.tsx:~616). Tokenising those without a
// dedicated test would silently kill the errored-arc glow, so they are
// intentionally out of scope here and tracked separately as #802.
//
// Note on jsdom: assigning a hex string to `style.background` / `style.color`
// gets normalised by jsdom's CSSOM to `rgb(r, g, b)` before we ever read it
// back, so `expect(x).not.toMatch(HEX_COLOR)` on a `style.*` read can never
// actually fail — it documents intent but is not a guard on its own. The
// positive `STATION_TOKEN_COLOR` match (for style reads) and the raw
// `getAttribute("stroke")` reads on the SVGs (never CSSOM-normalised) are
// what actually catch a regression.

const HEX_COLOR = /#[0-9a-fA-F]{3,8}/;
const STATION_TOKEN_COLOR = /^rgb\(var\(--su-[a-z-]+-rgb\)\)$/;

// The full, pinned mapping — not just the shape. A future change that maps
// a category to the wrong (but still valid-looking) `--su-*` role must fail
// here, not just pass a regex.
const EXPECTED_ACCENTS: Record<string, string> = {
  "Space Weather": "rgb(var(--su-accent-rgb))",
  "Spot Networks": "rgb(var(--su-success-rgb))",
  "Callsign Lookup": "rgb(var(--su-muted-rgb))",
  "Logbook Sync": "rgb(var(--su-info-rgb))",
  "Satellite Data": "rgb(var(--su-purple-rgb))",
};

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

describe("SystemHealthPage accent tokens (#789/#796)", () => {
  it("maps every category's accent rule and icon to its exact station token", () => {
    const { container } = renderPage();

    // Walk the real category cards (not `screen.getByText`, since the
    // architecture diagram below repeats these same titles as group labels
    // — see the next test — so a document-wide text query is ambiguous).
    const cards = container.querySelectorAll(".overflow-hidden");
    expect(cards.length).toBeGreaterThanOrEqual(5);

    const seenTitles = new Set<string>();
    for (const card of Array.from(cards)) {
      const heading = within(card as HTMLElement).queryByText(
        (_, el) => el?.tagName === "SPAN" && el.className.includes("font-semibold"),
      );
      const title = heading?.textContent ?? "";
      const expected = EXPECTED_ACCENTS[title];
      if (!expected) continue; // not one of the five accent-mapped cards
      seenTitles.add(title);

      // 2px accent rule.
      const rule = card.querySelector(".h-\\[2px\\]") as HTMLElement | null;
      expect(rule, `2px rule not found for "${title}"`).not.toBeNull();
      expect(rule!.style.background).not.toMatch(HEX_COLOR);
      expect(rule!.style.background).toMatch(STATION_TOKEN_COLOR);
      expect(rule!.style.background).toBe(expected);

      // Category icon.
      const icon = card.querySelector("svg");
      expect(icon, `icon not found for "${title}"`).not.toBeNull();
      const stroke = icon!.getAttribute("stroke") ?? "";
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_TOKEN_COLOR);
      expect(stroke).toBe(expected);
    }

    // Confirm the loop actually matched all five expected titles, scoped to
    // `container` (not `document`) so a portal or unrelated fixture can't
    // silently widen or narrow the match set.
    expect(seenTitles).toEqual(new Set(Object.keys(EXPECTED_ACCENTS)));
  });

  it("derives the architecture diagram's upstream boxes from the same token map, never a hex literal", () => {
    const { container } = renderPage();

    // Scoped to `rect[stroke]` inside the diagram's labelled <svg>: the two
    // infra boxes (Propulse Browser, Edge Functions) plus the five upstream
    // API group boxes — seven rects total, all token-driven after #796.
    // This deliberately excludes the connection `<line>` elements, which
    // carry the *status* `lineColor` (green/yellow/red per overall health)
    // and are out of scope here (#802).
    const boxes = container.querySelectorAll('svg[role="img"] rect[stroke]');
    expect(boxes.length).toBeGreaterThanOrEqual(7);

    const validTokens = new Set(Object.values(EXPECTED_ACCENTS));
    for (const box of Array.from(boxes)) {
      const stroke = box.getAttribute("stroke") ?? "";
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_TOKEN_COLOR);
      expect(validTokens.has(stroke)).toBe(true);
    }
  });

  it("colours the healthy-count pill from the success/muted tokens, never the old hardcoded hex", () => {
    const { container } = renderPage();

    // `.rounded-full.border` is unique to the "N/M healthy" pill on this
    // page — every other `rounded-full` usage here is a bare status dot
    // with no `border` class.
    const pills = container.querySelectorAll(".rounded-full.border");
    expect(pills.length).toBeGreaterThanOrEqual(5);

    for (const pill of Array.from(pills)) {
      const el = pill as HTMLElement;
      expect(el.textContent).toMatch(/^\d+\/\d+ healthy$/);

      const color = el.style.color;
      expect(color === "rgb(var(--su-success-rgb))" || color === "rgb(var(--su-muted-rgb))").toBe(true);
      // Belt-and-suspenders against the specific literals this PR removed —
      // even though jsdom would normalise a hex assignment to rgb(), these
      // pin the exact strings the review flagged.
      expect(color).not.toBe("#00ff88");
      expect(color).not.toBe("rgb(0, 255, 136)");
      expect(color).not.toBe("#9ca3af");
    }
  });

  it("renders the Satellite Data card's accent rule and icon from --su-purple-rgb, not #aa44ff", () => {
    const { container } = renderPage();

    const title = screen.getByText("Satellite Data");
    const card = title.closest(".overflow-hidden");
    expect(card).not.toBeNull();

    const rule = card!.querySelector(".h-\\[2px\\]") as HTMLElement | null;
    expect(rule).not.toBeNull();
    expect(rule!.style.background).toBe("rgb(var(--su-purple-rgb))");

    const icon = card!.querySelector("svg") as SVGSVGElement | null;
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("stroke")).toBe("rgb(var(--su-purple-rgb))");

    // Scoped to `container`, matching the rest of this file.
    expect(container.contains(card)).toBe(true);
  });
});
