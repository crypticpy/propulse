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

/**
 * Extracts a single self-closing (or simple) JSX element's opening tag,
 * starting at the Nth occurrence of `<tagName` in the file (1-indexed),
 * up to its own `/>` (not a descendant's -- ok here because both elements
 * this file inspects are self-closing with no JSX-element children).
 */
function readJsxOpenTag(
  source: string,
  tagName: string,
  occurrence = 1,
): string {
  let searchFrom = 0;
  let openIndex = -1;
  for (let i = 0; i < occurrence; i++) {
    openIndex = source.indexOf(`<${tagName}`, searchFrom);
    if (openIndex === -1) {
      throw new Error(
        `GlobeView.tsx: could not locate occurrence ${occurrence} of <${tagName}`,
      );
    }
    searchFrom = openIndex + tagName.length + 1;
  }
  const closeIndex = source.indexOf("/>", openIndex);
  if (closeIndex === -1) {
    throw new Error(
      `GlobeView.tsx: could not locate the closing /> for <${tagName}`,
    );
  }
  return source.slice(openIndex, closeIndex);
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

  it("publishes the closed state too, so the keyboard trigger stays mounted", () => {
    // `PathPointInspector` renders an always-available sr-only "Path points"
    // button and the in-scene hit areas are not DOM-focusable, so publishing
    // `null` while closed removed the only keyboard entry point (#872 review
    // round). The one state that publishes nothing is "this arc has no points
    // to inspect".
    const source = readSource(RAY_PATH_ARC_SOURCE_PATH);
    expect(source).not.toMatch(/if \(open === "closed"\)/);
    expect(source).toContain("pointSet.points.length === 0");
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

describe("GlobeView threads onOpenPathAnalysis into RayPathArc (#931)", () => {
  it("accepts onOpenPathAnalysis on GlobeViewProps and forwards it to GlobeScene", () => {
    const source = readFileSync(GLOBE_VIEW_SOURCE_PATH, "utf8");
    expect(source).toMatch(/onOpenPathAnalysis\?: \(\) => void;/);
    const sceneTag = readJsxOpenTag(source, "GlobeScene");
    expect(sceneTag).toMatch(/onOpenPathAnalysis=\{onOpenPathAnalysis\}/);
  });

  it("forwards onOpenPathAnalysis from GlobeScene to RayPathArc", () => {
    const source = readFileSync(GLOBE_VIEW_SOURCE_PATH, "utf8");
    const tag = readJsxOpenTag(source, "RayPathArc");
    expect(tag).toMatch(/onOpenPathAnalysis=\{onOpenPathAnalysis\}/);
  });
});
