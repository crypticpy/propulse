import { afterEach, expect, it, vi } from "vitest";
import { estimateMUF } from "@/lib/api/muf";
import { FlatMufRaster } from "./flatMufRaster";

vi.mock("@/lib/api/muf", () => ({
  estimateMUF: vi.fn(() => 18),
  getMUFColor: () => ({ color: "#abcdef" }),
}));
afterEach(() => vi.restoreAllMocks());

it("reuses geographic calculations through zoom/tile updates, invalidating on flux or minute changes", () => {
  const fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ fillRect }) as never,
  );
  const cache = new FlatMufRaster();
  const start = new Date("2026-09-04T12:00:00Z");
  const canvas = cache.get(120, start, 2000, 1000);
  expect(estimateMUF).toHaveBeenCalledTimes(648);
  for (let i = 0; i < 30; i++)
    expect(cache.get(120, new Date(+start + i * 1000), 2000, 1000)).toBe(
      canvas,
    );
  expect(estimateMUF).toHaveBeenCalledTimes(648);
  expect(fillRect).toHaveBeenCalledTimes(648);
  cache.get(120, start, 4000, 2000);
  expect(estimateMUF).toHaveBeenCalledTimes(648);
  expect(fillRect).toHaveBeenCalledTimes(1296);
  cache.get(121, start, 4000, 2000);
  cache.get(121, new Date(+start + 60000), 4000, 2000);
  expect(estimateMUF).toHaveBeenCalledTimes(1944);
});
