import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { FIRE_CORE_COLOR, FIRE_GLOW_COLOR } from "./fire";
import {
  BEACON_COLOR_ACTIVE,
  BEACON_COLOR_INACTIVE,
  BEACON_GLOW_COLOR,
} from "./beacon";
import {
  LIGHTNING_COLOR_FLAT,
  LIGHTNING_COLOR_STRONG,
  LIGHTNING_COLOR_WEAK,
  LIGHTNING_STRONG_KA,
  getCanvasLightningCoreColor,
} from "./lightning";
import * as legacyLightning from "@/lib/map/lightningColors";
import { drawFiresLayer } from "@/components/map/layers/firesLayer";
import { drawLightningLayer } from "@/components/map/layers/lightningLayer";
import { FLAT_LAYER_PROFILE } from "@/lib/map/mapLayerProfile";
import type { Projection } from "@/lib/map/projection";

function recordingContext() {
  const fills: Array<{ color: unknown; alpha: number }> = [];
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {
      fills.push({ color: this.fillStyle, alpha: this.globalAlpha });
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, fills };
}
const projection = {
  project: () => ({ x: 0, y: 0, visible: true }),
  screenPx: (n: number) => n,
} as unknown as Projection;

describe("hazard and beacon palette boundaries", () => {
  it("retains distinct core, glow, and beacon state identities", () => {
    expect({ FIRE_CORE_COLOR, FIRE_GLOW_COLOR }).toEqual({
      FIRE_CORE_COLOR: "#ff2200",
      FIRE_GLOW_COLOR: "#ff6600",
    });
    expect({
      BEACON_COLOR_ACTIVE,
      BEACON_COLOR_INACTIVE,
      BEACON_GLOW_COLOR,
    }).toEqual({
      BEACON_COLOR_ACTIVE: "#00ff88",
      BEACON_COLOR_INACTIVE: "#f0c040",
      BEACON_GLOW_COLOR: "#aaffcc",
    });
    expect({ ...legacyLightning }).toEqual({
      LIGHTNING_COLOR_FLAT,
      LIGHTNING_COLOR_STRONG,
      LIGHTNING_COLOR_WEAK,
      LIGHTNING_STRONG_KA,
    });
    expect(LIGHTNING_COLOR_WEAK).toBe("#66ccff");
    expect(LIGHTNING_STRONG_KA).toBe(100);
  });

  it.each([
    [-Infinity, "#ffe566"],
    [-1, "#ffe566"],
    [0, "#ffe566"],
    [99.999, "#ffe566"],
    [100, "#ffe566"],
    [100.001, "#ffffff"],
    [101, "#ffffff"],
    [Infinity, "#ffffff"],
    [NaN, "#ffe566"],
  ])("keeps strict Canvas kA boundary for %s", (current, color) => {
    expect(getCanvasLightningCoreColor(current as number)).toBe(color);
    const { context, fills } = recordingContext();
    drawLightningLayer(
      context,
      [{ lat: 0, lon: 0, time: Date.now(), currentKA: current as number }],
      projection,
    );
    expect(fills.map((fill) => fill.color)).toEqual(["#ffe566", color]);
  });

  it("keeps Canvas fire confidence and separate alpha treatments", () => {
    for (const confidence of ["low", "l", "nominal", "high", "unexpected"]) {
      const { context, fills } = recordingContext();
      drawFiresLayer(
        context,
        [{ lat: 0, lon: 0, confidence, frp: 120, brightness: 300 }],
        projection,
        FLAT_LAYER_PROFILE,
      );
      expect(fills).toEqual(
        confidence === "low"
          ? []
          : [
              { color: "#ff6600", alpha: 0.2 },
              { color: "#ff2200", alpha: 0.7 },
            ],
      );
    }
  });

  it("keeps legacy renderer color exports pointed at the palette owner", () => {
    for (const [file, owner, names] of [
      [
        "src/components/map/FireOverlay3D.tsx",
        "@/lib/colors/palettes/fire",
        ["FIRE_GLOW_COLOR", "FIRE_CORE_COLOR"],
      ],
      [
        "src/components/map/layers/BeaconNetworkOverlay3D.tsx",
        "@/lib/colors/palettes/beacon",
        ["BEACON_COLOR_ACTIVE", "BEACON_COLOR_INACTIVE"],
      ],
    ] as const) {
      const parsed = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const exports = parsed.statements
        .filter(ts.isExportDeclaration)
        .filter(
          (node) =>
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text === owner,
        );
      const exported = exports.flatMap((node) =>
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map((element) => element.name.text)
          : [],
      );
      expect(exported).toEqual(expect.arrayContaining([...names]));
    }
  });

  it("keeps domain palettes dependency-free", () => {
    for (const name of ["fire", "lightning", "beacon"]) {
      const source = readFileSync(`src/lib/colors/palettes/${name}.ts`, "utf8");
      const parsed = ts.createSourceFile(
        name,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of parsed.statements) {
        if (ts.isImportDeclaration(statement))
          expect(statement.importClause?.isTypeOnly).toBe(true);
        if (ts.isExportDeclaration(statement))
          expect(statement.moduleSpecifier).toBeUndefined();
      }
    }
  });
});
