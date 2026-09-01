import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { useSettingsStore } from "@/stores/settingsStore";
import {
  getSeasonalTextureCandidates,
  useSeasonalDayTexture,
} from "./useSeasonalDayTexture";

const AUGUST = new Date("2026-08-15T12:00:00Z");
const CDN_AUGUST =
  "https://jikgeihhyluuonqdwlrr.supabase.co/storage/v1/object/public/textures/months/earth-day-08.jpg";
const LOCAL_AUGUST = "/textures/months/earth-day-08.jpg";

function headResponse(ok: boolean, contentType = "image/jpeg"): Response {
  return {
    ok,
    headers: new Headers(ok ? { "content-type": contentType } : {}),
  } as unknown as Response;
}

describe("getSeasonalTextureCandidates", () => {
  it("returns only the bundled monthly path when hi-res is off", () => {
    expect(getSeasonalTextureCandidates(false, AUGUST)).toEqual([LOCAL_AUGUST]);
  });

  it("probes the CDN first, then the bundled path, when hi-res is on", () => {
    expect(getSeasonalTextureCandidates(true, AUGUST)).toEqual([
      CDN_AUGUST,
      LOCAL_AUGUST,
    ]);
  });

  it("zero-pads the month", () => {
    expect(
      getSeasonalTextureCandidates(false, new Date("2026-01-05T00:00:00Z")),
    ).toEqual(["/textures/months/earth-day-01.jpg"]);
  });
});

const spyOnLoadAsync = () =>
  vi
    .spyOn(THREE.TextureLoader.prototype, "loadAsync")
    .mockImplementation(async () => new THREE.Texture());

describe("useSeasonalDayTexture", () => {
  let loadAsync: ReturnType<typeof spyOnLoadAsync>;

  beforeEach(() => {
    vi.useFakeTimers({ now: AUGUST, toFake: ["Date"] });
    loadAsync = spyOnLoadAsync();
    useSettingsStore.setState({ globeHiResTextures: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("falls back to the bundled monthly texture when the CDN 404s", async () => {
    useSettingsStore.setState({ globeHiResTextures: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === LOCAL_AUGUST ? headResponse(true) : headResponse(false),
      ),
    );

    const base = new THREE.Texture();
    const { result } = renderHook(() => useSeasonalDayTexture(base));

    await waitFor(() => expect(result.current).not.toBe(base));
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(LOCAL_AUGUST);
  });

  it("loads the CDN texture when hi-res is on and the CDN responds", async () => {
    useSettingsStore.setState({ globeHiResTextures: true });
    vi.stubGlobal("fetch", vi.fn(async () => headResponse(true)));

    const base = new THREE.Texture();
    const { result } = renderHook(() => useSeasonalDayTexture(base));

    await waitFor(() => expect(result.current).not.toBe(base));
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(CDN_AUGUST);
  });

  it("loads the CDN texture when UHD or Extreme quality requests detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => headResponse(true)));

    const base = new THREE.Texture();
    const { result } = renderHook(() => useSeasonalDayTexture(base, true));

    await waitFor(() => expect(result.current).not.toBe(base));
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(CDN_AUGUST);
  });

  it("keeps the base texture when no candidate is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => headResponse(false)));

    const base = new THREE.Texture();
    const { result } = renderHook(() => useSeasonalDayTexture(base));

    await waitFor(() =>
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1),
    );
    expect(result.current).toBe(base);
    expect(loadAsync).not.toHaveBeenCalled();
  });

  it("skips candidates that do not report an image content-type", async () => {
    useSettingsStore.setState({ globeHiResTextures: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === CDN_AUGUST
          ? headResponse(true, "text/html")
          : headResponse(true),
      ),
    );

    const base = new THREE.Texture();
    const { result } = renderHook(() => useSeasonalDayTexture(base));

    await waitFor(() => expect(result.current).not.toBe(base));
    expect(loadAsync).toHaveBeenCalledWith(LOCAL_AUGUST);
  });
});
