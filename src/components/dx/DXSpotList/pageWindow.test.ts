import { expect, it } from "vitest";
import { spotPageWindow } from "./pageWindow";
it("anchors the next page to the first unseen row despite changed row heights", () => {
  const first = spotPageWindow(80, 10, 0, -1);
  const next = spotPageWindow(80, 6, first.end, -1);
  expect(next).toEqual({ start: 10, end: 16 });
  expect(spotPageWindow(80, 12, next.end, -1)).toEqual({ start: 16, end: 28 });
});
it("keeps current-page focus visible and handles Home, End and shrinking results", () => {
  expect(spotPageWindow(80, 10, 20, 20)).toEqual({ start: 20, end: 30 });
  expect(spotPageWindow(80, 10, 20, 0)).toEqual({ start: 0, end: 10 });
  expect(spotPageWindow(80, 10, 20, 79)).toEqual({ start: 70, end: 80 });
  expect(spotPageWindow(3, 10, 20, -1)).toEqual({ start: 2, end: 3 });
  expect(spotPageWindow(0, 10, 20, -1)).toEqual({ start: 0, end: 0 });
});
