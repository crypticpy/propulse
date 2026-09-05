import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useHamClockWidgetConfigStore,
  useWidgetConfig,
} from "@/stores/hamclockWidgetConfigStore";
import { RecentContactsConfigPanel } from "./RecentContactsConfigPanel";
import {
  RECENT_CONTACTS_CONFIG_DEFAULTS,
  recentContactsConfig,
  type RecentContactsConfig,
} from "./recentContactsConfig";

describe("RecentContactsConfigPanel", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-hamclock-widget-config");
    useHamClockWidgetConfigStore.setState({ widgets: {} });
  });

  it("marks the current row count as the selected segment", () => {
    render(
      <RecentContactsConfigPanel value={{ rowCount: 3 }} onChange={() => {}} />,
    );
    expect(
      screen
        .getByRole("radio", { name: "3 ROWS" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "4 ROWS" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("reports the chosen row count as a number", () => {
    let value: RecentContactsConfig = { rowCount: 4 };
    render(
      <RecentContactsConfigPanel
        value={value}
        onChange={(next) => {
          value = next;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "2 ROWS" }));
    expect(value).toEqual({ rowCount: 2 });
  });

  it("persists a value written through useWidgetConfig", () => {
    const { result } = renderHook(() =>
      useWidgetConfig("recentContacts", recentContactsConfig),
    );
    expect(result.current[0]).toEqual(RECENT_CONTACTS_CONFIG_DEFAULTS);

    act(() => {
      result.current[1]({ rowCount: 2 });
    });
    expect(result.current[0]).toEqual({ rowCount: 2 });
    expect(
      useHamClockWidgetConfigStore.getState().widgets.recentContacts,
    ).toEqual({
      rowCount: 2,
    });
  });

  it("rejects an invalid row count and leaves the stored value unchanged", () => {
    const { result } = renderHook(() =>
      useWidgetConfig("recentContacts", recentContactsConfig),
    );
    act(() => {
      result.current[1]({ rowCount: 2 });
    });

    act(() => {
      // 99 is outside the 2 | 3 | 4 union the schema enforces; the cast only
      // simulates a stale/tampered persisted value reaching the setter.
      result.current[1]({ rowCount: 99 } as unknown as RecentContactsConfig);
    });

    expect(result.current[0]).toEqual({ rowCount: 2 });
    expect(
      useHamClockWidgetConfigStore.getState().widgets.recentContacts,
    ).toEqual({
      rowCount: 2,
    });
  });
});
