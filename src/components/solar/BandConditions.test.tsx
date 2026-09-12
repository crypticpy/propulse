import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDXStore } from "@/stores/dxStore";
import { BandConditions } from "./BandConditions";
import { BAND_CONDITIONS_GRID_TEMPLATE } from "./bandConditionsGrid";

describe("BandConditions", () => {
  afterEach(() => {
    useDXStore.setState({ spots: [] });
  });

  it("aligns the column header and band rows on the shared grid template", () => {
    const { container } = render(
      <BandConditions kIndex={3} solarFlux={150} />,
    );

    const table = container.querySelector('[role="table"]');
    expect(table).not.toBeNull();

    const headerRow = table!.querySelector('[role="row"]');
    const bandRow = table!.querySelector(".divide-y [role='row']");

    expect(headerRow?.className).toContain(BAND_CONDITIONS_GRID_TEMPLATE);
    expect(bandRow?.className).toContain(BAND_CONDITIONS_GRID_TEMPLATE);
    expect(bandRow?.querySelector('[data-band="160m"]')).not.toBeNull();
  });
});
