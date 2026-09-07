import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useSpotPage } from "./useSpotPage";
const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
const initial = { spots: rows, selected: undefined as string | undefined, size: 5 };
function setup(props = initial) {
  return renderHook(({ spots, selected, size }) => useSpotPage(spots, size, selected, true), { initialProps: props });
}
it("opens on the selected spot and follows later external selections", () => {
  const hook = setup({ ...initial, selected: "22" });
  expect(rows.slice(hook.result.current.start, hook.result.current.end).map(s => s.id)).toContain("22");
  hook.rerender({ ...initial, selected: "3" });
  expect(rows.slice(hook.result.current.start, hook.result.current.end).map(s => s.id)).toContain("3");
  act(() => hook.result.current.changePage(10));
  expect(hook.result.current.start).toBe(10);
});
it("preserves the later page and keyboard report when live spots are prepended", () => {
  const hook = setup();
  act(() => hook.result.current.changePage(10));
  act(() => hook.result.current.setFocusedIndex(12));
  const before = rows.slice(hook.result.current.start, hook.result.current.end).map(s => s.id);
  const incoming = [{ id: "new-a" }, { id: "new-b" }, ...rows];
  hook.rerender({ ...initial, spots: incoming });
  expect(incoming.slice(hook.result.current.start, hook.result.current.end).map(s => s.id)).toEqual(before);
  expect(incoming[hook.result.current.focusedIndex].id).toBe("12");
  act(() => hook.result.current.changePage(hook.result.current.end));
  expect(incoming[hook.result.current.start].id).toBe("15");
});
it("keeps the first page live and handles a removed anchor or smaller capacity", () => {
  const hook = setup();
  hook.rerender({ ...initial, spots: [{ id: "new" }, ...rows] });
  expect(hook.result.current.start).toBe(0);
  act(() => hook.result.current.changePage(10));
  hook.rerender({ ...initial, size: 3 });
  expect(rows[hook.result.current.start].id).toBe("9");
  hook.rerender({ ...initial, spots: rows.slice(25), size: 3 });
  expect(hook.result.current.start).toBeLessThan(5);
  expect(hook.result.current.end).toBeLessThanOrEqual(5);
});
it("keeps a selected report visible after capacity shrinks and clears missing keyboard identity", () => {
  const hook = setup({ ...initial, selected: "22" });
  hook.rerender({ ...initial, selected: "22", size: 2 });
  expect(rows.slice(hook.result.current.start, hook.result.current.end).map(s => s.id)).toContain("22");
  hook.rerender({ ...initial, spots: rows.filter(s => s.id !== "22"), selected: "22", size: 2 });
  expect(hook.result.current.focusedIndex).toBe(-1);
});
it("reveals a selection when asynchronously loaded rows arrive", () => {
  const hook = setup({ ...initial, spots: [], selected: "22" });
  hook.rerender({ ...initial, selected: "22" });
  expect(rows.slice(hook.result.current.start, hook.result.current.end).map(s => s.id)).toContain("22");
});
