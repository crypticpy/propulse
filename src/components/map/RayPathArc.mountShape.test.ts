/**
 * Ray-path inspector mount contract (#872).
 *
 * `PathPointInspector` must render outside drei's `<Html>` (and outside the
 * r3f `<Canvas>` tree) so React context from `MapSurface` reaches it. The
 * in-scene arc publishes inspector state; `RayPathInspectorOverlay` in
 * `GlobeView` renders the card into `mapOverlayPortal`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const RAY_PATH_ARC_SOURCE_PATH = resolve(
  REPO_ROOT,
  "src/components/map/RayPathArc.tsx",
);
const GLOBE_VIEW_SOURCE_PATH = resolve(
  REPO_ROOT,
  "src/components/map/GlobeView.tsx",
);

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("RayPathArc PathPointInspector mount shape (#872)", () => {
  it("does not mount PathPointInspector or drei Html inside RayPathArc", () => {
    const source = readSource(RAY_PATH_ARC_SOURCE_PATH);
    expect(source).not.toMatch(/<PathPointInspector\b/);
    expect(source).not.toContain("<Html");
  });

  it("publishes inspector snapshots through rayPathInspectorStore", () => {
    const source = readSource(RAY_PATH_ARC_SOURCE_PATH);
    expect(source).toContain("useRayPathInspectorStore");
    expect(source).toContain("publish");
  });

  it("renders RayPathInspectorOverlay outside Canvas in GlobeView", () => {
    const source = readSource(GLOBE_VIEW_SOURCE_PATH);
    expect(source).toContain("RayPathInspectorOverlay");
    expect(source).toMatch(
      /<RayPathInspectorOverlay portalTarget=\{mapOverlayPortal\}/,
    );
  });
});

/**
 * F1 (#853 fix round): RayPathArc's `portalTarget` prop only fixes the
 * containing-block math if GlobeView actually hands it a real DOM node.
 */
describe("GlobeView passes mapOverlayPortal to RayPathArc (#853)", () => {
  it("passes mapOverlayPortal as portalTarget to RayPathArc", () => {
    const source = readSource(GLOBE_VIEW_SOURCE_PATH);
    expect(source).toMatch(/portalTarget=\{mapOverlayPortal\}/);
  });
});
