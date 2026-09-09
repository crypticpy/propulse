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
// failure mode on the category accents). These tests drive real queries
// into every status TanStack Query can produce (error, fresh success,
// stale success, in-flight) through a real `QueryClient` cache — never
// mocking the page or its hooks — so all five donut segments plus the
// architecture diagram's green/yellow/red `lineColor` branches render and
// get asserted on.
//
// jsdom note: `style.background` / `style.color` reads are normalised by
// the CSSOM (hex -> rgb()), so a `not.toMatch(HEX_COLOR)` assertion on
// those alone can't fail. `style.filter` is read back verbatim (proven by
// probing jsdom directly), and raw SVG `stroke`/`fill` attribute reads via
// `getAttribute` are never CSSOM-normalised — those are the real guards
// here.

const MINUTE = 60_000;
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

/** Drives a real query into TanStack Query's "error" status via `fetch()`. */
async function seedErrorQuery(
  client: QueryClient,
  queryKey: readonly string[],
) {
  const query = client.getQueryCache().build(client, {
    queryKey,
    queryFn: () => Promise.reject(new Error("boom")),
    retry: false,
  });
  await query.fetch().catch(() => undefined);
  expect(query.state.status).toBe("error");
}

/** Seeds a real cache entry with data fresh as of now -> "healthy". */
function seedFreshSuccess(client: QueryClient, queryKey: readonly string[]) {
  client.setQueryData(queryKey, { ok: true });
}

/** Seeds a real cache entry whose data is older than `ageMs` -> "degraded" once ageMs exceeds the service's stale threshold. */
function seedStaleSuccess(
  client: QueryClient,
  queryKey: readonly string[],
  ageMs: number,
) {
  client.setQueryData(
    queryKey,
    { ok: true },
    { updatedAt: Date.now() - ageMs },
  );
}

/** Starts a real fetch whose promise never resolves -> "loading" (fetching, no prior data). */
function seedInFlightQuery(client: QueryClient, queryKey: readonly string[]) {
  const query = client.getQueryCache().build(client, {
    queryKey,
    queryFn: () => new Promise<never>(() => {}),
    retry: false,
  });
  void query.fetch();
}

/**
 * Seeds one query into each of the four cache-derived statuses so all five
 * donut segments (healthy/degraded/error/loading/idle) render at once:
 * - kIndex -> error
 * - solarFlux -> fresh success -> healthy (8h stale threshold)
 * - magnetometer -> stale success -> degraded (5min stale threshold)
 * - probabilities -> in-flight fetch, no prior data -> loading
 * - sunspots and every `queryKey: null` service stay idle (untouched)
 */
async function seedAllStates(client: QueryClient) {
  await seedErrorQuery(client, QUERY_KEYS.kIndex);
  seedFreshSuccess(client, QUERY_KEYS.solarFlux);
  seedStaleSuccess(client, QUERY_KEYS.magnetometer, 10 * MINUTE);
  seedInFlightQuery(client, QUERY_KEYS.probabilities);
}

describe("SystemHealthPage status colours (#802)", () => {
  it("applies the errored-arc glow only to the danger-token segment, keyed on status not colour", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await seedAllStates(client);

    const { getByTestId } = renderPageWithClient(client);

    const arcSvg = getByTestId("status-arc");
    const circles = Array.from(arcSvg.querySelectorAll("circle"));
    // Background track plus all five status segments (healthy, degraded,
    // error, loading, idle), each seeded above to be non-zero.
    expect(circles.length).toBe(6);

    const dangerArc = circles.find(
      (c) => c.getAttribute("stroke") === "rgb(var(--su-danger-rgb))",
    );
    expect(
      dangerArc,
      "no arc rendered with the danger token stroke",
    ).not.toBeUndefined();
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

  it("donut segments and the architecture diagram lineColor are station RGB tokens, never a hex literal", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await seedAllStates(client);

    const { getByTestId, container } = renderPageWithClient(client);

    const arcSvg = getByTestId("status-arc");
    const arcStrokes = Array.from(arcSvg.querySelectorAll("circle")).map(
      (c) => c.getAttribute("stroke") ?? "",
    );
    expect(arcStrokes.length).toBe(6);
    for (const stroke of arcStrokes) {
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toMatch(STATION_RGB_TOKEN);
    }
    // All five segment kinds must be present and resolve to their token.
    expect(arcStrokes).toContain("rgb(var(--su-success-rgb))"); // healthy
    expect(arcStrokes).toContain("rgb(var(--su-warning-rgb))"); // degraded
    expect(arcStrokes).toContain("rgb(var(--su-danger-rgb))"); // error
    expect(arcStrokes).toContain("rgb(var(--su-muted-rgb))"); // loading
    expect(arcStrokes).toContain("rgb(var(--su-muted-rgb) / 0.75)"); // idle

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

  it("architecture diagram lineColor resolves to the success token when no service is degraded or errored", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedFreshSuccess(client, QUERY_KEYS.kIndex);
    seedFreshSuccess(client, QUERY_KEYS.solarFlux);
    seedFreshSuccess(client, QUERY_KEYS.magnetometer);
    seedFreshSuccess(client, QUERY_KEYS.probabilities);
    seedFreshSuccess(client, QUERY_KEYS.sunspots);

    const { container } = renderPageWithClient(client);

    const diagram = container.querySelector('svg[role="img"]');
    const connectionLines = Array.from(
      diagram!.querySelectorAll("line[stroke]"),
    );
    expect(connectionLines.length).toBeGreaterThan(0);
    expect(connectionLines[0].getAttribute("stroke")).toBe(
      "rgb(var(--su-success-rgb))",
    );
  });

  it("architecture diagram lineColor resolves to the warning token when a service is degraded and none are errored", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedStaleSuccess(client, QUERY_KEYS.magnetometer, 10 * MINUTE);

    const { container } = renderPageWithClient(client);

    const diagram = container.querySelector('svg[role="img"]');
    const connectionLines = Array.from(
      diagram!.querySelectorAll("line[stroke]"),
    );
    expect(connectionLines.length).toBeGreaterThan(0);
    expect(connectionLines[0].getAttribute("stroke")).toBe(
      "rgb(var(--su-warning-rgb))",
    );
  });
});
