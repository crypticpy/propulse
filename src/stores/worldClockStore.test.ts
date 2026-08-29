import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { useWorldClockStore } from "./worldClockStore";
import { DEFAULT_WORLD_CLOCK_IDS } from "@/lib/data/worldCities";

const originalState = useWorldClockStore.getState();

describe("worldClockStore", () => {
  beforeEach(() => {
    useWorldClockStore.setState(originalState, true);
  });

  it("seeds the default city ids", () => {
    expect(useWorldClockStore.getState().cityIds).toEqual(
      DEFAULT_WORLD_CLOCK_IDS,
    );
  });

  it("addCity appends without duplicates and caps at 8", () => {
    useWorldClockStore.setState({ cityIds: ["a", "b", "c"] });
    useWorldClockStore.getState().addCity("d");
    expect(useWorldClockStore.getState().cityIds).toEqual(["a", "b", "c", "d"]);

    useWorldClockStore.getState().addCity("d");
    expect(useWorldClockStore.getState().cityIds).toEqual(["a", "b", "c", "d"]);

    useWorldClockStore.setState({
      cityIds: ["1", "2", "3", "4", "5", "6", "7", "8"],
    });
    useWorldClockStore.getState().addCity("9");
    expect(useWorldClockStore.getState().cityIds).toHaveLength(8);
  });

  it("removeCity removes the matching id", () => {
    useWorldClockStore.setState({ cityIds: ["a", "b", "c"] });
    useWorldClockStore.getState().removeCity("b");
    expect(useWorldClockStore.getState().cityIds).toEqual(["a", "c"]);
  });

  it("moveCity swaps with the neighbor and is a no-op at the boundary", () => {
    useWorldClockStore.setState({ cityIds: ["a", "b", "c"] });
    useWorldClockStore.getState().moveCity("b", -1);
    expect(useWorldClockStore.getState().cityIds).toEqual(["b", "a", "c"]);

    useWorldClockStore.getState().moveCity("b", -1);
    expect(useWorldClockStore.getState().cityIds).toEqual(["b", "a", "c"]);

    useWorldClockStore.getState().moveCity("c", 1);
    expect(useWorldClockStore.getState().cityIds).toEqual(["b", "a", "c"]);
  });
});
