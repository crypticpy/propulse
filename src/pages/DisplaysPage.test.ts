import { describe, expect, it } from "vitest";
import type { KioskScene } from "@/stores/kioskStore";
import { buildDisplaySceneConfig } from "./displayAssignment";

const enabledScene: KioskScene = {
  id: "enabled",
  name: "Enabled scene",
  route: "/map",
  enabled: true,
  map: { layoutMode: "pro", viewMode: "globe" },
};

const disabledScene: KioskScene = {
  id: "disabled",
  name: "Disabled scene",
  route: "/solar",
  enabled: false,
};

describe("buildDisplaySceneConfig", () => {
  it("serializes an explicit empty scene list when the assignment is cleared", () => {
    const config = buildDisplaySceneConfig(
      {
        scenes: [enabledScene],
        breakInLevel: "WARNING",
      },
      [enabledScene, disabledScene],
      {
        selectedIds: new Set(),
        rotationEnabled: true,
        intervalSec: 90,
        layoutFit: "auto",
        wallTextScale: "",
      },
    );

    expect(config.scenes).toEqual([]);
    expect(config.breakInLevel).toBe("WARNING");
    expect(config.layout).toEqual({ fit: "auto" });
  });

  it("never assigns a disabled scene even when its stale id is selected", () => {
    const config = buildDisplaySceneConfig(
      null,
      [enabledScene, disabledScene],
      {
        selectedIds: new Set(["enabled", "disabled"]),
        rotationEnabled: false,
        intervalSec: 120,
        layoutFit: "full",
        wallTextScale: "xl",
      },
    );

    expect(config.scenes).toEqual([enabledScene]);
    expect(config.rotation).toEqual({ enabled: false, intervalSec: 120 });
    expect(config.layout).toEqual({ fit: "full", textScale: "xl" });
  });

  it("bounds malformed rotation intervals before saving remote JSON", () => {
    const nanConfig = buildDisplaySceneConfig(null, [enabledScene], {
      selectedIds: new Set(["enabled"]),
      rotationEnabled: true,
      intervalSec: Number.NaN,
      layoutFit: "auto",
      wallTextScale: "",
    });
    const highConfig = buildDisplaySceneConfig(null, [enabledScene], {
      selectedIds: new Set(["enabled"]),
      rotationEnabled: true,
      intervalSec: 999_999,
      layoutFit: "auto",
      wallTextScale: "",
    });

    expect(nanConfig.rotation?.intervalSec).toBe(120);
    expect(highConfig.rotation?.intervalSec).toBe(3600);
  });
});
