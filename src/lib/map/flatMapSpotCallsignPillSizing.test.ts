import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { screenPxToCanvas } from "./projection";

// Execute the actual renderer declarations, excluding the React page and feeds.
// Geometry/color dependencies are stubs; font, padding and paint calls are real.
const source = readFileSync("src/components/map/FlatMapView.tsx", "utf8");
const ast = ts.createSourceFile("FlatMapView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function renderer(name: string) {
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing production renderer ${name}`);
  const javascript = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = {
    screenPxToCanvas,
    latLonToCanvas: () => ({ x: 500, y: 250 }),
    flatSpotPath: () => [{ x: 0, y: 0 }],
    traceFlatSpotPath: () => {},
    traceFlatSpotEndpoint: () => {},
    getSpotColor: () => "white",
    getBandColor: () => "white",
    getLabelCandidates: (x: number, y: number, w: number, h: number, gap: number) => [{ bbox: { x, y: y - h - gap, w, h }, anchorSide: "above" }],
    countOverlaps: () => 0,
    getConnectorAnchor: () => ({ x: 500, y: 250 }),
    drawPillPath: () => {},
  };
  return new Function(...Object.keys(deps), `${javascript}; return ${name};`)(...Object.values(deps));
}
function record(name: string, zoom: number) {
  const ctx = { font: "", save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), roundRect: vi.fn<(x: number, y: number, w: number, h: number, r: number) => void>(), fillRect: vi.fn<(x: number, y: number, w: number, h: number) => void>(), fillText: vi.fn(), measureText: (_text: string) => ({ width: Number(ctx.font.match(/[\d.]+/)?.[0]) * 4.2 }) };
  const spot = { callsign: "K0TEST", spotter: "W1AAA", frequency: 14074 };
  if (name === "drawSelectedSpotArc") renderer(name)(ctx, spot, 1024, 512, 1, zoom, 1);
  else renderer(name)(ctx, [spot], 1024, 512, "mode", false, 1, zoom);
  const font = Number(ctx.font.match(/[\d.]+/)?.[0]);
  const width = name === "drawSelectedSpotArc" ? ctx.roundRect.mock.calls[0][2] : ctx.fillRect.mock.calls[0][2];
  return { font: font * zoom, width: Number(width) * zoom, ratio: Number(width) / (font * 4.2) };
}
describe("production flat-map spot label sizing", () => {
  for (const name of ["drawCallsignLabels", "drawSpotterLabels", "drawSelectedSpotArc"]) {
    it(`${name} keeps painted width and font stable through high zoom`, () => {
      const reference = record(name, 1);
      for (const zoom of [8, 32, 64]) {
        const actual = record(name, zoom);
        expect(actual.font).toBeCloseTo(reference.font, 6);
        expect(actual.width).toBeCloseTo(reference.width, 6);
        expect(actual.ratio).toBeCloseTo(reference.ratio, 6);
      }
    });
  }
  it("floors in screen space and preserves sub-unity flat-map behavior", () => {
    expect(screenPxToCanvas(0.25, 32)).toBe(1 / 32);
    expect(screenPxToCanvas(8, 0.5)).toBe(8);
  });
});
