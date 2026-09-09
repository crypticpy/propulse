import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  countdownAllowed,
  launchPad,
  launchProvider,
  launchTimingLabel,
  netDateLabel,
  parseLaunchesPayload,
  pickNextLaunch,
  type LaunchRecord,
  useLaunches,
} from "./useLaunches";

function launch(overrides: Partial<LaunchRecord> = {}): LaunchRecord {
  return {
    id: "1",
    name: "Falcon 9 | Starlink",
    provider: "SpaceX",
    providerAbbrev: "SpX",
    pad: "SLC-40",
    location: "Cape Canaveral, FL, USA",
    net: "2026-09-10T09:00:00.000Z",
    windowStart: null,
    windowEnd: null,
    status: "Go",
    statusName: "Go for Launch",
    precision: "hour",
    webcastLive: false,
    sourceUpdatedAt: null,
    ...overrides,
  };
}

describe("countdownAllowed", () => {
  it("allows a Go launch with hour-or-finer precision", () => {
    expect(countdownAllowed(launch({ precision: "hour" }))).toBe(true);
    expect(countdownAllowed(launch({ precision: "minute" }))).toBe(true);
    expect(countdownAllowed(launch({ precision: "second" }))).toBe(true);
  });

  it("refuses TBD/TBC and coarse NET windows", () => {
    expect(countdownAllowed(launch({ status: "TBD", precision: "second" }))).toBe(
      false,
    );
    expect(countdownAllowed(launch({ status: "TBC", precision: "minute" }))).toBe(
      false,
    );
    expect(countdownAllowed(launch({ precision: "day" }))).toBe(false);
    expect(countdownAllowed(launch({ precision: "coarser" }))).toBe(false);
    expect(countdownAllowed(launch({ net: null, precision: "second" }))).toBe(
      false,
    );
  });
});

describe("launch labels", () => {
  it("prefers the provider abbrev and pad name", () => {
    expect(launchProvider(launch())).toBe("SpX");
    expect(launchPad(launch())).toBe("SLC-40");
    expect(launchProvider(launch({ providerAbbrev: "", provider: "NASA" }))).toBe(
      "NASA",
    );
    expect(launchPad(launch({ pad: "", location: "Kourou" }))).toBe(
      "Kourou",
    );
  });

  it("prints a UTC date without a year when NET is this year", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(netDateLabel("2026-09-10T09:00:00.000Z", now)).toBe("10 SEP");
  });
});

describe("launchTimingLabel and pickNextLaunch", () => {
  const now = new Date("2026-09-08T13:00:00Z");

  it("counts down before NET and uses T+ for a two-hour window after", () => {
    expect(
      launchTimingLabel(launch({ net: "2026-09-08T16:00:00.000Z", precision: "minute" }), now),
    ).toBe("T- 3h 0m");
    expect(
      launchTimingLabel(launch({ net: "2026-09-08T12:15:00.000Z", precision: "minute" }), now),
    ).toBe("T+ 45m");
  });

  it("falls through to the NET date once T+ is older than two hours", () => {
    expect(
      launchTimingLabel(launch({ net: "2026-09-08T10:00:00.000Z", precision: "minute" }), now),
    ).toBe("8 SEP");
  });

  it("skips a flown launch when picking next", () => {
    const flown = launch({ id: "old", net: "2026-09-08T10:00:00.000Z" });
    const upcoming = launch({ id: "next", net: "2026-09-08T16:00:00.000Z" });
    expect(pickNextLaunch([flown, upcoming], now)?.id).toBe("next");
  });

  it("does not keep LIVE once the webcast is outside the two-hour window", () => {
    const staleLive = launch({
      webcastLive: true,
      status: "In Flight",
      net: "2026-09-08T07:00:00.000Z",
      precision: "minute",
    });
    expect(launchTimingLabel(staleLive, now)).toBe("8 SEP");
    expect(pickNextLaunch([staleLive], now)).toBeNull();
  });
});

describe("parseLaunchesPayload", () => {
  it("rejects a non-object and a launches field that is not an array", () => {
    expect(parseLaunchesPayload(null).status).toBe("unavailable");
    expect(parseLaunchesPayload({ status: "ok", launches: "nope" }).launches).toEqual(
      [],
    );
  });

  it("drops malformed launch rows", () => {
    const parsed = parseLaunchesPayload({
      status: "ok",
      stale: false,
      retrievedAt: "2026-09-08T12:00:00.000Z",
      launches: [{ id: "1", name: "Ok" }, { id: "no-name" }, "x"],
    });
    expect(parsed.launches).toHaveLength(1);
    expect(parsed.launches[0].name).toBe("Ok");
  });
});

describe("useLaunches", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function wrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return {
      client,
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    };
  }

  it("exposes a fetch error when the proxy is down", async () => {
    vi.useRealTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 502 })),
    );
    const { wrapper: wrap, client } = wrapper();
    const hook = renderHook(() => useLaunches(), { wrapper: wrap });
    await waitFor(() => expect(hook.result.current.error).toBeTruthy(), {
      timeout: 4000,
    });
    expect(hook.result.current.launches).toEqual([]);
    hook.unmount();
    client.clear();
  });

  it("returns the parsed payload on HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            stale: false,
            retrievedAt: "2026-09-08T12:00:00.000Z",
            launches: [launch()],
          }),
        ),
      ),
    );
    const { wrapper: wrap, client } = wrapper();
    const hook = renderHook(() => useLaunches(), { wrapper: wrap });
    await waitFor(() => expect(hook.result.current.next?.id).toBe("1"));
    expect(hook.result.current.status).toBe("ok");
    hook.unmount();
    client.clear();
  });
});
