import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetShell } from "./WidgetShell";
import { SolarDisclosure } from "./SolarDisclosure";
import { SolarBriefingCard } from "./SolarBriefingCard";
import { SolarImageCard } from "./SolarImageCard";
import { SolarMiniChart } from "./SolarMiniChart";
import { SolarSeriesChart } from "./SolarSeriesChart";
import { BandConditionsModal } from "./modals/BandConditionsModal";
import type { SolarBriefing } from "@/lib/solar/briefing";

/**
 * DS-03: proves the su- token retheme (colour classes only) leaves the DOM
 * structure of the migrated Solar Pulse surfaces unchanged. Generated from
 * the pre-migration component code, then re-run unchanged after the colour
 * classes were swapped to the su- tokens; a structural diff (added/removed
 * elements, changed non-class attributes) fails this test even though the
 * class *values* are expected to differ and are stripped before comparing.
 */
function structure(html: string): string {
  return html
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sclass='[^']*'/g, "");
}

vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveMode: () => "CW" }));
vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: () => ({
    location: { name: "Field site", grid: "EM10" },
    chain: { name: "Portable kit" },
  }),
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { target: null }) => unknown) =>
    selector({ target: null }),
}));

const briefing: SolarBriefing = {
  title: "Elevated geomagnetic activity may affect high-latitude paths",
  tone: "watch",
  statements: [
    { id: "s1", kind: "impact", text: "Kp reached 5 in the last interval.", sources: ["noaa-k-index"] },
    { id: "s2", kind: "background", text: "Solar flux remains moderate.", sources: ["noaa-solar-flux"] },
  ],
  state: "fresh",
  missing: [],
  delayed: ["Solar flux"],
  evidence: [
    { sourceId: "noaa-k-index", label: "Planetary Kp", observedAt: "2026-09-05T12:00:00Z", state: "fresh", sourceUrl: "https://example.test/kp" },
  ],
};

describe("Solar Pulse structural snapshot (DS-03 retheme)", () => {
  beforeEach(() => {
    // `vi.spyOn(Date, "now")` does not freeze `new Date()` (the engine's
    // native constructor doesn't call back through the spied JS function),
    // which let BandConditionsModal's real-clock "Local Time" text drift
    // between snapshot generation and re-runs. Fake timers freeze both.
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-05T12:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("WidgetShell: fresh state with an eyebrow, timestamp, and action", () => {
    const { container } = render(
      <WidgetShell
        title="Planetary Kp"
        eyebrow="3-hour observed"
        state="fresh"
        observedAt="2026-09-05T12:00:00Z"
        provider="NOAA SWPC"
        sourceUrl="https://example.test"
        action={<button type="button">Explain</button>}
      >
        <p>3.2</p>
      </WidgetShell>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("WidgetShell: stale state fallback with retry", () => {
    const { container } = render(
      <WidgetShell title="Solar flux" state="stale" hasData={false} onRetry={() => {}}>
        <p>—</p>
      </WidgetShell>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("WidgetShell: loading state", () => {
    const { container } = render(
      <WidgetShell title="IMF Bz" state="loading" hasData={false}>
        <p>—</p>
      </WidgetShell>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarDisclosure: closed and open", () => {
    const { container, rerender } = render(
      <SolarDisclosure id="details" title="Details and history" summary="Explore solar history" open={false} onToggle={() => {}}>
        <p>Body</p>
      </SolarDisclosure>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot("closed");
    rerender(
      <SolarDisclosure id="details" title="Details and history" summary="Explore solar history" open onToggle={() => {}}>
        <p>Body</p>
      </SolarDisclosure>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot("open");
  });

  it("SolarBriefingCard: impact tone with evidence open", () => {
    const { container, getByRole } = render(
      <SolarBriefingCard briefing={briefing} scales={undefined}>
        <p>Actions</p>
      </SolarBriefingCard>,
    );
    getByRole("button", { name: /Sources & times/i }).click();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarMiniChart: an observed series with a Kp storm threshold", () => {
    const { container } = render(
      <SolarMiniChart
        label="Recent Kp intervals"
        unit="Kp"
        min={0}
        max={9}
        intervalMs={10_800_000}
        maxGapMs={10_800_000}
        points={[
          { timestamp: "2026-09-05T09:00:00Z", value: 3, kind: "observed" },
          { timestamp: "2026-09-05T12:00:00Z", value: 5, kind: "observed" },
        ]}
      />,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarSeriesChart: observed and predicted points with a threshold and the values table open", () => {
    const { container, getByRole } = render(
      <SolarSeriesChart
        label="Planetary Kp"
        unit="Kp"
        min={0}
        max={9}
        thresholds={[{ value: 5, label: "Storm range" }]}
        now={Date.parse("2026-09-05T12:30:00Z")}
        points={[
          { timestamp: "2026-09-05T09:00:00Z", value: 3, kind: "observed" },
          { timestamp: "2026-09-05T15:00:00Z", value: 5, kind: "predicted" },
        ]}
      />,
    );
    getByRole("button", { name: /show values/i }).click();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarImageCard: a freshly loaded image", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            observedAt: "2026-09-05T12:00:00.000Z",
            checkedAt: "2026-09-05T12:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const { container, getByAltText } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={() => {}} />,
    );
    getByAltText(/full solar disk/i).dispatchEvent(new Event("load"));
    expect(structure(container.innerHTML)).toMatchSnapshot();
    vi.unstubAllGlobals();
  });

  it("BandConditionsModal: the full band matrix", () => {
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
    const { baseElement } = render(
      <BandConditionsModal isOpen onClose={() => {}} kIndex={3} solarFlux={150} />,
    );
    // AccessibleDialog portals to document.body, outside the render container.
    expect(structure(baseElement.innerHTML)).toMatchSnapshot();
  });
});
