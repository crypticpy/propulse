import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetShell } from "./WidgetShell";
import { SolarDisclosure } from "./SolarDisclosure";
import { SolarBriefingNotice } from "./SolarBriefingNotice";
import { SolarOperatingActions } from "./SolarOperatingActions";
import { SolarImageCard } from "./SolarImageCard";
import { SolarImageDetail } from "./SolarImageDetail";
import { SolarMiniChart } from "./SolarMiniChart";
import { SolarSeriesChart } from "./SolarSeriesChart";
import { BandConditionsModal } from "./modals/BandConditionsModal";
import type { SolarBriefing } from "@/lib/solar/briefing";

/**
 * DS-03: proves the su- token retheme (colour only) leaves the DOM structure
 * of the migrated Solar Pulse surfaces unchanged. Generated from the
 * pre-migration component code, then re-run unchanged after the colours were
 * swapped to the su- tokens; a structural diff (added/removed elements,
 * changed geometry or accessibility attributes) fails this test.
 *
 * Only the colour carriers are normalised away, because their *values* are
 * expected to differ: `class`, inline `style`, and the SVG paint attributes
 * (`fill`, `stroke`, `color`, `stop-color`). Everything that describes shape,
 * emphasis or semantics — `d`, `x`/`y`, `viewBox`, `stroke-width`,
 * `stroke-dasharray`, `fill-opacity`, `role`, `aria-*` — is compared.
 */
function structure(html: string): string {
  return html
    .replace(/\s(?:class|style|fill|stroke|color|stop-color)="[^"]*"/g, "")
    .replace(/\s(?:class|style|fill|stroke|color|stop-color)='[^']*'/g, "");
}

/** Lets a mocked fetch and the state it drives settle under fake timers. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function stubImageMetadata() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          observedAt: "2026-09-05T12:28:00.000Z",
          checkedAt: "2026-09-05T12:28:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
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
    {
      id: "s1",
      kind: "impact",
      text: "Kp reached 5 in the last interval.",
      sources: ["noaa-k-index"],
    },
    {
      id: "s2",
      kind: "background",
      text: "Solar flux remains moderate.",
      sources: ["noaa-solar-flux"],
    },
  ],
  state: "fresh",
  missing: [],
  delayed: ["Solar flux"],
  evidence: [
    {
      sourceId: "noaa-k-index",
      label: "Planetary Kp",
      observedAt: "2026-09-05T12:00:00Z",
      state: "fresh",
      sourceUrl: "https://example.test/kp",
    },
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
    vi.unstubAllGlobals();
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

  it("WidgetShell: stale reason below the retained reading", () => {
    const { container, queryByRole } = render(
      <WidgetShell title="Solar flux" state="stale" onRetry={() => {}}>
        <p>—</p>
      </WidgetShell>,
    );
    // `showFallback` is only reached from loading/error/unavailable, so a
    // stale widget keeps its last reading and states the reason underneath
    // it (DS-04 moved that line out of the flow above the reading).
    expect(queryByRole("button", { name: "Try again" })).toBeNull();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("WidgetShell: error fallback with the retry control", () => {
    const { container, getByRole } = render(
      <WidgetShell
        title="Solar flux"
        state="error"
        hasData={false}
        onRetry={() => {}}
      >
        <p>—</p>
      </WidgetShell>,
    );
    expect(getByRole("button", { name: "Try again" })).toBeTruthy();
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
      <SolarDisclosure
        id="details"
        title="Details and history"
        summary="Explore solar history"
        open={false}
        onToggle={() => {}}
        accent="info"
      >
        <p>Body</p>
      </SolarDisclosure>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot("closed");
    rerender(
      <SolarDisclosure
        id="details"
        title="Details and history"
        summary="Explore solar history"
        open
        onToggle={() => {}}
        accent="info"
      >
        <p>Body</p>
      </SolarDisclosure>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot("open");
  });

  // DS-05 replaces the briefing card with a one-row notice, so this case is
  // renamed and re-recorded: the collapsed notice is the new above-the-fold
  // shape, and the inline expansion carries what the card used to print.
  it("SolarBriefingNotice: collapsed row and the inline briefing expansion", () => {
    const { container, getByRole } = render(
      <SolarBriefingNotice briefing={briefing} scales={undefined} kp={4.3}>
        <p>Actions</p>
      </SolarBriefingNotice>,
    );
    expect(structure(container.innerHTML)).toMatchSnapshot("collapsed");
    const toggle = getByRole("button", { name: "Read the briefing" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(structure(container.innerHTML)).toMatchSnapshot("expanded");
  });

  it("SolarOperatingActions: the full handoff nav", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/solar"]}>
        <SolarOperatingActions />
      </MemoryRouter>,
    );
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
    const toggle = getByRole("button", { name: /show values/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(getByRole("region", { name: "Planetary Kp values" })).toBeTruthy();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarImageCard: a freshly loaded image", async () => {
    stubImageMetadata();
    const { container, getByAltText, getByText } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={() => {}} />,
    );
    fireEvent.load(getByAltText(/full solar disk/i));
    await settle();
    expect(getByText("Current")).toBeTruthy();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("SolarImageDetail: a freshly loaded image with its observation time", async () => {
    stubImageMetadata();
    const { container, getByRole, getByText } = render(
      <SolarImageDetail productId="sunspot-hmi" />,
    );
    fireEvent.load(getByRole("img"));
    await settle();
    expect(getByText(/Image time/)).toBeTruthy();
    expect(structure(container.innerHTML)).toMatchSnapshot();
  });

  it("BandConditionsModal: the full band matrix", () => {
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
    // The "Local Time" readout formats in the runner's own zone and locale;
    // pin it so the structural snapshot is not machine-dependent.
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("02:30 PM");
    const { baseElement } = render(
      <BandConditionsModal
        isOpen
        onClose={() => {}}
        kIndex={3}
        solarFlux={150}
      />,
    );
    // AccessibleDialog portals to document.body, outside the render container.
    expect(structure(baseElement.innerHTML)).toMatchSnapshot();
  });
});
