import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const mocks = vi.hoisted(() => ({
  useTexture: vi.fn(),
  useSeasonalDayTexture: vi.fn(),
  getStandardMapCanvas: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({ useTexture: mocks.useTexture }));
vi.mock("@react-three/fiber", () => ({
  useThree: () => ({ capabilities: { maxTextureSize: 4096 } }),
}));
vi.mock("./hooks/useSeasonalDayTexture", () => ({
  useSeasonalDayTexture: mocks.useSeasonalDayTexture,
}));
vi.mock("@/lib/utils/standardMap", () => ({
  getStandardMapCanvas: mocks.getStandardMapCanvas,
}));
vi.mock("@/hooks/useResolvedDisplayQuality", () => ({
  useResolvedDisplayQuality: () => ({ effective: "uhd" }),
}));

import { EarthSphere } from "./EarthSphere";

describe("EarthSphere imagery routing", () => {
  beforeEach(() => {
    const texture = new THREE.Texture();
    mocks.useTexture.mockReset().mockReturnValue(texture);
    mocks.useSeasonalDayTexture.mockReset().mockReturnValue(texture);
    mocks.getStandardMapCanvas
      .mockReset()
      .mockReturnValue(document.createElement("canvas"));
  });

  it("does not mount Blue Marble loaders for the Standard fallback", () => {
    render(<EarthSphere grayscale />);

    expect(mocks.getStandardMapCanvas).toHaveBeenCalled();
    expect(mocks.useTexture).not.toHaveBeenCalled();
    expect(mocks.useSeasonalDayTexture).not.toHaveBeenCalled();
  });

  it("mounts Blue Marble loaders for the Satellite fallback", () => {
    render(<EarthSphere />);

    expect(mocks.useTexture).toHaveBeenCalledWith("/textures/earth-day.jpg");
    expect(mocks.useSeasonalDayTexture).toHaveBeenCalled();
    expect(mocks.getStandardMapCanvas).not.toHaveBeenCalled();
  });
});
