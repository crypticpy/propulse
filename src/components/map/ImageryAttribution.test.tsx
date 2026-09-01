import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

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

describe("ImageryAttribution", () => {
  beforeEach(() => {
    useDisplayQualityStore.setState({ displayQuality: "uhd" });
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
});
