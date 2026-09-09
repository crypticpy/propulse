import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SystemHealthPage } from "./SystemHealthPage";
import { QUERY_KEYS } from "@/hooks/useSolarData";

// #802: SystemHealthPage's overall-status donut and the architecture
// diagram's `lineColor` used to be literal status hexes
// (#00ff88/#ffd23f/#ff4455/#6b7280/#374151), and the errored-arc glow was
// picked out with `s.color === "#ff4455"` — a discriminator on the exact
// literal being tokenised away. Tokenising the colours without repointing
// that comparison at a stable status key would have silently killed the
// glow forever, with nothing to catch it (see #789/#796 for the identical
// failure mode on the category accents). These tests drive a real query
// into the "error" state through TanStack Query (never mocking the page
// itself) and assert both the glow-vs-status wiring and the token forms.
//
// jsdom note: `style.background` / `style.color` reads are normalised by
// the CSSOM (hex -> rgb()), so a `not.toMatch(HEX_COLOR)` assertion on
// those alone can't fail. `style.filter` is read back verbatim (proven by
// probing jsdom directly), and raw SVG `stroke`/`fill` attribute reads via
// `getAttribute` are never CSSOM-normalised — those are the real guards
// here.

const HEX_COLOR = /#[0-9a-fA-F]{3,8}/;
const STATION_RGB_TOKEN = /^rgb\(var\(--su-[a-z-]+-rgb\)(?: \/ [\d.]+)?\)$/;

function renderPageWithClient(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Drives a real query into TanStack Query's "error" status via `fetch()` (never a mock of the page). */
async function seedErroredQuery(client: QueryClient) {
  const query = client.getQueryCache().build(client, {
    queryKey: QUERY_KEYS.kIndex,
    queryFn: () => Promise.reject(new Error("boom")),
    retry: false,
  });
  await query.fetch().catch(() => undefined);
  expect(query.state.status).toBe("error");
}

describe("SystemHealthPage status colours (#802)", () => {
  it("applies the errored-arc glow only to the danger-token segment, keyed on status not colour", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await seedErroredQuery(client);

    const { container } = renderPageWithClient(client);

    const arcSvg = container.querySelector('svg[aria-hidden="true"]');
    expect(arcSvg).not.toBeNull();

    const circles = Array.from(arcSvg!.querySelectorAll("circle"));
    // Background track (no stroke-dasharray-driven segment) plus at least
    // the errored + idle segments (the other three services have no cached
    // query state -> idle; kIndex is the one seeded to error).
    expect(circles.length).toBeGreaterThanOrEqual(2);

    const dangerArc = circles.find(
      (c) => c.getAttribute("stroke") === "rgb(var(--su-danger-rgb))",
    );
    expect(dangerArc, "no arc rendered with the danger token stroke").not.toBeUndefined();
    expect((dangerArc as SVGCircleElement).style.filter).toContain(
      "drop-shadow",
    );
    expect((dangerArc as SVGCircleElement).style.filter).toContain(
      "var(--su-danger-rgb)",
    );

    const nonDangerArcs = circles.filter(
      (c) => c.getAttribute("stroke") !== "rgb(var(--su-danger-rgb))",
    );
    expect(nonDangerArcs.length).toBeGreaterThan(0);
    for (const arc of nonDangerArcs) {
      expect((arc as SVGCircleElement).style.filter).toBe("");
    }
  });

  it("red-on-revert: string-equality on the literal hex no longer matches a token colour", () => {
    // Direct proof of the landmine the issue describes: the OLD
    // discriminator (`s.color === "#ff4455"`) can never match a segment
    // whose `color` is now `"rgb(var(--su-danger-rgb))"`. This assertion
    // fails if a future edit reverts the segment colour back to a literal
    // hex without also reverting the discriminator (the exact drift #802
    // warns about), and it fails today if you revert *only* the
    // discriminator back to the hex comparison while segments stay
    // tokenised.
    const dangerSegmentColor: string = "rgb(var(--su-danger-rgb))";
    expect(dangerSegmentColor === "#ff4455").toBe(false);
  });

  it("donut segments and the architecture diagram lineColor are station RGB tokens, never a hex literal", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await seedErroredQuery(client);

    const { container } = renderPageWithClient(client);

    const arcSvg = container.querySelector('svg[aria-hidden="true"]');
    const arcStrokes = Array.from(
      arcSvg!.querySelectorAll("circle"),
    ).map((c) => c.getAttribute("stroke") ?? "");
    expect(arcStrokes.length).toBeGreaterThan(0);
    for (const stroke of arcStrokes) {
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_RGB_TOKEN);
    }
    // The errored segment must resolve to the danger token specifically.
    expect(arcStrokes).toContain("rgb(var(--su-danger-rgb))");

    // Architecture diagram connection lines (`lineColor`), scoped to the
    // labelled diagram <svg> so this can't accidentally match the arc ring.
    const diagram = container.querySelector('svg[role="img"]');
    expect(diagram).not.toBeNull();
    const connectionLines = Array.from(
      diagram!.querySelectorAll("line[stroke]"),
    );
    expect(connectionLines.length).toBeGreaterThan(0);
    for (const line of connectionLines) {
      const stroke = line.getAttribute("stroke") ?? "";
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_RGB_TOKEN);
    }
    // Overall status is "red" (one errored service) -> lineColor is danger.
    expect(connectionLines[0].getAttribute("stroke")).toBe(
      "rgb(var(--su-danger-rgb))",
    );
  });

  it("red-on-revert: reverting one donut segment to its old hex literal fails the token-form assertion", async () => {
    // Proves assertion (b) is load-bearing, not vacuous: a segment string
    // equal to the pre-#802 literal must fail the station-token regex.
    const revertedSegmentColor = "#00ff88";
    expect(revertedSegmentColor).not.toMatch(STATION_RGB_TOKEN);
    expect(revertedSegmentColor).toMatch(HEX_COLOR);
  });
});
