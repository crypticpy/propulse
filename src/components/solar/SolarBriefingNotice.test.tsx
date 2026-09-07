import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SolarBriefingNotice } from "./SolarBriefingNotice";
import { SolarOperatingActions } from "./SolarOperatingActions";
import type { SolarBriefing } from "@/lib/solar/briefing";

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

function renderNotice(overrides: Partial<SolarBriefing> = {}, kp?: number) {
  return render(
    <MemoryRouter initialEntries={["/solar"]}>
      <SolarBriefingNotice briefing={{ ...briefing, ...overrides }} scales={undefined} kp={kp}>
        <SolarOperatingActions />
      </SolarBriefingNotice>
    </MemoryRouter>,
  );
}

describe("SolarBriefingNotice", () => {
  it("shows only the headline, the official scales and the toggle when collapsed", () => {
    const { getByRole, getByText, queryByText } = renderNotice({}, 4.3);
    const notice = getByRole("region", { name: "HF briefing" });
    expect(within(notice).getByText(/Elevated geomagnetic activity/)).toBeTruthy();
    expect(getByText(/· Kp 4.3/)).toBeTruthy();
    const scales = getByRole("group", { name: "Official NOAA scales" });
    for (const code of ["R —", "S —", "G —"]) {
      expect(within(scales).getByText(code)).toBeTruthy();
    }
    expect(getByRole("button", { name: "Read the briefing" })).toBeTruthy();
    // DS-05: the statements, evidence and handoff actions stay out of the fold.
    expect(queryByText("Kp reached 5 in the last interval.")).toBeNull();
    expect(queryByText("Planetary Kp")).toBeNull();
    expect(queryByText("Inspect a path")).toBeNull();
  });

  it("omits the numeric tail when no Kp reading is supplied", () => {
    const { queryByText } = renderNotice();
    expect(queryByText(/· Kp /)).toBeNull();
  });

  it("reveals the statements, delayed sentence, sources and actions on expand", () => {
    const { getByRole, getByText } = renderNotice();
    fireEvent.click(getByRole("button", { name: "Read the briefing" }));
    expect(getByText("Kp reached 5 in the last interval.")).toBeTruthy();
    expect(getByText("Solar flux remains moderate.")).toBeTruthy();
    expect(getByText(/Updates are delayed for Solar flux/)).toBeTruthy();
    expect(getByText("Sources & times")).toBeTruthy();
    expect(getByRole("link", { name: "Planetary Kp" }).getAttribute("href")).toBe("https://example.test/kp");
    expect(getByText(/Global conditions describe the backdrop/)).toBeTruthy();
    for (const action of ["Inspect a path", "Find a band for a target", "Plan a session"]) {
      expect(getByRole("link", { name: action })).toBeTruthy();
    }
  });

  it("wires the toggle to the expansion and back", () => {
    const { getByRole, queryByRole } = renderNotice();
    const toggle = getByRole("button", { name: "Read the briefing" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("solar-briefing-detail");
    expect(document.getElementById("solar-briefing-detail")).toBeNull();

    fireEvent.click(toggle);
    const expanded = getByRole("button", { name: "Hide the briefing" });
    expect(expanded.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("solar-briefing-detail")).toBeTruthy();

    fireEvent.click(expanded);
    expect(queryByRole("button", { name: "Hide the briefing" })).toBeNull();
    expect(document.getElementById("solar-briefing-detail")).toBeNull();
  });

  it("shows the pending chip only while a source is delayed or missing", () => {
    const delayed = renderNotice();
    expect(delayed.getByRole("status").textContent).toContain("Updates pending · Solar flux delayed");
    delayed.unmount();

    const missing = renderNotice({ delayed: [], missing: ["Geomagnetic scale"] });
    expect(missing.getByRole("status").textContent).toContain("Updates pending · Geomagnetic scale unavailable");
    missing.unmount();

    const current = renderNotice({ delayed: [], missing: [] });
    expect(current.queryByRole("status")).toBeNull();
    current.unmount();

    // A briefing still loading reports that, not a delay it cannot yet know.
    const loading = renderNotice({ state: "loading", delayed: ["Solar flux"] });
    expect(loading.getByRole("status").textContent).toContain("Checking updates");
    expect(loading.queryByText(/Updates pending/)).toBeNull();
  });

  it("keeps the impact tone edge distinct from the watch tone", () => {
    const watch = renderNotice();
    expect(watch.getByRole("region", { name: "HF briefing" }).className).toContain("border-su-warning");
    watch.unmount();

    const impact = renderNotice({ tone: "impact" });
    expect(impact.getByRole("region", { name: "HF briefing" }).className).toContain("border-su-danger");
  });
});
