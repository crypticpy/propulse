import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapHazardData } from "./useMapHazardData";

const mocks = vi.hoisted(() => ({
  earthquakes: vi.fn(),
  weather: vi.fn(),
  lightning: vi.fn(),
  fires: vi.fn(),
}));

vi.mock("@/hooks/useEarthquakes", () => ({ useEarthquakes: mocks.earthquakes }));
vi.mock("@/hooks/useWeatherAlerts", () => ({ useWeatherAlerts: mocks.weather }));
vi.mock("@/hooks/useLightning", () => ({ useLightning: mocks.lightning }));
vi.mock("@/hooks/useFires", () => ({ useFires: mocks.fires }));

describe("useMapHazardData", () => {
  beforeEach(() => {
    mocks.earthquakes.mockReturnValue({ earthquakes: ["quake"] });
    mocks.weather.mockReturnValue({ alerts: ["alert"] });
    mocks.lightning.mockReturnValue({ strikes: ["strike"] });
    mocks.fires.mockReturnValue({ hotspots: ["fire"] });
  });

  it("routes each shared layer toggle to its owning data hook", () => {
    const { result } = renderHook(() =>
      useMapHazardData({
        earthquakes: true,
        weather: false,
        lightning: true,
        fires: false,
      }),
    );

    expect(mocks.earthquakes).toHaveBeenCalledWith(true);
    expect(mocks.weather).toHaveBeenCalledWith(false);
    expect(mocks.lightning).toHaveBeenCalledWith(true);
    expect(mocks.fires).toHaveBeenCalledWith(false);
    expect(result.current).toEqual({
      earthquakeData: ["quake"],
      weatherAlerts: ["alert"],
      lightningStrikes: ["strike"],
      fireHotspots: ["fire"],
    });
  });
});
