import { describe, expect, it } from "vitest";
import { resolveConnectivityTier } from "@/hooks/useConnectivityTier";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";

describe("resolveConnectivityTier", () => {
  it("reports cloud for a hosted origin with network", () => {
    expect(
      resolveConnectivityTier(true, {
        port: "",
        hostname: "propulse.vercel.app",
      }),
    ).toBe("cloud");
  });

  it("reports lan when served from the bridge static port", () => {
    expect(
      resolveConnectivityTier(true, { port: "3173", hostname: "192.168.1.50" }),
    ).toBe("lan");
  });

  it("reports lan for an mDNS .local hostname", () => {
    expect(
      resolveConnectivityTier(true, { port: "80", hostname: "propulse.local" }),
    ).toBe("lan");
  });

  it("does not mistake the Vite dev server for the bridge", () => {
    expect(
      resolveConnectivityTier(true, { port: "5173", hostname: "localhost" }),
    ).toBe("cloud");
  });

  it("reports offline regardless of origin when there is no network", () => {
    expect(
      resolveConnectivityTier(false, { port: "3173", hostname: "propulse.local" }),
    ).toBe("offline");
  });
});

describe("dataSourceStatusStore.setConnectivity", () => {
  it("defaults to cloud and updates only on change", () => {
    const store = useDataSourceStatus.getState();
    expect(store.connectivity).toBe("cloud");

    store.setConnectivity("lan");
    expect(useDataSourceStatus.getState().connectivity).toBe("lan");

    const before = useDataSourceStatus.getState();
    before.setConnectivity("lan");
    expect(useDataSourceStatus.getState()).toBe(before);

    useDataSourceStatus.getState().setConnectivity("cloud");
    expect(useDataSourceStatus.getState().connectivity).toBe("cloud");
  });
});
