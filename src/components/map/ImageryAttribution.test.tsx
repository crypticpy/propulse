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
    expect(screen.getByText(/Detail: Powered by Esri · Esri, Vantor/)).toBeTruthy();
  });

  it("shows the required Mapbox Satellite logo and separate credit links", () => {
    render(
      <ImageryAttribution
        provider={ALL_PROVIDERS["mapbox-satellite"]}
        mapboxFeedbackUrl="https://apps.mapbox.com/feedback/#/-98.5/39.5/4"
      />,
    );

    expect(screen.getByAltText("Mapbox")).toBeTruthy();
    expect(screen.getByRole("link", { name: "© Mapbox" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "© Maxar" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Improve this map" }).getAttribute(
        "href",
      ),
    ).toBe("https://apps.mapbox.com/feedback/#/-98.5/39.5/4");
  });

  it("retains CARTO label credits over Mapbox imagery", () => {
    render(
      <ImageryAttribution
        provider={ALL_PROVIDERS["mapbox-satellite"]}
        includeCartoLabels
      />,
    );

    expect(screen.getByRole("link", { name: "© CARTO" })).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /OpenStreetMap/ }),
    ).toHaveLength(2);
  });

  it("keeps CARTO and OpenStreetMap credits separately linked", () => {
    render(<ImageryAttribution provider={ALL_PROVIDERS["carto-dark"]} />);

    expect(screen.getByRole("link", { name: "© CARTO" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toBeTruthy();
  });

  it("keeps CARTO label credits separate over an Esri basemap", () => {
    render(
      <ImageryAttribution
        provider={ALL_PROVIDERS["esri-world"]}
        includeCartoLabels
      />,
    );

    expect(screen.getByRole("link", { name: "© CARTO" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toBeTruthy();
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
