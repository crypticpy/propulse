import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  registerWidgetConfig,
  useHamClockWidgetConfigStore,
  useWidgetConfig,
  type WidgetConfig,
} from "./hamclockWidgetConfigStore";

const schema = z.object({ intervalMin: z.number().int().positive() });
type TestConfig = z.infer<typeof schema>;

function ConfigPanel({
  value,
}: {
  value: TestConfig;
  onChange: (next: TestConfig) => void;
}): null {
  void value;
  return null;
}

const config: WidgetConfig<TestConfig> = {
  schema,
  defaults: { intervalMin: 30 },
  ConfigPanel,
};

describe("hamclockWidgetConfigStore", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-hamclock-widget-config");
    useHamClockWidgetConfigStore.setState({ widgets: {} });
  });

  it("registerWidgetConfig preserves the schema, defaults and panel by reference", () => {
    const registered = registerWidgetConfig(config);
    expect(registered.schema).toBe(config.schema);
    expect(registered.defaults).toBe(config.defaults);
    expect(registered.ConfigPanel).toBe(config.ConfigPanel);
  });

  it("useWidgetConfig returns defaults when nothing is stored", () => {
    const { result } = renderHook(() => useWidgetConfig("news", config));
    expect(result.current[0]).toEqual({ intervalMin: 30 });
  });

  it("round-trips a value written through the setter", () => {
    const { result } = renderHook(() => useWidgetConfig("news", config));
    act(() => {
      result.current[1]({ intervalMin: 15 });
    });
    expect(result.current[0]).toEqual({ intervalMin: 15 });
    expect(useHamClockWidgetConfigStore.getState().widgets.news).toEqual({
      intervalMin: 15,
    });
  });

  it("falls back to defaults when the stored shape is stale", () => {
    useHamClockWidgetConfigStore.setState({
      widgets: { news: { intervalMin: "not a number" } },
    });
    const { result } = renderHook(() => useWidgetConfig("news", config));
    expect(result.current[0]).toEqual({ intervalMin: 30 });
  });

  it("resetWidgetConfig clears a stored value back to defaults", () => {
    useHamClockWidgetConfigStore.setState({
      widgets: { news: { intervalMin: 60 } },
    });
    act(() => {
      useHamClockWidgetConfigStore.getState().resetWidgetConfig("news");
    });
    expect(useHamClockWidgetConfigStore.getState().widgets.news).toBeUndefined();
    const { result } = renderHook(() => useWidgetConfig("news", config));
    expect(result.current[0]).toEqual({ intervalMin: 30 });
  });

  it("the setter rejects an invalid value and leaves state unchanged", () => {
    const { result } = renderHook(() => useWidgetConfig("news", config));
    act(() => {
      result.current[1]({ intervalMin: -5 });
    });
    expect(result.current[0]).toEqual({ intervalMin: 30 });
    expect(useHamClockWidgetConfigStore.getState().widgets.news).toBeUndefined();
  });
});
