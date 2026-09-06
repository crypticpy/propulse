import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.removeItem("propulse-layout-mode");
  localStorage.removeItem("propulse-pro-panel-layout");
  localStorage.removeItem("propulse-dock-groups");
});

describe("Pro layout persistence", () => {
  it("restores Pro after refresh and persists an explicit exit", async () => {
    localStorage.setItem("propulse-layout-mode", "pro");
    const { useMapStore } = await import("./mapStore");
    expect(useMapStore.getState()).toMatchObject({
      layoutMode: "pro",
      isFullscreen: true,
    });
    useMapStore.getState().setFullscreen(false);
    expect(localStorage.getItem("propulse-layout-mode")).toBe("normal");
  });

  it("replaces malformed panel entries and dock groups", async () => {
    localStorage.setItem(
      "propulse-pro-panel-layout",
      JSON.stringify({
        "band-conditions": null,
        "path-analysis": { x: "bad", y: 120, width: -1, height: null },
      }),
    );
    localStorage.setItem(
      "propulse-dock-groups",
      JSON.stringify([null, {}, { panelIds: null }]),
    );
    const { useMapStore } = await import("./mapStore");
    expect(useMapStore.getState().proPanelLayout["band-conditions"]).toMatchObject(
      { width: 256, height: 400 },
    );
    expect(useMapStore.getState().proPanelLayout["path-analysis"]).toMatchObject(
      { y: 120, width: 288, height: 400 },
    );
    expect(useMapStore.getState().dockGroups).toEqual([]);
  });

  it("migrates legacy percentage-like panel coordinates", async () => {
    localStorage.setItem(
      "propulse-pro-panel-layout",
      JSON.stringify({
        "band-conditions": {
          x: 1,
          y: 8,
          width: 256,
          height: 400,
          collapsed: false,
        },
      }),
    );
    const { useMapStore } = await import("./mapStore");
    expect(useMapStore.getState().proPanelLayout["band-conditions"].x).toBe(
      Math.round(window.innerWidth * 0.01),
    );
  });

  it("fits restored dock groups inside the viewport", async () => {
    localStorage.setItem(
      "propulse-dock-groups",
      JSON.stringify([
        {
          id: "group",
          orientation: "vertical",
          panelIds: ["band-conditions", "path-analysis"],
          sharedX: window.innerWidth + 500,
          sharedWidth: window.innerWidth + 500,
        },
      ]),
    );
    const { useMapStore } = await import("./mapStore");
    expect(useMapStore.getState().dockGroups[0]).toMatchObject({
      sharedX: 4,
      sharedWidth: window.innerWidth - 4,
    });
  });

  it("clears persisted docking when panel positions reset", async () => {
    const { useMapStore } = await import("./mapStore");
    useMapStore.getState().setDockGroups([
      {
        id: "group",
        orientation: "vertical",
        panelIds: ["band-conditions", "path-analysis"],
        sharedX: 20,
        sharedWidth: 300,
      },
    ]);
    useMapStore.getState().resetProPanelLayout();
    expect(useMapStore.getState().dockGroups).toEqual([]);
    expect(JSON.parse(localStorage.getItem("propulse-dock-groups")!)).toEqual([]);
  });
});
