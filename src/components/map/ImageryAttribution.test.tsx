import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { ALL_PROVIDERS } from "@/lib/tiles/providers";
import type { ImagerySourceCredit } from "@/lib/map/imagerySources";
import { ImageryAttribution } from "./ImageryAttribution";

const blueMarble: ImagerySourceCredit = {
  name: "NASA Blue Marble",
  attribution: "NASA Blue Marble",
  attributionUrl: "https://visibleearth.nasa.gov/collection/1484/blue-marble",
  surfaceKind: "declouded-mosaic",
};

const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");

function setDisplay(width: number, height: number, dpr: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: dpr,
  });
}

describe("ImageryAttribution", () => {
  beforeEach(() => {
    useDisplayQualityStore.setState({ displayQuality: "uhd" });
  });

  afterEach(() => {
    if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
    if (originalHeight) {
      Object.defineProperty(window, "innerHeight", originalHeight);
    }
    if (originalDpr) {
      Object.defineProperty(window, "devicePixelRatio", originalDpr);
    }
  });

  it("credits only the visible fallback source before detail tiles render", () => {
    render(<ImageryAttribution baseSource={blueMarble} />);

    expect(screen.getByText("NASA Blue Marble")).toBeTruthy();
    expect(screen.queryByText(/Powered by Esri/)).toBeNull();
  });

  it("adds the provider credit once provider tiles contribute", () => {
    render(
      <ImageryAttribution
        baseSource={blueMarble}
        provider={ALL_PROVIDERS["esri-world"]}
      />,
    );

    expect(screen.getByText("NASA Blue Marble")).toBeTruthy();
    expect(screen.getByText("Detail: Powered by Esri")).toBeTruthy();
  });

  it("updates the displayed Auto quality when the active display changes", () => {
    useDisplayQualityStore.setState({ displayQuality: "auto" });
    setDisplay(1280, 720, 1);
    render(<ImageryAttribution baseSource={blueMarble} />);
    expect(screen.getByText("Auto · Balanced")).toBeTruthy();

    act(() => {
      setDisplay(3840, 2160, 1);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("UHD")).toBeTruthy();
  });
});
