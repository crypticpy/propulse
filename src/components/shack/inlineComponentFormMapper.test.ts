import { describe, expect, it } from "vitest";
import type {
  BalunComponent,
  ChokeComponent,
  FerriteComponent,
  InlineComponent,
} from "@/types/shack";
import {
  buildInlineComponentPayloadAfterNameEdit,
  inlineComponentFormFromComponent,
} from "./inlineComponentFormMapper";

const BASE = {
  id: "inline-1",
  addedAt: "2026-01-01T00:00:00.000Z",
  name: "Fixture",
  insertionLossDb: 0.2,
} as const;

describe("inlineComponentFormMapper (#327)", () => {
  it("preserves a 6:1 balun ratio on a name-only edit", () => {
    const balun: BalunComponent = {
      ...BASE,
      componentType: "balun",
      ratio: "6:1",
      maxPowerWatts: 1500,
    };

    const payload = buildInlineComponentPayloadAfterNameEdit(
      balun,
      "Renamed balun",
    );

    expect(payload).toMatchObject({
      componentType: "balun",
      name: "Renamed balun",
      ratio: "6:1",
      maxPowerWatts: 1500,
    });
  });

  it("preserves a 6:1 current balun ratio on a name-only edit", () => {
    const balun: BalunComponent = {
      ...BASE,
      componentType: "balun",
      ratio: "6:1_current",
      maxPowerWatts: 1500,
    };

    const form = inlineComponentFormFromComponent(balun);
    expect(form.balunRatio).toBe("6:1");
    expect(form.balunType).toBe("current");

    const payload = buildInlineComponentPayloadAfterNameEdit(
      balun,
      "Renamed balun",
    );

    expect(payload).toMatchObject({
      componentType: "balun",
      name: "Renamed balun",
      ratio: "6:1_current",
      maxPowerWatts: 1500,
    });
  });

  it("preserves ferrite style and count on a name-only edit", () => {
    const ferrite: FerriteComponent = {
      ...BASE,
      componentType: "ferrite",
      ferriteType: "toroid",
      material: "43",
      count: 4,
      turns: 3,
      impedanceOhms: 2500,
    };

    const payload = buildInlineComponentPayloadAfterNameEdit(
      ferrite,
      "Renamed ferrite",
    );

    expect(payload).toMatchObject({
      componentType: "ferrite",
      name: "Renamed ferrite",
      ferriteType: "toroid",
      material: "43",
      count: 4,
      turns: 3,
      impedanceOhms: 2500,
    });
  });

  it("keeps multiband choke entries separate after a notes-only edit", () => {
    const choke: ChokeComponent = {
      ...BASE,
      componentType: "choke",
      chokeType: "common_mode",
      turns: 8,
      impedance: 5000,
      bands: ["1.8-30", "50-54"],
    };

    const form = inlineComponentFormFromComponent(choke);
    expect(form.chokeFrequencyRangeMHz).toBe("1.8-30, 50-54");

    const payload = buildInlineComponentPayloadAfterNameEdit(
      choke,
      "Fixture",
    );
    expect((payload as ChokeComponent).bands).toEqual(["1.8-30", "50-54"]);
  });

  it("round-trips all five inline subtypes without coercing subtype fields", () => {
    const fixtures: InlineComponent[] = [
      {
        ...BASE,
        componentType: "adapter",
        connectorFrom: "pl259",
        connectorTo: "n_type",
      },
      {
        ...BASE,
        componentType: "pigtail",
        connectorFrom: "bnc",
        connectorTo: "sma",
        lengthInches: 18,
      },
      {
        ...BASE,
        componentType: "choke",
        chokeType: "feed_through",
        turns: 0,
        bands: ["14-30"],
      },
      {
        ...BASE,
        componentType: "balun",
        ratio: "4:1_current",
        maxPowerWatts: 500,
      },
      {
        ...BASE,
        componentType: "ferrite",
        ferriteType: "bead",
        material: "61",
        count: 2,
        turns: 5,
      },
    ];

    for (const fixture of fixtures) {
      const payload = buildInlineComponentPayloadAfterNameEdit(
        fixture,
        "Still round-trips",
      );
      const { id: _id, addedAt: _addedAt, ...expected } = fixture;
      expect(payload).toMatchObject({ ...expected, name: "Still round-trips" });
    }
  });
});
