import { describe, expect, it } from "vitest";
import type { KioskScene } from "@/stores/kioskStore";
import {
  buildDisplaySceneConfig,
  mergeDisplaySceneOptions,
} from "./displayAssignment";

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
        scenesChanged: true,
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
        scenesChanged: true,
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
      scenesChanged: true,
      rotationEnabled: true,
      intervalSec: Number.NaN,
      layoutFit: "auto",
      wallTextScale: "",
    });
    const highConfig = buildDisplaySceneConfig(null, [enabledScene], {
      selectedIds: new Set(["enabled"]),
      scenesChanged: true,
      rotationEnabled: true,
      intervalSec: 999_999,
      layoutFit: "auto",
      wallTextScale: "",
    });

    expect(nanConfig.rotation?.intervalSec).toBe(120);
    expect(highConfig.rotation?.intervalSec).toBe(3600);
  });

  it("preserves and exposes remote-only scene snapshots on unrelated saves", () => {
    const remoteOnly: KioskScene = {
      id: "remote-only",
      name: "Remote Observatory",
      route: "/map",
      enabled: true,
      map: { layoutMode: "pro", viewMode: "globe", quality: "uhd" },
    };
    const existing = { scenes: [remoteOnly] };
    const options = mergeDisplaySceneOptions([enabledScene], existing);

    expect(options.map((scene) => scene.id)).toEqual([
      "enabled",
      "remote-only",
    ]);

    const unchanged = buildDisplaySceneConfig(existing, options, {
      selectedIds: new Set(["remote-only"]),
      scenesChanged: false,
      rotationEnabled: false,
      intervalSec: 90,
      layoutFit: "full",
      wallTextScale: "xl",
    });
    expect(unchanged.scenes).toEqual([remoteOnly]);

    const intentionallyCleared = buildDisplaySceneConfig(existing, options, {
      selectedIds: new Set(),
      scenesChanged: true,
      rotationEnabled: false,
      intervalSec: 90,
      layoutFit: "full",
      wallTextScale: "xl",
    });
    expect(intentionallyCleared.scenes).toEqual([]);
  });
});
